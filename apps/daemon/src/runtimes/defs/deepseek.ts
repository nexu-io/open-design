import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const deepseekAgentDef = {
    id: 'deepseek',
    name: 'DeepSeek TUI',
    // The `deepseek` dispatcher owns the `exec` / `--auto` subcommands and
    // delegates to a sibling `deepseek-tui` runtime binary at exec time.
    // Upstream documents both binaries as required (npm and cargo paths
    // install them together), so a host with only `deepseek-tui` on PATH
    // isn't a supported install — and `deepseek-tui` itself doesn't accept
    // the argv shape `buildArgs` produces (`exec --auto <prompt>`). We only
    // probe the dispatcher; advertising availability via a `deepseek-tui`
    // fallback would surface the agent as runnable but make `/api/chat`
    // exit immediately on the first prompt.
    bin: 'deepseek',
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
    // DeepSeek's exec mode requires the prompt as a positional argument
    // (no `-` stdin sentinel; `prompt: String` is a required clap field).
    // `--auto` enables agentic mode with auto-approval — the daemon runs
    // every CLI without a TTY, so the interactive approval prompt would
    // hang the run. Streaming is plain text on stdout (tool calls go to
    // stderr); skipping `--json` keeps deltas streaming live instead of
    // batched into one trailing summary object at end-of-turn.
    buildArgs: (prompt, _imagePaths, _extra, options = {}) => {
      const args = ['exec', '--auto'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      args.push(prompt);
      return args;
    },
    // Guard against prompts that would blow Windows' ~32 KB CreateProcess
    // limit (or Linux MAX_ARG_STRLEN on extreme edges) before spawn. Every
    // other argv-sensitive adapter sets `promptViaStdin: true` to dodge
    // this; DeepSeek's CLI doesn't accept `-` as a stdin sentinel yet, so
    // we have to ship the prompt as argv. The /api/chat spawn path checks
    // this byte budget against the composed prompt and emits an actionable
    // SSE error ("reduce skills/design-system context, or use an adapter
    // with stdin support") instead of letting the spawn fail with a
    // generic ENAMETOOLONG/E2BIG message. 30_000 bytes leaves ~2.7 KB of
    // argv headroom under the Windows command-line limit for `exec
    // --auto --model <id>` and any internal quoting.
    maxPromptArgBytes: 30_000,
    streamFormat: 'plain',
} satisfies RuntimeAgentDef;
