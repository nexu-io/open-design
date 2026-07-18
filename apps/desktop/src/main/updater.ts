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
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
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
  compareLauncherVersions,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  validateLauncherCleanupDescriptor,
  validateLauncherRuntimeDescriptor,
  type LauncherCleanupDescriptor,
  type LauncherCleanupEntry,
  type LauncherRuntimeDescriptor,
} from "@open-design/launcher-proto";
import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_STATES,
  SIDECAR_SOURCES,
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
  type DesktopUpdateStatusSnapshot,
  type DesktopUpdateState,
  type SidecarSource,
} from "@open-design/sidecar-proto";
import { releaseChannelFromVersion } from "@open-design/release";

import {
  markInstallerObservationOpenFailed,
  writePendingInstallerObservation,
  type InstallerObservationArtifactType,
  type InstallerObservationHandle,
} from "./installer-observations.js";

export const DESKTOP_UPDATE_ENV = Object.freeze({
  ARCH: "OD_UPDATE_ARCH",
  AUTO_CHECK: "OD_UPDATE_AUTO_CHECK",
  AUTO_DOWNLOAD: "OD_UPDATE_AUTO_DOWNLOAD",
  AUTO_OPEN: "OD_UPDATE_AUTO_OPEN",
  CHECK_BACKOFF_INITIAL_MS: "OD_UPDATE_CHECK_BACKOFF_INITIAL_MS",
  CHECK_BACKOFF_MAX_MS: "OD_UPDATE_CHECK_BACKOFF_MAX_MS",
  CHECK_INITIAL_DELAY_MS: "OD_UPDATE_CHECK_INITIAL_DELAY_MS",
  CHECK_INTERVAL_MS: "OD_UPDATE_CHECK_INTERVAL_MS",
  CHANNEL: "OD_UPDATE_CHANNEL",
  CURRENT_VERSION: "OD_UPDATE_CURRENT_VERSION",
  DOWNLOAD_ROOT: "OD_UPDATE_DOWNLOAD_ROOT",
  ENABLED: "OD_UPDATE_ENABLED",
  METADATA_URL: "OD_UPDATE_METADATA_URL",
  MODE: "OD_UPDATE_MODE",
  OPEN_DRY_RUN: "OD_UPDATE_OPEN_DRY_RUN",
  PLATFORM: "OD_UPDATE_PLATFORM",
} as const);

const DEFAULT_RELEASE_ORIGIN = "https://releases.open-design.ai";
const OWNERSHIP_SENTINEL = ".open-design-updater-root.json";
const STORE_METADATA_FILE = "metadata.json";
const RELEASES_DIR = "releases";
const STAGING_DIR = "staging";
const DOWNLOADS_DIR = "downloads";
const BACK_DIR = ".back";
const HELPERS_DIR = "helpers";
const STATE_DIR = "state";
const CLEANUP_METADATA_FILE = "cleanup.json";
const LOCK_DIR = "lock";
const LOCK_OWNER_FILE = "owner.json";
const UPDATE_ROOT_VERSION = 1;
const STORE_METADATA_VERSION = 1;
const RELEASE_CLEANUP_DESCRIPTOR_VERSION = 1;
const BETA_POLL_INTERVAL_MS = 15 * 60 * 1000;
const STABLE_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_POLL_INITIAL_DELAY_MS = 5000;
const DEFAULT_POLL_BACKOFF_INITIAL_MS = 60 * 1000;
const DEFAULT_POLL_BACKOFF_MAX_MS = 30 * 60 * 1000;
const MIN_SCHEDULED_POLL_DELAY_MS = 1000;
const MAC_DEFERRED_INSTALLER_TIMEOUT_MS = 10 * 60 * 1000;
const WINDOWS_DEFERRED_INSTALLER_TIMEOUT_MS = 10 * 60 * 1000;
const ARTIFACT_DOWNLOAD_MAX_ATTEMPTS = 3;
const DESKTOP_UPDATE_CHANNEL_VALUES = new Set<string>(Object.values(DESKTOP_UPDATE_CHANNELS));
const execFileAsync = promisify(execFile);
const MAC_PAYLOAD_XATTRS_TO_SCRUB = ["com.apple.quarantine", "com.apple.provenance", "com.apple.macl"] as const;

export type DesktopUpdaterConfigInput = {
  appVersion?: string | null;
  arch?: string;
  currentVersion?: string | null;
  downloadRoot?: string | null;
  env?: NodeJS.ProcessEnv;
  launcherLaunchPath?: string | null;
  launcherRoot?: string | null;
  launcherPayloadExtractorPath?: string | null;
  installerObservationRoot?: string | null;
  launcherRuntimePath?: string | null;
  mode?: DesktopUpdateMode;
  namespace?: string | null;
  platform?: string;
  runtimeBase?: string | null;
  source: SidecarSource;
};

export type DesktopUpdaterConfig = {
  arch: string;
  autoCheck: boolean;
  autoDownload: boolean;
  autoOpen: boolean;
  checkBackoffInitialMs: number;
  checkBackoffMaxMs: number;
  checkInitialDelayMs: number;
  checkIntervalMs: number;
  channel: DesktopUpdateChannel;
  currentVersion: string;
  downloadRoot: string;
  enabled: boolean;
  installerObservationRoot?: string;
  launcherLaunchPath?: string;
  launcherRoot?: string;
  launcherPayloadExtractorPath?: string;
  launcherRuntimePath?: string;
  metadataUrl: string;
  mode: DesktopUpdateMode;
  namespace?: string;
  openDryRun: boolean;
  platform: string;
  source: SidecarSource;
};

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

type DesktopUpdaterLogger = Pick<Console, "error" | "warn"> & Partial<Pick<Console, "info">>;
type DetachedProcess = { unref(): void };
type LauncherPayloadCleanupTrigger = "activate" | "prepare-existing" | "prepare-promoted";
type LauncherPayloadCleanupFailure = {
  error: NonNullable<LauncherCleanupEntry["error"]>;
  version: string;
};
type SpawnInstallerHelper = (
  command: string,
  args: string[],
  options: { detached?: true; stdio: "ignore"; windowsHide: true },
) => DetachedProcess;

export type DeferredInstallerLaunchInput = {
  appPid: number;
  installerPath: string;
  root: string;
  timeoutMs: number;
};

export type DeferredAppLaunchInput = {
  appPid: number;
  launchPath: string;
  root: string;
  timeoutMs: number;
};

export type DeferredLaunchResult = {
  error?: string;
  helperLogPath?: string;
};

type UpdateCandidate = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  checksum: DesktopUpdateChecksumSnapshot;
  channel: DesktopUpdateChannel;
  metadata: Record<string, unknown>;
  platformKey: string;
  version: string;
};

type UpdateReleaseRef = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  artifactPath: string;
  checksum: DesktopUpdateChecksumSnapshot;
  checksumPath: string;
  channel: DesktopUpdateChannel;
  downloadedAt: string;
  key: string;
  metadata: Record<string, unknown>;
  metadataPath: string;
  platformKey: string;
  version: string;
};

type IncomingRef = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  channel: DesktopUpdateChannel;
  cycleId: string;
  metadata: Record<string, unknown>;
  platformKey: string;
  startedAt: string;
  version: string;
};

type UpdateStoreMetadata = {
  active?: UpdateReleaseRef;
  incoming?: IncomingRef;
  installFrozen?: boolean;
  installResult?: DesktopUpdateStatusSnapshot["installResult"];
  lastCheckedAt?: string;
  version: typeof STORE_METADATA_VERSION;
};

type LoadedRelease = {
  path: string;
  ref: UpdateReleaseRef;
};

type ResolvedChecksumSnapshot = DesktopUpdateChecksumSnapshot & { value: string };

type OwnedRoot =
  | { layout: DesktopUpdaterStoreLayout; metadataPath: string; ok: true; realRoot: string }
  | { error: DesktopUpdateErrorSnapshot; ok: false };

type ActionOptions = {
  autoDownload?: boolean;
};

type DesktopUpdaterStoreLayout = {
  backRoot: string;
  cleanupPath: string;
  downloadsRoot: string;
  helpersRoot: string;
  lockRoot: string;
  metadataPath: string;
  ownershipSentinelPath: string;
  releasesRoot: string;
  root: string;
  stagingRoot: string;
  stateRoot: string;
};

type ReleaseCleanupReason =
  | "cleanup-failed"
  | "current-version-or-newer"
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
  config: DesktopUpdaterConfig;
  downloadUpdate(): Promise<DesktopUpdateStatusSnapshot>;
  handle(action: DesktopUpdateAction): Promise<DesktopUpdateStatusSnapshot>;
  installUpdate(): Promise<DesktopUpdateStatusSnapshot>;
  shouldAutoCheck(): boolean;
  snapshot(): DesktopUpdateStatusSnapshot;
  status(): Promise<DesktopUpdateStatusSnapshot>;
  subscribe(listener: () => void): () => void;
};

export type DesktopUpdaterScheduler = {
  isRunning(): boolean;
  start(): void;
  stop(reason?: string): void;
};

type StartupSilentPayloadUpdateOptions = {
  isEnabled(): Promise<boolean>;
  requestQuit(): void;
};

function isTruthyEnv(value: string | undefined): boolean | null {
  if (value == null || value.length === 0) return null;
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  throw new Error(`boolean env value must be one of 1/0/true/false/yes/no, got ${value}`);
}

function normalizeMode(value: string | undefined, fallback: DesktopUpdateMode): DesktopUpdateMode {
  if (value == null || value.length === 0) return fallback;
  if (value === DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER || value === DESKTOP_UPDATE_MODES.JS_INCREMENTAL) return value;
  throw new Error(`unsupported desktop update mode: ${value}`);
}

function normalizeChannel(value: string | undefined, fallback: DesktopUpdateChannel): DesktopUpdateChannel {
  if (value == null || value.length === 0) return fallback;
  if (isDesktopUpdateChannel(value)) return value;
  throw new Error(`unsupported desktop update channel: ${value}`);
}

function isDesktopUpdateChannel(value: unknown): value is DesktopUpdateChannel {
  return typeof value === "string" && DESKTOP_UPDATE_CHANNEL_VALUES.has(value);
}

function defaultMetadataUrl(channel: DesktopUpdateChannel): string {
  return `${DEFAULT_RELEASE_ORIGIN}/${channel}/latest/metadata.json`;
}

function normalizeDownloadRoot(value: string): string {
  if (value.includes("\0")) throw new Error("update download root must not contain null bytes");
  if (!isAbsolute(value)) throw new Error(`update download root must be absolute: ${value}`);
  return resolve(value);
}

function normalizeOptionalRoot(value: string | null | undefined, label: string): string | undefined {
  if (value == null || value.length === 0) return undefined;
  if (value.includes("\0")) throw new Error(`${label} must not contain null bytes`);
  if (!isAbsolute(value)) throw new Error(`${label} must be absolute: ${value}`);
  return resolve(value);
}

function normalizeOptionalNonEmpty(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function durationEnv(value: string | undefined, fallback: number, name: string): number {
  if (value == null || value.length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number of milliseconds`);
  return parsed;
}

function positiveDurationEnv(value: string | undefined, fallback: number, name: string): number {
  const parsed = durationEnv(value, fallback, name);
  if (parsed === 0) throw new Error(`${name} must be greater than 0 milliseconds`);
  return parsed;
}

function defaultPollIntervalMs(channel: DesktopUpdateChannel): number {
  return channel === DESKTOP_UPDATE_CHANNELS.STABLE ? STABLE_POLL_INTERVAL_MS : BETA_POLL_INTERVAL_MS;
}

export function resolveDesktopUpdaterConfig(input: DesktopUpdaterConfigInput): DesktopUpdaterConfig {
  const env = input.env ?? process.env;
  const mode = normalizeMode(env[DESKTOP_UPDATE_ENV.MODE], input.mode ?? DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER);
  const defaultEnabled = input.source === SIDECAR_SOURCES.PACKAGED;
  const enabled = isTruthyEnv(env[DESKTOP_UPDATE_ENV.ENABLED]) ?? defaultEnabled;
  const runtimeBase = input.runtimeBase == null ? process.cwd() : input.runtimeBase;
  const downloadRoot = normalizeDownloadRoot(
    env[DESKTOP_UPDATE_ENV.DOWNLOAD_ROOT] ??
      input.downloadRoot ??
      join(resolve(runtimeBase), "updates"),
  );
  const currentVersion =
    env[DESKTOP_UPDATE_ENV.CURRENT_VERSION] ??
    input.currentVersion ??
    input.appVersion ??
    "0.0.0";
  const channel = normalizeChannel(env[DESKTOP_UPDATE_ENV.CHANNEL], defaultChannelForVersion(currentVersion));
  const installerObservationRoot = normalizeOptionalRoot(input.installerObservationRoot, "installer observation root");
  const launcherLaunchPath = normalizeOptionalNonEmpty(input.launcherLaunchPath);
  const launcherRoot = normalizeOptionalRoot(input.launcherRoot, "launcher root");
  const launcherPayloadExtractorPath = normalizeOptionalRoot(input.launcherPayloadExtractorPath, "launcher payload extractor path");
  const launcherRuntimePath = normalizeOptionalRoot(input.launcherRuntimePath, "launcher runtime path");
  const namespace = normalizeOptionalNonEmpty(input.namespace);

  return {
    arch: env[DESKTOP_UPDATE_ENV.ARCH] ?? input.arch ?? process.arch,
    autoCheck: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_CHECK]) ?? enabled,
    autoDownload: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]) ?? true,
    autoOpen: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_OPEN]) ?? false,
    checkBackoffInitialMs: positiveDurationEnv(
      env[DESKTOP_UPDATE_ENV.CHECK_BACKOFF_INITIAL_MS],
      DEFAULT_POLL_BACKOFF_INITIAL_MS,
      DESKTOP_UPDATE_ENV.CHECK_BACKOFF_INITIAL_MS,
    ),
    checkBackoffMaxMs: positiveDurationEnv(
      env[DESKTOP_UPDATE_ENV.CHECK_BACKOFF_MAX_MS],
      DEFAULT_POLL_BACKOFF_MAX_MS,
      DESKTOP_UPDATE_ENV.CHECK_BACKOFF_MAX_MS,
    ),
    checkInitialDelayMs: durationEnv(
      env[DESKTOP_UPDATE_ENV.CHECK_INITIAL_DELAY_MS],
      DEFAULT_POLL_INITIAL_DELAY_MS,
      DESKTOP_UPDATE_ENV.CHECK_INITIAL_DELAY_MS,
    ),
    checkIntervalMs: positiveDurationEnv(
      env[DESKTOP_UPDATE_ENV.CHECK_INTERVAL_MS],
      defaultPollIntervalMs(channel),
      DESKTOP_UPDATE_ENV.CHECK_INTERVAL_MS,
    ),
    channel,
    currentVersion,
    downloadRoot,
    enabled,
    ...(installerObservationRoot == null ? {} : { installerObservationRoot }),
    ...(launcherLaunchPath == null ? {} : { launcherLaunchPath }),
    ...(launcherRoot == null ? {} : { launcherRoot }),
    ...(launcherPayloadExtractorPath == null ? {} : { launcherPayloadExtractorPath }),
    ...(launcherRuntimePath == null ? {} : { launcherRuntimePath }),
    metadataUrl: env[DESKTOP_UPDATE_ENV.METADATA_URL] ?? defaultMetadataUrl(channel),
    mode,
    ...(namespace == null ? {} : { namespace }),
    openDryRun: isTruthyEnv(env[DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]) ?? false,
    platform: env[DESKTOP_UPDATE_ENV.PLATFORM] ?? input.platform ?? process.platform,
    source: input.source,
  };
}

function isSupportedPackageLauncherPlatform(platform: string): boolean {
  return platform === "darwin" || platform === "win32";
}

function capabilitiesFor(status: { artifactType?: string; mode: DesktopUpdateMode; platform: string; supported: boolean }) {
  const packageLauncher =
    status.mode === DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER &&
    isSupportedPackageLauncherPlatform(status.platform) &&
    status.supported;
  const payloadUpdate = status.artifactType === "payload";
  const hasSelectedArtifact = status.artifactType != null && status.artifactType.length > 0;
  const manualInstaller = packageLauncher && (!hasSelectedArtifact || !payloadUpdate);
  return {
    canApplyInPlace: packageLauncher && payloadUpdate,
    canDownload: packageLauncher,
    canOpenInstaller: manualInstaller,
    requiresManualInstall: manualInstaller,
  };
}

function createError(code: string, message: string, details?: unknown): DesktopUpdateErrorSnapshot {
  return {
    code,
    ...(details === undefined ? {} : { details }),
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectField(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "update";
}

function extensionForArtifact(name: string | undefined, type: string): string {
  const ext = name == null ? "" : extname(name).toLowerCase();
  if (ext === ".7z" || ext === ".dmg" || ext === ".zip" || ext === ".exe" || ext === ".appimage") return ext;
  if (type === "dmg") return ".dmg";
  if (type === "zip") return ".zip";
  if (type === "installer") return ".exe";
  return ".bin";
}

function artifactFileName(candidate: UpdateCandidate): string {
  const ext = extensionForArtifact(candidate.artifact.name, candidate.artifact.type ?? "artifact");
  return [
    "open-design",
    sanitizePathSegment(candidate.version),
    sanitizePathSegment(candidate.platformKey),
    sanitizePathSegment(candidate.arch),
    sanitizePathSegment(candidate.artifact.type ?? "artifact"),
  ].join("-") + ext;
}

function releaseKey(candidate: UpdateCandidate, checksum: DesktopUpdateChecksumSnapshot): string {
  const digest = checksum.value == null ? checksum.url ?? candidate.artifact.url : checksum.value;
  return [
    sanitizePathSegment(candidate.version),
    sanitizePathSegment(candidate.platformKey),
    sanitizePathSegment(candidate.arch),
    sanitizePathSegment(createHash("sha256").update(digest).digest("hex").slice(0, 12)),
  ].join("-");
}

function releaseMatchesCandidate(
  saved: UpdateReleaseRef,
  candidate: UpdateCandidate,
): boolean {
  if (saved.channel !== candidate.channel) return false;
  if (saved.platformKey !== candidate.platformKey) return false;
  if (saved.arch !== candidate.arch) return false;
  if (saved.version !== candidate.version) return false;
  if (saved.artifact.url !== candidate.artifact.url) return false;
  if (saved.checksum.algorithm !== candidate.checksum.algorithm) return false;
  if (candidate.checksum.url != null && saved.checksum.url !== candidate.checksum.url) return false;
  if (candidate.checksum.value != null && saved.checksum.value !== candidate.checksum.value) return false;
  return true;
}

function containsPath(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

function resolveDesktopUpdaterStoreLayout(root: string): DesktopUpdaterStoreLayout {
  const realRoot = resolve(root);
  const stateRoot = join(realRoot, STATE_DIR);
  return {
    backRoot: join(realRoot, BACK_DIR),
    cleanupPath: join(stateRoot, CLEANUP_METADATA_FILE),
    downloadsRoot: join(realRoot, DOWNLOADS_DIR),
    helpersRoot: join(realRoot, HELPERS_DIR),
    lockRoot: join(stateRoot, LOCK_DIR),
    metadataPath: join(realRoot, STORE_METADATA_FILE),
    ownershipSentinelPath: join(realRoot, OWNERSHIP_SENTINEL),
    releasesRoot: join(realRoot, RELEASES_DIR),
    root: realRoot,
    stagingRoot: join(realRoot, STAGING_DIR),
    stateRoot,
  };
}

function rootEntryForPath(layout: DesktopUpdaterStoreLayout, path: string): string {
  return relative(layout.root, path).split(/[\\/]/)[0] ?? "";
}

function rootEntriesForLayout(layout: DesktopUpdaterStoreLayout): Set<string> {
  return new Set([
    rootEntryForPath(layout, layout.backRoot),
    rootEntryForPath(layout, layout.downloadsRoot),
    rootEntryForPath(layout, layout.helpersRoot),
    rootEntryForPath(layout, layout.ownershipSentinelPath),
    rootEntryForPath(layout, layout.releasesRoot),
    rootEntryForPath(layout, layout.stagingRoot),
    rootEntryForPath(layout, layout.stateRoot),
    rootEntryForPath(layout, layout.metadataPath),
  ]);
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readJsonStrict<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function directoryIsEmpty(path: string): Promise<boolean> {
  const entries = await readdir(path);
  return entries.length === 0;
}

function storeShapeError(root: string, message: string, details?: unknown): DesktopUpdateErrorSnapshot {
  return createError("update-store-invalid-shape", message, {
    root,
    ...(details === undefined ? {} : { details }),
  });
}

function logStoreError(logger: DesktopUpdaterLogger, error: DesktopUpdateErrorSnapshot): void {
  logger.error("[open-design updater] invalid update store", error);
}

function isAllowedRootEntry(layout: DesktopUpdaterStoreLayout, name: string): boolean {
  return rootEntriesForLayout(layout).has(name);
}

function isUpdateStoreMetadata(value: unknown): value is UpdateStoreMetadata {
  if (!isRecord(value) || value.version !== STORE_METADATA_VERSION) return false;
  if (value.active != null && !isUpdateReleaseRef(value.active)) return false;
  if (value.incoming != null && !isIncomingRef(value.incoming)) return false;
  if (value.installFrozen != null && typeof value.installFrozen !== "boolean") return false;
  if (value.installResult != null && !isInstallResult(value.installResult)) return false;
  if (value.lastCheckedAt != null && typeof value.lastCheckedAt !== "string") return false;
  return true;
}

function isArtifactSnapshot(value: unknown): value is DesktopUpdateArtifactSnapshot {
  if (!isRecord(value)) return false;
  if (stringField(value, "platformKey") == null) return false;
  if (stringField(value, "type") == null) return false;
  if (stringField(value, "url") == null) return false;
  if (value.name != null && typeof value.name !== "string") return false;
  if (value.size != null && (typeof value.size !== "number" || !Number.isFinite(value.size))) return false;
  return true;
}

function isChecksumSnapshot(value: unknown): value is DesktopUpdateChecksumSnapshot {
  if (!isRecord(value)) return false;
  if (value.algorithm !== "sha256" && value.algorithm !== "sha512") return false;
  if (value.value != null && typeof value.value !== "string") return false;
  if (value.url != null && typeof value.url !== "string") return false;
  return true;
}

function isResolvedChecksumSnapshot(value: unknown): value is ResolvedChecksumSnapshot {
  return isChecksumSnapshot(value) && typeof value.value === "string" && value.value.length > 0;
}

function isUpdateReleaseRef(value: unknown): value is UpdateReleaseRef {
  if (!isRecord(value)) return false;
  return stringField(value, "arch") != null &&
    isArtifactSnapshot(value.artifact) &&
    stringField(value, "artifactPath") != null &&
    isChecksumSnapshot(value.checksum) &&
    stringField(value, "checksumPath") != null &&
    isDesktopUpdateChannel(value.channel) &&
    stringField(value, "downloadedAt") != null &&
    stringField(value, "key") != null &&
    isRecord(value.metadata) &&
    stringField(value, "metadataPath") != null &&
    stringField(value, "platformKey") != null &&
    stringField(value, "version") != null;
}

function isIncomingRef(value: unknown): value is IncomingRef {
  if (!isRecord(value)) return false;
  return stringField(value, "arch") != null &&
    isArtifactSnapshot(value.artifact) &&
    isDesktopUpdateChannel(value.channel) &&
    stringField(value, "cycleId") != null &&
    isRecord(value.metadata) &&
    stringField(value, "platformKey") != null &&
    stringField(value, "startedAt") != null &&
    stringField(value, "version") != null;
}

function isInstallResult(value: unknown): value is NonNullable<DesktopUpdateStatusSnapshot["installResult"]> {
  if (!isRecord(value)) return false;
  if (stringField(value, "openedAt") == null) return false;
  if (stringField(value, "path") == null) return false;
  if (value.activeVersion != null && typeof value.activeVersion !== "string") return false;
  if (value.artifactPath != null && typeof value.artifactPath !== "string") return false;
  if (value.dryRun != null && typeof value.dryRun !== "boolean") return false;
  if (value.helperLogPath != null && typeof value.helperLogPath !== "string") return false;
  if (value.launcherRuntimePath != null && typeof value.launcherRuntimePath !== "string") return false;
  if (value.launchPath != null && typeof value.launchPath !== "string") return false;
  return true;
}

async function ensureOwnedUpdateRoot(
  config: DesktopUpdaterConfig,
  logger: DesktopUpdaterLogger = console,
): Promise<OwnedRoot> {
  const root = normalizeDownloadRoot(config.downloadRoot);
  try {
    await mkdir(root, { recursive: true });
    const rootEntry = await lstat(root);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
      return {
        ok: false,
        error: createError("update-root-not-owned", `update root is not an owned directory: ${root}`),
      };
    }
    const realRoot = await realpath(root);
    const layout = resolveDesktopUpdaterStoreLayout(realRoot);
    const sentinel = await readJson<{ namespace?: string; version?: number }>(layout.ownershipSentinelPath);
    if (sentinel != null) {
      if (sentinel.version !== UPDATE_ROOT_VERSION) {
        return {
          ok: false,
          error: createError("update-root-version-mismatch", `update root has unsupported ownership marker version at ${layout.ownershipSentinelPath}`),
        };
      }
    } else {
      if (!(await directoryIsEmpty(realRoot))) {
        return {
          ok: false,
          error: createError(
            "update-root-not-owned",
            `update root is not empty and has no Open Design updater ownership marker: ${realRoot}`,
          ),
        };
      }
      await writeJson(layout.ownershipSentinelPath, {
        createdAt: new Date().toISOString(),
        owner: "open-design-updater",
        source: config.source,
        version: UPDATE_ROOT_VERSION,
      });
    }

    const entries = await readdir(realRoot);
    const unexpected = entries.filter((entry) => !isAllowedRootEntry(layout, entry));
    if (unexpected.length > 0) {
      const error = storeShapeError(realRoot, "update store contains unexpected root entries", { unexpected });
      logStoreError(logger, error);
      return { ok: false, error };
    }

    for (const dirName of [RELEASES_DIR, STAGING_DIR, DOWNLOADS_DIR, BACK_DIR, HELPERS_DIR, STATE_DIR]) {
      const path = join(realRoot, dirName);
      let entry;
      try {
        entry = await lstat(path);
      } catch {
        continue;
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        const error = storeShapeError(realRoot, `update store entry ${dirName} must be a plain directory`, { path });
        logStoreError(logger, error);
        return { ok: false, error };
      }
      const realDir = await realpath(path);
      if (!containsPath(realRoot, realDir)) {
        const error = storeShapeError(realRoot, `update store entry ${dirName} escapes update root`, { path, realDir });
        logStoreError(logger, error);
        return { ok: false, error };
      }
    }

    try {
      await access(layout.metadataPath);
    } catch {
      const nonSentinelEntries = entries.filter((entry) => entry !== OWNERSHIP_SENTINEL);
      if (nonSentinelEntries.length > 0) {
        const error = storeShapeError(realRoot, "update store metadata.json is missing for a non-empty store", {
          entries: nonSentinelEntries,
        });
        logStoreError(logger, error);
        return { ok: false, error };
      }
      await writeJson(layout.metadataPath, { version: STORE_METADATA_VERSION });
    }

    return { ok: true, layout, metadataPath: layout.metadataPath, realRoot };
  } catch (error) {
    return {
      ok: false,
      error: createError("update-root-unavailable", error instanceof Error ? error.message : String(error)),
    };
  }
}

function defaultChannelForVersion(version: string): DesktopUpdateChannel {
  const channel = releaseChannelFromVersion(version);
  return channel ?? DESKTOP_UPDATE_CHANNELS.STABLE;
}

export function compareVersions(a: string, b: string): number {
  return compareLauncherVersions(a, b);
}

function metadataChannel(metadata: Record<string, unknown>): DesktopUpdateChannel | null {
  const channel = stringField(metadata, "channel");
  return isDesktopUpdateChannel(channel) ? channel : null;
}

function releaseVersionForChannel(metadata: Record<string, unknown>, channel: DesktopUpdateChannel): string | null {
  if (channel === DESKTOP_UPDATE_CHANNELS.BETA) return stringField(metadata, "releaseVersion") ?? stringField(metadata, "betaVersion");
  if (channel === DESKTOP_UPDATE_CHANNELS.BETAS) return stringField(metadata, "releaseVersion");
  if (channel === DESKTOP_UPDATE_CHANNELS.PRERELEASE) return stringField(metadata, "releaseVersion") ?? stringField(metadata, "prereleaseVersion");
  if (channel === DESKTOP_UPDATE_CHANNELS.PREVIEW) return stringField(metadata, "releaseVersion") ?? stringField(metadata, "previewVersion");
  return stringField(metadata, "releaseVersion") ?? stringField(metadata, "stableVersion");
}

function selectedMacPlatformKey(arch: string): string {
  return arch === "x64" ? "macIntel" : "mac";
}

function selectedWinPlatformKey(arch: string): string {
  if (arch === "x64") return "win";
  if (arch === "arm64") return "winArm64";
  if (arch === "ia32") return "winIa32";
  return `win-${sanitizePathSegment(arch)}`;
}

function selectedPackageLauncherArtifact(config: DesktopUpdaterConfig, preferPayload = false): {
  artifactKey: "dmg" | "installer" | "payload";
  artifactType: "dmg" | "installer" | "payload";
  description: string;
  platformKey: string;
} | null {
  if (config.platform === "darwin") {
    const platformKey = selectedMacPlatformKey(config.arch);
    if (preferPayload) {
      return {
        artifactKey: "payload",
        artifactType: "payload",
        description: "mac launcher payload",
        platformKey,
      };
    }
    return {
      artifactKey: "dmg",
      artifactType: "dmg",
      description: "mac DMG",
      platformKey,
    };
  }
  if (config.platform === "win32") {
    const platformKey = selectedWinPlatformKey(config.arch);
    if (preferPayload) {
      return {
        artifactKey: "payload",
        artifactType: "payload",
        description: "Windows launcher payload",
        platformKey,
      };
    }
    return {
      artifactKey: "installer",
      artifactType: "installer",
      description: "Windows installer",
      platformKey,
    };
  }
  return null;
}

function installerObservationArtifactType(value: string | undefined): InstallerObservationArtifactType | null {
  if (value === "dmg" || value === "installer") return value;
  return null;
}

function selectUpdateCandidate(
  metadata: Record<string, unknown>,
  config: DesktopUpdaterConfig,
  preferPayload = false,
): { candidate: UpdateCandidate; ok: true } | { error: DesktopUpdateErrorSnapshot; ok: false; state: DesktopUpdateState } {
  if (config.mode === DESKTOP_UPDATE_MODES.JS_INCREMENTAL) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.UNSUPPORTED,
      error: createError("update-mode-not-implemented", "js-incremental updates are not implemented yet"),
    };
  }
  if (config.mode !== DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.UNSUPPORTED,
      error: createError("update-mode-unsupported", `unsupported update mode: ${config.mode}`),
    };
  }
  const artifactSelection = selectedPackageLauncherArtifact(config, preferPayload);
  if (artifactSelection == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.UNSUPPORTED,
      error: createError("unsupported-platform", "package-launcher updates are currently supported on macOS and Windows only"),
    };
  }

  const channel = metadataChannel(metadata);
  if (channel == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("metadata-channel-unsupported", "release metadata does not include a supported update channel"),
    };
  }
  if (channel !== config.channel) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError(
        "metadata-channel-mismatch",
        `release metadata channel ${channel} does not match configured update channel ${config.channel}`,
      ),
    };
  }

  const platforms = objectField(metadata, "platforms");
  if (platforms == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("metadata-missing-platforms", "release metadata does not include platform artifacts"),
    };
  }
  const platformKey = artifactSelection.platformKey;
  const platform = objectField(platforms, platformKey);
  if (platform == null || platform.enabled !== true) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("no-compatible-artifact", `release metadata does not include an enabled ${platformKey} artifact`),
    };
  }
  const version = releaseVersionForChannel(metadata, config.channel);
  if (version == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("metadata-missing-version", `release metadata does not include a ${config.channel} update version`),
    };
  }
  const artifacts = objectField(platform, "artifacts");
  const artifactRecord = artifacts == null ? null : objectField(artifacts, artifactSelection.artifactKey);
  const url = artifactRecord == null ? null : stringField(artifactRecord, "url");
  if (artifactRecord == null || url == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError(
        "no-compatible-artifact",
        `release metadata does not include a ${artifactSelection.description} artifact for ${platformKey}`,
      ),
    };
  }

  const artifact: DesktopUpdateArtifactSnapshot = {
    ...(stringField(artifactRecord, "name") == null ? {} : { name: stringField(artifactRecord, "name") as string }),
    platformKey,
    ...(numberField(artifactRecord, "size") == null ? {} : { size: numberField(artifactRecord, "size") }),
    type: artifactSelection.artifactType,
    url,
  };
  const sha256 = stringField(artifactRecord, "sha256") ?? stringField(artifactRecord, "sha256Digest");
  const sha512 = stringField(artifactRecord, "sha512") ?? stringField(artifactRecord, "sha512Digest");
  const checksum: DesktopUpdateChecksumSnapshot =
    sha512 != null
      ? { algorithm: "sha512", value: sha512 }
      : {
          algorithm: "sha256",
          ...(sha256 == null ? {} : { value: sha256 }),
          ...(stringField(artifactRecord, "sha256Url") == null ? {} : { url: stringField(artifactRecord, "sha256Url") as string }),
        };

  return {
    ok: true,
    candidate: {
      arch: stringField(platform, "arch") ?? config.arch,
      artifact,
      checksum,
      channel: config.channel,
      metadata,
      platformKey,
      version,
    },
  };
}

function selectUpdateCandidateWithFallback(
  metadata: Record<string, unknown>,
  config: DesktopUpdaterConfig,
  preferPayload: boolean,
): { candidate: UpdateCandidate; ok: true } | { error: DesktopUpdateErrorSnapshot; ok: false; state: DesktopUpdateState } {
  if (!preferPayload) return selectUpdateCandidate(metadata, config);
  const payload = selectUpdateCandidate(metadata, config, true);
  if (payload.ok || payload.error.code !== "no-compatible-artifact") return payload;
  return selectUpdateCandidate(metadata, config);
}

function controlLauncherVersionMin(metadata: Record<string, unknown>): string | null {
  const control = objectField(metadata, "control");
  const launcher = control == null ? null : objectField(control, "launcher");
  const version = launcher == null ? null : objectField(launcher, "version");
  return version == null ? null : stringField(version, "min");
}

/**
 * Installed-base escape hatch: decide whether the remote release is beyond what
 * this build can adopt as an in-place payload update, forcing a full installer
 * instead. Two orthogonal guardrails, either of which trips → installer:
 *
 *  - `launcher.schema` (ABI axis): the release declares a launcher-contract schema
 *    number this build cannot interpret (`feed.launcher.schema >
 *    LAUNCHER_SCHEMA_VERSION`). This is the reseed boundary — a pure int compare.
 *  - `control.launcher.version.min` (recency axis): the release requires a
 *    launcher/build version newer than this one (`min > currentVersion`).
 *
 * Both are feed declarations read here; a future launcher enforces the same schema
 * floor locally against on-disk manifests. Missing/malformed fields are ignored
 * (fail-open) so older feeds keep updating seamlessly.
 */
export function remoteRequiresReinstall(metadata: Record<string, unknown>, config: DesktopUpdaterConfig): boolean {
  const launcher = objectField(metadata, "launcher");
  const remoteLauncherSchema = launcher == null ? undefined : numberField(launcher, "schema");
  if (remoteLauncherSchema != null && remoteLauncherSchema > LAUNCHER_SCHEMA_VERSION) {
    return true;
  }
  const minVersion = controlLauncherVersionMin(metadata);
  if (minVersion != null && compareVersions(minVersion, config.currentVersion) > 0) {
    return true;
  }
  return false;
}

async function fetchJson(fetchImpl: typeof globalThis.fetch, url: string): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`metadata request returned HTTP ${response.status}`);
  const body = await response.json();
  if (!isRecord(body)) throw new Error("metadata response was not a JSON object");
  return body;
}

async function hasValidLauncherPayloadContext(config: DesktopUpdaterConfig): Promise<boolean> {
  if (config.launcherRoot == null || config.launcherLaunchPath == null || config.launcherRuntimePath == null || config.namespace == null) {
    return false;
  }
  try {
    await access(config.launcherLaunchPath);
    const launcherTarget = await lstat(config.launcherLaunchPath);
    if (launcherTarget.isSymbolicLink() || (!launcherTarget.isFile() && !launcherTarget.isDirectory())) {
      return false;
    }
    const runtime = await readJsonStrict<LauncherRuntimeDescriptor>(config.launcherRuntimePath);
    validateLauncherRuntimeDescriptor(runtime, { channel: config.channel, namespace: config.namespace });
    return true;
  } catch {
    return false;
  }
}

function parseChecksumText(text: string, algorithm: "sha256" | "sha512"): string {
  const length = algorithm === "sha256" ? 64 : 128;
  const match = text.match(new RegExp(`\\b[0-9a-fA-F]{${length}}\\b`));
  if (match == null) throw new Error(`checksum file does not include a ${algorithm} digest`);
  return match[0].toLowerCase();
}

async function resolveChecksum(fetchImpl: typeof globalThis.fetch, checksum: DesktopUpdateChecksumSnapshot): Promise<DesktopUpdateChecksumSnapshot> {
  if (checksum.value != null) return checksum;
  if (checksum.url == null) throw new Error("artifact checksum is missing");
  const response = await fetchImpl(checksum.url);
  if (!response.ok) throw new Error(`checksum request returned HTTP ${response.status}`);
  return {
    ...checksum,
    value: parseChecksumText(await response.text(), checksum.algorithm),
  };
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
}): Promise<void> {
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
}): Promise<LauncherRuntimeDescriptor> {
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
  await assertPreparedLauncherPayloadRelease({
    config: input.config,
    root: versionPaths.versionRoot,
    version: input.activeRelease.ref.version,
  });
  const activeRuntimeVersion = currentRuntime.active;
  const alreadyActive = activeRuntimeVersion?.version === input.activeRelease.ref.version;
  const nextActive = alreadyActive && activeRuntimeVersion != null
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
  return nextRuntime;
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

async function ensureOwnedSubdir(root: string, name: string): Promise<string> {
  if (name.length === 0 || name.includes("\0") || /[\\/]/.test(name)) {
    throw new Error(`update subdirectory must be a simple path segment: ${name}`);
  }
  const dir = join(root, name);
  if (!containsPath(root, dir)) throw new Error(`update subdirectory escaped update root: ${dir}`);
  await mkdir(dir, { recursive: true });
  const entry = await lstat(dir);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`update subdirectory is not an owned directory: ${dir}`);
  }
  const realDir = await realpath(dir);
  if (!containsPath(root, realDir)) throw new Error(`update subdirectory realpath escaped update root: ${realDir}`);
  return realDir;
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
      { detached: true, stdio: "ignore", windowsHide: true },
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
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function launchWindowsAppAfterQuit(
  input: DeferredAppLaunchInput,
  deps: { now: () => Date; spawnDetached: SpawnInstallerHelper },
): Promise<DeferredLaunchResult> {
  try {
    const child = deps.spawnDetached(
      input.launchPath,
      buildLauncherAfterQuitArgs({ targetPid: input.appPid, timeoutMs: input.timeoutMs }),
      { detached: true, stdio: "ignore", windowsHide: true },
    );
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
  if (value.trigger !== "cold-start" && value.trigger !== "next-version-ready") return false;
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
): Promise<T | null> {
  await mkdir(layout.stateRoot, { recursive: true });
  try {
    await mkdir(layout.lockRoot);
    await writeJson(join(layout.lockRoot, LOCK_OWNER_FILE), {
      createdAt: new Date().toISOString(),
      owner: "open-design-updater-lifecycle",
      pid: process.pid,
      version: RELEASE_CLEANUP_DESCRIPTOR_VERSION,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      logger.warn("[open-design updater] skipped release lifecycle because updater lifecycle lock is held", {
        lockRoot: layout.lockRoot,
      });
      return null;
    }
    throw error;
  }
  try {
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
  descriptor: ReleaseCleanupDescriptor | null;
  layout: DesktopUpdaterStoreLayout;
  nowIso: string;
  readyVersion?: string;
}): Promise<ReleaseCleanupEntry[]> {
  const { config, descriptor, layout, nowIso, readyVersion } = input;
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

    const deprecated = compareVersions(version, config.currentVersion) < 0;
    const next: ReleaseCleanupEntry = {
      currentVersion: config.currentVersion,
      key: entry.name,
      metadataPath: relativeStorePath(layout, metadataPath),
      path: relativeStorePath(layout, releaseDir),
      ...(readyVersion == null ? {} : { readyVersion }),
      reason: deprecated ? "older-than-current-version" : "current-version-or-newer",
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
  readyVersion?: string;
  trigger: DesktopUpdateCacheLifecycleTrigger;
}): Promise<DesktopUpdateCacheLifecycleSummary | null> {
  const { config, layout, logger, now, readyVersion, trigger } = input;
  return await withUpdaterLifecycleLock(layout, logger, async () => {
    const startedAt = now().toISOString();
    const current = await readReleaseCleanupDescriptor(layout);
    let next: ReleaseCleanupDescriptor;
    if (trigger === "next-version-ready") {
      next = {
        currentVersion: config.currentVersion,
        platform: config.platform,
        ...(readyVersion == null ? {} : { readyVersion }),
        releases: await scanReleaseCleanupEntries({
          config,
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
  });
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
): Promise<{ active: LoadedRelease | null; ok: true } | { error: DesktopUpdateErrorSnapshot; ok: false }> {
  const active = metadata.active;
  if (active == null) return { ok: true, active: null };
  if (compareVersions(active.version, config.currentVersion) <= 0) return { ok: true, active: null };
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

function checksumMatchesCandidate(checksum: ResolvedChecksumSnapshot, candidate: UpdateCandidate): boolean {
  if (checksum.algorithm !== candidate.checksum.algorithm) return false;
  if (candidate.checksum.url != null && checksum.url !== candidate.checksum.url) return false;
  if (candidate.checksum.value != null && checksum.value.toLowerCase() !== candidate.checksum.value.toLowerCase()) return false;
  return true;
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
    if (config.platform === "win32") return await launchWindowsAppAfterQuit(input, { now, spawnDetached });
    const error = await launchMacInstallerAfterQuit(
      { appPid: input.appPid, installerPath: input.launchPath, root: input.root, timeoutMs: input.timeoutMs },
      { now, spawnDetached },
    );
    return error.length > 0 ? { error } : {};
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
    const loadedActive = await loadActiveRelease(opened.root, restoredMetadata, config, logger);
    if (!loadedActive.ok) return setState(DESKTOP_UPDATE_STATES.ERROR, loadedActive.error);
    activeRelease = loadedActive.active;
    // If the app now runs at or beyond the stored active release, the
    // external installer succeeded and its one-shot UI state is stale.
    const clearedAppliedRelease =
      activeRelease == null &&
      (
        restoredMetadata.active != null ||
        restoredMetadata.installFrozen === true ||
        restoredMetadata.installResult != null
      );
    if (clearedAppliedRelease) {
      await writeStoreMetadata(opened.root, {
        ...restoredMetadata,
        active: undefined,
        incoming: undefined,
        installFrozen: undefined,
        installResult: undefined,
        version: STORE_METADATA_VERSION,
      });
    }
    installFrozen = clearedAppliedRelease ? false : restoredMetadata.installFrozen === true;
    installResult = clearedAppliedRelease ? undefined : restoredMetadata.installResult;
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
      const reseedRequired = launcherPayloadContextValid && remoteRequiresReinstall(body, config);
      if (reseedRequired) {
        logUpdateEvent("reseed-required-installer-route", {
          currentVersion: config.currentVersion,
          supportedLauncherSchema: LAUNCHER_SCHEMA_VERSION,
        });
      }
      const selected = selectUpdateCandidateWithFallback(body, config, launcherPayloadContextValid && !reseedRequired);
      if (!selected.ok) {
        return selected.state === DESKTOP_UPDATE_STATES.ERROR
          ? setFailurePreservingActive(selected.error)
          : setState(selected.state, selected.error);
      }
      if (compareVersions(selected.candidate.version, config.currentVersion) <= 0) {
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
      installerPath: resolvedDownload,
      root: updateRoot,
      timeoutMs: config.platform === "win32" ? WINDOWS_DEFERRED_INSTALLER_TIMEOUT_MS : MAC_DEFERRED_INSTALLER_TIMEOUT_MS,
    });
  }

  async function requestPayloadRelaunch(updateRoot: string): Promise<DeferredLaunchResult & { launchPath?: string }> {
    if (config.openDryRun) return {};
    if (config.platform !== "darwin" && config.platform !== "win32") return {};
    const launchPath = config.launcherLaunchPath;
    if (launchPath == null || launchPath.length === 0) {
      return { error: "launcher payload relaunch requires a stable launcher launch path" };
    }
    try {
      await access(launchPath);
      const launcherTarget = await lstat(launchPath);
      if (launcherTarget.isSymbolicLink() || (!launcherTarget.isFile() && !launcherTarget.isDirectory())) {
        return { error: `launcher launch path is not a plain file or directory: ${launchPath}` };
      }
    } catch (launchPathError) {
      return { error: launchPathError instanceof Error ? launchPathError.message : String(launchPathError) };
    }
    const result = await launchAppAfterQuit({
      appPid: processPid,
      launchPath,
      root: updateRoot,
      timeoutMs: config.platform === "win32" ? WINDOWS_DEFERRED_INSTALLER_TIMEOUT_MS : MAC_DEFERRED_INSTALLER_TIMEOUT_MS,
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
      try {
        const appliedAt = now().toISOString();
        await activatePreparedLauncherPayloadRelease({
          activeRelease,
          config,
          logger,
          now,
          removeLauncherPayloadRoot,
        });
        const relaunch = await requestPayloadRelaunch(opened.root.realRoot);
        if (relaunch.error != null && relaunch.error.length > 0) {
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

  return {
    checkForUpdates: (options) => serialized(() => checkForCandidate(options)),
    config,
    downloadUpdate: () => serialized(downloadUpdate),
    handle(action) {
      switch (action) {
        case "status":
          return this.status();
        case "check":
          return this.checkForUpdates();
        case "download":
          return this.downloadUpdate();
        case "install":
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

export function createDesktopUpdaterScheduler(
  updater: DesktopUpdater,
  options: {
    backoffInitialMs: number;
    backoffMaxMs: number;
    initialDelayMs: number;
    intervalMs: number;
    logger?: DesktopUpdaterLogger;
    startupSilentPayloadUpdate?: StartupSilentPayloadUpdateOptions;
  },
): DesktopUpdaterScheduler {
  const logger = options.logger ?? console;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failureCount = 0;
  let tickRunning = false;
  let unsubscribe: (() => void) | null = null;
  let warnedZeroDelay = false;
  let startupTickPending = true;

  const clearTimer = () => {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
  };

  const stop = (_reason?: string) => {
    if (!running && timer == null) return;
    running = false;
    clearTimer();
    unsubscribe?.();
    unsubscribe = null;
  };

  const normalizeScheduledDelay = (delayMs: number): number => {
    if (delayMs > 0) return delayMs;
    if (!warnedZeroDelay) {
      warnedZeroDelay = true;
      logger.warn(
        `[open-design updater] refusing non-positive scheduled poll delay (${delayMs}ms); `
          + `using ${MIN_SCHEDULED_POLL_DELAY_MS}ms floor`,
      );
    }
    return MIN_SCHEDULED_POLL_DELAY_MS;
  };

  const nextDelay = (status: DesktopUpdateStatusSnapshot | null): number => {
    if (status != null && status.state !== DESKTOP_UPDATE_STATES.ERROR && status.error == null) {
      failureCount = 0;
      return options.intervalMs;
    }
    failureCount += 1;
    const backoff = options.backoffInitialMs * 2 ** Math.max(0, failureCount - 1);
    return Math.min(options.backoffMaxMs, backoff);
  };

  const schedule = (delayMs: number) => {
    if (!running || timer != null) return;
    const boundedDelayMs = normalizeScheduledDelay(delayMs);
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, boundedDelayMs);
    timer.unref?.();
  };

  const tick = async () => {
    if (!running || tickRunning) return;
    tickRunning = true;
    let status: DesktopUpdateStatusSnapshot | null = null;
    const startupTick = startupTickPending;
    startupTickPending = false;
    try {
      const startupReady = startupTick && options.startupSilentPayloadUpdate != null
        ? await updater.status()
        : null;
      status = await updater.checkForUpdates();
      if (
        startupTick
        && options.startupSilentPayloadUpdate != null
        && startupReady?.installResult == null
        && startupReady?.state === DESKTOP_UPDATE_STATES.DOWNLOADED
        && startupReady.artifact?.type === "payload"
        && startupReady.capabilities.canApplyInPlace
        && startupReady.downloadPath != null
        && startupReady.downloadPath === status.downloadPath
        && status.installResult == null
        && status.state === DESKTOP_UPDATE_STATES.DOWNLOADED
        && status.artifact?.type === "payload"
        && status.capabilities.canApplyInPlace
      ) {
        try {
          const enabled = await options.startupSilentPayloadUpdate.isEnabled();
          if (enabled) {
            status = await updater.installUpdate();
            if (status.installResult != null) {
              stop("silent-payload-installed");
              options.startupSilentPayloadUpdate.requestQuit();
              return;
            }
          }
        } catch (silentError) {
          logger.warn("[open-design updater] startup silent payload update failed", silentError);
        }
      }
      if (status.installResult != null) {
        stop("installer-opened");
        return;
      }
    } catch (error) {
      logger.warn("[open-design updater] scheduled update check failed", error);
    } finally {
      tickRunning = false;
    }
    if (running) schedule(nextDelay(status));
  };

  return {
    isRunning: () => running,
    start() {
      if (running) return;
      if (updater.snapshot().installResult != null) return;
      running = true;
      unsubscribe = updater.subscribe(() => {
        if (updater.snapshot().installResult != null) stop("installer-opened");
      });
      schedule(options.initialDelayMs);
    },
    stop,
  };
}
