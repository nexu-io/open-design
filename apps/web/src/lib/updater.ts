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
  | { activeRunCount: number; state: 'blocked' }
  | { activeRunCount: null; state: 'unknown' };

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
  const availableVersion = status?.availableVersion ?? null;
  const currentVersion = status?.currentVersion ?? null;
  const downloadProgress = downloadProgressFromStatus(status);
  const upToDate = state === OPEN_DESIGN_HOST_UPDATER_STATES.NOT_AVAILABLE;
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
    shouldShowControl: canInstallUpdate && hasDownloadedInstaller && !installerOpened,
    shouldPrompt: canInstallUpdate && hasDownloadedInstaller && !installerOpened,
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
  if (code !== 'active-runs-blocked' && code !== 'active-runs-unknown') return null;
  const details = status?.error?.details;
  const activeRunCount =
    typeof details === 'object' && details != null && 'activeRunCount' in details
      ? (details as { activeRunCount?: unknown }).activeRunCount
      : null;
  if (code === 'active-runs-blocked' && typeof activeRunCount === 'number' && activeRunCount > 0) {
    return { activeRunCount, state: 'blocked' };
  }
  return { activeRunCount: null, state: 'unknown' };
}

export function restartSafetyFromActionResult(result: OpenDesignHostActionResult): UpdaterRestartSafety | null {
  if (result.ok || (result.reason !== 'active-runs-blocked' && result.reason !== 'active-runs-unknown')) {
    return null;
  }
  const details = result.details;
  const activeRunCount =
    typeof details === 'object' && details != null && 'activeRunCount' in details
      ? (details as { activeRunCount?: unknown }).activeRunCount
      : null;
  if (result.reason === 'active-runs-blocked' && typeof activeRunCount === 'number' && activeRunCount > 0) {
    return { activeRunCount, state: 'blocked' };
  }
  return { activeRunCount: null, state: 'unknown' };
}
