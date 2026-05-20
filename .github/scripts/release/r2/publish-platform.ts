import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

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

function bool(name) {
  return process.env[name] === "true";
}

function normalizePath(value) {
  return value.split(sep).join("/");
}

function publicUrl(prefix, name) {
  return `${publicOrigin}/${prefix}/${name}`;
}

function contentType(name) {
  if (name.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (name.endsWith(".AppImage")) return "application/octet-stream";
  if (name.endsWith(".sha256")) return "text/plain; charset=utf-8";
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "application/x-yaml; charset=utf-8";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".log") || name.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".xml")) return "application/xml; charset=utf-8";
  return "application/octet-stream";
}

function upload(filePath, objectKey, type, cacheControl) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`expected upload file not found: ${filePath}`);
  }
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
      type,
      "--cache-control",
      cacheControl,
      "--no-cli-pager",
    ],
    { stdio: "inherit" },
  );
}

function fileEntry(name, type) {
  const filePath = join(releaseRoot, name);
  const size = statSync(filePath).size;
  const entry = {
    contentType: type,
    name,
    size,
    url: publicUrl(versionPrefix, name),
  };
  const checksumPath = join(releaseRoot, `${name}.sha256`);
  if (existsSync(checksumPath)) {
    entry.sha256Url = publicUrl(versionPrefix, `${name}.sha256`);
  }
  return entry;
}

function uploadAsset(name) {
  upload(join(releaseRoot, name), `${versionPrefix}/${name}`, contentType(name), "public, max-age=31536000, immutable");
}

function listFiles(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  visit(root);
  files.sort();
  return files;
}

function uploadReport(reportDirectory) {
  const files = listFiles(reportRoot);
  if (files.length === 0) {
    throw new Error(`expected ${platform} release report files in ${reportRoot}`);
  }
  const reportPrefix = `${versionPrefix}/report/${reportDirectory}`;
  for (const file of files) {
    const relativePath = normalizePath(relative(reportRoot, file));
    upload(file, `${reportPrefix}/${relativePath}`, contentType(file), "public, max-age=31536000, immutable");
  }
  return {
    fileCount: files.length,
    type: "directory",
    url: `${publicOrigin}/${reportPrefix}/`,
  };
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0 || value == null) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

const platform = required("RELEASE_PLATFORM");
const releaseChannel = required("RELEASE_CHANNEL");
const releaseVersion = required("RELEASE_VERSION");
const bucket = required("CLOUDFLARE_R2_RELEASES_BUCKET");
const endpointUrl = required("CLOUDFLARE_R2_RELEASES_URL").replace(/\/+$/, "");
const publicOrigin = required("CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN").replace(/\/+$/, "");
const runnerTemp = required("RUNNER_TEMP");
const assetVersionSuffix = optional("ASSET_VERSION_SUFFIX");
const versionPrefix = optional("RELEASE_VERSION_PREFIX", `${releaseChannel}/versions/${releaseVersion}${assetVersionSuffix}`);
const latestPrefix = `${releaseChannel}/latest`;
const releaseRoot = optional("RELEASE_ROOT", join(runnerTemp, "release-assets"));
const manifestRoot = optional("PLATFORM_MANIFEST_ROOT", join(runnerTemp, "release-platform-manifests"));

let config;
if (platform === "mac") {
  const suffix = assetVersionSuffix;
  const dmg = `open-design-${releaseVersion}${suffix}-mac-arm64.dmg`;
  const zip = `open-design-${releaseVersion}${suffix}-mac-arm64.zip`;
  const artifactMode = optional("MAC_ARTIFACT_MODE", "dmg-and-zip");
  const artifacts = { dmg: fileEntry(dmg, contentType(dmg)) };
  const assetNames = [dmg, `${dmg}.sha256`];
  let feed = null;
  if (artifactMode !== "dmg-only") {
    artifacts.zip = fileEntry(zip, contentType(zip));
    assetNames.push(zip, `${zip}.sha256`, "latest-mac.yml");
    feed = {
      latestUrl: publicUrl(latestPrefix, "latest-mac.yml"),
      name: "latest-mac.yml",
      url: publicUrl(versionPrefix, "latest-mac.yml"),
    };
  }
  config = {
    arch: "arm64",
    artifactMode,
    artifacts,
    assetNames,
    feed,
    key: "mac",
    label: "macOS arm64",
    reportDirectory: "mac",
    signed: bool("RELEASE_SIGNED"),
  };
} else if (platform === "win") {
  const suffix = optional("WIN_ASSET_SUFFIX", assetVersionSuffix);
  const installer = `open-design-${releaseVersion}${suffix}-win-x64-setup.exe`;
  config = {
    arch: "x64",
    artifacts: { installer: fileEntry(installer, contentType(installer)) },
    assetNames: [installer, `${installer}.sha256`, "latest.yml"],
    feed: {
      latestUrl: publicUrl(latestPrefix, "latest.yml"),
      name: "latest.yml",
      url: publicUrl(versionPrefix, "latest.yml"),
    },
    key: "win",
    label: "Windows x64",
    reportDirectory: "win",
    signed: false,
  };
} else if (platform === "linux") {
  const suffix = optional("LINUX_ASSET_SUFFIX", assetVersionSuffix);
  const appImage = `open-design-${releaseVersion}${suffix}-linux-x64.AppImage`;
  config = {
    arch: "x64",
    artifacts: { appImage: fileEntry(appImage, contentType(appImage)) },
    assetNames: [appImage, `${appImage}.sha256`],
    feed: null,
    key: "linux",
    label: "Linux x64",
    reportDirectory: "linux",
    signed: false,
  };
} else if (platform === "mac-intel") {
  const suffix = optional("MAC_INTEL_ASSET_SUFFIX", assetVersionSuffix);
  const dmg = `open-design-${releaseVersion}${suffix}-mac-x64.dmg`;
  const zip = `open-design-${releaseVersion}${suffix}-mac-x64.zip`;
  config = {
    arch: "x64",
    artifacts: {
      dmg: fileEntry(dmg, contentType(dmg)),
      zip: fileEntry(zip, contentType(zip)),
    },
    assetNames: [dmg, `${dmg}.sha256`, zip, `${zip}.sha256`],
    feed: null,
    key: "macIntel",
    label: "macOS x64 (Intel)",
    reportDirectory: null,
    signed: bool("MAC_INTEL_SIGNED"),
  };
} else {
  throw new Error(`unsupported RELEASE_PLATFORM: ${platform}`);
}

const reportRoot = optional(
  "REPORT_ROOT",
  config.reportDirectory == null ? join(runnerTemp, "release-report", config.key) : join(runnerTemp, "release-report", config.reportDirectory),
);

for (const name of config.assetNames) {
  uploadAsset(name);
  if (name === "latest.yml" || name === "latest-mac.yml") {
    upload(join(releaseRoot, name), `${latestPrefix}/${name}`, contentType(name), "public, max-age=60, must-revalidate");
  }
}

const report = config.reportDirectory == null ? null : uploadReport(config.reportDirectory);
const now = new Date().toISOString();
const versionManifestUrl = publicUrl(versionPrefix, `platforms/${config.key}.json`);
const latestManifestUrl = publicUrl(latestPrefix, `platforms/${config.key}.json`);
const manifest = {
  arch: config.arch,
  artifacts: config.artifacts,
  channel: releaseChannel,
  enabled: true,
  feed: config.feed,
  generatedAt: now,
  github: {
    branch: process.env.GITHUB_REF_NAME ?? "",
    commit: process.env.GITHUB_SHA ?? "",
    repository: process.env.GITHUB_REPOSITORY ?? "",
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? "0"),
    runId: Number(process.env.GITHUB_RUN_ID ?? "0"),
    workflow: process.env.GITHUB_WORKFLOW ?? "",
  },
  label: config.label,
  platform,
  platformKey: config.key,
  r2: {
    latestManifestUrl,
    latestPrefix,
    publicOrigin,
    versionManifestUrl,
    versionPrefix,
  },
  releaseVersion,
  report,
  signed: config.signed,
  status: "published",
  version: 1,
};

mkdirSync(manifestRoot, { recursive: true });
const manifestPath = join(manifestRoot, `${config.key}.json`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
upload(manifestPath, `${versionPrefix}/platforms/${config.key}.json`, "application/json; charset=utf-8", "public, max-age=31536000, immutable");
upload(manifestPath, `${latestPrefix}/platforms/${config.key}.json`, "application/json; charset=utf-8", "public, max-age=60, must-revalidate");

setOutput("platform_manifest_url", versionManifestUrl);
setOutput("platform_latest_manifest_url", latestManifestUrl);
for (const [artifactName, artifact] of Object.entries(config.artifacts)) {
  setOutput(`${artifactName}_url`, artifact.url);
}
if (config.feed != null) {
  setOutput("feed_url", config.feed.latestUrl);
}
if (report != null) {
  setOutput("report_url", report.url);
}

console.log(`published ${config.label} beta assets to ${versionPrefix}`);
