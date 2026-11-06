import { agentCapabilities } from '../capabilities.js';
import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Codebuddy Code (https://www.codebuddy.cn) — a Claude Code–compatible CLI
// that ships as `codebuddy` (short alias: `cbc`). The argument surface is a
// superset of Claude Code's `-p` mode: `--output-format stream-json`,
// `--input-format stream-json`, `--permission-mode`, `--session-id`,
// `--resume`, `--add-dir`, `--include-partial-messages`, and `--model` all
// work identically. The stream wire format matches Claude Code's, so we reuse
// `streamFormat: 'claude-stream-json'`.
//
// Key differences from the claude adapter:
//   • Binary names: `codebuddy` / `cbc` (not `claude` / `openclaude`).
//   • `--effort` flag for reasoning control (minimal/low/medium/high/xhigh/max).
//   • A multi-provider model list advertised in `--help` and selected through
//     `--model <id>`.
//   • `--mcp-config <fileOrString>` for MCP server injection (the daemon can
//     also write `.mcp.json` to the project cwd, same as Claude Code).

function parseCodebuddyHelpModels(stdout: string) {
  const advertised = stdout.match(
    /--model <model>[\s\S]*?Currently supported:\s*\(([^)]*)\)/i,
  )?.[1];
  if (!advertised) return null;

  const modelIds = [...new Set(
    advertised
      .split(',')
      .map((modelId) => modelId.trim())
      .filter((modelId) => modelId.length > 0 && modelId !== DEFAULT_MODEL_OPTION.id),
  )];
  if (modelIds.length === 0) return null;

  return [
    DEFAULT_MODEL_OPTION,
    ...modelIds.map((modelId) => ({ id: modelId, label: modelId })),
  ];
}

export const codebuddyAgentDef = {
    id: 'codebuddy',
    name: 'Codebuddy Code',
    bin: 'codebuddy',
    // `cbc` is the short alias shipped alongside `codebuddy`. Tried as a
    // fallback when the primary binary isn't on PATH.
    fallbackBins: ['cbc'],
    versionArgs: ['--version'],
    helpArgs: ['-p', '--help'],
    capabilityFlags: {
      // Same probing strategy as the claude adapter: these flags live under
      // the `-p` subcommand help, so we probe `codebuddy -p --help`.
      '--include-partial-messages': 'partialMessages',
      '--add-dir': 'addDir',
    },
    // Codebuddy has no `models` subcommand, but the installed build advertises
    // its supported ids in root help. Parse that version-local catalog instead
    // of surfacing a static list that drifts as Codebuddy updates.
    listModels: {
      args: ['--help'],
      parse: parseCodebuddyHelpModels,
      timeoutMs: 10_000,
    },
    // If an older build omits the catalog or help changes shape, fail closed to
    // Codebuddy's configured default rather than offering unverified ids.
    fallbackModels: [DEFAULT_MODEL_OPTION],
    // Codebuddy CLI --effort supports exactly 6 levels:
    //   minimal, low, medium, high, xhigh, max
    // We additionally expose a synthetic `default` sentinel as the FIRST
    // option so the web pickers (AvatarMenu / SettingsDialog) — which
    // fall back to `reasoningOptions[0].id` when nothing is saved yet —
    // surface a real "use Codebuddy's own default" choice that round-trips
    // to "no --effort flag". `buildArgs` treats `default` as omit.
    reasoningOptions: [
      { id: 'default', label: 'Default' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'XHigh' },
      { id: 'max', label: 'Max' },
    ],
    buildArgs: (_prompt, _imagePaths, extraAllowedDirs = [], options = {}, runtimeContext = {}) => {
      const caps = agentCapabilities.get('codebuddy') || {};
      // Same stdin strategy as Claude Code: `--input-format stream-json`
      // enables JSONL stdin so the daemon can answer AskUserQuestion tool
      // calls. `--output-format stream-json` gives us SSE-style events.
      const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
      // `--include-partial-messages` lands richer streaming deltas. Gate on
      // the help-text probe to avoid "unknown option" errors on older builds.
      if (caps.partialMessages) {
        args.push('--include-partial-messages');
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      // Reasoning effort control — Codebuddy supports `--effort <level>`.
      // The `default` sentinel means "let Codebuddy pick" — omit the flag.
      if (options.reasoning && options.reasoning !== 'default') {
        args.push('--effort', options.reasoning);
      }
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      if (dirs.length > 0 && caps.addDir !== false) {
        args.push('--add-dir', ...dirs);
      }
      // Session continuity: Codebuddy supports `--resume <id>` and
      // `--session-id <uuid>` identically to Claude Code.
      if (typeof runtimeContext.resumeSessionId === 'string' && runtimeContext.resumeSessionId) {
        args.push('--resume', runtimeContext.resumeSessionId);
      } else if (typeof runtimeContext.newSessionId === 'string' && runtimeContext.newSessionId) {
        args.push('--session-id', runtimeContext.newSessionId);
      }
      args.push('--permission-mode', 'bypassPermissions');
      return args;
    },
    promptViaStdin: true,
    promptInputFormat: 'stream-json',
    streamFormat: 'claude-stream-json',
    // Codebuddy CLI auto-loads `.mcp.json` from the project cwd at spawn
    // (same behavior as Claude Code), so the daemon can write the user's
    // external MCP servers there before launching.
    externalMcpInjection: 'claude-mcp-json',
    resumesSessionViaCli: true,
    installUrl: 'https://www.codebuddy.cn',
    docsUrl: 'https://www.codebuddy.cn/docs/workbuddy/Overview',
} satisfies RuntimeAgentDef;
