import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, readlink, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  LAUNCHER_STABLE_ALIAS,
  compareLauncherVersions,
  type LauncherChannel,
  type LauncherDesktopHandoffDescriptor,
  type LauncherHandoffResumeRequest,
  type LauncherPaths,
  type LauncherRuntimeDescriptor,
  type LauncherVersionPaths,
  type LauncherVersionPointer,
  normalizeLauncherChannel,
  normalizeLauncherVersion,
  resolveLauncherPaths,
  resolveLauncherStableEntryPaths,
  resolveLauncherVersionPaths,
  selectLauncherRuntimeTarget,
  validateLauncherDesktopHandoffDescriptor,
  validateLauncherRuntimeDescriptor,
  type LauncherAttemptDescriptor,
  type LauncherTargetSelection,
} from "@open-design/launcher-proto";
import { releaseChannelFromNamespace, releaseChannelFromVersion } from "@open-design/release";

import type { PackagedConfig, PackagedWebOutputMode, RawPackagedConfig } from "./config.js";
import type { PackagedDesktopLogger } from "./logging.js";
import { repairMacDockEntries } from "./mac-dock-entry.js";
import { cleanupConfirmedMacLaunchEntry, promoteMacLaunchEntry } from "./mac-launch-entry.js";
import { refreshMacApplicationRegistration } from "./mac-launch-services.js";
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
  cachedDesktopExecutablePath?: string;
  canonicalDesktopProcess?: boolean;
  config: PackagedConfig;
  desktopExecutablePath: string | null;
  descriptor: LauncherRuntimeDescriptor;
  electronNodeCommand: string | null;
  installedLaunchPath: string | null;
  launcherPaths: LauncherPaths;
  paths: PackagedNamespacePaths;
  payloadDesktopProcess: boolean;
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
  desktopExecutablePath: string;
  electronNodeCommand: string | null;
};

export type ResolvePackagedLauncherRuntimeOptions = {
  currentExecutablePath?: string;
  /**
   * Pointer from `--od-launcher-delegated-*` argv: the spawning parent
   * pre-armed attempt.json for this pointer, so a matching attempt marks the
   * launch in progress rather than a previous failure.
   */
  delegated?: LauncherVersionPointer | null;
  resume?: LauncherHandoffResumeRequest | null;
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
  const index = executablePath.split(sep).join("/").indexOf(marker);
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

function containsPath(root: string, target: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`);
}

async function resolvePayloadDesktopExecutable(
  versionPaths: LauncherVersionPaths,
  relative: string,
): Promise<string | null> {
  const executablePath = resolve(versionPaths.versionRoot, relative);
  if (!containsPath(versionPaths.versionRoot, executablePath)) return null;
  const entry = await lstat(executablePath).catch(() => null);
  if (entry == null || !entry.isFile() || entry.isSymbolicLink()) return null;
  return executablePath;
}

async function canonicalExecutablePath(path: string): Promise<string> {
  return await realpath(path).catch(() => resolve(path));
}

export async function sameExecutablePath(left: string, right: string): Promise<boolean> {
  const [normalizedLeft, normalizedRight] = await Promise.all([
    canonicalExecutablePath(left),
    canonicalExecutablePath(right),
  ]);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
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
  resourcesPathOverride?: string,
): Promise<ResolvedPayloadConfig | null> {
  if (!(await pathExists(versionPaths.manifestPath))) return null;
  const manifest = parsePayloadManifest(await readJsonFile<unknown>(versionPaths.manifestPath), {
    channel,
    namespace: config.namespace,
    version: versionPaths.version,
  });
  const desktopExecutablePath = await resolvePayloadDesktopExecutable(
    versionPaths,
    manifest.entry.executable,
  );
  if (desktopExecutablePath == null) return null;
  const resourcesPath = resourcesPathOverride ?? (manifest.platform === "darwin"
    ? join(versionPaths.versionRoot, manifest.entry.cwd, "Contents", "Resources")
    : join(versionPaths.versionRoot, manifest.payloadRoot, "resources"));
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
      daemonCliEntry: await resolveOptionalPayloadEntry(resourcesPath, raw.daemonCliEntryRelative),
      daemonSidecarEntry: await resolveOptionalPayloadEntry(resourcesPath, raw.daemonSidecarEntryRelative),
      nodeCommand,
      resourceRoot,
      telemetryRelayUrl: raw.telemetryRelayUrl?.trim() || config.telemetryRelayUrl,
      webOutputMode: webOutputMode as PackagedWebOutputMode,
      webSidecarEntry: await resolveOptionalPayloadEntry(resourcesPath, raw.webSidecarEntryRelative),
      webStandaloneRoot,
    },
    desktopExecutablePath,
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
  options: ResolvePackagedLauncherRuntimeOptions = {},
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
  const currentExecutablePath = options.currentExecutablePath ?? process.execPath;
  const handoff = options.resume == null
    ? null
    : await readJsonFile<LauncherDesktopHandoffDescriptor>(launcherPaths.handoffPath)
      .then((value) => validateLauncherDesktopHandoffDescriptor(value, {
        channel,
        namespace: config.namespace,
      }))
      .catch(() => null);
  const requestedResume = options.resume != null &&
    handoff?.state === "armed" &&
    handoff.handoffId === options.resume.handoffId &&
    handoff.target != null &&
    descriptor.active?.version === handoff.target.version &&
    descriptor.active.generation === handoff.target.generation &&
    attempted?.version === handoff.target.version &&
    attempted.generation === handoff.target.generation &&
    await sameExecutablePath(currentExecutablePath, handoff.payloadExecutablePath)
    ? handoff.target
    : null;
  const selection = selectLauncherRuntimeTarget({
    attempted,
    delegated: options.delegated ?? null,
    resume: requestedResume,
    runtime: descriptor,
  });
  const persistedInstall = await readLauncherInstallDescriptor(launcherPaths, channel, config.namespace).catch(() => null);
  // Track the stable launch path of the CURRENT launcher executable (the
  // `currentExecutablePath` option, defaulting to process.execPath), so the
  // payload branch can refresh install.json when an update moved the launcher
  // (issue #6494) instead of keeping a stale persisted launchPath forever.
  const currentPackageLaunchPath = stableAppLaunchPathFromExecutable(currentExecutablePath);

  if (selection.selected) {
    const versionPaths = resolveLauncherVersionPaths({
      channel,
      namespace: config.namespace,
      root: paths.installationRoot,
      version: selection.pointer.version,
    });
    const payloadConfig = await resolvePayloadConfig(config, versionPaths, channel);
    if (payloadConfig != null) {
      const binding = await readJsonFile<{
        schemaVersion: number; channel: string; namespace: string; version: string;
        generation: number; executablePath: string; payloadExecutablePath: string; launchPath: string;
      }>(join(launcherPaths.namespaceRoot, "launch-entry.json")).catch(() => null);
      const canonicalResourcesPath = join(currentPackageLaunchPath, "Contents", "Resources");
      const bakedConfig = process.platform === "darwin"
        ? await readJsonFile<RawPackagedConfig>(join(canonicalResourcesPath, "open-design-config.json")).catch(() => null)
        : null;
      // A copied bundle has a different inode from its cache source. Recognize
      // it only with a matching committed binding and its own baked version;
      // otherwise an old installed launcher must still delegate to the cache.
      const canonicalDesktopProcess = process.platform === "darwin" &&
        binding?.schemaVersion === LAUNCHER_SCHEMA_VERSION &&
        binding.channel === channel && binding.namespace === config.namespace &&
        binding.version === selection.pointer.version &&
        binding.generation === selection.pointer.generation &&
        bakedConfig?.appVersion === selection.pointer.version &&
        binding.launchPath === currentPackageLaunchPath &&
        (await lstat(currentPackageLaunchPath).catch(() => null))?.isDirectory() === true &&
        await sameExecutablePath(currentExecutablePath, binding.executablePath) &&
        await sameExecutablePath(binding.payloadExecutablePath, payloadConfig.desktopExecutablePath);
      const effectiveExecutablePath = canonicalDesktopProcess ? currentExecutablePath : payloadConfig.desktopExecutablePath;
      const effectivePayloadConfig = canonicalDesktopProcess
        ? await resolvePayloadConfig(config, versionPaths, channel, canonicalResourcesPath) ?? payloadConfig
        : payloadConfig;
      const payloadDesktopProcess = canonicalDesktopProcess || await sameExecutablePath(
        currentExecutablePath,
        payloadConfig.desktopExecutablePath,
      );
      if (
        selection.reason === "active-resume" &&
        (handoff == null || !payloadDesktopProcess || !(await sameExecutablePath(
          handoff.payloadExecutablePath,
          effectiveExecutablePath,
        )))
      ) {
        return await resolvePackagedLauncherRuntime(config, paths, {
          currentExecutablePath,
          resume: null,
        });
      }
      if (selection.reason === "active" && payloadDesktopProcess) {
        await writeJsonFile(launcherPaths.attemptsPath, {
          channel,
          generation: selection.pointer.generation,
          namespace: config.namespace,
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          startedAt: new Date().toISOString(),
          version: selection.pointer.version,
        } satisfies LauncherAttemptDescriptor);
      }
      // Issue #6494: the payload branch previously only READ the persisted
      // install.json launchPath (written by the cold-start current-package
      // branch) and never refreshed it, so after an update that moved the
      // launcher executable (0.17.0 Local\Programs\... → 0.18.0 launcher
      // payload), the stale path kept flowing into the MCP bootstrap
      // command published by /api/mcp/install-info, making MCP clients
      // relaunch the old executable on the same sidecar pipe until the
      // launcher's stale-sidecar sweep killed the fresh daemon. Refresh
      // install.json so launchPath tracks the current launcher executable
      // across updates. Only the launcher process owns the descriptor: a
      // delegated payload desktop runs from the versioned payload exe and
      // must keep the stable launch path the launcher persisted.
      const installedLaunchPath = !payloadDesktopProcess
        && (persistedInstall == null
          || !(await sameExecutablePath(persistedInstall.launchPath, currentPackageLaunchPath)))
        ? (await writeLauncherInstallDescriptor(
          launcherPaths,
          channel,
          config.namespace,
          currentPackageLaunchPath,
        )).launchPath
        : (persistedInstall?.launchPath ?? currentPackageLaunchPath);
      return {
        cachedDesktopExecutablePath: payloadConfig.desktopExecutablePath,
        canonicalDesktopProcess,
        config: effectivePayloadConfig.config,
        desktopExecutablePath: effectiveExecutablePath,
        descriptor,
        electronNodeCommand: payloadConfig.electronNodeCommand,
        installedLaunchPath,
        launcherPaths,
        paths: { ...paths, resourceRoot: effectivePayloadConfig.config.resourceRoot },
        payloadDesktopProcess,
        selection,
        source: "payload",
        targetVersion: selection.pointer.version,
      };
    }
  }

  return {
    config,
    desktopExecutablePath: null,
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
    payloadDesktopProcess: false,
    selection,
    source: "current-package",
    targetVersion: null,
  };
}

async function writeJsonFile(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * Arm attempt.json for a normal active delegation BEFORE the payload spawns.
 * A payload that dies before reaching its own launcher bookkeeping then still
 * leaves rollback evidence, so the next cold start rolls back to
 * lastSuccessful instead of retrying the broken payload forever. Rollback
 * (last-successful) delegations are deliberately excluded: the attempt on
 * disk IS the rollback evidence and must not be overwritten.
 */
export async function armPackagedLauncherRuntimeAttempt(
  runtime: PackagedLauncherRuntime,
): Promise<void> {
  if (runtime.source !== "payload") return;
  if (!runtime.selection.selected || runtime.selection.reason !== "active") return;
  await writeJsonFile(runtime.launcherPaths.attemptsPath, {
    channel: runtime.launcherPaths.channel,
    generation: runtime.selection.pointer.generation,
    namespace: runtime.launcherPaths.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    startedAt: new Date().toISOString(),
    version: runtime.selection.pointer.version,
  } satisfies LauncherAttemptDescriptor);
}

export async function recordPackagedLauncherRuntimeFailedAttempt(
  runtime: PackagedLauncherRuntime,
): Promise<void> {
  await armPackagedLauncherRuntimeAttempt(runtime);
}

/** Run after the predecessor has quit, before launching any new sidecars. */
export async function preparePackagedMacLaunchEntry(
  runtime: PackagedLauncherRuntime,
  logger?: Pick<PackagedDesktopLogger, "warn"> & Partial<Pick<PackagedDesktopLogger, "info">>,
): Promise<void> {
  if (process.platform !== "darwin" || runtime.source !== "payload" || !runtime.selection.selected) return;
  const sourceExecutablePath = runtime.cachedDesktopExecutablePath ?? runtime.desktopExecutablePath;
  if (sourceExecutablePath == null || runtime.installedLaunchPath == null) return;
  logger?.info?.("macOS application launch entry selected", {
    pid: process.pid, executablePath: process.execPath,
    pointer: runtime.selection.pointer, reason: runtime.selection.reason,
    active: runtime.descriptor.active, lastSuccessful: runtime.descriptor.lastSuccessful,
    canonicalDesktopProcess: runtime.canonicalDesktopProcess === true,
    sourceExecutablePath, installedLaunchPath: runtime.installedLaunchPath,
  });
  // Keep rollback selection reflected in the alias too, while retaining the
  // failed active attempt as evidence for subsequent launches.
  const stable = await syncStableLaunchEntry(runtime).catch(() => null);
  if (stable?.launchPathStatus === "failed") logger?.warn("failed to refresh stable launcher alias");
  const entry = await promoteMacLaunchEntry({
    runtimeRoot: runtime.launcherPaths.namespaceRoot,
    channel: runtime.launcherPaths.channel,
    namespace: runtime.launcherPaths.namespace,
    version: runtime.selection.pointer.version,
    generation: runtime.selection.pointer.generation,
    sourceExecutablePath,
    installedLaunchPath: runtime.installedLaunchPath,
  });
  logger?.info?.("macOS application launch entry prepared", {
    pid: process.pid, pointer: runtime.selection.pointer, status: entry.status,
  });
  if (entry.status === "failed") {
    logger?.warn("failed to promote macOS application launch entry", { error: entry.error });
  }
  if ((entry.status !== "promoted" && entry.status !== "current") || entry.executablePath == null) return;
  if (entry.launchPath != null && runtime.installedLaunchPath !== entry.launchPath) {
    runtime.installedLaunchPath = (await writeLauncherInstallDescriptor(
      runtime.launcherPaths, runtime.launcherPaths.channel, runtime.launcherPaths.namespace, entry.launchPath,
    )).launchPath;
  }
  runtime.desktopExecutablePath = entry.executablePath;
  // Even when its path equals the destination, the current process may still
  // map the old bundle's executable. Only the resolver's pre-copy version and
  // binding check prove that this process is already the selected version.
  runtime.payloadDesktopProcess = runtime.canonicalDesktopProcess === true;
  const handoff = await readJsonFile<LauncherDesktopHandoffDescriptor>(runtime.launcherPaths.handoffPath)
    .then((value) => validateLauncherDesktopHandoffDescriptor(value, runtime.launcherPaths))
    .catch(() => null);
  if (handoff?.state === "armed" && handoff.target?.version === runtime.selection.pointer.version &&
    handoff.target.generation === runtime.selection.pointer.generation) {
    await writeJsonFile(runtime.launcherPaths.handoffPath, { ...handoff, payloadExecutablePath: entry.executablePath });
  }
}

async function repairConfirmedMacLaunch(runtime: PackagedLauncherRuntime, logger?: Pick<PackagedDesktopLogger, "warn">): Promise<void> {
  if (runtime.desktopExecutablePath == null) return;
  const registration = await refreshMacApplicationRegistration({
    executablePath: runtime.desktopExecutablePath,
    ...(runtime.canonicalDesktopProcess ? { versionsRoot: runtime.launcherPaths.versionsRoot } : {}),
  });
  if (registration.status === "failed") {
    logger?.warn("failed to refresh macOS application registration", { error: registration.error });
  }
  // Repair only after a canonical process reaches readiness; a failed copy
  // must never point the user's Dock at an older installed bundle.
  if (runtime.canonicalDesktopProcess && runtime.installedLaunchPath != null) {
    const dock = await repairMacDockEntries({
      canonicalAppBundlePath: runtime.installedLaunchPath,
      knownAppBundlePaths: [join(runtime.launcherPaths.namespaceRoot, "current", "payload", basename(runtime.installedLaunchPath))],
      versionsRoot: runtime.launcherPaths.versionsRoot,
      appBundleName: basename(runtime.installedLaunchPath),
    });
    if (dock.status === "failed") logger?.warn("failed to repair macOS Dock launch entries", { error: dock.error });
    if (runtime.selection.selected) {
      const cleanup = await cleanupConfirmedMacLaunchEntry({
        runtimeRoot: runtime.launcherPaths.namespaceRoot,
        launchPath: runtime.installedLaunchPath,
        version: runtime.selection.pointer.version,
        generation: runtime.selection.pointer.generation,
      });
      if (cleanup.status === "failed") logger?.warn("failed to remove confirmed macOS launch backup", { error: cleanup.error });
    }
  }
}

export async function confirmPackagedLauncherRuntime(
  runtime: PackagedLauncherRuntime,
  logger?: Pick<PackagedDesktopLogger, "warn">,
): Promise<void> {
  if (runtime.source !== "payload") return;
  if (!runtime.payloadDesktopProcess) return;
  if (runtime.desktopExecutablePath == null) return;
  if (runtime.selection.selected && runtime.selection.reason === "last-successful") {
    if (runtime.canonicalDesktopProcess) await repairConfirmedMacLaunch(runtime, logger);
    return;
  }
  if (!runtime.selection.selected || (
    runtime.selection.reason !== "active" &&
    runtime.selection.reason !== "active-delegated" &&
    runtime.selection.reason !== "active-resume"
  )) return;
  const confirmedAt = new Date().toISOString();
  const next: LauncherRuntimeDescriptor = {
    ...runtime.descriptor,
    active: runtime.selection.pointer,
    lastSuccessful: runtime.selection.pointer,
    updatedAt: confirmedAt,
  };
  const handoff = await readJsonFile<LauncherDesktopHandoffDescriptor>(runtime.launcherPaths.handoffPath)
    .then((value) => validateLauncherDesktopHandoffDescriptor(value, runtime.launcherPaths))
    .catch(() => null);
  const canConfirmResumeBinding =
    runtime.selection.reason === "active-resume" &&
    handoff?.state === "armed" &&
    handoff.target != null &&
    handoff.target.generation === runtime.selection.pointer.generation &&
    handoff.target.version === runtime.selection.pointer.version;
  const canRefreshConfirmedBinding = handoff?.state === "confirmed";
  if (handoff != null && (canConfirmResumeBinding || canRefreshConfirmedBinding)) {
    const advancesConfirmedBinding =
      canRefreshConfirmedBinding &&
      (
        handoff.source.generation !== runtime.selection.pointer.generation ||
        handoff.source.version !== runtime.selection.pointer.version
      );
    await writeJsonFile(runtime.launcherPaths.handoffPath, {
      ...handoff,
      payloadExecutablePath: runtime.desktopExecutablePath,
      previous: advancesConfirmedBinding && runtime.descriptor.lastSuccessful != null
        ? runtime.descriptor.lastSuccessful
        : handoff.previous,
      source: runtime.selection.pointer,
      state: "confirmed",
      target: runtime.selection.pointer,
      updatedAt: confirmedAt,
    } satisfies LauncherDesktopHandoffDescriptor);
  }
  await rm(runtime.launcherPaths.attemptsPath, { force: true });
  await writeJsonFile(runtime.launcherPaths.runtimePath, next);
  await repairConfirmedMacLaunch(runtime, logger);
  await syncStableLaunchEntry(runtime).catch(() => undefined);
}

/**
 * Stable, version-independent launch entry (issues #7264 / #8549).
 *
 * Every release is staged under `versions/<version>/payload/...`, so the
 * absolute path of the running app changes on every update: Dock tiles,
 * Spotlight/Launchpad registrations, and any script or integration that
 * remembers a path drift out of date, and relaunching through the canonical
 * install path silently regresses to whatever version was installed on day
 * one.
 *
 * Once an activation is confirmed we therefore maintain:
 *   1. `namespaces/<ns>/current` -> `versions/<active>` — re-pointed
 *      atomically on every update, so scripts and MCP/automation integrations
 *      get a path that never moves;
 *   2. `install.json` launchPath as a symlink to `current/payload/<App>.app`
 *      when that path is absent or is already a symlink. An existing *real*
 *      bundle is never replaced here — that needs user consent and belongs to
 *      the obsolete-installed-outer retirement flow.
 */
export type StableLaunchEntryStatus =
  | "failed"
  | "linked"
  | "skipped-existing-install"
  | "skipped-no-launch-path"
  | "skipped-no-version"
  | "skipped-non-darwin"
  | "unchanged"
  | "updated";

export type StableLaunchEntryResult = {
  aliasPath: string | null;
  launchPathStatus: StableLaunchEntryStatus;
  payloadAppPath: string | null;
};

async function replaceSymlink(target: string, linkPath: string): Promise<boolean> {
  const temporary = `${linkPath}.${process.pid}.${Date.now()}.tmp`;
  await rm(temporary, { force: true, recursive: true });
  try {
    await symlink(target, temporary, "dir");
    await rename(temporary, linkPath);
    return true;
  } catch {
    await rm(temporary, { force: true, recursive: true }).catch(() => undefined);
    return false;
  }
}

/**
 * True only when the alias provably resolves to `versionRoot`. Path equality is
 * not enough: the link can be missing, can point at the previous version, or
 * can be shadowed by a real directory, and `rename` over those shapes can fail
 * silently from the caller's point of view.
 */
async function aliasResolvesTo(aliasPath: string, versionRoot: string): Promise<boolean> {
  const [alias, target] = await Promise.all([
    realpath(aliasPath).catch(() => null),
    realpath(versionRoot).catch(() => null),
  ]);
  return alias != null && target != null && alias === target;
}

export async function syncStableLaunchEntry(
  runtime: PackagedLauncherRuntime,
): Promise<StableLaunchEntryResult> {
  const version = runtime.targetVersion ?? runtime.descriptor.active?.version ?? null;
  const skipped = (launchPathStatus: StableLaunchEntryStatus): StableLaunchEntryResult => ({
    aliasPath: null,
    launchPathStatus,
    payloadAppPath: null,
  });
  if (version == null) return skipped("skipped-no-version");
  if (process.platform !== "darwin") return skipped("skipped-non-darwin");

  const versionPaths = resolveLauncherVersionPaths({
    channel: runtime.launcherPaths.channel,
    namespace: runtime.launcherPaths.namespace,
    root: runtime.launcherPaths.root,
    version,
  });
  const installedLaunchPath = runtime.installedLaunchPath;
  const stablePaths =
    installedLaunchPath != null && installedLaunchPath.endsWith(".app")
      ? resolveLauncherStableEntryPaths({
          appBundleName: basename(installedLaunchPath),
          channel: runtime.launcherPaths.channel,
          namespace: runtime.launcherPaths.namespace,
          root: runtime.launcherPaths.root,
        })
      : null;
  const aliasPath = stablePaths?.aliasPath ?? join(runtime.launcherPaths.namespaceRoot, LAUNCHER_STABLE_ALIAS);
  const aliasTarget = resolve(versionPaths.versionRoot);
  if (!(await aliasResolvesTo(aliasPath, aliasTarget))) {
    await mkdir(dirname(aliasPath), { recursive: true });
    const replaced = await replaceSymlink(aliasTarget, aliasPath);
    // Both the rename and the resulting link are verified. Falling through on
    // either failure would link the install path (or report it `unchanged`)
    // while `current` still resolves to the previous version — leaving the Dock
    // launching a stale payload against current data, which is the mismatch
    // this entry exists to prevent.
    if (!replaced || !(await aliasResolvesTo(aliasPath, aliasTarget))) {
      return { aliasPath, launchPathStatus: "failed", payloadAppPath: null };
    }
  }

  if (installedLaunchPath == null || stablePaths == null) {
    return { aliasPath, launchPathStatus: "skipped-no-launch-path", payloadAppPath: null };
  }
  const payloadAppPath = stablePaths.appPath;
  const entry = await lstat(installedLaunchPath).catch(() => null);
  if (entry == null) {
    await mkdir(dirname(installedLaunchPath), { recursive: true }).catch(() => undefined);
    return {
      aliasPath,
      launchPathStatus: (await replaceSymlink(payloadAppPath, installedLaunchPath))
        ? "linked"
        : "skipped-existing-install",
      payloadAppPath,
    };
  }
  if (!entry.isSymbolicLink()) {
    return { aliasPath, launchPathStatus: "skipped-existing-install", payloadAppPath };
  }
  if ((await readlink(installedLaunchPath).catch(() => null)) === payloadAppPath) {
    return { aliasPath, launchPathStatus: "unchanged", payloadAppPath };
  }
  return {
    aliasPath,
    launchPathStatus: (await replaceSymlink(payloadAppPath, installedLaunchPath))
      ? "updated"
      : "skipped-existing-install",
    payloadAppPath,
  };
}
