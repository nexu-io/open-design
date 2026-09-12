import { spawn, type ChildProcess } from "node:child_process";

import { resolvePackagedElectronNodeCommand } from "./sidecars.js";

const AGENT_CLI_BASENAMES = new Set(["daemon-cli.mjs", "cli.js"]);

/** Cross-platform basename: packaged entry paths arrive as win32 or POSIX strings regardless of host OS. */
function portableBasename(entryPath: string): string {
  const lastSeparator = Math.max(entryPath.lastIndexOf("/"), entryPath.lastIndexOf("\\"));
  return lastSeparator === -1 ? entryPath : entryPath.slice(lastSeparator + 1);
}

/**
 * Agent-internal CLI invocations of the packaged binary (argv[1] = bundled daemon CLI
 * entry) must run as Node against the daemon instead of entering the desktop
 * single-instance gate — OD_NODE_BIN falls back to the desktop exe when no bundled
 * node.exe ships. Environment is deliberately not an input: run-scoped agent env
 * (OD_TOOL_TOKEN, ELECTRON_RUN_AS_NODE) also rides on legitimate GUI launches.
 */
export function isAgentToolInvocation(
  argv: readonly string[],
  opts: { daemonCliEntry?: string | null } = {},
): boolean {
  const entry = argv[1];
  if (entry == null || entry.length === 0) return false;
  if (opts.daemonCliEntry != null && opts.daemonCliEntry.length > 0) {
    return entry === opts.daemonCliEntry;
  }
  return AGENT_CLI_BASENAMES.has(portableBasename(entry).toLowerCase());
}

export type AgentToolSpawn = (
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; stdio: "inherit"; windowsHide: boolean },
) => ChildProcess;

/**
 * Re-spawn an agent's daemon-CLI invocation of the packaged binary as Node.
 * The command comes from `resolvePackagedElectronNodeCommand`, so on macOS the
 * call runs the hidden App Helper rather than the main executable and cannot
 * recreate the Dock/GUI identity this bypass exists to avoid.
 *
 * A signal-terminated child (Node reports `code === null`) or a failed spawn
 * exits non-zero: an interrupted agent tools call must never look like success.
 */
export async function runAgentToolInvocation(options: {
  argv: readonly string[];
  exit: (code: number) => void;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  platform?: NodeJS.Platform;
  spawnChild?: AgentToolSpawn;
}): Promise<void> {
  const command = await resolvePackagedElectronNodeCommand(
    options.execPath ?? process.execPath,
    options.platform ?? process.platform,
  );
  const child = (options.spawnChild ?? spawn)(command, options.argv, {
    env: { ...(options.env ?? process.env), ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    windowsHide: true,
  });

  let exited = false;
  const finish = (code: number) => {
    if (exited) return;
    exited = true;
    options.exit(code);
  };
  child.on("error", () => finish(1));
  child.on("exit", (code) => finish(code ?? 1));
}
