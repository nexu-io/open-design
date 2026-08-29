import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { contentType, githubInfo, optional, publicUrl, required, storageConfigFromEnv } from "./common.ts";
import { getStorageObject, putStorageObject, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

const BOOTSTRAP_FILES = ["install-dsh.cmd", "install-dsh.ps1", "install-dsh.sh"] as const;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const POINTER_CACHE_CONTROL = "public, max-age=60";
const POINTER_KEY = "bootstrap/dsh/latest.json";
// Versions are minted one at a time by production promotions, so a run that has
// to probe past this many of them is looping on a bug rather than catching up.
const MAX_VERSION_PROBE = 100;

type BootstrapObject = {
  body: Buffer;
  name: string;
};

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

function versionPrefix(version: string): string {
  return `bootstrap/dsh/${version}`;
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

/**
 * The bootstrap version is a function of the installer bytes, not a constant a
 * human is expected to bump. Probe published versions in ascending order and
 * settle on the first one that either does not exist yet (mint it) or already
 * holds exactly these bytes (reuse it). `SHA256SUMS` fingerprints all three
 * installers, so a single GET per version decides the whole set.
 *
 * This keeps every published version permanently immutable while making an
 * edited installer roll forward on its own instead of failing the deploy.
 */
async function resolveBootstrapVersion(storage: StorageConfig, checksums: Buffer): Promise<string> {
  for (let candidate = 1; candidate <= MAX_VERSION_PROBE; candidate += 1) {
    const version = `v${candidate}`;
    const published = await getStorageObject({ ...storage, objectKey: `${versionPrefix(version)}/SHA256SUMS` });
    if (published == null) {
      console.log(`minting new immutable bootstrap version ${version}`);
      return version;
    }
    if (published.bytes.equals(checksums)) {
      console.log(`reusing published immutable bootstrap version ${version}`);
      return version;
    }
  }
  throw new Error(`no free DeepSeek Harness bootstrap version below v${MAX_VERSION_PROBE + 1}`);
}

const pinnedVersion = optional("DSH_BOOTSTRAP_VERSION");
if (pinnedVersion.length > 0 && !/^v[1-9]\d*$/.test(pinnedVersion)) {
  throw new Error(`DSH_BOOTSTRAP_VERSION must look like v1 or v2; got ${pinnedVersion}`);
}

const sourceDir = required("DSH_BOOTSTRAP_SOURCE_DIR");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN");
const storage = storageConfigFromEnv();
const installers = BOOTSTRAP_FILES.map((name) => ({
  body: readFileSync(join(sourceDir, name)),
  name,
}));
const checksums = Buffer.from(
  installers.map(({ body, name }) => `${sha256(body)}  ${name}`).join("\n") + "\n",
  "utf8",
);
const objects: BootstrapObject[] = [...installers, { body: checksums, name: "SHA256SUMS" }];

// An explicit pin stays fail-closed: it is the escape hatch for forcing a
// specific version, and it must never silently overwrite different bytes.
const version = pinnedVersion.length > 0 ? pinnedVersion : await resolveBootstrapVersion(storage, checksums);
const prefix = versionPrefix(version);

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

// Mutable pointer so consumers and the deploy workflow can find the current
// version without hard-coding it.
await putStorageObject({
  ...storage,
  body: Buffer.from(
    `${JSON.stringify(
      {
        files: Object.fromEntries(installers.map(({ body, name }) => [name, sha256(body)])),
        github: githubInfo(),
        publishedAt: new Date().toISOString(),
        version,
      },
      null,
      2,
    )}\n`,
    "utf8",
  ),
  cacheControl: POINTER_CACHE_CONTROL,
  contentType: contentType("latest.json"),
  objectKey: POINTER_KEY,
});
console.log(publicUrl(publicOrigin, "bootstrap/dsh", "latest.json"));

const githubOutput = optional("GITHUB_OUTPUT");
if (githubOutput.length > 0) {
  appendFileSync(githubOutput, `version=${version}\n`, "utf8");
}
