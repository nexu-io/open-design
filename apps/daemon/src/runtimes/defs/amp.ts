import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Amp CLI (https://ampcode.com) is a full agentic coding CLI, argv-shaped
// much like Claude Code: it has a headless execute mode and emits a
// "Claude Code-compatible stream JSON format", which lets us reuse the
// existing `claude-stream-json` parser verbatim instead of writing a new one.
//
// Transport:
//   - `-x` / `--execute` runs headless: the agent executes the prompt and
//     prints only its final assistant message (we read the structured
//     stream instead). The prompt is delivered via stdin (`promptViaStdin`),
//     matching the `echo "..." | amp -x` shape documented in `amp --help`.
//     This avoids the argv length caps that bite copilot/claude on a single
//     `-p <body>` argv entry.
//   - `--stream-json` (requires `--execute`) switches stdout to the
//     Claude-Code-compatible JSONL stream the daemon already parses.
//   - `--dangerously-allow-all` is the non-interactive auto-approve flag
//     (Amp's equivalent of Copilot's `--allow-all-tools` / Codex's headless
//     auto-approve): without it the agent blocks waiting for human approval
//     on every tool call.
//
// Prompt stays plain-text on stdin (default `promptInputFormat`), so the
// daemon writes the composed prompt and closes stdin — a clean one-shot
// turn. We deliberately do NOT use `--stream-json-input`; that path is for
// streaming further JSONL user messages mid-turn (Claude's AskUserQuestion
// tool_result loop), which Amp does not need for the render flow.
//
// Models: Amp has no `--model` flag — it selects the model through its agent
// `--mode` (deep / smart / rush). We surface those modes through the model
// picker and map the chosen id onto `--mode`, and disable the free-text
// "Custom model" input since an arbitrary model id is meaningless here.
const AMP_MODES = new Set(['deep', 'smart', 'rush']);

export const ampAgentDef = {
  id: 'amp',
  name: 'Amp',
  bin: 'amp',
  versionArgs: ['--version'],
  // The "model" picker actually selects Amp's agent mode.
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'smart', label: 'Smart (mode)' },
    { id: 'deep', label: 'Deep (mode)' },
    { id: 'rush', label: 'Rush (mode)' },
  ],
  supportsCustomModel: false,
  buildArgs: (_prompt, _imagePaths, _extraAllowedDirs = [], options = {}) => {
    const args = ['-x', '--stream-json', '--dangerously-allow-all'];
    if (options.model && options.model !== 'default' && AMP_MODES.has(options.model)) {
      args.push('--mode', options.model);
    }
    return args;
  },
  promptViaStdin: true,
  streamFormat: 'claude-stream-json',
} satisfies RuntimeAgentDef;
