import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contentType, publicUrl, required, storageConfigFromEnv } from "./common.ts";
import { getStorageObject, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

const BOOTSTRAP_FILES = ["install-dsh.cmd", "install-dsh.ps1", "install-dsh.sh"] as const;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

type BootstrapObject = {
  body: Buffer;
  name: string;
};

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

async function publishImmutableBootstrapObject(
  storage: StorageConfig,
  prefix: string,
  object: BootstrapObject,
): Promise<void> {
  const objectKey = `${prefix}/${object.name}`;
  const result = await putStorageObjectWithStatus({
    ...storage,
    body: object.body,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    contentType: contentType(object.name),
    headers: { "if-none-match": "*" },
    objectKey,
  });
  if (result.ok) return;
  if (result.status !== 412) {
    throw new Error(`PUT ${result.url} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`);
  }

  const existing = await getStorageObject({ ...storage, objectKey });
  if (existing == null) {
    throw new Error(`bootstrap object disappeared after immutable PUT conflict: ${objectKey}`);
  }
  if (!existing.bytes.equals(object.body)) {
    throw new Error(`immutable bootstrap object already exists with different content: ${objectKey}`);
  }
  console.log(`reused identical immutable bootstrap object ${objectKey}`);
}

const version = required("DSH_BOOTSTRAP_VERSION");
if (!/^v[1-9]\d*$/.test(version)) {
  throw new Error(`DSH_BOOTSTRAP_VERSION must look like v1 or v2; got ${version}`);
}

const sourceDir = required("DSH_BOOTSTRAP_SOURCE_DIR");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN");
const storage = storageConfigFromEnv();
const prefix = `bootstrap/dsh/${version}`;
const installers = BOOTSTRAP_FILES.map((name) => ({
  body: readFileSync(join(sourceDir, name)),
  name,
}));
const checksums = Buffer.from(
  installers.map(({ body, name }) => `${sha256(body)}  ${name}`).join("\n") + "\n",
  "utf8",
);
const objects: BootstrapObject[] = [...installers, { body: checksums, name: "SHA256SUMS" }];

for (const object of objects) {
  await publishImmutableBootstrapObject(storage, prefix, object);
}

for (const object of objects) {
  const objectKey = `${prefix}/${object.name}`;
  const published = await getStorageObject({ ...storage, objectKey });
  if (published == null || !published.bytes.equals(object.body)) {
    throw new Error(`published bootstrap object failed byte-for-byte verification: ${objectKey}`);
  }
  console.log(publicUrl(publicOrigin, prefix, object.name));
}
