import { execFile, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export type CommandInvocation = {
  args: string[];
  command: string;
  // When true, callers must forward this to `child_process.spawn` /
  // `child_process.execFile` options. Required for Windows `.bat` / `.cmd`
  // shims so cmd.exe's `/s /c` quoting survives Node's default per-arg
  // CommandLineToArgvW escaping. See `createCommandInvocation`.
  windowsVerbatimArguments?: boolean;
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

// `cmd.exe /s /c "..."` runs percent-expansion on the inner line *regardless*
// of whether the `%name%` pair sits inside a `"..."` quoted segment, so a
// `.cmd` / `.bat` shim spawn with an attacker-influenced argv (e.g. an LLM
// adapter that ships the user prompt as a positional argument) lets a stray
// `%DEEPSEEK_API_KEY%` substring substitute live env values into the line
// before the child sees it. Plain quote-doubling is not enough on its own.
//
// The fix is to break each potential `%var%` pair by toggling out of the
// outer quote with `"^%"`: cmd treats the `^` as the standard escape for the
// next char (here, `%`), making it literal and skipping percent-expansion;
// `CommandLineToArgvW` then concatenates the surrounding quote segments back
// into one literal arg with the `%` preserved. The two layers cancel, so the
// child receives the original arg byte-for-byte while cmd never has a chance
// to expand anything inside it.
function quoteWindowsCommandArg(value: string): string {
  if (!/[\s"&<>|^%]/.test(value)) return value;
  const escaped = value.replace(/"/g, '""').replace(/%/g, '"^%"');
  return `"${escaped}"`;
}

// Build the `cmd.exe /d /s /c "<line>"` invocation Node uses internally for
// `shell: true`. The outer `"..."` plus `windowsVerbatimArguments: true` is
// the only shape that survives both layers of quoting:
//
// 1. Node would otherwise escape each argv element with CommandLineToArgvW
//    rules (turning `"path with space"` into `\"path with space\"`), which
//    cmd.exe does not understand.
// 2. cmd.exe with `/s /c` strips exactly one leading and one trailing `"`
//    from the rest of the command line. The outer wrap absorbs that strip
//    so any inner per-arg quoting stays intact.
//
// Without this, paths containing spaces (`C:\Users\First Last\...\foo.cmd`)
// get split on the first space and cmd.exe reports "not recognized as an
// internal or external command" — see issue #315.
function buildCmdShimInvocation(command: string, args: string[], env: NodeJS.ProcessEnv): CommandInvocation {
  const inner = [command, ...args].map(quoteWindowsCommandArg).join(" ");
  return {
    args: ["/d", "/s", "/c", `"${inner}"`],
    command: env.ComSpec ?? process.env.ComSpec ?? "cmd.exe",
    windowsVerbatimArguments: true,
  };
}

export function createCommandInvocation({ args = [], command, env = process.env }: CommandInvocationRequest): CommandInvocation {
  if (process.platform === "win32" && /\.(bat|cmd)$/i.test(command)) {
    return buildCmdShimInvocation(command, args, env);
  }
  return { args, command };
}

export function createPackageManagerInvocation(args: string[], env: NodeJS.ProcessEnv = process.env): CommandInvocation {
  const execPath = env.npm_execpath;
  if (execPath) return { args: [execPath, ...args], command: process.execPath };
  if (process.platform === "win32") {
    return buildCmdShimInvocation("pnpm", args, env);
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
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
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
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
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

export type WellKnownUserToolchainOptions = {
  // Override homedir() so callers in sandboxed tests or namespaced launches
  // can substitute a fixture directory. Falls back to os.homedir().
  home?: string;
  // Include /opt/homebrew/bin and /usr/local/bin in the result. Defaults to
  // true on POSIX so GUI-launched processes (which inherit a minimal PATH
  // from launchd / desktop launchers) still see Homebrew-installed CLIs;
  // defaults to false on Windows because those paths are POSIX-only.
  includeSystemBins?: boolean;
  // Read $NPM_CONFIG_PREFIX / $npm_config_prefix from this map and append
  // `<prefix>/bin` if defined. Defaults to process.env so user-customised
  // npm prefixes are picked up automatically. Pass an empty object to
  // suppress lookup (useful in tests).
  env?: NodeJS.ProcessEnv;
};

// Single source of truth for "user-level CLI install locations the daemon
// must search even when launched with a minimal PATH". GUI launchers
// (macOS .app bundles, Linux .desktop files) typically inherit a stripped
// PATH from launchd / the desktop session and do not read interactive
// shell rc files, so without this list any CLI installed under the user's
// own toolchain (`npm i -g`, `pnpm self-install`, `cargo install`, asdf,
// nvm, fnm, mise, ...) is silently undetected. Both the daemon resolver
// and the packaged sidecar PATH builder consume this so the two layers
// can never drift again.
export function wellKnownUserToolchainBins(
  options: WellKnownUserToolchainOptions = {},
): string[] {
  const home = options.home ?? homedir();
  const includeSystemBins = options.includeSystemBins ?? process.platform !== "win32";
  const env = options.env ?? process.env;
  const dirs: string[] = [];
  // The user's *explicit* npm prefix outranks every conventional
  // location below — including `~/.local/bin`. The env var is the
  // user's current npm configuration, so a binary installed via
  // `npm i -g` today lives at `<prefix>/bin`. Conventional locations
  // (`~/.local/bin`, `~/.npm-global`, `~/.npm-packages`) routinely
  // hold *stale* installs from an older prefix the user has since
  // rewritten, and `~/.local/bin` in particular is also a shared
  // dumping ground for pip --user / cargo install / hand-built
  // binaries that may collide with old npm artefacts. Putting the
  // env-driven prefix first matches npm's own resolution order
  // (env > .npmrc > default) and gives "explicit beats convention"
  // semantics across the whole list, not just the npm-prefix block.
  // Trim before length-checking so accidental whitespace-only values
  // (`NPM_CONFIG_PREFIX=" "`) do not produce a `/bin`-suffixed garbage
  // entry.
  const npmPrefixRaw = env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
  if (typeof npmPrefixRaw === "string") {
    const npmPrefix = npmPrefixRaw.trim();
    if (npmPrefix.length > 0) {
      dirs.push(join(npmPrefix, "bin"));
    }
  }
  dirs.push(
    join(home, ".local", "bin"),
    join(home, ".opencode", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".asdf", "shims"),
    join(home, "Library", "pnpm"),
    join(home, ".cargo", "bin"),
    // Common user-level npm prefixes for sudo-free global installs.
    // ~/.npm-global is the dominant non-canonical convention shipped
    // in most third-party "fix npm EACCES" tutorials, and
    // ~/.npm-packages is the second-most common variant. Without
    // these, GUI-launched daemons miss `npm i -g`'d CLIs even though
    // they resolve cleanly from the user's shell. See open-design
    // issue #442.
    join(home, ".npm-global", "bin"),
    join(home, ".npm-packages", "bin"),
  );
  if (includeSystemBins) {
    dirs.push("/opt/homebrew/bin", "/usr/local/bin");
  }
  // Per-version Node toolchains: scan the install root and surface every
  // version directory's bin folder. Best-effort — missing roots simply
  // contribute nothing.
  for (const installRoot of [
    {
      root: join(home, ".local", "share", "mise", "installs", "node"),
      segments: ["bin"],
    },
    {
      root: join(home, ".nvm", "versions", "node"),
      segments: ["bin"],
    },
    {
      root: join(home, ".local", "share", "fnm", "node-versions"),
      segments: ["installation", "bin"],
    },
  ]) {
    for (const dir of existingChildBinDirs(installRoot.root, installRoot.segments)) {
      dirs.push(dir);
    }
  }
  return dirs;
}

function existingChildBinDirs(root: string, segments: string[]): string[] {
  const out: string[] = [];
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = readdirSync(root, { encoding: "utf8", withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, ...segments);
    if (existsSync(candidate)) out.push(candidate);
  }
  return out;
}
