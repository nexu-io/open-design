import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Dulus — AI coding agent CLI.
// Site:    https://dulus.ai
// Docs:    https://dulus.ai/docs
// Install: `npm install -g dulus`
//
// Headless mode: `dulus run --print` executes a single turn non-interactively
// and streams the assistant reply on stdout. The composed prompt is piped over
// stdin (`promptViaStdin`) rather than packed into argv, which is what keeps
// large OD prompts clear of the Windows `CreateProcess` (~32 KB) and Linux
// `MAX_ARG_STRLEN` limits — the same reason qwen pipes instead of passing
// `--message`.
//
// Auth: Dulus owns its own credentials. Users run `dulus login` (or export the
// documented API key) before OD detects the binary; the daemon never injects
// credentials, exactly like AtomCode and Cursor Agent.
//
// Output: Dulus headless emits plain-text assistant replies with no structured
// event stream yet, so `streamFormat: 'plain'` (single-turn text reply, no
// tool_use streaming). Upgrading to `json-event-stream` is follow-up work once
// Dulus ships a stable JSON event format.
export const dulusAgentDef = {
  id: 'dulus',
  name: 'Dulus',
  bin: 'dulus',
  versionArgs: ['--version'],
  // Dulus routes to whichever upstream model the account is configured for, so
  // the picker ships only the synthetic default and relies on the custom-model
  // input for concrete ids.
  fallbackModels: [DEFAULT_MODEL_OPTION],
  // `run --print` is the non-interactive single-turn mode; `--model <id>`
  // selects the upstream model when the user picked something other than the
  // synthetic default.
  buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
    const args = ['run', '--print'];
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    return args;
  },
  promptViaStdin: true,
  streamFormat: 'plain',
  installUrl: 'https://dulus.ai',
  docsUrl: 'https://dulus.ai/docs',
} satisfies RuntimeAgentDef;
