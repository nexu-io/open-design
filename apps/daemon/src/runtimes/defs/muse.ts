import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Meta's Muse Code CLI (`muse` binary). Headless mode lives behind the
// `exec` subcommand; the prompt travels via `--prompt-file` because OD's
// composed prompts routinely exceed safe argv budgets (same rationale as
// grok-build's `--prompt-file` transport).
//
// No daemon-side event parser exists for `muse exec --json` yet, so this
// ships as `plain` streamFormat (single-turn text reply, no tool_use
// streaming) — the same downgrade grok-build documents for its
// streaming-json schema. Upgrading to a structured parser is follow-up
// work once the `exec --json` event shape is stable enough to lock in.
export const museAgentDef = {
  id: 'muse',
  name: 'Muse Code',
  bin: 'muse',
  versionArgs: ['--version'],
  fallbackModels: [DEFAULT_MODEL_OPTION],
  // Headless runs need tool calls auto-approved: otherwise a write request
  // stalls on an approval prompt the daemon cannot answer. `--yolo`
  // disables approval + sandbox and trusts the workspace (the qwen adapter
  // leans on its own `--yolo` the same way). `--user-input-auto-resolve`
  // is required on top because `muse` can still stop to ask a question
  // even under `--yolo`, which would hang the run waiting for input.
  buildArgs: (_prompt, _imagePaths, _extra = [], options = {}, runtimeContext = {}) => {
    if (!runtimeContext.promptFilePath) {
      throw new Error('muse requires runtimeContext.promptFilePath');
    }
    const args = [
      'exec',
      '--prompt-file',
      runtimeContext.promptFilePath,
      '--yolo',
      '--user-input-auto-resolve',
    ];
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    if (options.reasoning && options.reasoning !== 'default') {
      args.push('--reasoning-effort', options.reasoning);
    }
    return args;
  },
  // Reasoning effort presets mirror `muse exec --help`
  // (none|minimal|low|medium|high|xhigh|max|ultra).
  reasoningOptions: [
    { id: 'default', label: 'Default' },
    { id: 'none', label: 'none' },
    { id: 'minimal', label: 'minimal' },
    { id: 'low', label: 'low' },
    { id: 'medium', label: 'medium' },
    { id: 'high', label: 'high' },
    { id: 'xhigh', label: 'xhigh' },
    { id: 'max', label: 'max' },
    { id: 'ultra', label: 'ultra' },
  ],
  promptViaFile: true,
  promptViaStdin: false,
  streamFormat: 'plain',
} satisfies RuntimeAgentDef;
