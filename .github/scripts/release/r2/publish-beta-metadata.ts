import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getS3ObjectText, uploadS3Object } from "./s3-upload.ts";

type PlatformManifest = {
  artifacts?: Record<string, { url?: string }>;
  channel?: string;
  enabled?: boolean;
  feed?: { latestUrl?: string };
  github?: {
    commit?: string;
    runAttempt?: number;
    runId?: number;
  };
  label?: string;
  platformKey?: string;
  r2?: { versionPrefix?: string };
  reason?: string | null;
  result?: string;
  releaseVersion?: string;
  signed?: boolean;
  status?: string;
};

function required(name) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name, fallback = "") {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

function enabled(name) {
  return process.env[name] === "true";
}

async function upload(filePath, objectKey, contentType, cacheControl) {
  await uploadS3Object({
    accessKeyId,
    bodyPath: filePath,
    bucket,
    cacheControl,
    contentType,
    endpointUrl,
    objectKey,
    region,
    secretAccessKey,
    sessionToken,
  });
}

function publicUrl(prefix, name) {
  return `${publicOrigin}/${prefix}/${name}`;
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0 || value == null) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

async function readManifest(key): Promise<PlatformManifest | null> {
  const path = join(manifestRoot, `${key}.json`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));

  const objectKey = `${platformManifestPrefix}/${key}.json`;
  const text = await getS3ObjectText({
    accessKeyId,
    bucket,
    endpointUrl,
    objectKey,
    region,
    secretAccessKey,
    sessionToken,
  });
  if (text == null) return null;
  return JSON.parse(text);
}

function validatePlatformManifest(key: string, manifest: PlatformManifest): string | null {
  if (manifest.channel !== releaseChannel) {
    return `channel=${String(manifest.channel)}`;
  }
  if (manifest.releaseVersion !== releaseVersion) {
    return `releaseVersion=${String(manifest.releaseVersion)}`;
  }
  if (currentRunId > 0 && manifest.github?.runId !== currentRunId) {
    return `github.runId=${String(manifest.github?.runId)}`;
  }
  if (currentCommit.length > 0 && manifest.github?.commit !== currentCommit) {
    return `github.commit=${String(manifest.github?.commit)}`;
  }
  if (manifest.platformKey !== key) {
    return `platformKey=${String(manifest.platformKey)}`;
  }
  if (manifest.status !== "published") {
    return `status=${String(manifest.status)}`;
  }
  if (manifest.r2?.versionPrefix == null || !manifest.r2.versionPrefix.includes(`/versions/${releaseVersion}`)) {
    return `versionPrefix=${String(manifest.r2?.versionPrefix)}`;
  }
  return null;
}

const bucket = required("CLOUDFLARE_R2_RELEASES_BUCKET");
const accessKeyId = required("AWS_ACCESS_KEY_ID");
const endpointUrl = required("CLOUDFLARE_R2_RELEASES_URL").replace(/\/+$/, "");
const publicOrigin = required("CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN").replace(/\/+$/, "");
const region = required("AWS_DEFAULT_REGION");
const runnerTemp = required("RUNNER_TEMP");
const secretAccessKey = required("AWS_SECRET_ACCESS_KEY");
const sessionToken = optional("AWS_SESSION_TOKEN");
const releaseChannel = required("RELEASE_CHANNEL");
if (releaseChannel !== "beta") {
  throw new Error(`publish-beta-metadata only supports beta, got ${releaseChannel}`);
}

const releaseVersion = required("RELEASE_VERSION");
const currentCommit = optional("GITHUB_SHA");
const currentRunId = Number(process.env.GITHUB_RUN_ID ?? "0");
const latestPrefix = `${releaseChannel}/latest`;
const manifestRoot = optional("PLATFORM_MANIFEST_ROOT", join(runnerTemp, "release-platform-manifests"));
const platformManifestPrefix = optional("PLATFORM_MANIFEST_PREFIX", `${latestPrefix}/platforms`).replace(/^\/+|\/+$/g, "");
const requestedAssetVersionSuffix = optional("ASSET_VERSION_SUFFIX");

const platformDefs = [
  { env: "ENABLE_MAC", key: "mac", label: "macOS arm64", result: optional("MAC_RESULT", "skipped") },
  { env: "ENABLE_WIN", key: "win", label: "Windows x64", result: optional("WIN_RESULT", "skipped") },
  { env: "ENABLE_LINUX", key: "linux", label: "Linux x64", result: optional("LINUX_RESULT", "skipped") },
  { env: "ENABLE_MAC_INTEL", key: "macIntel", label: "macOS x64 (Intel)", result: optional("MAC_INTEL_RESULT", "skipped") },
];

const platforms: Record<string, PlatformManifest> = {};
const expectedPlatforms: string[] = [];
const readyPlatforms: string[] = [];
const failedPlatforms: string[] = [];

for (const def of platformDefs) {
  if (!enabled(def.env)) continue;
  expectedPlatforms.push(def.key);
  const manifest = await readManifest(def.key);
  const invalidReason = manifest == null ? null : validatePlatformManifest(def.key, manifest);
  if (manifest != null && invalidReason != null && def.result === "success") {
    throw new Error(`refusing stale ${def.key} platform manifest for ${releaseVersion}: ${invalidReason}`);
  }
  if (manifest != null && invalidReason == null && def.result === "success") {
    platforms[def.key] = {
      ...manifest,
      enabled: true,
      status: "published",
    };
    readyPlatforms.push(def.key);
  } else {
    const status = def.result === "success" ? "missing" : "failed";
    platforms[def.key] = {
      enabled: true,
      label: def.label,
      reason: manifest == null ? "missing manifest" : invalidReason,
      result: def.result,
      status,
    };
    failedPlatforms.push(def.key);
  }
}

let assetVersionSuffix = requestedAssetVersionSuffix;
if (assetVersionSuffix === "auto") {
  const readyManifests = readyPlatforms.map((key) => platforms[key]).filter((manifest) => manifest != null);
  const allReadyPlatformsSigned = readyManifests.length > 0 && readyManifests.every((manifest) => manifest.signed === true);
  assetVersionSuffix = allReadyPlatformsSigned ? ".signed" : ".unsigned";
}

let releaseState = "failed";
if (expectedPlatforms.length > 0 && readyPlatforms.length === expectedPlatforms.length) {
  releaseState = "complete";
} else if (readyPlatforms.length > 0) {
  releaseState = "partial";
}

const versionPrefix = optional("RELEASE_VERSION_PREFIX", `${releaseChannel}/versions/${releaseVersion}${assetVersionSuffix}`);
const reportUrl = publicUrl(versionPrefix, "report/");
const latestMetadataUpdated = releaseState === "complete";
const metadata = {
  assetVersionSuffix,
  baseVersion: required("BASE_VERSION"),
  betaNumber: Number(releaseVersion.split("-beta.")[1]),
  betaVersion: releaseVersion,
  channel: releaseChannel,
  expectedPlatforms,
  failedPlatforms,
  generatedAt: new Date().toISOString(),
  github: {
    branch: required("BRANCH_NAME"),
    commit: process.env.GITHUB_SHA ?? "",
    repository: process.env.GITHUB_REPOSITORY ?? "",
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? "0"),
    runId: Number(process.env.GITHUB_RUN_ID ?? "0"),
    workflow: process.env.GITHUB_WORKFLOW ?? "",
  },
  platforms,
  r2: {
    latestMetadataUrl: publicUrl(latestPrefix, "metadata.json"),
    latestMetadataUpdated,
    latestPrefix,
    publicOrigin,
    report: {
      type: "directory",
      url: reportUrl,
    },
    reportUrl,
    reportZipUrl: null,
    versionMetadataUrl: publicUrl(versionPrefix, "metadata.json"),
    versionPrefix,
  },
  readyPlatforms,
  releaseState,
  signed: process.env.RELEASE_SIGNED === "true",
  stateSource: required("STATE_SOURCE"),
  version: 1,
};

const metadataPath = join(runnerTemp, "release-beta-metadata.json");
writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
await upload(metadataPath, `${versionPrefix}/metadata.json`, "application/json; charset=utf-8", "public, max-age=31536000, immutable");
if (latestMetadataUpdated) {
  await upload(metadataPath, `${latestPrefix}/metadata.json`, "application/json; charset=utf-8", "public, max-age=60, must-revalidate");
} else {
  console.log(`left ${metadata.r2.latestMetadataUrl} unchanged because releaseState=${releaseState}`);
}

setOutput("metadata_url", metadata.r2.latestMetadataUrl);
setOutput("latest_metadata_updated", String(latestMetadataUpdated));
setOutput("version_metadata_url", metadata.r2.versionMetadataUrl);
setOutput("version_prefix", versionPrefix);
setOutput("report_url", reportUrl);
setOutput("release_state", releaseState);

for (const [key, platform] of Object.entries(platforms)) {
  if (platform.status !== "published") continue;
  for (const [artifactName, artifact] of Object.entries(platform.artifacts ?? {})) {
    setOutput(`${key}_${artifactName}_url`, artifact.url);
  }
  if (platform.feed?.latestUrl != null) {
    setOutput(`${key}_feed_url`, platform.feed.latestUrl);
  }
}

mkdirSync(join(runnerTemp, "release-metadata"), { recursive: true });
writeFileSync(join(runnerTemp, "release-metadata", "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(`published beta version metadata (${releaseState}) to ${metadata.r2.versionMetadataUrl}`);
