import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  compareLauncherVersions,
  type LauncherChannel,
  type LauncherPaths,
  type LauncherRuntimeDescriptor,
  type LauncherVersionPaths,
  type LauncherVersionPointer,
  normalizeLauncherChannel,
  normalizeLauncherVersion,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  selectLauncherRuntimeTarget,
  validateLauncherRuntimeDescriptor,
  type LauncherAttemptDescriptor,
  type LauncherTargetSelection,
} from "@open-design/launcher-proto";
import { releaseChannelFromNamespace, releaseChannelFromVersion } from "@open-design/release";

import type { PackagedConfig, PackagedWebOutputMode, RawPackagedConfig } from "./config.js";
import type { PackagedNamespacePaths } from "./paths.js";

type LauncherPayloadManifest = {
  channel: string;
  entry: {
    cwd: string;
    executable: string;
  };
  namespace: string;
  payloadRoot: string;
  platform: "darwin" | "win32";
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  version: string;
};

export type PackagedLauncherRuntime = {
  config: PackagedConfig;
  descriptor: LauncherRuntimeDescriptor;
  electronNodeCommand: string | null;
  installedLaunchPath: string | null;
  launcherPaths: LauncherPaths;
  paths: PackagedNamespacePaths;
  selection: LauncherTargetSelection;
  source: "current-package" | "payload";
  targetVersion: string | null;
};

type LauncherInstallDescriptor = {
  channel: LauncherChannel;
  launchPath: string;
  namespace: string;
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  updatedAt?: string;
};

type LauncherCleanupDescriptor = {
  channel: LauncherChannel;
  currentVersion: string;
  namespace: string;
  updatedAt: string;
  version: 1;
  versions: LauncherCleanupEntry[];
};

type LauncherCleanupEntry = {
  generation: number;
  reason: "current-bound-package" | "older-than-bound-package";
  state: "deprecated" | "retained";
  updatedAt: string;
  version: string;
};

type ResolvedPayloadConfig = {
  config: PackagedConfig;
  electronNodeCommand: string | null;
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function inferLauncherChannel(config: Pick<PackagedConfig, "appVersion" | "namespace">): LauncherChannel {
  return releaseChannelFromVersion(config.appVersion)
    ?? releaseChannelFromNamespace(config.namespace, "default")
    ?? "stable";
}

function parsePayloadManifest(raw: unknown, expected: {
  channel: LauncherChannel;
  namespace: string;
  version: string;
}): LauncherPayloadManifest {
  if (raw == null || typeof raw !== "object") throw new Error("launcher payload manifest must be an object");
  const manifest = raw as Partial<LauncherPayloadManifest>;
  if (manifest.schemaVersion !== LAUNCHER_SCHEMA_VERSION) {
    throw new Error(`unsupported launcher payload schemaVersion: ${String(manifest.schemaVersion)}`);
  }
  if (normalizeLauncherChannel(manifest.channel) !== expected.channel) {
    throw new Error(`launcher payload channel does not match expected channel ${expected.channel}`);
  }
  if (manifest.namespace !== expected.namespace) {
    throw new Error(`launcher payload namespace does not match expected namespace ${expected.namespace}`);
  }
  if (normalizeLauncherVersion(manifest.version) !== expected.version) {
    throw new Error(`launcher payload version does not match expected version ${expected.version}`);
  }
  if (manifest.platform !== "darwin" && manifest.platform !== "win32") {
    throw new Error(`unsupported launcher payload platform: ${String(manifest.platform)}`);
  }
  if (manifest.payloadRoot !== "payload") throw new Error("launcher payload root must be payload");
  if (manifest.entry == null || typeof manifest.entry.cwd !== "string" || typeof manifest.entry.executable !== "string") {
    throw new Error("launcher payload entry must include cwd and executable");
  }
  return manifest as LauncherPayloadManifest;
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function macAppBundlePathFromExecutable(executablePath: string): string | null {
  const marker = ".app/Contents/MacOS/";
  const index = executablePath.indexOf(marker);
  if (index < 0) return null;
  return executablePath.slice(0, index + ".app".length);
}

function stableAppLaunchPathFromExecutable(executablePath: string): string {
  if (process.platform !== "darwin") return executablePath;
  return macAppBundlePathFromExecutable(executablePath) ?? executablePath;
}

async function readLauncherInstallDescriptor(
  paths: LauncherPaths,
  channel: LauncherChannel,
  namespace: string,
): Promise<LauncherInstallDescriptor | null> {
  if (!(await pathExists(paths.installPath))) return null;
  const install = await readJsonFile<LauncherInstallDescriptor>(paths.installPath);
  if (install.schemaVersion !== LAUNCHER_SCHEMA_VERSION) return null;
  if (normalizeLauncherChannel(install.channel) !== channel) return null;
  if (install.namespace !== namespace) return null;
  if (typeof install.launchPath !== "string" || install.launchPath.length === 0) return null;
  return install;
}

async function writeLauncherInstallDescriptor(
  paths: LauncherPaths,
  channel: LauncherChannel,
  namespace: string,
  launchPath: string,
): Promise<LauncherInstallDescriptor> {
  const install: LauncherInstallDescriptor = {
    channel,
    launchPath,
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(paths.installPath, install);
  return install;
}

async function readLauncherAttempt(paths: LauncherPaths, channel: LauncherChannel, namespace: string): Promise<LauncherAttemptDescriptor | null> {
  if (!(await pathExists(paths.attemptsPath))) return null;
  const attempt = await readJsonFile<LauncherAttemptDescriptor>(paths.attemptsPath);
  if (attempt.schemaVersion !== LAUNCHER_SCHEMA_VERSION) throw new Error(`unsupported launcher attempt schemaVersion: ${String(attempt.schemaVersion)}`);
  if (normalizeLauncherChannel(attempt.channel) !== channel) throw new Error(`launcher attempt channel does not match expected channel ${channel}`);
  if (attempt.namespace !== namespace) throw new Error(`launcher attempt namespace does not match expected namespace ${namespace}`);
  normalizeLauncherVersion(attempt.version);
  if (!Number.isSafeInteger(attempt.generation) || attempt.generation < 0) {
    throw new Error(`launcher attempt generation must be a non-negative safe integer: ${String(attempt.generation)}`);
  }
  return attempt;
}

async function resolveOptionalPayloadEntry(resourcesPath: string, relative: string | undefined): Promise<string | null> {
  if (relative == null || relative.length === 0) return null;
  const entry = join(resourcesPath, relative);
  return (await pathExists(entry)) ? entry : null;
}

async function resolveOptionalVersionEntry(versionRoot: string, relative: string | undefined): Promise<string | null> {
  if (relative == null || relative.length === 0) return null;
  const entry = join(versionRoot, relative);
  return (await pathExists(entry)) ? entry : null;
}

async function resolveWindowsPayloadDirectoryAlias(
  versionPaths: LauncherVersionPaths,
  kind: string,
  targetRoot: string | null,
): Promise<string | null> {
  if (targetRoot == null) return null;
  if (process.platform !== "win32") return targetRoot;

  const aliasId = createHash("sha256").update(targetRoot).digest("hex").slice(0, 16);
  const aliasRoot = join(versionPaths.root, kind, aliasId);
  if (await pathExists(aliasRoot)) return aliasRoot;

  try {
    await mkdir(dirname(aliasRoot), { recursive: true });
    await symlink(targetRoot, aliasRoot, "junction");
    return aliasRoot;
  } catch {
    return targetRoot;
  }
}

async function resolveWindowsElectronNodeCommand(versionPaths: LauncherVersionPaths, executablePath: string | null): Promise<string | null> {
  const executableRoot = executablePath == null ? null : dirname(executablePath);
  const aliasRoot = await resolveWindowsPayloadDirectoryAlias(versionPaths, "en", executableRoot);
  return executablePath == null || aliasRoot == null
    ? null
    : join(aliasRoot, basename(executablePath));
}

async function resolveWindowsWebStandaloneRoot(
  versionPaths: LauncherVersionPaths,
  platform: LauncherPayloadManifest["platform"],
  webStandaloneRoot: string | null,
): Promise<string | null> {
  return platform === "win32"
    ? await resolveWindowsPayloadDirectoryAlias(versionPaths, "ws", webStandaloneRoot)
    : webStandaloneRoot;
}

async function resolvePayloadConfig(
  config: PackagedConfig,
  versionPaths: LauncherVersionPaths,
  channel: LauncherChannel,
): Promise<ResolvedPayloadConfig | null> {
  if (!(await pathExists(versionPaths.manifestPath))) return null;
  const manifest = parsePayloadManifest(await readJsonFile<unknown>(versionPaths.manifestPath), {
    channel,
    namespace: config.namespace,
    version: versionPaths.version,
  });
  const resourcesPath = manifest.platform === "darwin"
    ? join(versionPaths.versionRoot, manifest.entry.cwd, "Contents", "Resources")
    : join(versionPaths.versionRoot, manifest.payloadRoot, "resources");
  const packagedConfigPath = join(resourcesPath, "open-design-config.json");
  if (!(await pathExists(packagedConfigPath))) return null;
  const raw = await readJsonFile<RawPackagedConfig>(packagedConfigPath);
  const webOutputMode = raw.webOutputMode === "standalone" || raw.webOutputMode === "server"
    ? raw.webOutputMode
    : config.webOutputMode;
  const resourceRoot = raw.resourceRoot == null || raw.resourceRoot.length === 0
    ? join(resourcesPath, "open-design")
    : raw.resourceRoot;
  const relativeNodeCommand =
    raw.nodeCommandRelative == null || raw.nodeCommandRelative.length === 0
      ? join("open-design", "bin", process.platform === "win32" ? "node.exe" : "node")
      : raw.nodeCommandRelative;
  const nodeCommand = await resolveOptionalPayloadEntry(resourcesPath, relativeNodeCommand);
  const electronNodeCommand = manifest.platform === "win32"
    ? await resolveWindowsElectronNodeCommand(
      versionPaths,
      await resolveOptionalVersionEntry(versionPaths.versionRoot, manifest.entry.executable),
    )
    : null;
  const rawWebStandaloneRoot = raw.webStandaloneRoot == null || raw.webStandaloneRoot.length === 0
    ? webOutputMode === "standalone" ? join(resourcesPath, "open-design-web-standalone") : null
    : raw.webStandaloneRoot;
  const webStandaloneRoot = await resolveWindowsWebStandaloneRoot(
    versionPaths,
    manifest.platform,
    rawWebStandaloneRoot,
  );
  return {
    config: {
      ...config,
      appVersion: raw.appVersion?.trim() || manifest.version,
      daemonSidecarEntry: await resolveOptionalPayloadEntry(resourcesPath, raw.daemonSidecarEntryRelative),
      nodeCommand,
      resourceRoot,
      webOutputMode: webOutputMode as PackagedWebOutputMode,
      webSidecarEntry: await resolveOptionalPayloadEntry(resourcesPath, raw.webSidecarEntryRelative),
      webStandaloneRoot,
    },
    electronNodeCommand,
  };
}

function initialRuntimeDescriptor(config: PackagedConfig, channel: LauncherChannel): LauncherRuntimeDescriptor {
  const current = config.appVersion == null
    ? null
    : { generation: 0, version: normalizeLauncherVersion(config.appVersion) };
  return {
    active: current,
    channel,
    lastSuccessful: current,
    namespace: config.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
}

async function readOrCreateRuntimeDescriptor(
  config: PackagedConfig,
  launcherPaths: LauncherPaths,
  channel: LauncherChannel,
): Promise<LauncherRuntimeDescriptor> {
  await mkdir(dirname(launcherPaths.runtimePath), { recursive: true });
  if (await pathExists(launcherPaths.runtimePath)) {
    return validateLauncherRuntimeDescriptor(
      await readJsonFile<LauncherRuntimeDescriptor>(launcherPaths.runtimePath),
      { channel, namespace: config.namespace },
    );
  }

  const descriptor = initialRuntimeDescriptor(config, channel);
  await writeFile(launcherPaths.runtimePath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
  return descriptor;
}

function maxRuntimePointer(runtime: LauncherRuntimeDescriptor): string | null {
  const pointers = [runtime.active, runtime.lastSuccessful].filter((pointer): pointer is LauncherVersionPointer => pointer != null);
  if (pointers.length === 0) return null;
  return pointers.reduce((latest, pointer) => (
    compareLauncherVersions(pointer.version, latest.version) > 0 ? pointer : latest
  )).version;
}

function cleanupEntriesForSupersededRuntime(
  runtime: LauncherRuntimeDescriptor,
  boundVersion: string,
  updatedAt: string,
): LauncherCleanupEntry[] {
  const byVersion = new Map<string, LauncherCleanupEntry>();
  for (const pointer of [runtime.active, runtime.lastSuccessful]) {
    if (pointer == null) continue;
    if (compareLauncherVersions(pointer.version, boundVersion) >= 0) continue;
    const existing = byVersion.get(pointer.version);
    byVersion.set(pointer.version, {
      generation: Math.max(existing?.generation ?? 0, pointer.generation),
      reason: "older-than-bound-package",
      state: "deprecated",
      updatedAt,
      version: pointer.version,
    });
  }
  byVersion.set(boundVersion, {
    generation: 0,
    reason: "current-bound-package",
    state: "retained",
    updatedAt,
    version: boundVersion,
  });
  return [...byVersion.values()].sort((left, right) => compareLauncherVersions(left.version, right.version) || left.version.localeCompare(right.version));
}

async function reconcileRuntimeWithBoundPackage(
  config: PackagedConfig,
  descriptor: LauncherRuntimeDescriptor,
  launcherPaths: LauncherPaths,
  channel: LauncherChannel,
): Promise<LauncherRuntimeDescriptor> {
  const boundVersion = config.appVersion == null ? null : normalizeLauncherVersion(config.appVersion);
  if (boundVersion == null) return descriptor;
  const maxPersistedVersion = maxRuntimePointer(descriptor);
  if (maxPersistedVersion != null && compareLauncherVersions(boundVersion, maxPersistedVersion) <= 0) return descriptor;
  const pointer = { generation: 0, version: boundVersion };
  const updatedAt = new Date().toISOString();
  const next: LauncherRuntimeDescriptor = {
    active: pointer,
    channel,
    lastSuccessful: pointer,
    namespace: config.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    updatedAt,
  };
  await writeJsonFile(launcherPaths.runtimePath, next);
  await rm(launcherPaths.attemptsPath, { force: true });
  await writeJsonFile(launcherPaths.cleanupPath, {
    channel,
    currentVersion: boundVersion,
    namespace: config.namespace,
    updatedAt,
    version: 1,
    versions: cleanupEntriesForSupersededRuntime(descriptor, boundVersion, updatedAt),
  } satisfies LauncherCleanupDescriptor);
  return next;
}

export async function resolvePackagedLauncherRuntime(
  config: PackagedConfig,
  paths: PackagedNamespacePaths,
): Promise<PackagedLauncherRuntime> {
  const channel = inferLauncherChannel(config);
  const launcherPaths = resolveLauncherPaths({
    channel,
    namespace: config.namespace,
    root: paths.installationRoot,
  });
  const descriptor = await reconcileRuntimeWithBoundPackage(
    config,
    await readOrCreateRuntimeDescriptor(config, launcherPaths, channel),
    launcherPaths,
    channel,
  );
  const attempted = await readLauncherAttempt(launcherPaths, channel, config.namespace).catch(() => null);
  const selection = selectLauncherRuntimeTarget({ attempted, runtime: descriptor });
  const persistedInstall = await readLauncherInstallDescriptor(launcherPaths, channel, config.namespace).catch(() => null);
  const currentPackageLaunchPath = stableAppLaunchPathFromExecutable(process.execPath);

  if (selection.selected) {
    const versionPaths = resolveLauncherVersionPaths({
      channel,
      namespace: config.namespace,
      root: paths.installationRoot,
      version: selection.pointer.version,
    });
    const payloadConfig = await resolvePayloadConfig(config, versionPaths, channel);
    if (payloadConfig != null) {
      if (selection.reason === "active") {
        await writeJsonFile(launcherPaths.attemptsPath, {
          channel,
          generation: selection.pointer.generation,
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          startedAt: new Date().toISOString(),
          version: selection.pointer.version,
        } satisfies LauncherAttemptDescriptor);
      }
      return {
        config: payloadConfig.config,
        descriptor,
        electronNodeCommand: payloadConfig.electronNodeCommand,
        installedLaunchPath: persistedInstall?.launchPath ?? currentPackageLaunchPath,
        launcherPaths,
        paths: { ...paths, resourceRoot: payloadConfig.config.resourceRoot },
        selection,
        source: "payload",
        targetVersion: selection.pointer.version,
      };
    }
  }

  return {
    config,
    descriptor,
    electronNodeCommand: null,
    installedLaunchPath: (await writeLauncherInstallDescriptor(
      launcherPaths,
      channel,
      config.namespace,
      currentPackageLaunchPath,
    )).launchPath,
    launcherPaths,
    paths,
    selection,
    source: "current-package",
    targetVersion: null,
  };
}

async function writeJsonFile(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function confirmPackagedLauncherRuntime(runtime: PackagedLauncherRuntime): Promise<void> {
  if (runtime.source !== "payload") return;
  if (!runtime.selection.selected || runtime.selection.reason !== "active") return;
  const next: LauncherRuntimeDescriptor = {
    ...runtime.descriptor,
    active: runtime.selection.pointer,
    lastSuccessful: runtime.selection.pointer,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(runtime.launcherPaths.runtimePath, next);
  await rm(runtime.launcherPaths.attemptsPath, { force: true });
}
