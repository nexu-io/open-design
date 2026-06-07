import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import {
  bool,
  contentType,
  githubInfo,
  optional,
  publicUrl,
  required,
  requiredTarget,
  storageConfigFromEnv,
  writeJson,
} from "./common.ts";
import { assertCurrentVersionReservation, versionLockObjectKey } from "./beta-version-reservation.ts";
import { putStorageObject } from "./s3-upload.ts";

type AssetEntry = {
  contentType: string;
  name: string;
  sha256Url?: string;
  size: number;
  url: string;
};

type TargetConfig = {
  arch: "arm64" | "x64";
  assetNames: string[];
  artifacts: Record<string, AssetEntry>;
  feed: { latestUrl: string; name: string; url: string } | null;
  label: string;
  legacyPlatformKey: "mac" | "macIntel" | "win" | "linux";
  platform: "mac" | "win" | "linux";
  reportDirectory: string | null;
  signed: boolean;
};

const target = requiredTarget();
const releaseChannel = required("RELEASE_CHANNEL");
const releaseVersion = required("RELEASE_VERSION");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const releaseAssetsDir = required("RELEASE_ASSETS_DIR");
const manifestDir = required("RELEASE_MANIFEST_DIR");
const outputsPath = required("RELEASE_OUTPUTS_PATH");
const storage = storageConfigFromEnv();
const assetSuffix = optional("RELEASE_ASSET_SUFFIX");
const versionPrefix = optional("RELEASE_VERSION_PREFIX", `${releaseChannel}/versions/${releaseVersion}${assetSuffix}`);
const latestPrefix = `${releaseChannel}/latest`;
const reportRoot = optional("RELEASE_REPORT_DIR");
const reportZipPath = optional("RELEASE_REPORT_ZIP_PATH");
const versionLockRequired = bool("RELEASE_VERSION_LOCK_REQUIRED");
const versionLockKey = optional("RELEASE_VERSION_LOCK_KEY", versionLockObjectKey(releaseVersion));

if (versionLockRequired) {
  await assertCurrentVersionReservation(storage, releaseVersion, versionLockKey);
  console.log(`verified beta version reservation ${versionLockKey}`);
}

function assetEntry(name: string): AssetEntry {
  const path = join(releaseAssetsDir, name);
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`expected release asset not found: ${path}`);
  }
  const entry: AssetEntry = {
    contentType: contentType(name),
    name,
    size: statSync(path).size,
    url: publicUrl(publicOrigin, versionPrefix, name),
  };
  if (existsSync(`${path}.sha256`)) {
    entry.sha256Url = publicUrl(publicOrigin, versionPrefix, `${name}.sha256`);
  }
  return entry;
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function listFiles(root: string): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
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

function createReportZip(root: string, zipPath: string): void {
  mkdirSync(dirname(zipPath), { recursive: true });
  rmSync(zipPath, { force: true });
  const result = spawnSync("zip", ["-qr", zipPath, "."], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error != null) throw result.error;
  if (result.status !== 0) throw new Error(`zip failed with exit code ${result.status}`);
}

async function upload(path: string, objectKey: string, cacheControl: string): Promise<void> {
  await putStorageObject({
    ...storage,
    bodyPath: path,
    cacheControl,
    contentType: contentType(path),
    objectKey,
  });
}

async function uploadReport(reportDirectory: string): Promise<Record<string, unknown> | null> {
  if (reportRoot.length === 0) return null;
  const files = listFiles(reportRoot);
  if (files.length === 0) return null;

  const reportPrefix = `${versionPrefix}/report/${reportDirectory}`;
  for (const file of files) {
    const relativePath = normalizePath(relative(reportRoot, file));
    await upload(file, `${reportPrefix}/${relativePath}`, "public, max-age=31536000, immutable");
  }
  if (reportZipPath.length > 0) {
    createReportZip(reportRoot, reportZipPath);
    await upload(reportZipPath, `${reportPrefix}/report.zip`, "public, max-age=31536000, immutable");
  }
  const reportJsonPath = join(reportRoot, "report.json");
  const reportJson = existsSync(reportJsonPath) && statSync(reportJsonPath).isFile()
    ? {
        contentType: "application/json; charset=utf-8",
        name: "report.json",
        size: statSync(reportJsonPath).size,
        url: `${publicOrigin}/${reportPrefix}/report.json`,
      }
    : null;
  const zip = reportZipPath.length > 0 && existsSync(reportZipPath)
    ? {
        contentType: "application/zip",
        name: "report.zip",
        size: statSync(reportZipPath).size,
        url: `${publicOrigin}/${reportPrefix}/report.zip`,
      }
    : null;
  return {
    fileCount: files.length,
    json: reportJson,
    jsonUrl: reportJson?.url ?? null,
    type: "directory",
    url: `${publicOrigin}/${reportPrefix}/`,
    zip,
    zipUrl: zip?.url ?? null,
  };
}

function targetConfig(): TargetConfig {
  if (target === "mac_arm64" || target === "mac_x64") {
    const arch = target === "mac_arm64" ? "arm64" : "x64";
    const dmg = `open-design-${releaseVersion}${assetSuffix}-mac-${arch}.dmg`;
    const zip = `open-design-${releaseVersion}${assetSuffix}-mac-${arch}.zip`;
    const artifactMode = optional("RELEASE_ARTIFACT_MODE", target === "mac_arm64" ? "dmg-only" : "dmg-and-zip");
    const artifacts: Record<string, AssetEntry> = { dmg: assetEntry(dmg) };
    const assetNames = [dmg, `${dmg}.sha256`];
    let feed = null;
    if (artifactMode === "dmg-and-payload" || artifactMode === "all") {
      const payload = `open-design-${releaseVersion}${assetSuffix}-mac-${arch}-payload.zip`;
      artifacts.payload = assetEntry(payload);
      assetNames.push(payload, `${payload}.sha256`);
    }
    if (artifactMode === "dmg-and-zip" || artifactMode === "all") {
      artifacts.zip = assetEntry(zip);
      assetNames.push(zip, `${zip}.sha256`, "latest-mac.yml");
      feed = {
        latestUrl: publicUrl(publicOrigin, latestPrefix, "latest-mac.yml"),
        name: "latest-mac.yml",
        url: publicUrl(publicOrigin, versionPrefix, "latest-mac.yml"),
      };
    }
    return {
      arch,
      assetNames,
      artifacts,
      feed,
      label: target === "mac_arm64" ? "macOS arm64" : "macOS x64",
      legacyPlatformKey: target === "mac_arm64" ? "mac" : "macIntel",
      platform: "mac",
      reportDirectory: target,
      signed: bool("RELEASE_SIGNED"),
    };
  }
  if (target === "win_x64") {
    const installer = `open-design-${releaseVersion}${assetSuffix}-win-x64-setup.exe`;
    const payload = `open-design-${releaseVersion}${assetSuffix}-win-x64-payload.7z`;
    const portableZip = `open-design-${releaseVersion}${assetSuffix}-win-x64-portable.zip`;
    const includeZip = optional("WIN_INCLUDE_ZIP", "true") !== "false";
    const artifacts: Record<string, AssetEntry> = { installer: assetEntry(installer), payload: assetEntry(payload) };
    const assetNames = [installer, `${installer}.sha256`, payload, `${payload}.sha256`, "latest.yml"];
    if (includeZip) {
      artifacts.portableZip = assetEntry(portableZip);
      assetNames.push(portableZip, `${portableZip}.sha256`);
    }
    return {
      arch: "x64",
      assetNames,
      artifacts,
      feed: {
        latestUrl: publicUrl(publicOrigin, latestPrefix, "latest.yml"),
        name: "latest.yml",
        url: publicUrl(publicOrigin, versionPrefix, "latest.yml"),
      },
      label: "Windows x64",
      legacyPlatformKey: "win",
      platform: "win",
      reportDirectory: target,
      signed: bool("RELEASE_SIGNED"),
    };
  }

  const appImage = `open-design-${releaseVersion}${assetSuffix}-linux-x64.AppImage`;
  return {
    arch: "x64",
    assetNames: [appImage, `${appImage}.sha256`],
    artifacts: { appImage: assetEntry(appImage) },
    feed: null,
    label: "Linux x64",
    legacyPlatformKey: "linux",
    platform: "linux",
    reportDirectory: target,
    signed: false,
  };
}

const config = targetConfig();
for (const name of config.assetNames) {
  await upload(join(releaseAssetsDir, name), `${versionPrefix}/${name}`, "public, max-age=31536000, immutable");
}

const report = config.reportDirectory == null ? null : await uploadReport(config.reportDirectory);
const versionManifestUrl = publicUrl(publicOrigin, versionPrefix, `platforms/${target}.json`);
const latestManifestUrl = publicUrl(publicOrigin, latestPrefix, `platforms/${target}.json`);
const manifest = {
  arch: config.arch,
  artifacts: config.artifacts,
  channel: releaseChannel,
  enabled: true,
  feed: config.feed,
  generatedAt: new Date().toISOString(),
  github: githubInfo(),
  label: config.label,
  legacyPlatformKey: config.legacyPlatformKey,
  platform: config.platform,
  platformKey: target,
  releaseTarget: target,
  report,
  r2: {
    latestManifestUrl,
    latestPrefix,
    publicOrigin,
    versionManifestUrl,
    versionPrefix,
  },
  releaseVersion,
  signed: config.signed,
  status: "published",
  version: 1,
};

mkdirSync(manifestDir, { recursive: true });
const manifestPath = join(manifestDir, `${target}.json`);
writeJson(manifestPath, manifest);
await upload(manifestPath, `${versionPrefix}/platforms/${target}.json`, "public, max-age=31536000, immutable");

const outputs: Record<string, string> = {
  platform_latest_manifest_url: latestManifestUrl,
  platform_manifest_path: manifestPath,
  platform_manifest_url: versionManifestUrl,
  release_target: target,
};
for (const [artifactName, artifact] of Object.entries(config.artifacts)) {
  outputs[`${artifactName}_url`] = artifact.url;
}
if (config.feed != null) outputs.feed_url = config.feed.latestUrl;
if (report != null && typeof report.url === "string") outputs.report_url = report.url;
writeJson(outputsPath, outputs);

writeFileSync(
  optional("RELEASE_SUMMARY_PATH", join(dirname(outputsPath), `${target}-publish-summary.md`)),
  [
    `## ${config.label} beta publish`,
    "",
    `- target: \`${target}\``,
    `- version: \`${releaseVersion}\``,
    `- signed: \`${config.signed}\``,
    `- manifest: ${versionManifestUrl}`,
  ].join("\n") + "\n",
  "utf8",
);

console.log(`published ${config.label} beta assets to ${versionPrefix}`);
