#!/usr/bin/env node
// @ts-nocheck
/**
 * @module cli-entry
 *
 * Thin composition root for the `od` CLI. All subcommand behavior lives in
 * `./cli/<concern>/` capability-barrel modules; this file only owns argv
 * intake, the subcommand routing table, root help, and the legacy `tools *`
 * delegations. Keep it wiring-only: new subcommand logic belongs in a
 * `./cli/` concern module, exported through `./cli/index.js`.
 */
import { runDaemonCliStartup } from './daemon-startup.js';
import { runLiveArtifactsMcpServer } from './mcp-live-artifacts-server.js';
import { runArtifactsCli } from './artifacts-cli.js';
import { runConnectorsToolCli } from './tools-connectors-cli.js';
import { runDesignSystemsToolCli } from './tools-design-systems-cli.js';
import { runLiveArtifactsToolCli } from './tools-live-artifacts-cli.js';
import {
  runAmr,
  runAtoms,
  runAutomation,
  runBrand,
  runChat,
  runConfig,
  runConversation,
  runCraft,
  runDaemon,
  runDesignSystems,
  runDiagnostics,
  runDoctor,
  runExport,
  runFigma,
  runFiles,
  runLibrary,
  runMarketplace,
  runMcp,
  runMedia,
  runMemory,
  runPlugin,
  runProject,
  runResearch,
  runRun,
  runShare,
  runSkills,
  runStatus,
  runTemplates,
  runUi,
  runVersion,
} from './cli/index.js';

const argv = process.argv.slice(2);

// ---- Subcommand router ----------------------------------------------------
//
// `od` is two CLIs glued together:
//   - default mode: starts the daemon + opens the web UI.
//   - `od media …`: a thin client that POSTs to the running daemon. This
//     is what the code agent invokes from inside a chat to actually
//     produce image / video / audio bytes (the unifying contract).
//
// We dispatch on the first positional argument so flags like --port keep
// working unchanged. Subcommand routing is keyword-based; flags are
// parsed inside each handler.

async function runArtifacts(args) {
  const { exitCode } = await runArtifactsCli(args);
  process.exit(exitCode);
}

const SUBCOMMAND_MAP = {
  artifacts: runArtifacts,
  media: runMedia,
  mcp: runMcp,
  amr: runAmr,
  research: runResearch,
  plugin: runPlugin,
  ui: runUi,
  marketplace: runMarketplace,
  share: runShare,
  brand: runBrand,
  brands: runBrand,
  project: runProject,
  automation: runAutomation,
  automations: runAutomation,
  memory: runMemory,
  run: runRun,
  files: runFiles,
  templates: runTemplates,
  conversation: runConversation,
  chat: runChat,
  daemon: runDaemon,
  atoms: runAtoms,
  skills: runSkills,
  'design-systems': runDesignSystems,
  craft: runCraft,
  diagnostics: runDiagnostics,
  export: runExport,
  status: runStatus,
  version: runVersion,
  doctor: runDoctor,
  config: runConfig,
  library: runLibrary,
  figma: runFigma,
};

if (argv[0] === 'mcp' && argv[1] === 'live-artifacts') {
  try {
    const { exitCode } = await runLiveArtifactsMcpServer();
    process.exit(exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
    process.exit(1);
  }
}

const first = argv.find((a) => !a.startsWith('-'));
if (first && SUBCOMMAND_MAP[first]) {
  const idx = argv.indexOf(first);
  const rest = [...argv.slice(0, idx), ...argv.slice(idx + 1)];
  await SUBCOMMAND_MAP[first](rest);
  process.exit(0);
}

if (argv[0] === 'tools' && argv[1] === 'live-artifacts') {
  runLiveArtifactsToolCli(argv.slice(2))
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
      process.exitCode = 1;
    });
} else if (argv[0] === 'tools' && argv[1] === 'connectors') {
  runConnectorsToolCli(argv.slice(2))
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
      process.exitCode = 1;
    });
} else if (argv[0] === 'tools' && argv[1] === 'design-systems') {
  runDesignSystemsToolCli(argv.slice(2))
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
      process.exitCode = 1;
    });
} else {
  await runDaemonCliStartup(argv, { printHelp: printRootHelp });
}

function printRootHelp() {
  console.log(`Usage:
  od [--port <n>] [--host <addr>] [--no-open]
      Start the local daemon and open the web UI.

  od tools live-artifacts <create|list|update|refresh> [options]
      Manage live artifacts through daemon wrapper commands.

  od artifacts create --name <path> --input <file> [--project <id-or-name>]
      Create a normal project artifact through the local daemon.

  od tools connectors <list|execute|github-design-context> [options]
      Discover and execute configured connectors.

  od tools design-systems read --path <manifest-declared-path>
      Read active design-system pull-layer files through daemon wrapper commands.

  od mcp live-artifacts
      Start the MCP server exposing live-artifact and connector tools.

  od research search --query <text> [--max-sources 5] [--daemon-url <url>]
      Run agent-callable Tavily research through the local daemon.

  od plugin <list|info|install|uninstall|apply|doctor|replay|trust> [args]
      Discover, install, and apply plugins through the local daemon.
  od plugin publish-repo <folder>
      Create/update the author's GitHub repo for a local plugin folder.
  od plugin open-design-pr <folder>
      Push a community-catalog branch and open the Open Design PR form.

  od automation <list|get|create|update|run|runs|pause|resume|delete> [args]
      Drive the Automations surface headlessly. Same store as the UI's
      Automations tab, so an external agent (hermes, openclaw, ...) can
      schedule, trigger, or harvest results from a routine without
      opening the web UI.

  od memory tree <list|view|edit|move> [args]
      Inspect and edit the memory tree that is injected into agent prompts.

  od share <open-design|url> [options]
      Build localized social-share targets for the Open Design repo or a
      deployed project URL. Use --json for scripted integrations.

  od ui <list|show|respond|revoke|prefill> [args]
      Read and answer GenUI surfaces (form / choice / confirmation / oauth-prompt) headlessly.

  od chat new --project <id> [--seed-from <cid>] [--fork-after <mid>] [--title "<t>"] [--json]
      Create a Side Chat: a new conversation that inherits another
      conversation's context by copying its messages (--seed-from), optionally
      stopping at one message (--fork-after). Mirrors the web chat fork action.

  od diagnostics export [<path>] [--json]
      Bundle daemon/web/desktop logs, machine info, and recent crash reports
      into a zip for support tickets. Same output as Settings → About →
      Export diagnostics.

  od export <file> --project <id> --format <pdf|image|pptx> [--out <path>]
      Programmatically export an HTML/deck artifact to PDF, image, or PPTX
      (no model/agent calls). Mirrors the web Download menu; rasterization uses
      the desktop runtime's bundled Chromium.

  "$OD_NODE_BIN" "$OD_BIN" tools ...
      Recommended agent-runtime form; avoids relying on user PATH for od or node.

  od media generate --surface <image|video|audio> --model <id> [opts]
      Generate a media artifact and write it into the active project.
      Designed to be invoked by a code agent - picks up OD_DAEMON_URL
      and OD_PROJECT_ID from the env that the daemon injected on spawn.

  od mcp [--daemon-url <url>]
      Run a stdio MCP server that proxies project tool calls to a
      running Open Design daemon. Wire it into a coding agent
      (Claude Code, Cursor, VS Code, Zed, Windsurf) in another repo
      to pull files from a local Open Design project and create
      project-scoped artifacts without exporting a zip.

Options:
  --port <n>       Port to listen on (default: 7456, env: OD_PORT).
  --host <addr>    Interface address to bind to (default: 127.0.0.1, env: OD_BIND_HOST).
                   Set to a specific IP (e.g. a Tailscale address) to restrict access
                   to that interface only.
  --no-open        Do not open the browser after start.

What the daemon does:
  * scans PATH for installed code-agent CLIs (claude, codex, devin, opencode, cursor-agent, ...)
  * serves the chat UI at http://<host>:<port>
  * proxies messages (text + images) to the selected agent via child-process spawn
  * exposes /api/projects/:id/media/generate — the unified image/video/audio
     dispatcher that the agent calls via \`od media generate\`.`);
}
