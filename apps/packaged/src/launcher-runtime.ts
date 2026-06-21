import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  type LauncherChannel,
  type LauncherPaths,
  type LauncherRuntimeDescriptor,
  type LauncherVersionPaths,
  normalizeLauncherChannel,
  normalizeLauncherVersion,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  selectLauncherRuntimeTarget,
  validateLauncherRuntimeDescriptor,
  type LauncherAttemptDescriptor,
  type LauncherTargetSelection,
} from "@open-design/launcher-proto";

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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function inferLauncherChannel(config: Pick<PackagedConfig, "appVersion" | "namespace">): LauncherChannel {
  const version = config.appVersion;
  if (version != null) {
    if (/-preview\./.test(version)) return "preview";
    if (/-beta\.|beta-nightly\./.test(version)) return "beta";
    if (/-nightly\.|\.nightly\./.test(version)) return "nightly";
  }
  if (config.namespace.includes("preview")) return "preview";
  if (config.namespace.includes("nightly")) return "nightly";
  if (config.namespace.includes("beta")) return "beta";
  return "stable";
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

async function resolvePayloadConfig(
  config: PackagedConfig,
  versionPaths: LauncherVersionPaths,
  channel: LauncherChannel,
): Promise<PackagedConfig | null> {
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
  return {
    ...config,
    appVersion: raw.appVersion?.trim() || manifest.version,
    daemonSidecarEntry: await resolveOptionalPayloadEntry(resourcesPath, raw.daemonSidecarEntryRelative),
    nodeCommand,
    resourceRoot,
    webOutputMode: webOutputMode as PackagedWebOutputMode,
    webSidecarEntry: await resolveOptionalPayloadEntry(resourcesPath, raw.webSidecarEntryRelative),
    webStandaloneRoot: raw.webStandaloneRoot == null || raw.webStandaloneRoot.length === 0
      ? webOutputMode === "standalone" ? join(resourcesPath, "open-design-web-standalone") : null
      : raw.webStandaloneRoot,
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
  const descriptor = await readOrCreateRuntimeDescriptor(config, launcherPaths, channel);
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
        config: payloadConfig,
        descriptor,
        installedLaunchPath: persistedInstall?.launchPath ?? currentPackageLaunchPath,
        launcherPaths,
        paths: { ...paths, resourceRoot: payloadConfig.resourceRoot },
        selection,
        source: "payload",
        targetVersion: selection.pointer.version,
      };
    }
  }

  return {
    config,
    descriptor,
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
