import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import {
  validateClosureCandidateManifest,
  validateClosureFileInventory,
  type ClosureCandidateManifest,
} from "@open-design/closure-proto";
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
import { getStorageObject, putStorageObject, putStorageObjectWithStatus } from "./s3-upload.ts";
import { parseReleaseVersion, releaseChannelDescriptor } from "@open-design/release";

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
  signed: boolean;
};

type ClosurePublication = {
  assets: {
    archive: AssetEntry;
    inventory: AssetEntry;
    manifest: AssetEntry;
    provenance: AssetEntry;
  };
  manifest: ClosureCandidateManifest;
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
const versionPrefix = optional("RELEASE_VERSION_PREFIX", `${releaseChannel}/versions/${releaseVersion}${assetSuffix}`);
const shellEnabled = bool("RELEASE_SHELL_ENABLED");
const shellBuildJsonPath = optional("RELEASE_SHELL_BUILD_JSON_PATH");
const latestPrefix = `${releaseChannel}/latest`;
const reportRoot = optional("RELEASE_REPORT_DIR");
const reportZipPath = optional("RELEASE_REPORT_ZIP_PATH");
const versionLockRequired = bool("RELEASE_VERSION_LOCK_REQUIRED");
const closureEnabled = bool("RELEASE_CLOSURE_ENABLED");
const closureVersion = optional("RELEASE_CLOSURE_VERSION", releaseVersion);
const versionLockKey = optional(
  "RELEASE_VERSION_LOCK_KEY",
  countedReleaseChannel == null ? "" : versionLockObjectKey(releaseVersion, countedReleaseChannel),
);
const storage = publishSideEffectsEnabled || versionLockRequired ? storageConfigFromEnv() : null;

function shellPlatformTarget(): string {
  if (target === "mac_arm64") return "darwin-arm64";
  if (target === "mac_x64") return "darwin-x64";
  if (target === "win_x64") return "win32-x64";
  throw new Error(`Shell publication is not supported for ${target}`);
}

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
  : optional(
      "RELEASE_SHELL_VERSION_PREFIX",
      `${releaseChannel}/shells/${shellBuild.shell.type}/versions/${shellBuild.shell.version}/${shellPlatformTarget()}`,
    );
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

function closureTarget(): "darwin-arm64" | "win32-x64" | null {
  if (target === "mac_arm64") return "darwin-arm64";
  if (target === "win_x64") return "win32-x64";
  return null;
}

function closureAssetBase(): string {
  if (target === "mac_arm64") return `open-design-${closureVersion}-mac-arm64-closure`;
  if (target === "win_x64") return `open-design-${closureVersion}-win-x64-closure`;
  throw new Error(`Closure publication is not supported for ${target}`);
}

function closurePublication(): {
  assetNames: string[];
  publication: ClosurePublication;
  versionPrefix: string;
} | null {
  if (!closureEnabled) return null;
  const expectedPlatform = closureTarget();
  if (expectedPlatform == null) {
    throw new Error(`RELEASE_CLOSURE_ENABLED is not supported for ${target}`);
  }
  parseReleaseVersion(closureVersion, releaseChannel);
  const closureVersionPrefix = optional(
    "RELEASE_CLOSURE_VERSION_PREFIX",
    `${releaseChannel}/closure/${expectedPlatform}/versions/${closureVersion}`,
  );

  const base = closureAssetBase();
  const names = {
    archive: `${base}.zip`,
    inventory: `${base}-inventory.json`,
    manifest: `${base}-manifest.json`,
    provenance: `${base}-provenance.json`,
  } as const;
  const assets = {
    archive: assetEntry(names.archive, closureVersionPrefix),
    inventory: assetEntry(names.inventory, closureVersionPrefix),
    manifest: assetEntry(names.manifest, closureVersionPrefix),
    provenance: assetEntry(names.provenance, closureVersionPrefix),
  };
  const manifest = validateClosureCandidateManifest(
    JSON.parse(readFileSync(join(releaseAssetsDir, names.manifest), "utf8")) as unknown,
  );
  const inventory = validateClosureFileInventory(
    JSON.parse(readFileSync(join(releaseAssetsDir, names.inventory), "utf8")) as unknown,
  );
  const inventoryDigest = `sha256:${createHash("sha256").update(JSON.stringify(inventory.files)).digest("hex")}`;
  const archiveDigest = sha256Digest(join(releaseAssetsDir, names.archive));
  if (manifest.identity.channel !== releaseChannel) {
    throw new Error(`Closure channel ${manifest.identity.channel} does not match release channel ${releaseChannel}`);
  }
  if (manifest.identity.version !== closureVersion) {
    throw new Error(`Closure version ${manifest.identity.version} does not match requested Closure version ${closureVersion}`);
  }
  if (manifest.identity.platform !== expectedPlatform) {
    throw new Error(`Closure platform ${manifest.identity.platform} does not match release target ${target}`);
  }
  if (manifest.artifact.url !== assets.archive.url) {
    throw new Error(`Closure archive URL ${manifest.artifact.url} does not match published URL ${assets.archive.url}`);
  }
  if (manifest.artifact.size !== assets.archive.size) {
    throw new Error(`Closure archive size ${manifest.artifact.size} does not match published size ${assets.archive.size}`);
  }
  if (manifest.artifact.digest !== archiveDigest || manifest.identity.digest !== archiveDigest) {
    throw new Error(`Closure archive digest does not match ${names.archive}`);
  }
  if (manifest.artifact.inventoryDigest !== inventoryDigest) {
    throw new Error(`Closure inventory digest does not match ${names.inventory}`);
  }

  const provenance = JSON.parse(
    readFileSync(join(releaseAssetsDir, names.provenance), "utf8"),
  ) as Record<string, unknown>;
  const provenanceArtifact = provenance.artifact as Record<string, unknown> | null | undefined;
  if (
    provenance.schemaVersion !== 1
    || provenance.channel !== releaseChannel
    || provenance.version !== closureVersion
    || provenance.platform !== expectedPlatform
    || provenanceArtifact?.digest !== archiveDigest
    || provenanceArtifact?.inventoryDigest !== inventoryDigest
    || provenanceArtifact?.size !== assets.archive.size
  ) {
    throw new Error(`Closure provenance does not match ${target} release identity`);
  }

  return {
    assetNames: [
      names.archive,
      `${names.archive}.sha256`,
      names.inventory,
      names.manifest,
      names.provenance,
    ],
    publication: { assets, manifest },
    versionPrefix: closureVersionPrefix,
  };
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
  if (!publishSideEffectsEnabled) {
    console.log(`[dry-run:${dryRunMode || "plan"}] would upload ${path} to ${objectKey}`);
    return;
  }
  if (storage == null) throw new Error("storage config is required to upload release assets");
  await putStorageObject({
    ...storage,
    bodyPath: path,
    cacheControl,
    contentType: contentType(path),
    objectKey,
  });
}

async function uploadImmutable(path: string, objectKey: string): Promise<void> {
  if (!publishSideEffectsEnabled) {
    console.log(`[dry-run:${dryRunMode || "plan"}] would upload immutable ${path} to ${objectKey}`);
    return;
  }
  if (storage == null) throw new Error("storage config is required to upload immutable release assets");
  const result = await putStorageObjectWithStatus({
    ...storage,
    bodyPath: path,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: contentType(path),
    headers: { "if-none-match": "*" },
    objectKey,
  });
  if (result.ok) return;
  if (result.status !== 412) throw new Error(`immutable release PUT failed with HTTP ${result.status}: ${result.body}`);
  const existing = await getStorageObject({ ...storage, objectKey });
  if (existing == null) throw new Error(`immutable release object disappeared after conflict: ${objectKey}`);
  if (sha256Digest(path) !== `sha256:${createHash("sha256").update(existing.bytes).digest("hex")}`) {
    throw new Error(`immutable release object conflicts: ${objectKey}`);
  }
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
        url: publicUrl(publicOrigin, artifactPrefix, "latest.yml"),
      },
      label: "Windows x64",
      legacyPlatformKey: "win",
      platform: "win",
      reportDirectory: target,
      signed: bool("RELEASE_SIGNED"),
    };
  }

  throw new Error(`unsupported release target: ${target}`);
}

const config = targetConfig();
const closure = closurePublication();
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
      config.artifacts[name] = {
        contentType: remote.contentType,
        digest: remote.digest,
        name: remote.name,
        size: remote.size,
        url: remote.url,
      };
    }
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
if (shellBuild?.resolution == null) {
  for (const name of config.assetNames) {
    await upload(join(releaseAssetsDir, name), `${artifactPrefix}/${name}`, "public, max-age=31536000, immutable");
  }
} else if (config.feed != null) {
  await uploadImmutable(
    join(releaseAssetsDir, config.feed.name),
    `${artifactPrefix}/${config.feed.name}`,
  );
}
if (closure != null) {
  for (const name of closure.assetNames) {
    await upload(
      join(releaseAssetsDir, name),
      `${closure.versionPrefix}/${name}`,
      "public, max-age=31536000, immutable",
    );
  }
}

const report = config.reportDirectory == null ? null : await uploadReport(config.reportDirectory);
const versionManifestUrl = publicUrl(publicOrigin, versionPrefix, `platforms/${target}.json`);
const latestManifestUrl = publicUrl(publicOrigin, latestPrefix, `platforms/${target}.json`);
const manifest = {
  arch: config.arch,
  artifacts: config.artifacts,
  channel: releaseChannel,
  ...(closure == null ? {} : { closure: closure.publication }),
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
      sourceDigest: shellBuild.shell.sourceDigest,
      type: shellBuild.shell.type,
      version: shellBuild.shell.version,
    },
  }),
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
if (closure != null) {
  for (const [artifactName, artifact] of Object.entries(closure.publication.assets)) {
    outputs[`closure_${artifactName}_url`] = artifact.url;
  }
  outputs.closure_version = closureVersion;
  outputs.closure_version_prefix = closure.versionPrefix;
}
if (shellBuild != null && shellVersionPrefix != null) {
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
    `- signed: \`${config.signed}\``,
    `- manifest: ${versionManifestUrl}`,
  ].join("\n") + "\n",
  "utf8",
);

if (publishSideEffectsEnabled) {
  console.log(`published ${config.label} ${releaseChannel} assets to ${versionPrefix}`);
} else {
  console.log(`planned ${config.label} ${releaseChannel} assets for ${versionPrefix}`);
}
