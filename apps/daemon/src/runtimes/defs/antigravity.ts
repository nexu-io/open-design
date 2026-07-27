import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Model selection goes through agy's own `--model` flag.
//
// This used to be far more involved: `agy` v1.0.3 had no `--model` flag
// (upstream issue #35), so the daemon wrote the chosen label into
// `~/.gemini/antigravity-cli/settings.json` immediately before spawn and
// relied on agy re-reading that file on startup. Because the settings
// file is process-global, two concurrent runs could race over it — run A
// writes model A, run B writes model B, then A's agy reads B — so the
// adapter also carried a per-process lock chain plus a `--log-file`
// watcher that polled for agy's `Propagating selected model override to
// backend: label="<X>"` line to decide when the lock could be released.
//
// v1.1.7 ships a real `--model` flag that validates its argument, which
// makes all of that unnecessary: the selection is per-invocation argv, so
// there is no shared file to race over and nothing to serialise. The
// write helper, the lock chain, and the log watcher are all gone.
//
// `--model` accepts both the slug form printed by `agy models`
// (`gemini-3.1-pro-high`) and the display-label form the old picker
// stored (`Gemini 3.1 Pro (High)`) — verified against v1.1.7 — so users
// carrying a saved label from the previous adapter keep working without a
// migration. An unrecognised value fails loudly rather than silently
// falling back:
//
//   $ agy --model totally-bogus-model-xyz -p "hi"
//   Error: invalid model selection … is not recognized as a known model

export const antigravityAgentDef = {
  id: 'antigravity',
  name: 'Antigravity',
  bin: 'agy',
  versionArgs: ['--version'],
  // NOT wired to a `listModels` probe, despite v1.1.7 adding an `agy
  // models` subcommand. It prints the catalogue and then does not exit:
  // redirected to a file it produces nothing and hangs indefinitely; it
  // only appears to work interactively because a downstream `head`/`tail`
  // closes the pipe and SIGPIPEs it. Under `execAgentFile` that means the
  // probe burns its full timeout on every detection pass and then falls
  // back anyway — strictly worse than the static list. Revisit if upstream
  // makes the subcommand terminate on its own.
  //
  // The ids below are the slugs `agy models` printed on 2026-07-27. They
  // will drift; `--model` also accepts the display-label form, so a stale
  // entry here is a missing option rather than a broken spawn.
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'gemini-3.6-flash-high', label: 'gemini-3.6-flash-high' },
    { id: 'gemini-3.6-flash-medium', label: 'gemini-3.6-flash-medium' },
    { id: 'gemini-3.6-flash-low', label: 'gemini-3.6-flash-low' },
    { id: 'gemini-3.5-flash-high', label: 'gemini-3.5-flash-high' },
    { id: 'gemini-3.5-flash-medium', label: 'gemini-3.5-flash-medium' },
    { id: 'gemini-3.5-flash-low', label: 'gemini-3.5-flash-low' },
    { id: 'gemini-3.1-pro-high', label: 'gemini-3.1-pro-high' },
    { id: 'gemini-3.1-pro-low', label: 'gemini-3.1-pro-low' },
    { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
    { id: 'claude-opus-4-6-thinking', label: 'claude-opus-4-6-thinking' },
    { id: 'gpt-oss-120b-medium', label: 'gpt-oss-120b-medium' },
  ],
  supportsCustomModel: false,
  // We deliberately do NOT opt into `resumesSessionViaCli` / agy's `-c`
  // resume flag on follow-up turns. Tested both shapes; `-c` activates
  // agy's internal agentic loop (multi-step model retries, tool calls,
  // fallback-to-cached-response on tool errors) which can't be steered
  // from OD's system-prompt OVERRIDE — even with the strongest wording
  // we got an identical byte-for-byte form re-emission on turn 2 when
  // turn 1's tool-call retry path returned the cached form response.
  //
  // Instead we treat agy as a stateless plain adapter like qwen /
  // deepseek: every spawn gets the full OD-rendered transcript via
  // `buildDaemonTranscript`, and that transcript's prior assistant
  // turns are sanitized to strip `<question-form>` markup + form-schema
  // JSON fences (see `sanitizePriorAssistantTurnForTranscript` in
  // apps/web/src/providers/daemon.ts). The stronger OVERRIDE block
  // composed in server.ts gives a second line of defense for weak
  // plain-stream models like Gemini 3.5 Flash.
  buildArgs: (
    prompt,
    _imagePaths,
    _extra = [],
    options = {},
    runtimeContext = {},
  ) => {
    // We invoke agy via `-p <prompt>` (print mode, prompt as the flag
    // value). This changed with the upstream CLI: on v1.0.3 `-p` was a
    // boolean and a trailing `-` meant "read the prompt from stdin", so
    // the adapter shipped `-p -` with `promptViaStdin`. On v1.1.7 `-p`
    // takes the prompt as its argument, stdin is ignored entirely, and
    // `agy -p -` sends the literal `-` as the whole prompt — the model
    // answers a non-question with a greeting ("Hello! How can I help you
    // today?") and the user's actual request never reaches it. Reproduced
    // outside OD:
    //
    //   $ echo "Reply with exactly: PONG" | agy -p -
    //   Hello! How can I help you today? …
    //   $ agy -p "Reply with exactly: PONG"
    //   PONG
    //
    // Bare `-p` with a piped stdin is not a fallback — it exits with
    // "flag needs an argument: -p". Print mode is argv-only now, hence
    // `maxPromptArgBytes` below.
    const args: string[] = [];
    // Always opt into `--log-file` when the daemon supplied a path so
    // it can post-exit grep for the actual upstream failure shape
    // (auth missing vs quota reached vs upstream error) — without it
    // the chat surfaces a generic "empty response" because print mode
    // never echoes those errors on stdout. See server.ts empty-output
    // guard for the consumer.
    //
    // Flag order is load-bearing on agy v1.0.3: `agy -p --log-file
    // /tmp/x -` runs successfully but leaves /tmp/x empty, while `agy
    // --log-file /tmp/x -p -` captures the diagnostic log, including
    // `Propagating selected model override to backend: label="<model>"`
    // and auth/quota failures.
    if (runtimeContext.agentLogFilePath) {
      args.push('--log-file', runtimeContext.agentLogFilePath);
    }
    if (options.model && options.model !== DEFAULT_MODEL_OPTION.id) {
      args.push('--model', options.model);
    }
    args.push('-p', prompt);
    return args;
  },
  // Print mode is argv-only on v1.1.7, so the composed prompt rides in
  // argv and needs the same budget guard as the other argv-only adapters
  // (aider/deepseek). On POSIX `checkPromptArgvBudget` raises this to
  // POSIX_ARGV_PROMPT_BUDGET; the literal value here is the Windows
  // CreateProcess ceiling.
  maxPromptArgBytes: 30_000,
  streamFormat: 'plain',
  installUrl: 'https://antigravity.google/cli',
  docsUrl: 'https://antigravity.google/docs/cli-overview',
} satisfies RuntimeAgentDef;
