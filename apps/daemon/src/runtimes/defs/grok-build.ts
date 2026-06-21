import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeModelOption } from '../types.js';
import type { RuntimeAgentDef } from '../types.js';

const GROK_MODEL_ID_RE = /^\*?\s*-?\s*(grok-[a-z0-9][a-z0-9._-]*)(?:\s+\(default\))?\s*$/i;

export function parseGrokBuildModels(stdout: string): RuntimeModelOption[] {
  const seen = new Set<string>();
  const out: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  for (const rawLine of String(stdout || '').split('\n')) {
    const match = rawLine.trim().match(GROK_MODEL_ID_RE);
    const id = match?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: id });
  }
  return out;
}

function grokModelSupportsReasoningEffort(model: string | null | undefined): boolean {
  if (!model || model === DEFAULT_MODEL_OPTION.id || model === 'grok-build') return false;
  return /reasoning/i.test(model);
}

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
// Headless mode uses `--prompt-file <PATH>` because recent Grok CLI builds
// require `-p/--single` to receive the prompt as an argv value and no longer
// read piped stdin. OD's composed prompts often exceed safe argv limits, so
// the daemon stages the prompt in a temp file and passes that path here. The
// CLI also exposes `--output-format streaming-json`, but
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
  // `grok models` prints status/header lines plus bullet-prefixed model ids.
  // Keep only concrete `grok-*` ids so UI pickers don't show prose such as
  // "You are logged in with grok.com" as selectable model names.
  listModels: {
    args: ['models'],
    timeoutMs: 10_000,
    parse: parseGrokBuildModels,
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
  // Grok Build CLI v0.1.212+ enforces `-p, --single <PROMPT>` as value-
  // required, while normal OD composed prompts exceed safe argv budgets.
  // Use the CLI's explicit prompt-file transport instead.
  buildArgs: (_prompt, _imagePaths, _extra = [], options = {}, runtimeContext = {}) => {
    if (!runtimeContext.promptFilePath) {
      throw new Error('grok-build requires runtimeContext.promptFilePath');
    }
    const args = ['--prompt-file', runtimeContext.promptFilePath];
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    if (options.reasoning && grokModelSupportsReasoningEffort(options.model)) {
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
  promptViaFile: true,
  promptViaStdin: false,
  streamFormat: 'plain',
  installUrl: 'https://x.ai/cli',
  docsUrl: 'https://x.ai/cli',
} satisfies RuntimeAgentDef;
