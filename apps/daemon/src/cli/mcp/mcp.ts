// @ts-nocheck
/** @module cli/mcp/mcp
 * Implements `od mcp` (stdio MCP server) and `od mcp install` dispatcher.
 * Proxies daemon tool calls into external coding agents; resolves launch specs from daemon config.
 */
import { AGENT_SLUGS } from '../../mcp-agent-install.js';
import { cliDaemonBaseUrl, cliDaemonUrl, parseFlags } from '../core/index.js';
import { runMcpInstall } from './install.js';

/** Whitelist of string flags for `od mcp` (daemon-url only). */
const MCP_STRING_FLAGS = new Set([
  'daemon-url',
]);

/** Whitelist of boolean flags for `od mcp`. */
const MCP_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
]);

/**
 * Entry point for `od mcp` and `od mcp install` subcommands.
 * Routes to install flow or starts stdio MCP server proxying daemon tools.
 */
export async function runMcp(args) {
  if (args[0] === 'install') {
    return runMcpInstall(args.slice(1));
  }
  let flags;
  try {
    flags = parseFlags(args, {
      string: MCP_STRING_FLAGS,
      boolean: MCP_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    printMcpHelp();
    process.exit(2);
  }
  if (flags.help || flags.h) {
    printMcpHelp();
    return;
  }

  const daemonUrl = await cliDaemonUrl(flags);

  const { runMcpStdio } = await import('./mcp.js');
  await runMcpStdio({ daemonUrl });
}

/**
 * Prints usage and tool inventory for the stdio MCP server.
 * @internal
 */
function printMcpHelp() {
  console.log(`Usage: od mcp [--daemon-url <url>]

Run a stdio MCP (Model Context Protocol) server that proxies project
tool calls to a running Open Design daemon. Wire it into a coding agent
in another repo so the agent can pull files from a local Open Design
project and create project-scoped artifacts without exporting a zip
every iteration.

Options:
  --daemon-url <url>   Open Design daemon HTTP base URL. Resolution
                       order: this flag, OD_DAEMON_URL, OD_SIDECAR_IPC_PATH,
                       then http://127.0.0.1:7456. Each new MCP spawn
                       discovers the live daemon URL at startup, so
                       MCP client configs stay valid across daemon
                       restarts even when the port is ephemeral. A
                       running MCP server caches the URL; restart the
                       MCP client after a daemon restart to pick up a
                       new port.

Tools exposed:
  list_projects                  list every Open Design project
  get_active_context             what project/file the user has open right now
  get_artifact([project, entry]) bundle: entry file + every referenced sibling
  get_project([project])         single project metadata
  get_file([project, path])      file contents (textual mimes only for now)
  search_files(query[, project]) literal substring search across textual files
  list_files([project])          project files + artifactManifest sidecars
  create_artifact(name, content) create one normal artifact entry file

When project is omitted, get_artifact / get_project / get_file /
search_files / list_files / create_artifact default to the project the
user has open in Open Design; get_artifact and get_file additionally
default to the active file. The response stamps usedActiveContext so
callers can see which project/file got resolved.

For the copy-paste, per-client snippet (with absolute paths resolved
for your machine, plus a one-click deeplink for Cursor), open Settings
→ MCP server in the Open Design app. The daemon must be running locally
for tool calls to succeed.

To register this server into a coding agent's own config automatically:
  od mcp install <agent> [--uninstall] [--print] [--json] [--daemon-url <url>]
  Agents: ${AGENT_SLUGS.join(' ')}`);
}

// Resolve the canonical launch spec from the running daemon's
// /api/mcp/install-info (the same payload the Settings → MCP panel and the
// Codex one-click install use), so every install path configures byte-for-
// byte the same command. Falls back to a minimal `od mcp --daemon-url`
// spec when the daemon is unreachable.
/**
 * Resolves the canonical launch spec from daemon /api/mcp/install-info.
 * Falls back to minimal `od mcp --daemon-url` spec when daemon unreachable.
 * Ensures every install path (Settings, Codex, CLI) configures identical bytes.
 */
export async function resolveMcpLaunchSpec(flags) {
  const base = await cliDaemonBaseUrl(flags);
  try {
    const resp = await fetch(`${base}/api/mcp/install-info`);
    if (resp.ok) {
      const info = await resp.json();
      if (info && typeof info.command === 'string' && Array.isArray(info.args)) {
        return {
          command: info.command,
          args: info.args,
          env: info.env && typeof info.env === 'object' ? info.env : {},
        };
      }
    }
  } catch {
    // daemon not running / unreachable — fall through to the minimal spec
  }
  return {
    command: 'od',
    args: ['mcp', '--daemon-url', base],
    env: {},
  };
}
