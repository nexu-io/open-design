import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Dulus — provider-independent autonomous agent runtime for the terminal.
// Repo:    https://github.com/KevRojo/Dulus
// Install: `pip install dulus` (PyPI console_script `dulus = dulus:main`)
//
// The install link points at PyPI because that is literally where
// `pip install dulus` resolves, and the docs link at the repository, whose
// README and `docs/` tree are the documentation surface. Dulus's own
// `Project-URL: Documentation` (kevrojo.github.io/Dulus) is the interactive
// product demo — a "live tour", per its README — not a reference users can
// follow to get the CLI running.
//
// Headless mode: `dulus --print <prompt>` runs one turn non-interactively and
// exits. The prompt is a POSITIONAL argv argument — Dulus rejects print mode
// without one ("--print requires a prompt argument") and never reads it from
// stdin — so this adapter is argv-based and declares `maxPromptArgBytes` to get
// an actionable error before Windows' ~32 KB CreateProcess limit or Linux
// MAX_ARG_STRLEN, the same guard aider uses for `--message`.
//
// `--` terminates option parsing so a composed prompt that happens to start
// with a dash reaches Dulus as the prompt instead of being read as a flag by
// its argparse front end.
//
// Safety: `--accept-all` is Dulus's documented "never ask permission" flag. A
// daemon-spawned run has no TTY to answer a permission prompt on, so without it
// the child would block on a question OD cannot surface.
//
// `DULUS_NO_IPC=1` disables Dulus's client-side IPC dispatch. Without it, a
// `--print` run probes for an already-running Dulus daemon and, if one answers,
// executes the prompt in THAT process — with its own working directory and
// config, not the OD project cwd the daemon just staged the skill into.
//
// Auth: Dulus owns its own credentials (`config.json` written by its first-run
// wizard, or provider API keys in the environment). The daemon injects none.
//
// Output: `--print` emits plain text on stdout with no structured event stream,
// so `streamFormat: 'plain'` (single-turn text reply, no tool_use streaming).
export const dulusAgentDef = {
  id: 'dulus',
  name: 'Dulus',
  bin: 'dulus',
  versionArgs: ['--version'],
  // Dulus is provider-independent — the model comes from its own config and
  // any upstream id is valid — so the picker ships the synthetic default and
  // leaves concrete ids to the custom-model input.
  fallbackModels: [DEFAULT_MODEL_OPTION],
  buildArgs: (prompt, _imagePaths, _extra, options = {}) => {
    const args = ['--print', '--accept-all'];
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    args.push('--', prompt);
    return args;
  },
  maxPromptArgBytes: 30_000,
  streamFormat: 'plain',
  env: { DULUS_NO_IPC: '1' },
  installUrl: 'https://pypi.org/project/dulus/',
  docsUrl: 'https://github.com/KevRojo/Dulus',
} satisfies RuntimeAgentDef;
