/**
 * @module electron-contract
 *
 * Public barrel for the browser-safe OpenDesign Electron capability contract.
 * Consumers use declarations and accessors; the physical contextBridge slot is
 * intentionally absent from this surface.
 */

// --- protocol: constant registries + wire types ---
export {
  OPEN_DESIGN_ELECTRON_CONTRACT_VERSION,
  OPEN_DESIGN_ELECTRON_APPEARANCE_THEMES,
  OPEN_DESIGN_ELECTRON_CLIENT_TYPES,
  OPEN_DESIGN_ELECTRON_UPDATER_ACTIONS,
  OPEN_DESIGN_ELECTRON_UPDATER_STATES,
} from "./protocol.js";
export type {
  OpenDesignElectronClientType,
  OpenDesignElectronClient,
  OpenDesignElectronFailure,
  OpenDesignElectronActionResult,
  OpenDesignElectronDiagnosticsExportResult,
  OpenDesignElectronWorkspaceContext,
  OpenDesignElectronProjectImportInit,
  OpenDesignElectronProjectImportSuccess,
  OpenDesignElectronProjectImportResult,
  OpenDesignElectronProjectReplaceWorkingDirSuccess,
  OpenDesignElectronProjectReplaceWorkingDirResult,
  OpenDesignElectronPickWorkingDirSuccess,
  OpenDesignElectronPickWorkingDirResult,
  OpenDesignElectronPdfPrintOptions,
  OpenDesignElectronCaptureClip,
  OpenDesignElectronCaptureOptions,
  OpenDesignElectronCaptureSuccess,
  OpenDesignElectronCaptureResult,
  OpenDesignElectronPreviewNavigationFailure,
  OpenDesignElectronPreviewNavigationFailureListener,
  OpenDesignElectronAppearanceTheme,
  OpenDesignElectronBrowserClearDataOptions,
  OpenDesignElectronUpdaterAction,
  OpenDesignElectronUpdaterState,
  OpenDesignElectronUpdaterTarget,
  OpenDesignElectronUpdaterApplyOptions,
  OpenDesignElectronUpdaterProgressSnapshot,
  OpenDesignElectronUpdaterErrorSnapshot,
  OpenDesignElectronUpdaterLineSnapshot,
  OpenDesignElectronUpdaterStatusSnapshot,
  OpenDesignElectronUpdaterResult,
  OpenDesignElectronUpdaterStatusListener,
  OpenDesignElectronUpdaterMenuLabels,
  OpenDesignElectronUpdaterOpenDialogRequest,
  OpenDesignElectronUpdaterOpenDialogListener,
  OpenDesignElectronBridge,
  OpenDesignElectronGlobalScope,
} from "./protocol.js";

// --- detection: locate + validate the injected bridge ---
export {
  isOpenDesignElectronBridge,
  getOpenDesignElectron,
  isOpenDesignElectronAvailable,
  detectOpenDesignElectronClientType,
} from "./detection.js";

// --- normalize: adapter result -> renderer contract ---
export {
  normalizeOpenDesignElectronProjectImportResult,
  normalizeOpenDesignElectronProjectReplaceWorkingDirResult,
  normalizeOpenDesignElectronPickWorkingDirResult,
} from "./normalize.js";

// --- actions: renderer-facing host action wrappers ---
export {
  openElectronExternalUrl,
  signalElectronReady,
  exportElectronDiagnostics,
  openElectronProjectPath,
  clearElectronBrowserData,
  captureElectronPage,
  pickAndImportElectronProject,
  pickAndReplaceElectronProjectWorkingDir,
  pickElectronWorkingDir,
  printElectronPdf,
  setElectronPetVisible,
  getElectronUpdaterStatus,
  checkElectronUpdater,
  deferElectronUpdater,
  downloadElectronUpdater,
  applyElectronUpdater,
  getLatestElectronPreviewNavigationFailure,
  subscribeElectronUpdater,
  subscribeElectronUpdaterOpenDialog,
  subscribeElectronPreviewNavigationFailure,
  setElectronUpdaterMenuLabels,
} from "./actions.js";
