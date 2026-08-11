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
import {
  assertLauncherVersionFloorSatisfiable,
  resolveLauncherVersionFloor,
} from "./launcher-version-floor.ts";
import {
  parseCountedReleaseVersion,
  parseReleaseBaseVersion,
  releaseChannelDescriptor,
  releaseMetadataVersionFields,
  type CountedReleaseChannel,
} from "@open-design/release";
import {
  parseReleaseNotePublication,
  releaseNoteMetadataFromPublication,
} from "../release-note/publication.ts";

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

const releaseChannel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
const countedReleaseChannel = releaseChannel === "stable" ? null : releaseChannel;
const releaseVersion = required("RELEASE_VERSION");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const metadataDir = required("RELEASE_METADATA_DIR");
const manifestDir = required("RELEASE_MANIFEST_DIR");
const releaseNoteManifestPath = optional("RELEASE_NOTE_MANIFEST_PATH");
const outputsPath = required("RELEASE_OUTPUTS_PATH");
const requestedAssetVersionSuffix = optional("RELEASE_ASSET_SUFFIX");
const dryRunMode = optional("RELEASE_DRY_RUN_MODE");
const publishSideEffectsEnabled = optional("RELEASE_PUBLISH_SIDE_EFFECTS", "true") !== "false";
const latestPrefix = `${releaseChannel}/latest`;
const currentCommit = optional("RELEASE_COMMIT");
const currentRunId = Number(optional("RELEASE_RUN_ID", "0"));
const versionLockRequired = process.env.RELEASE_VERSION_LOCK_REQUIRED === "true";
const versionLockKey = optional(
  "RELEASE_VERSION_LOCK_KEY",
  countedReleaseChannel == null ? "" : versionLockObjectKey(releaseVersion, countedReleaseChannel),
);
const latestCasRequired = process.env.RELEASE_LATEST_CAS_REQUIRED === "true";
const storage = publishSideEffectsEnabled || versionLockRequired ? storageConfigFromEnv() : null;

// Operator-supplied installer-reinstall floor: one repo-vars pair per channel,
// resolved with pair-level stable fallback by the shared channel-policy
// resolver. Published as control.launcher.version.{min,url}; the desktop
// updater compares min against the physically installed outer package version
// and forces the installer route — including a same-version reinstall — when
// the outer is below it.
const launcherVersionFloor = resolveLauncherVersionFloor(releaseChannel);
if (launcherVersionFloor != null) {
  assertLauncherVersionFloorSatisfiable(launcherVersionFloor, releaseVersion);
}
const controlBlock = launcherVersionFloor == null
  ? {}
  : {
      control: {
        launcher: {
          version: {
            min: launcherVersionFloor.min,
            ...(launcherVersionFloor.url == null ? {} : { url: launcherVersionFloor.url }),
          },
        },
      },
    };

function readReleaseNoteMetadata(): ReturnType<typeof releaseNoteMetadataFromPublication> {
  if (releaseNoteManifestPath.length === 0) {
    if (releaseChannel === "stable") {
      throw new Error("RELEASE_NOTE_MANIFEST_PATH is required for stable metadata publication");
    }
    return null;
  }
  const publication = parseReleaseNotePublication(JSON.parse(readFileSync(releaseNoteManifestPath, "utf8")) as unknown);
  if (publication.channel !== releaseChannel || publication.releaseVersion !== releaseVersion) {
    throw new Error(`release note publication identity mismatch for ${releaseChannel} ${releaseVersion}`);
  }
  if (releaseChannel === "stable" && publication.state === "absent") {
    throw new Error("release note publication is required for stable metadata");
  }
  if (publication.state !== "absent") {
    const expectedState = publishSideEffectsEnabled ? "published" : "planned";
    if (publication.state !== expectedState) {
      throw new Error(`release note publication must be ${expectedState} before metadata publication; got ${publication.state}`);
    }
  }
  return releaseNoteMetadataFromPublication(publication);
}

if (versionLockRequired) {
  if (countedReleaseChannel == null) {
    throw new Error("stable releases do not use counted version reservations");
  }
  if (storage == null) throw new Error("storage config is required for version reservation validation");
  await assertCurrentVersionReservation(storage, releaseVersion, versionLockKey, countedReleaseChannel);
  console.log(`verified ${countedReleaseChannel} version reservation ${versionLockKey}`);
}

const targetDefs: TargetDef[] = [
  { enableEnv: "ENABLE_MAC_ARM64", label: "macOS arm64", legacyKey: "mac", resultEnv: "MAC_ARM64_RESULT", target: "mac_arm64" },
  { enableEnv: "ENABLE_WIN_X64", label: "Windows x64", legacyKey: "win", resultEnv: "WIN_X64_RESULT", target: "win_x64" },
  { enableEnv: "ENABLE_MAC_X64", label: "macOS x64", legacyKey: "macIntel", resultEnv: "MAC_X64_RESULT", target: "mac_x64" },
  { enableEnv: "ENABLE_LINUX_X64", label: "Linux x64", legacyKey: "linux", resultEnv: "LINUX_X64_RESULT", target: "linux_x64" },
];

function releaseMetadataFields(): Record<string, unknown> {
  const fields = releaseMetadataVersionFields(releaseChannel, releaseVersion);
  const baseVersion = typeof fields.baseVersion === "string" ? fields.baseVersion : "";
  return {
    ...fields,
    baseVersion: optional("BASE_VERSION", baseVersion),
    ...(releaseChannel === "beta" || releaseChannel === "preview" ? { assetVersionSuffix } : {}),
    ...(releaseChannel === "stable" ? {
      stableVersion: optional("STABLE_VERSION", baseVersion),
      versionTag: optional("VERSION_TAG"),
    } : {}),
  };
}

function parseCountedVersionForChannel(value: string, channel: CountedReleaseChannel): { base: [number, number, number]; releaseNumber: number } | null {
  const parsed = parseCountedReleaseVersion(value, channel);
  if (parsed == null) return null;
  const base = parseReleaseBaseVersion(parsed.baseVersion);
  if (base == null) return null;
  return { base: [...base], releaseNumber: parsed.number };
}

function compareReleaseVersions(left: string, right: string): number {
  if (releaseChannel === "stable") throw new Error("stable latest CAS does not compare counted release versions");
  const parsedLeft = parseCountedVersionForChannel(left, releaseChannel);
  const parsedRight = parseCountedVersionForChannel(right, releaseChannel);
  if (parsedLeft == null || parsedRight == null) {
    throw new Error(`invalid ${releaseChannel} version comparison: ${left} vs ${right}`);
  }
  for (let index = 0; index < parsedLeft.base.length; index += 1) {
    if (parsedLeft.base[index] > parsedRight.base[index]) return 1;
    if (parsedLeft.base[index] < parsedRight.base[index]) return -1;
  }
  if (parsedLeft.releaseNumber > parsedRight.releaseNumber) return 1;
  if (parsedLeft.releaseNumber < parsedRight.releaseNumber) return -1;
  return 0;
}

async function upload(path: string, objectKey: string, cacheControl: string, type = "application/json; charset=utf-8"): Promise<void> {
  if (!publishSideEffectsEnabled) {
    console.log(`[dry-run:${dryRunMode || "plan"}] would upload ${path} to ${objectKey}`);
    return;
  }
  if (storage == null) throw new Error("storage config is required to upload release metadata");
  await putStorageObject({
    ...storage,
    bodyPath: path,
    cacheControl,
    contentType: type,
    objectKey,
  });
}

async function uploadLatestMetadataWithCas(path: string, objectKey: string): Promise<void> {
  if (storage == null) throw new Error("storage config is required to publish latest metadata");
  if (!latestCasRequired) {
    await upload(path, objectKey, "public, max-age=60, must-revalidate");
    return;
  }

  if (releaseChannel === "stable") {
    throw new Error("latest metadata CAS is only supported for counted releases");
  }
  if (parseCountedVersionForChannel(releaseVersion, releaseChannel) == null) {
    throw new Error(`invalid ${releaseChannel} version for latest CAS: ${releaseVersion}`);
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const latest = await getStorageObject({ ...storage, objectKey });
    const headers: Record<string, string> = {};
    if (latest == null) {
      headers["if-none-match"] = "*";
    } else {
      let latestReleaseVersion = "";
      try {
        const parsed = JSON.parse(latest.text.replace(/^\uFEFF/u, "")) as { releaseVersion?: unknown };
        latestReleaseVersion = typeof parsed.releaseVersion === "string" ? parsed.releaseVersion : "";
      } catch (error) {
        throw new Error(`latest metadata is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (latestReleaseVersion.length > 0 && compareReleaseVersions(latestReleaseVersion, releaseVersion) > 0) {
        throw new Error(`refusing to move ${releaseChannel} latest backward from ${latestReleaseVersion} to ${releaseVersion}`);
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
  if (storage == null) throw new Error("storage config is required to publish latest platform objects");
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
const readyManifests = readyTargets.map((target) => releaseTargets[target]).filter((manifest) => manifest != null);
const allReadyTargetsSigned = readyManifests.length > 0 && readyManifests.every((manifest) => manifest.signed === true);
if (assetVersionSuffix === "auto") {
  assetVersionSuffix = allReadyTargetsSigned ? ".signed" : ".unsigned";
}
const versionPrefix = optional("RELEASE_VERSION_PREFIX", `${releaseChannel}/versions/${releaseVersion}${assetVersionSuffix}`);

const latestMetadataUpdated = releaseState === "complete";
const releaseNote = readReleaseNoteMetadata();
const releaseFields = releaseMetadataFields();
const metadata = {
  ...releaseFields,
  channel: releaseChannel,
  ...controlBlock,
  expectedPlatforms: expectedTargets,
  expectedTargets,
  failedPlatforms: failedTargets,
  failedTargets,
  generatedAt: new Date().toISOString(),
  github: githubInfo(),
  dryRun: !publishSideEffectsEnabled,
  dryRunMode,
  platforms,
  ...(releaseNote == null ? {} : { releaseNote }),
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
  allReadyTargetsSigned,
  stateSource: required("STATE_SOURCE"),
  version: 1,
};

mkdirSync(metadataDir, { recursive: true });
const metadataPath = join(metadataDir, "metadata.json");
writeJson(metadataPath, metadata);
await upload(metadataPath, `${versionPrefix}/metadata.json`, "public, max-age=31536000, immutable");
if (latestMetadataUpdated && publishSideEffectsEnabled) {
  await uploadLatestMetadataWithCas(metadataPath, `${latestPrefix}/metadata.json`);
  await publishLatestPlatformObjects(releaseTargets);
} else if (latestMetadataUpdated) {
  console.log(`[dry-run:${dryRunMode || "plan"}] left ${metadata.r2.latestMetadataUrl} unchanged`);
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

if (publishSideEffectsEnabled) {
  console.log(`published ${releaseChannel} version metadata (${releaseState}) to ${metadata.r2.versionMetadataUrl}`);
} else {
  console.log(`planned ${releaseChannel} version metadata (${releaseState}) for ${metadata.r2.versionMetadataUrl}`);
}
