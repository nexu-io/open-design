import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import {
  contentType,
  githubInfo,
  optional,
  publicUrl,
  required,
  storageConfigFromEnv,
  writeJson,
} from "./common.ts";
import {
  getStorageObject,
  putStorageObject,
  putStorageObjectWithStatus,
} from "./s3-upload.ts";

/**
 * Publish the hosted native-server bootstrap feed layout:
 *   server/latest/VERSION
 *   server/v<version>/SHA256SUMS
 *   server/v<version>/<archive>
 *
 * This matches install.sh / install.ps1 defaults under
 * https://releases.open-design.ai/server.
 */

const feedRoot = required("RELEASE_SERVER_FEED_DIR");
const releaseVersion = required("RELEASE_VERSION").replace(/^v(?=\d)/, "");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const outputsPath = required("RELEASE_OUTPUTS_PATH");
const dryRunMode = optional("RELEASE_DRY_RUN_MODE");
const publishSideEffectsEnabled = optional("RELEASE_PUBLISH_SIDE_EFFECTS", "true") !== "false";
const objectPrefix = optional("RELEASE_SERVER_OBJECT_PREFIX", "server").replace(/^\/+|\/+$/g, "");
const storage = publishSideEffectsEnabled ? storageConfigFromEnv() : null;

if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(releaseVersion) || releaseVersion.includes("..")) {
  throw new Error(`RELEASE_VERSION must be a non-empty path-safe value: ${releaseVersion}`);
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function listFiles(root: string): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`server feed root is missing: ${root}`);
  }
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  files.sort();
  return files;
}

function serverContentType(path: string): string {
  const name = basename(path);
  if (name === "SHA256SUMS" || name === "VERSION") {
    return "text/plain; charset=utf-8";
  }
  if (name.endsWith(".tar.gz")) return "application/gzip";
  return contentType(name);
}

async function upload(path: string, objectKey: string, cacheControl: string): Promise<void> {
  if (!publishSideEffectsEnabled) {
    console.log(`[dry-run:${dryRunMode || "plan"}] would upload ${path} to ${objectKey}`);
    return;
  }
  if (storage == null) throw new Error("storage config is required to upload server feed assets");
  await putStorageObject({
    ...storage,
    bodyPath: path,
    cacheControl,
    contentType: serverContentType(path),
    objectKey,
  });
}

async function publishImmutableObject(
  path: string,
  objectKey: string,
  cacheControl: string,
): Promise<void> {
  if (!publishSideEffectsEnabled) {
    console.log(`[dry-run:${dryRunMode || "plan"}] would create immutable ${objectKey} from ${path}`);
    return;
  }
  if (storage == null) {
    throw new Error("storage config is required to upload server feed assets");
  }

  const result = await putStorageObjectWithStatus({
    ...storage,
    bodyPath: path,
    cacheControl,
    contentType: serverContentType(path),
    headers: { "if-none-match": "*" },
    objectKey,
  });
  if (result.ok) return;
  if (result.status !== 412) {
    throw new Error(
      `PUT ${result.url} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`,
    );
  }

  const existing = await getStorageObject({ ...storage, objectKey });
  if (existing == null) {
    throw new Error(
      `immutable server object disappeared after conditional PUT conflict: ${objectKey}`,
    );
  }
  const body = readFileSync(path);
  if (!existing.bytes.equals(body)) {
    throw new Error(
      `immutable server object already exists with different content: ${objectKey}`,
    );
  }
  console.log(`reused identical immutable server object ${objectKey}`);
}

const versionRootRelative = `v${releaseVersion}`;
const versionRoot = join(feedRoot, versionRootRelative);
const latestVersionPath = join(feedRoot, "latest", "VERSION");
const sha256SumsPath = join(versionRoot, "SHA256SUMS");

if (!existsSync(versionRoot) || !statSync(versionRoot).isDirectory()) {
  throw new Error(`server feed is missing version root: ${versionRoot}`);
}
if (!existsSync(sha256SumsPath) || !statSync(sha256SumsPath).isFile()) {
  throw new Error(`server feed is missing SHA256SUMS: ${sha256SumsPath}`);
}
if (!existsSync(latestVersionPath) || !statSync(latestVersionPath).isFile()) {
  throw new Error(`server feed is missing latest/VERSION: ${latestVersionPath}`);
}

const versionFiles = listFiles(versionRoot);
const orderedVersionFiles = [
  sha256SumsPath,
  ...versionFiles.filter((file) => file !== sha256SumsPath),
];
const uploaded: Array<{ cacheControl: string; objectKey: string; url: string }> = [];

for (const file of orderedVersionFiles) {
  const relativePath = normalizePath(relative(versionRoot, file));
  const objectKey = `${objectPrefix}/${versionRootRelative}/${relativePath}`;
  const cacheControl = "public, max-age=31536000, immutable";
  await publishImmutableObject(file, objectKey, cacheControl);
  uploaded.push({
    cacheControl,
    objectKey,
    url: publicUrl(publicOrigin, objectPrefix, `${versionRootRelative}/${relativePath}`),
  });
}

const latestObjectKey = `${objectPrefix}/latest/VERSION`;
const latestCacheControl = "public, max-age=60, must-revalidate";
await upload(latestVersionPath, latestObjectKey, latestCacheControl);
uploaded.push({
  cacheControl: latestCacheControl,
  objectKey: latestObjectKey,
  url: publicUrl(publicOrigin, objectPrefix, "latest/VERSION"),
});

const result = {
  dryRunMode: dryRunMode || null,
  feedRoot,
  github: githubInfo(),
  objectPrefix,
  publicOrigin,
  publishSideEffectsEnabled,
  releaseVersion,
  uploaded,
  urls: {
    latestVersion: publicUrl(publicOrigin, objectPrefix, "latest/VERSION"),
    sha256Sums: publicUrl(publicOrigin, objectPrefix, `${versionRootRelative}/SHA256SUMS`),
    versionRoot: publicUrl(publicOrigin, objectPrefix, versionRootRelative),
  },
};

writeJson(outputsPath, result);
console.log(
  publishSideEffectsEnabled
    ? `published server feed ${objectPrefix}/v${releaseVersion} (${uploaded.length} objects)`
    : `planned server feed ${objectPrefix}/v${releaseVersion} (${uploaded.length} objects)`,
);
