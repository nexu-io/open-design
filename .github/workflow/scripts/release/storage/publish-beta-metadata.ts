import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  contentType,
  githubInfo,
  optional,
  publicUrl,
  required,
  storageConfigFromEnv,
  writeJson,
} from "./common.ts";
import { assertCurrentVersionReservation, versionLockObjectKey } from "./beta-version-reservation.ts";
import { getStorageObject, putStorageObject, putStorageObjectWithStatus } from "./s3-upload.ts";

type PlatformManifest = {
  artifacts?: Record<string, { url?: string }>;
  channel?: string;
  enabled?: boolean;
  feed?: {
    name?: string;
    url?: string;
  } | null;
  github?: {
    commit?: string;
    runAttempt?: number;
    runId?: number;
  };
  legacyPlatformKey?: string;
  platformKey?: string;
  r2?: { versionPrefix?: string };
  reason?: string | null;
  releaseTarget?: string;
  releaseVersion?: string;
  signed?: boolean;
  status?: string;
};

type TargetDef = {
  enableEnv: string;
  label: string;
  legacyKey: "mac" | "macIntel" | "win" | "linux";
  resultEnv: string;
  target: "mac_arm64" | "mac_x64" | "win_x64" | "linux_x64";
};

const storage = storageConfigFromEnv();
const releaseChannel = required("RELEASE_CHANNEL");
if (releaseChannel !== "beta") {
  throw new Error(`publish-beta-metadata only supports beta, got ${releaseChannel}`);
}
const releaseVersion = required("RELEASE_VERSION");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const metadataDir = required("RELEASE_METADATA_DIR");
const manifestDir = required("RELEASE_MANIFEST_DIR");
const outputsPath = required("RELEASE_OUTPUTS_PATH");
const requestedAssetVersionSuffix = optional("RELEASE_ASSET_SUFFIX");
const latestPrefix = `${releaseChannel}/latest`;
const currentCommit = optional("RELEASE_COMMIT");
const currentRunId = Number(optional("RELEASE_RUN_ID", "0"));
const versionLockRequired = process.env.RELEASE_VERSION_LOCK_REQUIRED === "true";
const versionLockKey = optional("RELEASE_VERSION_LOCK_KEY", versionLockObjectKey(releaseVersion));
const latestCasRequired = process.env.RELEASE_LATEST_CAS_REQUIRED === "true";

if (versionLockRequired) {
  await assertCurrentVersionReservation(storage, releaseVersion, versionLockKey);
  console.log(`verified beta version reservation ${versionLockKey}`);
}

const targetDefs: TargetDef[] = [
  { enableEnv: "ENABLE_MAC_ARM64", label: "macOS arm64", legacyKey: "mac", resultEnv: "MAC_ARM64_RESULT", target: "mac_arm64" },
  { enableEnv: "ENABLE_WIN_X64", label: "Windows x64", legacyKey: "win", resultEnv: "WIN_X64_RESULT", target: "win_x64" },
  { enableEnv: "ENABLE_MAC_X64", label: "macOS x64", legacyKey: "macIntel", resultEnv: "MAC_X64_RESULT", target: "mac_x64" },
  { enableEnv: "ENABLE_LINUX_X64", label: "Linux x64", legacyKey: "linux", resultEnv: "LINUX_X64_RESULT", target: "linux_x64" },
];

function parseReleaseVersion(value: string): { base: [number, number, number]; betaNumber: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/.exec(value);
  if (match?.[1] == null || match[2] == null || match[3] == null || match[4] == null) return null;
  const base: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const betaNumber = Number(match[4]);
  if (base.some((part) => !Number.isSafeInteger(part)) || !Number.isSafeInteger(betaNumber) || betaNumber < 1) return null;
  return { base, betaNumber };
}

function compareReleaseVersions(left: string, right: string): number {
  const parsedLeft = parseReleaseVersion(left);
  const parsedRight = parseReleaseVersion(right);
  if (parsedLeft == null || parsedRight == null) {
    throw new Error(`invalid beta version comparison: ${left} vs ${right}`);
  }
  for (let index = 0; index < parsedLeft.base.length; index += 1) {
    if (parsedLeft.base[index] > parsedRight.base[index]) return 1;
    if (parsedLeft.base[index] < parsedRight.base[index]) return -1;
  }
  if (parsedLeft.betaNumber > parsedRight.betaNumber) return 1;
  if (parsedLeft.betaNumber < parsedRight.betaNumber) return -1;
  return 0;
}

async function upload(path: string, objectKey: string, cacheControl: string, type = "application/json; charset=utf-8"): Promise<void> {
  await putStorageObject({
    ...storage,
    bodyPath: path,
    cacheControl,
    contentType: type,
    objectKey,
  });
}

async function uploadLatestMetadataWithCas(path: string, objectKey: string): Promise<void> {
  if (!latestCasRequired) {
    await upload(path, objectKey, "public, max-age=60, must-revalidate");
    return;
  }

  if (parseReleaseVersion(releaseVersion) == null) {
    throw new Error(`invalid beta version for latest CAS: ${releaseVersion}`);
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const latest = await getStorageObject({ ...storage, objectKey });
    const headers: Record<string, string> = {};
    if (latest == null) {
      headers["if-none-match"] = "*";
    } else {
      let latestBetaVersion = "";
      try {
        const parsed = JSON.parse(latest.text.replace(/^\uFEFF/u, "")) as { betaVersion?: unknown };
        latestBetaVersion = typeof parsed.betaVersion === "string" ? parsed.betaVersion : "";
      } catch (error) {
        throw new Error(`latest metadata is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (latestBetaVersion.length > 0 && compareReleaseVersions(latestBetaVersion, releaseVersion) > 0) {
        throw new Error(`refusing to move beta latest backward from ${latestBetaVersion} to ${releaseVersion}`);
      }
      if (latest.etag.length === 0) {
        throw new Error("latest metadata GET did not return an ETag for CAS update");
      }
      headers["if-match"] = latest.etag;
    }

    const result = await putStorageObjectWithStatus({
      ...storage,
      bodyPath: path,
      cacheControl: "public, max-age=60, must-revalidate",
      contentType: "application/json; charset=utf-8",
      headers,
      objectKey,
    });
    if (result.ok) return;
    if (result.status !== 412) {
      throw new Error(`latest metadata CAS PUT ${objectKey} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`);
    }
    console.log(`latest metadata CAS conflict on attempt ${attempt}; retrying`);
  }

  throw new Error(`failed to update latest metadata with CAS after 5 attempts: ${objectKey}`);
}

async function publishLatestPlatformObjects(manifests: Record<string, PlatformManifest>): Promise<void> {
  for (const [target, manifest] of Object.entries(manifests)) {
    const manifestPath = join(manifestDir, `${target}.json`);
    await upload(manifestPath, `${latestPrefix}/platforms/${target}.json`, "public, max-age=60, must-revalidate");

    const feedName = manifest.feed?.name;
    if (feedName == null || feedName.length === 0) continue;

    const feedVersionPrefix = manifest.r2?.versionPrefix;
    if (feedVersionPrefix == null || feedVersionPrefix.length === 0) {
      throw new Error(`published ${target} platform manifest is missing r2.versionPrefix for ${feedName}`);
    }
    const versionFeed = await getStorageObject({ ...storage, objectKey: `${feedVersionPrefix}/${feedName}` });
    if (versionFeed == null) {
      throw new Error(`expected versioned feed object not found: ${feedVersionPrefix}/${feedName}`);
    }
    const feedPath = join(metadataDir, "latest-feeds", feedName);
    mkdirSync(join(metadataDir, "latest-feeds"), { recursive: true });
    writeFileSync(feedPath, versionFeed.text, "utf8");
    await upload(feedPath, `${latestPrefix}/${feedName}`, "public, max-age=60, must-revalidate", contentType(feedName));
  }
}

function enabled(name: string): boolean {
  return process.env[name] === "true";
}

function readManifest(target: string): PlatformManifest | null {
  const path = join(manifestDir, `${target}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as PlatformManifest;
}

function validateManifest(target: string, manifest: PlatformManifest): string | null {
  if (manifest.channel !== releaseChannel) return `channel=${String(manifest.channel)}`;
  if (manifest.releaseVersion !== releaseVersion) return `releaseVersion=${String(manifest.releaseVersion)}`;
  if (manifest.platformKey !== target) return `platformKey=${String(manifest.platformKey)}`;
  if (manifest.releaseTarget != null && manifest.releaseTarget !== target) return `releaseTarget=${String(manifest.releaseTarget)}`;
  if (manifest.status !== "published") return `status=${String(manifest.status)}`;
  if (currentRunId > 0 && manifest.github?.runId !== currentRunId) return `github.runId=${String(manifest.github?.runId)}`;
  if (currentCommit.length > 0 && manifest.github?.commit !== currentCommit) return `github.commit=${String(manifest.github?.commit)}`;
  if (manifest.r2?.versionPrefix == null || !manifest.r2.versionPrefix.includes(`/versions/${releaseVersion}`)) {
    return `versionPrefix=${String(manifest.r2?.versionPrefix)}`;
  }
  return null;
}

const expectedTargets: string[] = [];
const readyTargets: string[] = [];
const failedTargets: string[] = [];
const releaseTargets: Record<string, PlatformManifest> = {};
const platforms: Record<string, PlatformManifest> = {};

for (const def of targetDefs) {
  if (!enabled(def.enableEnv)) continue;
  expectedTargets.push(def.target);
  const result = optional(def.resultEnv, "skipped");
  const manifest = readManifest(def.target);
  const invalidReason = manifest == null ? null : validateManifest(def.target, manifest);
  if (manifest != null && invalidReason != null && result === "success") {
    throw new Error(`refusing stale ${def.target} platform manifest for ${releaseVersion}: ${invalidReason}`);
  }
  if (manifest != null && invalidReason == null && result === "success") {
    const readyManifest = {
      ...manifest,
      enabled: true,
      status: "published",
    };
    releaseTargets[def.target] = readyManifest;
    platforms[def.legacyKey] = readyManifest;
    readyTargets.push(def.target);
  } else {
    const status = result === "success" ? "missing" : "failed";
    const failedManifest = {
      enabled: true,
      label: def.label,
      reason: manifest == null ? "missing manifest" : invalidReason,
      result,
      status,
    };
    releaseTargets[def.target] = failedManifest;
    platforms[def.legacyKey] = failedManifest;
    failedTargets.push(def.target);
  }
}

let releaseState = "failed";
if (expectedTargets.length > 0 && readyTargets.length === expectedTargets.length) releaseState = "complete";
else if (readyTargets.length > 0) releaseState = "partial";

let assetVersionSuffix = requestedAssetVersionSuffix;
if (assetVersionSuffix === "auto") {
  const readyManifests = readyTargets.map((target) => releaseTargets[target]).filter((manifest) => manifest != null);
  const allReadyTargetsSigned = readyManifests.length > 0 && readyManifests.every((manifest) => manifest.signed === true);
  assetVersionSuffix = allReadyTargetsSigned ? ".signed" : ".unsigned";
}
const versionPrefix = optional("RELEASE_VERSION_PREFIX", `${releaseChannel}/versions/${releaseVersion}${assetVersionSuffix}`);

const latestMetadataUpdated = releaseState === "complete";
const metadata = {
  assetVersionSuffix,
  baseVersion: required("BASE_VERSION"),
  betaNumber: Number(releaseVersion.split("-beta.")[1]),
  betaVersion: releaseVersion,
  channel: releaseChannel,
  expectedPlatforms: expectedTargets,
  expectedTargets,
  failedPlatforms: failedTargets,
  failedTargets,
  generatedAt: new Date().toISOString(),
  github: githubInfo(),
  platforms,
  r2: {
    latestMetadataUrl: publicUrl(publicOrigin, latestPrefix, "metadata.json"),
    latestMetadataUpdated,
    latestPrefix,
    publicOrigin,
    report: {
      type: "directory",
      url: publicUrl(publicOrigin, versionPrefix, "report/"),
    },
    reportUrl: publicUrl(publicOrigin, versionPrefix, "report/"),
    reportZipUrl: null,
    versionMetadataUrl: publicUrl(publicOrigin, versionPrefix, "metadata.json"),
    versionPrefix,
  },
  readyPlatforms: readyTargets,
  readyTargets,
  releaseState,
  releaseTargets,
  signed: process.env.RELEASE_SIGNED === "true",
  stateSource: required("STATE_SOURCE"),
  version: 1,
};

mkdirSync(metadataDir, { recursive: true });
const metadataPath = join(metadataDir, "metadata.json");
writeJson(metadataPath, metadata);
await upload(metadataPath, `${versionPrefix}/metadata.json`, "public, max-age=31536000, immutable");
if (latestMetadataUpdated) {
  await uploadLatestMetadataWithCas(metadataPath, `${latestPrefix}/metadata.json`);
  await publishLatestPlatformObjects(releaseTargets);
} else {
  console.log(`left ${metadata.r2.latestMetadataUrl} unchanged because releaseState=${releaseState}`);
}

const outputs: Record<string, string> = {
  latest_metadata_updated: String(latestMetadataUpdated),
  metadata_url: metadata.r2.latestMetadataUrl,
  release_state: releaseState,
  report_url: metadata.r2.reportUrl,
  version_metadata_url: metadata.r2.versionMetadataUrl,
  version_prefix: versionPrefix,
};
for (const [target, manifest] of Object.entries(releaseTargets)) {
  if (manifest.status !== "published") continue;
  for (const [artifactName, artifact] of Object.entries(manifest.artifacts ?? {})) {
    if (artifact.url != null) outputs[`${target}_${artifactName}_url`] = artifact.url;
  }
  if ((manifest as { feed?: { latestUrl?: string } }).feed?.latestUrl != null) {
    outputs[`${target}_feed_url`] = (manifest as { feed: { latestUrl: string } }).feed.latestUrl;
  }
}
writeJson(outputsPath, outputs);

console.log(`published beta version metadata (${releaseState}) to ${metadata.r2.versionMetadataUrl}`);
