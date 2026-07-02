import { execFile, execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export type CommandInvocation = {
  args: string[];
  command: string;
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

export type CommandInvocationRequest = { args?: string[]; command: string; env?: NodeJS.ProcessEnv };
export type SpawnProcessRequest = CommandInvocationRequest & { cwd?: string; detached?: boolean; logFd?: number | null };
export type ProcessSnapshot = { command: string; pid: number; ppid: number };
export type StampedProcessMatchCriteria<TStamp extends ProcessStampShape> = Partial<TStamp>;

export type StopProcessesResult = {
  alreadyStopped: boolean; forcedPids: number[]; matchedPids: number[];
  remainingPids: number[]; stoppedPids: number[];
};
export type HttpWaitOptions = { timeoutMs?: number };
export type AtomicCopyFileOptions = { overwrite?: boolean };
export type AtomicCopyFileResult = { bytesCopied: number; replaced: boolean };
export type RemovePathBestEffortOptions = { recursive?: boolean };
export type RemovePathBestEffortResult = { error?: string; removed: boolean };
export type SystemProxyCommandRunner = (command: string, args: string[]) => string;
export type ResolveSystemProxyEnvOptions = { platform?: NodeJS.Platform; runCommand?: SystemProxyCommandRunner };

const CANONICAL_PROXY_ENV_KEYS = new Map([
  ["all_proxy", "ALL_PROXY"], ["http_proxy", "HTTP_PROXY"],
  ["https_proxy", "HTTPS_PROXY"], ["node_use_env_proxy", "NODE_USE_ENV_PROXY"],
  ["no_proxy", "NO_PROXY"],
]);

export function wellKnownUserToolchainBins(options: any = {}): string[] {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const dirs: string[] = [];

  const npmPrefixRaw = env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
  if (typeof npmPrefixRaw === "string") {
    const npmPrefix = npmPrefixRaw.trim();
    if (npmPrefix.length > 0) {
      dirs.push(join(npmPrefix, "bin"));
      if (process.platform === "win32") dirs.push(npmPrefix);
    }
  } else if (process.platform === "win32") {
    try {
      const npmPrefix = execFileSync("npm", ["config", "get", "prefix"], {
        encoding: "utf8", timeout: 3_000, windowsHide: true,
      }).trim();
      if (npmPrefix.length > 0) {
        dirs.push(join(npmPrefix, "bin"));
        dirs.push(npmPrefix);
      }
    } catch {}
  }

  if (process.platform === "win32") {
    dirs.push(join(home, "AppData", "Roaming", "npm"));
  }
  dirs.push(
    join(home, ".local", "bin"), join(home, ".npm-global", "bin"),
    join(home, ".npm-packages", "bin"), join(home, ".cargo", "bin"),
  );
  return dirs;
}