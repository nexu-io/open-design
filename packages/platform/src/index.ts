import { execFile, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

export type CommandInvocation = {
  args: string[];
  command: string;
};

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

export type CommandInvocationRequest = {
  args?: string[];
  command: string;
  env?: NodeJS.ProcessEnv;
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
};

export type StampedProcessMatchCriteria<TStamp extends ProcessStampShape> = Partial<TStamp>;

export type StopProcessesResult = {
  alreadyStopped: boolean;
  forcedPids: number[];
  matchedPids: number[];
  remainingPids: number[];
  stoppedPids: number[];
};

export type HttpWaitOptions = {
  timeoutMs?: number;
};

type WindowsProcessRecord = {
  CommandLine?: string | null;
  ParentProcessId?: number | string | null;
  ProcessId?: number | string | null;
};

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

function commandArgs(command: string): string[] {
  return command.trim().split(/\s+/).filter((part) => part.length > 0);
}

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

export function readProcessStampFromCommand<TStamp extends ProcessStampShape>(
  command: string,
  contract: ProcessStampContract<TStamp>,
): TStamp | null {
  return readProcessStamp(commandArgs(command), contract);
}

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

export function matchesStampedProcess<TStamp extends ProcessStampShape, TCriteria extends Partial<TStamp> = Partial<TStamp>>(
  processInfo: Pick<ProcessSnapshot, "command">,
  criteria: TCriteria | undefined,
  contract: ProcessStampContract<TStamp, TCriteria>,
): boolean {
  const stamp = readProcessStampFromCommand(processInfo.command, contract);
  return stamp != null && matchesProcessStamp(stamp, criteria, contract);
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function quoteWindowsCommandArg(value: string): string {
  if (!/[\s"&<>|^]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function createCommandInvocation({ args = [], command, env = process.env }: CommandInvocationRequest): CommandInvocation {
  if (process.platform === "win32" && /\.(bat|cmd)$/i.test(command)) {
    return {
      args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsCommandArg).join(" ")],
      command: env.ComSpec ?? process.env.ComSpec ?? "cmd.exe",
    };
  }
  return { args, command };
}

export function createPackageManagerInvocation(args: string[], env: NodeJS.ProcessEnv = process.env): CommandInvocation {
  const execPath = env.npm_execpath;
  if (execPath) return { args: [execPath, ...args], command: process.execPath };
  if (process.platform === "win32") {
    return {
      args: ["/d", "/s", "/c", ["pnpm", ...args].map(quoteWindowsCommandArg).join(" ")],
      command: env.ComSpec ?? process.env.ComSpec ?? "cmd.exe",
    };
  }
  return { args, command: "pnpm" };
}

function createLoggedStdio(logFd?: number | null): StdioOptions {
  return logFd == null ? ["ignore", "ignore", "ignore"] : ["ignore", logFd, logFd];
}

async function waitForChildSpawn(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    child.once("error", rejectSpawn);
    child.once("spawn", resolveSpawn);
  });
}

export async function spawnBackgroundProcess(request: SpawnProcessRequest): Promise<{ pid: number }> {
  const invocation = createCommandInvocation(request);
  const child = spawn(invocation.command, invocation.args, {
    cwd: request.cwd,
    detached: request.detached ?? true,
    env: request.env,
    stdio: createLoggedStdio(request.logFd),
    windowsHide: process.platform === "win32",
  });
  await waitForChildSpawn(child);
  if (child.pid == null) throw new Error(`failed to spawn background process: ${invocation.command}`);
  child.unref();
  return { pid: child.pid };
}

export async function spawnLoggedProcess(request: SpawnProcessRequest): Promise<ChildProcess> {
  const invocation = createCommandInvocation(request);
  const child = spawn(invocation.command, invocation.args, {
    cwd: request.cwd,
    detached: request.detached ?? false,
    env: request.env,
    stdio: createLoggedStdio(request.logFd),
    windowsHide: process.platform === "win32",
  });
  await waitForChildSpawn(child);
  if (child.pid == null) throw new Error(`failed to spawn process: ${invocation.command}`);
  return child;
}

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

export async function waitForProcessExit(pid: number | null | undefined, timeoutMs = 5000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) return true;
    await sleep(100);
  }
  return !isProcessAlive(pid);
}

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

async function listPosixProcessSnapshots(): Promise<ProcessSnapshot[]> {
  const stdout = await new Promise<string>((resolveList, rejectList) => {
    execFile("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
      if (error) rejectList(error);
      else resolveList(out);
    });
  });
  return parsePsOutput(stdout);
}

async function listWindowsProcessSnapshots(): Promise<ProcessSnapshot[]> {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CommandLine | ConvertTo-Json -Compress",
  ].join("; ");
  const stdout = await new Promise<string>((resolveList, rejectList) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
      if (error) rejectList(error);
      else resolveList(out);
    });
  });
  const payload = stdout.trim();
  if (!payload) return [];
  const records = JSON.parse(payload) as WindowsProcessRecord | WindowsProcessRecord[];
  return (Array.isArray(records) ? records : [records])
    .map((record) => {
      const pid = Number(record.ProcessId);
      const ppid = Number(record.ParentProcessId);
      const commandLine = record.CommandLine?.trim();
      if (!commandLine || Number.isNaN(pid) || Number.isNaN(ppid)) return null;
      return { command: commandLine, pid, ppid };
    })
    .filter((snapshot): snapshot is ProcessSnapshot => snapshot != null);
}

export async function listProcessSnapshots(): Promise<ProcessSnapshot[]> {
  try {
    return process.platform === "win32"
      ? await listWindowsProcessSnapshots()
      : await listPosixProcessSnapshots();
  } catch {
    return [];
  }
}

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

function signalProcesses(pids: number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (errorCode(error) !== "ESRCH") throw error;
    }
  }
}

async function waitForProcessesToExit(pids: number[], timeoutMs = 5000): Promise<number[]> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const remaining = pids.filter(isProcessAlive);
    if (remaining.length === 0) return [];
    await sleep(100);
  }
  return pids.filter(isProcessAlive);
}

export async function stopProcesses(pids: Array<number | null | undefined>): Promise<StopProcessesResult> {
  const uniquePids = [...new Set(pids)]
    .filter((pid): pid is number => typeof pid === "number" && pid !== process.pid)
    .sort((left, right) => right - left);
  if (uniquePids.length === 0) {
    return { alreadyStopped: true, forcedPids: [], matchedPids: [], remainingPids: [], stoppedPids: [] };
  }
  signalProcesses(uniquePids, "SIGTERM");
  const remainingAfterTerm = await waitForProcessesToExit(uniquePids);
  if (remainingAfterTerm.length === 0) {
    return { alreadyStopped: false, forcedPids: [], matchedPids: uniquePids, remainingPids: [], stoppedPids: uniquePids };
  }
  signalProcesses(remainingAfterTerm, "SIGKILL");
  const remainingAfterKill = await waitForProcessesToExit(remainingAfterTerm);
  const stoppedPids = uniquePids.filter((pid) => !remainingAfterKill.includes(pid));
  return { alreadyStopped: false, forcedPids: remainingAfterTerm, matchedPids: uniquePids, remainingPids: remainingAfterKill, stoppedPids };
}

export async function waitForHttpOk(url: string, { timeoutMs = 20000 }: HttpWaitOptions = {}): Promise<true> {
  const startedAt = Date.now();
  let lastError: Error | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return true;
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = new Error(errorMessage(error));
    }
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${url}${lastError ? ` (${lastError.message})` : ""}`);
}

export async function readLogTail(filePath: string, maxLines = 80): Promise<string[]> {
  try {
    const payload = await readFile(filePath, "utf8");
    return payload.split(/\r?\n/).filter((line) => line.length > 0).slice(-maxLines);
  } catch {
    return [];
  }
}
