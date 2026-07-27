import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import {
  MANAGED_DOWNLOAD_ERROR_CODES,
  ManagedDownloadError,
  downloadCopyAndClear,
  type ManagedDownloadChecksum,
  type ManagedDownloadProgress,
} from "@open-design/download";
import {
  LAUNCHER_SCHEMA_VERSION,
  buildLauncherAfterQuitArgs,
  buildLauncherDelegatedArgs,
  compareLauncherVersions,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  validateLauncherAttemptDescriptor,
  validateLauncherCleanupDescriptor,
  validateLauncherRuntimeDescriptor,
  type LauncherCleanupDescriptor,
  type LauncherCleanupEntry,
  type LauncherAttemptDescriptor,
  type LauncherRuntimeDescriptor,
} from "@open-design/launcher-proto";
import {
  DESKTOP_UPDATE_ACTIONS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_STATES,
  type DesktopUpdateAction,
  type DesktopUpdateArtifactSnapshot,
  type DesktopUpdateCacheLifecycleSummary,
  type DesktopUpdateCacheLifecycleTrigger,
  type DesktopUpdateChannel,
  type DesktopUpdateChecksumSnapshot,
  type DesktopUpdateErrorSnapshot,
  type DesktopUpdateReleaseLifecycleState,
  type DesktopUpdateMode,
  type DesktopUpdateProgressSnapshot,
  type DesktopUpdateReinstallSnapshot,
  type DesktopUpdateStatusSnapshot,
  type DesktopUpdateState,
  type SidecarSource,
} from "@open-design/sidecar-proto";
import {
  markInstallerObservationOpenFailed,
  writePendingInstallerObservation,
  type InstallerObservationArtifactType,
  type InstallerObservationHandle,
} from "./installer-observations.js";
import {
  capabilitiesFor,
  isDesktopUpdateChannel,
  isSupportedPackageLauncherPlatform,
  normalizeDownloadRoot,
  resolveDesktopUpdaterConfig,
  type DesktopUpdaterConfig,
  type DesktopUpdaterConfigInput,
} from "./updater/config.js";

export {
  DESKTOP_UPDATE_ENV,
  resolveDesktopUpdaterConfig,
  type DesktopUpdaterConfig,
  type DesktopUpdaterConfigInput,
} from "./updater/config.js";
export {
  createDesktopUpdaterScheduler,
  type DesktopUpdaterScheduler,
} from "./updater/scheduler.js";
import {
  containsPath,
  createError,
  isRecord,
  objectField,
  readJson,
  readJsonStrict,
  stringField,
  writeJson,
} from "./updater/support.js";
import {
  artifactFileName,
  checksumMatchesCandidate,
  compareVersions,
  fetchJson,
  hasValidLauncherPayloadContext,
  releaseKey,
  releaseMatchesCandidate,
  releaseVersionForChannel,
  remoteRequiresReinstall,
  resolveChecksum,
  resolveInstalledOuterVersion,
  selectUpdateCandidateWithFallback,
  type UpdateCandidate,
} from "./updater/feed.js";

export { compareVersions, remoteRequiresReinstall, resolveInstalledOuterVersion } from "./updater/feed.js";
import {
  BACK_DIR,
  DOWNLOADS_DIR,
  HELPERS_DIR,
  LOCK_OWNER_FILE,
  RELEASES_DIR,
  STAGING_DIR,
  STORE_METADATA_FILE,
  STORE_METADATA_VERSION,
  ensureOwnedSubdir,
  ensureOwnedUpdateRoot,
  isResolvedChecksumSnapshot,
  isUpdateStoreMetadata,
  logStoreError,
  rebuildOwnedUpdateRootForManualClear,
  storeShapeError,
  type DesktopUpdaterStoreLayout,
  type IncomingRef,
  type OwnedRoot,
  type ResolvedChecksumSnapshot,
  type UpdateReleaseRef,
  type UpdateStoreMetadata,
} from "./updater/store.js";

const RELEASE_CLEANUP_DESCRIPTOR_VERSION = 1;
const DEFERRED_INSTALLER_TIMEOUT_MS = 10 * 60 * 1000;
const ARTIFACT_DOWNLOAD_MAX_ATTEMPTS = 3;
const execFileAsync = promisify(execFile);
const MAC_PAYLOAD_XATTRS_TO_SCRUB = ["com.apple.quarantine", "com.apple.provenance", "com.apple.macl"] as const;

export type DesktopUpdaterDeps = {
  extractLauncherPayloadArchive?: (input: LauncherPayloadExtractInput) => Promise<void>;
  fetch?: typeof globalThis.fetch;
  launchAppAfterQuit?: (input: DeferredAppLaunchInput) => Promise<DeferredLaunchResult>;
  launchInstallerAfterQuit?: (input: DeferredInstallerLaunchInput) => Promise<string>;
  logger?: DesktopUpdaterLogger;
  now?: () => Date;
  openPath?: (path: string) => Promise<string>;
  processExecPath?: string;
  processPid?: number;
  removeLauncherPayloadRoot?: (path: string) => Promise<void>;
  spawnDetached?: SpawnInstallerHelper;
};

export type LauncherPayloadExtractInput = {
  archivePath: string;
  destinationRoot: string;
  extractorPath?: string;
  platform: string;
};

export type DesktopUpdaterLogger = Pick<Console, "error" | "warn"> & Partial<Pick<Console, "info">>;
type DetachedProcess = Pick<ReturnType<typeof spawn>, "once" | "unref">;
type LauncherPayloadCleanupTrigger = "activate" | "manual-clear" | "prepare-existing" | "prepare-promoted";
type LauncherPayloadCleanupFailure = {
  error: NonNullable<LauncherCleanupEntry["error"]>;
  version: string;
};
type SpawnInstallerHelper = (
  command: string,
  args: string[],
  options: { cwd?: string; detached?: true; stdio: "ignore"; windowsHide: true },
) => DetachedProcess;

export type DeferredInstallerLaunchInput = {
  appPid: number;
  /** Stable namespace root inherited by the installer helper process. */
  cwd: string;
  installerPath: string;
  root: string;
  timeoutMs: number;
};

export type DeferredAppLaunchInput = {
  appPid: number;
  /** Stable namespace root inherited by the next payload process. */
  cwd: string;
  /**
   * Pointer the activation pre-armed attempt.json for; passed to the spawned
   * payload as `--od-launcher-delegated-*` so it recognizes that attempt as
   * its own launch in progress rather than a previous failure.
   */
  delegated?: { generation: number; version: string };
  launchPath: string;
  root: string;
  timeoutMs: number;
};

export type DeferredLaunchResult = {
  error?: string;
  helperLogPath?: string;
};

type LoadedRelease = {
  path: string;
  ref: UpdateReleaseRef;
};

type ActionOptions = {
  autoDownload?: boolean;
};

type ReleaseCleanupReason =
  | "cleanup-failed"
  | "current-version-or-newer"
  | "manual-clear"
  | "metadata-invalid"
  | "metadata-missing"
  | "older-than-current-version";

type ReleaseCleanupEntry = {
  currentVersion?: string;
  deprecatedAt?: string;
  error?: DesktopUpdateErrorSnapshot;
  key: string;
  metadataPath?: string;
  path: string;
  readyVersion?: string;
  reason: ReleaseCleanupReason;
  removedAt?: string;
  state: DesktopUpdateReleaseLifecycleState;
  updatedAt: string;
  version?: string;
};

type ReleaseCleanupDescriptor = {
  currentVersion?: string;
  platform: string;
  readyVersion?: string;
  releases: ReleaseCleanupEntry[];
  trigger: DesktopUpdateCacheLifecycleTrigger;
  updatedAt: string;
  version: typeof RELEASE_CLEANUP_DESCRIPTOR_VERSION;
};

type LauncherCleanupLifecycleSummary = {
  cleanupDeferred: number;
  cleanupRemoved: number;
  deprecated: number;
  retained: number;
  total: number;
};

export type DesktopUpdater = {
  checkForUpdates(options?: ActionOptions): Promise<DesktopUpdateStatusSnapshot>;
  clearCache(): Promise<DesktopUpdateStatusSnapshot>;
  config: DesktopUpdaterConfig;
  downloadUpdate(): Promise<DesktopUpdateStatusSnapshot>;
  handle(action: DesktopUpdateAction): Promise<DesktopUpdateStatusSnapshot>;
  installUpdate(): Promise<DesktopUpdateStatusSnapshot>;
  shouldAutoCheck(): boolean;
  snapshot(): DesktopUpdateStatusSnapshot;
  status(): Promise<DesktopUpdateStatusSnapshot>;
  subscribe(listener: () => void): () => void;
};

function installerObservationArtifactType(value: string | undefined): InstallerObservationArtifactType | null {
  if (value === "dmg" || value === "installer" || value === "payload") return value;
  return null;
}

async function hashFile(path: string, algorithm: "sha256" | "sha512"): Promise<string> {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableArtifactDownloadError(error: unknown): boolean {
  const message = errorMessage(error);
  return /\b(?:terminated|aborted|ECONNRESET|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|fetch failed)\b/i.test(message);
}

function userFacingDownloadErrorMessage(error: unknown): string {
  if (error instanceof ManagedDownloadError && error.code === MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED) {
    return `The network connection ended while downloading the update. Please try again.`;
  }
  const message = errorMessage(error);
  if (isRetryableArtifactDownloadError(error)) {
    return `The network connection ended while downloading the update. Please try again.`;
  }
  return message;
}

function managedChecksum(checksum: DesktopUpdateChecksumSnapshot): ManagedDownloadChecksum {
  if (checksum.value == null) throw new Error("artifact checksum is missing");
  return {
    algorithm: checksum.algorithm,
    value: checksum.value,
  };
}

function updateProgressFromManaged(progress: ManagedDownloadProgress): DesktopUpdateProgressSnapshot {
  return {
    receivedBytes: progress.receivedBytes,
    ...(progress.totalBytes == null ? {} : { totalBytes: progress.totalBytes }),
  };
}

function desktopDownloadError(error: unknown): DesktopUpdateErrorSnapshot {
  if (error instanceof ManagedDownloadError && error.code === MANAGED_DOWNLOAD_ERROR_CODES.CHECKSUM_MISMATCH) {
    return createError("checksum-mismatch", "downloaded update checksum did not match release metadata", error.details);
  }
  if (error instanceof ManagedDownloadError && error.code === MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED) {
    return createError("download-target-locked", "another update download is already using this target");
  }
  return createError("download-failed", userFacingDownloadErrorMessage(error));
}

type LauncherPayloadManifest = {
  channel: string;
  entry?: { cwd?: string; executable?: string };
  namespace: string;
  payloadRoot: string;
  platform: "darwin" | "win32";
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  version: string;
};

function validateLauncherPayloadManifest(value: unknown, expected: {
  channel: DesktopUpdateChannel;
  namespace: string;
  platform: string;
  version: string;
}): LauncherPayloadManifest {
  if (!isRecord(value)) throw new Error("launcher payload manifest must be an object");
  if (value.schemaVersion !== LAUNCHER_SCHEMA_VERSION) {
    throw new Error(`unsupported launcher payload schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (stringField(value, "channel") !== expected.channel) {
    throw new Error(`launcher payload channel does not match expected channel ${expected.channel}`);
  }
  if (stringField(value, "namespace") !== expected.namespace) {
    throw new Error(`launcher payload namespace does not match expected namespace ${expected.namespace}`);
  }
  if (stringField(value, "version") !== expected.version) {
    throw new Error(`launcher payload version does not match expected version ${expected.version}`);
  }
  const platform = stringField(value, "platform");
  if (platform !== expected.platform) {
    throw new Error(`launcher payload platform ${String(platform)} does not match expected platform ${expected.platform}`);
  }
  if (stringField(value, "payloadRoot") !== "payload") throw new Error("launcher payload root must be payload");
  const entry = objectField(value, "entry");
  if (entry == null || stringField(entry, "cwd") == null || stringField(entry, "executable") == null) {
    throw new Error("launcher payload entry must include cwd and executable");
  }
  return value as LauncherPayloadManifest;
}

async function assertLauncherPayloadBootConfig(input: {
  manifest: LauncherPayloadManifest;
  payloadRoot: string;
  stagingRoot: string;
}): Promise<void> {
  const resourcesPath = input.manifest.platform === "darwin"
    ? join(input.stagingRoot, input.manifest.entry?.cwd ?? "", "Contents", "Resources")
    : join(input.payloadRoot, "resources");
  if (!containsPath(input.stagingRoot, resourcesPath)) {
    throw new Error("launcher payload resources path escaped extracted payload");
  }
  const resourcesEntry = await lstat(resourcesPath);
  if (!resourcesEntry.isDirectory() || resourcesEntry.isSymbolicLink()) {
    throw new Error("launcher payload resources must be a plain directory");
  }
  const packagedConfigPath = join(resourcesPath, "open-design-config.json");
  if (!containsPath(input.stagingRoot, packagedConfigPath)) {
    throw new Error("launcher payload config path escaped extracted payload");
  }
  const rawConfig = await readJsonStrict<unknown>(packagedConfigPath);
  if (!isRecord(rawConfig)) throw new Error("launcher payload config must be a JSON object");
  const resourceRoot = typeof rawConfig.resourceRoot === "string" && rawConfig.resourceRoot.length > 0
    ? rawConfig.resourceRoot
    : join(resourcesPath, "open-design");
  const resourceRootEntry = await lstat(resourceRoot);
  if (!resourceRootEntry.isDirectory() || resourceRootEntry.isSymbolicLink()) {
    throw new Error("launcher payload resource root must be a plain directory");
  }
}

async function defaultExtractLauncherPayloadArchive(input: LauncherPayloadExtractInput): Promise<void> {
  await mkdir(input.destinationRoot, { recursive: true });
  if (input.platform === "darwin") {
    await execFileAsync("ditto", ["-x", "-k", input.archivePath, input.destinationRoot]);
    for (const attribute of MAC_PAYLOAD_XATTRS_TO_SCRUB) {
      await execFileAsync("xattr", ["-dr", attribute, input.destinationRoot]).catch(() => undefined);
    }
    return;
  }
  if (input.platform === "win32") {
    await execFileAsync(input.extractorPath ?? "7z", ["x", "-y", `-o${input.destinationRoot}`, input.archivePath], { windowsHide: true });
    return;
  }
  throw new Error(`launcher payload extraction is not supported on ${input.platform}`);
}

async function assertPreparedLauncherPayloadRelease(input: {
  config: DesktopUpdaterConfig;
  root: string;
  version: string;
}): Promise<string> {
  const manifest = validateLauncherPayloadManifest(await readJsonStrict<unknown>(join(input.root, "manifest.json")), {
    channel: input.config.channel,
    namespace: input.config.namespace ?? "",
    platform: input.config.platform,
    version: input.version,
  });
  const entryCwd = resolve(input.root, manifest.entry?.cwd ?? "");
  const entryExecutable = resolve(input.root, manifest.entry?.executable ?? "");
  if (!containsPath(input.root, entryCwd) || !containsPath(input.root, entryExecutable)) {
    throw new Error("launcher payload entry path escaped extracted payload");
  }
  const entryCwdStat = await lstat(entryCwd);
  if (!entryCwdStat.isDirectory() || entryCwdStat.isSymbolicLink()) {
    throw new Error("launcher payload entry cwd must be a plain directory");
  }
  const entryExecutableStat = await lstat(entryExecutable);
  if (!entryExecutableStat.isFile() || entryExecutableStat.isSymbolicLink()) {
    throw new Error("launcher payload entry executable must be a plain file");
  }
  const payloadRoot = join(input.root, manifest.payloadRoot);
  const payloadRootEntry = await lstat(payloadRoot);
  if (!payloadRootEntry.isDirectory() || payloadRootEntry.isSymbolicLink()) {
    throw new Error("launcher payload root must be a plain directory");
  }
  await assertLauncherPayloadBootConfig({ manifest, payloadRoot, stagingRoot: input.root });
  return entryExecutable;
}

async function prepareLauncherPayloadRelease(input: {
  activeRelease: LoadedRelease;
  config: DesktopUpdaterConfig;
  extractLauncherPayloadArchive: (extractInput: LauncherPayloadExtractInput) => Promise<void>;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  removeLauncherPayloadRoot: (path: string) => Promise<void>;
}): Promise<void> {
  if (input.config.launcherRoot == null || input.config.launcherRuntimePath == null || input.config.namespace == null) {
    throw new Error("launcher payload prepare requires launcher root, runtime path, and namespace");
  }

  const currentRuntime = validateLauncherRuntimeDescriptor(
    await readJsonStrict<LauncherRuntimeDescriptor>(input.config.launcherRuntimePath),
    { channel: input.config.channel, namespace: input.config.namespace },
  );
  const versionPaths = resolveLauncherVersionPaths({
    channel: input.config.channel,
    namespace: input.config.namespace,
    root: input.config.launcherRoot,
    version: input.activeRelease.ref.version,
  });
  const stagingRoot = join(versionPaths.stagingRoot, `prepare-${input.activeRelease.ref.key}`);
  if (!containsPath(versionPaths.root, stagingRoot)) {
    throw new Error("launcher payload staging path escaped launcher root");
  }

  let promoted = false;
  try {
    await mkdir(versionPaths.versionsRoot, { recursive: true });
    const existingVersion = await lstat(versionPaths.versionRoot).catch(() => null);
    if (existingVersion != null) {
      if (!existingVersion.isDirectory() || existingVersion.isSymbolicLink()) {
        throw new Error(`launcher payload version root is not a plain directory: ${versionPaths.versionRoot}`);
      }
      let existingVersionValid = false;
      try {
        await assertPreparedLauncherPayloadRelease({
          config: input.config,
          root: versionPaths.versionRoot,
          version: input.activeRelease.ref.version,
        });
        existingVersionValid = true;
      } catch {
        // Keep the existing version root intact until the replacement staging
        // payload has fully validated. If validation fails below, the old root
        // remains available for forensic inspection or a later retry.
      }
      if (existingVersionValid) {
        await cleanupLauncherPayloadRoots({
          config: input.config,
          currentRuntime,
          keepVersions: new Set([
            input.activeRelease.ref.version,
            ...(currentRuntime.active == null ? [] : [currentRuntime.active.version]),
            ...(currentRuntime.lastSuccessful == null ? [] : [currentRuntime.lastSuccessful.version]),
          ]),
          logger: input.logger,
          now: input.now,
          removeLauncherPayloadRoot: input.removeLauncherPayloadRoot,
          trigger: "prepare-existing",
          versionPaths,
        });
        return;
      }
    }

    await rm(stagingRoot, { force: true, recursive: true });
    await mkdir(dirname(stagingRoot), { recursive: true });
    await input.extractLauncherPayloadArchive({
      archivePath: input.activeRelease.path,
      destinationRoot: stagingRoot,
      ...(input.config.launcherPayloadExtractorPath == null ? {} : { extractorPath: input.config.launcherPayloadExtractorPath }),
      platform: input.config.platform,
    });

    await assertPreparedLauncherPayloadRelease({
      config: input.config,
      root: stagingRoot,
      version: input.activeRelease.ref.version,
    });

    await rm(versionPaths.versionRoot, { force: true, recursive: true });
    await rename(stagingRoot, versionPaths.versionRoot);
    promoted = true;
    await cleanupLauncherPayloadRoots({
      config: input.config,
      currentRuntime,
      keepVersions: new Set([
        input.activeRelease.ref.version,
        ...(currentRuntime.active == null ? [] : [currentRuntime.active.version]),
        ...(currentRuntime.lastSuccessful == null ? [] : [currentRuntime.lastSuccessful.version]),
      ]),
      logger: input.logger,
      now: input.now,
      removeLauncherPayloadRoot: input.removeLauncherPayloadRoot,
      trigger: "prepare-promoted",
      versionPaths,
    });
  } catch (error) {
    if (!promoted) await rm(stagingRoot, { force: true, recursive: true }).catch(() => undefined);
    throw error;
  }
}

async function activatePreparedLauncherPayloadRelease(input: {
  activeRelease: LoadedRelease;
  config: DesktopUpdaterConfig;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  removeLauncherPayloadRoot: (path: string) => Promise<void>;
}): Promise<{ launchPath: string; runtime: LauncherRuntimeDescriptor }> {
  if (input.config.launcherRoot == null || input.config.launcherRuntimePath == null || input.config.namespace == null) {
    throw new Error("launcher payload activate requires launcher root, runtime path, and namespace");
  }

  const currentRuntime = validateLauncherRuntimeDescriptor(
    await readJsonStrict<LauncherRuntimeDescriptor>(input.config.launcherRuntimePath),
    { channel: input.config.channel, namespace: input.config.namespace },
  );
  const versionPaths = resolveLauncherVersionPaths({
    channel: input.config.channel,
    namespace: input.config.namespace,
    root: input.config.launcherRoot,
    version: input.activeRelease.ref.version,
  });
  const launchPath = await assertPreparedLauncherPayloadRelease({
    config: input.config,
    root: versionPaths.versionRoot,
    version: input.activeRelease.ref.version,
  });
  const launcherPaths = resolveLauncherPaths({
    channel: input.config.channel,
    namespace: input.config.namespace,
    root: input.config.launcherRoot,
  });
  const currentAttempt = await readJsonStrict<LauncherAttemptDescriptor>(launcherPaths.attemptsPath)
    .then((value) => validateLauncherAttemptDescriptor(value, {
      channel: input.config.channel,
      namespace: input.config.namespace ?? "",
    }))
    .catch(() => null);
  const activeRuntimeVersion = currentRuntime.active;
  const alreadyActive = activeRuntimeVersion?.version === input.activeRelease.ref.version;
  const retryFailedGeneration = alreadyActive &&
    activeRuntimeVersion != null &&
    currentAttempt?.version === activeRuntimeVersion.version &&
    currentAttempt.generation === activeRuntimeVersion.generation;
  const nextActive = alreadyActive && activeRuntimeVersion != null && !retryFailedGeneration
    ? activeRuntimeVersion
    : {
        generation: Math.max(
          currentRuntime.active?.generation ?? 0,
          currentRuntime.lastSuccessful?.generation ?? 0,
        ) + 1,
        version: input.activeRelease.ref.version,
      };
  const nextRuntime: LauncherRuntimeDescriptor = {
    active: nextActive,
    channel: input.config.channel,
    lastSuccessful: currentRuntime.lastSuccessful ?? currentRuntime.active,
    namespace: input.config.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    updatedAt: input.now().toISOString(),
  };
  await writeJson(input.config.launcherRuntimePath, nextRuntime);
  // Pre-arm the launch attempt for the activated pointer: the relaunched
  // payload carries the matching delegated pointer and treats this attempt as
  // its own launch in progress, while a payload that dies before reaching its
  // own bookkeeping leaves the attempt behind as rollback evidence for the
  // next cold start.
  await writeJson(launcherPaths.attemptsPath, {
    channel: input.config.channel,
    generation: nextActive.generation,
    namespace: input.config.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    startedAt: input.now().toISOString(),
    version: nextActive.version,
  } satisfies LauncherAttemptDescriptor);
  if (retryFailedGeneration) {
    await rm(launcherPaths.handoffPath, { force: true });
  }
  await cleanupLauncherPayloadRoots({
    config: input.config,
    currentRuntime: nextRuntime,
    keepVersions: new Set([
      nextActive.version,
      ...(currentRuntime.active == null ? [] : [currentRuntime.active.version]),
      ...(currentRuntime.lastSuccessful == null ? [] : [currentRuntime.lastSuccessful.version]),
      ...(nextRuntime.lastSuccessful == null ? [] : [nextRuntime.lastSuccessful.version]),
    ]),
    logger: input.logger,
    now: input.now,
    removeLauncherPayloadRoot: input.removeLauncherPayloadRoot,
    trigger: "activate",
    versionPaths,
  });
  return { launchPath, runtime: nextRuntime };
}

function launcherCleanupErrorFrom(error: unknown): NonNullable<LauncherCleanupEntry["error"]> {
  const code = (error as NodeJS.ErrnoException).code;
  return launcherCleanupError(
    typeof code === "string" && code.length > 0 ? code : "launcher-cleanup-failed",
    error instanceof Error ? error.message : String(error),
  );
}

function launcherRuntimeGenerationForVersion(runtime: LauncherRuntimeDescriptor, version: string): number {
  return Math.max(
    ...(runtime.active?.version === version ? [runtime.active.generation] : []),
    ...(runtime.lastSuccessful?.version === version ? [runtime.lastSuccessful.generation] : []),
    0,
  );
}

async function readLauncherCleanupDescriptor(
  config: DesktopUpdaterConfig,
  cleanupPath: string,
): Promise<LauncherCleanupDescriptor | null> {
  try {
    return validateLauncherCleanupDescriptor(
      await readJsonStrict<LauncherCleanupDescriptor>(cleanupPath),
      { channel: config.channel, namespace: config.namespace ?? "" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeDeferredLauncherCleanupFailures(input: {
  cleanup: LauncherCleanupDescriptor | null;
  config: DesktopUpdaterConfig;
  currentRuntime: LauncherRuntimeDescriptor;
  failures: LauncherPayloadCleanupFailure[];
  nowIso: string;
  path: string;
}): Promise<void> {
  const versions = new Map((input.cleanup?.versions ?? []).map((entry) => [entry.version, entry] as const));
  for (const failure of input.failures) {
    const existing = versions.get(failure.version);
    if (existing?.state === "retained") continue;
    versions.set(failure.version, {
      error: failure.error,
      generation: existing?.generation ?? launcherRuntimeGenerationForVersion(input.currentRuntime, failure.version),
      reason: "cleanup-failed",
      state: "cleanup-deferred",
      updatedAt: input.nowIso,
      version: failure.version,
    });
  }
  const next: LauncherCleanupDescriptor = {
    channel: input.config.channel,
    currentVersion: input.cleanup?.currentVersion ?? input.config.currentVersion,
    namespace: input.config.namespace ?? "",
    updatedAt: input.nowIso,
    version: LAUNCHER_SCHEMA_VERSION,
    versions: [...versions.values()].sort((left, right) => (
      compareLauncherVersions(left.version, right.version) || left.version.localeCompare(right.version)
    )),
  };
  await writeJson(input.path, next);
}

async function cleanupLauncherPayloadRoots(input: {
  config: DesktopUpdaterConfig;
  currentRuntime: LauncherRuntimeDescriptor;
  keepVersions: ReadonlySet<string>;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  removeLauncherPayloadRoot: (path: string) => Promise<void>;
  trigger: LauncherPayloadCleanupTrigger;
  versionPaths: ReturnType<typeof resolveLauncherVersionPaths>;
}): Promise<void> {
  const { config, currentRuntime, keepVersions, logger, now, removeLauncherPayloadRoot, trigger, versionPaths } = input;
  await rm(versionPaths.stagingRoot, { force: true, recursive: true }).catch((error: unknown) => {
    const cleanupError = launcherCleanupErrorFrom(error);
    logger.warn("[open-design updater] failed post-commit launcher staging cleanup", {
      error: cleanupError.message,
      errorCode: cleanupError.code,
      event: "launcher-payload-cleanup",
      path: versionPaths.stagingRoot,
      trigger,
    });
  });

  let cleanup: LauncherCleanupDescriptor | null;
  try {
    cleanup = await readLauncherCleanupDescriptor(config, versionPaths.cleanupPath);
  } catch (error) {
    const cleanupError = launcherCleanupErrorFrom(error);
    logger.warn("[open-design updater] skipped post-commit launcher cleanup because cleanup state is invalid", {
      error: cleanupError.message,
      errorCode: cleanupError.code,
      event: "launcher-payload-cleanup",
      path: versionPaths.cleanupPath,
      trigger,
    });
    return;
  }

  const retainedVersions = new Set([
    ...keepVersions,
    ...(cleanup?.versions.filter((entry) => entry.state === "retained").map((entry) => entry.version) ?? []),
  ]);
  let entries;
  try {
    entries = await readdir(versionPaths.versionsRoot, { withFileTypes: true });
  } catch (error) {
    const cleanupError = launcherCleanupErrorFrom(error);
    logger.warn("[open-design updater] failed to scan launcher payload versions after commit", {
      error: cleanupError.message,
      errorCode: cleanupError.code,
      event: "launcher-payload-cleanup",
      path: versionPaths.versionsRoot,
      trigger,
    });
    return;
  }

  const failures: LauncherPayloadCleanupFailure[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || retainedVersions.has(entry.name)) continue;
    const path = join(versionPaths.versionsRoot, entry.name);
    try {
      await removeLauncherPayloadRoot(path);
    } catch (error) {
      const cleanupError = launcherCleanupErrorFrom(error);
      failures.push({ error: cleanupError, version: entry.name });
      logger.warn("[open-design updater] deferred launcher payload cleanup", {
        error: cleanupError.message,
        errorCode: cleanupError.code,
        event: "launcher-payload-cleanup",
        path,
        trigger,
        version: entry.name,
      });
    }
  }
  if (failures.length === 0) return;

  try {
    await writeDeferredLauncherCleanupFailures({
      cleanup,
      config,
      currentRuntime,
      failures,
      nowIso: now().toISOString(),
      path: versionPaths.cleanupPath,
    });
  } catch (error) {
    const cleanupError = launcherCleanupErrorFrom(error);
    logger.warn("[open-design updater] failed to persist deferred launcher payload cleanup", {
      error: cleanupError.message,
      errorCode: cleanupError.code,
      event: "launcher-payload-cleanup",
      path: versionPaths.cleanupPath,
      trigger,
    });
  }
}

function macDeferredInstallerScript(): string {
  return `#!/bin/sh
set -eu
target_pid="$1"
installer_path="$2"
timeout_seconds="$3"
cleanup() {
  rm -f "$0"
}
trap cleanup EXIT
deadline=$(($(date +%s) + timeout_seconds))
while kill -0 "$target_pid" 2>/dev/null; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    exit 1
  fi
  sleep 1
done
open "$installer_path" >/dev/null 2>&1 &
exit 0
`;
}

function windowsDeferredInstallerScript(): string {
  return `param(
  [Parameter(Mandatory = $true)]
  [int]$TargetPid,

  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [int]$TimeoutMs,

  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = "Stop"

function Write-HelperLog {
  param([string]$Message)
  try {
    Add-Content -LiteralPath $LogPath -Value ("{0:o} {1}" -f (Get-Date), $Message)
  } catch {
  }
}

try {
  Write-HelperLog ("armed for pid={0} installer={1}" -f $TargetPid, $InstallerPath)
  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  while ($null -ne (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue)) {
    if ((Get-Date) -ge $deadline) {
      throw ("timed out waiting for pid={0}" -f $TargetPid)
    }
    Start-Sleep -Milliseconds 250
  }

  Write-HelperLog ("observed pid={0} exit; opening installer" -f $TargetPid)
  Write-HelperLog "waiting for launch handoff"
  Start-Sleep -Milliseconds 1500
  Start-Process -FilePath $InstallerPath -WorkingDirectory (Split-Path -Parent $InstallerPath)
  Write-HelperLog "installer launch requested"
} catch {
  Write-HelperLog ("failed: {0}" -f $_.Exception.Message)
  exit 1
} finally {
  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
}
`;
}

function windowsDeferredInstallerLauncherScript(): string {
  return `param(
  [Parameter(Mandatory = $true)]
  [string]$PowerShellPath,

  [Parameter(Mandatory = $true)]
  [string]$HelperPath,

  [Parameter(Mandatory = $true)]
  [int]$TargetPid,

  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [int]$TimeoutMs,

  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = "Stop"

function Quote-WindowsPowerShellArgument {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\\"') + '"'
}

function Write-LauncherLog {
  param([string]$Message)
  try {
    Add-Content -LiteralPath $LogPath -Value ("{0:o} {1}" -f (Get-Date), $Message)
  } catch {
  }
}

try {
  Write-LauncherLog ("launching helper={0}" -f $HelperPath)
  $arguments = @(
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-WindowsPowerShellArgument $HelperPath),
    "-TargetPid",
    $TargetPid.ToString(),
    "-InstallerPath",
    (Quote-WindowsPowerShellArgument $InstallerPath),
    "-TimeoutMs",
    $TimeoutMs.ToString(),
    "-LogPath",
    (Quote-WindowsPowerShellArgument $LogPath)
  ) -join " "
  Start-Process -FilePath $PowerShellPath -WindowStyle Hidden -ArgumentList $arguments
  Write-LauncherLog "helper launch requested"
} catch {
  Write-LauncherLog ("launcher failed: {0}" -f $_.Exception.Message)
  exit 1
} finally {
  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
}
`;
}

function windowsPowerShellCommand(env: NodeJS.ProcessEnv = process.env): string {
  const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows";
  return join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

async function launchMacInstallerAfterQuit(
  input: DeferredInstallerLaunchInput,
  deps: { now: () => Date; spawnDetached: SpawnInstallerHelper },
): Promise<string> {
  try {
    const helpersRoot = await ensureOwnedSubdir(input.root, HELPERS_DIR);
    const suffix = `${deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const scriptPath = join(helpersRoot, `open-installer-after-quit-${suffix}.sh`);
    await writeFile(scriptPath, macDeferredInstallerScript(), { encoding: "utf8", mode: 0o700 });
    await chmod(scriptPath, 0o700);
    const timeoutSeconds = Math.max(1, Math.ceil(input.timeoutMs / 1000)).toString();
    const child = deps.spawnDetached(
      "/bin/sh",
      [scriptPath, input.appPid.toString(), input.installerPath, timeoutSeconds],
      { cwd: input.cwd, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function launchWindowsInstallerAfterQuit(
  input: DeferredInstallerLaunchInput,
  deps: { now: () => Date; spawnDetached: SpawnInstallerHelper },
): Promise<string> {
  try {
    const helpersRoot = await ensureOwnedSubdir(input.root, HELPERS_DIR);
    const suffix = `${deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const scriptPath = join(helpersRoot, `open-installer-after-quit-${suffix}.ps1`);
    const launcherPath = join(helpersRoot, `open-installer-after-quit-${suffix}.launcher.ps1`);
    const logPath = join(helpersRoot, `open-installer-after-quit-${suffix}.log`);
    const powerShellPath = windowsPowerShellCommand();
    await writeFile(scriptPath, windowsDeferredInstallerScript(), { encoding: "utf8" });
    await writeFile(launcherPath, windowsDeferredInstallerLauncherScript(), { encoding: "utf8" });
    const child = deps.spawnDetached(
      powerShellPath,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        launcherPath,
        "-PowerShellPath",
        powerShellPath,
        "-HelperPath",
        scriptPath,
        "-TargetPid",
        input.appPid.toString(),
        "-InstallerPath",
        input.installerPath,
        "-TimeoutMs",
        input.timeoutMs.toString(),
        "-LogPath",
        logPath,
      ],
      { cwd: input.cwd, detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function launchPayloadAppAfterQuit(
  input: DeferredAppLaunchInput,
  deps: { now: () => Date; spawnDetached: SpawnInstallerHelper },
): Promise<DeferredLaunchResult> {
  try {
    const child = deps.spawnDetached(
      input.launchPath,
      [
        ...buildLauncherAfterQuitArgs({ targetPid: input.appPid, timeoutMs: input.timeoutMs }),
        ...(input.delegated == null ? [] : buildLauncherDelegatedArgs(input.delegated)),
      ],
      { cwd: input.cwd, detached: true, stdio: "ignore", windowsHide: true },
    );
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      child.once("spawn", () => resolveSpawn());
      child.once("error", rejectSpawn);
    });
    child.unref();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function cleanupBackDirectory(root: string, logger: DesktopUpdaterLogger): Promise<void> {
  const backDir = join(root, BACK_DIR);
  const entry = await lstat(backDir).catch(() => null);
  if (entry == null) return;
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    logger.warn("[open-design updater] skipped invalid update backup directory", backDir);
    return;
  }
  const realBackDir = await realpath(backDir).catch(() => null);
  if (realBackDir == null || !containsPath(root, realBackDir)) {
    logger.warn("[open-design updater] skipped escaped update backup directory", backDir);
    return;
  }
  const entries = await readdir(backDir);
  await Promise.all(entries.map(async (entry) => {
    const path = join(backDir, entry);
    const resolved = resolve(path);
    if (!containsPath(root, resolved)) return;
    const stats = await lstat(resolved).catch(() => null);
    if (stats == null || stats.isSymbolicLink()) return;
    if (stats.isDirectory()) {
      const real = await realpath(resolved).catch(() => null);
      if (real == null || !containsPath(root, real)) return;
    }
    await rm(resolved, { force: true, recursive: true }).catch((error: unknown) => {
      logger.warn("[open-design updater] failed to clean update backup entry", error);
    });
  }));
}

function scheduleBackCleanup(root: string, logger: DesktopUpdaterLogger): void {
  void cleanupBackDirectory(root, logger).catch((error: unknown) => {
    logger.warn("[open-design updater] failed to clean update backup directory", error);
  });
}

function isReleaseLifecycleState(value: unknown): value is DesktopUpdateReleaseLifecycleState {
  return value === "cleanup-deferred" ||
    value === "cleanup-removed" ||
    value === "deprecated" ||
    value === "retained" ||
    value === "unknown";
}

function isReleaseCleanupReason(value: unknown): value is ReleaseCleanupReason {
  return value === "cleanup-failed" ||
    value === "current-version-or-newer" ||
    value === "manual-clear" ||
    value === "metadata-invalid" ||
    value === "metadata-missing" ||
    value === "older-than-current-version";
}

function isDesktopUpdateErrorSnapshot(value: unknown): value is DesktopUpdateErrorSnapshot {
  if (!isRecord(value)) return false;
  return stringField(value, "code") != null && stringField(value, "message") != null;
}

function isReleaseCleanupEntry(value: unknown): value is ReleaseCleanupEntry {
  if (!isRecord(value)) return false;
  if (stringField(value, "key") == null) return false;
  if (stringField(value, "path") == null) return false;
  if (!isReleaseLifecycleState(value.state)) return false;
  if (!isReleaseCleanupReason(value.reason)) return false;
  if (stringField(value, "updatedAt") == null) return false;
  if (value.currentVersion != null && typeof value.currentVersion !== "string") return false;
  if (value.deprecatedAt != null && typeof value.deprecatedAt !== "string") return false;
  if (value.metadataPath != null && typeof value.metadataPath !== "string") return false;
  if (value.readyVersion != null && typeof value.readyVersion !== "string") return false;
  if (value.removedAt != null && typeof value.removedAt !== "string") return false;
  if (value.version != null && typeof value.version !== "string") return false;
  if (value.error != null && !isDesktopUpdateErrorSnapshot(value.error)) return false;
  return true;
}

function isReleaseCleanupDescriptor(value: unknown): value is ReleaseCleanupDescriptor {
  if (!isRecord(value)) return false;
  if (value.version !== RELEASE_CLEANUP_DESCRIPTOR_VERSION) return false;
  if (typeof value.platform !== "string") return false;
  if (value.trigger !== "cold-start" && value.trigger !== "manual" && value.trigger !== "next-version-ready") return false;
  if (typeof value.updatedAt !== "string") return false;
  if (value.currentVersion != null && typeof value.currentVersion !== "string") return false;
  if (value.readyVersion != null && typeof value.readyVersion !== "string") return false;
  if (!Array.isArray(value.releases)) return false;
  return value.releases.every(isReleaseCleanupEntry);
}

function emptyLifecycleSummary(platform: string): DesktopUpdateCacheLifecycleSummary {
  return {
    platform,
    releases: {
      cleanupDeferred: 0,
      cleanupRemoved: 0,
      deprecated: 0,
      errors: 0,
      retained: 0,
      total: 0,
      unknown: 0,
    },
  };
}

function summarizeReleaseCleanupDescriptor(
  descriptor: ReleaseCleanupDescriptor | null,
  platform: string,
): DesktopUpdateCacheLifecycleSummary {
  if (descriptor == null) return emptyLifecycleSummary(platform);
  const summary = emptyLifecycleSummary(descriptor.platform);
  summary.lastRunAt = descriptor.updatedAt;
  summary.lastTrigger = descriptor.trigger;
  summary.releases.total = descriptor.releases.length;
  for (const release of descriptor.releases) {
    if (release.state === "cleanup-deferred") summary.releases.cleanupDeferred += 1;
    if (release.state === "cleanup-removed") summary.releases.cleanupRemoved += 1;
    if (release.state === "deprecated") summary.releases.deprecated += 1;
    if (release.state === "retained") summary.releases.retained += 1;
    if (release.state === "unknown") summary.releases.unknown += 1;
    if (release.error != null) summary.releases.errors += 1;
  }
  return summary;
}

async function readReleaseCleanupDescriptor(layout: DesktopUpdaterStoreLayout): Promise<ReleaseCleanupDescriptor | null> {
  const raw = await readJson<unknown>(layout.cleanupPath);
  return isReleaseCleanupDescriptor(raw) ? raw : null;
}

function relativeStorePath(layout: DesktopUpdaterStoreLayout, path: string): string {
  return relative(layout.root, path);
}

function releaseCleanupError(code: string, message: string, details?: unknown): DesktopUpdateErrorSnapshot {
  return createError(code, message, details);
}

async function withUpdaterLifecycleLock<T>(
  layout: DesktopUpdaterStoreLayout,
  logger: DesktopUpdaterLogger,
  task: () => Promise<T>,
  options: { reclaimStale?: boolean } = {},
): Promise<T | null> {
  await mkdir(layout.stateRoot, { recursive: true });
  const acquire = async (): Promise<boolean> => {
    try {
      await mkdir(layout.lockRoot);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return false;
    }
  };
  let acquired = await acquire();
  if (!acquired && options.reclaimStale === true) {
    const owner = await readJson<unknown>(join(layout.lockRoot, LOCK_OWNER_FILE));
    const ownerPid = isRecord(owner) && owner.owner === "open-design-updater-lifecycle"
      && owner.version === RELEASE_CLEANUP_DESCRIPTOR_VERSION
      && typeof owner.pid === "number" && Number.isSafeInteger(owner.pid) && owner.pid > 0
      ? owner.pid
      : null;
    let ownerIsDead = false;
    if (ownerPid != null) {
      try {
        process.kill(ownerPid, 0);
      } catch (error) {
        ownerIsDead = (error as NodeJS.ErrnoException).code === "ESRCH";
      }
    }
    if (ownerIsDead) {
      const staleLockRoot = `${layout.lockRoot}.stale-${process.pid}-${Date.now()}`;
      try {
        await rename(layout.lockRoot, staleLockRoot);
        await rm(staleLockRoot, { force: true, recursive: true });
        acquired = await acquire();
        if (acquired) {
          logger.warn("[open-design updater] reclaimed stale updater lifecycle lock", {
            lockRoot: layout.lockRoot,
            ownerPid,
          });
        }
      } catch (error) {
        logger.warn("[open-design updater] failed to reclaim stale updater lifecycle lock", error);
      }
    }
  }
  if (!acquired) {
    logger.warn("[open-design updater] skipped release lifecycle because updater lifecycle lock is held", {
      lockRoot: layout.lockRoot,
    });
    return null;
  }
  try {
    await writeJson(join(layout.lockRoot, LOCK_OWNER_FILE), {
      createdAt: new Date().toISOString(),
      owner: "open-design-updater-lifecycle",
      pid: process.pid,
      version: RELEASE_CLEANUP_DESCRIPTOR_VERSION,
    });
    return await task();
  } finally {
    await rm(layout.lockRoot, { force: true, recursive: true }).catch((error: unknown) => {
      logger.warn("[open-design updater] failed to release updater lifecycle lock", error);
    });
  }
}

function mergeExistingReleaseCleanupEntry(
  existing: ReleaseCleanupEntry | undefined,
  next: ReleaseCleanupEntry,
): ReleaseCleanupEntry {
  if (next.state !== "deprecated" && next.state !== "cleanup-deferred") return next;
  return {
    ...next,
    deprecatedAt: existing?.deprecatedAt ?? next.deprecatedAt,
  };
}

async function scanReleaseCleanupEntries(input: {
  config: DesktopUpdaterConfig;
  // Manual clear resets the downloaded-update state entirely, so every scanned
  // release is deprecated regardless of its version relative to the running one.
  deprecateAll?: boolean;
  descriptor: ReleaseCleanupDescriptor | null;
  layout: DesktopUpdaterStoreLayout;
  nowIso: string;
  readyVersion?: string;
}): Promise<ReleaseCleanupEntry[]> {
  const { config, deprecateAll, descriptor, layout, nowIso, readyVersion } = input;
  const existing = new Map((descriptor?.releases ?? []).map((entry) => [entry.key, entry] as const));
  const entries = await readdir(layout.releasesRoot, { withFileTypes: true }).catch(() => []);
  const nextEntries: ReleaseCleanupEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const releaseDir = resolve(layout.releasesRoot, entry.name);
    if (!containsPath(layout.releasesRoot, releaseDir)) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-path-escaped", "release directory escaped releases root", { path: releaseDir }),
        key: entry.name,
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-invalid",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }
    const releaseEntry = await lstat(releaseDir).catch(() => null);
    if (releaseEntry == null || !releaseEntry.isDirectory() || releaseEntry.isSymbolicLink()) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-path-invalid", "release entry is not a plain directory", { path: releaseDir }),
        key: entry.name,
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-invalid",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }
    const metadataPath = join(releaseDir, "metadata.json");
    let metadata: unknown;
    try {
      metadata = await readJsonStrict<unknown>(metadataPath);
    } catch (error) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-metadata-missing", "release metadata.json could not be read", {
          reason: error instanceof Error ? error.message : String(error),
        }),
        key: entry.name,
        metadataPath: relativeStorePath(layout, metadataPath),
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-missing",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }
    if (!isRecord(metadata)) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-metadata-invalid", "release metadata.json is not an object"),
        key: entry.name,
        metadataPath: relativeStorePath(layout, metadataPath),
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-invalid",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }
    const version = releaseVersionForChannel(metadata, config.channel);
    if (version == null) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-version-missing", "release metadata does not expose a version for the updater channel", {
          channel: config.channel,
        }),
        key: entry.name,
        metadataPath: relativeStorePath(layout, metadataPath),
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-invalid",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }

    const deprecated = deprecateAll === true || compareVersions(version, config.currentVersion) < 0;
    const next: ReleaseCleanupEntry = {
      currentVersion: config.currentVersion,
      key: entry.name,
      metadataPath: relativeStorePath(layout, metadataPath),
      path: relativeStorePath(layout, releaseDir),
      ...(readyVersion == null ? {} : { readyVersion }),
      reason: deprecateAll === true
        ? "manual-clear"
        : deprecated
          ? "older-than-current-version"
          : "current-version-or-newer",
      state: deprecated ? "deprecated" : "retained",
      updatedAt: nowIso,
      version,
      ...(deprecated ? { deprecatedAt: nowIso } : {}),
    };
    nextEntries.push(mergeExistingReleaseCleanupEntry(existing.get(entry.name), next));
  }

  for (const previous of descriptor?.releases ?? []) {
    if (nextEntries.some((entry) => entry.key === previous.key)) continue;
    if (previous.state === "cleanup-removed") nextEntries.push(previous);
  }

  nextEntries.sort((left, right) => left.key.localeCompare(right.key));
  return nextEntries;
}

async function cleanupDeprecatedReleaseEntries(input: {
  descriptor: ReleaseCleanupDescriptor;
  layout: DesktopUpdaterStoreLayout;
  logger: DesktopUpdaterLogger;
  nowIso: string;
}): Promise<ReleaseCleanupDescriptor> {
  const { descriptor, layout, logger, nowIso } = input;
  const releases: ReleaseCleanupEntry[] = [];
  for (const entry of descriptor.releases) {
    if (entry.state !== "deprecated" && entry.state !== "cleanup-deferred") {
      releases.push(entry);
      continue;
    }
    const releaseDir = resolve(layout.root, entry.path);
    if (!containsPath(layout.releasesRoot, releaseDir)) {
      releases.push({
        ...entry,
        error: releaseCleanupError("release-cleanup-path-escaped", "deprecated release path escaped releases root", {
          path: releaseDir,
        }),
        reason: "cleanup-failed",
        state: "cleanup-deferred",
        updatedAt: nowIso,
      });
      continue;
    }
    try {
      const releaseEntry = await lstat(releaseDir).catch(() => null);
      if (releaseEntry != null && (!releaseEntry.isDirectory() || releaseEntry.isSymbolicLink())) {
        throw new Error(`release cleanup target is not a plain directory: ${releaseDir}`);
      }
      if (releaseEntry?.isDirectory()) {
        const realReleaseDir = await realpath(releaseDir);
        if (!containsPath(layout.releasesRoot, realReleaseDir)) {
          throw new Error(`release cleanup target escaped releases root: ${realReleaseDir}`);
        }
      }
      await rm(releaseDir, { force: true, recursive: true });
      releases.push({
        ...entry,
        error: undefined,
        removedAt: entry.removedAt ?? nowIso,
        state: "cleanup-removed",
        updatedAt: nowIso,
      });
    } catch (error) {
      logger.warn("[open-design updater] failed to clean deprecated release", {
        error: error instanceof Error ? error.message : String(error),
        key: entry.key,
        path: releaseDir,
      });
      releases.push({
        ...entry,
        error: releaseCleanupError("release-cleanup-failed", error instanceof Error ? error.message : String(error)),
        reason: "cleanup-failed",
        state: "cleanup-deferred",
        updatedAt: nowIso,
      });
    }
  }
  return {
    ...descriptor,
    releases,
    updatedAt: nowIso,
  };
}

async function runUpdateReleaseLifecycle(input: {
  config: DesktopUpdaterConfig;
  layout: DesktopUpdaterStoreLayout;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  reclaimStaleLock?: boolean;
  readyVersion?: string;
  trigger: DesktopUpdateCacheLifecycleTrigger;
}): Promise<DesktopUpdateCacheLifecycleSummary | null> {
  const { config, layout, logger, now, readyVersion, trigger } = input;
  return await withUpdaterLifecycleLock(layout, logger, async () => {
    const startedAt = now().toISOString();
    const current = await readReleaseCleanupDescriptor(layout);
    let next: ReleaseCleanupDescriptor;
    if (trigger === "next-version-ready" || trigger === "manual") {
      next = {
        currentVersion: config.currentVersion,
        platform: config.platform,
        ...(readyVersion == null ? {} : { readyVersion }),
        releases: await scanReleaseCleanupEntries({
          config,
          deprecateAll: trigger === "manual",
          descriptor: current,
          layout,
          nowIso: startedAt,
          readyVersion,
        }),
        trigger,
        updatedAt: startedAt,
        version: RELEASE_CLEANUP_DESCRIPTOR_VERSION,
      };
      await writeJson(layout.cleanupPath, next);
    } else {
      next = current ?? {
        currentVersion: config.currentVersion,
        platform: config.platform,
        releases: [],
        trigger,
        updatedAt: startedAt,
        version: RELEASE_CLEANUP_DESCRIPTOR_VERSION,
      };
    }

    const cleaned = await cleanupDeprecatedReleaseEntries({
      descriptor: {
        ...next,
        currentVersion: config.currentVersion,
        platform: config.platform,
        trigger,
        updatedAt: startedAt,
      },
      layout,
      logger,
      nowIso: now().toISOString(),
    });
    await writeJson(layout.cleanupPath, cleaned);
    return summarizeReleaseCleanupDescriptor(cleaned, config.platform);
  }, { reclaimStale: input.reclaimStaleLock });
}

function launcherCleanupError(code: string, message: string): NonNullable<LauncherCleanupEntry["error"]> {
  return { code, message };
}

function summarizeLauncherCleanupDescriptor(descriptor: LauncherCleanupDescriptor): LauncherCleanupLifecycleSummary {
  const summary: LauncherCleanupLifecycleSummary = {
    cleanupDeferred: 0,
    cleanupRemoved: 0,
    deprecated: 0,
    retained: 0,
    total: descriptor.versions.length,
  };
  for (const version of descriptor.versions) {
    if (version.state === "cleanup-deferred") summary.cleanupDeferred += 1;
    if (version.state === "cleanup-removed") summary.cleanupRemoved += 1;
    if (version.state === "deprecated") summary.deprecated += 1;
    if (version.state === "retained") summary.retained += 1;
  }
  return summary;
}

/**
 * Manual disaster-recovery clear of launcher-side state: removes a stale
 * attempt.json, removes a non-terminal desktop-handoff journal, and deletes
 * any payload version directory not retained by runtime pointers or explicit
 * retained cleanup entries. The running desktop's own version is always
 * retained through runtime.active. A confirmed handoff journal is a successful
 * terminal state consulted by historical-outer cold starts and must survive.
 * When the runtime descriptor is unreadable the retained set is unknown, so
 * version cleanup is skipped entirely rather than risking the active payload.
 */
async function clearLauncherStateForManualClear(input: {
  config: DesktopUpdaterConfig;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  removeLauncherPayloadRoot: (path: string) => Promise<void>;
}): Promise<void> {
  const { config, logger, now, removeLauncherPayloadRoot } = input;
  if (config.launcherRoot == null || config.launcherRuntimePath == null || config.namespace == null) return;
  const launcherPaths = resolveLauncherPaths({
    channel: config.channel,
    namespace: config.namespace,
    root: config.launcherRoot,
  });

  // The app is running its active payload right now, so an unconfirmed attempt
  // is leftover state from an interrupted transition. Removing it means the
  // next cold start retries the active pointer instead of rolling back — the
  // deliberate trade of a manual reset.
  await rm(launcherPaths.attemptsPath, { force: true }).catch((error: unknown) => {
    logger.warn("[open-design updater] failed to clear stale launcher attempt", {
      error: error instanceof Error ? error.message : String(error),
      path: launcherPaths.attemptsPath,
    });
  });

  const rawHandoff = await readFile(launcherPaths.handoffPath, "utf8").catch(() => null);
  if (rawHandoff != null) {
    let confirmed = false;
    try {
      const parsed: unknown = JSON.parse(rawHandoff);
      confirmed = isRecord(parsed) && parsed.state === "confirmed";
    } catch {
      confirmed = false;
    }
    if (!confirmed) {
      await rm(launcherPaths.handoffPath, { force: true }).catch((error: unknown) => {
        logger.warn("[open-design updater] failed to clear stale desktop handoff journal", {
          error: error instanceof Error ? error.message : String(error),
          path: launcherPaths.handoffPath,
        });
      });
    }
  }

  let runtime: LauncherRuntimeDescriptor;
  try {
    runtime = validateLauncherRuntimeDescriptor(
      await readJsonStrict<LauncherRuntimeDescriptor>(config.launcherRuntimePath),
      { channel: config.channel, namespace: config.namespace },
    );
  } catch (error) {
    logger.warn("[open-design updater] skipped manual launcher version cleanup because runtime state is unreadable", {
      error: error instanceof Error ? error.message : String(error),
      runtimePath: config.launcherRuntimePath,
    });
    return;
  }
  const keepVersions = new Set<string>([
    ...(runtime.active == null ? [] : [runtime.active.version]),
    ...(runtime.lastSuccessful == null ? [] : [runtime.lastSuccessful.version]),
  ]);
  const versionPaths = resolveLauncherVersionPaths({
    channel: config.channel,
    namespace: config.namespace,
    root: config.launcherRoot,
    version: runtime.active?.version ?? config.currentVersion,
  });
  await cleanupLauncherPayloadRoots({
    config,
    currentRuntime: runtime,
    keepVersions,
    logger,
    now,
    removeLauncherPayloadRoot,
    trigger: "manual-clear",
    versionPaths,
  });
}

async function runLauncherCleanupLifecycle(input: {
  config: DesktopUpdaterConfig;
  logger: DesktopUpdaterLogger;
  now: () => Date;
}): Promise<LauncherCleanupLifecycleSummary | null> {
  const { config, logger, now } = input;
  if (config.launcherRoot == null || config.launcherRuntimePath == null || config.namespace == null) return null;

  const launcherPaths = resolveLauncherPaths({
    channel: config.channel,
    namespace: config.namespace,
    root: config.launcherRoot,
  });
  const rawCleanup = await readJson<unknown>(launcherPaths.cleanupPath);
  if (rawCleanup == null) return null;

  let cleanup: LauncherCleanupDescriptor;
  let runtime: LauncherRuntimeDescriptor;
  try {
    cleanup = validateLauncherCleanupDescriptor(rawCleanup as LauncherCleanupDescriptor, {
      channel: config.channel,
      namespace: config.namespace,
    });
    runtime = validateLauncherRuntimeDescriptor(
      await readJsonStrict<LauncherRuntimeDescriptor>(config.launcherRuntimePath),
      { channel: config.channel, namespace: config.namespace },
    );
  } catch (error) {
    logger.warn("[open-design updater] failed to read launcher cleanup lifecycle inputs", {
      error: error instanceof Error ? error.message : String(error),
      cleanupPath: launcherPaths.cleanupPath,
      runtimePath: config.launcherRuntimePath,
    });
    return null;
  }

  const nowIso = now().toISOString();
  const retainedVersions = new Set<string>([
    ...(runtime.active == null ? [] : [runtime.active.version]),
    ...(runtime.lastSuccessful == null ? [] : [runtime.lastSuccessful.version]),
    ...cleanup.versions.filter((entry) => entry.state === "retained").map((entry) => entry.version),
  ]);
  const nextVersions: LauncherCleanupEntry[] = [];

  for (const entry of cleanup.versions) {
    if (entry.state !== "deprecated" && entry.state !== "cleanup-deferred") {
      nextVersions.push(entry);
      continue;
    }
    if (retainedVersions.has(entry.version)) {
      nextVersions.push({
        ...entry,
        error: launcherCleanupError("launcher-cleanup-retained", "deprecated launcher version is retained by runtime state"),
        reason: "cleanup-failed",
        state: "cleanup-deferred",
        updatedAt: nowIso,
      });
      continue;
    }

    const versionPaths = resolveLauncherVersionPaths({
      channel: config.channel,
      namespace: config.namespace,
      root: config.launcherRoot,
      version: entry.version,
    });
    try {
      const versionEntry = await lstat(versionPaths.versionRoot).catch(() => null);
      if (versionEntry != null && (!versionEntry.isDirectory() || versionEntry.isSymbolicLink())) {
        throw new Error(`launcher cleanup target is not a plain directory: ${versionPaths.versionRoot}`);
      }
      if (versionEntry?.isDirectory()) {
        const realVersionsRoot = await realpath(versionPaths.versionsRoot);
        const realVersionRoot = await realpath(versionPaths.versionRoot);
        if (!containsPath(realVersionsRoot, realVersionRoot)) {
          throw new Error(`launcher cleanup target escaped versions root: ${realVersionRoot}`);
        }
      }
      await rm(versionPaths.versionRoot, { force: true, recursive: true });
      nextVersions.push({
        ...entry,
        error: undefined,
        removedAt: entry.removedAt ?? nowIso,
        state: "cleanup-removed",
        updatedAt: nowIso,
      });
    } catch (error) {
      logger.warn("[open-design updater] failed to clean deprecated launcher payload", {
        error: error instanceof Error ? error.message : String(error),
        path: versionPaths.versionRoot,
        version: entry.version,
      });
      nextVersions.push({
        ...entry,
        error: launcherCleanupError("launcher-cleanup-failed", error instanceof Error ? error.message : String(error)),
        reason: "cleanup-failed",
        state: "cleanup-deferred",
        updatedAt: nowIso,
      });
    }
  }

  const next: LauncherCleanupDescriptor = {
    ...cleanup,
    updatedAt: nowIso,
    versions: nextVersions,
  };
  await writeJson(launcherPaths.cleanupPath, next);
  return summarizeLauncherCleanupDescriptor(next);
}

async function readStoreMetadata(root: OwnedRoot & { ok: true }, logger: DesktopUpdaterLogger): Promise<
  | { metadata: UpdateStoreMetadata; ok: true }
  | { error: DesktopUpdateErrorSnapshot; ok: false }
> {
  try {
    const metadata = await readJsonStrict<unknown>(root.metadataPath);
    if (!isUpdateStoreMetadata(metadata)) {
      const error = storeShapeError(root.realRoot, "updates/metadata.json does not match the updater store schema", {
        path: root.metadataPath,
      });
      logStoreError(logger, error);
      return { ok: false, error };
    }
    return { ok: true, metadata };
  } catch (error) {
    const storeError = storeShapeError(root.realRoot, "updates/metadata.json could not be read as JSON", {
      path: root.metadataPath,
      reason: error instanceof Error ? error.message : String(error),
    });
    logStoreError(logger, storeError);
    return { ok: false, error: storeError };
  }
}

async function writeStoreMetadata(root: OwnedRoot & { ok: true }, metadata: UpdateStoreMetadata): Promise<void> {
  await writeJson(root.metadataPath, metadata);
}

async function clearInterruptedIncomingDownload(
  root: OwnedRoot & { ok: true },
  metadata: UpdateStoreMetadata,
  logger: DesktopUpdaterLogger,
): Promise<UpdateStoreMetadata> {
  const incoming = metadata.incoming;
  if (incoming == null) return metadata;
  const stagingRoot = resolve(root.realRoot, STAGING_DIR);
  const stagingDir = resolve(stagingRoot, incoming.cycleId);
  if (containsPath(stagingRoot, stagingDir)) {
    await rm(stagingDir, { force: true, recursive: true }).catch((error: unknown) => {
      logger.warn("[open-design updater] failed to clean interrupted update staging directory", error);
    });
  } else {
    logger.warn("[open-design updater] skipped escaped interrupted update staging directory", {
      cycleId: incoming.cycleId,
      stagingDir,
    });
  }
  const next = {
    ...metadata,
    incoming: undefined,
  };
  await writeStoreMetadata(root, next);
  logger.warn("[open-design updater] cleared interrupted update download", {
    cycleId: incoming.cycleId,
    version: incoming.version,
  });
  return next;
}

function releaseSnapshot(active: LoadedRelease): DesktopUpdateStatusSnapshot["active"] {
  const ref = active.ref;
  return {
    arch: ref.arch,
    artifact: ref.artifact,
    checksum: ref.checksum,
    channel: ref.channel,
    downloadedAt: ref.downloadedAt,
    key: ref.key,
    metadata: ref.metadata,
    path: active.path,
    platformKey: ref.platformKey,
    version: ref.version,
  };
}

function incomingSnapshot(incoming: IncomingRef, progress?: DesktopUpdateProgressSnapshot): DesktopUpdateStatusSnapshot["incoming"] {
  return {
    arch: incoming.arch,
    artifact: incoming.artifact,
    channel: incoming.channel,
    key: incoming.cycleId,
    metadata: incoming.metadata,
    ...(progress == null ? {} : { progress }),
    startedAt: incoming.startedAt,
    version: incoming.version,
  };
}

async function loadActiveRelease(
  root: OwnedRoot & { ok: true },
  metadata: UpdateStoreMetadata,
  config: DesktopUpdaterConfig,
  logger: DesktopUpdaterLogger,
  allowCurrentVersion = false,
): Promise<{ active: LoadedRelease | null; ok: true } | { error: DesktopUpdateErrorSnapshot; ok: false }> {
  const active = metadata.active;
  if (active == null) return { ok: true, active: null };
  const currentVersionComparison = compareVersions(active.version, config.currentVersion);
  if (currentVersionComparison < 0 || (currentVersionComparison === 0 && !allowCurrentVersion)) {
    return { ok: true, active: null };
  }
  const artifactPath = resolve(root.realRoot, active.artifactPath);
  if (!containsPath(root.realRoot, artifactPath)) {
    const error = storeShapeError(root.realRoot, "active release artifact path escaped update root", { artifactPath });
    logStoreError(logger, error);
    return { ok: false, error };
  }
  try {
    const file = await stat(artifactPath);
    if (!file.isFile()) {
      const error = storeShapeError(root.realRoot, "active release artifact is not a file", { artifactPath });
      logStoreError(logger, error);
      return { ok: false, error };
    }
  } catch (error) {
    const storeError = storeShapeError(root.realRoot, "active release artifact is missing", {
      artifactPath,
      reason: error instanceof Error ? error.message : String(error),
    });
    logStoreError(logger, storeError);
    return { ok: false, error: storeError };
  }
  return { ok: true, active: { path: artifactPath, ref: active } };
}

async function loadVerifiedReleaseForCandidate(
  root: OwnedRoot & { ok: true },
  candidate: UpdateCandidate,
): Promise<LoadedRelease | null> {
  const releasesRoot = resolve(root.realRoot, RELEASES_DIR);
  const entries = await readdir(releasesRoot, { withFileTypes: true }).catch(() => []);
  const outputName = artifactFileName(candidate);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const releaseDir = resolve(releasesRoot, entry.name);
    if (!containsPath(root.realRoot, releaseDir)) continue;

    const checksum = await readJson<unknown>(join(releaseDir, "checksum.json"));
    if (!isResolvedChecksumSnapshot(checksum) || !checksumMatchesCandidate(checksum, candidate)) continue;
    if (entry.name !== releaseKey(candidate, checksum)) continue;

    const metadata = await readJson<unknown>(join(releaseDir, "metadata.json"));
    if (!isRecord(metadata)) continue;

    const artifactPath = resolve(releaseDir, outputName);
    if (!containsPath(root.realRoot, artifactPath)) continue;
    const artifactStat = await stat(artifactPath).catch(() => null);
    if (artifactStat == null || !artifactStat.isFile()) continue;
    const digest = await hashFile(artifactPath, checksum.algorithm).catch(() => null);
    if (digest?.toLowerCase() !== checksum.value.toLowerCase()) continue;

    const ref: UpdateReleaseRef = {
      arch: candidate.arch,
      artifact: candidate.artifact,
      artifactPath: relative(root.realRoot, artifactPath),
      checksum,
      checksumPath: relative(root.realRoot, join(releaseDir, "checksum.json")),
      channel: candidate.channel,
      downloadedAt: artifactStat.mtime.toISOString(),
      key: entry.name,
      metadata,
      metadataPath: relative(root.realRoot, join(releaseDir, "metadata.json")),
      platformKey: candidate.platformKey,
      version: candidate.version,
    };
    return { path: artifactPath, ref };
  }

  return null;
}

export function createDesktopUpdater(
  configInput: DesktopUpdaterConfigInput,
  deps: DesktopUpdaterDeps = {},
): DesktopUpdater {
  const config = resolveDesktopUpdaterConfig(configInput);
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => new Date());
  const openPath = deps.openPath ?? (async () => "openPath is not available");
  const processPid = deps.processPid ?? process.pid;
  const extractLauncherPayloadArchive = deps.extractLauncherPayloadArchive ?? defaultExtractLauncherPayloadArchive;
  const removeLauncherPayloadRoot = deps.removeLauncherPayloadRoot ?? (async (path) => {
    await rm(path, { force: true, recursive: true });
  });
  const spawnDetached: SpawnInstallerHelper = deps.spawnDetached ?? ((command, args, options) => spawn(command, args, options));
  const launchInstallerAfterQuit = deps.launchInstallerAfterQuit ?? ((input) => (
    config.platform === "win32"
      ? launchWindowsInstallerAfterQuit(input, { now, spawnDetached })
      : launchMacInstallerAfterQuit(input, { now, spawnDetached })
  ));
  const launchAppAfterQuit = deps.launchAppAfterQuit ?? (async (input) => {
    return await launchPayloadAppAfterQuit(input, { now, spawnDetached });
  });
  const listeners = new Set<() => void>();
  let candidate: UpdateCandidate | null = null;
  let activeRelease: LoadedRelease | null = null;
  let incomingRelease: IncomingRef | null = null;
  let metadata: Record<string, unknown> | null = null;
  let lastCheckedAt: string | undefined;
  let installResult: DesktopUpdateStatusSnapshot["installResult"];
  let installFrozen = false;
  let lifecycleSummary: DesktopUpdateCacheLifecycleSummary | undefined;
  let progress: DesktopUpdateProgressSnapshot | undefined;
  let reinstallRequirement: DesktopUpdateReinstallSnapshot | undefined;
  let state: DesktopUpdateState = DESKTOP_UPDATE_STATES.IDLE;
  let error: DesktopUpdateErrorSnapshot | undefined;
  let operation: Promise<unknown> = Promise.resolve();
  let restoreStatePromise: Promise<DesktopUpdateStatusSnapshot | null> | null = null;
  let storeStateRestored = false;
  const sessionId = `${now().toISOString()}-${processPid}`;

  function logUpdateEvent(event: string, fields: Record<string, unknown> = {}): void {
    logger.info?.("[open-design updater] lifecycle", {
      currentVersion: config.currentVersion,
      event,
      mode: config.mode,
      namespace: config.namespace,
      platform: config.platform,
      sessionId,
      source: config.source,
      ...fields,
    });
  }

  logUpdateEvent("session-start", {
    autoCheck: config.autoCheck,
    enabled: config.enabled,
    metadataUrl: config.metadataUrl,
  });

  function supported(): boolean {
    return config.enabled && config.mode === DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER && isSupportedPackageLauncherPlatform(config.platform);
  }

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setState(next: DesktopUpdateState, nextError?: DesktopUpdateErrorSnapshot): DesktopUpdateStatusSnapshot {
    const previous = state;
    state = next;
    error = nextError;
    const status = snapshot();
    if (previous !== next || nextError != null) {
      logUpdateEvent("state", {
        availableVersion: status.availableVersion,
        errorCode: nextError?.code,
        next,
        previous,
      });
    }
    emit();
    return status;
  }

  function snapshot(): DesktopUpdateStatusSnapshot {
    const statusSupported = supported();
    const active = activeRelease == null ? undefined : releaseSnapshot(activeRelease);
    const activeArtifact = activeRelease?.ref.artifact ?? (state === DESKTOP_UPDATE_STATES.AVAILABLE ? candidate?.artifact : undefined);
    const capabilityArtifactType = activeArtifact?.type ?? incomingRelease?.artifact.type ?? candidate?.artifact.type;
    const activeChecksum = activeRelease?.ref.checksum ?? (state === DESKTOP_UPDATE_STATES.AVAILABLE ? candidate?.checksum : undefined);
    const availableVersion = activeRelease?.ref.version ?? candidate?.version;
    const downloadPath = activeRelease?.path;
    const incoming = incomingRelease == null ? undefined : incomingSnapshot(incomingRelease, progress);
    return {
      ...(active == null ? {} : { active }),
      arch: config.arch,
      ...(activeArtifact == null ? {} : { artifact: activeArtifact }),
      ...(activeArtifact?.url == null ? {} : { artifactUrl: activeArtifact.url }),
      ...(availableVersion == null ? {} : { availableVersion }),
      ...(lifecycleSummary == null ? {} : { cache: { lifecycle: lifecycleSummary } }),
      capabilities: capabilitiesFor({
        artifactType: capabilityArtifactType,
        mode: config.mode,
        platform: config.platform,
        supported: statusSupported,
      }),
      channel: config.channel,
      ...(activeChecksum == null ? {} : { checksum: activeChecksum }),
      currentVersion: config.currentVersion,
      ...(downloadPath == null ? {} : { downloadPath }),
      enabled: config.enabled,
      ...(error == null ? {} : { error }),
      ...(incoming == null ? {} : { incoming }),
      ...(installResult == null ? {} : { installResult }),
      ...(lastCheckedAt == null ? {} : { lastCheckedAt }),
      ...(metadata == null ? {} : { metadata }),
      mode: config.mode,
      paths: { downloadRoot: config.downloadRoot, manifestPath: join(config.downloadRoot, STORE_METADATA_FILE) },
      platform: config.platform,
      ...(progress == null ? {} : { progress }),
      ...(reinstallRequirement == null ? {} : { reinstall: reinstallRequirement }),
      state,
      supported: statusSupported,
    };
  }

  function unsupportedStatus(): DesktopUpdateStatusSnapshot | null {
    if (!config.enabled) {
      return setState(DESKTOP_UPDATE_STATES.IDLE);
    }
    if (config.mode === DESKTOP_UPDATE_MODES.JS_INCREMENTAL) {
      return setState(
        DESKTOP_UPDATE_STATES.UNSUPPORTED,
        createError("update-mode-not-implemented", "js-incremental updates are not implemented yet"),
      );
    }
    if (!isSupportedPackageLauncherPlatform(config.platform)) {
      return setState(
        DESKTOP_UPDATE_STATES.UNSUPPORTED,
        createError("unsupported-platform", "package-launcher updates are currently supported on macOS and Windows only"),
      );
    }
    return null;
  }

  async function openStore(): Promise<
    | { metadata: UpdateStoreMetadata; ok: true; root: OwnedRoot & { ok: true } }
    | { ok: false; status: DesktopUpdateStatusSnapshot }
  > {
    const root = await ensureOwnedUpdateRoot(config, logger);
    if (!root.ok) return { ok: false, status: setState(DESKTOP_UPDATE_STATES.ERROR, root.error) };
    const loaded = await readStoreMetadata(root, logger);
    if (!loaded.ok) return { ok: false, status: setState(DESKTOP_UPDATE_STATES.ERROR, loaded.error) };
    return { ok: true, root, metadata: loaded.metadata };
  }

  async function preparePayloadReleaseForReady(release: LoadedRelease): Promise<DesktopUpdateStatusSnapshot | null> {
    if (release.ref.artifact.type !== "payload") return null;
    try {
      await prepareLauncherPayloadRelease({
        activeRelease: release,
        config,
        extractLauncherPayloadArchive,
        logger,
        now,
        removeLauncherPayloadRoot,
      });
      return null;
    } catch (prepareError) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("launcher-payload-prepare-failed", prepareError instanceof Error ? prepareError.message : String(prepareError)),
      );
    }
  }

  async function restoreStoreState(): Promise<DesktopUpdateStatusSnapshot | null> {
    const opened = await openStore();
    if (!opened.ok) return opened.status;
    const restoredMetadata = await clearInterruptedIncomingDownload(opened.root, opened.metadata, logger);
    const storedActive = restoredMetadata.active;
    const launcherPayloadContextValid = storedActive != null
      && storedActive.artifact.type === "installer"
      && compareVersions(storedActive.version, config.currentVersion) === 0
      && await hasValidLauncherPayloadContext(config);
    const restoredReinstallRequirement = launcherPayloadContextValid
      ? remoteRequiresReinstall(
          storedActive.metadata,
          config,
          await resolveInstalledOuterVersion(config),
        ) ?? undefined
      : undefined;
    const restoreSameVersionReinstall =
      restoredReinstallRequirement != null
      && restoredReinstallRequirement.reason !== "launcher-schema"
      && restoredReinstallRequirement.minVersion != null
      && storedActive != null
      && compareVersions(restoredReinstallRequirement.minVersion, storedActive.version) <= 0;
    const loadedActive = await loadActiveRelease(
      opened.root,
      restoredMetadata,
      config,
      logger,
      restoreSameVersionReinstall,
    );
    if (!loadedActive.ok) return setState(DESKTOP_UPDATE_STATES.ERROR, loadedActive.error);
    activeRelease = loadedActive.active;
    reinstallRequirement = activeRelease == null ? undefined : restoredReinstallRequirement;
    // If the app now runs at or beyond the stored active release, the
    // external installer succeeded and its one-shot UI state is stale.
    const clearedAppliedRelease =
      activeRelease == null &&
      (
        restoredMetadata.active != null ||
        restoredMetadata.installFrozen === true ||
        restoredMetadata.installResult != null
      );
    // A payload install records the promised relaunch version in
    // installResult.activeVersion. If this process is running an OLDER
    // version, that relaunch never stuck — the payload crashed and the
    // launcher rolled back. The freeze and stale install result must not
    // survive, or every future check on the rolled-back install would be a
    // frozen no-op; the downloaded release itself stays verified and
    // user-actionable.
    const staleRelaunchFreeze =
      !clearedAppliedRelease &&
      restoredMetadata.installResult?.activeVersion != null &&
      compareVersions(restoredMetadata.installResult.activeVersion, config.currentVersion) > 0;
    if (clearedAppliedRelease || staleRelaunchFreeze) {
      await writeStoreMetadata(opened.root, {
        ...restoredMetadata,
        ...(clearedAppliedRelease ? { active: undefined } : {}),
        incoming: undefined,
        installFrozen: undefined,
        installResult: undefined,
        version: STORE_METADATA_VERSION,
      });
      if (staleRelaunchFreeze) {
        logUpdateEvent("restore-cleared-stale-relaunch-freeze", {
          promisedVersion: restoredMetadata.installResult?.activeVersion,
        });
      }
    }
    installFrozen = clearedAppliedRelease || staleRelaunchFreeze ? false : restoredMetadata.installFrozen === true;
    installResult = clearedAppliedRelease || staleRelaunchFreeze ? undefined : restoredMetadata.installResult;
    lastCheckedAt = restoredMetadata.lastCheckedAt;
    metadata = activeRelease?.ref.metadata ?? null;
    candidate = null;
    incomingRelease = null;
    progress = undefined;
    if (activeRelease != null) {
      const prepareError = await preparePayloadReleaseForReady(activeRelease);
      if (prepareError != null) return prepareError;
      logUpdateEvent("restore-active-release", {
        key: activeRelease.ref.key,
        version: activeRelease.ref.version,
      });
    }
    const coldStartLifecycle = await runUpdateReleaseLifecycle({
      config,
      layout: opened.root.layout,
      logger,
      now,
      trigger: "cold-start",
    }).catch((lifecycleError: unknown) => {
      logger.warn("[open-design updater] failed to run cold-start release lifecycle", lifecycleError);
      return null;
    });
    if (coldStartLifecycle != null) lifecycleSummary = coldStartLifecycle;
    if (coldStartLifecycle != null) {
      logUpdateEvent("release-lifecycle", {
        removed: coldStartLifecycle.releases.cleanupRemoved,
        retained: coldStartLifecycle.releases.retained,
        total: coldStartLifecycle.releases.total,
        trigger: coldStartLifecycle.lastTrigger,
      });
    }
    const launcherLifecycle = await runLauncherCleanupLifecycle({
      config,
      logger,
      now,
    }).catch((lifecycleError: unknown) => {
      logger.warn("[open-design updater] failed to run launcher cleanup lifecycle", lifecycleError);
      return null;
    });
    if (launcherLifecycle != null) {
      logUpdateEvent("launcher-lifecycle", {
        deferred: launcherLifecycle.cleanupDeferred,
        deprecated: launcherLifecycle.deprecated,
        removed: launcherLifecycle.cleanupRemoved,
        retained: launcherLifecycle.retained,
        total: launcherLifecycle.total,
        trigger: "cold-start",
      });
    }
    return setState(activeRelease == null ? DESKTOP_UPDATE_STATES.IDLE : DESKTOP_UPDATE_STATES.DOWNLOADED);
  }

  async function restoreStoreStateOnce(): Promise<DesktopUpdateStatusSnapshot | null> {
    if (storeStateRestored) return null;
    if (restoreStatePromise != null) return await restoreStatePromise;
    const pending = restoreStoreState();
    restoreStatePromise = pending;
    try {
      const restored = await pending;
      if (restored == null || restored.state !== DESKTOP_UPDATE_STATES.ERROR) storeStateRestored = true;
      return restored;
    } finally {
      if (restoreStatePromise === pending) restoreStatePromise = null;
    }
  }

  function setFailurePreservingActive(nextError: DesktopUpdateErrorSnapshot): DesktopUpdateStatusSnapshot {
    return setState(
      activeRelease == null ? DESKTOP_UPDATE_STATES.ERROR : DESKTOP_UPDATE_STATES.DOWNLOADED,
      nextError,
    );
  }

  async function writeMetadataPatch(
    patch: (current: UpdateStoreMetadata) => UpdateStoreMetadata,
  ): Promise<(OwnedRoot & { ok: true }) | null> {
    const opened = await openStore();
    if (!opened.ok) return null;
    await writeStoreMetadata(opened.root, patch(opened.metadata));
    return opened.root;
  }

  async function checkForCandidate(options: ActionOptions = {}): Promise<DesktopUpdateStatusSnapshot> {
    const unsupported = unsupportedStatus();
    if (unsupported != null) return unsupported;
    if (installFrozen || installResult != null) return snapshot();
    if (state === DESKTOP_UPDATE_STATES.IDLE) {
      const restored = await restoreStoreStateOnce();
      if (restored?.state === DESKTOP_UPDATE_STATES.ERROR) return restored;
      if (installFrozen || installResult != null) return snapshot();
    }
    const keepDownloadedVisible = activeRelease != null;
    if (!keepDownloadedVisible) setState(DESKTOP_UPDATE_STATES.CHECKING);
    try {
      logUpdateEvent("check-start", { metadataUrl: config.metadataUrl });
      const body = await fetchJson(fetchImpl, config.metadataUrl);
      lastCheckedAt = now().toISOString();
      metadata = body;
      const root = await writeMetadataPatch((current) => ({
        ...current,
        lastCheckedAt,
      }));
      if (root != null) scheduleBackCleanup(root.realRoot, logger);
      const launcherPayloadContextValid = await hasValidLauncherPayloadContext(config);
      const installedOuterVersion = launcherPayloadContextValid ? await resolveInstalledOuterVersion(config) : null;
      reinstallRequirement = launcherPayloadContextValid
        ? remoteRequiresReinstall(body, config, installedOuterVersion) ?? undefined
        : undefined;
      if (reinstallRequirement != null) {
        logUpdateEvent("reseed-required-installer-route", {
          currentVersion: config.currentVersion,
          installedVersion: reinstallRequirement.installedVersion,
          minVersion: reinstallRequirement.minVersion,
          reason: reinstallRequirement.reason,
          supportedLauncherSchema: LAUNCHER_SCHEMA_VERSION,
        });
      }
      const selected = selectUpdateCandidateWithFallback(body, config, launcherPayloadContextValid && reinstallRequirement == null);
      if (!selected.ok) {
        return selected.state === DESKTOP_UPDATE_STATES.ERROR
          ? setFailurePreservingActive(selected.error)
          : setState(selected.state, selected.error);
      }
      // Same-version installer reinstall (disaster posture): when the installed
      // outer is below min, the installer must be offered even with no newer
      // release — waiting for the next release would strand broken outers.
      // Clamped to min <= candidate so reinstalling actually clears the gate;
      // otherwise the offer could never converge and would nag forever.
      const sameVersionReinstall =
        reinstallRequirement != null &&
        reinstallRequirement.reason !== "launcher-schema" &&
        reinstallRequirement.minVersion != null &&
        compareVersions(reinstallRequirement.minVersion, selected.candidate.version) <= 0;
      if (!sameVersionReinstall && compareVersions(selected.candidate.version, config.currentVersion) <= 0) {
        logUpdateEvent("check-not-available", { candidateVersion: selected.candidate.version });
        candidate = null;
        if (activeRelease != null) {
          metadata = activeRelease.ref.metadata;
          return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
        }
        activeRelease = null;
        await writeMetadataPatch((current) => ({
          ...current,
          active: undefined,
          incoming: undefined,
          lastCheckedAt,
        }));
        return setState(DESKTOP_UPDATE_STATES.NOT_AVAILABLE);
      }
      if (activeRelease != null && releaseMatchesCandidate(activeRelease.ref, selected.candidate)) {
        logUpdateEvent("check-already-downloaded", {
          key: activeRelease.ref.key,
          version: activeRelease.ref.version,
        });
        candidate = selected.candidate;
        metadata = selected.candidate.metadata;
        const prepareError = await preparePayloadReleaseForReady(activeRelease);
        if (prepareError != null) return prepareError;
        return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
      }
      const openedForAdoption = await openStore();
      if (openedForAdoption.ok) {
        const adoptedRelease = await loadVerifiedReleaseForCandidate(openedForAdoption.root, selected.candidate);
        if (adoptedRelease != null) {
          logUpdateEvent("check-adopt-release", {
            key: adoptedRelease.ref.key,
            version: adoptedRelease.ref.version,
          });
          const prepareError = await preparePayloadReleaseForReady(adoptedRelease);
          if (prepareError != null) return prepareError;
          candidate = selected.candidate;
          activeRelease = adoptedRelease;
          metadata = adoptedRelease.ref.metadata;
          installFrozen = false;
          installResult = undefined;
          incomingRelease = null;
          progress = undefined;
          await writeStoreMetadata(openedForAdoption.root, {
            ...openedForAdoption.metadata,
            active: adoptedRelease.ref,
            incoming: undefined,
            installFrozen: false,
            installResult: undefined,
            lastCheckedAt,
            version: STORE_METADATA_VERSION,
          });
          return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
        }
      }
      candidate = selected.candidate;
      logUpdateEvent("check-available", {
        artifactType: selected.candidate.artifact.type,
        size: selected.candidate.artifact.size,
        version: selected.candidate.version,
      });
      const available = activeRelease == null
        ? setState(DESKTOP_UPDATE_STATES.AVAILABLE)
        : setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
      if (options.autoDownload ?? config.autoDownload) return await downloadUpdate();
      return available;
    } catch (checkError) {
      return setFailurePreservingActive(
        createError("metadata-unreachable", checkError instanceof Error ? checkError.message : String(checkError)),
      );
    }
  }

  async function downloadUpdate(): Promise<DesktopUpdateStatusSnapshot> {
    const unsupported = unsupportedStatus();
    if (unsupported != null) return unsupported;
    if (installFrozen || installResult != null) return snapshot();
    if (candidate == null) {
      const checked = await checkForCandidate({ autoDownload: false });
      if (checked.state !== DESKTOP_UPDATE_STATES.AVAILABLE || candidate == null) return checked;
    }
    if (activeRelease != null && releaseMatchesCandidate(activeRelease.ref, candidate)) {
      return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
    }
    const opened = await openStore();
    if (!opened.ok) return opened.status;
    const nextCandidate = candidate;
    const outputName = artifactFileName(nextCandidate);
    const cycleId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const startedAt = now().toISOString();
    incomingRelease = {
      arch: nextCandidate.arch,
      artifact: nextCandidate.artifact,
      channel: nextCandidate.channel,
      cycleId,
      metadata: nextCandidate.metadata,
      platformKey: nextCandidate.platformKey,
      startedAt,
      version: nextCandidate.version,
    };
    progress = undefined;
    logUpdateEvent("download-start", {
      artifactType: nextCandidate.artifact.type,
      size: nextCandidate.artifact.size,
      version: nextCandidate.version,
    });
    await writeStoreMetadata(opened.root, {
      ...opened.metadata,
      incoming: incomingRelease,
    });
    setState(activeRelease == null ? DESKTOP_UPDATE_STATES.DOWNLOADING : DESKTOP_UPDATE_STATES.DOWNLOADED);
    let tmpPath: string | null = null;
    let stagingDir: string | null = null;
    const failDownload = async (nextError: DesktopUpdateErrorSnapshot): Promise<DesktopUpdateStatusSnapshot> => {
      if (stagingDir != null) await rm(stagingDir, { force: true, recursive: true }).catch(() => undefined);
      incomingRelease = null;
      progress = undefined;
      await writeStoreMetadata(opened.root, {
        ...opened.metadata,
        incoming: undefined,
      });
      return setFailurePreservingActive(nextError);
    };
    try {
      const stagingRoot = await ensureOwnedSubdir(opened.root.realRoot, STAGING_DIR);
      const downloadsRoot = await ensureOwnedSubdir(opened.root.realRoot, DOWNLOADS_DIR);
      const releasesRoot = await ensureOwnedSubdir(opened.root.realRoot, RELEASES_DIR);
      stagingDir = join(stagingRoot, cycleId);
      if (!containsPath(opened.root.realRoot, stagingDir)) {
        return await failDownload(createError("download-path-escaped", "resolved update staging path escaped update root"));
      }
      await mkdir(stagingDir, { recursive: true });
      tmpPath = join(stagingDir, outputName);
      if (!containsPath(opened.root.realRoot, tmpPath)) {
        return await failDownload(createError("download-path-escaped", "resolved update download path escaped update root"));
      }
      const resolvedChecksum = await resolveChecksum(fetchImpl, nextCandidate.checksum);
      await downloadCopyAndClear({
        basePath: downloadsRoot,
        bucket: "package-launcher",
        fetch: fetchImpl,
        fileName: outputName,
        maxAttempts: ARTIFACT_DOWNLOAD_MAX_ATTEMPTS,
        onProgress: (nextProgress) => {
          progress = updateProgressFromManaged(nextProgress);
          emit();
        },
        outputPath: tmpPath,
        payload: {
          checksum: managedChecksum(resolvedChecksum),
          url: nextCandidate.artifact.url,
        },
      });
      const digest = await hashFile(tmpPath, resolvedChecksum.algorithm);
      if (resolvedChecksum.value == null || digest.toLowerCase() !== resolvedChecksum.value.toLowerCase()) {
        return await failDownload(
          createError("checksum-mismatch", "downloaded update checksum did not match release metadata", {
            actual: digest,
            expected: resolvedChecksum.value,
          }),
        );
      }
      const key = releaseKey(nextCandidate, resolvedChecksum);
      const releaseDir = join(releasesRoot, key);
      if (!containsPath(opened.root.realRoot, releaseDir)) {
        return await failDownload(createError("download-path-escaped", "resolved release path escaped update root"));
      }
      await writeJson(join(stagingDir, "metadata.json"), nextCandidate.metadata);
      await writeJson(join(stagingDir, "checksum.json"), resolvedChecksum);
      try {
        await rename(stagingDir, releaseDir);
      } catch (renameError) {
        return await failDownload(createError("release-promote-failed", renameError instanceof Error ? renameError.message : String(renameError)));
      }
      const releaseRef: UpdateReleaseRef = {
        arch: nextCandidate.arch,
        artifact: nextCandidate.artifact,
        artifactPath: relative(opened.root.realRoot, join(releaseDir, outputName)),
        checksum: resolvedChecksum,
        checksumPath: relative(opened.root.realRoot, join(releaseDir, "checksum.json")),
        channel: nextCandidate.channel,
        downloadedAt: now().toISOString(),
        key,
        metadata: nextCandidate.metadata,
        metadataPath: relative(opened.root.realRoot, join(releaseDir, "metadata.json")),
        platformKey: nextCandidate.platformKey,
        version: nextCandidate.version,
      };
      logUpdateEvent("download-promoted", {
        key,
        version: nextCandidate.version,
      });
      const downloadedRelease = { path: join(opened.root.realRoot, releaseRef.artifactPath), ref: releaseRef };
      const previousActiveRelease = activeRelease;
      const prepareError = await preparePayloadReleaseForReady(downloadedRelease);
      if (prepareError != null) {
        incomingRelease = null;
        progress = undefined;
        await writeStoreMetadata(opened.root, {
          ...opened.metadata,
          incoming: undefined,
          lastCheckedAt,
          version: STORE_METADATA_VERSION,
        });
        if (previousActiveRelease != null && prepareError.error != null) {
          activeRelease = previousActiveRelease;
          metadata = previousActiveRelease.ref.metadata;
          return setFailurePreservingActive(prepareError.error);
        }
        return prepareError;
      }
      logUpdateEvent("payload-ready", {
        key,
        version: nextCandidate.version,
      });
      progress = undefined;
      activeRelease = downloadedRelease;
      incomingRelease = null;
      await writeStoreMetadata(opened.root, {
        ...opened.metadata,
        active: releaseRef,
        incoming: undefined,
        installFrozen: false,
        installResult: undefined,
        lastCheckedAt,
        version: STORE_METADATA_VERSION,
      });
      const readyLifecycle = await runUpdateReleaseLifecycle({
        config,
        layout: opened.root.layout,
        logger,
        now,
        readyVersion: nextCandidate.version,
        trigger: "next-version-ready",
      }).catch((lifecycleError: unknown) => {
        logger.warn("[open-design updater] failed to run next-version-ready release lifecycle", lifecycleError);
        return null;
      });
      if (readyLifecycle != null) lifecycleSummary = readyLifecycle;
      if (readyLifecycle != null) {
        logUpdateEvent("release-lifecycle", {
          removed: readyLifecycle.releases.cleanupRemoved,
          retained: readyLifecycle.releases.retained,
          total: readyLifecycle.releases.total,
          trigger: readyLifecycle.lastTrigger,
        });
      }
      const downloaded = setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
      if (config.autoOpen) return await installUpdate();
      return downloaded;
    } catch (downloadError) {
      if (stagingDir != null) await rm(stagingDir, { force: true, recursive: true }).catch(() => undefined);
      incomingRelease = null;
      progress = undefined;
      await writeMetadataPatch((current) => ({ ...current, incoming: undefined }));
      return setFailurePreservingActive(desktopDownloadError(downloadError));
    }
  }

  async function writeInstallObservation(attemptedAt: string): Promise<InstallerObservationHandle | null> {
    if (config.openDryRun) return null;
    if (config.installerObservationRoot == null || config.namespace == null) return null;
    if (activeRelease == null) return null;
    const artifactType = installerObservationArtifactType(activeRelease.ref.artifact.type);
    if (artifactType == null) return null;
    try {
      return await writePendingInstallerObservation({
        arch: activeRelease.ref.arch,
        artifactType,
        attemptedAt,
        channel: activeRelease.ref.channel,
        fromVersion: config.currentVersion,
        namespace: config.namespace,
        platform: config.platform,
        root: config.installerObservationRoot,
        toVersion: activeRelease.ref.version,
      });
    } catch (observationError) {
      logger.warn("[open-design updater] failed to write installer observation", observationError);
      return null;
    }
  }

  async function markInstallObservationOpenFailed(
    observation: InstallerObservationHandle | null,
    failedAt: string,
  ): Promise<void> {
    if (observation == null) return;
    try {
      await markInstallerObservationOpenFailed(observation, failedAt);
    } catch (observationError) {
      logger.warn("[open-design updater] failed to update installer observation", observationError);
    }
  }

  async function requestInstallerOpen(resolvedDownload: string, updateRoot: string): Promise<string> {
    if (config.platform !== "darwin" && config.platform !== "win32") return await openPath(resolvedDownload);
    return await launchInstallerAfterQuit({
      appPid: processPid,
      cwd: config.runtimeBase,
      installerPath: resolvedDownload,
      root: updateRoot,
      timeoutMs: DEFERRED_INSTALLER_TIMEOUT_MS,
    });
  }

  async function requestPayloadRelaunch(
    updateRoot: string,
    launchPath: string,
    delegated?: { generation: number; version: string },
  ): Promise<DeferredLaunchResult & { launchPath?: string }> {
    if (config.openDryRun) return {};
    if (config.platform !== "darwin" && config.platform !== "win32") return {};
    try {
      await access(launchPath);
      const launcherTarget = await lstat(launchPath);
      if (launcherTarget.isSymbolicLink() || !launcherTarget.isFile()) {
        return { error: `launcher payload executable is not a plain file: ${launchPath}` };
      }
    } catch (launchPathError) {
      return { error: launchPathError instanceof Error ? launchPathError.message : String(launchPathError) };
    }
    const result = await launchAppAfterQuit({
      appPid: processPid,
      cwd: config.runtimeBase,
      ...(delegated == null ? {} : { delegated }),
      launchPath,
      root: updateRoot,
      timeoutMs: DEFERRED_INSTALLER_TIMEOUT_MS,
    });
    return { ...result, launchPath };
  }

  async function installUpdate(): Promise<DesktopUpdateStatusSnapshot> {
    const unsupported = unsupportedStatus();
    if (unsupported != null) return unsupported;
    if (installResult != null) {
      installFrozen = true;
      return snapshot();
    }
    if (activeRelease == null) {
      const restored = await restoreStoreStateOnce();
      if (restored == null || activeRelease == null) {
        return setState(DESKTOP_UPDATE_STATES.ERROR, createError("update-not-downloaded", "no downloaded update package is available"));
      }
    }
    const opened = await openStore();
    if (!opened.ok) return opened.status;
    const resolvedDownload = activeRelease.path;
    if (!containsPath(opened.root.realRoot, resolvedDownload)) {
      return setState(DESKTOP_UPDATE_STATES.ERROR, createError("download-path-escaped", "download path is outside the update root"));
    }
    setState(DESKTOP_UPDATE_STATES.INSTALLING);
    const installChecksum = activeRelease.ref.checksum;
    if (installChecksum?.value == null) {
      return setState(DESKTOP_UPDATE_STATES.ERROR, createError("checksum-missing", "downloaded update checksum is missing"));
    }
    let digest: string;
    try {
      digest = await hashFile(resolvedDownload, installChecksum.algorithm);
    } catch (hashError) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("download-unavailable", hashError instanceof Error ? hashError.message : String(hashError)),
      );
    }
    if (digest.toLowerCase() !== installChecksum.value.toLowerCase()) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("checksum-mismatch", "downloaded update checksum changed before install", {
          actual: digest,
          expected: installChecksum.value,
        }),
      );
    }
    if (activeRelease.ref.artifact.type === "payload") {
      let observation: InstallerObservationHandle | null = null;
      try {
        const appliedAt = now().toISOString();
        observation = await writeInstallObservation(appliedAt);
        const activation = await activatePreparedLauncherPayloadRelease({
          activeRelease,
          config,
          logger,
          now,
          removeLauncherPayloadRoot,
        });
        const relaunch = await requestPayloadRelaunch(
          opened.root.realRoot,
          activation.launchPath,
          activation.runtime.active ?? undefined,
        );
        if (relaunch.error != null && relaunch.error.length > 0) {
          await markInstallObservationOpenFailed(observation, now().toISOString());
          return setState(DESKTOP_UPDATE_STATES.ERROR, createError("payload-relaunch-failed", relaunch.error));
        }
        installFrozen = true;
        installResult = {
          activeVersion: activeRelease.ref.version,
          artifactPath: resolvedDownload,
          ...(config.openDryRun ? { dryRun: true } : { dryRun: false }),
          ...(relaunch.helperLogPath == null ? {} : { helperLogPath: relaunch.helperLogPath }),
          ...(config.launcherRuntimePath == null ? {} : { launcherRuntimePath: config.launcherRuntimePath }),
          ...(relaunch.launchPath == null ? {} : { launchPath: relaunch.launchPath }),
          openedAt: appliedAt,
          path: resolvedDownload,
        };
        await writeStoreMetadata(opened.root, {
          ...opened.metadata,
          active: activeRelease.ref,
          incoming: undefined,
          installFrozen,
          installResult,
          lastCheckedAt,
          version: STORE_METADATA_VERSION,
        });
        return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
      } catch (applyError) {
        await markInstallObservationOpenFailed(observation, now().toISOString());
        return setState(
          DESKTOP_UPDATE_STATES.ERROR,
          createError("launcher-payload-apply-failed", applyError instanceof Error ? applyError.message : String(applyError)),
        );
      }
    }
    let observation: InstallerObservationHandle | null = null;
    try {
      const openedAt = now().toISOString();
      observation = await writeInstallObservation(openedAt);
      if (!config.openDryRun) {
        const openError = await requestInstallerOpen(resolvedDownload, opened.root.realRoot);
        if (openError.length > 0) {
          await markInstallObservationOpenFailed(observation, now().toISOString());
          return setState(DESKTOP_UPDATE_STATES.ERROR, createError("open-installer-failed", openError));
        }
      }
      installResult = {
        ...(config.openDryRun ? { dryRun: true } : {}),
        openedAt,
        path: resolvedDownload,
      };
      installFrozen = true;
      await writeStoreMetadata(opened.root, {
        ...opened.metadata,
        active: activeRelease.ref,
        incoming: undefined,
        installFrozen: true,
        installResult,
        lastCheckedAt,
        version: STORE_METADATA_VERSION,
      });
      return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
    } catch (installError) {
      await markInstallObservationOpenFailed(observation, now().toISOString());
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("open-installer-failed", installError instanceof Error ? installError.message : String(installError)),
      );
    }
  }

  async function serialized(run: () => Promise<DesktopUpdateStatusSnapshot>): Promise<DesktopUpdateStatusSnapshot> {
    const next = operation.catch(() => undefined).then(run);
    operation = next.catch(() => undefined);
    return await next;
  }

  /**
   * Manual disaster-recovery reset. Clears every deletable cache domain and
   * the one-shot update state (downloaded release, install freeze) so the next
   * check starts from a clean slate. Retained launcher versions
   * (active/lastSuccessful) and a confirmed handoff journal are never touched.
   * Boundary: an installer helper already spawned by a prior install is not
   * cancelled — clearing after opening an installer resets the updater state
   * only.
   */
  async function clearCacheAndResetState(): Promise<DesktopUpdateStatusSnapshot> {
    const unsupported = unsupportedStatus();
    if (unsupported != null) return unsupported;
    logUpdateEvent("manual-cache-clear-start");
    let opened = await openStore();
    if (!opened.ok) {
      // Disaster posture: a corrupt store is one of the blocking scenarios
      // this action exists to recover from. Rebuild only when ownership is
      // provable; otherwise surface the original store error unchanged.
      if (!(await rebuildOwnedUpdateRootForManualClear(config, logger))) return opened.status;
      logUpdateEvent("manual-cache-clear-store-rebuilt");
      opened = await openStore();
      if (!opened.ok) return opened.status;
    }
    // Reset one-shot state before any deletion: even if later cleanup steps
    // fail, the UI must not stay stuck on stale downloaded/frozen state — that
    // is the very blocking scenario this action exists to recover from.
    await writeStoreMetadata(opened.root, {
      ...opened.metadata,
      active: undefined,
      incoming: undefined,
      installFrozen: false,
      installResult: undefined,
      version: STORE_METADATA_VERSION,
    });
    activeRelease = null;
    candidate = null;
    incomingRelease = null;
    installFrozen = false;
    installResult = undefined;
    progress = undefined;
    reinstallRequirement = undefined;

    const layout = opened.root.layout;
    for (const transientRoot of [layout.stagingRoot, layout.downloadsRoot]) {
      const entries = await readdir(transientRoot).catch(() => [] as string[]);
      for (const entry of entries) {
        const target = resolve(transientRoot, entry);
        if (!containsPath(transientRoot, target)) continue;
        await rm(target, { force: true, recursive: true }).catch((error: unknown) => {
          logger.warn("[open-design updater] failed manual transient cache cleanup", {
            error: error instanceof Error ? error.message : String(error),
            path: target,
          });
        });
      }
    }
    scheduleBackCleanup(opened.root.realRoot, logger);

    const releaseSummary = await runUpdateReleaseLifecycle({
      config,
      layout,
      logger,
      now,
      reclaimStaleLock: true,
      trigger: "manual",
    });
    if (releaseSummary == null) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("updater-lifecycle-lock-held", "update cache cleanup is blocked by an active or unverifiable lifecycle lock"),
      );
    }
    lifecycleSummary = releaseSummary;

    await clearLauncherStateForManualClear({ config, logger, now, removeLauncherPayloadRoot });

    logUpdateEvent("manual-cache-clear-complete");
    return setState(DESKTOP_UPDATE_STATES.IDLE);
  }

  return {
    checkForUpdates: (options) => serialized(() => checkForCandidate(options)),
    clearCache: () => serialized(clearCacheAndResetState),
    config,
    downloadUpdate: () => serialized(downloadUpdate),
    handle(action) {
      switch (action) {
        case DESKTOP_UPDATE_ACTIONS.STATUS:
          return this.status();
        case DESKTOP_UPDATE_ACTIONS.CHECK:
          return this.checkForUpdates();
        case DESKTOP_UPDATE_ACTIONS.CLEAR_CACHE:
          return this.clearCache();
        case DESKTOP_UPDATE_ACTIONS.DOWNLOAD:
          return this.downloadUpdate();
        case DESKTOP_UPDATE_ACTIONS.INSTALL:
          return this.installUpdate();
      }
    },
    installUpdate: () => serialized(installUpdate),
    shouldAutoCheck: () => config.enabled && config.autoCheck,
    snapshot,
    async status() {
      const unsupported = unsupportedStatus();
      if (unsupported != null) return unsupported;
      if (state === DESKTOP_UPDATE_STATES.IDLE) {
        const restored = await restoreStoreStateOnce();
        if (restored != null) return restored;
      }
      return snapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
