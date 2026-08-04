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

export type WindowsJobSpawnRequest = SpawnProcessRequest & {
  stdio: StdioOptions;
};

export type ProcessSnapshot = {
  command: string;
  /** Process creation time in epoch milliseconds when the platform can provide it. */
  createdAt?: number | null;
  pid: number;
  ppid: number;
};

/** Stable-enough identity for a daemon-owned process tree. */
export type OwnedProcessIdentity = {
  pid: number;
  /** Required on Windows so a recycled PID cannot be mistaken for our child. */
  createdAt: number | null;
  /**
   * A Windows job is created before this runtime is resumed. Its
   * kill-on-close policy is the authoritative ownership boundary for every
   * process the runtime subsequently creates.
   */
  ownership?: "windows-job";
};

export type ProcessTreeTerminationResult = {
  attempted: boolean;
  childTreeQuiescent: boolean;
  forced: boolean;
  identityVerified: boolean;
  remainingPids: number[];
};

/**
 * The outcome of reading the process table. An observation failure must remain
 * distinct from a successfully observed empty table: callers that verify
 * process termination may only treat the latter as evidence of quiescence.
 */
export type ProcessSnapshotObservation =
  | { ok: true; processes: ProcessSnapshot[] }
  | { ok: false; processes: [] };

export type StampedProcessMatchCriteria<TStamp extends ProcessStampShape> = Partial<TStamp>;

export type StopProcessesResult = {
  alreadyStopped: boolean;
  forcedPids: number[];
  matchedPids: number[];
  remainingPids: number[];
  stoppedPids: number[];
};

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
  CreationDate?: string | null;
  ParentProcessId?: number | string | null;
  ProcessId?: number | string | null;
};

function parseProcessCreationDate(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const jsonDate = trimmed.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/);
  if (jsonDate) {
    const parsed = Number(jsonDate[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Win32_Process.CreationDate is DMTF datetime (`YYYYMMDDHHmmss.ffffff+ZZZ`),
  // which Date.parse intentionally does not understand.
  const dmtf = trimmed.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{6})([+-])(\d{3})$/);
  if (dmtf) {
    const [, year, month, day, hour, minute, second, microseconds, sign, offset] = dmtf;
    const localUtcMs = Date.UTC(
      Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second),
      Math.floor(Number(microseconds) / 1000),
    );
    const offsetMs = Number(offset) * 60_000 * (sign === "+" ? 1 : -1);
    return Number.isFinite(localUtcMs) ? localUtcMs - offsetMs : null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

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

function quoteWindowsCreateProcessArgument(value: string): string {
  if (value.length > 0 && !/[\s"]/u.test(value)) return value;
  let quoted = '"';
  let backslashes = 0;
  for (const character of value) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      quoted += "\\".repeat((backslashes * 2) + 1);
      quoted += '"';
      backslashes = 0;
      continue;
    }
    quoted += "\\".repeat(backslashes);
    quoted += character;
    backslashes = 0;
  }
  return quoted + "\\".repeat(backslashes * 2) + '"';
}

function createWindowsTargetCommandLine(
  command: string,
  args: string[],
  windowsVerbatimArguments: boolean | undefined,
): string {
  const executable = quoteWindowsCreateProcessArgument(command);
  return windowsVerbatimArguments
    ? [executable, ...args].join(" ")
    : [executable, ...args.map(quoteWindowsCreateProcessArgument)].join(" ");
}

const WINDOWS_JOB_RUNNER_SOURCE = "using System;\nusing System.ComponentModel;\nusing System.Runtime.InteropServices;\nusing System.Text;\n\npublic static class OpenDesignWindowsJobRunner\n{\n    const uint CREATE_SUSPENDED = 0x00000004;\n    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;\n    const uint INFINITE = 0xFFFFFFFF;\n    const uint INVALID_DWORD = 0xFFFFFFFF;\n    const int JobObjectExtendedLimitInformation = 9;\n\n    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]\n    struct STARTUPINFO\n    {\n        public int cb;\n        public string lpReserved;\n        public string lpDesktop;\n        public string lpTitle;\n        public int dwX;\n        public int dwY;\n        public int dwXSize;\n        public int dwYSize;\n        public int dwXCountChars;\n        public int dwYCountChars;\n        public int dwFillAttribute;\n        public int dwFlags;\n        public short wShowWindow;\n        public short cbReserved2;\n        public IntPtr lpReserved2;\n        public IntPtr hStdInput;\n        public IntPtr hStdOutput;\n        public IntPtr hStdError;\n    }\n\n    [StructLayout(LayoutKind.Sequential)]\n    struct PROCESS_INFORMATION\n    {\n        public IntPtr hProcess;\n        public IntPtr hThread;\n        public int dwProcessId;\n        public int dwThreadId;\n    }\n\n    [StructLayout(LayoutKind.Sequential)]\n    struct JOBOBJECT_BASIC_LIMIT_INFORMATION\n    {\n        public long PerProcessUserTimeLimit;\n        public long PerJobUserTimeLimit;\n        public uint LimitFlags;\n        public UIntPtr MinimumWorkingSetSize;\n        public UIntPtr MaximumWorkingSetSize;\n        public uint ActiveProcessLimit;\n        public UIntPtr Affinity;\n        public uint PriorityClass;\n        public uint SchedulingClass;\n    }\n\n    [StructLayout(LayoutKind.Sequential)]\n    struct IO_COUNTERS\n    {\n        public ulong ReadOperationCount;\n        public ulong WriteOperationCount;\n        public ulong OtherOperationCount;\n        public ulong ReadTransferCount;\n        public ulong WriteTransferCount;\n        public ulong OtherTransferCount;\n    }\n\n    [StructLayout(LayoutKind.Sequential)]\n    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION\n    {\n        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;\n        public IO_COUNTERS IoInfo;\n        public UIntPtr ProcessMemoryLimit;\n        public UIntPtr JobMemoryLimit;\n        public UIntPtr PeakProcessMemoryUsed;\n        public UIntPtr PeakJobMemoryUsed;\n    }\n\n    [DllImport(\"kernel32.dll\", CharSet = CharSet.Unicode, SetLastError = true)]\n    static extern bool CreateProcess(\n        string applicationName,\n        StringBuilder commandLine,\n        IntPtr processAttributes,\n        IntPtr threadAttributes,\n        bool inheritHandles,\n        uint creationFlags,\n        IntPtr environment,\n        string currentDirectory,\n        ref STARTUPINFO startupInfo,\n        out PROCESS_INFORMATION processInformation);\n\n    [DllImport(\"kernel32.dll\", CharSet = CharSet.Unicode, SetLastError = true)]\n    static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);\n\n    [DllImport(\"kernel32.dll\", SetLastError = true)]\n    static extern bool SetInformationJobObject(\n        IntPtr job,\n        int informationClass,\n        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION information,\n        uint informationLength);\n\n    [DllImport(\"kernel32.dll\", SetLastError = true)]\n    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);\n\n    [DllImport(\"kernel32.dll\", SetLastError = true)]\n    static extern uint ResumeThread(IntPtr thread);\n\n    [DllImport(\"kernel32.dll\", SetLastError = true)]\n    static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);\n\n    [DllImport(\"kernel32.dll\", SetLastError = true)]\n    static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);\n\n    [DllImport(\"kernel32.dll\", SetLastError = true)]\n    static extern bool TerminateProcess(IntPtr process, uint exitCode);\n\n    [DllImport(\"kernel32.dll\", SetLastError = true)]\n    static extern bool CloseHandle(IntPtr handle);\n\n    [DllImport(\"kernel32.dll\")]\n    static extern IntPtr GetStdHandle(int standardHandle);\n\n    [DllImport(\"kernel32.dll\", SetLastError = true)]\n    static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);\n\n    static string Decode(string encoded)\n    {\n        return Encoding.UTF8.GetString(Convert.FromBase64String(encoded));\n    }\n\n    public static int Run(string encodedApplicationName, string encodedCommandLine)\n    {\n        IntPtr job = CreateJobObject(IntPtr.Zero, null);\n        if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());\n\n        PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();\n        bool processCreated = false;\n        bool assigned = false;\n        try\n        {\n            JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();\n            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;\n            if (!SetInformationJobObject(\n                job,\n                JobObjectExtendedLimitInformation,\n                ref limits,\n                (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))))\n            {\n                throw new Win32Exception(Marshal.GetLastWin32Error());\n            }\n\n            STARTUPINFO startupInfo = new STARTUPINFO();\n            startupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFO));\n            startupInfo.dwFlags = 0x00000100;\n            startupInfo.hStdInput = GetStdHandle(-10);\n            startupInfo.hStdOutput = GetStdHandle(-11);\n            startupInfo.hStdError = GetStdHandle(-12);\n            SetHandleInformation(startupInfo.hStdInput, 1, 1);\n            SetHandleInformation(startupInfo.hStdOutput, 1, 1);\n            SetHandleInformation(startupInfo.hStdError, 1, 1);\n\n            if (!CreateProcess(\n                Decode(encodedApplicationName),\n                new StringBuilder(Decode(encodedCommandLine)),\n                IntPtr.Zero,\n                IntPtr.Zero,\n                true,\n                CREATE_SUSPENDED,\n                IntPtr.Zero,\n                null,\n                ref startupInfo,\n                out processInformation))\n            {\n                throw new Win32Exception(Marshal.GetLastWin32Error());\n            }\n            processCreated = true;\n            if (!AssignProcessToJobObject(job, processInformation.hProcess))\n            {\n                throw new Win32Exception(Marshal.GetLastWin32Error());\n            }\n            assigned = true;\n            if (ResumeThread(processInformation.hThread) == INVALID_DWORD)\n            {\n                throw new Win32Exception(Marshal.GetLastWin32Error());\n            }\n            if (WaitForSingleObject(processInformation.hProcess, INFINITE) == INVALID_DWORD)\n            {\n                throw new Win32Exception(Marshal.GetLastWin32Error());\n            }\n            uint exitCode;\n            if (!GetExitCodeProcess(processInformation.hProcess, out exitCode))\n            {\n                throw new Win32Exception(Marshal.GetLastWin32Error());\n            }\n            return unchecked((int)exitCode);\n        }\n        finally\n        {\n            if (processCreated && !assigned) TerminateProcess(processInformation.hProcess, 1);\n            if (processInformation.hThread != IntPtr.Zero) CloseHandle(processInformation.hThread);\n            if (processInformation.hProcess != IntPtr.Zero) CloseHandle(processInformation.hProcess);\n            CloseHandle(job);\n        }\n    }\n}\n";

/**
 * Start a Windows runtime inside a kill-on-close Job Object. The C# runner
 * creates the target suspended, assigns it to the job, and only then resumes
 * it, so any descendants inherit membership before application code runs.
 * The runner's standard handles are inherited by the target, preserving ACP
 * stdin/stdout/stderr transport.
 */
export function spawnWindowsJobProcess(request: WindowsJobSpawnRequest): ChildProcess {
  if (process.platform !== "win32") {
    throw new Error("Windows Job Objects are only available on win32");
  }
  const invocation = createCommandInvocation(request);
  const applicationName = Buffer.from(invocation.command, "utf8").toString("base64");
  const commandLine = Buffer.from(
    createWindowsTargetCommandLine(
      invocation.command,
      invocation.args,
      invocation.windowsVerbatimArguments,
    ),
    "utf8",
  ).toString("base64");
  const runnerSource = Buffer.from(WINDOWS_JOB_RUNNER_SOURCE, "utf16le").toString("base64");
  const runnerCommand = [
    "$source = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('" + runnerSource + "'))",
    "Add-Type -TypeDefinition $source",
    "$exitCode = [OpenDesignWindowsJobRunner]::Run('" + applicationName + "', '" + commandLine + "')",
    "exit $exitCode",
  ].join("; ");
  return spawn("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    runnerCommand,
  ], {
    cwd: request.cwd,
    env: request.env,
    stdio: request.stdio,
    windowsHide: true,
  });
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
  const snapshots: Array<ProcessSnapshot | null> = stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;
      return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3], createdAt: null };
    })
  return snapshots.filter((snapshot): snapshot is ProcessSnapshot => snapshot != null);
}

/** @internal Enumerate process snapshots on POSIX via `ps`. */
async function listPosixProcessSnapshots(): Promise<ProcessSnapshot[]> {
  const stdout = await new Promise<string>((resolveList, rejectList) => {
    execFile("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, out) => {
      if (error) rejectList(error);
      else resolveList(out);
    });
  });
  return parsePsOutput(stdout);
}

/** @internal Enumerate process snapshots on Windows via `Get-CimInstance Win32_Process` JSON. */
async function listWindowsProcessSnapshots(): Promise<ProcessSnapshot[]> {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Get-CimInstance Win32_Process | ForEach-Object { $creationDate = $_.CreationDate; [pscustomobject]@{ ProcessId = $_.ProcessId; ParentProcessId = $_.ParentProcessId; CreationDate = if ($creationDate -is [datetime]) { $creationDate.ToUniversalTime().ToString('o') } elseif ($null -ne $creationDate) { [string]$creationDate } else { $null }; CommandLine = $_.CommandLine } } | ConvertTo-Json -Compress",
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
  const snapshots: Array<ProcessSnapshot | null> = (Array.isArray(records) ? records : [records])
    .map((record) => {
      const pid = Number(record.ProcessId);
      const ppid = Number(record.ParentProcessId);
      const commandLine = record.CommandLine?.trim();
      if (!commandLine || Number.isNaN(pid) || Number.isNaN(ppid)) return null;
      return { command: commandLine, pid, ppid, createdAt: parseProcessCreationDate(record.CreationDate) };
    })
  return snapshots.filter((snapshot): snapshot is ProcessSnapshot => snapshot != null);
}

/**
 * Enumerate all running processes as `{ pid, ppid, command }` snapshots, using
 * the platform-appropriate backend. Returns an empty list on any failure.
 *
 * @returns The current process snapshots (empty on error).
 */
export async function listProcessSnapshots(): Promise<ProcessSnapshot[]> {
  return (await readProcessSnapshots()).processes;
}

/**
 * Enumerate the platform process table while retaining whether the observation
 * itself succeeded. This is used by verification paths that must not mistake a
 * failed process-table read for proof that no owned process remains.
 */
export async function readProcessSnapshots(): Promise<ProcessSnapshotObservation> {
  try {
    return {
      ok: true,
      processes: process.platform === "win32"
        ? await listWindowsProcessSnapshots()
        : await listPosixProcessSnapshots(),
    };
  } catch {
    return { ok: false, processes: [] };
  }
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
 * Capture an owned root only when the platform supplied enough identity to make
 * a later PID-reuse check meaningful. Windows callers must treat `null` as an
 * unsafe cancellation target rather than falling back to name matching.
 */
export function captureOwnedProcessIdentity(
  processes: ProcessSnapshot[],
  pid: number | null | undefined,
  options: Pick<OwnedProcessIdentity, "ownership"> = {},
): OwnedProcessIdentity | null {
  if (typeof pid !== "number") return null;
  const root = processes.find((processInfo) => processInfo.pid === pid);
  if (!root) return null;
  return { pid, createdAt: root.createdAt ?? null, ...options };
}

/**
 * Return only the tree still attributable to an owned root. If a live root PID
 * has a different creation identity, it has been reused and must never be
 * signalled. A missing root is allowed: Windows descendants retain their
 * recorded parent PID after that parent has exited.
 */
export function collectOwnedProcessTreePids(
  processes: ProcessSnapshot[],
  root: OwnedProcessIdentity,
): number[] {
  const currentRoot = processes.find((processInfo) => processInfo.pid === root.pid);
  if (
    currentRoot
    && root.createdAt != null
    && currentRoot.createdAt !== root.createdAt
  ) {
    return [];
  }
  const childrenByParent = new Map<number, number[]>();
  for (const processInfo of processes) {
    const children = childrenByParent.get(processInfo.ppid) ?? [];
    children.push(processInfo.pid);
    childrenByParent.set(processInfo.ppid, children);
  }
  const ordered: number[] = [];
  const visited = new Set<number>();
  const visit = (pid: number) => {
    if (visited.has(pid)) return;
    visited.add(pid);
    for (const childPid of childrenByParent.get(pid) ?? []) visit(childPid);
    ordered.push(pid);
  };
  visit(root.pid);
  return ordered.filter((pid) => {
    // Do not signal a current root that cannot be verified against the captured
    // Windows creation identity. This is the PID-reuse guard above in the
    // missing-createdAt case.
    if (pid !== root.pid) return true;
    if (!currentRoot) return false;
    return root.createdAt == null || currentRoot.createdAt === root.createdAt;
  });
}

/** @internal Send a signal to each PID, ignoring `ESRCH` (already-dead) but rethrowing other errors. */
function signalProcesses(pids: number[], signal: NodeJS.Signals): void {
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

type OwnedProcessTreeTracker = {
  identities: Map<number, number>;
};

function orderTrackedProcessPids(
  processes: ProcessSnapshot[],
  livePids: Set<number>,
): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const processInfo of processes) {
    if (!livePids.has(processInfo.pid)) continue;
    const children = childrenByParent.get(processInfo.ppid) ?? [];
    children.push(processInfo.pid);
    childrenByParent.set(processInfo.ppid, children);
  }
  const ordered: number[] = [];
  const visited = new Set<number>();
  const visit = (pid: number) => {
    if (!livePids.has(pid) || visited.has(pid)) return;
    visited.add(pid);
    for (const childPid of childrenByParent.get(pid) ?? []) visit(childPid);
    ordered.push(pid);
  };
  for (const pid of [...livePids].sort((left, right) => left - right)) visit(pid);
  return ordered;
}

async function observeOwnedProcessTree(
  root: OwnedProcessIdentity,
  tracker: OwnedProcessTreeTracker,
  readSnapshots: () => Promise<ProcessSnapshotObservation> = readProcessSnapshots,
): Promise<{
  identityVerified: boolean;
  pids: number[];
}> {
  const observation = await readSnapshots();
  if (!observation.ok) return { identityVerified: false, pids: [] };
  const processes = observation.processes;
  const snapshotsByPid = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  for (const [pid, createdAt] of tracker.identities) {
    const current = snapshotsByPid.get(pid);
    if (current && current.createdAt !== createdAt) {
      return { identityVerified: false, pids: [] };
    }
  }

  // Re-walk from every live owner as well as the original root. Once an
  // intermediate parent exits, a surviving grandchild is no longer reachable
  // from only the current root chain; its stored identity keeps it owned, and
  // its new descendants remain discoverable from the tracked PID.
  const discoveredPids = collectProcessTreePids(processes, [
    root.pid,
    ...tracker.identities.keys(),
  ]);
  for (const pid of discoveredPids) {
    const current = snapshotsByPid.get(pid);
    if (!current) continue;
    const createdAt = current.createdAt;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
      return { identityVerified: false, pids: [] };
    }
    const existingCreatedAt = tracker.identities.get(pid);
    if (existingCreatedAt != null && existingCreatedAt !== createdAt) {
      return { identityVerified: false, pids: [] };
    }
    tracker.identities.set(pid, createdAt);
  }

  const livePids = new Set<number>();
  for (const [pid, createdAt] of tracker.identities) {
    const current = snapshotsByPid.get(pid);
    if (!current) continue;
    if (current.createdAt !== createdAt) {
      return { identityVerified: false, pids: [] };
    }
    livePids.add(pid);
  }
  return {
    identityVerified: true,
    pids: orderTrackedProcessPids(processes, livePids),
  };
}

async function waitForOwnedProcessTreeExit(
  root: OwnedProcessIdentity,
  tracker: OwnedProcessTreeTracker,
  timeoutMs: number,
  readSnapshots: () => Promise<ProcessSnapshotObservation>,
): Promise<{ identityVerified: boolean; pids: number[] }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const observed = await observeOwnedProcessTree(root, tracker, readSnapshots);
    if (!observed.identityVerified || observed.pids.length === 0) return observed;
    await sleep(100);
  }
  return observeOwnedProcessTree(root, tracker, readSnapshots);
}

/**
 * Terminate and verify one captured Windows process tree. The caller owns the
 * POSIX process-group path; this helper deliberately uses only tracked PIDs and
 * process-parent relationships, never executable-name discovery.
 */
export async function terminateOwnedProcessTree(
  root: OwnedProcessIdentity | null | undefined,
  options: {
    forceWaitMs?: number;
    graceMs?: number;
    /** Allows alternate process observers while retaining failure semantics. */
    readSnapshots?: () => Promise<ProcessSnapshotObservation>;
  } = {},
): Promise<ProcessTreeTerminationResult> {
  if (!root || root.createdAt == null) {
    return {
      attempted: false,
      childTreeQuiescent: false,
      forced: false,
      identityVerified: false,
      remainingPids: [],
    };
  }
  // Process snapshots only prove a parent-chain closure. Windows runs must
  // instead start under the job launcher, which establishes the lifetime
  // ownership boundary before the runtime can create a short-lived helper.
  if (process.platform === "win32" && root.ownership !== "windows-job") {
    return {
      attempted: false,
      childTreeQuiescent: false,
      forced: false,
      identityVerified: false,
      remainingPids: [],
    };
  }
  const graceMs = options.graceMs ?? 3_000;
  const forceWaitMs = options.forceWaitMs ?? 500;
  const readSnapshots = options.readSnapshots ?? readProcessSnapshots;
  const tracker: OwnedProcessTreeTracker = {
    identities: new Map([[root.pid, root.createdAt]]),
  };
  const first = await observeOwnedProcessTree(root, tracker, readSnapshots);
  if (!first.identityVerified) {
    return { attempted: false, childTreeQuiescent: false, forced: false, identityVerified: false, remainingPids: [] };
  }
  if (first.pids.length === 0) {
    return { attempted: false, childTreeQuiescent: true, forced: false, identityVerified: true, remainingPids: [] };
  }
  try {
    signalProcesses(first.pids, "SIGTERM");
  } catch {
    return { attempted: true, childTreeQuiescent: false, forced: false, identityVerified: true, remainingPids: first.pids };
  }
  const afterGrace = await waitForOwnedProcessTreeExit(root, tracker, graceMs, readSnapshots);
  if (!afterGrace.identityVerified || afterGrace.pids.length === 0) {
    return {
      attempted: true,
      childTreeQuiescent: afterGrace.identityVerified && afterGrace.pids.length === 0,
      forced: false,
      identityVerified: afterGrace.identityVerified,
      remainingPids: afterGrace.pids,
    };
  }
  try {
    signalProcesses(afterGrace.pids, "SIGKILL");
  } catch {
    return { attempted: true, childTreeQuiescent: false, forced: true, identityVerified: true, remainingPids: afterGrace.pids };
  }
  const afterForce = await waitForOwnedProcessTreeExit(root, tracker, forceWaitMs, readSnapshots);
  return {
    attempted: true,
    childTreeQuiescent: afterForce.identityVerified && afterForce.pids.length === 0,
    forced: true,
    identityVerified: afterForce.identityVerified,
    remainingPids: afterForce.pids,
  };
}

/**
 * Stop a set of PIDs with escalation: SIGTERM, wait, then SIGKILL any
 * survivors. Excludes the current process and de-duplicates the input.
 *
 * @param pids - The PIDs to stop (non-numbers and the current PID are ignored).
 * @returns A result describing matched, stopped, force-killed, and remaining PIDs.
 */
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
