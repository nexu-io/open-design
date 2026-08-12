import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
  CLOSURE_LAUNCHER_ENTRY_PATH,
  CLOSURE_LAUNCHER_HANDOFF_PATH,
  CLOSURE_PROTOCOL_VERSION,
  createClosureDistributionManifest,
  mergeClosureDistributionContributions,
  validateClosureDistributionSharedContribution,
  validateClosureDistributionTargetContribution,
  type ClosureDigest,
  type ClosureDistributionBlob,
  type ClosureDistributionManifest,
  type ClosureDistributionManifestDraft,
  type ClosureShellCompatibility,
  type ClosureDistributionSharedContribution,
  type ClosureDistributionTargetContribution,
} from "@open-design/closure-proto";
import type { ReleaseChannel } from "@open-design/release";

export type ClosureDistributionArtifactSource = Readonly<{
  mediaType: string;
  path: string;
  treeDigest: ClosureDigest;
}>;

export type ClosureDistributionEntrypointSource = ClosureDistributionArtifactSource & Readonly<{
  entryPath: string;
}>;

export type ClosureDistributionResourceSource = ClosureDistributionArtifactSource & Readonly<{
  id: string;
  title: string;
}>;

export type {
  ClosureDistributionSharedContribution,
  ClosureDistributionTargetContribution,
} from "@open-design/closure-proto";

export type CreateClosureDistributionSharedContributionOptions = Readonly<{
  blobOrigin: string;
  body: ClosureDistributionArtifactSource;
  channel: ReleaseChannel;
  launcher: ClosureDistributionArtifactSource;
  resources: readonly ClosureDistributionResourceSource[];
  shellCompatibility: ClosureShellCompatibility;
  version: string;
}>;

export type CreateClosureDistributionTargetContributionOptions = Readonly<{
  blobOrigin: string;
  channel: ReleaseChannel;
  native: ClosureDistributionArtifactSource;
  runtime: ClosureDistributionEntrypointSource;
  target: string;
  version: string;
}>;

function sha256CanonicalManifest(value: string): ClosureDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function contentAddressedBlobUrl(
  origin: string,
  channel: ReleaseChannel,
  digest: ClosureDigest,
): string {
  const base = new URL(origin);
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new Error("Closure blob origin must use http(s)");
  }
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return new URL(`${channel}/blobs/${digest.slice("sha256:".length)}`, base).toString();
}

async function inspectArtifact(
  source: ClosureDistributionArtifactSource,
  options: Readonly<{ blobOrigin: string; channel: ReleaseChannel }>,
): Promise<ClosureDistributionBlob> {
  const file = await stat(source.path);
  if (!file.isFile() || file.size <= 0) {
    throw new Error(`Closure component must be a non-empty regular file: ${source.path}`);
  }
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(source.path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  const after = await stat(source.path);
  if (!after.isFile() || size !== file.size || after.size !== file.size) {
    throw new Error(`Closure component changed while it was inspected: ${source.path}`);
  }
  const digest = `sha256:${hash.digest("hex")}` as const;
  return {
    digest,
    mediaType: source.mediaType,
    size,
    url: contentAddressedBlobUrl(options.blobOrigin, options.channel, digest),
  };
}

/** Seal already-materialized build inputs into the target-neutral wire manifest. */
export function sealClosureDistributionManifest(
  draft: ClosureDistributionManifestDraft,
): ClosureDistributionManifest {
  return createClosureDistributionManifest(draft, sha256CanonicalManifest);
}

/** Inspect the once-built, target-neutral component bytes for one version. */
export async function createClosureDistributionSharedContribution(
  options: CreateClosureDistributionSharedContributionOptions,
): Promise<ClosureDistributionSharedContribution> {
  const [launcher, body, ...resources] = await Promise.all([
    inspectArtifact(options.launcher, options),
    inspectArtifact(options.body, options),
    ...options.resources.map(async (resource) => await inspectArtifact(resource, options)),
  ]);
  if (launcher == null || body == null) {
    throw new Error("Closure shared component inspection returned an incomplete result");
  }
  return validateClosureDistributionSharedContribution({
    body: Object.freeze({
      artifact: body,
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      treeDigest: options.body.treeDigest,
    }),
    channel: options.channel,
    launcher: Object.freeze({
      artifact: launcher,
      entryPath: CLOSURE_LAUNCHER_ENTRY_PATH,
      handoffPath: CLOSURE_LAUNCHER_HANDOFF_PATH,
      treeDigest: options.launcher.treeDigest,
    }),
    protocolVersion: CLOSURE_PROTOCOL_VERSION,
    resources: Object.freeze(options.resources.map((resource, index) => {
      const artifact = resources[index];
      if (artifact == null) throw new Error(`Closure resource inspection is missing ${resource.id}`);
      return Object.freeze({
        artifact,
        id: resource.id,
        title: resource.title,
        treeDigest: resource.treeDigest,
      });
    })),
    schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
    shellCompatibility: options.shellCompatibility,
    version: options.version,
  });
}

/** Inspect only the target-owned runtime/native bytes from one platform job. */
export async function createClosureDistributionTargetContribution(
  options: CreateClosureDistributionTargetContributionOptions,
): Promise<ClosureDistributionTargetContribution> {
  const [runtime, native] = await Promise.all([
    inspectArtifact(options.runtime, options),
    inspectArtifact(options.native, options),
  ]);
  return validateClosureDistributionTargetContribution({
    channel: options.channel,
    native: Object.freeze({ artifact: native, treeDigest: options.native.treeDigest }),
    protocolVersion: CLOSURE_PROTOCOL_VERSION,
    runtime: Object.freeze({
      artifact: runtime,
      entryPath: options.runtime.entryPath,
      treeDigest: options.runtime.treeDigest,
    }),
    schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
    target: options.target,
    version: options.version,
  });
}

/**
 * Merge one once-built shared contribution and platform-owned contributions
 * into the sole public version-wide graph. Shared archives are never rebuilt in
 * target jobs, so archive-tool metadata cannot create false cross-platform
 * drift for otherwise identical launcher/body/resource trees.
 */
export function mergeClosureDistributionTargetContributions(
  shared: ClosureDistributionSharedContribution,
  contributions: readonly ClosureDistributionTargetContribution[],
): ClosureDistributionManifest {
  return mergeClosureDistributionContributions(shared, contributions, sha256CanonicalManifest);
}
