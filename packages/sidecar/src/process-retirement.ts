import type { ProcessSnapshot, StopProcessesOptions, StopProcessesResult } from "@open-design/platform";
import {
  captureProcessSnapshot,
  isProcessAlive,
  matchesStampedProcess,
  signalProcesses,
  stopProcesses,
} from "@open-design/platform";

import { collectSidecarGenerationPids } from "./process-tree.js";
import { SIDECAR_STAMP_CONTRACT, type SidecarStamp } from "./stamp.js";

type FencedGenerationRef = Readonly<{ rootPid: number; startedAtMs?: number; stamp: SidecarStamp }>;
type SupervisedTargetRef = Readonly<{ rootPid: number; stamp: SidecarStamp; supervisorPid: number }>;

type FencedRetirementOptions = Readonly<{
  gracefulStopInitiated: boolean;
  knownSnapshots?: ProcessSnapshot[];
  stopOptions?: StopProcessesOptions;
}>;

/** Retire one already-fenced generation without ever adopting a replacement root. */
export async function retireFencedSidecarProcessTree(
  ref: FencedGenerationRef,
  options: FencedRetirementOptions,
): Promise<StopProcessesResult> {
  return await retireSidecarProcessTree(
    ref,
    options,
    (processInfo) => processInfo.pid === ref.rootPid &&
      (ref.startedAtMs == null || processInfo.startedAtMs === ref.startedAtMs) &&
      matchesStampedProcess(processInfo, ref.stamp, SIDECAR_STAMP_CONTRACT),
    (initialPids) => initialPids,
  );
}

/** Retire the target process tree directly owned by a live supervisor. */
export async function retireSupervisedSidecarTargetTree(
  ref: SupervisedTargetRef,
  options: FencedRetirementOptions,
): Promise<StopProcessesResult> {
  return await retireSidecarProcessTree(
    ref,
    options,
    (processInfo) => processInfo.pid === ref.rootPid && processInfo.ppid === ref.supervisorPid,
    () => [ref.rootPid],
  );
}

async function retireSidecarProcessTree(
  ref: FencedGenerationRef,
  options: FencedRetirementOptions,
  ownsRoot: (processInfo: ProcessSnapshot) => boolean,
  termTargets: (initialPids: number[]) => number[],
): Promise<StopProcessesResult> {
  const snapshots = options.knownSnapshots ?? await captureProcessSnapshot();
  const rootOwnedAtEntry = snapshots.some(ownsRoot);
  if (!rootOwnedAtEntry) return alreadyStoppedResult();

  const initialPids = collectSidecarGenerationPids(snapshots, [ref.rootPid], ref.stamp);
  if (!options.gracefulStopInitiated) signalProcesses(termTargets(initialPids), "SIGTERM");

  const graceMs = normalizeGraceMs(options.stopOptions?.termGraceMs, 5_000);
  const deadline = Date.now() + graceMs;
  const remainingInitialPids = (): number[] => initialPids.filter(isProcessAlive);
  let remaining = remainingInitialPids();
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    remaining = remainingInitialPids();
  }
  if (remaining.length === 0) return stoppedResult(initialPids);

  // Refresh only while the same root fence still holds. If it vanished while
  // descendants survived, fall back to the entry snapshot instead of adopting
  // processes now owned by another generation.
  const latestSnapshots = await captureProcessSnapshot();
  const rootStillOwned = latestSnapshots.some(ownsRoot);
  const forceTargets = rootStillOwned
    ? collectSidecarGenerationPids(latestSnapshots, [ref.rootPid], ref.stamp)
    : remainingInitialPids();
  if (forceTargets.length === 0) return stoppedResult(initialPids);

  const forced = await stopProcesses(forceTargets, {
    killGraceMs: options.stopOptions?.killGraceMs,
    termGraceMs: 0,
  });
  const matchedPids = [...new Set([...initialPids, ...forceTargets])];
  return {
    alreadyStopped: false,
    forcedPids: forced.forcedPids,
    matchedPids,
    remainingPids: forced.remainingPids,
    stoppedPids: matchedPids.filter((pid) => !forced.remainingPids.includes(pid)),
  };
}

function normalizeGraceMs(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function alreadyStoppedResult(): StopProcessesResult {
  return {
    alreadyStopped: true,
    forcedPids: [],
    matchedPids: [],
    remainingPids: [],
    stoppedPids: [],
  };
}

function stoppedResult(matchedPids: number[]): StopProcessesResult {
  return {
    alreadyStopped: false,
    forcedPids: [],
    matchedPids,
    remainingPids: [],
    stoppedPids: matchedPids,
  };
}
