import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  validateClosureDistributionSharedContribution,
  validateClosureDistributionTargetContribution,
  type ClosureDistributionBlob,
  type ClosureDistributionSharedContribution,
  type ClosureDistributionTargetContribution,
} from "@open-design/closure/protocol";
import { releaseChannelDescriptor, releaseClosureBlobObjectKey, type ReleaseChannel } from "@open-design/release";

import { githubInfo, publicUrl, required, storageConfigFromEnv, writeJson } from "../common.ts";
import { getStorageObject, putStorageObjectWithStatus, type StorageConfig } from "../s3-upload.ts";

type Digest = `sha256:${string}`;
type ClosureBuildKind = "shared" | "target";
type Contribution = ClosureDistributionSharedContribution | ClosureDistributionTargetContribution;

type ClosureBuildArtifactRecord = ClosureDistributionBlob & Readonly<{ objectKey: string }>;

export type ClosureBuildRecord = Readonly<{
  artifacts: readonly ClosureBuildArtifactRecord[];
  channel: ReleaseChannel;
  contribution: Contribution;
  createdAt: string;
  identityDigest: Digest;
  kind: ClosureBuildKind;
  provenance: Record<string, unknown>;
  schemaVersion: 1;
}>;

const digestPattern = /^sha256:[0-9a-f]{64}$/u;

function digest(value: Buffer): Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function kindToken(kind: ClosureBuildKind, contribution: Contribution): string {
  if (kind === "shared") return "shared";
  return `target-${(contribution as ClosureDistributionTargetContribution).target}`;
}

export function closureBuildPrefix(channel: ReleaseChannel, kind: string, identityDigest: Digest): string {
  if (!/^(?:shared|target-(?:darwin-arm64|darwin-x64|win32-x64))$/u.test(kind)) throw new Error(`invalid Closure build kind: ${kind}`);
  if (!digestPattern.test(identityDigest)) throw new Error(`invalid Closure build identity: ${identityDigest}`);
  return `${channel}/closure/builds/${kind}/${identityDigest.slice("sha256:".length)}`;
}

function contributionArtifacts(kind: ClosureBuildKind, value: unknown): { contribution: Contribution; artifacts: ClosureDistributionBlob[] } {
  if (kind === "shared") {
    const contribution = validateClosureDistributionSharedContribution(value);
    return {
      artifacts: [contribution.launcher.artifact, contribution.body.artifact, ...contribution.resources.map(({ artifact }) => artifact)],
      contribution,
    };
  }
  const contribution = validateClosureDistributionTargetContribution(value);
  return {
    artifacts: [contribution.native.artifact, ...contribution.resources.map(({ artifact }) => artifact)],
    contribution,
  };
}

function rebindBlob(blob: ClosureDistributionBlob, publicOrigin: string, channel: ReleaseChannel, version: string): ClosureDistributionBlob {
  return { ...blob, url: publicUrl(publicOrigin, "", releaseClosureBlobObjectKey(channel, version, blob.digest)) };
}

export function rebindClosureContribution(
  kind: ClosureBuildKind,
  value: unknown,
  input: Readonly<{ channel: ReleaseChannel; publicOrigin: string; version: string }>,
): Contribution {
  if (kind === "shared") {
    const contribution = validateClosureDistributionSharedContribution(value);
    return validateClosureDistributionSharedContribution({
      ...contribution,
      body: { ...contribution.body, artifact: rebindBlob(contribution.body.artifact, input.publicOrigin, input.channel, input.version) },
      channel: input.channel,
      launcher: { ...contribution.launcher, artifact: rebindBlob(contribution.launcher.artifact, input.publicOrigin, input.channel, input.version) },
      resources: contribution.resources.map((resource) => ({
        ...resource,
        artifact: rebindBlob(resource.artifact, input.publicOrigin, input.channel, input.version),
      })),
      version: input.version,
    });
  }
  const contribution = validateClosureDistributionTargetContribution(value);
  return validateClosureDistributionTargetContribution({
    ...contribution,
    channel: input.channel,
    native: { ...contribution.native, artifact: rebindBlob(contribution.native.artifact, input.publicOrigin, input.channel, input.version) },
    resources: contribution.resources.map((resource) => ({
      ...resource,
      artifact: rebindBlob(resource.artifact, input.publicOrigin, input.channel, input.version),
    })),
    version: input.version,
  });
}

function validateRecord(value: unknown, expected: Readonly<{
  channel: ReleaseChannel;
  identityDigest: Digest;
  kind: ClosureBuildKind;
  token: string;
}>): ClosureBuildRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Closure build record must be an object");
  const record = value as Partial<ClosureBuildRecord>;
  const parsed = contributionArtifacts(expected.kind, record.contribution);
  if (
    record.schemaVersion !== 1
    || record.channel !== expected.channel
    || record.identityDigest !== expected.identityDigest
    || record.kind !== expected.kind
    || !Array.isArray(record.artifacts)
  ) throw new Error("Closure build record identity mismatch");
  const expectedArtifacts = parsed.artifacts
    .map(({ digest: value, mediaType, size }) => ({ digest: value, mediaType, size }))
    .sort((left, right) => left.digest.localeCompare(right.digest));
  const actualArtifacts = record.artifacts
    .map(({ digest: value, mediaType, size }) => ({ digest: value, mediaType, size }))
    .sort((left, right) => left.digest.localeCompare(right.digest));
  if (JSON.stringify(actualArtifacts) !== JSON.stringify(expectedArtifacts)) throw new Error("Closure build record artifact set mismatch");
  if (kindToken(expected.kind, parsed.contribution) !== expected.token) throw new Error("Closure build record target mismatch");
  const prefix = closureBuildPrefix(expected.channel, expected.token, expected.identityDigest);
  for (const artifact of record.artifacts) {
    if (
      !digestPattern.test(artifact.digest)
      || !Number.isSafeInteger(artifact.size)
      || artifact.size < 1
      || artifact.objectKey !== `${prefix}/blobs/${artifact.digest.slice("sha256:".length)}`
    ) throw new Error("Closure build record artifact identity mismatch");
  }
  return record as ClosureBuildRecord;
}

async function putImmutable(storage: StorageConfig, objectKey: string, body: Buffer, contentType: string): Promise<void> {
  const result = await putStorageObjectWithStatus({
    ...storage,
    body,
    cacheControl: "public, max-age=31536000, immutable",
    contentType,
    headers: { "if-none-match": "*" },
    objectKey,
  });
  if (result.ok) return;
  if (result.status !== 412) throw new Error(`immutable Closure build PUT failed with HTTP ${result.status}: ${result.body}`);
  const existing = await getStorageObject({ ...storage, objectKey });
  if (existing == null || digest(existing.bytes) !== digest(body)) throw new Error(`immutable Closure build object conflicts: ${objectKey}`);
}

function githubOutput(name: string, value: string): void {
  const output = process.env.GITHUB_OUTPUT;
  if (output == null || output.length === 0) return;
  appendFileSync(output, `${name}=${value}\n`, "utf8");
}

export async function resolveClosureBuild(): Promise<void> {
  const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
  const identityDigest = required("RELEASE_CLOSURE_BUILD_DIGEST") as Digest;
  if (!digestPattern.test(identityDigest)) throw new Error("RELEASE_CLOSURE_BUILD_DIGEST must be a lowercase sha256 digest");
  const kind = required("RELEASE_CLOSURE_BUILD_KIND") as ClosureBuildKind;
  if (kind !== "shared" && kind !== "target") throw new Error("RELEASE_CLOSURE_BUILD_KIND must be shared or target");
  const token = required("RELEASE_CLOSURE_BUILD_TOKEN");
  const prefix = closureBuildPrefix(channel, token, identityDigest);
  const storage = storageConfigFromEnv();
  const object = await getStorageObject({ ...storage, objectKey: `${prefix}/record.json` });
  if (object == null) {
    githubOutput("state", "miss");
    console.log(`Closure build miss: ${prefix}`);
    return;
  }
  let record: ClosureBuildRecord;
  try {
    record = validateRecord(JSON.parse(object.text) as unknown, { channel, identityDigest, kind, token });
  } catch (error) {
    githubOutput("state", "miss");
    console.log(`Closure build record is invalid; rebuilding: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const blobRoot = required("RELEASE_CLOSURE_BLOB_ROOT");
  await mkdir(dirname(blobRoot), { recursive: true });
  const pendingRoot = await mkdtemp(`${blobRoot}.pending-`);
  try {
    for (const artifact of record.artifacts) {
      const remote = await getStorageObject({ ...storage, objectKey: artifact.objectKey });
      if (remote == null || remote.bytes.byteLength !== artifact.size || digest(remote.bytes) !== artifact.digest) {
        throw new Error(`immutable Closure build artifact is missing or corrupt: ${artifact.objectKey}`);
      }
      await writeFile(join(pendingRoot, artifact.digest.slice("sha256:".length)), remote.bytes);
    }
    const contribution = rebindClosureContribution(kind, record.contribution, {
      channel,
      publicOrigin: required("RELEASE_PUBLIC_ORIGIN"),
      version: required("RELEASE_VERSION"),
    });
    await rm(blobRoot, { force: true, recursive: true });
    await rename(pendingRoot, blobRoot);
    writeJson(required("RELEASE_CLOSURE_CONTRIBUTION_JSON_PATH"), contribution);
    githubOutput("state", "hit");
    console.log(`Closure build hit: ${prefix}`);
  } finally {
    await rm(pendingRoot, { force: true, recursive: true });
  }
}

export async function registerClosureBuild(): Promise<void> {
  const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
  const identityDigest = required("RELEASE_CLOSURE_BUILD_DIGEST") as Digest;
  if (!digestPattern.test(identityDigest)) throw new Error("RELEASE_CLOSURE_BUILD_DIGEST must be a lowercase sha256 digest");
  const kind = required("RELEASE_CLOSURE_BUILD_KIND") as ClosureBuildKind;
  if (kind !== "shared" && kind !== "target") throw new Error("RELEASE_CLOSURE_BUILD_KIND must be shared or target");
  const { contribution, artifacts } = contributionArtifacts(
    kind,
    JSON.parse(readFileSync(required("RELEASE_CLOSURE_CONTRIBUTION_JSON_PATH"), "utf8")) as unknown,
  );
  const token = kindToken(kind, contribution);
  if (token !== required("RELEASE_CLOSURE_BUILD_TOKEN")) throw new Error("Closure build token does not match contribution");
  const prefix = closureBuildPrefix(channel, token, identityDigest);
  const storage = storageConfigFromEnv();
  const blobRoot = required("RELEASE_CLOSURE_BLOB_ROOT");
  const records: ClosureBuildArtifactRecord[] = [];
  for (const artifact of artifacts) {
    const body = await readFile(join(blobRoot, artifact.digest.slice("sha256:".length)));
    if (body.byteLength !== artifact.size || digest(body) !== artifact.digest) throw new Error(`Closure build blob failed verification: ${artifact.digest}`);
    const objectKey = `${prefix}/blobs/${artifact.digest.slice("sha256:".length)}`;
    await putImmutable(storage, objectKey, body, artifact.mediaType);
    records.push({ ...artifact, objectKey });
  }
  const record: ClosureBuildRecord = {
    artifacts: records,
    channel,
    contribution,
    createdAt: new Date().toISOString(),
    identityDigest,
    kind,
    provenance: githubInfo(),
    schemaVersion: 1,
  };
  const recordKey = `${prefix}/record.json`;
  const recordBytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  const result = await putStorageObjectWithStatus({
    ...storage,
    body: recordBytes,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "application/json; charset=utf-8",
    headers: { "if-none-match": "*" },
    objectKey: recordKey,
  });
  if (!result.ok) {
    if (result.status !== 412) throw new Error(`immutable Closure build record PUT failed with HTTP ${result.status}: ${result.body}`);
    const existing = await getStorageObject({ ...storage, objectKey: recordKey });
    if (existing == null) throw new Error(`immutable Closure build record disappeared: ${recordKey}`);
    validateRecord(JSON.parse(existing.text) as unknown, { channel, identityDigest, kind, token });
  }
  console.log(`registered immutable Closure build: ${prefix}`);
}
