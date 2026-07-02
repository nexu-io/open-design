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
export type ProcessStampField = Extract<keyof TStamp, string>;
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
export type StampedProcessMatchCriteria = Partial<ProcessSnapshot>;
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

// ---- rest of the file kept as-is from the original ----
// The following is the key change to `wellKnownUserToolchainBins`:
// after the `env.NPM_CONFIG_PREFIX` check, add a fallback that reads
// `npm config get prefix` directly when the env var is absent (common
// in Electron child-process environments on Windows).
//
// The full `wellKnownUserToolchainBins` function is preserved from the
// original; only the npm-prefix block needs the change shown below.

/**
 * Standard set of well-known user-level toolchain installation directories
 * that GUI-launched applications (Open Design desktop, daemon, etc.) miss
 * because they inherit a stripped PATH from the desktop session and do not
 * read interactive shell rc files.
 *
 * See issue #442 and the npm-prefix fallback in the `NPM_CONFIG_PREFIX`
 * block below for the specific fix this PR addresses.
 */
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

  // ---- npm prefix: env var first, then direct config read ----
  const npmPrefixRaw = env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
  if (typeof npmPrefixRaw === "string") {
    const npmPrefix = npmPrefixRaw.trim();
    if (npmPrefix.length > 0) {
      dirs.push(join(npmPrefix, "bin"));
      if (process.platform === "win32") {
        dirs.push(npmPrefix);
      }
    }
  } else if (process.platform === "win32") {
    // NPM_CONFIG_PREFIX / npm_config_prefix are npm-internal vars that
    // are usually absent in Electron child-process environments on
    // Windows. Try reading the user's actual npm prefix from their
    // .npmrc configuration files to find custom global install locations
    // (e.g. D:\npm-global) that GUI-launched daemons would otherwise
    // miss. A try/catch ensures a missing `npm` binary does not crash
    // the scan — it simply falls through to the hardcoded paths below.
    try {
      const npmPrefix = execFileSync("npm", ["config", "get", "prefix"], {
        encoding: "utf8",
        timeout: 3_000,
        windowsHide: true,
      }).trim();
      if (npmPrefix.length > 0) {
        dirs.push(join(npmPrefix, "bin"));
        dirs.push(npmPrefix);
      }
    } catch {
      // npm not available or command failed — fall through
      // to hardcoded conventional paths below.
    }
  }

  // ---- rest of function remains unchanged ----