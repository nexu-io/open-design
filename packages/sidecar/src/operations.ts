import type { ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { SpawnProcessRequest } from "@open-design/platform";
import {
  captureProcessSnapshotsByPids,
  createProcessStampArgs,
  isProcessAlive,
  listProcessSnapshots,
  matchesStampedProcess,
  spawnBackgroundProcess,
  spawnLoggedProcess,
  stopProcesses,
} from "@open-design/platform";

import { requestJsonIpc } from "./json-ipc.js";
import {
  prepareSidecarLaunchEnvironment,
  SIDECAR_SUPERVISOR_TARGET_ENV,
  sidecarProtocol,
  type SidecarDescription,
  type SidecarResources,
} from "./client.js";
import {
  describeSidecarGeneration,
  observeSidecarGeneration,
  observeSidecarGenerations,
  retireKnownSidecarGeneration,
  retireObservedSidecarGeneration,
  retireObservedSidecarGenerations,
  sidecarGenerationRef,
  type SidecarStopOptions,
  type SidecarStopRequest,
  type SidecarStopSetResult,
  type SidecarStopResult,
} from "./generation.js";
import { captureSidecarGenerationSnapshot } from "./process-tree.js";
import {
  createSidecarLauncherArgs,
  isSidecarLauncherCommand,
  normalizeSidecarStamp,
  readSupervisedSidecarContext,
  removeSidecarLauncherArgs,
  resolvePrivateIpcPath,
  serializeSupervisedSidecarContext,
  SIDECAR_SUPERVISED_CONTEXT_ENV,
  SIDECAR_STAMP_CONTRACT,
  type SidecarStamp,
} from "./stamp.js";

export type {
  SidecarStopOptions,
  SidecarStopRequest,
  SidecarStopResult,
  SidecarStopSetResult,
} from "./generation.js";

export type SidecarLaunchRequest = Omit<SpawnProcessRequest, "args" | "env"> & {
  args?: readonly string[];
  env?: NodeJS.ProcessEnv;
  resources: Omit<SidecarResources, "pid">;
  stamp: SidecarStamp;
};

export type SidecarRestartOptions = {
  requireConcretePort?: boolean;
  reuseKnownPort?: boolean;
  stop?: SidecarStopOptions;
};

export type SidecarLaunchConvergenceOptions = {
  ownerStamps?: readonly SidecarStamp[];
  retryDelayMs?: number;
  stabilityMs?: number;
  timeoutMs?: number;
};

export type SidecarLaunchConvergenceResult = {
  attempts: number;
  description: SidecarDescription;
  launcherProcess: ChildProcess & { pid: number };
};

export class SidecarLaunchConvergenceError extends Error {
  readonly launcherPid: number;

  constructor(message: string, launcherPid: number) {
    super(message);
    this.name = "SidecarLaunchConvergenceError";
    this.launcherPid = launcherPid;
  }
}

const RESTART_READY_TIMEOUT_MS = 30_000;
const BOOTSTRAP_READY_TIMEOUT_MS = 90_000;
const EXISTING_GENERATION_STABILITY_MS = 750;
const SIDECAR_LAUNCHER_RETRY_EXIT_CODE = 75;
const restartTails = new Map<string, Promise<void>>();

class SidecarBootstrapGenerationRetiredError extends Error {
  constructor(pid: number) {
    super(`sidecar bootstrap generation ${pid} exited before a generation became ready`);
    this.name = "SidecarBootstrapGenerationRetiredError";
  }
}

/** Map sidecar lifecycle failures to the private launcher process protocol. */
export function resolveSidecarLauncherExitCode(error: unknown): number {
  return error instanceof SidecarBootstrapGenerationRetiredError
    ? SIDECAR_LAUNCHER_RETRY_EXIT_CODE
    : 1;
}

export type SidecarRestartResult = {
  pid: number;
  reusedPort: boolean;
  stop: SidecarStopResult;
};

/**
 * One concrete process generation created for a five-field sidecar resource.
 * The stamp identifies the resource across processes; this handle retains the
 * root process identity needed to retire this generation even if its runtime
 * later rewrites the argv visible to the operating system.
 */
export type SpawnedSidecar = {
  readonly process: ChildProcess & { pid: number };
  readonly stamp: SidecarStamp;
  stop(options?: SidecarStopOptions): Promise<SidecarStopResult>;
};

export function registerSidecarProcess(
  stampInput: SidecarStamp,
  resources: Omit<SidecarResources, "pid">,
): SidecarStamp {
  const stamp = normalizeSidecarStamp(stampInput);
  const context = readSupervisedSidecarContext();
  if (context == null) throw new Error("current process is missing its supervised sidecar context");
  if (JSON.stringify(context.stamp) !== JSON.stringify(stamp)) {
    throw new Error("current process carries a different sidecar resource identity");
  }
  process.env[SIDECAR_SUPERVISED_CONTEXT_ENV] = serializeSupervisedSidecarContext(
    stamp,
    context.generationPid,
    resources,
  );
  return stamp;
}

export async function bootstrapSidecarProcess(
  stampInput: SidecarStamp,
  resources: Omit<SidecarResources, "pid">,
  options: {
    args?: readonly string[];
    command?: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    launch?: typeof launchSidecar;
    waitUntilReady?: (stamp: SidecarStamp, pid: number) => Promise<void>;
  } = {},
): Promise<boolean> {
  const stamp = normalizeSidecarStamp(stampInput);
  if (readSupervisedSidecarContext() != null) {
    registerSidecarProcess(stamp, resources);
    return false;
  }
  const launched = await (options.launch ?? launchSidecar)({
    args: removeSidecarLauncherArgs(options.args ?? process.argv.slice(1)),
    command: options.command ?? process.execPath,
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    logFd: null,
    resources,
    stamp,
  });
  try {
    await (options.waitUntilReady ?? waitForBootstrappedSidecarReady)(stamp, launched.pid, BOOTSTRAP_READY_TIMEOUT_MS);
  } catch (error) {
    const cleanup = await retireKnownSidecarGeneration(sidecarGenerationRef(stamp, launched.pid), { termGraceMs: 0 });
    if (cleanup.remainingPids.length > 0) {
      throw new AggregateError(
        [error, new Error(`failed to retire rejected bootstrap generation: ${cleanup.remainingPids.join(", ")}`)],
        "sidecar bootstrap failed and cleanup was incomplete",
      );
    }
    throw error;
  }
  return true;
}

export async function launchSidecar(request: SidecarLaunchRequest): Promise<{ pid: number }> {
  return await spawnBackgroundProcess(sidecarSpawnRequest(request));
}

/** Spawn an uncommitted client-side launcher; it is stamped but is not a generation root. */
export async function spawnSidecarLauncher(
  request: SidecarLaunchRequest,
): Promise<ChildProcess & { pid: number }> {
  const stamp = normalizeSidecarStamp(request.stamp);
  const { args = [], command, env, resources, ...spawnRequest } = request;
  const child = await spawnLoggedProcess({
    ...spawnRequest,
    args: [
      ...removeSidecarLauncherArgs(args),
      ...createSidecarLauncherArgs(stamp),
    ],
    command,
    env: prepareSidecarLaunchEnvironment(env ?? process.env, resources),
  });
  if (child.pid == null) throw new Error("spawned sidecar launcher has no pid");
  return child as ChildProcess & { pid: number };
}

/**
 * Launch a client-side entrypoint until it leaves one stable, ready generation.
 * A clean launcher exit is not success by itself: endpoint ownership and the
 * stamped generation root must agree for a stability window.
 */
export async function convergeSidecarLaunch(
  request: SidecarLaunchRequest,
  options: SidecarLaunchConvergenceOptions = {},
): Promise<SidecarLaunchConvergenceResult> {
  const stamp = normalizeSidecarStamp(request.stamp);
  const ownerStamps = (options.ownerStamps ?? [stamp]).map(normalizeSidecarStamp);
  const timeoutMs = normalizeDuration(options.timeoutMs, 45_000);
  const stabilityMs = normalizeDuration(options.stabilityMs, EXISTING_GENERATION_STABILITY_MS);
  const retryDelayMs = normalizeDuration(options.retryDelayMs, 250);
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let lastLauncher: (ChildProcess & { pid: number }) | null = null;
  let lastExit: { code: number | null; signal: NodeJS.Signals | null } | null = null;

  while (Date.now() < deadline) {
    attempts += 1;
    const launcher = await spawnSidecarLauncher({ ...request, stamp });
    lastLauncher = launcher;
    const readExit = observeChildExit(launcher);
    let stableOwnerPid: number | null = null;
    let stableSince = 0;
    let exitedAt: number | null = null;

    while (Date.now() < deadline) {
      const exit = readExit();
      if (exit != null && exitedAt == null) {
        exitedAt = Date.now();
        lastExit = exit;
      }
      if (exit != null && (
        (exit.code !== 0 && exit.code !== SIDECAR_LAUNCHER_RETRY_EXIT_CODE)
        || exit.signal != null
      )) {
        throw new SidecarLaunchConvergenceError(
          `sidecar launcher exited before convergence code=${exit.code ?? "null"} signal=${exit.signal ?? "null"}`,
          launcher.pid,
        );
      }

      const descriptions = await Promise.all(ownerStamps.map(async (candidate) =>
        await describeSidecarGeneration(candidate),
      ));
      const description = descriptions.find((candidate) => candidate?.ready === true) ?? null;
      const ownerPid = description?.resources.pid ?? null;
      const ownerSnapshot = ownerPid == null
        ? null
        : (await captureProcessSnapshotsByPids([ownerPid]))[0] ?? null;
      const generationStable = ownerSnapshot != null &&
        description != null && matchesStampedProcess(ownerSnapshot, description.stamp, SIDECAR_STAMP_CONTRACT) &&
        !isSidecarLauncherCommand(ownerSnapshot.command);
      const launcherConverged = exit != null && exit.signal == null && (
        exit.code === 0 || exit.code === SIDECAR_LAUNCHER_RETRY_EXIT_CODE
      );
      if (launcherConverged && generationStable && description != null && ownerPid != null) {
        if (stableOwnerPid !== ownerPid) {
          stableOwnerPid = ownerPid;
          stableSince = Date.now();
        }
        if (Date.now() - stableSince >= stabilityMs) {
          return { attempts, description, launcherProcess: launcher };
        }
      } else {
        stableOwnerPid = null;
        stableSince = 0;
      }

      if (exitedAt != null && !generationStable && Date.now() - exitedAt >= retryDelayMs) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  if (lastLauncher != null && isProcessAlive(lastLauncher.pid)) {
    await stopProcesses([lastLauncher.pid], { killGraceMs: 1_000, termGraceMs: 1_000 });
  }
  const exitSuffix = lastExit == null
    ? ""
    : `; last launcher exit code=${lastExit.code ?? "null"} signal=${lastExit.signal ?? "null"}`;
  throw new SidecarLaunchConvergenceError(
    `sidecar launcher did not leave one stable ready generation after ${attempts} attempt(s) within ${timeoutMs}ms${exitSuffix}`,
    lastLauncher?.pid ?? 0,
  );
}

function observeChildExit(child: ChildProcess): () => { code: number | null; signal: NodeJS.Signals | null } | null {
  let exit = child.exitCode != null || child.signalCode != null
    ? { code: child.exitCode, signal: child.signalCode }
    : null;
  child.once("exit", (code, signal) => { exit = { code, signal }; });
  return () => exit;
}

function normalizeDuration(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function sidecarSpawnRequest(request: SidecarLaunchRequest): SpawnProcessRequest {
  const stamp = normalizeSidecarStamp(request.stamp);
  const { args = [], command, env, resources, ...spawnRequest } = request;
  const preparedEnv = prepareSidecarLaunchEnvironment(env ?? process.env, resources);
  const supervisorEntry = import.meta.url.endsWith(".ts")
    ? fileURLToPath(new URL("./supervisor.ts", import.meta.url))
    : fileURLToPath(new URL("./supervisor.mjs", import.meta.url));
  return {
    ...spawnRequest,
    args: [
      ...(import.meta.url.endsWith(".ts") ? ["--import", "tsx"] : []),
      supervisorEntry,
      ...createProcessStampArgs(stamp, SIDECAR_STAMP_CONTRACT),
    ],
    command: process.execPath,
    env: {
      ...preparedEnv,
      ELECTRON_RUN_AS_NODE: "1",
      [SIDECAR_SUPERVISOR_TARGET_ENV]: JSON.stringify({
        args: removeSidecarLauncherArgs(args),
        command,
        electronRunAsNode: preparedEnv.ELECTRON_RUN_AS_NODE ?? null,
      }),
    },
  };
}

export async function spawnSidecar(request: SidecarLaunchRequest): Promise<SpawnedSidecar> {
  const stamp = normalizeSidecarStamp(request.stamp);
  const child = await spawnLoggedProcess(sidecarSpawnRequest({
    ...request,
    // A Windows generation must have its own process group so tree discovery
    // and retirement cannot cross into the launching shell. This is a
    // platform invariant, not a caller preference.
    detached: process.platform === "win32" ? true : request.detached,
    stamp,
  }));
  if (child.pid == null) throw new Error("spawned sidecar process has no pid");
  const rootPid = child.pid;
  const rootSnapshot = process.platform === "win32"
    ? (await captureProcessSnapshotsByPids([rootPid]))[0] ?? null
    : null;
  const ref = sidecarGenerationRef(stamp, rootPid, rootSnapshot?.startedAtMs);
  const childProcess = child as ChildProcess & { pid: number };
  let stopTask: Promise<SidecarStopResult> | null = null;
  return {
    process: childProcess,
    stamp,
    stop(options = {}) {
      stopTask ??= retireKnownSidecarGeneration(ref, options).finally(() => {
        stopTask = null;
      });
      return stopTask;
    },
  };
}

export async function findSidecarProcesses(stamp: SidecarStamp) {
  const exact = normalizeSidecarStamp(stamp);
  const matches = (await listProcessSnapshots()).filter((processInfo) =>
    matchesStampedProcess(processInfo, exact, SIDECAR_STAMP_CONTRACT) &&
    !isSidecarLauncherCommand(processInfo.command),
  );
  const matchedPids = new Set(matches.map(({ pid }) => pid));
  return matches.filter(({ ppid }) => !matchedPids.has(ppid));
}

export async function getSidecarStatus<TResult = unknown>(
  stamp: SidecarStamp,
  options?: { generationPid?: number; timeoutMs?: number },
): Promise<TResult> {
  const exact = normalizeSidecarStamp(stamp);
  return await requestJsonIpc<TResult>(
    resolvePrivateIpcPath(exact),
    { targetPid: options?.generationPid, type: sidecarProtocol.status },
    options == null ? undefined : { timeoutMs: options.timeoutMs },
  );
}

export async function invokeSidecar<TResult = unknown>(
  stamp: SidecarStamp,
  action: string,
  input: unknown,
  options?: { timeoutMs?: number },
): Promise<TResult> {
  const exact = normalizeSidecarStamp(stamp);
  return await requestJsonIpc<TResult>(
    resolvePrivateIpcPath(exact),
    { action, app: exact.app, input, type: "sidecar:invoke" },
    options,
  );
}

export async function stopSidecar(stamp: SidecarStamp, options: SidecarStopOptions = {}): Promise<SidecarStopResult> {
  const exact = normalizeSidecarStamp(stamp);
  return await retireObservedSidecarGeneration(
    await observeSidecarGeneration(exact, options.gracefulRequestTimeoutMs),
    options,
  );
}

/** Stop a logical resource set against one shared generation boundary. */
export async function stopSidecars(requests: readonly SidecarStopRequest[]): Promise<SidecarStopSetResult> {
  if (requests.length === 0) {
    return { ...emptyStopSetResult(), results: [] };
  }
  const normalized = new Map<string, SidecarStopRequest>();
  for (const request of requests) {
    const stamp = normalizeSidecarStamp(request.stamp);
    normalized.set(JSON.stringify(stamp), { options: request.options, stamp });
  }
  const unique = [...normalized.values()];
  const observations = await observeSidecarGenerations(
    unique.map(({ stamp }) => stamp),
    unique.map(({ options }) => options?.gracefulRequestTimeoutMs ?? 2_000),
  );
  const stopped = await retireObservedSidecarGenerations(observations.map((observation, index) => ({
    observation,
    options: unique[index]!.options,
  })));
  const results = stopped.map((result, index) => ({ result, stamp: unique[index]!.stamp }));
  const matchedPids = [...new Set(stopped.flatMap(({ matchedPids: pids }) => pids))];
  const remainingPids = [...new Set(stopped.flatMap(({ remainingPids: pids }) => pids))];
  const stoppedPids = [...new Set(stopped.flatMap(({ stoppedPids: pids }) => pids))];
  const forcedPids = [...new Set(stopped.flatMap(({ forcedPids: pids }) => pids))];
  return {
    alreadyStopped: stopped.every(({ alreadyStopped }) => alreadyStopped),
    forcedPids,
    gracefulAccepted: stopped.some(({ gracefulAccepted }) => gracefulAccepted),
    matchedPids,
    remainingPids,
    results,
    stoppedPids,
  };
}

function emptyStopSetResult(): SidecarStopResult {
  return {
    alreadyStopped: true,
    forcedPids: [],
    gracefulAccepted: false,
    matchedPids: [],
    remainingPids: [],
    stoppedPids: [],
  };
}

/**
 * Replace one exact five-field sidecar resource while preserving concrete OS
 * resources known by the prior generation. A requested non-zero port remains
 * authoritative; zero means dynamic and inherits a known concrete predecessor
 * port unless the caller explicitly asks for a fresh allocation.
 */
export async function restartSidecar(
  request: SidecarLaunchRequest,
  options: SidecarRestartOptions = {},
): Promise<SidecarRestartResult> {
  const stamp = normalizeSidecarStamp(request.stamp);
  return await serializeRestart(stamp, async () => await restartSidecarGeneration({ ...request, stamp }, options));
}

async function restartSidecarGeneration(
  request: SidecarLaunchRequest,
  options: SidecarRestartOptions,
): Promise<SidecarRestartResult> {
  const stamp = normalizeSidecarStamp(request.stamp);
  const inspected = await observeSidecarGeneration(stamp);
  const previous = inspected.description;
  const requestedPort = request.resources.port;
  const knownPort = previous?.resources.port ?? 0;
  if (options.requireConcretePort === true && requestedPort === 0 && knownPort === 0) {
    throw new Error("cannot restart sidecar without a concrete port");
  }
  const stop = await retireObservedSidecarGeneration(inspected, options.stop ?? {});
  if (stop.remainingPids.length > 0) {
    throw new Error(`cannot restart sidecar while prior generation remains: ${stop.remainingPids.join(", ")}`);
  }

  const replacements = (await captureSidecarGenerationSnapshot(stamp)).roots;
  if (replacements.length > 0) {
    throw new Error(`cannot restart sidecar because another generation appeared: ${replacements.map(({ pid }) => pid).join(", ")}`);
  }

  const reusedPort = options.reuseKnownPort !== false && requestedPort === 0 && knownPort > 0;
  const launched = await launchSidecar({
    ...request,
    resources: {
      ...request.resources,
      port: reusedPort ? knownPort : requestedPort,
    },
    stamp,
  });
  try {
    await waitForOwnedSidecarReady(stamp, launched.pid);
  } catch (error) {
    const cleanup = await retireKnownSidecarGeneration(sidecarGenerationRef(stamp, launched.pid), { termGraceMs: 0 });
    if (cleanup.remainingPids.length > 0) {
      throw new AggregateError(
        [error, new Error(`failed to retire rejected restart generation: ${cleanup.remainingPids.join(", ")}`)],
        "sidecar restart failed and cleanup was incomplete",
      );
    }
    throw error;
  }
  return { pid: launched.pid, reusedPort, stop };
}

async function serializeRestart<TResult>(stamp: SidecarStamp, operation: () => Promise<TResult>): Promise<TResult> {
  const key = JSON.stringify(normalizeSidecarStamp(stamp));
  const previous = restartTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => { release = resolve; });
  restartTails.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (restartTails.get(key) === tail) restartTails.delete(key);
  }
}

async function waitForOwnedSidecarReady(stamp: SidecarStamp, pid: number, timeoutMs = RESTART_READY_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const description = await describeSidecarGeneration(stamp);
    if (description?.resources.pid === pid && description.ready) return;
    if (description != null && description.resources.pid !== pid) {
      throw new Error(`sidecar restart lost endpoint ownership to pid ${description.resources.pid}`);
    }
    if (!isProcessAlive(pid)) throw new Error(`sidecar restart generation ${pid} exited before becoming ready`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`sidecar restart did not acquire endpoint ownership for pid ${pid}`);
}

async function waitForBootstrappedSidecarReady(stamp: SidecarStamp, pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let stableExisting: { pid: number; since: number } | null = null;
  while (Date.now() < deadline) {
    const description = await describeSidecarGeneration(stamp);
    if (description?.resources.pid === pid && description.ready) return;
    if (description?.ready === true && description.resources.pid !== pid && !isProcessAlive(pid)) {
      const observedExisting = stableExisting as { pid: number; since: number } | null;
      if (observedExisting == null || observedExisting.pid !== description.resources.pid) {
        stableExisting = { pid: description.resources.pid, since: Date.now() };
      } else if (Date.now() - observedExisting.since >= EXISTING_GENERATION_STABILITY_MS) {
        return;
      }
    } else {
      stableExisting = null;
    }
    if (!isProcessAlive(pid) && description == null) {
      throw new SidecarBootstrapGenerationRetiredError(pid);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`sidecar bootstrap did not leave a ready generation for pid ${pid}`);
}
