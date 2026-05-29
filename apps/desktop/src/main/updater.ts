import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
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

import {
  MANAGED_DOWNLOAD_ERROR_CODES,
  ManagedDownloadError,
  downloadCopyAndClear,
  type ManagedDownloadChecksum,
  type ManagedDownloadProgress,
} from "@open-design/download";
import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_STATES,
  SIDECAR_SOURCES,
  type DesktopUpdateAction,
  type DesktopUpdateArtifactSnapshot,
  type DesktopUpdateChannel,
  type DesktopUpdateChecksumSnapshot,
  type DesktopUpdateErrorSnapshot,
  type DesktopUpdateMode,
  type DesktopUpdateProgressSnapshot,
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
const UPDATE_ROOT_VERSION = 1;
const STORE_METADATA_VERSION = 1;
const BETA_POLL_INTERVAL_MS = 15 * 60 * 1000;
const STABLE_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_POLL_INITIAL_DELAY_MS = 5000;
const DEFAULT_POLL_BACKOFF_INITIAL_MS = 60 * 1000;
const DEFAULT_POLL_BACKOFF_MAX_MS = 30 * 60 * 1000;
const MAC_DEFERRED_INSTALLER_TIMEOUT_MS = 10 * 60 * 1000;
const WINDOWS_DEFERRED_INSTALLER_TIMEOUT_MS = 10 * 60 * 1000;
const ARTIFACT_DOWNLOAD_MAX_ATTEMPTS = 3;
const DESKTOP_UPDATE_CHANNEL_VALUES = new Set<string>(Object.values(DESKTOP_UPDATE_CHANNELS));

export type DesktopUpdaterConfigInput = {
  appVersion?: string | null;
  arch?: string;
  currentVersion?: string | null;
  downloadRoot?: string | null;
  env?: NodeJS.ProcessEnv;
  installerObservationRoot?: string | null;
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
  metadataUrl: string;
  mode: DesktopUpdateMode;
  namespace?: string;
  openDryRun: boolean;
  platform: string;
  source: SidecarSource;
};

export type DesktopUpdaterDeps = {
  fetch?: typeof globalThis.fetch;
  launchInstallerAfterQuit?: (input: DeferredInstallerLaunchInput) => Promise<string>;
  logger?: DesktopUpdaterLogger;
  now?: () => Date;
  openPath?: (path: string) => Promise<string>;
  processPid?: number;
  spawnDetached?: SpawnInstallerHelper;
};

type DesktopUpdaterLogger = Pick<Console, "error" | "warn">;
type DetachedProcess = { unref(): void };
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
  | { metadataPath: string; ok: true; realRoot: string }
  | { error: DesktopUpdateErrorSnapshot; ok: false };

type ActionOptions = {
  autoDownload?: boolean;
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
  const namespace = normalizeOptionalNonEmpty(input.namespace);

  return {
    arch: env[DESKTOP_UPDATE_ENV.ARCH] ?? input.arch ?? process.arch,
    autoCheck: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_CHECK]) ?? enabled,
    autoDownload: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]) ?? true,
    autoOpen: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_OPEN]) ?? false,
    checkBackoffInitialMs: durationEnv(
      env[DESKTOP_UPDATE_ENV.CHECK_BACKOFF_INITIAL_MS],
      DEFAULT_POLL_BACKOFF_INITIAL_MS,
      DESKTOP_UPDATE_ENV.CHECK_BACKOFF_INITIAL_MS,
    ),
    checkBackoffMaxMs: durationEnv(
      env[DESKTOP_UPDATE_ENV.CHECK_BACKOFF_MAX_MS],
      DEFAULT_POLL_BACKOFF_MAX_MS,
      DESKTOP_UPDATE_ENV.CHECK_BACKOFF_MAX_MS,
    ),
    checkInitialDelayMs: durationEnv(
      env[DESKTOP_UPDATE_ENV.CHECK_INITIAL_DELAY_MS],
      DEFAULT_POLL_INITIAL_DELAY_MS,
      DESKTOP_UPDATE_ENV.CHECK_INITIAL_DELAY_MS,
    ),
    checkIntervalMs: durationEnv(
      env[DESKTOP_UPDATE_ENV.CHECK_INTERVAL_MS],
      defaultPollIntervalMs(channel),
      DESKTOP_UPDATE_ENV.CHECK_INTERVAL_MS,
    ),
    channel,
    currentVersion,
    downloadRoot,
    enabled,
    ...(installerObservationRoot == null ? {} : { installerObservationRoot }),
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

function capabilitiesFor(status: { mode: DesktopUpdateMode; platform: string; supported: boolean }) {
  const packageLauncher =
    status.mode === DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER &&
    isSupportedPackageLauncherPlatform(status.platform) &&
    status.supported;
  return {
    canApplyInPlace: false,
    canDownload: packageLauncher,
    canOpenInstaller: packageLauncher,
    requiresManualInstall: packageLauncher,
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
  if (ext === ".dmg" || ext === ".zip" || ext === ".exe" || ext === ".appimage") return ext;
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

function isAllowedRootEntry(name: string): boolean {
  return name === OWNERSHIP_SENTINEL ||
    name === STORE_METADATA_FILE ||
    name === DOWNLOADS_DIR ||
    name === RELEASES_DIR ||
    name === STAGING_DIR ||
    name === BACK_DIR ||
    name === HELPERS_DIR;
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
  if (value.dryRun != null && typeof value.dryRun !== "boolean") return false;
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
    const sentinelPath = join(realRoot, OWNERSHIP_SENTINEL);
    const metadataPath = join(realRoot, STORE_METADATA_FILE);
    const sentinel = await readJson<{ namespace?: string; version?: number }>(sentinelPath);
    if (sentinel != null) {
      if (sentinel.version !== UPDATE_ROOT_VERSION) {
        return {
          ok: false,
          error: createError("update-root-version-mismatch", `update root has unsupported ownership marker version at ${sentinelPath}`),
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
      await writeJson(sentinelPath, {
        createdAt: new Date().toISOString(),
        owner: "open-design-updater",
        source: config.source,
        version: UPDATE_ROOT_VERSION,
      });
    }

    const entries = await readdir(realRoot);
    const unexpected = entries.filter((entry) => !isAllowedRootEntry(entry));
    if (unexpected.length > 0) {
      const error = storeShapeError(realRoot, "update store contains unexpected root entries", { unexpected });
      logStoreError(logger, error);
      return { ok: false, error };
    }

    for (const dirName of [RELEASES_DIR, STAGING_DIR, DOWNLOADS_DIR, BACK_DIR, HELPERS_DIR]) {
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
      await access(metadataPath);
    } catch {
      const nonSentinelEntries = entries.filter((entry) => entry !== OWNERSHIP_SENTINEL);
      if (nonSentinelEntries.length > 0) {
        const error = storeShapeError(realRoot, "update store metadata.json is missing for a non-empty store", {
          entries: nonSentinelEntries,
        });
        logStoreError(logger, error);
        return { ok: false, error };
      }
      await writeJson(metadataPath, { version: STORE_METADATA_VERSION });
    }

    return { ok: true, metadataPath, realRoot };
  } catch (error) {
    return {
      ok: false,
      error: createError("update-root-unavailable", error instanceof Error ? error.message : String(error)),
    };
  }
}

type ParsedComparableVersion = {
  nums: [number, number, number];
  pre: string[];
};

function numberPart(value: string | undefined): number {
  return value != null && /^[0-9]+$/.test(value) ? Number(value) : 0;
}

function parseComparableVersion(value: string): ParsedComparableVersion {
  const cleaned = value.trim().replace(/^v/i, "").split("+", 1)[0] ?? "";
  const nightlyMatch = /^(\d+)\.(\d+)\.(\d+)\.nightly\.(\d+)$/i.exec(cleaned);
  if (nightlyMatch?.[1] != null && nightlyMatch[2] != null && nightlyMatch[3] != null && nightlyMatch[4] != null) {
    return {
      nums: [Number(nightlyMatch[1]), Number(nightlyMatch[2]), Number(nightlyMatch[3])],
      pre: ["nightly", nightlyMatch[4]],
    };
  }

  const prereleaseSeparator = cleaned.indexOf("-");
  const core = prereleaseSeparator === -1 ? cleaned : cleaned.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : cleaned.slice(prereleaseSeparator + 1);
  const nums = core.split(".");
  return {
    nums: [numberPart(nums[0]), numberPart(nums[1]), numberPart(nums[2])],
    pre: prerelease.length === 0 ? [] : prerelease.split("."),
  };
}

function hasCountedPrerelease(version: string): boolean {
  const parsed = parseComparableVersion(version);
  const last = parsed.pre.at(-1);
  return parsed.pre.length >= 2 && last != null && /^[0-9]+$/.test(last);
}

function defaultChannelForVersion(version: string): DesktopUpdateChannel {
  if (/(?:^|[-.])beta(?:[-.]|$)/i.test(version)) return DESKTOP_UPDATE_CHANNELS.BETA;
  if (/(?:^|[-.])preview(?:[-.]|$)/i.test(version)) return DESKTOP_UPDATE_CHANNELS.PREVIEW;
  if (/(?:^|[-.])nightly(?:[-.]|$)/i.test(version)) return DESKTOP_UPDATE_CHANNELS.NIGHTLY;
  return hasCountedPrerelease(version) ? DESKTOP_UPDATE_CHANNELS.BETA : DESKTOP_UPDATE_CHANNELS.STABLE;
}

function compareIdentifier(a: string, b: string): number {
  const aNum = /^[0-9]+$/.test(a) ? Number(a) : null;
  const bNum = /^[0-9]+$/.test(b) ? Number(b) : null;
  if (aNum != null && bNum != null) return Math.sign(aNum - bNum);
  if (aNum != null) return -1;
  if (bNum != null) return 1;
  return a.localeCompare(b);
}

export function compareVersions(a: string, b: string): number {
  const left = parseComparableVersion(a);
  const right = parseComparableVersion(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (left.nums[index] ?? 0) - (right.nums[index] ?? 0);
    if (delta !== 0) return Math.sign(delta);
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0;
  if (left.pre.length === 0) return 1;
  if (right.pre.length === 0) return -1;
  const max = Math.max(left.pre.length, right.pre.length);
  for (let index = 0; index < max; index += 1) {
    const l = left.pre[index];
    const r = right.pre[index];
    if (l == null) return -1;
    if (r == null) return 1;
    const delta = compareIdentifier(l, r);
    if (delta !== 0) return delta;
  }
  return 0;
}

function metadataChannel(metadata: Record<string, unknown>): DesktopUpdateChannel | null {
  const channel = stringField(metadata, "channel");
  return isDesktopUpdateChannel(channel) ? channel : null;
}

function releaseVersionForChannel(metadata: Record<string, unknown>, channel: DesktopUpdateChannel): string | null {
  if (channel === DESKTOP_UPDATE_CHANNELS.BETA) return stringField(metadata, "betaVersion");
  if (channel === DESKTOP_UPDATE_CHANNELS.NIGHTLY) return stringField(metadata, "nightlyVersion") ?? stringField(metadata, "releaseVersion");
  if (channel === DESKTOP_UPDATE_CHANNELS.PREVIEW) return stringField(metadata, "previewVersion") ?? stringField(metadata, "releaseVersion");
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

function selectedPackageLauncherArtifact(config: DesktopUpdaterConfig): {
  artifactKey: "dmg" | "installer";
  artifactType: "dmg" | "installer";
  description: string;
  platformKey: string;
} | null {
  if (config.platform === "darwin") {
    return {
      artifactKey: "dmg",
      artifactType: "dmg",
      description: "mac DMG",
      platformKey: selectedMacPlatformKey(config.arch),
    };
  }
  if (config.platform === "win32") {
    return {
      artifactKey: "installer",
      artifactType: "installer",
      description: "Windows installer",
      platformKey: selectedWinPlatformKey(config.arch),
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
  const artifactSelection = selectedPackageLauncherArtifact(config);
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

async function fetchJson(fetchImpl: typeof globalThis.fetch, url: string): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`metadata request returned HTTP ${response.status}`);
  const body = await response.json();
  if (!isRecord(body)) throw new Error("metadata response was not a JSON object");
  return body;
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
      { stdio: "ignore", windowsHide: true },
    );
    child.unref();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
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
  const spawnDetached: SpawnInstallerHelper = deps.spawnDetached ?? ((command, args, options) => spawn(command, args, options));
  const launchInstallerAfterQuit = deps.launchInstallerAfterQuit ?? ((input) => (
    config.platform === "win32"
      ? launchWindowsInstallerAfterQuit(input, { now, spawnDetached })
      : launchMacInstallerAfterQuit(input, { now, spawnDetached })
  ));
  const listeners = new Set<() => void>();
  let candidate: UpdateCandidate | null = null;
  let activeRelease: LoadedRelease | null = null;
  let incomingRelease: IncomingRef | null = null;
  let metadata: Record<string, unknown> | null = null;
  let lastCheckedAt: string | undefined;
  let installResult: DesktopUpdateStatusSnapshot["installResult"];
  let installFrozen = false;
  let progress: DesktopUpdateProgressSnapshot | undefined;
  let state: DesktopUpdateState = DESKTOP_UPDATE_STATES.IDLE;
  let error: DesktopUpdateErrorSnapshot | undefined;
  let operation: Promise<unknown> = Promise.resolve();

  function supported(): boolean {
    return config.enabled && config.mode === DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER && isSupportedPackageLauncherPlatform(config.platform);
  }

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setState(next: DesktopUpdateState, nextError?: DesktopUpdateErrorSnapshot): DesktopUpdateStatusSnapshot {
    state = next;
    error = nextError;
    const status = snapshot();
    emit();
    return status;
  }

  function snapshot(): DesktopUpdateStatusSnapshot {
    const statusSupported = supported();
    const active = activeRelease == null ? undefined : releaseSnapshot(activeRelease);
    const activeArtifact = activeRelease?.ref.artifact ?? (state === DESKTOP_UPDATE_STATES.AVAILABLE ? candidate?.artifact : undefined);
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
      capabilities: capabilitiesFor({ mode: config.mode, platform: config.platform, supported: statusSupported }),
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
    return setState(activeRelease == null ? DESKTOP_UPDATE_STATES.IDLE : DESKTOP_UPDATE_STATES.DOWNLOADED);
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
      const restored = await restoreStoreState();
      if (restored?.state === DESKTOP_UPDATE_STATES.ERROR) return restored;
      if (installFrozen || installResult != null) return snapshot();
    }
    const keepDownloadedVisible = activeRelease != null;
    if (!keepDownloadedVisible) setState(DESKTOP_UPDATE_STATES.CHECKING);
    try {
      const body = await fetchJson(fetchImpl, config.metadataUrl);
      lastCheckedAt = now().toISOString();
      metadata = body;
      const root = await writeMetadataPatch((current) => ({
        ...current,
        lastCheckedAt,
      }));
      if (root != null) scheduleBackCleanup(root.realRoot, logger);
      const selected = selectUpdateCandidate(body, config);
      if (!selected.ok) return setState(selected.state, selected.error);
      if (compareVersions(selected.candidate.version, config.currentVersion) <= 0) {
        candidate = null;
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
        candidate = selected.candidate;
        metadata = selected.candidate.metadata;
        return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
      }
      const openedForAdoption = await openStore();
      if (openedForAdoption.ok) {
        const adoptedRelease = await loadVerifiedReleaseForCandidate(openedForAdoption.root, selected.candidate);
        if (adoptedRelease != null) {
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
      const available = activeRelease == null
        ? setState(DESKTOP_UPDATE_STATES.AVAILABLE)
        : setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
      if (options.autoDownload ?? config.autoDownload) return await downloadUpdate();
      return available;
    } catch (checkError) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
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
      return setState(DESKTOP_UPDATE_STATES.ERROR, nextError);
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
      progress = undefined;
      activeRelease = { path: join(opened.root.realRoot, releaseRef.artifactPath), ref: releaseRef };
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
      const downloaded = setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
      if (config.autoOpen) return await installUpdate();
      return downloaded;
    } catch (downloadError) {
      if (stagingDir != null) await rm(stagingDir, { force: true, recursive: true }).catch(() => undefined);
      incomingRelease = null;
      progress = undefined;
      await writeMetadataPatch((current) => ({ ...current, incoming: undefined }));
      return setState(DESKTOP_UPDATE_STATES.ERROR, desktopDownloadError(downloadError));
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

  async function installUpdate(): Promise<DesktopUpdateStatusSnapshot> {
    const unsupported = unsupportedStatus();
    if (unsupported != null) return unsupported;
    if (installResult != null) {
      installFrozen = true;
      return snapshot();
    }
    if (activeRelease == null) {
      const restored = await restoreStoreState();
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
        const restored = await restoreStoreState();
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
  },
): DesktopUpdaterScheduler {
  const logger = options.logger ?? console;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failureCount = 0;
  let tickRunning = false;
  let unsubscribe: (() => void) | null = null;

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

  const nextDelay = (status: DesktopUpdateStatusSnapshot | null): number => {
    if (status != null && status.state !== DESKTOP_UPDATE_STATES.ERROR) {
      failureCount = 0;
      return options.intervalMs;
    }
    failureCount += 1;
    const backoff = options.backoffInitialMs * 2 ** Math.max(0, failureCount - 1);
    return Math.min(options.backoffMaxMs, backoff);
  };

  const schedule = (delayMs: number) => {
    if (!running || timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, delayMs);
    timer.unref?.();
  };

  const tick = async () => {
    if (!running || tickRunning) return;
    tickRunning = true;
    let status: DesktopUpdateStatusSnapshot | null = null;
    try {
      status = await updater.checkForUpdates();
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
