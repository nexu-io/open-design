import {
  OPEN_DESIGN_HOST_UPDATER_STATES,
  checkHostUpdater,
  clearHostUpdaterCache,
  downloadHostUpdater,
  getHostUpdaterStatus,
  installHostUpdater,
  isOpenDesignHostAvailable,
  quitHostAfterUpdaterInstallerOpen,
  setHostUpdaterMenuLabels,
  subscribeHostUpdater,
  subscribeHostUpdaterOpenDialog,
  type OpenDesignHostActionResult,
  type OpenDesignHostFailure,
  type OpenDesignHostUpdaterActionOptions,
  type OpenDesignHostUpdaterMenuLabels,
  type OpenDesignHostUpdaterOpenDialogListener,
  type OpenDesignHostUpdaterReinstallSnapshot,
  type OpenDesignHostUpdaterResult,
  type OpenDesignHostUpdaterStatusListener,
  type OpenDesignHostUpdaterStatusSnapshot,
} from '@open-design/host';

export type UpdaterEnvironment = 'desktop' | 'web';

export type UpdaterDownloadProgress = {
  percent: number | null;
  receivedBytes: number;
  totalBytes: number | null;
};

export type UpdaterActionResult =
  | { ok: true; model: UpdaterModel; status: OpenDesignHostUpdaterStatusSnapshot }
  | OpenDesignHostFailure;

export type UpdaterRestartSafety =
  | { message: string | null; occupantCount: number; occupants: readonly string[]; state: 'blocked' }
  | { message: string | null; occupantCount: null; state: 'unknown' };

export type UpdaterModel = {
  availableVersion: string | null;
  busy: boolean;
  canApplyInPlace: boolean;
  canCheck: boolean;
  canDownload: boolean;
  canOpenInstaller: boolean;
  canQuitAfterInstallerOpen: boolean;
  currentVersion: string | null;
  downloadProgress: UpdaterDownloadProgress | null;
  enabled: boolean;
  environment: UpdaterEnvironment;
  errorMessage: string | null;
  hasDownloadedInstaller: boolean;
  installerOpened: boolean;
  updateKind: 'installer' | 'payload' | 'unknown';
  promptKey: string | null;
  /**
   * Present when the feed requires a full installer reinstall (broken or
   * outdated installed outer package). UI copy priority: `reinstall.url`
   * jump link > default i18n reinstall copy.
   */
  reinstall: OpenDesignHostUpdaterReinstallSnapshot | null;
  requiresManualInstall: boolean;
  upToDate: boolean;
  shouldShowControl: boolean;
  shouldPrompt: boolean;
  standaloneReady: boolean;
  status: OpenDesignHostUpdaterStatusSnapshot | null;
  supported: boolean;
};

function modelFromHostResult(result: OpenDesignHostUpdaterResult): UpdaterActionResult {
  if (!result.ok) return result;
  return {
    ok: true,
    model: deriveUpdaterModel(result.status, { hostAvailable: true }),
    status: result.status,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function downloadProgressFromStatus(
  status: OpenDesignHostUpdaterStatusSnapshot | null,
): UpdaterDownloadProgress | null {
  if (status == null) return null;
  if (status.state !== OPEN_DESIGN_HOST_UPDATER_STATES.DOWNLOADING) return null;
  const sourceProgress = status.incoming?.progress ?? status.progress;

  const receivedBytes = Math.max(0, sourceProgress?.receivedBytes ?? 0);
  const totalBytes =
    typeof sourceProgress?.totalBytes === 'number' && sourceProgress.totalBytes > 0
      ? sourceProgress.totalBytes
      : null;
  const percent = totalBytes == null ? null : clampPercent((receivedBytes / totalBytes) * 100);
  return {
    percent,
    receivedBytes,
    totalBytes,
  };
}

export function deriveUpdaterModel(
  status: OpenDesignHostUpdaterStatusSnapshot | null,
  options: { hostAvailable?: boolean } = {},
): UpdaterModel {
  const hostAvailable = options.hostAvailable ?? isOpenDesignHostAvailable();
  const environment: UpdaterEnvironment = hostAvailable ? 'desktop' : 'web';
  const state = status?.state;
  const busy =
    state === OPEN_DESIGN_HOST_UPDATER_STATES.CHECKING ||
    state === OPEN_DESIGN_HOST_UPDATER_STATES.DOWNLOADING ||
    state === OPEN_DESIGN_HOST_UPDATER_STATES.INSTALLING;
  const canOpenInstaller = Boolean(
    hostAvailable &&
    status?.enabled &&
    status.supported &&
    status.capabilities.canOpenInstaller,
  );
  const canApplyInPlace = Boolean(
    hostAvailable &&
    status?.enabled &&
    status.supported &&
    status.capabilities.canApplyInPlace,
  );
  const canInstallUpdate = canOpenInstaller || canApplyInPlace;
  const hasDownloadedInstaller = Boolean(
    state === OPEN_DESIGN_HOST_UPDATER_STATES.DOWNLOADED &&
    status?.downloadPath,
  );
  const installerOpened = status?.installResult != null;
  const artifactType = status?.artifact?.type ?? status?.incoming?.artifact?.type;
  const updateKind = artifactType === 'payload' ? 'payload' : artifactType === 'dmg' || artifactType === 'installer' ? 'installer' : 'unknown';
  const standaloneReady = status?.standalone?.state === 'prepared';
  const availableVersion = status?.standalone?.releaseVersion ?? status?.availableVersion ?? null;
  const currentVersion = status?.currentVersion ?? null;
  const downloadProgress = downloadProgressFromStatus(status);
  const upToDate = state === OPEN_DESIGN_HOST_UPDATER_STATES.NOT_AVAILABLE && !standaloneReady;
  const promptKey =
    status == null || availableVersion == null
      ? null
      : [
          status.channel,
          currentVersion ?? 'unknown-current',
          availableVersion,
          status.downloadPath ?? status.artifactUrl ?? status.artifact?.url ?? 'unknown-artifact',
        ].join(':');
  const canQuitAfterInstallerOpen = hostAvailable && installerOpened;

  return {
    availableVersion,
    busy,
    canApplyInPlace,
    canCheck: hostAvailable && Boolean(status?.enabled) && !busy,
    canDownload: hostAvailable && Boolean(status?.enabled && status.capabilities.canDownload) && !busy,
    canOpenInstaller,
    canQuitAfterInstallerOpen,
    currentVersion,
    downloadProgress,
    enabled: Boolean(status?.enabled),
    environment,
    errorMessage: status?.error?.message ?? null,
    hasDownloadedInstaller,
    installerOpened,
    updateKind,
    promptKey,
    reinstall: status?.reinstall ?? null,
    requiresManualInstall: Boolean(status?.capabilities.requiresManualInstall),
    upToDate,
    shouldShowControl: standaloneReady || (canInstallUpdate && hasDownloadedInstaller && !installerOpened),
    shouldPrompt: standaloneReady || (canInstallUpdate && hasDownloadedInstaller && !installerOpened),
    standaloneReady,
    status,
    supported: Boolean(status?.supported),
  };
}

export async function readUpdaterStatus(options?: OpenDesignHostUpdaterActionOptions): Promise<UpdaterActionResult> {
  return modelFromHostResult(await getHostUpdaterStatus(options));
}

export async function checkForUpdaterUpdate(options?: OpenDesignHostUpdaterActionOptions): Promise<UpdaterActionResult> {
  return modelFromHostResult(await checkHostUpdater(options));
}

export async function downloadUpdaterUpdate(options?: OpenDesignHostUpdaterActionOptions): Promise<UpdaterActionResult> {
  return modelFromHostResult(await downloadHostUpdater(options));
}

export async function openUpdaterInstaller(options?: OpenDesignHostUpdaterActionOptions): Promise<UpdaterActionResult> {
  return modelFromHostResult(await installHostUpdater(options));
}

export async function clearUpdaterCache(options?: OpenDesignHostUpdaterActionOptions): Promise<UpdaterActionResult> {
  return modelFromHostResult(await clearHostUpdaterCache(options));
}

export async function quitAfterUpdaterInstallerOpen(
  options?: OpenDesignHostUpdaterActionOptions,
): Promise<OpenDesignHostActionResult> {
  return await quitHostAfterUpdaterInstallerOpen(options);
}

export function subscribeToUpdaterStatus(listener: OpenDesignHostUpdaterStatusListener): () => void {
  return subscribeHostUpdater(listener);
}

export function subscribeToUpdaterOpenDialog(listener: OpenDesignHostUpdaterOpenDialogListener): () => void {
  return subscribeHostUpdaterOpenDialog(listener);
}

export async function syncUpdaterMenuLabels(
  labels: OpenDesignHostUpdaterMenuLabels,
): Promise<OpenDesignHostActionResult> {
  return await setHostUpdaterMenuLabels(labels);
}

export function restartSafetyFromUpdaterStatus(
  status: OpenDesignHostUpdaterStatusSnapshot | null,
): UpdaterRestartSafety | null {
  const code = status?.error?.code;
  if (code !== 'standalone-lifecycle-occupied' && code !== 'standalone-lifecycle-unavailable') return null;
  const details = status?.error?.details;
  const occupantCount =
    typeof details === 'object' && details != null && 'occupantCount' in details
      ? (details as { occupantCount?: unknown }).occupantCount
      : null;
  if (code === 'standalone-lifecycle-occupied' && typeof occupantCount === 'number' && occupantCount > 0) {
    const occupants = typeof details === 'object' && details != null && 'occupants' in details
      && Array.isArray((details as { occupants?: unknown }).occupants)
      ? (details as { occupants: unknown[] }).occupants.flatMap((entry) => (
          typeof entry === 'object' && entry != null && 'key' in entry && typeof entry.key === 'string'
            ? [entry.key]
            : []
        ))
      : [];
    return { message: status?.error?.message ?? null, occupantCount, occupants, state: 'blocked' };
  }
  return { message: status?.error?.message ?? null, occupantCount: null, state: 'unknown' };
}

export function restartSafetyFromActionResult(result: OpenDesignHostActionResult): UpdaterRestartSafety | null {
  if (
    result.ok
    || (result.reason !== 'standalone-lifecycle-occupied' && result.reason !== 'standalone-lifecycle-unavailable')
  ) {
    return null;
  }
  const details = result.details;
  const occupantCount =
    typeof details === 'object' && details != null && 'occupantCount' in details
      ? (details as { occupantCount?: unknown }).occupantCount
      : null;
  if (result.reason === 'standalone-lifecycle-occupied' && typeof occupantCount === 'number' && occupantCount > 0) {
    const occupants = typeof details === 'object' && details != null && 'occupants' in details
      && Array.isArray((details as { occupants?: unknown }).occupants)
      ? (details as { occupants: unknown[] }).occupants.flatMap((entry) => (
          typeof entry === 'object' && entry != null && 'key' in entry && typeof entry.key === 'string'
            ? [entry.key]
            : []
        ))
      : [];
    const message = typeof details === 'object' && details != null && 'message' in details
      && typeof details.message === 'string' ? details.message : null;
    return { message, occupantCount, occupants, state: 'blocked' };
  }
  const message = typeof details === 'object' && details != null && 'message' in details
    && typeof details.message === 'string' ? details.message : null;
  return { message, occupantCount: null, state: 'unknown' };
}
