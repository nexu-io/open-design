import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

function upload(filePath, objectKey, contentType, cacheControl) {
  execFileSync(
    "aws",
    [
      "--endpoint-url",
      endpointUrl,
      "s3api",
      "put-object",
      "--bucket",
      bucket,
      "--key",
      objectKey,
      "--body",
      filePath,
      "--content-type",
      contentType,
      "--cache-control",
      cacheControl,
      "--no-cli-pager",
    ],
    { stdio: "inherit" },
  );
}

function publicUrl(prefix, name) {
  return `${publicOrigin}/${prefix}/${name}`;
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0 || value == null) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

function readManifest(key) {
  const path = join(manifestRoot, `${key}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

const bucket = required("CLOUDFLARE_R2_RELEASES_BUCKET");
const endpointUrl = required("CLOUDFLARE_R2_RELEASES_URL").replace(/\/+$/, "");
const publicOrigin = required("CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN").replace(/\/+$/, "");
const runnerTemp = required("RUNNER_TEMP");
const releaseChannel = required("RELEASE_CHANNEL");
if (releaseChannel !== "beta") {
  throw new Error(`publish-beta-metadata only supports beta, got ${releaseChannel}`);
}

const releaseVersion = required("RELEASE_VERSION");
const assetVersionSuffix = optional("ASSET_VERSION_SUFFIX");
const versionPrefix = optional("RELEASE_VERSION_PREFIX", `${releaseChannel}/versions/${releaseVersion}${assetVersionSuffix}`);
const latestPrefix = `${releaseChannel}/latest`;
const manifestRoot = optional("PLATFORM_MANIFEST_ROOT", join(runnerTemp, "release-platform-manifests"));

const platformDefs = [
  { env: "ENABLE_MAC", key: "mac", label: "macOS arm64", result: optional("MAC_RESULT", "skipped") },
  { env: "ENABLE_WIN", key: "win", label: "Windows x64", result: optional("WIN_RESULT", "skipped") },
  { env: "ENABLE_LINUX", key: "linux", label: "Linux x64", result: optional("LINUX_RESULT", "skipped") },
  { env: "ENABLE_MAC_INTEL", key: "macIntel", label: "macOS x64 (Intel)", result: optional("MAC_INTEL_RESULT", "skipped") },
];

const platforms = {};
const expectedPlatforms = [];
const readyPlatforms = [];
const failedPlatforms = [];

for (const def of platformDefs) {
  if (!enabled(def.env)) continue;
  expectedPlatforms.push(def.key);
  const manifest = readManifest(def.key);
  if (manifest != null && def.result === "success") {
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
      result: def.result,
      status,
    };
    failedPlatforms.push(def.key);
  }
}

let releaseState = "failed";
if (expectedPlatforms.length > 0 && readyPlatforms.length === expectedPlatforms.length) {
  releaseState = "complete";
} else if (readyPlatforms.length > 0) {
  releaseState = "partial";
}

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
upload(metadataPath, `${versionPrefix}/metadata.json`, "application/json; charset=utf-8", "public, max-age=31536000, immutable");
if (latestMetadataUpdated) {
  upload(metadataPath, `${latestPrefix}/metadata.json`, "application/json; charset=utf-8", "public, max-age=60, must-revalidate");
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
