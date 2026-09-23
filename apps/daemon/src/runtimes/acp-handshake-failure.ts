/** @module runtimes/acp-handshake-failure
 * Recognises an ACP *handshake* rejection — the agent CLI answered
 * `initialize` and then refused to open a session — and NAMES it, so the
 * client can say what to do about it in the reader's own language.
 *
 * `acp-handshake-id.ts` answers *when* the failure happened: ids 1 and 2 are
 * the handshake, ids 3 and up happened after a session existed and keep the old
 * transient treatment.
 *
 * The id alone can never justify the verdict. A CLI that is signed out,
 * throttled, out of balance, talking to a dead upstream, or handed more content
 * than it accepts also fails inside the handshake, and telling any of those
 * users to change a perfectly good CLI sends them after the wrong fix. So the
 * *why* is not decided here at all: `isAcpCliSessionRefusalText` is
 * re-exported from `run-failure-classification.ts`, which owns every cause
 * signature the daemon knows and is the same function that files the run for
 * telemetry. One decision, so the card the user reads and the bucket the run
 * lands in can never prescribe two different fixes.
 *
 * What this module does NOT do is write the sentence. The daemon has no locale
 * — a paragraph composed here lands verbatim in `run.error` and is rendered
 * verbatim by the chat, so a Chinese UI showed a Chinese title over an English
 * body, and the paragraph's own `Details: …` restatement printed the agent's
 * line a second time in a card that already shows it. Instead the failure
 * travels as `AGENT_CLI_SESSION_REFUSED` plus the runtime identity as
 * structured `details`, and `apps/web/src/runtime/amr-guidance.ts` maps that
 * code to localized copy.
 *
 * The raw `json-rpc id N: …` line is left untouched in the message fields on
 * purpose. `run.error` is both what the details block shows and what
 * `run-failure-classification.ts` reads, so rewriting it would silently degrade
 * the telemetry shape to `unknown` and make this class of failure untriageable
 * in aggregate.
 *
 * Deliberately carries no list of known-bad CLI versions, and does not name a
 * version at all: which builds are blocked is a product decision, and reading
 * the version of the build that refused is a separate piece of work with its
 * own launch-time cost. The payload reports the verdict and the runtime, and
 * leaves every word of the wording to the client.
 */

import { isAcpCliSessionRefusalText } from '../run-failure-classification.js';

export {
  ACP_HANDSHAKE_MAX_RPC_ID,
  acpRpcErrorId,
  isAcpHandshakeRpcErrorText,
} from './acp-handshake-id.js';

// The verdict — handshake numbering AND no cause the run classifier already
// has a remedy for — is `classifyRunFailure`'s, not this module's. Re-exported
// so the ACP surface still reads as one place, while there is exactly one
// implementation to keep honest.
export { isAcpCliSessionRefusalText } from '../run-failure-classification.js';

/**
 * Structured API error code for an ACP CLI that answered `initialize` and then
 * refused to open a session. The client owns the wording; this is the whole of
 * the daemon's verdict.
 */
export const ACP_CLI_SESSION_REFUSED_CODE = 'AGENT_CLI_SESSION_REFUSED';

/** Runtime identity the localized copy interpolates. */
export interface AcpAgentIdentity {
  /** Display name of the runtime (`RuntimeAgentDef.name`), when known. */
  agentName?: string | null;
}

function readable(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The `details` bag a session refusal ships: what kind of thing failed, what
 * resolves it, and whichever identity the daemon actually detected.
 *
 * Mirrors the shape `createAmrModelUnavailablePayload` uses for
 * `AMR_MODEL_UNAVAILABLE` (`kind` / `action` / the one fact the copy names), so
 * a client reads every structured failure the same way. An unknown runtime name
 * is OMITTED rather than sent as null: the copy degrades to its agent-less
 * fallback, and a client must never render the word "null" at a user.
 *
 * @param identity - Runtime name, possibly absent.
 * @param existing - The agent's own JSON-RPC `error.data`, preserved underneath.
 */
function acpCliSessionRefusalDetails(
  identity: AcpAgentIdentity,
  existing: unknown,
): Record<string, unknown> {
  const agent = readable(identity.agentName);
  return {
    ...(existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {}),
    kind: 'agent_cli',
    action: 'update_cli',
    ...(agent ? { agent } : {}),
  };
}

/** The failure frame `agent-protocol/acp/session.ts` puts on `send('error', …)`. */
interface AcpErrorFrame {
  message?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

/**
 * Invariant: no ACP handshake rejection leaves the daemon as an unnamed
 * JSON-RPC frame the client can only print raw.
 *
 * `attachAcpSession` hands its failure payload to the caller's
 * `send('error', payload)`, and in server.ts that one payload feeds BOTH
 * user-facing surfaces at once: it is streamed to SSE clients verbatim, and
 * `design.runs.emit` reads `error.message ?? message` and `error.code ?? code`
 * out of it to populate `run.error` / `run.errorCode`. The close handler that
 * runs afterwards short-circuits on `hasFatalError()`, so nothing downstream
 * gets a second chance to classify the failure — the payload is the last point
 * where both surfaces can be corrected together.
 *
 * Stamps only the structured half — code, retryability, identity — and only for
 * a handshake-numbered JSON-RPC error that named no cause of its own. The
 * message fields keep the agent's own line on both surfaces. Every other
 * payload is returned by identity, so structured failures
 * (`AMR_MODEL_UNAVAILABLE`, promoted opencode errors), post-session protocol
 * errors, and handshake errors that already say what went wrong
 * (`Authentication required`, a 429, an upstream 5xx) keep the exact shape and
 * code their own handling depends on.
 *
 * `retryable` is forced to false even when the agent claimed otherwise: a build
 * that refuses `session/new` refuses the identical request identically.
 *
 * @param payload - The raw ACP error payload, forwarded unchanged when it is not a handshake rejection.
 * @param identity - Runtime name for the client's copy.
 * @returns The payload to send, carrying `AGENT_CLI_SESSION_REFUSED` when applicable.
 */
export function withAcpHandshakeFailureGuidance(
  payload: unknown,
  identity: AcpAgentIdentity = {},
): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const frame = payload as AcpErrorFrame;
  const nested =
    frame.error && typeof frame.error === 'object'
      ? (frame.error as Record<string, unknown>)
      : null;
  // Same precedence `extractErrorDetails` uses to fill `run.error`, so the text
  // matched here is the text the user would otherwise have been shown.
  const rawMessage =
    readable(typeof nested?.message === 'string' ? nested.message : null) ??
    readable(typeof frame.message === 'string' ? frame.message : null);
  if (!rawMessage || !isAcpCliSessionRefusalText(rawMessage)) return payload;

  return {
    ...frame,
    error: {
      ...(nested ?? {}),
      code: ACP_CLI_SESSION_REFUSED_CODE,
      message: rawMessage,
      retryable: false,
      details: acpCliSessionRefusalDetails(identity, nested?.details),
    },
  };
}
