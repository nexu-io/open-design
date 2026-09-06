/**
 * Import-meta-free Sidecar authority surface for build closures that require
 * an explicit, installed supervisor identity (for example Electron CJS).
 */

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
  isCurrentSidecarLauncher,
  normalizeSidecarStamp,
  readCurrentSidecarStamp,
  readOptionalCurrentSidecarStamp,
} from "./stamp.js";
export type {
  SidecarAuthorityLaunchRequest,
  SidecarLaunchConvergenceOptions,
  SidecarLaunchConvergenceResult,
  SidecarRestartOptions,
  SidecarRestartResult,
  SidecarStopOptions,
  SidecarStopRequest,
  SidecarStopResult,
  SidecarStopSetResult,
  SidecarSupervisorBinding,
  SpawnedSidecar,
} from "./operations.js";
export {
  bootstrapSidecarProcessWithSupervisor,
  convergeSidecarLaunch,
  findSidecarProcesses,
  getSidecarStatus,
  invokeSidecar,
  launchSidecarWithSupervisor,
  registerSidecarProcess,
  restartSidecarWithSupervisor,
  SidecarLaunchConvergenceError,
  spawnSidecarLauncher,
  spawnSidecarWithSupervisor,
  stopSidecar,
  stopSidecars,
} from "./operations.js";
