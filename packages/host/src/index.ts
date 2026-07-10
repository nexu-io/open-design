/**
 * @module host
 *
 * Public barrel for `@open-design/host` — the Open Design renderer host-bridge
 * protocol. Re-exports the exact prior flat surface from the cohesive sibling
 * modules: the wire protocol (constants + types), bridge detection/validation,
 * adapter-result normalizers, and the renderer-facing action wrappers. This
 * file contains no logic.
 */

// --- protocol: constant registries + wire types ---
export {
  OPEN_DESIGN_HOST_GLOBAL,
  OPEN_DESIGN_HOST_VERSION,
  OPEN_DESIGN_HOST_CLIENT_TYPES,
  OPEN_DESIGN_HOST_UPDATER_ACTIONS,
  OPEN_DESIGN_HOST_UPDATER_STATES,
} from "./protocol.js";
export type {
  OpenDesignHostClientType,
  OpenDesignHostClient,
  OpenDesignHostFailure,
  OpenDesignHostActionResult,
  OpenDesignHostProjectImportInit,
  OpenDesignHostProjectImportSuccess,
  OpenDesignHostProjectImportResult,
  OpenDesignHostProjectReplaceWorkingDirSuccess,
  OpenDesignHostProjectReplaceWorkingDirResult,
  OpenDesignHostPickWorkingDirSuccess,
  OpenDesignHostPickWorkingDirResult,
  OpenDesignHostPdfPrintOptions,
  OpenDesignHostCaptureClip,
  OpenDesignHostCaptureOptions,
  OpenDesignHostCaptureSuccess,
  OpenDesignHostCaptureResult,
  OpenDesignHostBrowserClearDataOptions,
  OpenDesignHostUpdaterAction,
  OpenDesignHostUpdaterState,
  OpenDesignHostUpdaterMode,
  OpenDesignHostUpdaterChannel,
  OpenDesignHostUpdaterActionOptions,
  OpenDesignHostUpdaterCapabilitySet,
  OpenDesignHostUpdaterPathSnapshot,
  OpenDesignHostUpdaterChecksumSnapshot,
  OpenDesignHostUpdaterArtifactSnapshot,
  OpenDesignHostUpdaterProgressSnapshot,
  OpenDesignHostUpdaterErrorSnapshot,
  OpenDesignHostUpdaterInstallResult,
  OpenDesignHostUpdaterReleaseSnapshot,
  OpenDesignHostUpdaterIncomingSnapshot,
  OpenDesignHostUpdaterCacheLifecycleTrigger,
  OpenDesignHostUpdaterReleaseLifecycleState,
  OpenDesignHostUpdaterCacheLifecycleSummary,
  OpenDesignHostUpdaterCacheSnapshot,
  OpenDesignHostUpdaterStatusSnapshot,
  OpenDesignHostUpdaterResult,
  OpenDesignHostUpdaterStatusListener,
  OpenDesignHostBridge,
  OpenDesignHostGlobalScope,
} from "./protocol.js";

// --- detection: locate + validate the injected bridge ---
export {
  isOpenDesignHostBridge,
  getOpenDesignHost,
  isOpenDesignHostAvailable,
  detectOpenDesignHostClientType,
} from "./detection.js";

// --- normalize: adapter result -> renderer contract ---
export {
  normalizeOpenDesignHostProjectImportResult,
  normalizeOpenDesignHostProjectReplaceWorkingDirResult,
  normalizeOpenDesignHostPickWorkingDirResult,
} from "./normalize.js";

// --- actions: renderer-facing host action wrappers ---
export {
  openHostExternalUrl,
  openHostProjectPath,
  clearHostBrowserData,
  captureHostPage,
  pickAndImportHostProject,
  pickAndReplaceHostProjectWorkingDir,
  pickHostWorkingDir,
  printHostPdf,
  setHostPetVisible,
  getHostUpdaterStatus,
  checkHostUpdater,
  downloadHostUpdater,
  installHostUpdater,
  quitHostAfterUpdaterInstallerOpen,
  subscribeHostUpdater,
} from "./actions.js";
