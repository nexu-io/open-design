import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

import { contentType, normalizePublicUrl, optional, publicUrl, required, storageConfigFromEnv, writeJson } from "../storage/common.ts";
import { collectDogfoodCandidatePaths, parseDogfoodPathList, sanitizeDogfoodSegment } from "../storage/dogfood.ts";
import { putImmutableStorageObject } from "../storage/s3-upload.ts";
import { releaseCandidatePrefix, validateReleaseCandidateId } from "./identity.ts";

export const RELEASE_CANDIDATE_CACHE_CONTROL = "public, max-age=2592000, immutable";

type CandidateFile = Readonly<{
  digest: `sha256:${string}`;
  mediaType: string;
  name: string;
  objectKey: string;
  size: number;
  url: string;
}>;

function targetToken(value: string): string {
  if (value !== "mac_arm64" && value !== "mac_x64" && value !== "win_x64") {
    throw new Error(`candidate target must be mac_arm64, mac_x64, or win_x64; got ${value}`);
  }
  return value;
}

function buildJson(path: string): unknown {
  if (path.length === 0) return null;
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

const candidateId = validateReleaseCandidateId(required("RELEASE_CANDIDATE_ID"));
const channel = required("RELEASE_CHANNEL");
const releaseVersion = required("RELEASE_VERSION");
const target = targetToken(required("RELEASE_TARGET"));
const publicOrigin = normalizePublicUrl(required("RELEASE_PUBLIC_ORIGIN")).replace(/\/$/u, "");
const rootPrefix = releaseCandidatePrefix({ candidateId, channel, releaseVersion });
const targetPrefix = `${rootPrefix}/targets/${target}`;
const paths = collectDogfoodCandidatePaths({
  buildJson: buildJson(optional("RELEASE_CANDIDATE_BUILD_JSON_PATH")),
  buildJsonKeys: optional("RELEASE_CANDIDATE_BUILD_JSON_KEYS").split(",").map((value) => value.trim()).filter(Boolean),
  paths: parseDogfoodPathList(optional("RELEASE_CANDIDATE_FILES")),
});
const present = paths.filter((path) => existsSync(path) && statSync(path).isFile());
if (present.length === 0) throw new Error(`candidate ${target} produced no downloadable files`);
const storage = storageConfigFromEnv();
const files: CandidateFile[] = [];

for (const path of present) {
  const body = readFileSync(path);
  const name = sanitizeDogfoodSegment(basename(path));
  const objectKey = `${targetPrefix}/${name}`;
  await putImmutableStorageObject({
    ...storage,
    body,
    cacheControl: RELEASE_CANDIDATE_CACHE_CONTROL,
    contentType: contentType(name),
    objectKey,
  });
  files.push(Object.freeze({
    digest: `sha256:${createHash("sha256").update(body).digest("hex")}`,
    mediaType: contentType(name),
    name,
    objectKey,
    size: body.byteLength,
    url: publicUrl(publicOrigin, targetPrefix, name),
  }));
}

const manifest = Object.freeze({
  candidateId,
  channel,
  files: Object.freeze(files),
  releaseVersion,
  schemaVersion: 1,
  target,
});
const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const manifestObjectKey = `${targetPrefix}/manifest.json`;
await putImmutableStorageObject({
  ...storage,
  body: manifestBody,
  cacheControl: RELEASE_CANDIDATE_CACHE_CONTROL,
  contentType: "application/json; charset=utf-8",
  objectKey: manifestObjectKey,
});
const manifestUrl = publicUrl(publicOrigin, targetPrefix, "manifest.json");
const outputPath = optional("RELEASE_CANDIDATE_OUTPUT_PATH");
if (outputPath.length > 0) writeJson(outputPath, { ...manifest, manifestObjectKey, manifestUrl });
const githubOutput = optional("GITHUB_OUTPUT");
if (githubOutput.length > 0) {
  appendFileSync(githubOutput, `candidate_manifest_url=${manifestUrl}\n`, "utf8");
  appendFileSync(githubOutput, `candidate_primary_url=${files[0]?.url ?? ""}\n`, "utf8");
}
const summaryPath = optional("GITHUB_STEP_SUMMARY");
if (summaryPath.length > 0) {
  appendFileSync(summaryPath, [
    `## ${target} candidate — not published`,
    "",
    `Candidate \`${candidateId}\` for \`${channel}/${releaseVersion}\`. This 30-day alias is unlisted and never moves a latest pointer.`,
    "",
    ...files.map((file) => `- [\`${file.name}\`](${file.url}) — ${(file.size / 1024 / 1024).toFixed(1)} MB, ${file.digest}`),
    `- [\`manifest.json\`](${manifestUrl})`,
    "",
  ].join("\n"), "utf8");
}
process.stdout.write(`${manifestUrl}\n`);
