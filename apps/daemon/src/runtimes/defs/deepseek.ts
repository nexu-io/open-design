import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const deepseekAgentDef = {
    id: 'deepseek',
    name: 'DeepSeek TUI',
    // The `deepseek` dispatcher owns the `exec` / `--auto` subcommands and
    // delegates to a sibling TUI runtime binary at exec time. Upstream also
    // ships the same dispatcher as `codewhale` after the CodeWhale rename
    // (issue #2983).
    bin: 'deepseek',
    fallbackBins: ['codewhale'],
    versionArgs: ['--version'],
    // No `models` subcommand that prints a clean id-per-line list; the
    // canonical model ids for DeepSeek V4 are documented in the README,
    // and the CLI accepts arbitrary provider/model strings via `--model`,
    // so users can paste anything else through the custom-model input.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    ],
    // `--auto` enables agentic mode with auto-approval.
    // We pass `--input-format stream-json` and `--output-format stream-json`
    // to establish the end-to-end stdin contract, allowing the prompt to be
    // piped safely without hitting Windows ENAMETOOLONG limits.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = [
        'exec', 
        '--auto', 
        '--input-format', 'stream-json', 
        '--output-format', 'stream-json'
      ];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      return args;
    },
    promptViaStdin: true,
    promptInputFormat: 'stream-json',
    streamFormat: 'claude-stream-json', // We changed this from deepseek to claude
} satisfies RuntimeAgentDef;