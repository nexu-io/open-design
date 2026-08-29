import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Dulus — provider-independent autonomous agent runtime for the terminal.
// Repo:    https://github.com/KevRojo/Dulus
// Install: `pip install dulus` (PyPI console_script `dulus = dulus:main`)
//
// Requires Dulus >= 3.12.1, the first release whose one-shot run reports
// failure. 3.12.0 shipped the protocol mode but emitted a `text` frame and
// exited 0 on a provider error, so a failed run read as a success — see the
// note on the emptiness check below for what changed.
//
// The install link points at PyPI because that is literally where
// `pip install dulus` resolves, and the docs link at the repository, whose
// README and `docs/` tree are the documentation surface. Dulus's own
// `Project-URL: Documentation` (kevrojo.github.io/Dulus) is the interactive
// product demo — a "live tour", per its README — not a reference users can
// follow to get the CLI running.
//
// Transport: `--output json` splits Dulus's channels. stdout carries only
// JSONL protocol frames; the license banner, tool calls, spinners, warnings,
// and every other human-facing `print` go to stderr. Dulus emits the OpenCode
// event dialect on purpose, so `eventParser: 'opencode'` consumes it with no
// new parser code:
//
//   {"type":"step_start","sessionID":"..."}                      -> status
//   {"type":"text","part":{"text":"..."}}                        -> text_delta
//   {"type":"step_finish","part":{"tokens":{...},"cost":0.0}}     -> usage
//   {"type":"error","message":"..."}                             -> error
//
// Failure: Dulus exits 1 and emits an `error` frame instead of `text` whenever
// the turn produced no answer, 130 on interrupt, and 0 only with a reply. The
// `error` frame alone is enough for the daemon to fail the run — the same
// contract OpenCode relies on (see the `type === 'error'` branch in
// json-event-stream.ts and issue #691).
//
// Prompt delivery is argv, not stdin: the prompt is an argparse positional and
// Dulus rejects `--print` without one. That makes this the first
// `json-event-stream` adapter that is not `promptViaStdin` — the spawn path
// treats prompt delivery and stream parsing independently (`stdinMode` is
// derived separately from `streamFormat`), so stdin is simply left closed.
// `maxPromptArgBytes` therefore applies, mirroring aider's `--message` guard.
//
// `--` terminates option parsing so a composed prompt beginning with a dash
// reaches Dulus as the prompt rather than an unknown flag.
//
// `--accept-all` is Dulus's documented "never ask permission" flag; a
// daemon-spawned child has no TTY to answer a permission prompt on.
//
// No `DULUS_NO_IPC` is needed: Dulus skips its client-side IPC dispatch
// whenever protocol mode is active, so the prompt cannot be handed to an
// already-running Dulus process with a different working directory.
//
// Auth: Dulus owns its own credentials (its first-run wizard's `config.json`,
// or provider API keys in the environment). The daemon injects none.
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
    const args = ['--print', '--accept-all', '--output', 'json'];
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    args.push('--', prompt);
    return args;
  },
  maxPromptArgBytes: 30_000,
  streamFormat: 'json-event-stream',
  eventParser: 'opencode',
  installUrl: 'https://pypi.org/project/dulus/',
  docsUrl: 'https://github.com/KevRojo/Dulus',
} satisfies RuntimeAgentDef;
