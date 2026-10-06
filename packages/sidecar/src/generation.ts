import { lstat, rm } from "node:fs/promises";
import { createConnection } from "node:net";

import type { ProcessSnapshot, StopProcessesOptions, StopProcessesResult } from "@open-design/platform";
import {
  captureProcessSnapshot,
  isProcessAlive,
  matchesStampedProcess,
} from "@open-design/platform";

import { type SidecarDescription, sidecarProtocol } from "./client.js";
import { requestJsonIpc } from "./json-ipc.js";
import {
  captureSidecarGenerationSetSnapshot,
  captureSidecarGenerationSnapshot,
} from "./process-tree.js";
import { retireFencedSidecarProcessTree } from "./process-retirement.js";
import {
  normalizeSidecarStamp,
  resolvePrivateIpcPath,
  SIDECAR_STAMP_CONTRACT,
  type SidecarStamp,
} from "./stamp.js";

export type SidecarStopResult = StopProcessesResult & {
  staleEndpointRemoved?: boolean;
  gracefulAccepted: boolean;
};

export type SidecarStopOptions = StopProcessesOptions & {
  /** Bound the graceful lifecycle request before process retirement takes over. */
  gracefulRequestTimeoutMs?: number;
};

export type SidecarStopRequest = Readonly<{
  options?: SidecarStopOptions;
  stamp: SidecarStamp;
}>;

export type SidecarStopSetResult = SidecarStopResult & {
  results: Array<Readonly<{ result: SidecarStopResult; stamp: SidecarStamp }>>;
};

/** Authority to mutate one concrete supervisor generation of a stamped resource. */
export type SidecarGenerationRef = Readonly<{
  rootPid: number;
  startedAtMs?: number;
  stamp: SidecarStamp;
}>;

class AmbiguousSidecarGenerationsError extends Error {
  readonly rootPids: readonly number[];

  constructor(rootPids: readonly number[]) {
    super(`cannot mutate sidecar with multiple stamped generation roots: ${rootPids.join(", ")}`);
    this.name = "AmbiguousSidecarGenerationsError";
    this.rootPids = Object.freeze([...rootPids]);
  }
}

type PrivateEndpointIdentity = Readonly<{ dev: number; ino: number }>;

/** One invocation-fenced observation used by discovery-based mutation paths. */
export type ObservedSidecarGeneration = Readonly<{
  description: SidecarDescription | null;
  endpoint: PrivateEndpointIdentity | null;
  processes: ProcessSnapshot[];
  ref: SidecarGenerationRef | null;
  stamp: SidecarStamp;
}>;

export function sidecarGenerationRef(
  stampInput: SidecarStamp,
  rootPid: number,
  startedAtMs?: number,
): SidecarGenerationRef {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) {
    throw new Error("sidecar generation root pid must be a positive safe integer");
  }
  return Object.freeze({
    rootPid,
    ...(Number.isSafeInteger(startedAtMs) && (startedAtMs ?? 0) > 0 ? { startedAtMs } : {}),
    stamp: normalizeSidecarStamp(stampInput),
  });
}

export async function describeSidecarGeneration(
  stampInput: SidecarStamp,
  timeoutMs = 2_000,
): Promise<SidecarDescription | null> {
  const stamp = normalizeSidecarStamp(stampInput);
  let description: SidecarDescription;
  try {
    description = await requestJsonIpc<SidecarDescription>(
      resolvePrivateIpcPath(stamp),
      { type: sidecarProtocol.describe },
      { timeoutMs },
    );
  } catch {
    return null;
  }
  const describedStamp = normalizeSidecarStamp(description.stamp);
  if (JSON.stringify(describedStamp) !== JSON.stringify(stamp)) {
    throw new Error("sidecar endpoint described a different stamp");
  }
  if (!Number.isSafeInteger(description.resources.pid) || description.resources.pid <= 0) {
    throw new Error("sidecar endpoint described an invalid pid");
  }
  if (!Number.isInteger(description.resources.port) || description.resources.port < 0 || description.resources.port > 65535) {
    throw new Error("sidecar endpoint described an invalid port");
  }
  if (typeof description.ready !== "boolean") throw new Error("sidecar endpoint described invalid readiness");
  return description;
}

export async function observeSidecarGeneration(
  stampInput: SidecarStamp,
  descriptionTimeoutMs = 2_000,
): Promise<ObservedSidecarGeneration> {
  return (await observeSidecarGenerations([stampInput], descriptionTimeoutMs))[0]!;
}

/** Observe several resources at one process-table boundary. */
export async function observeSidecarGenerations(
  stampInputs: readonly SidecarStamp[],
  descriptionTimeoutMs: number | readonly number[] = 2_000,
): Promise<ObservedSidecarGeneration[]> {
  const stamps = uniqueNormalizedStamps(stampInputs);
  const descriptionTimeouts = stamps.map((_, index) => normalizeGracefulRequestTimeoutMs(
    typeof descriptionTimeoutMs === "number" ? descriptionTimeoutMs : descriptionTimeoutMs[index],
  ));
  let retryDeadline: number | null = null;
  let ambiguousReobservationUsed = false;
  while (true) {
    try {
      return await observeSidecarGenerationsOnce(stamps, descriptionTimeouts);
    } catch (error) {
      if (error instanceof AmbiguousSidecarGenerationsError) {
        if (ambiguousReobservationUsed) throw error;
        const transitioned = await waitForAmbiguousRootExit(error.rootPids, 1_000);
        if (!transitioned) throw error;
        ambiguousReobservationUsed = true;
        continue;
      }
      // Guarantee one real re-observation even when the first Windows CIM
      // capture itself takes longer than the old one-second retry deadline.
      if (!isTransientGenerationObservation(error)) throw error;
      if (retryDeadline == null) retryDeadline = Date.now() + 1_000;
      else if (Date.now() >= retryDeadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function observeSidecarGenerationsOnce(
  stamps: readonly SidecarStamp[],
  descriptionTimeoutMs: readonly number[],
): Promise<ObservedSidecarGeneration[]> {
  const endpoints = await Promise.all(stamps.map(readPrivateEndpointIdentity));
  const snapshots = await captureSidecarGenerationSetSnapshot(stamps);
  const endpointsAfterCapture = await Promise.all(stamps.map(readPrivateEndpointIdentity));
  const descriptions = await Promise.all(
    stamps.map(async (stamp, index) => await describeSidecarGeneration(stamp, descriptionTimeoutMs[index])),
  );
  const endpointsAfterDescribe = await Promise.all(stamps.map(readPrivateEndpointIdentity));

  return stamps.map((stamp, index) => {
    const endpoint = endpoints[index] ?? null;
    if (!samePrivateEndpointIdentity(endpoint, endpointsAfterCapture[index] ?? null)) {
      throw new Error("cannot mutate sidecar because endpoint ownership changed during process discovery");
    }
    if (!samePrivateEndpointIdentity(endpoint, endpointsAfterDescribe[index] ?? null)) {
      throw new Error("cannot mutate sidecar because endpoint ownership changed during description");
    }
    const snapshot = snapshots[index]!;
    if (snapshot.roots.length > 1) {
      throw new AmbiguousSidecarGenerationsError(snapshot.roots.map(({ pid }) => pid));
    }
    const description = descriptions[index] ?? null;
    const rootPid = snapshot.roots[0]?.pid ?? null;
    if (description != null && rootPid !== description.resources.pid) {
      throw new Error(
        `cannot mutate sidecar because endpoint pid ${description.resources.pid} is not the stamped generation root`,
      );
    }
    return {
      description,
      endpoint,
      processes: snapshot.processes,
      ref: rootPid == null ? null : sidecarGenerationRef(stamp, rootPid, snapshot.roots[0]?.startedAtMs),
      stamp,
    };
  });
}

function isTransientGenerationObservation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.startsWith("cannot mutate sidecar because endpoint");
}

async function waitForAmbiguousRootExit(rootPids: readonly number[], timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (rootPids.some((pid) => !isProcessAlive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return rootPids.some((pid) => !isProcessAlive(pid));
}

export async function retireObservedSidecarGeneration(
  observation: ObservedSidecarGeneration,
  options: SidecarStopOptions = {},
): Promise<SidecarStopResult> {
  return (await retireObservedSidecarGenerations([{ observation, options }]))[0]!;
}

/** Retire an invocation-fenced resource set and verify replacements once. */
export async function retireObservedSidecarGenerations(
  requests: readonly Readonly<{
    observation: ObservedSidecarGeneration;
    options?: SidecarStopOptions;
  }>[],
): Promise<SidecarStopResult[]> {
  const baseResults = await Promise.all(requests.map(async ({ observation, options = {} }) =>
    observation.ref == null
      ? alreadyStoppedResult()
      : await retireSidecarGeneration(observation.ref, options, observation.processes)));
  const replacementSnapshots = await captureSidecarGenerationSetSnapshot(
    requests.map(({ observation }) => observation.stamp),
  );

  return await Promise.all(requests.map(async ({ observation }, index) => {
    const base = baseResults[index]!;
    const replacements = replacementSnapshots[index]!.roots.filter(({ pid }) => isProcessAlive(pid));
    const remainingPids = [...new Set([
      ...base.remainingPids,
      ...replacements.map(({ pid }) => pid),
    ])];
    let staleEndpointRemoved = false;
    if (
      remainingPids.length === 0 &&
      (observation.ref != null || await privateEndpointRefusesConnections(observation.stamp))
    ) {
      staleEndpointRemoved = await removeOwnedPrivateEndpoint(observation.stamp, observation.endpoint);
    }
    return {
      ...base,
      alreadyStopped: base.alreadyStopped && remainingPids.length === 0,
      remainingPids,
      staleEndpointRemoved,
    };
  }));
}

/** Retire a generation already owned by the caller without adopting a replacement. */
export async function retireKnownSidecarGeneration(
  ref: SidecarGenerationRef,
  options: SidecarStopOptions = {},
): Promise<SidecarStopResult> {
  const endpoint = await readPrivateEndpointIdentity(ref.stamp);
  const description = await describeSidecarGeneration(ref.stamp);
  const endpointAfterDescribe = await readPrivateEndpointIdentity(ref.stamp);
  if (!samePrivateEndpointIdentity(endpoint, endpointAfterDescribe)) {
    throw new Error("cannot retire sidecar generation because endpoint ownership changed during description");
  }
  const ownsEndpoint = description?.resources.pid === ref.rootPid;
  const result = await retireSidecarGeneration(ref, options);
  const replacementExists = (await captureSidecarGenerationSnapshot(ref.stamp)).roots
    .some(({ pid }) => isProcessAlive(pid));
  let staleEndpointRemoved = false;
  if (
    result.remainingPids.length === 0 &&
    !replacementExists &&
    (ownsEndpoint || (description == null && await privateEndpointRefusesConnections(ref.stamp)))
  ) {
    staleEndpointRemoved = await removeOwnedPrivateEndpoint(ref.stamp, endpoint);
  }
  return { ...result, staleEndpointRemoved };
}

/** Retire exactly the generation named by the stable supervisor root. */
export async function retireSidecarGeneration(
  ref: SidecarGenerationRef,
  options: SidecarStopOptions = {},
  knownSnapshots?: ProcessSnapshot[],
): Promise<SidecarStopResult> {
  const snapshots = knownSnapshots ?? await captureProcessSnapshot();
  const rootOwnedAtEntry = snapshots.some((processInfo) =>
    processInfo.pid === ref.rootPid &&
    (ref.startedAtMs == null || processInfo.startedAtMs === ref.startedAtMs) &&
    matchesStampedProcess(processInfo, ref.stamp, SIDECAR_STAMP_CONTRACT),
  );
  if (!rootOwnedAtEntry) return alreadyStoppedResult();
  let gracefulAccepted = false;
  try {
    const response = await requestJsonIpc<{ accepted?: unknown }>(
      resolvePrivateIpcPath(ref.stamp),
      { targetPids: [ref.rootPid], type: sidecarProtocol.stop },
      { timeoutMs: normalizeGracefulRequestTimeoutMs(options.gracefulRequestTimeoutMs) },
    );
    gracefulAccepted = response.accepted === true;
  } catch {
    // An absent, stale, or replacement endpoint is resolved by the owned root tree.
  }

  const result = await retireFencedSidecarProcessTree(ref, {
    gracefulStopInitiated: gracefulAccepted,
    knownSnapshots: snapshots,
    stopOptions: options,
  });
  return { ...result, gracefulAccepted };
}

function normalizeGracefulRequestTimeoutMs(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 2_000;
}

function alreadyStoppedResult(): SidecarStopResult {
  return {
    alreadyStopped: true,
    forcedPids: [],
    gracefulAccepted: false,
    matchedPids: [],
    remainingPids: [],
    stoppedPids: [],
  };
}

function uniqueNormalizedStamps(stampInputs: readonly SidecarStamp[]): SidecarStamp[] {
  const unique = new Map<string, SidecarStamp>();
  for (const input of stampInputs) {
    const stamp = normalizeSidecarStamp(input);
    unique.set(JSON.stringify(stamp), stamp);
  }
  return [...unique.values()];
}

function samePrivateEndpointIdentity(
  left: PrivateEndpointIdentity | null,
  right: PrivateEndpointIdentity | null,
): boolean {
  return left == null || right == null
    ? left === right
    : left.dev === right.dev && left.ino === right.ino;
}

async function readPrivateEndpointIdentity(stamp: SidecarStamp): Promise<PrivateEndpointIdentity | null> {
  if (process.platform === "win32") return null;
  const entry = await lstat(resolvePrivateIpcPath(stamp)).catch(() => null);
  return entry?.isSocket() ? { dev: entry.dev, ino: entry.ino } : null;
}

async function removeOwnedPrivateEndpoint(stamp: SidecarStamp, owned: PrivateEndpointIdentity | null): Promise<boolean> {
  if (owned == null) return false;
  const current = await readPrivateEndpointIdentity(stamp);
  if (current?.dev !== owned.dev || current.ino !== owned.ino) return false;
  await rm(resolvePrivateIpcPath(stamp), { force: true });
  return true;
}

async function privateEndpointRefusesConnections(stamp: SidecarStamp): Promise<boolean> {
  if (process.platform === "win32") return false;
  return await new Promise<boolean>((resolveProbe) => {
    const socket = createConnection(resolvePrivateIpcPath(stamp));
    socket.once("connect", () => {
      socket.destroy();
      resolveProbe(false);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      resolveProbe(error.code === "ECONNREFUSED");
    });
  });
}
