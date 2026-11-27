import { agentCapabilities } from '../capabilities.js';
import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

// Command Code (https://commandcode.ai) — `npm i -g command-code`. The package
// `bin` map ships `command-code`, `cmdc`, `commandcode` and `cmd` on every
// platform; we probe `command-code` first and never `cmd`, which on Windows is
// the shell and not this CLI.
//
// Transport:
//   - `-p` / `--print` is the headless entry point. With no query argument and
//     a piped stdin the CLI reads the prompt from stdin, which is how OD hands
//     over the composed prompt (`promptViaStdin`) — so there is no argv length
//     cap and this adapter needs no `maxPromptArgBytes` guard.
//   - `--output-format json` turns stdout into NDJSON: one
//     `{"type":"event","event":{…}}` frame per progress event plus a single
//     terminal `{"type":"result",…}` frame. The wire format is Command Code's
//     own (not Claude's stream-json, not Codex's item stream), so it gets its
//     own `streamFormat` and parser instead of borrowing another adapter's.
//   - The assistant text streams as `text_delta` frames and is repeated in
//     full on the terminal result frame; the parser emits the deltas and falls
//     back to `finalText` only when none arrived, so the answer never renders
//     twice. Tool calls carry their input on `tool_queued` and their output on
//     `tool_completed` / `tool_errored`.
//   - `--yolo` is mandatory. Headless mode denies file writes and shell
//     commands by default, so without it the agent can only read. `--trust`
//     skips the project trust prompt and `--skip-onboarding` skips taste
//     onboarding — the daemon spawns without a TTY, so an interactive prompt
//     would hang the run until the watchdog kills it.
//
// Sessions: `run_start` announces the session id the CLI minted (the terminal
// result frame repeats it, used only as a fallback). The daemon captures it
// (`capturesSessionIdFromStream`) and continues the conversation with
// `--resume <id>`. A bare `--resume` errors in print mode, so the flag is only
// appended when a stored id exists.
//
// Models: `--list-models` prints the installed build's own catalog. The
// curated `fallbackModels` below cover the window before discovery lands and
// carry the exact per-model reasoning efforts from that catalog; live ids that
// match a fallback entry inherit those efforts through
// `mergeFallbackModelMetadata`. Ids are exact and lowercase exactly as the CLI
// prints them — `org/name` for open models, bare for Anthropic/OpenAI — and an
// unknown id is rejected by the CLI, so the live list is the authority.

const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/;

// Effort choices for one model. Labels are spelled out rather than derived from
// the id so the picker reads like the other adapters that expose the same five
// levels (Codebuddy), while the id stays exactly what `--effort` accepts.
const EFFORT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
};

// `default` comes first and is a sentinel: both pickers fall back to the first
// entry when nothing is saved yet, and `buildArgs` omits `--effort` for it, so
// an untouched picker keeps letting Command Code decide its own reasoning
// depth.
function effortOptions(levels: string[]): RuntimeModelOption[] {
  return [
    { id: 'default', label: 'Default', default: true },
    ...levels.map((level) => ({ id: level, label: EFFORT_LABELS[level] ?? level })),
  ];
}

// `--list-models` prints a human-readable catalog, not a machine list. Verified
// against CLI 1.69.0 the shape is:
//
//   Available models  ·  84 models
//
//   Open Source
//
//   deepseek/deepseek-v4-pro               hybrid-attention long-context reasoning
//   moonshotai/kimi-k3                     long-horizon coding & knowledge work with 1M context
//
//   Decision models (headless only)
//   typesafe/jev  typed questions in, probabilities out
//
//   Docs:  https://commandcode.ai/docs/reference/cli/models
//
// so a line is a model row when its first whitespace-delimited token is an id,
// that token carries a `/` or `-` (every catalog id does; the header, the
// section names, the `cmdc --model …` examples and the `Docs:` footer do not),
// and any trailing description is separated by the table's 2+ space gutter.
// A JSON array is accepted too — the automation-facing shape has moved before —
// and anything the parser cannot prove is an id is dropped rather than
// surfaced, so a future layout degrades to the curated fallback instead of
// poisoning the picker with column headers.
function parseCommandCodeModels(stdout: string): RuntimeModelOption[] | null {
  const text = String(stdout || '').trim();
  if (!text) return null;
  let candidates: string[] = [];
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        candidates = parsed.filter((entry): entry is string => typeof entry === 'string');
      }
    } catch {
      // fall through to the line parse
    }
  }
  if (candidates.length === 0) {
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const first = line.split(/\s+/)[0] ?? '';
      if (!MODEL_ID_RE.test(first)) continue;
      if (!/[/-]/.test(first)) continue;
      if (line !== first && !/\S\s{2,}\S/.test(line)) continue;
      candidates.push(first);
    }
  }
  const seen = new Set<string>();
  const models: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  for (const id of candidates) {
    if (!id || id === DEFAULT_MODEL_OPTION.id || seen.has(id)) continue;
    if (!MODEL_ID_RE.test(id)) continue;
    seen.add(id);
    models.push({ id, label: id });
  }
  return models.length > 1 ? models : null;
}

export const commandCodeAgentDef = {
  id: 'command-code',
  name: 'Command Code',
  bin: 'command-code',
  // Short aliases from the same package `bin` map, tried when the canonical
  // name is not on PATH. `cmd` is deliberately absent (Windows shell).
  fallbackBins: ['cmdc', 'commandcode'],
  versionArgs: ['--version'],
  helpArgs: ['--help'],
  // Gated rather than assumed: a build that does not advertise a flag never
  // receives it, and a failed help probe leaves the defaults below in charge.
  capabilityFlags: {
    '--add-dir': 'addDir',
    '--effort': 'effort',
    '--trust': 'trust',
    '--tools-enable': 'toolsEnable',
  },
  listModels: {
    args: ['--list-models'],
    parse: parseCommandCodeModels,
    timeoutMs: 30_000,
  },
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    {
      id: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      reasoningOptions: effortOptions(['high', 'max']),
    },
    {
      id: 'deepseek/deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      reasoningOptions: effortOptions(['high', 'max']),
    },
    {
      id: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      reasoningOptions: effortOptions(['low', 'medium', 'high', 'xhigh', 'max']),
    },
    {
      id: 'gpt-5.3-codex',
      label: 'GPT-5.3 Codex',
      reasoningOptions: effortOptions(['low', 'medium', 'high', 'xhigh']),
    },
    {
      id: 'zai-org/glm-5.3',
      label: 'GLM-5.3',
      reasoningOptions: effortOptions(['low', 'high', 'max']),
    },
    {
      id: 'minimaxai/minimax-m3',
      label: 'MiniMax M3',
      reasoningOptions: effortOptions(['low', 'medium', 'high']),
    },
    {
      id: 'qwen/qwen3.8-max',
      label: 'Qwen 3.8 Max',
      reasoningOptions: effortOptions(['low', 'medium', 'xhigh']),
    },
    { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5' },
  ],
  buildArgs: (_prompt, _imagePaths, extraAllowedDirs = [], options = {}, runtimeContext = {}) => {
    const caps = agentCapabilities.get('command-code') || {};
    // `-p` with no query argument: headless mode reads the prompt from stdin.
    const args = ['-p', '--output-format', 'json', '--skip-onboarding', '--yolo'];
    if (caps.trust !== false) {
      args.push('--trust');
    }
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    // The `default` sentinel means "let Command Code pick" — omit the flag.
    if (options.reasoning && options.reasoning !== 'default' && caps.effort !== false) {
      args.push('--effort', options.reasoning);
    }
    const dirs = (extraAllowedDirs || []).filter(
      (dir) => typeof dir === 'string' && dir.length > 0,
    );
    if (dirs.length > 0 && caps.addDir !== false) {
      for (const dir of dirs) args.push('--add-dir', dir);
    }
    if (typeof runtimeContext.resumeSessionId === 'string' && runtimeContext.resumeSessionId) {
      args.push('--resume', runtimeContext.resumeSessionId);
    }
    // Headless runs withhold the human-at-the-keyboard tools. `todo_write` is
    // the one worth restoring: it feeds the chat's execution record and plan
    // pill. `ask_user_question` stays withheld — the web has no answer path for
    // it, and the composed prompt already asks through the question-form
    // artifact. Only a build that advertises `--tools-enable` is given the flag.
    if (caps.toolsEnable === true) {
      args.push('--tools-enable', 'todo_write');
    }
    return args;
  },
  promptViaStdin: true,
  streamFormat: 'command-code-stream-json',
  // Command Code reads `mcpServers` from the project-scope `.mcp.json`, which is
  // the same file and shape `buildClaudeMcpJson()` already writes into a
  // managed project cwd for Claude Code.
  externalMcpInjection: 'claude-mcp-json',
  authProbe: {
    // `whoami` prints the signed-in account (`Name` / `Email` / `Username`) and
    // exits 0. Signed out it exits non-zero with the CLI's own `Not
    // authenticated…` line, which the shared classifier reads as a missing
    // credential; anything it cannot classify stays `unknown` rather than
    // becoming a fabricated "sign in" card.
    args: ['whoami'],
    timeoutMs: 15_000,
  },
  resumesSessionViaCli: true,
  capturesSessionIdFromStream: true,
  installUrl: 'https://commandcode.ai/docs/quickstart',
  docsUrl: 'https://commandcode.ai/docs',
} satisfies RuntimeAgentDef;
