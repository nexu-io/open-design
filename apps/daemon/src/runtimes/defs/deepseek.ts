import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const deepseekAgentDef = {
    id: 'deepseek',
    name: 'DeepSeek TUI',
    // The `deepseek` dispatcher owns the `exec` / `--auto` subcommands and
    // delegates to a sibling TUI runtime binary at exec time. Upstream also
    // ships the same dispatcher as `codewhale` after the CodeWhale rename
    // (issue #2983). The companion `deepseek-tui` / `codewhale-tui` runtime
    // is not probed here — it does not accept the argv shape `buildArgs`
    // produces (`exec --auto <prompt>`).
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
    // `--auto` enables agentic mode with auto-approval — the daemon runs
    // every CLI without a TTY, so the interactive approval prompt would
    // hang the run. Streaming is plain text on stdout (tool calls go to
    // stderr); skipping `--json` keeps deltas streaming live instead of
    // batched into one trailing summary object at end-of-turn.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = ['exec', '--auto'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      // The prompt is intentionally omitted from argv to prevent Windows 
      // ENAMETOOLONG crashes and is instead streamed via stdin.
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'plain',
} satisfies RuntimeAgentDef;