import { appendFileSync, readFileSync } from "node:fs";

import { normalizePublicUrl, optional, publicUrl, required, storageConfigFromEnv, writeJson } from "../storage/common.ts";
import { putImmutableStorageObject } from "../storage/s3-upload.ts";
import { releaseCandidateId, releaseCandidatePrefix, validateReleaseCandidateSpec } from "./identity.ts";

const RELEASE_CANDIDATE_CACHE_CONTROL = "public, max-age=2592000, immutable";

type TargetManifest = Readonly<{
  candidateId: string;
  channel: string;
  files: readonly Readonly<{ digest: string; name: string; size: number; url: string }>[];
  releaseVersion: string;
  schemaVersion: 1;
  target: string;
}>;

function validateTargetManifest(value: unknown, expected: Readonly<{
  candidateId: string;
  channel: string;
  releaseVersion: string;
}>): TargetManifest {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("candidate target manifest must be an object");
  const raw = value as Partial<TargetManifest>;
  if (
    raw.schemaVersion !== 1
    || raw.candidateId !== expected.candidateId
    || raw.channel !== expected.channel
    || raw.releaseVersion !== expected.releaseVersion
    || typeof raw.target !== "string"
    || !Array.isArray(raw.files)
    || raw.files.length === 0
  ) throw new Error("candidate target manifest identity mismatch");
  for (const file of raw.files) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(file.digest) || typeof file.size !== "number" || file.size <= 0) {
      throw new Error(`candidate ${raw.target} file identity is invalid`);
    }
    normalizePublicUrl(file.url);
  }
  return raw as TargetManifest;
}

async function fetchTargetManifest(url: string): Promise<unknown> {
  const normalized = normalizePublicUrl(url);
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(normalized);
    if (response.ok) return response.json();
    lastStatus = response.status;
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw new Error(`candidate target manifest ${normalized} returned HTTP ${lastStatus} after propagation retries`);
}

const spec = validateReleaseCandidateSpec(JSON.parse(readFileSync(required("RELEASE_CANDIDATE_SPEC_PATH"), "utf8")) as unknown);
const candidateId = releaseCandidateId(spec);
const urls = JSON.parse(readFileSync(required("RELEASE_CANDIDATE_TARGET_URLS_PATH"), "utf8")) as unknown;
if (!Array.isArray(urls) || urls.some((url) => typeof url !== "string")) {
  throw new Error("candidate target URL list must be a JSON string array");
}
const targets = await Promise.all(urls.map(async (url) => {
  return validateTargetManifest(await fetchTargetManifest(url), {
    candidateId,
    channel: spec.channel,
    releaseVersion: spec.releaseVersion,
  });
}));
const targetNames = targets.map(({ target }) => target).sort();
if (JSON.stringify(targetNames) !== JSON.stringify([...spec.targets].sort())) {
  throw new Error(`candidate target set mismatch: expected ${spec.targets.join(",")}; got ${targetNames.join(",")}`);
}
const versionMetadataUrl = optional("RELEASE_VERSION_METADATA_URL");
if (versionMetadataUrl.length > 0) {
  const metadata = await fetchTargetManifest(versionMetadataUrl);
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("candidate immutable version metadata must be an object");
  }
  const record = metadata as Record<string, unknown>;
  if (record.channel !== spec.channel || record.releaseVersion !== spec.releaseVersion || record.releaseState !== "complete") {
    throw new Error("candidate immutable version metadata identity mismatch");
  }
}
const manifest = Object.freeze({
  candidateId,
  spec,
  state: "candidate",
  targetManifests: Object.freeze(targets.sort((left, right) => left.target.localeCompare(right.target))),
  schemaVersion: 1,
  ...(versionMetadataUrl.length > 0 ? { versionMetadataUrl: normalizePublicUrl(versionMetadataUrl) } : {}),
});
const prefix = releaseCandidatePrefix({ candidateId, channel: spec.channel, releaseVersion: spec.releaseVersion });
const body = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await putImmutableStorageObject({
  ...storageConfigFromEnv(),
  body,
  cacheControl: RELEASE_CANDIDATE_CACHE_CONTROL,
  contentType: "application/json; charset=utf-8",
  objectKey: `${prefix}/manifest.json`,
});
const manifestUrl = publicUrl(required("RELEASE_PUBLIC_ORIGIN"), prefix, "manifest.json");
const outputPath = optional("RELEASE_CANDIDATE_OUTPUT_PATH");
if (outputPath.length > 0) writeJson(outputPath, { ...manifest, manifestUrl });
const githubOutput = optional("GITHUB_OUTPUT");
if (githubOutput.length > 0) appendFileSync(githubOutput, `candidate_manifest_url=${manifestUrl}\n`, "utf8");
process.stdout.write(`${manifestUrl}\n`);
