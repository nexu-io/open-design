export { packWin } from "./build.js";
export { validateWinLauncherPayloadArchive } from "./payload.js";
export {
  cleanupPackedWinNamespace,
  diagnosePackedWinIpc,
  installPackedWinApp,
  inspectPackedWinApp,
  listPackedWinNamespaces,
  readPackedWinLogs,
  resetPackedWinNamespaces,
  startPackedWinApp,
  stopPackedWinApp,
  uninstallPackedWinApp,
  waitForHealthyPackedWinApp,
} from "./lifecycle.js";
export type {
  WinCleanupResult,
  WinIpcDiagnoseResult,
  WinInspectResult,
  WinInstallResult,
  WinListResult,
  WinPackResult,
  WinPackTiming,
  WinRemovalTarget,
  WinResetResult,
  WinResidueObservation,
  WinSizeReport,
  WinStartResult,
  WinStopResult,
  WinUninstallResult,
  WinWaitResult,
} from "./types.js";
