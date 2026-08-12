import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  validateClosureDistributionSharedContribution,
  validateClosureDistributionTargetContribution,
  type ClosureDistributionBlob,
} from "@open-design/closure-proto";
import { parseReleaseVersion, releaseChannelDescriptor, type ReleaseChannel } from "@open-design/release";

import { normalizePublicUrl, publicUrl, required, storageConfigFromEnv, writeJson } from "./common.ts";
import { getStorageObject, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

type Digest = `sha256:${string}`;
type ContributionKind = "shared" | "target";

export type ClosureContributionPublicationPlan = {
  blobs: Array<ClosureDistributionBlob & { objectKey: string; path: string }>;
  channel: ReleaseChannel;
  kind: ContributionKind;
  version: string;
};

function sha256(bytes: Buffer): Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function expectedBlobUrl(publicOrigin: string, channel: ReleaseChannel, digest: Digest): string {
  return publicUrl(publicOrigin, `${channel}/blobs`, digest.slice("sha256:".length));
}

function contributionArtifacts(kind: ContributionKind, value: unknown): {
  artifacts: ClosureDistributionBlob[];
  channel: ReleaseChannel;
  version: string;
} {
  if (kind === "shared") {
    const contribution = validateClosureDistributionSharedContribution(value);
    return {
      artifacts: [
        contribution.launcher.artifact,
        contribution.body.artifact,
        ...contribution.resources.map((resource) => resource.artifact),
      ],
      channel: contribution.channel,
      version: contribution.version,
    };
  }
  const contribution = validateClosureDistributionTargetContribution(value);
  return {
    artifacts: [contribution.native.artifact],
    channel: contribution.channel,
    version: contribution.version,
  };
}

/** Re-parse an untrusted cross-job declaration and bind every declared blob to local bytes. */
export function createClosureContributionPublicationPlan(input: Readonly<{
  blobRoot: string;
  channel: ReleaseChannel;
  contribution: unknown;
  kind: ContributionKind;
  publicOrigin: string;
  version: string;
}>): ClosureContributionPublicationPlan {
  const parsed = contributionArtifacts(input.kind, input.contribution);
  if (parsed.channel !== input.channel || parsed.version !== input.version) {
    throw new Error(
      `Closure ${input.kind} contribution identity ${parsed.channel}/${parsed.version} does not match ${input.channel}/${input.version}`,
    );
  }
  parseReleaseVersion(parsed.version, parsed.channel);
  const seen = new Set<Digest>();
  const blobs = parsed.artifacts.map((artifact) => {
    if (seen.has(artifact.digest)) {
      throw new Error(`Closure ${input.kind} contribution declares duplicate blob ${artifact.digest}`);
    }
    seen.add(artifact.digest);
    const path = join(input.blobRoot, artifact.digest.slice("sha256:".length));
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`Closure contribution blob is missing: ${path}`);
    }
    const bytes = readFileSync(path);
    if (bytes.byteLength !== artifact.size || sha256(bytes) !== artifact.digest) {
      throw new Error(`Closure contribution blob failed local digest verification: ${artifact.digest}`);
    }
    const expectedUrl = expectedBlobUrl(input.publicOrigin, input.channel, artifact.digest);
    if (normalizePublicUrl(artifact.url) !== expectedUrl) {
      throw new Error(`Closure contribution blob URL must be ${expectedUrl}; got ${artifact.url}`);
    }
    return {
      ...artifact,
      objectKey: `${input.channel}/blobs/${artifact.digest.slice("sha256:".length)}`,
      path,
      url: expectedUrl,
    };
  });
  return { blobs, channel: input.channel, kind: input.kind, version: input.version };
}

async function putImmutableBlob(storage: StorageConfig, blob: ClosureContributionPublicationPlan["blobs"][number]): Promise<"created" | "reused"> {
  const result = await putStorageObjectWithStatus({
    ...storage,
    bodyPath: blob.path,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: blob.mediaType,
    headers: { "if-none-match": "*" },
    objectKey: blob.objectKey,
  });
  if (result.ok) return "created";
  if (result.status !== 412) {
    throw new Error(`immutable Closure blob PUT failed with HTTP ${result.status}: ${result.body}`);
  }
  const existing = await getStorageObject({ ...storage, objectKey: blob.objectKey });
  if (existing == null) throw new Error(`immutable Closure blob disappeared after conflict: ${blob.objectKey}`);
  if (existing.bytes.byteLength !== blob.size || sha256(existing.bytes) !== blob.digest) {
    throw new Error(`immutable Closure blob conflicts: ${blob.objectKey}`);
  }
  return "reused";
}

/** Publish only the CAS bytes proven by one build job. Metadata remains final-job owned. */
export async function publishClosureContribution(): Promise<void> {
  const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
  const version = required("RELEASE_VERSION");
  const kind = required("RELEASE_CLOSURE_CONTRIBUTION_KIND");
  if (kind !== "shared" && kind !== "target") {
    throw new Error("RELEASE_CLOSURE_CONTRIBUTION_KIND must be shared or target");
  }
  const contributionPath = required("RELEASE_CLOSURE_CONTRIBUTION_JSON_PATH");
  const plan = createClosureContributionPublicationPlan({
    blobRoot: required("RELEASE_CLOSURE_BLOB_ROOT"),
    channel,
    contribution: JSON.parse(readFileSync(contributionPath, "utf8")) as unknown,
    kind,
    publicOrigin: required("RELEASE_PUBLIC_ORIGIN"),
    version,
  });
  const storage = storageConfigFromEnv();
  const published = [];
  for (const blob of plan.blobs) {
    published.push({
      digest: blob.digest,
      objectKey: blob.objectKey,
      state: await putImmutableBlob(storage, blob),
      url: blob.url,
    });
  }
  const outputPath = process.env.RELEASE_CLOSURE_PUBLICATION_JSON_PATH;
  if (outputPath != null && outputPath.length > 0) {
    writeJson(outputPath, { channel, kind, published, schemaVersion: 1, version });
  }
  console.log(`published ${published.length} immutable Closure ${kind} blob(s) for ${channel}/${version}`);
}
