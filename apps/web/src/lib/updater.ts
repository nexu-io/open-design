import {
  applyElectronUpdater,
  checkElectronUpdater,
  downloadElectronUpdater,
  getElectronUpdaterStatus,
  isOpenDesignElectronAvailable,
  setElectronUpdaterMenuLabels,
  subscribeElectronUpdater,
  subscribeElectronUpdaterOpenDialog,
  type OpenDesignElectronActionResult,
  type OpenDesignElectronFailure,
  type OpenDesignElectronUpdaterLineSnapshot,
  type OpenDesignElectronUpdaterMenuLabels,
  type OpenDesignElectronUpdaterOpenDialogListener,
  type OpenDesignElectronUpdaterResult,
  type OpenDesignElectronUpdaterStatusListener,
  type OpenDesignElectronUpdaterStatusSnapshot,
  type OpenDesignElectronUpdaterTarget,
} from '@open-design/electron-contract';

export type UpdaterEnvironment = 'desktop' | 'web';
export type UpdaterActionContext = { payload?: Record<string, unknown> };
export type UpdaterDownloadProgress = { percent: number | null; receivedBytes: number; totalBytes: number | null };
export type UpdaterActionResult =
  | { ok: true; model: UpdaterModel; status: OpenDesignElectronUpdaterStatusSnapshot }
  | OpenDesignElectronFailure;
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
  currentVersion: string | null;
  downloadProgress: UpdaterDownloadProgress | null;
  enabled: boolean;
  environment: UpdaterEnvironment;
  errorMessage: string | null;
  hasDownloadedInstaller: boolean;
  promptKey: string | null;
  requiresManualInstall: boolean;
  shouldPrompt: boolean;
  shouldShowControl: boolean;
  state: OpenDesignElectronUpdaterLineSnapshot['state'] | null;
  status: OpenDesignElectronUpdaterStatusSnapshot | null;
  supported: boolean;
  target: OpenDesignElectronUpdaterTarget | null;
  updateKind: 'installer' | 'payload' | 'unknown';
  upToDate: boolean;
};

function activeLine(status: OpenDesignElectronUpdaterStatusSnapshot | null): OpenDesignElectronUpdaterLineSnapshot | null {
  if (status == null) return null;
  const lines = [status.lines.shell, status.lines.closure];
  return lines.find((line) => line.state === 'ready' || line.state === 'blocked')
    ?? lines.find((line) => ['available', 'downloading', 'applying', 'checking', 'error'].includes(line.state))
    ?? status.lines.shell;
}

function modelFromElectronResult(result: OpenDesignElectronUpdaterResult): UpdaterActionResult {
  return result.ok
    ? { ok: true, model: deriveUpdaterModel(result.status, { hostAvailable: true }), status: result.status }
    : result;
}

function progress(line: OpenDesignElectronUpdaterLineSnapshot | null): UpdaterDownloadProgress | null {
  if (line?.state !== 'downloading' || line.progress == null) return null;
  const receivedBytes = Math.max(0, line.progress.receivedBytes);
  const totalBytes = typeof line.progress.totalBytes === 'number' && line.progress.totalBytes > 0 ? line.progress.totalBytes : null;
  return { receivedBytes, totalBytes, percent: totalBytes == null ? null : Math.max(0, Math.min(100, Math.round(receivedBytes / totalBytes * 100))) };
}

export function deriveUpdaterModel(status: OpenDesignElectronUpdaterStatusSnapshot | null, options: { hostAvailable?: boolean } = {}): UpdaterModel {
  const hostAvailable = options.hostAvailable ?? isOpenDesignElectronAvailable();
  const line = activeLine(status);
  const target = line?.target ?? null;
  const busy = line != null && ['checking', 'downloading', 'applying'].includes(line.state);
  const ready = line?.state === 'ready';
  const canApply = Boolean(hostAvailable && line?.actions.includes('apply'));
  const candidateVersion = line?.candidateVersion ?? null;
  return {
    availableVersion: candidateVersion,
    busy,
    canApplyInPlace: canApply && target === 'closure',
    canCheck: Boolean(hostAvailable && !busy && line?.actions.includes('check')),
    canDownload: Boolean(hostAvailable && !busy && line?.actions.includes('download')),
    canOpenInstaller: canApply && target === 'shell',
    currentVersion: line?.currentVersion ?? null,
    downloadProgress: progress(line),
    enabled: line != null,
    environment: hostAvailable ? 'desktop' : 'web',
    errorMessage: line?.error?.message ?? null,
    hasDownloadedInstaller: ready,
    promptKey: candidateVersion == null || target == null ? null : `${status?.channel}:${target}:${line?.revision}:${candidateVersion}`,
    requiresManualInstall: false,
    shouldPrompt: canApply && ready,
    shouldShowControl: canApply && ready,
    state: line?.state ?? null,
    status,
    supported: line != null && line.state !== 'unsupported',
    target,
    updateKind: target === 'closure' ? 'payload' : target === 'shell' ? 'installer' : 'unknown',
    upToDate: line?.state === 'current',
  };
}

export async function readUpdaterStatus(_context?: UpdaterActionContext): Promise<UpdaterActionResult> {
  return modelFromElectronResult(await getElectronUpdaterStatus());
}
export async function checkForUpdaterUpdate(_context?: UpdaterActionContext): Promise<UpdaterActionResult> {
  return modelFromElectronResult(await checkElectronUpdater());
}

async function actionableTarget(action: 'apply' | 'download'): Promise<OpenDesignElectronUpdaterTarget> {
  const result = await getElectronUpdaterStatus();
  if (!result.ok) throw new Error(result.reason);
  const line = [result.status.lines.shell, result.status.lines.closure].find((candidate) => candidate.actions.includes(action));
  if (line == null) throw new Error(`No updater line can ${action}`);
  return line.target;
}

export async function downloadUpdaterUpdate(_context?: UpdaterActionContext): Promise<UpdaterActionResult> {
  return modelFromElectronResult(await downloadElectronUpdater(await actionableTarget('download')));
}
export async function openUpdaterInstaller(context?: UpdaterActionContext): Promise<UpdaterActionResult> {
  return modelFromElectronResult(await applyElectronUpdater(await actionableTarget('apply'), { force: context?.payload?.force === true }));
}
export function subscribeToUpdaterStatus(listener: OpenDesignElectronUpdaterStatusListener): () => void {
  return subscribeElectronUpdater(listener);
}
export function subscribeToUpdaterOpenDialog(listener: OpenDesignElectronUpdaterOpenDialogListener): () => void {
  return subscribeElectronUpdaterOpenDialog(listener);
}
export async function syncUpdaterMenuLabels(labels: OpenDesignElectronUpdaterMenuLabels): Promise<OpenDesignElectronActionResult> {
  return await setElectronUpdaterMenuLabels(labels);
}
export function restartSafetyFromUpdaterStatus(status: OpenDesignElectronUpdaterStatusSnapshot | null): UpdaterRestartSafety | null {
  const line = activeLine(status);
  if (line?.state !== 'blocked') return null;
  return line.blockedBy > 0 ? { activeRunCount: line.blockedBy, state: 'blocked' } : { activeRunCount: null, state: 'unknown' };
}
