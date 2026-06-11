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
//   • Richer multi-provider model list (GLM, Kimi, MiniMax, Claude, GPT,
//     Gemini, DeepSeek) exposed through `--model <id>`.
//   • `--mcp-config <fileOrString>` for MCP server injection (the daemon can
//     also write `.mcp.json` to the project cwd, same as Claude Code).

const CODEBUDDY_FALLBACK_MODELS = [
  DEFAULT_MODEL_OPTION,
  // GLM family (Zhipu AI)
  { id: 'glm-5.1-ioa', label: 'glm-5.1-ioa' },
  { id: 'glm-5v-turbo-ioa', label: 'glm-5v-turbo-ioa' },
  // Claude family (via Codebuddy proxy)
  { id: 'claude-opus-4.8-1m', label: 'claude-opus-4.8-1m' },
  { id: 'claude-opus-4.8', label: 'claude-opus-4.8' },
  { id: 'claude-sonnet-4.6-1m', label: 'claude-sonnet-4.6-1m' },
  { id: 'claude-haiku-4.5', label: 'claude-haiku-4.5' },
  // GPT family
  { id: 'gpt-5.5', label: 'gpt-5.5' },
  { id: 'gpt-5.4', label: 'gpt-5.4' },
  { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
  // Gemini family
  { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash' },
  // DeepSeek family
  { id: 'deepseek-v4-pro-ioa', label: 'deepseek-v4-pro-ioa' },
  { id: 'deepseek-v4-flash-ioa', label: 'deepseek-v4-flash-ioa' },
  // Kimi family
  { id: 'kimi-k2.6-ioa', label: 'kimi-k2.6-ioa' },
  // MiniMax family
  { id: 'minimax-m3-ioa', label: 'minimax-m3-ioa' },
  { id: 'minimax-m2.7-ioa', label: 'minimax-m2.7-ioa' },
];

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
    fallbackModels: CODEBUDDY_FALLBACK_MODELS,
    // Codebuddy CLI does not ship a `models` subcommand; the supported model
    // ids are advertised in `--help` output. Fallback list above covers the
    // current set; users can type custom ids through the "Custom" input.
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
