import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { releaseChannelDescriptor } from "@open-design/release";

import { optional, required, storageConfigFromEnv } from "../storage/common.ts";
import { getStorageObject } from "../storage/s3-upload.ts";
import { assertReleaseNotePlanPolicy } from "./policy.ts";
import { parseReleaseNotePublication, verifyReleaseNotePublication } from "./publication.ts";
import { parseReleaseNotePlan } from "./source.ts";

const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
const releaseVersion = required("RELEASE_VERSION");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN");
const planPath = required("RELEASE_NOTE_PLAN_PATH");
const publicationPath = required("RELEASE_NOTE_MANIFEST_PATH");
const publishSideEffectsEnabled = optional("RELEASE_PUBLISH_SIDE_EFFECTS", "true") !== "false";
const versionPrefix = `${channel}/versions/${releaseVersion}`;
const plan = parseReleaseNotePlan(JSON.parse(readFileSync(planPath, "utf8")) as unknown);
const publication = parseReleaseNotePublication(JSON.parse(readFileSync(publicationPath, "utf8")) as unknown);

if (plan.channel !== channel || plan.releaseVersion !== releaseVersion) {
  throw new Error(`release note plan identity mismatch for ${channel} ${releaseVersion}`);
}
assertReleaseNotePlanPolicy(plan, channel);
verifyReleaseNotePublication(plan, publication, {
  publicOrigin,
  requirePublished: publishSideEffectsEnabled && plan.state === "ready",
  versionPrefix,
});

if (publishSideEffectsEnabled && publication.state === "published") {
  const storage = storageConfigFromEnv();
  for (const entry of publication.entries) {
    const objectKey = `${versionPrefix}/release-notes/${entry.name}`;
    const object = await getStorageObject({ ...storage, objectKey });
    if (object == null) throw new Error(`published release note is missing: ${objectKey}`);
    const size = object.bytes.byteLength;
    const sha256 = createHash("sha256").update(object.bytes).digest("hex");
    if (size !== entry.size || sha256 !== entry.sha256) {
      throw new Error(`published release note failed integrity verification: ${objectKey}`);
    }
  }
}

console.log(`verified ${publication.state} release notes for ${channel} ${releaseVersion}`);
