/**
 * @module sidecar-proto
 *
 * Public barrel for `@open-design/sidecar-proto`. Re-exports the exact prior
 * flat surface from the cohesive sibling modules — identity/env/stamp
 * constants, the error contract, stamp normalizers, desktop control/update
 * payloads, runtime status snapshots, the message envelopes, and the
 * aggregate contract descriptor. This file contains no logic.
 */

// --- identity: app/mode/source keys, env, stamp flags/fields, defaults ---
export {
  APP_KEYS,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  SIDECAR_ENV,
  SIDECAR_RUNTIME_ENV,
  SIDECAR_STAMP_FLAGS,
  STAMP_APP_FLAG,
  STAMP_IPC_FLAG,
  STAMP_MODE_FLAG,
  STAMP_NAMESPACE_FLAG,
  STAMP_SOURCE_FLAG,
  SIDECAR_STAMP_FIELDS,
  SIDECAR_DEFAULTS,
  OPEN_DESIGN_PRODUCT_NAME,
  resolveWindowsReleaseNamespaceToken,
  resolveWindowsUninstallRegistryKey,
} from "./identity.js";
export type { AppKey, SidecarMode, SidecarSource } from "./identity.js";

// --- errors ---
export { SIDECAR_ERROR_CODES, SidecarContractError } from "./errors.js";
export type { SidecarErrorCode } from "./errors.js";

// --- stamp: shape + field/whole-stamp normalizers ---
export {
  normalizeNamespace,
  isSidecarMode,
  normalizeSidecarMode,
  isAppKey,
  normalizeAppKey,
  isSidecarSource,
  normalizeSidecarSource,
  isWindowsNamedPipePath,
  normalizeIpcPath,
  normalizeSidecarStamp,
  normalizeSidecarStampCriteria,
  assertSidecarStamp,
} from "./stamp.js";
export type { SidecarStamp, SidecarStampInput, SidecarStampCriteria } from "./stamp.js";

// --- desktop-update: auto-update protocol ---
export {
  DESKTOP_UPDATE_ACTIONS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_STATES,
} from "./desktop-update.js";
export type {
  DesktopUpdateAction,
  DesktopUpdateMode,
  DesktopUpdateChannel,
  DesktopUpdateState,
  DesktopUpdateCapabilitySet,
  DesktopUpdatePathSnapshot,
  DesktopUpdateChecksumSnapshot,
  DesktopUpdateArtifactSnapshot,
  DesktopUpdateProgressSnapshot,
  DesktopUpdateErrorSnapshot,
  DesktopUpdateInstallResult,
  DesktopUpdateReleaseSnapshot,
  DesktopUpdateIncomingSnapshot,
  DesktopUpdateCacheLifecycleTrigger,
  DesktopUpdateReleaseLifecycleState,
  DesktopUpdateCacheLifecycleSummary,
  DesktopUpdateCacheSnapshot,
  DesktopUpdateStatusSnapshot,
  DesktopUpdateInput,
  DesktopUpdateResult,
} from "./desktop-update.js";

// --- desktop-control: remote-control payload shapes ---
export type {
  DesktopEvalInput,
  DesktopEvalResult,
  DesktopScreenshotInput,
  DesktopScreenshotResult,
  DesktopConsoleEntry,
  DesktopConsoleResult,
  DesktopClickInput,
  DesktopClickResult,
  DesktopExportPdfInput,
  DesktopExportPdfResult,
  DesktopRenderSlidesInput,
  DesktopRenderSlidesErrorCode,
  DesktopRenderSlidesResult,
  DesktopExportArtifactFormat,
  DesktopExportArtifactImageFormat,
  DesktopExportArtifactInput,
  DesktopExportArtifactResult,
} from "./desktop-control.js";

// --- status: runtime status snapshots ---
export type {
  ServiceRuntimeState,
  DaemonStatusSnapshot,
  WebStatusSnapshot,
  DesktopRuntimeState,
  DesktopStatusSnapshot,
} from "./status.js";

// --- messages: envelopes + per-target normalizers ---
export {
  SIDECAR_MESSAGES,
  normalizeDaemonSidecarMessage,
  normalizeWebSidecarMessage,
  normalizeDesktopSidecarMessage,
} from "./messages.js";
export type {
  SidecarStatusMessage,
  SidecarShutdownMessage,
  DesktopEvalMessage,
  DesktopScreenshotMessage,
  DesktopConsoleMessage,
  DesktopShowMessage,
  DesktopClickMessage,
  DesktopExportPdfMessage,
  DesktopRenderSlidesMessage,
  DesktopExportArtifactMessage,
  DesktopUpdateMessage,
  RegisterDesktopAuthInput,
  RegisterDesktopAuthMessage,
  RegisterDesktopAuthResult,
  MintImportTokenInput,
  MintImportTokenMessage,
  MintImportTokenResult,
  DaemonSidecarMessage,
  WebSidecarMessage,
  DesktopSidecarMessage,
  ShutdownResult,
} from "./messages.js";

// --- contract: aggregate descriptor ---
export { OPEN_DESIGN_SIDECAR_CONTRACT } from "./contract.js";
export type { OpenDesignSidecarContract } from "./contract.js";
