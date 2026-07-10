/**
 * @module @open-design/platform
 *
 * Root barrel for generic OS/platform primitives. This file adds no behavior —
 * it only re-exports the public surface from the cohesive sibling modules:
 *
 * - `command`    — cross-platform command-invocation construction.
 * - `process`    — process lifecycle, stamps, snapshots, and stop escalation.
 * - `proxy-env`  — system proxy discovery and proxy-aware env merging.
 * - `fs`         — filesystem containment, atomic copy, removal, log tails.
 * - `http`       — HTTP readiness polling.
 * - `toolchain`  — user-level toolchain bin discovery.
 *
 * The set of names exported here is intentionally identical to the pre-split
 * public surface; importers see no change.
 */

export type { CommandInvocation, CommandInvocationRequest } from "./command.js";
export { createCommandInvocation, createPackageManagerInvocation } from "./command.js";

export type { ResolveSystemProxyEnvOptions, SystemProxyCommandRunner } from "./proxy-env.js";
export {
  mergeProxyAwareEnv,
  parseMacosScutilProxyOutput,
  parseWindowsInternetSettingsProxyOutput,
  resolveSystemProxyEnv,
} from "./proxy-env.js";

export type {
  ProcessSnapshot,
  ProcessStampContract,
  ProcessStampField,
  ProcessStampShape,
  SpawnProcessRequest,
  StampedProcessMatchCriteria,
  StopProcessesResult,
} from "./process.js";
export {
  collectProcessTreePids,
  createProcessStampArgs,
  isProcessAlive,
  listProcessSnapshots,
  matchesProcessStamp,
  matchesStampedProcess,
  readFlagValue,
  readProcessStamp,
  readProcessStampFromCommand,
  spawnBackgroundProcess,
  spawnLoggedProcess,
  stopProcesses,
  waitForProcessExit,
} from "./process.js";

export type {
  AtomicCopyFileOptions,
  AtomicCopyFileResult,
  RemovePathBestEffortOptions,
  RemovePathBestEffortResult,
} from "./fs.js";
export { atomicCopyFile, pathContains, readLogTail, removePathBestEffort } from "./fs.js";

export type { HttpWaitOptions } from "./http.js";
export { waitForHttpOk } from "./http.js";

export type { WellKnownUserToolchainOptions } from "./toolchain.js";
export { wellKnownUserToolchainBins } from "./toolchain.js";
