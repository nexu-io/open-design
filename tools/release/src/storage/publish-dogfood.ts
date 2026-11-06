import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

import { bool, contentType, optional, publicUrl, required, storageConfigFromEnv, writeJson } from "./common.ts";
import { collectDogfoodCandidatePaths, dogfoodObjectKey, dogfoodPrefix, parseDogfoodPathList } from "./dogfood.ts";
import { putStorageObject } from "./s3-upload.ts";

type UploadedFile = {
  name: string;
  objectKey: string;
  sha256: string;
  size: number;
  url: string;
};

function defaultBuildId(): string {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readBuildJson(path: string): unknown {
  if (path.length === 0) return null;
  if (!existsSync(path)) {
    throw new Error(`DOGFOOD_BUILD_JSON_PATH does not exist: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

const version = required("DOGFOOD_VERSION");
const buildId = optional("DOGFOOD_BUILD_ID", defaultBuildId());
const label = optional("DOGFOOD_LABEL", "Dogfood build");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const allowEmpty = bool("DOGFOOD_ALLOW_EMPTY");
const summaryPath = optional("DOGFOOD_SUMMARY_PATH", optional("GITHUB_STEP_SUMMARY"));
const outputsPath = optional("DOGFOOD_OUTPUTS_PATH");

const buildJsonKeys = optional("DOGFOOD_BUILD_JSON_KEYS")
  .split(",")
  .map((key) => key.trim())
  .filter((key) => key.length > 0);

const candidates = collectDogfoodCandidatePaths({
  buildJson: readBuildJson(optional("DOGFOOD_BUILD_JSON_PATH")),
  buildJsonKeys,
  paths: parseDogfoodPathList(optional("DOGFOOD_FILES")),
});

const present = candidates.filter((path) => existsSync(path) && statSync(path).isFile());
for (const path of candidates) {
  if (!present.includes(path)) console.log(`skipping missing dogfood candidate: ${path}`);
}

if (present.length === 0 && !allowEmpty) {
  throw new Error(
    `no dogfood artifacts found; checked ${candidates.length} candidate path(s). Set DOGFOOD_ALLOW_EMPTY=true to treat this as a no-op.`,
  );
}

const prefix = dogfoodPrefix({ buildId, version });
const storage = present.length > 0 ? storageConfigFromEnv() : null;
const uploaded: UploadedFile[] = [];

for (const path of present) {
  const body = readFileSync(path);
  // Every destination is minted by dogfoodObjectKey, which validates the key
  // before it is ever handed to the storage client. Nothing in this command can
  // name a channel prefix, a latest pointer, or an updater feed file.
  const objectKey = dogfoodObjectKey({ buildId, fileName: basename(path), version });
  const name = objectKey.slice(prefix.length + 1);
  if (storage == null) throw new Error("storage config is required to upload dogfood artifacts");
  await putStorageObject({
    ...storage,
    body,
    // The build id makes each key unique per run, so the object is immutable.
    cacheControl: "public, max-age=31536000, immutable",
    contentType: contentType(name),
    objectKey,
  });
  uploaded.push({
    name,
    objectKey,
    sha256: createHash("sha256").update(body).digest("hex"),
    size: body.byteLength,
    url: publicUrl(publicOrigin, prefix, name),
  });
  console.log(`uploaded ${path} to ${objectKey}`);
}

const summary = [
  `## ${label} — dogfood only, not published to any release channel`,
  "",
  `Version \`${version}\`, build \`${buildId}\`. These files live under \`${prefix}/\` and write no channel`,
  "metadata and no `latest` pointer, so no installed client can see them as an update.",
  "",
  ...(uploaded.length === 0
    ? ["No artifacts were produced by this build."]
    : uploaded.map((file) => `- [\`${file.name}\`](${file.url}) — ${formatSize(file.size)}, sha256 \`${file.sha256}\``)),
  "",
].join("\n");

if (summaryPath.length > 0) appendFileSync(summaryPath, `${summary}\n`, "utf8");
console.log(summary);

if (outputsPath.length > 0) {
  writeJson(outputsPath, {
    buildId,
    files: uploaded,
    prefix,
    publicOrigin,
    urls: uploaded.map((file) => file.url),
    version,
  });
}
