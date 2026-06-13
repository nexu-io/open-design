import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { uploadS3Object } from "./s3-upload.ts";

type AssetEntry = {
  contentType: string;
  name: string;
  sha256Url?: string;
  size: number;
  url: string;
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

async function upload(filePath, objectKey, type, cacheControl) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`expected upload file not found: ${filePath}`);
  }
  await uploadS3Object({
    accessKeyId,
    bodyPath: filePath,
    bucket,
    cacheControl,
    contentType: type,
    endpointUrl,
    objectKey,
    region,
    secretAccessKey,
    sessionToken,
  });
}

function fileEntry(name, type): AssetEntry {
  const filePath = join(releaseRoot, name);
  const size = statSync(filePath).size;
  const entry: AssetEntry = {
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

async function uploadAsset(name) {
  await upload(join(releaseRoot, name), `${versionPrefix}/${name}`, contentType(name), "public, max-age=31536000, immutable");
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

async function uploadReport(reportDirectory) {
  const files = listFiles(reportRoot);
  if (files.length === 0) {
    throw new Error(`expected ${platform} release report files in ${reportRoot}`);
  }
  const reportPrefix = `${versionPrefix}/report/${reportDirectory}`;
  for (const file of files) {
    const relativePath = normalizePath(relative(reportRoot, file));
    await upload(file, `${reportPrefix}/${relativePath}`, contentType(file), "public, max-age=31536000, immutable");
  }
  createReportZip(reportRoot, reportZipPath);
  await upload(reportZipPath, `${reportPrefix}/report.zip`, "application/zip", "public, max-age=31536000, immutable");
  const reportJsonPath = join(reportRoot, "report.json");
  const reportJson = existsSync(reportJsonPath) && statSync(reportJsonPath).isFile()
    ? {
        contentType: "application/json; charset=utf-8",
        name: "report.json",
        size: statSync(reportJsonPath).size,
        url: `${publicOrigin}/${reportPrefix}/report.json`,
      }
    : null;
  const zip = {
    contentType: "application/zip",
    name: "report.zip",
    size: statSync(reportZipPath).size,
    url: `${publicOrigin}/${reportPrefix}/report.zip`,
  };
  return {
    fileCount: files.length,
    json: reportJson,
    jsonUrl: reportJson?.url ?? null,
    type: "directory",
    url: `${publicOrigin}/${reportPrefix}/`,
    zip,
    zipUrl: zip.url,
  };
}

function createReportZip(root, zipPath) {
  mkdirSync(dirname(zipPath), { recursive: true });
  rmSync(zipPath, { force: true });
  const result = spawnSync("zip", ["-qr", zipPath, "."], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error != null) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`zip failed with exit code ${result.status}`);
  }
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0 || value == null) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

const platform = required("RELEASE_PLATFORM");
const releaseChannel = required("RELEASE_CHANNEL");
const releaseVersion = required("RELEASE_VERSION");
const accessKeyId = required("AWS_ACCESS_KEY_ID");
const bucket = required("CLOUDFLARE_R2_RELEASES_BUCKET");
const endpointUrl = required("CLOUDFLARE_R2_RELEASES_URL").replace(/\/+$/, "");
const publicOrigin = required("CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN").replace(/\/+$/, "");
const region = required("AWS_DEFAULT_REGION");
const runnerTemp = required("RUNNER_TEMP");
const secretAccessKey = required("AWS_SECRET_ACCESS_KEY");
const sessionToken = optional("AWS_SESSION_TOKEN");
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
  const artifacts: Record<string, AssetEntry> = { dmg: fileEntry(dmg, contentType(dmg)) };
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
  const portableZip = `open-design-${releaseVersion}${suffix}-win-x64-portable.zip`;
  const includeZip = optional("WIN_INCLUDE_ZIP", "true") !== "false";
  const artifacts: Record<string, AssetEntry> = { installer: fileEntry(installer, contentType(installer)) };
  const assetNames = [installer, `${installer}.sha256`, "latest.yml"];
  if (includeZip) {
    artifacts.portableZip = fileEntry(portableZip, contentType(portableZip));
    assetNames.push(portableZip, `${portableZip}.sha256`);
  }
  config = {
    arch: "x64",
    artifacts,
    assetNames,
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
const reportZipPath = optional(
  "REPORT_ZIP_PATH",
  config.reportDirectory == null ? join(runnerTemp, "release-report", `${config.key}-report.zip`) : join(runnerTemp, "release-report", `${config.reportDirectory}-report.zip`),
);

for (const name of config.assetNames) {
  await uploadAsset(name);
  if (name === "latest.yml" || name === "latest-mac.yml") {
    await upload(join(releaseRoot, name), `${latestPrefix}/${name}`, contentType(name), "public, max-age=60, must-revalidate");
  }
}

const report = config.reportDirectory == null ? null : await uploadReport(config.reportDirectory);
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
await upload(manifestPath, `${versionPrefix}/platforms/${config.key}.json`, "application/json; charset=utf-8", "public, max-age=31536000, immutable");
await upload(manifestPath, `${latestPrefix}/platforms/${config.key}.json`, "application/json; charset=utf-8", "public, max-age=60, must-revalidate");

setOutput("platform_manifest_url", versionManifestUrl);
setOutput("platform_latest_manifest_url", latestManifestUrl);
for (const [artifactName, artifact] of Object.entries(config.artifacts as Record<string, AssetEntry>)) {
  setOutput(`${artifactName}_url`, artifact.url);
}
if (config.feed != null) {
  setOutput("feed_url", config.feed.latestUrl);
}
if (report != null) {
  setOutput("report_url", report.url);
}

console.log(`published ${config.label} beta assets to ${versionPrefix}`);
