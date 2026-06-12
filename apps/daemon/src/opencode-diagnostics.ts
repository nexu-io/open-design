import { redactSecrets } from './redact.js';

export interface OpenCodeCliDiagnosticInput {
  agentId: string;
  exitCode?: number | null;
  signal?: string | null;
  stderrTail?: string | null;
  stdoutTail?: string | null;
  resolvedBin?: string | null;
}

export interface OpenCodeCliDiagnostic {
  message: string;
  detail: string;
  retryable: boolean;
  /**
   * Stable `ApiErrorCode` for this failure class, when one is more specific
   * than the generic `AGENT_EXECUTION_FAILED`. Mirrors the convention used by
   * `claude-diagnostics.ts`.
   */
  code?: string;
}

const body = (input: OpenCodeCliDiagnosticInput): string =>
  [input.stderrTail, input.stdoutTail]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n');

// Marker fragments emitted by `opencode --help` / `opencode run --help` when
// an old CLI doesn't recognize one of the flags Open Design now passes
// (`run --format json`, etc.) and falls through to dumping its own usage to
// stderr.
//
// Each marker is anchored on the flag name AND its descriptor text so a
// single substring like `--prompt` mentioned in an unrelated error message
// (model output, provider error) does not match. We additionally require
// >=2 markers in the same tail before classifying the failure as a help-text
// dump — see #4201 for the failing stderr shape this is taken from.
const HELP_TEXT_MARKERS: readonly RegExp[] = [
  /-p,\s+--prompt\s+string\s+Prompt to run in non-interactive mode/i,
  /-q,\s+--quiet\s+Hide spinner in non-interactive mode/i,
  /-v,\s+--version\s+Version/i,
  /--format[^.\n]{0,40}\(default "text"\)/i,
  /\(json,\s+text\)\s+\(default "text"\)/i,
];

const looksLikeHelpTextDump = (text: string): boolean => {
  if (!text.trim()) return false;
  let matchCount = 0;
  for (const re of HELP_TEXT_MARKERS) {
    if (re.test(text)) matchCount += 1;
    if (matchCount >= 2) return true;
  }
  return false;
};

const withContext = (
  message: string,
  detail: string,
  input: OpenCodeCliDiagnosticInput,
  code?: string,
): OpenCodeCliDiagnostic => {
  const diagnosticTail = redactSecrets(body(input))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-240);
  const context: string[] = [message, detail];
  if (diagnosticTail) context.push(`OpenCode output: ${diagnosticTail}`);
  if (input.resolvedBin) {
    context.push(`Resolved OpenCode binary: ${input.resolvedBin}.`);
  }
  return {
    message: redactSecrets(message),
    detail: redactSecrets(context.filter(Boolean).join(' ')),
    retryable: true,
    ...(code ? { code } : {}),
  };
};

/**
 * Classifies an OpenCode CLI process failure when the failure shape indicates
 * the installed CLI is too old for the flags Open Design now passes. The
 * caller still uses the generic `agent_spawn_failed` envelope; this just
 * upgrades `detail` from `exit 1 · stderr: <raw help fragment>` to an
 * actionable update hint plus an explicit GUI-vs-global-CLI boundary note.
 *
 * The GUI does not update a user's globally installed CLI, so the message
 * tells them to run `npm i -g opencode-ai@latest` themselves and retry.
 */
export function diagnoseOpenCodeCliFailure(
  input: OpenCodeCliDiagnosticInput,
): OpenCodeCliDiagnostic | null {
  if (input.agentId !== 'opencode') return null;
  if (input.exitCode === 0 && !input.signal) return null;
  if (!looksLikeHelpTextDump(body(input))) return null;

  return withContext(
    'The detected OpenCode CLI looks too old for Open Design to drive — its help output came back instead of a streamed response.',
    'Update your global install with `npm i -g opencode-ai@latest`, then retry. Open Design uses the globally installed `opencode` / `opencode-cli` and does not update it for you.',
    input,
    'AGENT_CLI_OUTDATED',
  );
}
