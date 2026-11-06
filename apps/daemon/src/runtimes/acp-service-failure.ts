/** @module runtimes/acp-service-failure
 * Asks the model-service classifier the one question the ACP/JSON-RPC path
 * never asked: *what class of failure is this?*
 *
 * `attachAcpSession`'s `fail()` (`agent-protocol/acp/session.ts`) ships every
 * failure it did not specially promote as either a bare `{ message }` or an
 * `AGENT_EXECUTION_FAILED` envelope. Neither carries a class. The
 * json-event-stream path (`server.ts`) and the Claude path both run
 * `classifyAgentServiceFailure` over their failure text and emit the specific
 * code — `AGENT_AUTH_REQUIRED`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`; the ACP
 * path did not, so on all nine `streamFormat: 'acp-json-rpc'` runtimes a
 * provider outage, a throttle, and a signed-out CLI reached the client
 * indistinguishable from a crash. The client has a card for each of those
 * classes and only a raw-text fallback for the generic one, so what the user
 * read was the agent's JSON envelope with the one explanatory sentence quoted
 * inside it.
 *
 * The classifier was never the broken part — `AGENT_UPSTREAM_FAILURE_RE` in
 * `runtimes/auth.ts` has recognised `overloaded` all along. What was missing
 * was the call. This module is only that call, plus the guards that keep it
 * from overwriting a better answer.
 *
 * ## What it deliberately does NOT do
 *
 * - **It does not touch the record.** `message`, `retryable`, and `details` are
 *   carried through untouched, so `run.error`, events.jsonl, SQLite, the
 *   `stderrTail`, and the Langfuse report all keep the agent's own line
 *   verbatim. That line is both what the details block shows and what
 *   `run-failure-classification.ts` reads; rewriting it would degrade the
 *   telemetry shape while changing nothing a user can act on. Classification
 *   changed; the record did not.
 * - **It does not word anything.** The daemon has no locale. The failure
 *   travels as a code and the client resolves the sentence.
 * - **It does not read stdout/stderr.** Unlike the json-event-stream path,
 *   which folds `agentStdoutTail` / `agentStderrTail` into its match text, this
 *   sees only what the agent put in its own JSON-RPC error frame. An ACP
 *   runtime's stderr is its private logging — vela alone prints request URLs,
 *   provider names and retry chatter — and matching a class out of that would
 *   let an unrelated log line decide the user's remedy. The frame is the
 *   agent's deliberate report; the tail is not.
 * - **It does not outrank a specific code.** Anything the ACP layer already
 *   named — `AMR_MODEL_UNAVAILABLE`, `ROLE_MARKER_HALLUCINATION`, a promoted
 *   AMR account failure, `AGENT_CLI_SESSION_REFUSED` — is returned by identity.
 *
 * ## Composition with `withAcpHandshakeFailureGuidance`
 *
 * Apply this AFTER the handshake guidance. The two are mutually exclusive by
 * construction — `isAcpCliSessionRefusalText` reports false for any text whose
 * cause the run classifier can already name, which is exactly the set this
 * module claims — but ordering plus the specific-code guard makes that a fact
 * rather than a promise: a bare `Internal error` gets
 * `AGENT_CLI_SESSION_REFUSED` stamped first and is then skipped here, and a
 * handshake rejection that says `Authentication required` is passed through
 * untouched there and named here.
 *
 * ## Fallback
 *
 * `classifyAgentServiceFailure` returning null is the normal case, not an
 * error: most ACP failures are ordinary process failures. The payload is then
 * returned by reference, so the path degrades to exactly today's behavior —
 * `AGENT_EXECUTION_FAILED`, or no code at all where `fail()` emitted none.
 */

import { classifyAgentServiceFailure } from './auth.js';

/**
 * The code `fail()` stamps when it has nothing better to say. It is the only
 * code this module is allowed to replace; every other value means some layer
 * already decided, with more evidence than a text match.
 */
export const GENERIC_ACP_FAILURE_CODE = 'AGENT_EXECUTION_FAILED';

/** The failure frame `agent-protocol/acp/session.ts` puts on `send('error', …)`. */
interface AcpErrorFrame {
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

function readable(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The agent's own `error.data`, rendered for matching.
 *
 * Some ACP runtimes put the provider's sentence in the JSON-RPC `message` and
 * some put it in `data` — `inferRpcErrorRetryable` in `agent-protocol/acp/rpc.ts`
 * already reads both for the same reason. A payload that cannot be serialized
 * (a cycle, a BigInt) contributes nothing rather than throwing on a path whose
 * whole job is to report a failure.
 */
function detailsEvidence(details: unknown): string {
  if (details === undefined || details === null) return '';
  try {
    return JSON.stringify(details) ?? '';
  } catch {
    return '';
  }
}

/**
 * Invariant: an ACP failure whose own error frame names a model-service cause
 * leaves the daemon carrying that cause's code, not the generic one.
 *
 * @param payload - The ACP error payload, forwarded unchanged when no class applies.
 * @returns The payload to send — the same object reference when nothing changed.
 */
export function withAcpServiceFailureCode(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const frame = payload as AcpErrorFrame;
  const nested =
    frame.error && typeof frame.error === 'object' && !Array.isArray(frame.error)
      ? (frame.error as Record<string, unknown>)
      : null;

  // A code someone already chose outranks a text match — including the
  // handshake verdict stamped a moment ago.
  const existingCode = readable(nested?.code);
  if (existingCode && existingCode !== GENERIC_ACP_FAILURE_CODE) return payload;

  // Same precedence `extractErrorDetails` uses to fill `run.error`, so the text
  // classified here is the text the user would otherwise have been shown.
  const message = readable(nested?.message) ?? readable(frame.message);
  if (!message) return payload;

  const detailsText = detailsEvidence(nested?.details);
  const code = classifyAgentServiceFailure(
    detailsText ? `${message}\n${detailsText}` : message,
  );
  if (!code) return payload;

  return {
    ...frame,
    error: {
      // A bare `{ message }` frame has no error object at all; give it one
      // carrying the agent's untouched line, so `run.error` reads the same
      // before and after and only `run.errorCode` gains a value.
      ...(nested ?? { message: frame.message }),
      code,
    },
  };
}
