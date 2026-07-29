import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const copilotAgentDef = {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    bin: 'copilot',
    versionArgs: ['--version'],
    // Prompt is delivered via stdin (gated by `promptViaStdin: true`
    // below) to avoid Windows `spawn ENAMETOOLONG` (issue #705):
    // `copilot -p <body>` ships the full composed prompt as a single
    // argv entry, and CreateProcess caps `lpCommandLine` at ~32 KB
    // direct or ~8 KB through a `.cmd` shim. Any non-trivial Open
    // Design prompt blows past that — even a "Hi" expands to several
    // thousand chars after skills + design-system context are composed
    // in.
    //
    // The transport is "omit `-p` entirely, pipe the prompt to stdin"
    // per upstream copilot-cli issue #1046 (closed as already supported,
    // confirmed working on Copilot CLI for `echo "..." | copilot
    // --model <id>` and `cat prompt.txt | copilot --model <id>`). The
    // earlier `-p -` attempt (PR #351) and the argv-bound revert
    // (PR #466) both pre-dated that confirmation: `-p -` made Copilot
    // interpret `-` as a literal one-character prompt, but omitting
    // `-p` entirely is a separate code path that does delegate to
    // stdin under a non-TTY pipe — which is exactly how the daemon
    // spawns the child (`stdio: ['pipe', 'pipe', 'pipe']`).
    //
    // `--allow-all-tools` is still required for non-interactive runs:
    // without it the CLI blocks waiting for human approval on every
    // tool call. Unlike Codex (where `exec` is a dedicated headless
    // subcommand with auto-approve baked in) or Claude Code (which
    // inherits its permission policy from the user's settings.json),
    // Copilot always prompts unless this flag is passed explicitly.
    //
    // `--output-format json` produces JSONL that copilot-stream.js
    // parses into the same typed events as claude-stream.js.
    //
    // `--add-dir` (repeatable, same flag as Claude Code's) widens
    // Copilot's path-level sandbox to skill seeds + design-system
    // specs outside the project cwd.
    //
    // No `models` subcommand; the CLI accepts whatever the user's
    // Copilot subscription exposes. Ship a small evidence-based hint
    // list — the default we observed in the JSON stream and the
    // example from `copilot --help`. Users can paste any other id via
    // Settings.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { id: 'gpt-5.2', label: 'GPT-5.2' },
    ],
    buildArgs: (_prompt, _imagePaths, extraAllowedDirs = [], options = {}) => {
      const args = [
        '--allow-all-tools',
        '--output-format',
        'json',
      ];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      for (const d of dirs) args.push('--add-dir', d);
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'copilot-stream-json',
} satisfies RuntimeAgentDef;
