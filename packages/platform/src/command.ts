/**
 * @module command
 *
 * Cross-platform command-invocation construction. Turns a requested
 * `{ command, args, env }` into the concrete `{ command, args }` (plus the
 * Windows-only `windowsVerbatimArguments` flag) that `child_process.spawn` /
 * `execFile` must receive so `.bat` / `.cmd` shims and Corepack-only package
 * managers launch correctly on every platform.
 *
 * Consumed by the `process` module's spawn helpers; owns no process lifecycle
 * itself.
 */
import { extname } from "node:path";

export type CommandInvocation = {
  args: string[];
  command: string;
  // When true, callers must forward this to `child_process.spawn` /
  // `child_process.execFile` options. Required for Windows `.bat` / `.cmd`
  // shims so cmd.exe's `/s /c` quoting survives Node's default per-arg
  // CommandLineToArgvW escaping. See `createCommandInvocation`.
  windowsVerbatimArguments?: boolean;
};

export type CommandInvocationRequest = {
  args?: string[];
  command: string;
  env?: NodeJS.ProcessEnv;
};

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

/**
 * Resolve a command request into the concrete invocation to spawn. On Windows,
 * `.bat` / `.cmd` targets are rewrapped as a `cmd.exe /d /s /c "..."` shim with
 * `windowsVerbatimArguments` so quoting and percent-expansion behave safely;
 * every other case passes the command and args straight through.
 *
 * @param request - The command, optional args, and env to base the invocation on.
 * @returns The `{ command, args }` (plus `windowsVerbatimArguments` when a shim is used) to spawn.
 */
export function createCommandInvocation({ args = [], command, env = process.env }: CommandInvocationRequest): CommandInvocation {
  if (process.platform === "win32" && /\.(bat|cmd)$/i.test(command)) {
    return buildCmdShimInvocation(command, args, env);
  }
  return { args, command };
}

/**
 * Build the invocation for re-entering the repo-pinned package manager. Prefers
 * `npm_execpath` (routing Node-loadable managers through `process.execPath`),
 * and otherwise falls back to `corepack pnpm …` so Corepack-only setups without
 * a global `pnpm` on PATH still work. See #2438.
 *
 * @param args - Arguments to pass to the package manager.
 * @param env - Environment to read `npm_execpath` / `ComSpec` from (defaults to `process.env`).
 * @returns The `{ command, args }` invocation that runs the package manager.
 */
export function createPackageManagerInvocation(args: string[], env: NodeJS.ProcessEnv = process.env): CommandInvocation {
  const execPath = env.npm_execpath;
  if (execPath) {
    if (nodeLoadablePackageManagerExtensions.has(extname(execPath).toLowerCase())) {
      return { args: [execPath, ...args], command: process.execPath };
    }
    return createCommandInvocation({ args, command: execPath, env });
  }
  // No `npm_execpath` — common on Corepack-only setups (e.g. native Windows
  // PowerShell where `corepack pnpm` works but no standalone `pnpm` lives on
  // PATH). Route nested invocations through `corepack pnpm …` instead of
  // assuming a global `pnpm` binary: `corepack pnpm …` runs the repo-pinned
  // package manager out of the box, while a bare `pnpm` only resolves when a
  // separate global install or a `corepack enable` shim is present. See #2438.
  if (process.platform === "win32") {
    return buildCmdShimInvocation("corepack", ["pnpm", ...args], env);
  }
  return { args: ["pnpm", ...args], command: "corepack" };
}
