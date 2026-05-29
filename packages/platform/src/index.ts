import { execFile, execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
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

export type AtomicCopyFileOptions = {
  overwrite?: boolean;
};

export type AtomicCopyFileResult = {
  bytesCopied: number;
  replaced: boolean;
};

export type RemovePathBestEffortOptions = {
  recursive?: boolean;
};

export type RemovePathBestEffortResult = {
  error?: string;
  removed: boolean;
};

export type SystemProxyCommandRunner = (command: string, args: string[]) => string;

export type ResolveSystemProxyEnvOptions = {
  platform?: NodeJS.Platform;
  runCommand?: SystemProxyCommandRunner;
};

type WindowsProcessRecord = {
  CommandLine?: string | null;
  ParentProcessId?: number | string | null;
  ProcessId?: number | string | null;
};

const CANONICAL_PROXY_ENV_KEYS = new Map<string, "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY">([
  ["all_proxy", "ALL_PROXY"],
  ["http_proxy", "HTTP_PROXY"],
  ["https_proxy", "HTTPS_PROXY"],
  ["node_use_env_proxy", "NODE_USE_ENV_PROXY"],
  ["no_proxy", "NO_PROXY"],
]);

function defaultSystemProxyCommandRunner(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2_000,
    windowsHide: true,
  });
}

function canonicalProxyEnvKey(
  key: string,
): "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY" | null {
  return CANONICAL_PROXY_ENV_KEYS.get(key.toLowerCase()) ?? null;
}

function deleteProxyEnvVariants(env: NodeJS.ProcessEnv, canonicalKey: string): void {
  for (const existingKey of Object.keys(env)) {
    if (existingKey.toLowerCase() === canonicalKey.toLowerCase()) delete env[existingKey];
  }
}

function setCanonicalProxyEnvValue(
  env: NodeJS.ProcessEnv,
  canonicalKey: "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY",
  value: string,
  platform: NodeJS.Platform,
): void {
  deleteProxyEnvVariants(env, canonicalKey);
  if (canonicalKey === "NODE_USE_ENV_PROXY") {
    env.NODE_USE_ENV_PROXY = value;
    return;
  }
  addProxyEnvValue(env, canonicalKey, value, platform);
}

export function mergeProxyAwareEnv(
  platform: NodeJS.Platform,
  ...sources: Array<NodeJS.ProcessEnv | Record<string, string | undefined>>
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = {};
  for (const source of sources) {
    const proxyEntries = new Map<
      "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY",
      { preferLowercase: boolean; value: string }
    >();
    for (const [key, value] of Object.entries(source)) {
      if (value == null) continue;
      const canonicalKey = canonicalProxyEnvKey(key);
      if (canonicalKey) {
        const current = proxyEntries.get(canonicalKey);
        const preferLowercase = key === key.toLowerCase();
        if (!current || preferLowercase || !current.preferLowercase) {
          proxyEntries.set(canonicalKey, { preferLowercase, value });
        }
        continue;
      }
      merged[key] = value;
    }
    for (const [canonicalKey, entry] of proxyEntries) {
      setCanonicalProxyEnvValue(merged, canonicalKey, entry.value, platform);
    }
  }
  if (hasProxyEndpointEnv(merged) && !hasCanonicalProxyEnv(merged, "NODE_USE_ENV_PROXY")) {
    merged.NODE_USE_ENV_PROXY = "1";
  }
  return merged;
}

function hasCanonicalProxyEnv(
  env: NodeJS.ProcessEnv,
  canonicalKey: "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY",
): boolean {
  return Object.keys(env).some((key) => key.toLowerCase() === canonicalKey.toLowerCase());
}

function hasProxyEndpointEnv(env: NodeJS.ProcessEnv): boolean {
  return ["ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY"].some((key) => {
    for (const [envKey, value] of Object.entries(env)) {
      if (envKey.toLowerCase() === key.toLowerCase() && value?.trim()) return true;
    }
    return false;
  });
}

function addProxyEnvValue(
  env: NodeJS.ProcessEnv,
  key: "HTTP_PROXY" | "HTTPS_PROXY" | "ALL_PROXY" | "NO_PROXY",
  value: string,
  platform: NodeJS.Platform,
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  env[key] = trimmed;
  if (platform !== "win32") env[key.toLowerCase()] = trimmed;
}

function normalizeBypassToken(token: string): string[] {
  const trimmed = token.trim();
  if (!trimmed) return [];
  if (trimmed === "<local>") return ["<local>", "localhost", "127.0.0.1", "[::1]", ".local"];
  if (trimmed === "::1") return ["[::1]"];
  if (trimmed.startsWith("*.")) return [`.${trimmed.slice(2)}`];
  return [trimmed];
}

function buildNoProxyValue(tokens: Iterable<string>): string | null {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const token of tokens) {
    for (const normalized of normalizeBypassToken(token)) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        values.push(normalized);
      }
    }
  }
  return values.length > 0 ? values.join(",") : null;
}

function preserveWildcardNoProxyValue(noProxy: string | null | undefined): string | undefined {
  return noProxy?.split(",").some((token) => token.trim() === "*") ? "*" : undefined;
}

function normalizeProxyUrl(raw: string, scheme: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `${scheme}://${trimmed}`;
}

function bracketIpv6Authority(authority: string): string {
  if (authority.startsWith("[") || !authority.includes(":")) return authority;
  const portSeparatorIndex = authority.lastIndexOf(":");
  if (portSeparatorIndex <= 0) return authority;
  const host = authority.slice(0, portSeparatorIndex);
  const port = authority.slice(portSeparatorIndex + 1);
  if (!host.includes(":") || !/^\d+$/.test(port)) return authority;
  return `[${host}]:${port}`;
}

function normalizeAuthorityProxyUrl(raw: string, scheme: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `${scheme}://${bracketIpv6Authority(trimmed)}`;
}

function normalizeHostPortProxyUrl(
  host: string | undefined,
  port: string | undefined,
  scheme: string,
): string | null {
  const trimmedHost = host?.trim() ?? "";
  const trimmedPort = port?.trim() ?? "";
  if (!trimmedHost || !trimmedPort) return null;
  const normalizedHost =
    trimmedHost.includes(":") && !trimmedHost.startsWith("[") && !trimmedHost.endsWith("]")
      ? `[${trimmedHost}]`
      : trimmedHost;
  return normalizeProxyUrl(`${normalizedHost}:${trimmedPort}`, scheme);
}

function finalizeSystemProxyEnv(
  values: {
    allProxy?: string | null;
    httpProxy?: string | null;
    httpsProxy?: string | null;
    noProxy?: string | null;
  },
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  const hasProxy = Boolean(values.httpProxy || values.httpsProxy || values.allProxy);
  const noProxy = hasProxy
    ? preserveWildcardNoProxyValue(values.noProxy) ??
      buildNoProxyValue([
        ...(values.noProxy ? values.noProxy.split(",") : []),
        "localhost",
        "127.0.0.1",
        "[::1]",
      ])
    : null;
  const env: NodeJS.ProcessEnv = {};
  if (values.httpProxy) addProxyEnvValue(env, "HTTP_PROXY", values.httpProxy, platform);
  if (values.httpsProxy) addProxyEnvValue(env, "HTTPS_PROXY", values.httpsProxy, platform);
  if (values.allProxy) addProxyEnvValue(env, "ALL_PROXY", values.allProxy, platform);
  if (noProxy) addProxyEnvValue(env, "NO_PROXY", noProxy, platform);
  if (hasProxy) env.NODE_USE_ENV_PROXY = "1";
  return env;
}

export function parseMacosScutilProxyOutput(
  stdout: string,
  platform: NodeJS.Platform = "darwin",
): NodeJS.ProcessEnv {
  const scalars = new Map<string, string>();
  const exceptions: string[] = [];
  let inExceptions = false;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^ExceptionsList\s*:\s*<array>\s*\{$/.test(line)) {
      inExceptions = true;
      continue;
    }
    if (inExceptions) {
      if (line === "}") {
        inExceptions = false;
        continue;
      }
      const match = line.match(/^\d+\s*:\s*(.+)$/);
      if (match) exceptions.push(match[1].trim());
      continue;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.+)$/);
    if (match) scalars.set(match[1], match[2].trim());
  }

  const httpProxy =
    scalars.get("HTTPEnable") === "1"
      ? normalizeHostPortProxyUrl(scalars.get("HTTPProxy"), scalars.get("HTTPPort"), "http")
      : null;
  const httpsProxy =
    scalars.get("HTTPSEnable") === "1"
      ? normalizeHostPortProxyUrl(scalars.get("HTTPSProxy"), scalars.get("HTTPSPort"), "http")
      : null;
  const allProxy =
    scalars.get("SOCKSEnable") === "1"
      ? normalizeHostPortProxyUrl(scalars.get("SOCKSProxy"), scalars.get("SOCKSPort"), "socks5")
      : null;
  return finalizeSystemProxyEnv(
    {
      allProxy,
      httpProxy,
      httpsProxy,
      noProxy: buildNoProxyValue([
        ...exceptions,
        ...(scalars.get("ExcludeSimpleHostnames") === "1" ? ["<local>"] : []),
      ]),
    },
    platform,
  );
}

function parseRegistryValue(stdout: string, valueName: string): string | null {
  const match = stdout.match(new RegExp(`^\\s*${valueName}\\s+REG_\\w+\\s+(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

export function parseWindowsInternetSettingsProxyOutput(
  input: { proxyEnable: string; proxyOverride?: string; proxyServer?: string },
  platform: NodeJS.Platform = "win32",
): NodeJS.ProcessEnv {
  const enabled = parseRegistryValue(input.proxyEnable, "ProxyEnable");
  if (enabled == null || !/^(1|0x1)$/i.test(enabled)) return {};
  const proxyServer = parseRegistryValue(input.proxyServer ?? "", "ProxyServer") ?? "";
  const proxyOverride = parseRegistryValue(input.proxyOverride ?? "", "ProxyOverride") ?? "";
  if (!proxyServer.trim()) return {};

  let httpProxy: string | null = null;
  let httpsProxy: string | null = null;
  let allProxy: string | null = null;
  if (proxyServer.includes("=")) {
    for (const segment of proxyServer.split(";")) {
      const [kind, rawValue] = segment.split("=", 2);
      const value = rawValue?.trim();
      if (!kind || !value) continue;
      const lowerKind = kind.trim().toLowerCase();
      if (lowerKind === "http") httpProxy = normalizeAuthorityProxyUrl(value, "http");
      else if (lowerKind === "https") httpsProxy = normalizeAuthorityProxyUrl(value, "http");
      else if (lowerKind === "socks") allProxy = normalizeAuthorityProxyUrl(value, "socks5");
    }
  } else {
    const shared = normalizeAuthorityProxyUrl(proxyServer, "http");
    httpProxy = shared;
    httpsProxy = shared;
  }
  return finalizeSystemProxyEnv(
    {
      allProxy,
      httpProxy,
      httpsProxy,
      noProxy: buildNoProxyValue(proxyOverride.split(/[;,]/)),
    },
    platform,
  );
}

export function resolveSystemProxyEnv(options: ResolveSystemProxyEnvOptions = {}): NodeJS.ProcessEnv {
  const platform = options.platform ?? process.platform;
  const runCommand = options.runCommand ?? defaultSystemProxyCommandRunner;
  const tryRun = (command: string, args: string[]): string => {
    try {
      return runCommand(command, args);
    } catch {
      return "";
    }
  };
  try {
    if (platform === "darwin") {
      return parseMacosScutilProxyOutput(tryRun("scutil", ["--proxy"]), platform);
    }
    if (platform === "win32") {
      return parseWindowsInternetSettingsProxyOutput(
        {
          proxyEnable: tryRun("reg", [
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyEnable",
          ]),
          proxyOverride: tryRun("reg", [
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyOverride",
          ]),
          proxyServer: tryRun("reg", [
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyServer",
          ]),
        },
        platform,
      );
    }
  } catch {
    return {};
  }
  return {};
}

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

export function pathContains(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedRoot, resolvedTarget);
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

function destinationExistsError(destinationPath: string): NodeJS.ErrnoException {
  const error = new Error(`destination already exists: ${destinationPath}`) as NodeJS.ErrnoException;
  error.code = "EEXIST";
  return error;
}

export async function atomicCopyFile(
  sourcePath: string,
  destinationPath: string,
  options: AtomicCopyFileOptions = {},
): Promise<AtomicCopyFileResult> {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (source === destination) {
    const entry = await stat(destination);
    if (!entry.isFile()) throw new Error(`destination is not a file: ${destination}`);
    return { bytesCopied: entry.size, replaced: true };
  }

  const destinationDir = dirname(destination);
  await mkdir(destinationDir, { recursive: true });
  const existing = await stat(destination).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  });
  if (existing != null && options.overwrite !== true) {
    throw destinationExistsError(destination);
  }

  const tempPath = join(
    destinationDir,
    `.${basename(destination)}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  try {
    await copyFile(source, tempPath);
    if (options.overwrite === true) {
      await rm(destination, { force: true });
    }
    await rename(tempPath, destination);
    const copied = await stat(destination);
    return { bytesCopied: copied.size, replaced: existing != null };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function removePathBestEffort(
  path: string,
  options: RemovePathBestEffortOptions = {},
): Promise<RemovePathBestEffortResult> {
  try {
    await rm(path, { force: true, recursive: options.recursive ?? true });
    return { removed: true };
  } catch (error) {
    return { error: errorMessage(error), removed: false };
  }
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

const nodeLoadablePackageManagerExtensions = new Set([".js", ".cjs", ".mjs"]);

export function createCommandInvocation({ args = [], command, env = process.env }: CommandInvocationRequest): CommandInvocation {
  if (process.platform === "win32" && /\.(bat|cmd)$/i.test(command)) {
    return buildCmdShimInvocation(command, args, env);
  }
  return { args, command };
}

export function createPackageManagerInvocation(args: string[], env: NodeJS.ProcessEnv = process.env): CommandInvocation {
  const execPath = env.npm_execpath;
  if (execPath) {
    if (nodeLoadablePackageManagerExtensions.has(extname(execPath).toLowerCase())) {
      return { args: [execPath, ...args], command: process.execPath };
    }
    return createCommandInvocation({ args, command: execPath, env });
  }
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

function resolveUserScopedHome(raw: string | undefined, home: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(home, value.slice(2));
  }
  return isAbsolute(value) ? value : null;
}

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
  // Vite+ global installs expose CLI shims from VP_HOME/bin (default
  // ~/.vite-plus/bin). An explicit VP_HOME is the most specific signal for
  // vp-managed shims, so it wins over other global package-manager prefixes
  // when a CLI name exists in multiple stores.
  const vpHome = resolveUserScopedHome(env.VP_HOME, home);
  if (vpHome) {
    dirs.push(join(vpHome, "bin"));
  }
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
    join(home, ".vite-plus", "bin"),
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
  dirs.push(...existingMiseNpmPackageBinDirs(join(home, ".local", "share", "mise", "installs")));
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
    {
      root: join(home, ".fnm", "node-versions"),
      segments: ["installation", "bin"],
    },
  ]) {
    for (const dir of existingChildBinDirs(installRoot.root, installRoot.segments)) {
      dirs.push(dir);
    }
  }
  return dirs;
}

function existingMiseNpmPackageBinDirs(root: string): string[] {
  const out: string[] = [];
  for (const packageName of ["npm-openai-codex"]) {
    const packageRoot = join(root, packageName);
    out.push(...existingChildBinDirs(packageRoot, ["bin"]));
  }
  return out;
}

function existingChildBinDirs(root: string, segments: string[]): string[] {
  const out: string[] = [];
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = readdirSync(root, { encoding: "utf8", withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of sortVersionedDirEntries(entries)) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const candidate = join(root, entry.name, ...segments);
    if (existsSync(candidate)) out.push(candidate);
  }
  return out;
}

type SemverParts = [major: number, minor: number, patch: number];

function sortVersionedDirEntries(entries: import("node:fs").Dirent<string>[]): import("node:fs").Dirent<string>[] {
  return [...entries].sort((left, right) => compareVersionLikeDirNames(left.name, right.name));
}

function compareVersionLikeDirNames(left: string, right: string): number {
  const leftSemver = parseVersionLikeDirName(left);
  const rightSemver = parseVersionLikeDirName(right);
  if (leftSemver && rightSemver) {
    for (let index = 0; index < leftSemver.length; index += 1) {
      const difference = rightSemver[index] - leftSemver[index];
      if (difference !== 0) return difference;
    }
  } else if (leftSemver) {
    return -1;
  } else if (rightSemver) {
    return 1;
  }
  return left.localeCompare(right);
}

function parseVersionLikeDirName(name: string): SemverParts | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(name);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
