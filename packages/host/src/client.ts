/**
 * Renderer-facing client helpers for the injected Open Design host bridge.
 * The wire contract itself is available from `@open-design/host/protocol`.
 */
export {
  detectOpenDesignHostClientType,
  getOpenDesignHost,
  isOpenDesignHostAvailable,
  isOpenDesignHostBridge,
} from "./detection.js";
export {
  normalizeOpenDesignHostPickWorkingDirResult,
  normalizeOpenDesignHostProjectImportResult,
  normalizeOpenDesignHostProjectReplaceWorkingDirResult,
} from "./normalize.js";
export {
  captureHostPage,
  checkHostUpdater,
  clearHostBrowserData,
  clearHostUpdaterCache,
  downloadHostUpdater,
  getHostUpdaterStatus,
  installHostUpdater,
  openHostExternalUrl,
  openHostProjectPath,
  pickAndImportHostProject,
  pickAndReplaceHostProjectWorkingDir,
  pickHostWorkingDir,
  printHostPdf,
  quitHostAfterUpdaterInstallerOpen,
  setHostPetVisible,
  setHostUpdaterMenuLabels,
  subscribeHostUpdater,
  subscribeHostUpdaterOpenDialog,
} from "./actions.js";
