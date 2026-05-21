import { parseLineSeparatedModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// xAI's first-party CLI agent — https://x.ai/cli — distributed as the
// `grok` binary. Installed via `curl -fsSL https://x.ai/cli/install.sh | bash`,
// which symlinks `~/.grok/bin/grok` into PATH.
//
// `grok` ships its own SuperGrok OAuth dance (same `auth.x.ai` issuer +
// loopback-redirect shape Open Design's xAI Settings panel uses), so it's
// already authenticated by the time OD detects the binary; OD does not
// need to inject credentials. Users authenticate once with `grok login
// --oauth` and the resulting `~/.grok/auth.json` is what every spawned
// invocation reads.
//
// Headless mode follows Claude Code's pattern (`-p <PROMPT>` for single-
// turn, `--output-format streaming-json` for structured streaming), but
// the streaming-json schema is xAI-specific and we do not yet have a
// daemon-side parser for it. To ship the runtime now and let users at
// least chat with grok inside OD, this defaults to `plain` streamFormat
// (single-turn text reply, no tool_use streaming). Upgrading to a
// `grok-stream-json` event parser is follow-up work once the format is
// stable enough to lock in.
export const grokBuildAgentDef = {
  id: 'grok-build',
  name: 'Grok Build',
  bin: 'grok',
  versionArgs: ['--version'],
  helpArgs: ['-p', '--help'],
  // `grok models` prints one model id per line, plus a `Default model:`
  // header line that parseLineSeparatedModels strips because it isn't
  // an id token. Falls back to the static list below when probing fails
  // (no SuperGrok Heavy entitlement on this machine, network blip, etc.).
  listModels: {
    args: ['models'],
    timeoutMs: 10_000,
    parse: parseLineSeparatedModels,
  },
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'grok-build', label: 'grok-build (xAI · default)' },
    { id: 'grok-4.3', label: 'grok-4.3 (xAI)' },
    { id: 'grok-4.20-reasoning', label: 'grok-4.20-reasoning (xAI · deep)' },
    {
      id: 'grok-4.20-non-reasoning',
      label: 'grok-4.20-non-reasoning (xAI · fast)',
    },
    {
      id: 'grok-4.20-multi-agent',
      label: 'grok-4.20-multi-agent (xAI · orchestration)',
    },
  ],
  // Prompt delivered via stdin so Windows `spawn ENAMETOOLONG` and Linux
  // `spawn E2BIG` can't truncate large composed prompts. `grok -p` with
  // no positional argument reads from piped stdin.
  buildArgs: (_prompt, _imagePaths, _extra = [], options = {}) => {
    const args = ['-p'];
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    if (options.reasoning) {
      args.push('--effort', options.reasoning);
    }
    return args;
  },
  reasoningOptions: [
    { id: 'low', label: 'low' },
    { id: 'medium', label: 'medium' },
    { id: 'high', label: 'high' },
    { id: 'xhigh', label: 'xhigh' },
    { id: 'max', label: 'max' },
  ],
  promptViaStdin: true,
  streamFormat: 'plain',
  installUrl: 'https://x.ai/cli',
  docsUrl: 'https://x.ai/cli',
} satisfies RuntimeAgentDef;
