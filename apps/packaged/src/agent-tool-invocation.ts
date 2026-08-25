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
