import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

import {
  MANAGED_DOWNLOAD_ERROR_CODES,
  ManagedDownloadError,
  downloadCopyAndClear,
  type ManagedDownloadChecksum,
  type ManagedDownloadProgress,
} from "@open-design/download";
import {
  LAUNCHER_SCHEMA_VERSION,
} from "@open-design/launcher-proto";
import { createProcessStampArgs } from "@open-design/platform";
import { resolveAppIpcPath } from "@open-design/sidecar";
import {
  APP_KEYS,
  DESKTOP_UPDATE_ACTIONS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_STATES,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type DesktopUpdateAction,
  type DesktopUpdateCacheLifecycleSummary,
  type DesktopUpdateChecksumSnapshot,
  type DesktopUpdateErrorSnapshot,
  type DesktopUpdateProgressSnapshot,
  type DesktopUpdateReinstallSnapshot,
  type DesktopUpdateStatusSnapshot,
  type DesktopUpdateState,
} from "@open-design/sidecar-proto";
import {
  markInstallerObservationOpenFailed,
  writePendingInstallerObservation,
  type InstallerObservationArtifactType,
  type InstallerObservationHandle,
} from "./installer-observations.js";
import {
  capabilitiesFor,
  isSupportedPackageLauncherPlatform,
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
  readJson,
  readJsonStrict,
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
  remoteRequiresReinstall,
  resolveChecksum,
  resolveInstalledOuterVersion,
  selectUpdateCandidateWithFallback,
  type UpdateCandidate,
} from "./updater/feed.js";

export { compareVersions, remoteRequiresReinstall, resolveInstalledOuterVersion } from "./updater/feed.js";
import {
  activatePreparedLauncherPayloadRelease,
  clearLauncherStateForManualClear,
  defaultExtractLauncherPayloadArchive,
  prepareLauncherPayloadRelease,
  runLauncherCleanupLifecycle,
  type LauncherPayloadExtractInput,
} from "./updater/payload.js";

export type { LauncherPayloadExtractInput } from "./updater/payload.js";
import {
  DEFERRED_INSTALLER_TIMEOUT_MS,
  launchMacInstallerAfterQuit,
  launchPayloadAppAfterQuit,
  launchWindowsInstallerAfterQuit,
  type DeferredAppLaunchInput,
  type DeferredInstallerLaunchInput,
  type DeferredLaunchResult,
  type SpawnInstallerHelper,
} from "./updater/deferred-launch.js";

export type {
  DeferredAppLaunchInput,
  DeferredInstallerLaunchInput,
  DeferredLaunchResult,
} from "./updater/deferred-launch.js";
import {
  runUpdateReleaseLifecycle,
  scheduleBackCleanup,
} from "./updater/release-lifecycle.js";
import {
  DOWNLOADS_DIR,
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
  type IncomingRef,
  type OwnedRoot,
  type UpdateReleaseRef,
  type UpdateStoreMetadata,
} from "./updater/store.js";

const ARTIFACT_DOWNLOAD_MAX_ATTEMPTS = 3;

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

export type DesktopUpdaterLogger = Pick<Console, "error" | "warn"> & Partial<Pick<Console, "info">>;

export type LoadedRelease = {
  path: string;
  ref: UpdateReleaseRef;
};

type ActionOptions = {
  autoDownload?: boolean;
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
    const namespace = config.namespace?.trim();
    if (!namespace) return { error: "launcher payload relaunch requires a namespace" };
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
      processStampArgs: createProcessStampArgs({
        app: APP_KEYS.DESKTOP,
        ipc: resolveAppIpcPath({
          app: APP_KEYS.DESKTOP,
          contract: OPEN_DESIGN_SIDECAR_CONTRACT,
          namespace,
        }),
        mode: SIDECAR_MODES.RUNTIME,
        namespace,
        source: SIDECAR_SOURCES.PACKAGED,
      }, OPEN_DESIGN_SIDECAR_CONTRACT),
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
