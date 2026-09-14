/**
 * @module @open-design/sidecar
 *
 * Public boundary for sidecar clients and server-side process atomics. Transport,
 * endpoint derivation, and OS-visible identity are deliberately private package
 * details; callers share only the five-field resource identity and these operations.
 */

export type {
  AppRuntimePathRequest,
  BaseResolutionOptions,
  NamespaceResolutionOptions,
  PortAllocation,
  PortRequest,
  ProjectRuntimePathRequest,
  RuntimePathRequest,
  RuntimeRootRequest,
  SidecarRuntimeContext,
} from "./types.js";
export {
  resolveAppRuntimeDir,
  resolveAppRuntimePath,
  resolveLogFilePath,
  resolveLogsDir,
  resolveManifestPath,
  resolveNamespace,
  resolveNamespaceRoot,
  resolvePointerPath,
  resolveProjectRoot,
  resolveProjectTmpRoot,
  resolveRuntimeNamespaceRoot,
  resolveRuntimeRoot,
  resolveSidecarBase,
  resolveSourceRuntimeRoot,
} from "./paths.js";
export { allocatePort } from "./port.js";
export type {
  SidecarClientOptions,
  SidecarConnection,
  SidecarHandler,
  SidecarHandlers,
  SidecarGenerationHandoffRequest,
  SidecarLifecycle,
  SidecarResources,
} from "./client.js";
export { handoffCurrentSidecarGeneration, SidecarClient, SidecarFactory } from "./client.js";
export type { SidecarLifecycleLockOptions } from "./lifecycle-lock.js";
export { withSidecarLifecycleLock } from "./lifecycle-lock.js";
export type { SidecarStamp, SidecarStampField } from "./stamp.js";
export {
  normalizeSidecarStamp,
  isCurrentSidecarLauncher,
  readCurrentSidecarStamp,
  SIDECAR_STAMP_FIELDS,
  SIDECAR_STAMP_FLAGS,
} from "./stamp.js";
export type {
  SidecarLaunchRequest,
  SidecarLaunchConvergenceOptions,
  SidecarLaunchConvergenceResult,
  SidecarRestartOptions,
  SidecarRestartResult,
  SidecarStopOptions,
  SidecarStopResult,
  SidecarStopRequest,
  SidecarStopSetResult,
  SpawnedSidecar,
} from "./operations.js";
export {
  bootstrapSidecarProcess,
  convergeSidecarLaunch,
  findSidecarProcesses,
  getSidecarStatus,
  invokeSidecar,
  launchSidecar,
  registerSidecarProcess,
  restartSidecar,
  resolveSidecarLauncherExitCode,
  SidecarLaunchConvergenceError,
  spawnSidecarLauncher,
  spawnSidecar,
  stopSidecar,
  stopSidecars,
} from "./operations.js";
