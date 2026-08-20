import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { releaseChannelDescriptor } from "@open-design/release";

import { optional, required, storageConfigFromEnv, writeJson } from "../storage/common.ts";
import { getStorageObject, putStorageObjectWithStatus } from "../storage/s3-upload.ts";
import { assertReleaseNotePlanPolicy } from "./policy.ts";
import { createReleaseNotePublication } from "./publication.ts";
import { parseReleaseNotePlan } from "./source.ts";

const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
const releaseVersion = required("RELEASE_VERSION");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN");
const planPath = required("RELEASE_NOTE_PLAN_PATH");
const publicationPath = required("RELEASE_NOTE_MANIFEST_PATH");
const publishSideEffectsEnabled = optional("RELEASE_PUBLISH_SIDE_EFFECTS", "true") !== "false";
const versionPrefix = `${channel}/versions/${releaseVersion}`;
const plan = parseReleaseNotePlan(JSON.parse(readFileSync(planPath, "utf8")) as unknown);

if (plan.channel !== channel || plan.releaseVersion !== releaseVersion) {
  throw new Error(`release note plan identity mismatch for ${channel} ${releaseVersion}`);
}
assertReleaseNotePlanPolicy(plan, channel);

const storage = publishSideEffectsEnabled && plan.state === "ready" ? storageConfigFromEnv() : null;

for (const entry of plan.entries) {
  const body = readFileSync(entry.sourcePath);
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (body.byteLength !== entry.size || sha256 !== entry.sha256) {
    throw new Error(`release note source changed after planning: ${entry.sourcePath}`);
  }
  const objectKey = `${versionPrefix}/release-notes/${entry.name}`;
  if (!publishSideEffectsEnabled) {
    console.log(`[dry-run] would publish immutable release note ${objectKey}`);
    continue;
  }
  if (storage == null) throw new Error("storage config is required to publish release notes");
  const result = await putStorageObjectWithStatus({
    ...storage,
    body,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: entry.mediaType,
    headers: { "if-none-match": "*" },
    objectKey,
  });
  if (result.ok) continue;
  if (result.status !== 412) {
    throw new Error(`PUT ${result.url} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`);
  }
  const existing = await getStorageObject({ ...storage, objectKey });
  if (existing == null) throw new Error(`release note object disappeared after immutable PUT conflict: ${objectKey}`);
  const existingSize = existing.bytes.byteLength;
  const existingSha256 = createHash("sha256").update(existing.bytes).digest("hex");
  if (existingSize !== entry.size || existingSha256 !== entry.sha256) {
    throw new Error(`immutable release note already exists with different content: ${objectKey}`);
  }
  console.log(`reused identical immutable release note ${objectKey}`);
}

const publication = createReleaseNotePublication(plan, {
  publicOrigin,
  published: publishSideEffectsEnabled,
  versionPrefix,
});
writeJson(publicationPath, publication);
console.log(`${publication.state} release note publication for ${channel} ${releaseVersion}`);
