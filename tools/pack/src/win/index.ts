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
} from "./types.js";
