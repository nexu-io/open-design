import { RELEASE_CHANNELS, type ReleaseChannel } from "@open-design/release";
import { assertObject, assertKnownKeys } from "./validation.js";

/**
 * @module desktop-update
 *
 * The desktop auto-update protocol: action/mode/channel/state constants, the
 * update status/release/incoming snapshot shapes, and the update-request
 * normalizer.
 */

export const DESKTOP_UPDATE_ACTIONS = Object.freeze({
  CHECK: "check",
  DOWNLOAD: "download",
  INSTALL: "install",
  STATUS: "status",
} as const);

export type DesktopUpdateAction = (typeof DESKTOP_UPDATE_ACTIONS)[keyof typeof DESKTOP_UPDATE_ACTIONS];

export const DESKTOP_UPDATE_MODES = Object.freeze({
  JS_INCREMENTAL: "js-incremental",
  PACKAGE_LAUNCHER: "package-launcher",
} as const);

export type DesktopUpdateMode = (typeof DESKTOP_UPDATE_MODES)[keyof typeof DESKTOP_UPDATE_MODES];

export const DESKTOP_UPDATE_CHANNELS = Object.freeze({
  BETA: RELEASE_CHANNELS.BETA,
  BETAS: RELEASE_CHANNELS.BETAS,
  PRERELEASE: RELEASE_CHANNELS.PRERELEASE,
  PREVIEW: RELEASE_CHANNELS.PREVIEW,
  STABLE: RELEASE_CHANNELS.STABLE,
} as const);

export type DesktopUpdateChannel = ReleaseChannel;

export const DESKTOP_UPDATE_STATES = Object.freeze({
  AVAILABLE: "available",
  CHECKING: "checking",
  DOWNLOADED: "downloaded",
  DOWNLOADING: "downloading",
  ERROR: "error",
  IDLE: "idle",
  INSTALLING: "installing",
  NOT_AVAILABLE: "not-available",
  UNSUPPORTED: "unsupported",
} as const);

export type DesktopUpdateState = (typeof DESKTOP_UPDATE_STATES)[keyof typeof DESKTOP_UPDATE_STATES];

export type DesktopUpdateCapabilitySet = {
  canApplyInPlace: boolean;
  canDownload: boolean;
  canOpenInstaller: boolean;
  requiresManualInstall: boolean;
};

export type DesktopUpdatePathSnapshot = {
  downloadRoot?: string;
  manifestPath?: string;
};

export type DesktopUpdateChecksumSnapshot = {
  algorithm: "sha256" | "sha512";
  url?: string;
  value?: string;
};

export type DesktopUpdateArtifactSnapshot = {
  name?: string;
  platformKey?: string;
  size?: number;
  type?: string;
  url: string;
};

export type DesktopUpdateProgressSnapshot = {
  receivedBytes: number;
  totalBytes?: number;
};

export type DesktopUpdateErrorSnapshot = {
  code: string;
  details?: unknown;
  message: string;
};

export type DesktopUpdateInstallResult = {
  activeVersion?: string;
  artifactPath?: string;
  dryRun?: boolean;
  helperLogPath?: string;
  launcherRuntimePath?: string;
  launchPath?: string;
  openedAt: string;
  path: string;
};

export type DesktopUpdateReleaseSnapshot = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  checksum: DesktopUpdateChecksumSnapshot;
  channel: DesktopUpdateChannel;
  downloadedAt: string;
  key: string;
  metadata?: Record<string, unknown>;
  path: string;
  platformKey: string;
  version: string;
};

export type DesktopUpdateIncomingSnapshot = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  channel: DesktopUpdateChannel;
  key?: string;
  metadata?: Record<string, unknown>;
  progress?: DesktopUpdateProgressSnapshot;
  startedAt: string;
  version: string;
};

export type DesktopUpdateCacheLifecycleTrigger = "cold-start" | "next-version-ready";

export type DesktopUpdateReleaseLifecycleState =
  | "cleanup-deferred"
  | "cleanup-removed"
  | "deprecated"
  | "retained"
  | "unknown";

export type DesktopUpdateCacheLifecycleSummary = {
  lastRunAt?: string;
  lastTrigger?: DesktopUpdateCacheLifecycleTrigger;
  platform: string;
  releases: {
    cleanupDeferred: number;
    cleanupRemoved: number;
    deprecated: number;
    errors: number;
    retained: number;
    total: number;
    unknown: number;
  };
};

export type DesktopUpdateCacheSnapshot = {
  lifecycle?: DesktopUpdateCacheLifecycleSummary;
};

export type DesktopUpdateStatusSnapshot = {
  active?: DesktopUpdateReleaseSnapshot;
  arch: string;
  artifact?: DesktopUpdateArtifactSnapshot;
  artifactUrl?: string;
  availableVersion?: string;
  cache?: DesktopUpdateCacheSnapshot;
  capabilities: DesktopUpdateCapabilitySet;
  channel: DesktopUpdateChannel;
  checksum?: DesktopUpdateChecksumSnapshot;
  currentVersion: string;
  downloadPath?: string;
  enabled: boolean;
  error?: DesktopUpdateErrorSnapshot;
  incoming?: DesktopUpdateIncomingSnapshot;
  installResult?: DesktopUpdateInstallResult;
  lastCheckedAt?: string;
  metadata?: Record<string, unknown>;
  mode: DesktopUpdateMode;
  paths?: DesktopUpdatePathSnapshot;
  platform: string;
  progress?: DesktopUpdateProgressSnapshot;
  state: DesktopUpdateState;
  supported: boolean;
};

export type DesktopUpdateInput = {
  action: DesktopUpdateAction;
};

export type DesktopUpdateResult = DesktopUpdateStatusSnapshot;

/** @internal Type guard for a supported desktop update action. */
function isDesktopUpdateAction(value: unknown): value is DesktopUpdateAction {
  return Object.values(DESKTOP_UPDATE_ACTIONS).includes(value as DesktopUpdateAction);
}

/** @internal Validate a desktop update request payload. */
export function normalizeDesktopUpdateInput(input: unknown): DesktopUpdateInput {
  const value = assertObject(input, "desktop update input");
  assertKnownKeys(value, ["action"], "desktop update input");
  if (!isDesktopUpdateAction(value.action)) {
    throw new Error(`unsupported desktop update action: ${String(value.action)}`);
  }
  return { action: value.action };
}
