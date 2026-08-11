import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_LAUNCHER_ENTRY_PATH,
  CLOSURE_PROTOCOL_VERSION,
  createClosureDistributionManifest,
  validateClosureDistributionManifest,
  type ClosureDigest,
  type ClosureDistributionBlob,
  type ClosureDistributionManifest,
  type ClosureDistributionManifestDraft,
  type ClosureDistributionResource,
  type ClosureDistributionTarget,
  type ClosureShellCompatibility,
} from "@open-design/closure-proto";
import type { ReleaseChannel } from "@open-design/release";

export const CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION = 1 as const;

export type ClosureDistributionArtifactSource = Readonly<{
  mediaType: string;
  path: string;
}>;

export type ClosureDistributionEntrypointSource = ClosureDistributionArtifactSource & Readonly<{
  entryPath: string;
}>;

export type ClosureDistributionResourceSource = ClosureDistributionArtifactSource & Readonly<{
  id: string;
  title: string;
}>;

export type ClosureDistributionTargetContribution = Readonly<{
  manifest: ClosureDistributionManifest;
  schemaVersion: typeof CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION;
  target: string;
}>;

export type CreateClosureDistributionContributionOptions = Readonly<{
  blobOrigin: string;
  body: ClosureDistributionArtifactSource;
  channel: ReleaseChannel;
  launcher: ClosureDistributionArtifactSource;
  native: ClosureDistributionArtifactSource;
  resources: readonly ClosureDistributionResourceSource[];
  runtime: ClosureDistributionEntrypointSource;
  shellCompatibility: ClosureShellCompatibility;
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

function insertBlob(
  blobs: Record<string, ClosureDistributionBlob>,
  blob: ClosureDistributionBlob,
): void {
  const current = blobs[blob.digest];
  if (current != null && JSON.stringify(current) !== JSON.stringify(blob)) {
    throw new Error(`Closure blob metadata conflicts for ${blob.digest}`);
  }
  blobs[blob.digest] = blob;
}

/** Seal already-materialized build inputs into the target-neutral wire manifest. */
export function sealClosureDistributionManifest(
  draft: ClosureDistributionManifestDraft,
): ClosureDistributionManifest {
  return createClosureDistributionManifest(draft, sha256CanonicalManifest);
}

/**
 * Inspect one platform job's real component bytes and seal a valid single-target
 * graph. The graph is a build contribution, not a public version manifest; the
 * release aggregation job must merge every target before publication.
 */
export async function createClosureDistributionTargetContribution(
  options: CreateClosureDistributionContributionOptions,
): Promise<ClosureDistributionTargetContribution> {
  const [launcher, body, runtime, native, ...resources] = await Promise.all([
    inspectArtifact(options.launcher, options),
    inspectArtifact(options.body, options),
    inspectArtifact(options.runtime, options),
    inspectArtifact(options.native, options),
    ...options.resources.map(async (resource) => await inspectArtifact(resource, options)),
  ]);
  if (launcher == null || body == null || runtime == null || native == null) {
    throw new Error("Closure required component inspection returned an incomplete result");
  }
  const blobs: Record<string, ClosureDistributionBlob> = {};
  for (const blob of [launcher, body, runtime, native, ...resources]) insertBlob(blobs, blob);
  const manifest = sealClosureDistributionManifest({
    blobs,
    compatibility: { shell: options.shellCompatibility },
    identity: {
      channel: options.channel,
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      version: options.version,
    },
    required: {
      body: { blob: body.digest, entryPath: CLOSURE_ARCHIVE_ENTRY_PATH },
      launcher: { blob: launcher.digest, entryPath: CLOSURE_LAUNCHER_ENTRY_PATH },
      targets: {
        [options.target]: {
          native: { blob: native.digest },
          runtime: { blob: runtime.digest, entryPath: options.runtime.entryPath },
        },
      },
    },
    resources: options.resources.map((resource, index) => {
      const artifact = resources[index];
      if (artifact == null) throw new Error(`Closure resource inspection is missing ${resource.id}`);
      return { blob: artifact.digest, id: resource.id, title: resource.title };
    }),
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  });
  return {
    manifest,
    schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
    target: options.target,
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertSharedGraph(
  baseline: ClosureDistributionManifest,
  candidate: ClosureDistributionManifest,
): void {
  if (
    baseline.identity.channel !== candidate.identity.channel
    || baseline.identity.protocolVersion !== candidate.identity.protocolVersion
    || baseline.identity.version !== candidate.identity.version
  ) {
    throw new Error("Closure target contributions must describe one release identity");
  }
  if (!sameValue(baseline.compatibility, candidate.compatibility)) {
    throw new Error("Closure target contributions disagree on Shell compatibility");
  }
  if (
    !sameValue(baseline.required.launcher, candidate.required.launcher)
    || !sameValue(baseline.required.body, candidate.required.body)
  ) {
    throw new Error("Closure target contributions disagree on shared required components");
  }
  if (!sameValue(baseline.resources, candidate.resources)) {
    throw new Error("Closure target contributions disagree on the version resource lock");
  }
  for (const digest of [
    baseline.required.launcher.blob,
    baseline.required.body.blob,
    ...baseline.resources.map((resource) => resource.blob),
  ]) {
    if (!sameValue(baseline.blobs[digest], candidate.blobs[digest])) {
      throw new Error(`Closure target contributions disagree on shared blob metadata ${digest}`);
    }
  }
}

function copyReferencedBlob(
  result: Record<string, ClosureDistributionBlob>,
  manifest: ClosureDistributionManifest,
  digest: ClosureDigest,
): void {
  const blob = manifest.blobs[digest];
  if (blob == null) throw new Error(`Closure contribution references unknown blob ${digest}`);
  insertBlob(result, blob);
}

/** Merge sealed platform contributions into the one public version-wide graph. */
export function mergeClosureDistributionTargetContributions(
  contributions: readonly ClosureDistributionTargetContribution[],
): ClosureDistributionManifest {
  if (contributions.length === 0) throw new Error("Closure distribution requires target contributions");
  const normalized = contributions.map((contribution) => {
    if (contribution.schemaVersion !== CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION) {
      throw new Error(`unsupported Closure contribution schema: ${String(contribution.schemaVersion)}`);
    }
    const manifest = validateClosureDistributionManifest(contribution.manifest, sha256CanonicalManifest);
    const targets = Object.keys(manifest.required.targets);
    if (targets.length !== 1 || targets[0] !== contribution.target) {
      throw new Error("Closure contribution must contain exactly its declared target");
    }
    return { manifest, target: contribution.target };
  });
  const baseline = normalized[0]?.manifest;
  if (baseline == null) throw new Error("Closure distribution contribution normalization failed");
  const blobs: Record<string, ClosureDistributionBlob> = {};
  const targets: Record<string, ClosureDistributionTarget> = {};
  for (const contribution of normalized) {
    assertSharedGraph(baseline, contribution.manifest);
    if (targets[contribution.target] != null) {
      throw new Error(`duplicate Closure target contribution: ${contribution.target}`);
    }
    const target = contribution.manifest.required.targets[contribution.target];
    if (target == null) throw new Error(`Closure contribution target is missing: ${contribution.target}`);
    targets[contribution.target] = target;
    for (const digest of [target.native.blob, target.runtime.blob]) {
      copyReferencedBlob(blobs, contribution.manifest, digest);
    }
  }
  for (const digest of [
    baseline.required.launcher.blob,
    baseline.required.body.blob,
    ...baseline.resources.map((resource: ClosureDistributionResource) => resource.blob),
  ]) {
    copyReferencedBlob(blobs, baseline, digest);
  }
  return sealClosureDistributionManifest({
    blobs,
    compatibility: baseline.compatibility,
    identity: {
      channel: baseline.identity.channel,
      protocolVersion: baseline.identity.protocolVersion,
      version: baseline.identity.version,
    },
    required: {
      body: baseline.required.body,
      launcher: baseline.required.launcher,
      targets,
    },
    resources: baseline.resources,
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  });
}
