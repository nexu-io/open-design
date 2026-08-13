import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { required, requiredTarget, storageConfigFromEnv, writeText } from "./common.ts";
import { getStorageObjectText } from "./s3-upload.ts";
import { releaseChannelDescriptor, releasePlatformManifestObjectKey } from "@open-design/release";

const storage = storageConfigFromEnv();
const releaseChannel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
const releaseVersion = required("RELEASE_VERSION");
const target = requiredTarget();
const manifestDir = required("RELEASE_MANIFEST_DIR");
const objectKey = releasePlatformManifestObjectKey(releaseChannel, releaseVersion, target);

const text = await getStorageObjectText({ ...storage, objectKey });
if (text == null) {
  throw new Error(`platform manifest not found in release storage: ${objectKey}`);
}

mkdirSync(manifestDir, { recursive: true });
writeText(join(manifestDir, `${target}.json`), text);

console.log(`downloaded ${target} platform manifest from release storage: ${objectKey}`);
