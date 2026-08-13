import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
import { putImmutableStorageObject } from "./s3-upload.ts";
import {
  parseReleaseVersion,
  releaseChannelDescriptor,
  releasePlatformManifestObjectKey,
  releaseShellPrefix,
  releaseVersionPrefix,
} from "@open-design/release";
import {
  releaseParameterMatrixFromEnv,
  signModeForTarget,
  type PlatformSignMode,
} from "../channel/parameter-matrix.ts";

type AssetEntry = {
  contentType: string;
  digest: `sha256:${string}`;
  name: string;
  sha256Url?: string;
  size: number;
  url: string;
};

type ShellBuildArtifact = {
  digest: `sha256:${string}`;
  path: string;
  size: number;
};

type ShellRemoteArtifact = AssetEntry & {
  objectKey: string;
};

type ShellBuildReport = {
  artifacts: Record<string, ShellBuildArtifact | null>;
  resolution?: {
    artifacts: Record<string, ShellRemoteArtifact>;
    createdAt: string;
    recordUrl: string;
    state: "registered" | "reused";
  };
  shell: {
    buildDigest: `sha256:${string}`;
    capabilityDigest: `sha256:${string}`;
    carrierDigest: `sha256:${string}`;
    depsDigest: `sha256:${string}`;
    sourceDigest: `sha256:${string}`;
    type: string;
    version: string;
  };
};

type TargetConfig = {
  arch: "arm64" | "x64";
  assetNames: string[];
  artifacts: Record<string, AssetEntry>;
  feed: { latestUrl: string; name: string; url: string } | null;
  label: string;
  legacyPlatformKey: "mac" | "macIntel" | "win";
  platform: "mac" | "win";
  reportDirectory: string | null;
  signMode: PlatformSignMode;
};

const target = requiredTarget();
const releaseChannel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
const countedReleaseChannel = releaseChannel === "stable" ? null : releaseChannel;
const releaseVersion = required("RELEASE_VERSION");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const releaseAssetsDir = required("RELEASE_ASSETS_DIR");
const manifestDir = required("RELEASE_MANIFEST_DIR");
const outputsPath = required("RELEASE_OUTPUTS_PATH");
const assetSuffix = optional("RELEASE_ASSET_SUFFIX");
const dryRunMode = optional("RELEASE_DRY_RUN_MODE");
const publishSideEffectsEnabled = optional("RELEASE_PUBLISH_SIDE_EFFECTS", "true") !== "false";
const versionPrefix = releaseVersionPrefix(releaseChannel, releaseVersion);
const requestedVersionPrefix = optional("RELEASE_VERSION_PREFIX");
if (requestedVersionPrefix.length > 0 && requestedVersionPrefix !== versionPrefix) {
  throw new Error(`RELEASE_VERSION_PREFIX must be ${versionPrefix}; got ${requestedVersionPrefix}`);
}
const shellEnabled = bool("RELEASE_SHELL_ENABLED");
const shellBuildJsonPath = optional("RELEASE_SHELL_BUILD_JSON_PATH");
const latestPrefix = `${releaseChannel}/latest`;
const reportRoot = optional("RELEASE_REPORT_DIR");
const reportZipPath = optional("RELEASE_REPORT_ZIP_PATH");
const versionLockRequired = bool("RELEASE_VERSION_LOCK_REQUIRED");
const versionLockKey = optional(
  "RELEASE_VERSION_LOCK_KEY",
  countedReleaseChannel == null ? "" : versionLockObjectKey(releaseVersion, countedReleaseChannel),
);
const storage = publishSideEffectsEnabled || versionLockRequired ? storageConfigFromEnv() : null;
const parameterMatrix = releaseParameterMatrixFromEnv();

function readShellBuildReport(): ShellBuildReport | null {
  if (!shellEnabled) return null;
  if (shellBuildJsonPath.length === 0 || !existsSync(shellBuildJsonPath)) {
    throw new Error("RELEASE_SHELL_ENABLED requires RELEASE_SHELL_BUILD_JSON_PATH");
  }
  const report = JSON.parse(readFileSync(shellBuildJsonPath, "utf8")) as Partial<ShellBuildReport>;
  const shell = report.shell;
  if (shell == null || shell.type !== "electron") throw new Error("Shell build report must describe electron");
  parseReleaseVersion(String(shell.version), releaseChannel);
  if (!/^sha256:[0-9a-f]{64}$/.test(String(shell.sourceDigest))) {
    throw new Error("Shell build report sourceDigest must be a lowercase sha256 digest");
  }
  if (
    !/^sha256:[0-9a-f]{64}$/.test(String(shell.buildDigest))
    || !/^sha256:[0-9a-f]{64}$/.test(String(shell.capabilityDigest))
    || !/^sha256:[0-9a-f]{64}$/.test(String(shell.carrierDigest))
    || !/^sha256:[0-9a-f]{64}$/.test(String(shell.depsDigest))
  ) {
    throw new Error("Shell build report identity fields must be lowercase sha256 digests");
  }
  if (report.artifacts == null || typeof report.artifacts !== "object") {
    throw new Error("Shell build report must contain artifact descriptors");
  }
  if (report.resolution != null) {
    if (
      report.resolution.state !== "registered"
      && report.resolution.state !== "reused"
    ) throw new Error("Shell build report resolution state is invalid");
    if (typeof report.resolution.recordUrl !== "string" || report.resolution.recordUrl.length === 0) {
      throw new Error("Shell build report resolution recordUrl is required");
    }
    if (report.resolution.artifacts == null || typeof report.resolution.artifacts !== "object") {
      throw new Error("Shell build report resolution artifacts are required");
    }
    if (
      typeof report.resolution.createdAt !== "string"
      || !Number.isFinite(Date.parse(report.resolution.createdAt))
    ) throw new Error("Shell build report resolution createdAt is required");
  }
  return report as ShellBuildReport;
}

const shellBuild = readShellBuildReport();
const shellVersionPrefix = shellBuild == null
  ? null
  : releaseShellPrefix(releaseChannel, releaseVersion, target, shellBuild.shell.type);
const requestedShellVersionPrefix = optional("RELEASE_SHELL_VERSION_PREFIX");
if (
  shellVersionPrefix != null
  && requestedShellVersionPrefix.length > 0
  && requestedShellVersionPrefix !== shellVersionPrefix
) {
  throw new Error(`RELEASE_SHELL_VERSION_PREFIX must be ${shellVersionPrefix}; got ${requestedShellVersionPrefix}`);
}
const artifactPrefix = shellVersionPrefix ?? versionPrefix;

if (versionLockRequired) {
  if (countedReleaseChannel == null) {
    throw new Error("stable releases do not use counted version reservations");
  }
  if (storage == null) throw new Error("storage config is required for version reservation validation");
  await assertCurrentVersionReservation(storage, releaseVersion, versionLockKey, countedReleaseChannel);
  console.log(`verified ${countedReleaseChannel} version reservation ${versionLockKey}`);
}

function assetEntry(name: string, prefix = artifactPrefix): AssetEntry {
  const path = join(releaseAssetsDir, name);
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`expected release asset not found: ${path}`);
  }
  const entry: AssetEntry = {
    contentType: contentType(name),
    digest: sha256Digest(path),
    name,
    size: statSync(path).size,
    url: publicUrl(publicOrigin, prefix, name),
  };
  if (existsSync(`${path}.sha256`)) {
    entry.sha256Url = publicUrl(publicOrigin, prefix, `${name}.sha256`);
  }
  return entry;
}

function sha256Digest(path: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
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

async function uploadImmutable(path: string, objectKey: string): Promise<void> {
  if (!publishSideEffectsEnabled) {
    console.log(`[dry-run:${dryRunMode || "plan"}] would upload immutable ${path} to ${objectKey}`);
    return;
  }
  if (storage == null) throw new Error("storage config is required to upload immutable release assets");
  await putImmutableStorageObject({
    ...storage,
    bodyPath: path,
    cacheControl: "public, max-age=31536000, immutable",
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
    await uploadImmutable(file, `${reportPrefix}/${relativePath}`);
  }
  if (reportZipPath.length > 0) {
    createReportZip(reportRoot, reportZipPath);
    await uploadImmutable(reportZipPath, `${reportPrefix}/report.zip`);
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
  const signMode = signModeForTarget(target, parameterMatrix);
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
        url: publicUrl(publicOrigin, artifactPrefix, "latest-mac.yml"),
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
      signMode,
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
        url: publicUrl(publicOrigin, artifactPrefix, "latest.yml"),
      },
      label: "Windows x64",
      legacyPlatformKey: "win",
      platform: "win",
      reportDirectory: target,
      signMode,
    };
  }

  throw new Error(`unsupported release target: ${target}`);
}

const config = targetConfig();
const preparedShellArtifacts = { ...config.artifacts };
if (shellBuild != null) {
  for (const [name, artifact] of Object.entries(config.artifacts)) {
    const built = shellBuild.artifacts[name];
    if (built == null) throw new Error(`Shell build report is missing ${name}`);
    if (built.digest !== artifact.digest || built.size !== artifact.size) {
      throw new Error(`Shell build report ${name} does not match prepared release asset`);
    }
    const remote = shellBuild.resolution?.artifacts[name];
    if (shellBuild.resolution != null && remote == null) {
      throw new Error(`Shell build resolution is missing ${name}`);
    }
    if (remote != null) {
      if (
        remote.digest !== artifact.digest
        || remote.size !== artifact.size
        || typeof remote.contentType !== "string"
        || typeof remote.name !== "string"
        || typeof remote.objectKey !== "string"
        || typeof remote.url !== "string"
      ) throw new Error(`Shell build resolution ${name} does not match prepared release asset`);
    }
    const publishedName = basename(built.path);
    config.artifacts[name] = {
      contentType: contentType(publishedName),
      digest: built.digest,
      name: publishedName,
      size: built.size,
      url: publicUrl(publicOrigin, artifactPrefix, publishedName),
    };
  }
}

function prepareResolvedShellFeed(): void {
  if (shellBuild?.resolution == null || config.feed == null) return;
  const kind = config.platform === "mac" ? "zip" : "installer";
  const prepared = preparedShellArtifacts[kind];
  const remote = config.artifacts[kind];
  if (prepared == null || remote == null) throw new Error(`resolved Shell updater feed requires ${kind}`);
  const path = join(releaseAssetsDir, prepared.name);
  const sha512 = createHash("sha512").update(readFileSync(path)).digest("base64");
  const quoted = (value: string): string => JSON.stringify(value);
  writeFileSync(join(releaseAssetsDir, config.feed.name), [
    `version: ${quoted(shellBuild.shell.version)}`,
    "files:",
    `  - url: ${quoted(remote.url)}`,
    `    sha512: ${quoted(sha512)}`,
    `    size: ${remote.size}`,
    `path: ${quoted(remote.url)}`,
    `sha512: ${quoted(sha512)}`,
    `releaseDate: ${quoted(shellBuild.resolution.createdAt)}`,
    `releaseNotes: ${quoted(`Open Design Shell ${shellBuild.shell.version}`)}`,
  ].join("\n") + "\n", "utf8");
}

prepareResolvedShellFeed();
if (shellBuild == null) {
  for (const name of config.assetNames) {
    await uploadImmutable(join(releaseAssetsDir, name), `${artifactPrefix}/${name}`);
  }
} else {
  for (const [kind, artifact] of Object.entries(config.artifacts)) {
    const built = shellBuild.artifacts[kind];
    if (built == null) throw new Error(`Shell build report is missing ${kind}`);
    await uploadImmutable(built.path, `${artifactPrefix}/${artifact.name}`);
  }
  if (config.feed != null) {
    await uploadImmutable(
      join(releaseAssetsDir, config.feed.name),
      `${artifactPrefix}/${config.feed.name}`,
    );
  }
}
const report = config.reportDirectory == null ? null : await uploadReport(config.reportDirectory);
const versionManifestKey = releasePlatformManifestObjectKey(releaseChannel, releaseVersion, target);
const versionManifestUrl = publicUrl(publicOrigin, "", versionManifestKey);
const latestManifestUrl = publicUrl(publicOrigin, latestPrefix, `platforms/${target}.json`);
const manifest = {
  amrProfile: optional("OPEN_DESIGN_AMR_PROFILE"),
  arch: config.arch,
  artifacts: config.artifacts,
  channel: releaseChannel,
  enabled: true,
  feed: config.feed,
  generatedAt: new Date().toISOString(),
  github: githubInfo(),
  dryRun: !publishSideEffectsEnabled,
  dryRunMode,
  label: config.label,
  legacyPlatformKey: config.legacyPlatformKey,
  platform: config.platform,
  platformKey: target,
  releaseTarget: target,
  report,
  r2: {
    artifactPrefix,
    latestManifestUrl,
    latestPrefix,
    publicOrigin,
    versionManifestUrl,
    versionPrefix,
  },
  releaseVersion,
  ...(shellBuild == null ? {} : {
    shell: {
      artifacts: config.artifacts,
      ...(shellBuild.resolution == null ? {} : {
        buildRecordUrl: shellBuild.resolution.recordUrl,
        resolution: shellBuild.resolution.state,
      }),
      buildDigest: shellBuild.shell.buildDigest,
      capabilityDigest: shellBuild.shell.capabilityDigest,
      carrierDigest: shellBuild.shell.carrierDigest,
      depsDigest: shellBuild.shell.depsDigest,
      sourceDigest: shellBuild.shell.sourceDigest,
      type: shellBuild.shell.type,
      version: shellBuild.shell.version,
    },
  }),
  signMode: config.signMode,
  status: "published",
  version: 1,
};

mkdirSync(manifestDir, { recursive: true });
const manifestPath = join(manifestDir, `${target}.json`);
writeJson(manifestPath, manifest);
await uploadImmutable(manifestPath, versionManifestKey);

const outputs: Record<string, string> = {
  platform_latest_manifest_url: latestManifestUrl,
  platform_manifest_path: manifestPath,
  platform_manifest_url: versionManifestUrl,
  release_target: target,
};
for (const [artifactName, artifact] of Object.entries(config.artifacts)) {
  outputs[`${artifactName}_url`] = artifact.url;
}
if (shellBuild != null && shellVersionPrefix != null) {
  outputs.shell_build_digest = shellBuild.shell.buildDigest;
  outputs.shell_capability_digest = shellBuild.shell.capabilityDigest;
  outputs.shell_carrier_digest = shellBuild.shell.carrierDigest;
  outputs.shell_deps_digest = shellBuild.shell.depsDigest;
  outputs.shell_source_digest = shellBuild.shell.sourceDigest;
  outputs.shell_version = shellBuild.shell.version;
  outputs.shell_version_prefix = shellVersionPrefix;
}
if (config.feed != null) outputs.feed_url = config.feed.latestUrl;
if (report != null && typeof report.url === "string") outputs.report_url = report.url;
writeJson(outputsPath, outputs);

writeFileSync(
  optional("RELEASE_SUMMARY_PATH", join(dirname(outputsPath), `${target}-publish-summary.md`)),
  [
    `## ${config.label} ${releaseChannel} publish`,
    "",
    `- target: \`${target}\``,
    `- version: \`${releaseVersion}\``,
    `- sign mode: \`${config.signMode}\``,
    `- manifest: ${versionManifestUrl}`,
  ].join("\n") + "\n",
  "utf8",
);

if (publishSideEffectsEnabled) {
  console.log(`published ${config.label} ${releaseChannel} assets to ${versionPrefix}`);
} else {
  console.log(`planned ${config.label} ${releaseChannel} assets for ${versionPrefix}`);
}
