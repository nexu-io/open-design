/**
 * @module process
 *
 * OS process lifecycle and stamp primitives: encode/decode `--flag=value`
 * process stamps and match them against a contract, spawn background and logged
 * child processes, probe liveness, enumerate process snapshots (POSIX `ps` /
 * Windows `Get-CimInstance`), walk a process tree, and stop a set of PIDs with
 * SIGTERM-then-SIGKILL escalation.
 *
 * Depends on the `command` module for invocation construction; keeps a private
 * `errorCode` copy so it owns no cross-module runtime surface.
 */
import { execFile, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { posix, win32 } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { createCommandInvocation, type CommandInvocationRequest } from "./command.js";

/** Opt-in query budget; existing snapshot callers retain their current defaults. */
export type ProcessSnapshotOptions = { timeoutMs?: number };

function snapshotBudget(options: ProcessSnapshotOptions): { timeout?: number; killSignal?: "SIGKILL" } {
  if (options.timeoutMs === undefined) return {};
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new RangeError("Process snapshot timeout must be a positive integer");
  }
  return { timeout: options.timeoutMs, killSignal: "SIGKILL" };
}

export type ProcessStampShape = object;

export type ProcessStampField<TStamp extends ProcessStampShape> = Extract<keyof TStamp, string>;

export type ProcessStampContract<
  TStamp extends ProcessStampShape,
  TCriteria extends Partial<TStamp> = Partial<TStamp>,
> = {
  normalizeStamp(input: unknown): TStamp;
  normalizeStampCriteria(input?: unknown): TCriteria;
  stampFields: readonly ProcessStampField<TStamp>[];
  stampFlags: { readonly [K in ProcessStampField<TStamp>]: string };
};

export type SpawnProcessRequest = CommandInvocationRequest & {
  cwd?: string;
  detached?: boolean;
  logFd?: number | null;
};

export type ProcessSnapshot = {
  command: string;
  pid: number;
  ppid: number;
  /** OS-reported process creation time when the enumeration backend can provide it. */
  startedAtMs?: number;
};

export type StampedProcessInvocationSnapshot = {
  matches: ProcessSnapshot[];
  processes: ProcessSnapshot[];
  roots: ProcessSnapshot[];
};

export type StampedProcessSetInvocationSnapshot<TCriteria> = {
  entries: Array<StampedProcessInvocationSnapshot & { criteria: TCriteria }>;
  processes: ProcessSnapshot[];
};

export type StampedProcessMatchCriteria<TStamp extends ProcessStampShape> = Partial<TStamp>;

export type StopProcessesResult = {
  alreadyStopped: boolean;
  forcedPids: number[];
  matchedPids: number[];
  remainingPids: number[];
  stoppedPids: number[];
};

export type StopProcessesOptions = {
  /** Grace after SIGTERM before SIGKILL escalation. Defaults to 5 seconds. */
  termGraceMs?: number;
  /** Wait after SIGKILL before reporting any survivors. Defaults to 5 seconds. */
  killGraceMs?: number;
};

function normalizedGraceMs(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function normalizeExecutablePath(path: string, platform: NodeJS.Platform): string {
  const normalized = platform === "win32" ? win32.normalize(path) : posix.normalize(path);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * Test whether a process command line contains only the given executable path.
 * Windows process enumeration may wrap a no-argument executable in quotes;
 * commands with arguments are deliberately rejected on every platform.
 */
export function processCommandExactlyRunsExecutable(
  command: string,
  executablePath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const trimmed = command.trim();
  if (normalizeExecutablePath(trimmed, platform) === normalizeExecutablePath(executablePath, platform)) {
    return true;
  }
  if (platform !== "win32" || trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return false;
  }
  return normalizeExecutablePath(trimmed.slice(1, -1), platform) === normalizeExecutablePath(executablePath, platform);
}

type WindowsProcessRecord = {
  CommandLine?: string | null;
  ParentProcessId?: number | string | null;
  ProcessId?: number | string | null;
  StartedAtMs?: number | string | null;
};

/** @internal Extract a Node `error.code` as a string, or `null` when the value carries no code. */
function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

/**
 * Serialize a process stamp into `--flag=value` CLI arguments per the contract.
 * Every stamp field must normalize to a string or an error is thrown.
 *
 * @param stamp - The stamp object to encode.
 * @param contract - The stamp contract providing field list, flags, and normalization.
 * @returns The `--flag=value` argument strings, one per stamp field.
 */
export function createProcessStampArgs<TStamp extends ProcessStampShape>(
  stamp: TStamp,
  contract: ProcessStampContract<TStamp>,
): string[] {
  const normalized = contract.normalizeStamp(stamp);
  return contract.stampFields.map((field) => {
    const value = normalized[field];
    if (typeof value !== "string") {
      throw new Error(`process stamp field ${field} must normalize to a string`);
    }
    return `${contract.stampFlags[field]}=${value}`;
  });
}

/** @internal Split a command line string into whitespace-separated argument tokens. */
function commandArgs(command: string): string[] {
  return command.trim().split(/\s+/).filter((part) => part.length > 0);
}

/**
 * Read the value of a CLI flag from an argument list, supporting both the
 * `--flag value` and inline `--flag=value` forms.
 *
 * @param args - The argument list to search.
 * @param flagName - The flag name (including any leading dashes).
 * @returns The flag's value, or `null` when the flag is absent.
 */
export function readFlagValue(args: readonly string[], flagName: string): string | null {
  const inlinePrefix = `${flagName}=`;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === flagName) return args[index + 1] ?? null;
    if (typeof argument === "string" && argument.startsWith(inlinePrefix)) {
      return argument.slice(inlinePrefix.length);
    }
  }
  return null;
}

/**
 * Decode a process stamp from a raw argument list per the contract, returning
 * `null` when normalization fails (e.g. a required field is missing).
 *
 * @param args - The process argument list to read stamp flags from.
 * @param contract - The stamp contract providing field list, flags, and normalization.
 * @returns The decoded stamp, or `null` when it cannot be normalized.
 */
export function readProcessStamp<TStamp extends ProcessStampShape>(
  args: readonly string[],
  contract: ProcessStampContract<TStamp>,
): TStamp | null {
  try {
    const input = Object.fromEntries(
      contract.stampFields.map((field) => [field, readFlagValue(args, contract.stampFlags[field])]),
    );
    return contract.normalizeStamp(input);
  } catch {
    return null;
  }
}

/**
 * Decode a process stamp from a full command-line string by tokenizing it first.
 *
 * @param command - The full command line to read stamp flags from.
 * @param contract - The stamp contract providing field list, flags, and normalization.
 * @returns The decoded stamp, or `null` when it cannot be normalized.
 */
export function readProcessStampFromCommand<TStamp extends ProcessStampShape>(
  command: string,
  contract: ProcessStampContract<TStamp>,
): TStamp | null {
  return readProcessStamp(commandArgs(command), contract);
}

/**
 * Test whether a stamp matches criteria: every criterion field that is set must
 * equal the corresponding normalized stamp field; unset criteria fields match
 * anything.
 *
 * @param stamp - The stamp to test.
 * @param criteria - The partial criteria to match against (undefined matches all).
 * @param contract - The stamp contract providing field list and normalization.
 * @returns `true` when every specified criterion matches the stamp.
 */
export function matchesProcessStamp<TStamp extends ProcessStampShape, TCriteria extends Partial<TStamp> = Partial<TStamp>>(
  stamp: TStamp,
  criteria: TCriteria | undefined,
  contract: ProcessStampContract<TStamp, TCriteria>,
): boolean {
  const normalizedStamp = contract.normalizeStamp(stamp);
  const normalizedCriteria = contract.normalizeStampCriteria(criteria ?? {});
  return contract.stampFields.every((field) => {
    const expected = normalizedCriteria[field as keyof TCriteria];
    return expected == null || normalizedStamp[field] === expected;
  });
}

/**
 * Test whether a process snapshot's command line carries a stamp matching the
 * criteria. Combines stamp decoding from the command with `matchesProcessStamp`.
 *
 * @param processInfo - A snapshot exposing at least the `command` string.
 * @param criteria - The partial criteria to match against (undefined matches all).
 * @param contract - The stamp contract providing field list and normalization.
 * @returns `true` when the command carries a decodable stamp that matches.
 */
export function matchesStampedProcess<TStamp extends ProcessStampShape, TCriteria extends Partial<TStamp> = Partial<TStamp>>(
  processInfo: Pick<ProcessSnapshot, "command">,
  criteria: TCriteria | undefined,
  contract: ProcessStampContract<TStamp, TCriteria>,
): boolean {
  const stamp = readProcessStampFromCommand(processInfo.command, contract);
  return stamp != null && matchesProcessStamp(stamp, criteria, contract);
}

/** @internal Build the stdio triple for a spawned process, routing stdout/stderr to a log fd when provided. */
function createLoggedStdio(logFd?: number | null): StdioOptions {
  return logFd == null ? ["ignore", "ignore", "ignore"] : ["ignore", logFd, logFd];
}

/** @internal Resolve once the child emits `spawn`, or reject on the child's `error` event. */
async function waitForChildSpawn(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    child.once("error", rejectSpawn);
    child.once("spawn", resolveSpawn);
  });
}

/**
 * Spawn a detached background process, wait for it to actually start, then
 * `unref` it so the parent can exit independently.
 *
 * @param request - The command/args/env plus cwd, detached, and log-fd options.
 * @returns The spawned child's `{ pid }`.
 * @throws If the child fails to spawn or reports no pid.
 */
export async function spawnBackgroundProcess(request: SpawnProcessRequest): Promise<{ pid: number }> {
  const invocation = createCommandInvocation(request);
  const child = spawn(invocation.command, invocation.args, {
    cwd: request.cwd,
    detached: request.detached ?? true,
    env: request.env,
    stdio: createLoggedStdio(request.logFd),
    windowsHide: process.platform === "win32",
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
  await waitForChildSpawn(child);
  if (child.pid == null) throw new Error(`failed to spawn background process: ${invocation.command}`);
  child.unref();
  return { pid: child.pid };
}

/**
 * Spawn a (by default non-detached) child process with stdout/stderr routed to
 * an optional log fd, waiting for it to start before returning the handle.
 *
 * @param request - The command/args/env plus cwd, detached, and log-fd options.
 * @returns The live `ChildProcess` handle.
 * @throws If the child fails to spawn or reports no pid.
 */
export async function spawnLoggedProcess(request: SpawnProcessRequest): Promise<ChildProcess> {
  const invocation = createCommandInvocation(request);
  const child = spawn(invocation.command, invocation.args, {
    cwd: request.cwd,
    detached: request.detached ?? false,
    env: request.env,
    stdio: createLoggedStdio(request.logFd),
    windowsHide: process.platform === "win32",
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
  await waitForChildSpawn(child);
  if (child.pid == null) throw new Error(`failed to spawn process: ${invocation.command}`);
  return child;
}

/**
 * Probe whether a process is alive via a signal-0 `process.kill`. Treats
 * `ESRCH` as dead and any other error (e.g. `EPERM`) as alive.
 *
 * @param pid - The PID to probe (non-number values are treated as dead).
 * @returns `true` when the process appears to exist.
 */
export function isProcessAlive(pid: number | null | undefined): boolean {
  if (typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (errorCode(error) === "ESRCH") return false;
    return true;
  }
}

/**
 * Poll until a process exits or the timeout elapses.
 *
 * @param pid - The PID to wait on.
 * @param timeoutMs - Maximum time to wait, in milliseconds (default 5000).
 * @returns `true` if the process is gone by the deadline, otherwise `false`.
 */
export async function waitForProcessExit(pid: number | null | undefined, timeoutMs = 5000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) return true;
    await sleep(100);
  }
  return !isProcessAlive(pid);
}

/** @internal Parse `ps -axo pid=,ppid=,command=` output into process snapshots. */
function parsePsOutput(stdout: string): ProcessSnapshot[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;
      return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] };
    })
    .filter((snapshot): snapshot is ProcessSnapshot => snapshot != null);
}

/** @internal Enumerate process snapshots on POSIX via `ps`. */
async function listPosixProcessSnapshots(options: ProcessSnapshotOptions = {}): Promise<ProcessSnapshot[]> {
  const stdout = await new Promise<string>((resolveList, rejectList) => {
    execFile("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...snapshotBudget(options) }, (error, out) => {
      if (error) rejectList(error);
      else resolveList(out);
    });
  });
  return parsePsOutput(stdout);
}

/** @internal Enumerate process snapshots on Windows via `Get-CimInstance Win32_Process` JSON. */
async function listWindowsProcessSnapshots(options: ProcessSnapshotOptions = {}): Promise<ProcessSnapshot[]> {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CommandLine, @{Name='StartedAtMs';Expression={([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}} | ConvertTo-Json -Compress",
  ].join("; ");
  const stdout = await new Promise<string>((resolveList, rejectList) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...snapshotBudget(options) }, (error, out) => {
      if (error) rejectList(error);
      else resolveList(out);
    });
  });
  return parseWindowsProcessSnapshots(stdout);
}

/** Capture exact PIDs without paying Windows' full Win32_Process enumeration cost. */
export async function captureProcessSnapshotsByPids(pids: readonly number[]): Promise<ProcessSnapshot[]> {
  const exactPids = [...new Set(pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
  if (exactPids.length === 0) return [];
  if (process.platform !== "win32") {
    const wanted = new Set(exactPids);
    return (await captureProcessSnapshot()).filter(({ pid }) => wanted.has(pid));
  }
  const filter = exactPids.map((pid) => `ProcessId = ${pid}`).join(" OR ");
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `Get-CimInstance Win32_Process -Filter \"${filter}\" | Select-Object ProcessId, ParentProcessId, CommandLine, @{Name='StartedAtMs';Expression={([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}} | ConvertTo-Json -Compress`,
  ].join("; ");
  const stdout = await new Promise<string>((resolveList, rejectList) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", maxBuffer: 1024 * 1024 }, (error, out) => {
      if (error) rejectList(error);
      else resolveList(out);
    });
  });
  return parseWindowsProcessSnapshots(stdout);
}

/** @internal Parse the JSON emitted by the Windows process enumeration command. */
export function parseWindowsProcessSnapshots(stdout: string): ProcessSnapshot[] {
  const payload = stdout.trim();
  if (!payload) return [];
  const records = JSON.parse(payload) as WindowsProcessRecord | WindowsProcessRecord[];
  return (Array.isArray(records) ? records : [records])
    .map((record) => {
      const pid = Number(record.ProcessId);
      const ppid = Number(record.ParentProcessId);
      const startedAtMs = Number(record.StartedAtMs);
      const commandLine = record.CommandLine?.trim();
      if (!commandLine || Number.isNaN(pid) || Number.isNaN(ppid)) return null;
      return {
        command: commandLine,
        pid,
        ppid,
        ...(Number.isSafeInteger(startedAtMs) && startedAtMs > 0 ? { startedAtMs } : {}),
      };
    })
    .filter((snapshot): snapshot is ProcessSnapshot => snapshot != null);
}

/**
 * Capture the current process table without converting backend failure into an
 * empty snapshot. Mutation paths use this strict form so discovery failure can
 * never be mistaken for an already-stopped process set.
 */
export async function captureProcessSnapshot(options: ProcessSnapshotOptions = {}): Promise<ProcessSnapshot[]> {
  return process.platform === "win32"
    ? await listWindowsProcessSnapshots(options)
    : await listPosixProcessSnapshots(options);
}

/**
 * Enumerate all running processes as `{ pid, ppid, command }` snapshots, using
 * the platform-appropriate backend. Returns an empty list on any failure.
 *
 * @returns The current process snapshots (empty on error).
 */
export async function listProcessSnapshots(): Promise<ProcessSnapshot[]> {
  try {
    return await captureProcessSnapshot();
  } catch {
    return [];
  }
}

/**
 * Select stamped processes that unambiguously existed before an operation's
 * invocation boundary. Windows process enumeration is asynchronous, so its
 * results are fenced by the OS creation time. A matching record exactly on the
 * boundary, or without a creation time, is deliberately rejected instead of
 * risking that a newer generation is terminated.
 *
 * @internal Exported from this module for deterministic boundary tests; the
 * package barrel exposes only `captureStampedProcessSnapshot`.
 */
export function selectStampedProcessesAtInvocation<
  TStamp extends ProcessStampShape,
  TCriteria extends Partial<TStamp> = Partial<TStamp>,
>(
  snapshots: ProcessSnapshot[],
  criteria: TCriteria | undefined,
  contract: ProcessStampContract<TStamp, TCriteria>,
  invokedAtMs: number,
  platform: NodeJS.Platform = process.platform,
): ProcessSnapshot[] {
  const matches = snapshots.filter((snapshot) => matchesStampedProcess(snapshot, criteria, contract));
  if (platform !== "win32") return matches;
  return matches.filter((snapshot) => {
    if (snapshot.startedAtMs == null || snapshot.startedAtMs === invokedAtMs) {
      throw new Error(`cannot establish process generation boundary for pid ${snapshot.pid}`);
    }
    if (snapshot.startedAtMs > invokedAtMs) return false;
    return snapshot.startedAtMs < invokedAtMs;
  });
}

/**
 * Capture the process table and argv-stamped roots that safely belonged to the
 * generation visible when this call began. Unlike `listProcessSnapshots`,
 * enumeration and boundary failures are surfaced so lifecycle callers can
 * quick-fail instead of reporting a false `alreadyStopped` result.
 */
export async function captureStampedProcessSnapshot<
  TStamp extends ProcessStampShape,
  TCriteria extends Partial<TStamp> = Partial<TStamp>,
>(
  criteria: TCriteria | undefined,
  contract: ProcessStampContract<TStamp, TCriteria>,
): Promise<StampedProcessInvocationSnapshot> {
  const invokedAtMs = Date.now();
  const processes = await captureProcessSnapshot();
  const matches = selectStampedProcessesAtInvocation(processes, criteria, contract, invokedAtMs);
  const matchedPids = new Set(matches.map(({ pid }) => pid));
  return {
    matches,
    processes,
    roots: matches.filter(({ ppid }) => !matchedPids.has(ppid)),
  };
}

/**
 * Capture one invocation-fenced process table for several stamp criteria.
 * Lifecycle operations use this form when a logical resource spans multiple
 * stamped generations: every member is observed at the same boundary and a
 * slow platform backend (notably Windows CIM) is paid only once.
 */
export async function captureStampedProcessSetSnapshot<
  TStamp extends ProcessStampShape,
  TCriteria extends Partial<TStamp> = Partial<TStamp>,
>(
  criteriaSet: readonly TCriteria[],
  contract: ProcessStampContract<TStamp, TCriteria>,
): Promise<StampedProcessSetInvocationSnapshot<TCriteria>> {
  const invokedAtMs = Date.now();
  const processes = process.platform === "win32"
    ? await captureWindowsStampedProcessTrees(criteriaSet, contract)
    : await captureProcessSnapshot();
  return {
    entries: criteriaSet.map((criteria) => {
      const matches = selectStampedProcessesAtInvocation(
        processes,
        criteria,
        contract,
        invokedAtMs,
      );
      const matchedPids = new Set(matches.map(({ pid }) => pid));
      return {
        criteria,
        matches,
        processes,
        roots: matches.filter(({ ppid }) => !matchedPids.has(ppid)),
      };
    }),
    processes,
  };
}

/** Query stamped Windows roots and only their descendant trees in one shell. */
async function captureWindowsStampedProcessTrees<
  TStamp extends ProcessStampShape,
  TCriteria extends Partial<TStamp>,
>(
  criteriaSet: readonly TCriteria[],
  contract: ProcessStampContract<TStamp, TCriteria>,
): Promise<ProcessSnapshot[]> {
  if (criteriaSet.length === 0) return [];
  const clauses = criteriaSet.map((criteria) => {
    const normalized = contract.normalizeStampCriteria(criteria);
    const fields = contract.stampFields.flatMap((field) => {
      const value = normalized[field];
      if (typeof value !== "string") return [];
      const needle = `${contract.stampFlags[field]}=${value}`.replaceAll("'", "''");
      return [`CommandLine LIKE '%${needle}%'`];
    });
    return fields.length === 0 ? "CommandLine IS NOT NULL" : `(${fields.join(" AND ")})`;
  });
  const rootFilter = [...new Set(clauses)].join(" OR ");
  const powershellRootFilter = `'${rootFilter.replaceAll("'", "''")}'`;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `$roots = @(Get-CimInstance Win32_Process -Filter ${powershellRootFilter})`,
    "$all = [System.Collections.Generic.List[object]]::new()",
    "$seen = @{}",
    "$frontier = [System.Collections.Generic.List[int]]::new()",
    "foreach ($process in $roots) { $pidValue = [int]$process.ProcessId; if (-not $seen.ContainsKey($pidValue)) { $seen[$pidValue] = $true; $all.Add($process); $frontier.Add($pidValue) } }",
    "while ($frontier.Count -gt 0) {",
    "  $childFilter = (($frontier | ForEach-Object { \"ParentProcessId = $_\" }) -join ' OR ')",
    "  $frontier = [System.Collections.Generic.List[int]]::new()",
    "  $children = @(Get-CimInstance Win32_Process -Filter $childFilter)",
    "  foreach ($process in $children) { $pidValue = [int]$process.ProcessId; if (-not $seen.ContainsKey($pidValue)) { $seen[$pidValue] = $true; $all.Add($process); $frontier.Add($pidValue) } }",
    "}",
    "$all | Select-Object ProcessId, ParentProcessId, CommandLine, @{Name='StartedAtMs';Expression={([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}} | ConvertTo-Json -Compress",
  ].join("; ");
  const stdout = await new Promise<string>((resolveList, rejectList) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
      if (error) rejectList(error);
      else resolveList(out);
    });
  });
  return parseWindowsProcessSnapshots(stdout);
}

/**
 * Collect the transitive set of descendant PIDs (including the roots) from a
 * process snapshot list, returned sorted descending so children precede parents.
 *
 * @param processes - The full process snapshot list to walk.
 * @param rootPids - The root PIDs whose subtrees to collect (non-numbers ignored).
 * @returns The unique PIDs of the roots and all their descendants, descending.
 */
export function collectProcessTreePids(
  processes: ProcessSnapshot[],
  rootPids: Array<number | null | undefined>,
): number[] {
  const queue = [...new Set(rootPids.filter((pid): pid is number => typeof pid === "number"))];
  const visited = new Set<number>();
  const childrenByParent = new Map<number, number[]>();
  for (const processInfo of processes) {
    const children = childrenByParent.get(processInfo.ppid) ?? [];
    children.push(processInfo.pid);
    childrenByParent.set(processInfo.ppid, children);
  }
  while (queue.length > 0) {
    const pid = queue.shift();
    if (pid == null || visited.has(pid)) continue;
    visited.add(pid);
    for (const childPid of childrenByParent.get(pid) ?? []) {
      if (!visited.has(childPid)) queue.push(childPid);
    }
  }
  return [...visited].sort((left, right) => right - left);
}

/**
 * Revalidate known Windows process generations before extending their tree.
 * The caller supplies identities captured while its owned child was alive;
 * this function never upgrades a bare root PID into an ownership proof.
 */
export function selectOwnedProcessTree(known: ProcessSnapshot[], current: ProcessSnapshot[]): ProcessSnapshot[] {
  const validTime = (value: number | undefined): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  const currentByPid = new Map(current.map(entry => [entry.pid, entry]));
  const selected = new Map<number, ProcessSnapshot>();
  const queue = known.flatMap(entry => {
    const live = currentByPid.get(entry.pid);
    return live && validTime(entry.startedAtMs) && live.startedAtMs === entry.startedAtMs ? [live] : [];
  });
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index]!;
    if (selected.has(parent.pid)) continue;
    selected.set(parent.pid, parent);
    queue.push(...current.filter(entry => entry.ppid === parent.pid
      && validTime(entry.startedAtMs) && entry.startedAtMs >= parent.startedAtMs!));
  }
  return [...selected.values()];
}

/**
 * OS identity of one live process: enough to tell "the process we started"
 * apart from an unrelated process that later received the same PID.
 */
export type ProcessIdentity = {
  pid: number;
  ppid: number;
  /** POSIX process group id; `null` where the platform has no process groups. */
  processGroupId: number | null;
  /** OS-reported creation time in ms since the epoch, when the backend reports one. */
  startedAtMs: number | null;
  /** Granularity of `startedAtMs`: POSIX `ps lstart` reports whole seconds. */
  startedAtResolutionMs: number;
  command: string;
};

const LSTART_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * @internal Parse `LC_ALL=C ps -o pid=,ppid=,pgid=,lstart=,command=` output.
 * `lstart` is the C-locale `Www Mmm dd hh:mm:ss yyyy` form in the local zone,
 * which is the zone this process shares with `ps`.
 */
export function parsePosixProcessIdentities(stdout: string): ProcessIdentity[] {
  const identities: ProcessIdentity[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(\d+)\s+(\d+)\s+(\d+)\s+[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(\d{4})\s*(.*)$/,
    );
    if (!match) continue;
    const month = LSTART_MONTHS.indexOf(match[4]!);
    const startedAtMs = month < 0
      ? Number.NaN
      : new Date(
        Number(match[9]),
        month,
        Number(match[5]),
        Number(match[6]),
        Number(match[7]),
        Number(match[8]),
      ).getTime();
    identities.push({
      command: (match[10] ?? "").trim(),
      pid: Number(match[1]),
      ppid: Number(match[2]),
      processGroupId: Number(match[3]),
      startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : null,
      startedAtResolutionMs: 1000,
    });
  }
  return identities;
}

/**
 * Read the OS identity (creation time, and process group on POSIX) of the given
 * PIDs. PIDs that do not exist are absent from the result; a backend failure
 * throws. Callers that must never mistake "could not look" for "not there"
 * should probe liveness with `isProcessAlive` first and treat a live PID that
 * is missing here as unverifiable, not as gone.
 */
export async function readProcessIdentities(pids: readonly number[]): Promise<Map<number, ProcessIdentity>> {
  const exactPids = [...new Set(pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
  const result = new Map<number, ProcessIdentity>();
  if (exactPids.length === 0) return result;
  if (process.platform === "win32") {
    for (const snapshot of await captureProcessSnapshotsByPids(exactPids)) {
      result.set(snapshot.pid, {
        command: snapshot.command,
        pid: snapshot.pid,
        ppid: snapshot.ppid,
        processGroupId: null,
        startedAtMs: snapshot.startedAtMs ?? null,
        startedAtResolutionMs: 1,
      });
    }
    return result;
  }
  const stdout = await new Promise<string>((resolveList, rejectList) => {
    execFile(
      "ps",
      ["-o", "pid=,ppid=,pgid=,lstart=,command=", "-p", exactPids.join(",")],
      { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, maxBuffer: 8 * 1024 * 1024 },
      (error, out, err) => {
        if (!error || out.length > 0) {
          resolveList(out);
          return;
        }
        // `ps -p` exits 1 silently when none of the PIDs exist; that is an
        // answer. Exit 1 WITH a complaint (unsupported column, bad PID list) is
        // a backend failure and must not read as "none of them exist".
        if ((error as { code?: unknown }).code === 1 && err.trim().length === 0) {
          resolveList("");
          return;
        }
        rejectList(error);
      },
    );
  });
  const wanted = new Set(exactPids);
  for (const identity of parsePosixProcessIdentities(stdout)) {
    if (wanted.has(identity.pid)) result.set(identity.pid, identity);
  }
  return result;
}

/**
 * Probe whether any member of a POSIX process group is alive. Always `false`
 * on Windows, which has no process groups.
 */
export function isProcessGroupAlive(processGroupId: number | null | undefined): boolean {
  if (process.platform === "win32" || typeof processGroupId !== "number" || !Number.isSafeInteger(processGroupId) || processGroupId <= 0) {
    return false;
  }
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

export type TerminateProcessGroupResult = {
  /** The group was already empty before any signal was sent. */
  alreadyStopped: boolean;
  /** SIGKILL was needed because members survived the SIGTERM grace. */
  forced: boolean;
  /** Members were still alive after the SIGKILL grace. */
  survived: boolean;
};

/**
 * Terminate a whole POSIX process group: SIGTERM, wait for the group to empty,
 * then SIGKILL whatever is left. Signalling the group (not a PID list) also
 * catches members created after the call began. No-op on Windows.
 */
export async function terminateProcessGroup(
  processGroupId: number,
  options: StopProcessesOptions = {},
): Promise<TerminateProcessGroupResult> {
  if (!isProcessGroupAlive(processGroupId)) {
    return { alreadyStopped: true, forced: false, survived: false };
  }
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-processGroupId, signal);
    } catch {
      // ESRCH: the group emptied between the probe and the signal.
    }
  };
  const waitForGroupExit = async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isProcessGroupAlive(processGroupId)) return true;
      await sleep(25);
    }
    return !isProcessGroupAlive(processGroupId);
  };
  signalGroup("SIGTERM");
  if (await waitForGroupExit(normalizedGraceMs(options.termGraceMs) ?? 5000)) {
    return { alreadyStopped: false, forced: false, survived: false };
  }
  signalGroup("SIGKILL");
  const gone = await waitForGroupExit(normalizedGraceMs(options.killGraceMs) ?? 5000);
  return { alreadyStopped: false, forced: true, survived: !gone };
}

/** Send a signal to each PID, ignoring `ESRCH` (already-dead) but rethrowing other errors. */
export function signalProcesses(pids: number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (errorCode(error) !== "ESRCH") throw error;
    }
  }
}

/** @internal Poll until all PIDs exit or the timeout elapses; returns the PIDs still alive. */
async function waitForProcessesToExit(pids: number[], timeoutMs = 5000): Promise<number[]> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const remaining = pids.filter(isProcessAlive);
    if (remaining.length === 0) return [];
    await sleep(100);
  }
  return pids.filter(isProcessAlive);
}

/**
 * Stop a set of PIDs with escalation: SIGTERM, wait, then SIGKILL any
 * survivors. Excludes the current process and de-duplicates the input.
 *
 * @param pids - The PIDs to stop (non-numbers and the current PID are ignored).
 * @returns A result describing matched, stopped, force-killed, and remaining PIDs.
 */
export async function stopProcesses(
  pids: Array<number | null | undefined>,
  options: StopProcessesOptions = {},
): Promise<StopProcessesResult> {
  const uniquePids = [...new Set(pids)]
    .filter((pid): pid is number => typeof pid === "number" && pid !== process.pid)
    .sort((left, right) => right - left);
  if (uniquePids.length === 0) {
    return { alreadyStopped: true, forcedPids: [], matchedPids: [], remainingPids: [], stoppedPids: [] };
  }
  signalProcesses(uniquePids, "SIGTERM");
  const remainingAfterTerm = await waitForProcessesToExit(
    uniquePids,
    normalizedGraceMs(options.termGraceMs),
  );
  if (remainingAfterTerm.length === 0) {
    return { alreadyStopped: false, forcedPids: [], matchedPids: uniquePids, remainingPids: [], stoppedPids: uniquePids };
  }
  signalProcesses(remainingAfterTerm, "SIGKILL");
  const remainingAfterKill = await waitForProcessesToExit(
    remainingAfterTerm,
    normalizedGraceMs(options.killGraceMs),
  );
  const stoppedPids = uniquePids.filter((pid) => !remainingAfterKill.includes(pid));
  return { alreadyStopped: false, forcedPids: remainingAfterTerm, matchedPids: uniquePids, remainingPids: remainingAfterKill, stoppedPids };
}
