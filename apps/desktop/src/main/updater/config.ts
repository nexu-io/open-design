import { isAbsolute, join, resolve } from "node:path";

import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_MODES,
  SIDECAR_SOURCES,
  type DesktopUpdateChannel,
  type DesktopUpdateMode,
  type SidecarSource,
} from "@open-design/sidecar-proto";
import { isReleaseChannel, releaseChannelFromVersion } from "@open-design/release";

/**
 * @module updater-config
 *
 * Env-driven configuration resolution for the desktop updater plus the
 * capability derivation shared with snapshot construction. Pure input→value
 * logic only: no filesystem access, no updater state.
 */

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
  INSTALLED_VERSION: "OD_UPDATE_INSTALLED_VERSION",
  METADATA_URL: "OD_UPDATE_METADATA_URL",
  MODE: "OD_UPDATE_MODE",
  OPEN_DRY_RUN: "OD_UPDATE_OPEN_DRY_RUN",
  PLATFORM: "OD_UPDATE_PLATFORM",
} as const);

const DEFAULT_RELEASE_ORIGIN = "https://releases.open-design.ai";
const BETA_POLL_INTERVAL_MS = 15 * 60 * 1000;
const STABLE_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_POLL_INITIAL_DELAY_MS = 5000;
const DEFAULT_POLL_BACKOFF_INITIAL_MS = 60 * 1000;
const DEFAULT_POLL_BACKOFF_MAX_MS = 30 * 60 * 1000;

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
  installedVersionOverride?: string;
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
  runtimeBase: string;
  source: SidecarSource;
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

export function isDesktopUpdateChannel(value: unknown): value is DesktopUpdateChannel {
  return isReleaseChannel(value);
}

function defaultMetadataUrl(channel: DesktopUpdateChannel): string {
  return `${DEFAULT_RELEASE_ORIGIN}/${channel}/latest/metadata.json`;
}

export function normalizeDownloadRoot(value: string): string {
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

export function defaultChannelForVersion(version: string): DesktopUpdateChannel {
  const channel = releaseChannelFromVersion(version);
  return channel ?? DESKTOP_UPDATE_CHANNELS.STABLE;
}

export function resolveDesktopUpdaterConfig(input: DesktopUpdaterConfigInput): DesktopUpdaterConfig {
  const env = input.env ?? process.env;
  const mode = normalizeMode(env[DESKTOP_UPDATE_ENV.MODE], input.mode ?? DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER);
  const defaultEnabled = input.source === SIDECAR_SOURCES.PACKAGED;
  const enabled = isTruthyEnv(env[DESKTOP_UPDATE_ENV.ENABLED]) ?? defaultEnabled;
  const runtimeBase = resolve(input.runtimeBase == null ? process.cwd() : input.runtimeBase);
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
  const installedVersionOverride = normalizeOptionalNonEmpty(env[DESKTOP_UPDATE_ENV.INSTALLED_VERSION]);
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
    ...(installedVersionOverride == null ? {} : { installedVersionOverride }),
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
    runtimeBase,
    source: input.source,
  };
}

export function isSupportedPackageLauncherPlatform(platform: string): boolean {
  return platform === "darwin" || platform === "win32";
}

export function capabilitiesFor(status: { artifactType?: string; mode: DesktopUpdateMode; platform: string; supported: boolean }) {
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
