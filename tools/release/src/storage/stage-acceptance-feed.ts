import { readFileSync } from "node:fs";

import {
  normalizePublicUrl,
  required,
  storageConfigFromEnv,
} from "./common.ts";
import { putImmutableStorageObject } from "./s3-upload.ts";

function normalizePrefix(value: string): string {
  const normalized = value.replace(/^\/+|\/+$/gu, "");
  if (!/^[a-z0-9][a-z0-9/_-]*$/u.test(normalized) || normalized.includes("..")) {
    throw new Error("RELEASE_ACCEPTANCE_FEED_PREFIX must be a safe storage prefix");
  }
  return normalized;
}

const metadataPath = required("RELEASE_METADATA_PATH");
const publicOrigin = normalizePublicUrl(required("RELEASE_PUBLIC_ORIGIN"));
const releaseVersion = required("RELEASE_VERSION");
const prefix = normalizePrefix(required("RELEASE_ACCEPTANCE_FEED_PREFIX"));
const bytes = readFileSync(metadataPath);
const metadata = JSON.parse(bytes.toString("utf8")) as { releaseVersion?: unknown };
if (metadata.releaseVersion !== releaseVersion) {
  throw new Error("acceptance feed metadata does not match RELEASE_VERSION");
}

const storage = storageConfigFromEnv();
const exactKey = `${prefix}/versions/${releaseVersion}/metadata.json`;
const latestKey = `${prefix}/latest/metadata.json`;
await putImmutableStorageObject({
  ...storage,
  body: bytes,
  cacheControl: "public, max-age=31536000, immutable",
  contentType: "application/json; charset=utf-8",
  objectKey: exactKey,
});
await putImmutableStorageObject({
  ...storage,
  body: bytes,
  cacheControl: "no-store",
  contentType: "application/json; charset=utf-8",
  objectKey: latestKey,
});

process.stdout.write(`${JSON.stringify({
  exactUrl: new URL(exactKey, publicOrigin.endsWith("/") ? publicOrigin : `${publicOrigin}/`).toString(),
  latestUrl: new URL(latestKey, publicOrigin.endsWith("/") ? publicOrigin : `${publicOrigin}/`).toString(),
  prefix,
  releaseVersion,
}, null, 2)}\n`);
