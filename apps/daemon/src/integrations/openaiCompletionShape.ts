// Normalizes the response envelope some OpenAI-compatible gateways put around
// a Chat Completions object.
//
// Why this exists: ClinePass (`api.cline.bot`) returns
// `{ data: { <chat.completion> }, success: true }` for `stream: false`, while
// streaming on the same endpoint stays standard OpenAI SSE. Clients that read
// the top-level `choices` therefore reject a 200 that does contain a usable
// completion. See `docs/adr/0002-accept-wrapped-chat-completions-envelope.md`.
//
// The invariant this module upholds: it decides only WHICH object to read
// `choices` from. It never decides whether the response is valid. Callers keep
// their existing checks — non-empty choices, finish_reason handling, sample
// extraction, model echo — and run them against the returned object. Unwrapping
// a known envelope is not the same as loosening the acceptance gate.
//
// Deliberately one level deep. `{ data: { data: { choices } } }` is not
// unwrapped: the observed gateway shape is one level, and recursing would mean
// accepting shapes nobody has actually seen.

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Return the Chat Completions object carried by a known envelope, or the input
 * unchanged when the payload is not one of them.
 *
 * An envelope is accepted only when all of these hold:
 *
 *   1. `data` is a plain object
 *   2. `data.choices` is an array
 *   3. the payload carries no top-level `error`
 *   4. the payload does not say `success: false`
 *   5. `data.object`, when present, is `chat.completion`
 *
 * Conditions 3 and 4 are the pessimistic union: a gateway that reports failure
 * is believed even when the nested object looks like a completion. `success:
 * true` deliberately grants nothing — the envelope is added by the gateway, so
 * its own flag cannot vouch for what it wrapped.
 */
export function normalizeOpenAICompletion(payload: unknown): unknown {
  if (!isPlainRecord(payload)) return payload;

  // A standard top-level completion always wins, even when `data` also carries
  // choices. Note this is an `Array.isArray` test, not a truthiness or length
  // test: an empty top-level `choices` is still the standard shape, and must
  // fall through to validation rather than quietly reading the nested copy.
  if (Array.isArray(payload.choices)) return payload;

  // Explicit failure outranks a nested array that looks like success.
  if (payload.error != null) return payload;
  if (payload.success === false) return payload;

  const nested = payload.data;
  if (!isPlainRecord(nested)) return payload;
  if (!Array.isArray(nested.choices)) return payload;

  // `object` identifies the envelope layer. Absent is tolerated because not
  // every gateway labels it; present-but-different means this is some other
  // payload that merely happens to expose a `data.choices` array.
  if (nested.object !== undefined && nested.object !== 'chat.completion') {
    return payload;
  }

  // Removal signal: when Cline ships a standard response (they have discussed
  // an `X-Response-Format: openai` header) this line stops appearing in daemon
  // logs, which is when the shim can go.
  //
  // Deliberately carries no response data. `data.model` is a provider-supplied
  // string, and daemon logs are collected into diagnostics; the adjacent
  // `[test:provider]` line already names the host and the requested model,
  // both of which come from user configuration rather than the response.
  console.log('[openai-envelope] unwrapped a data-wrapped chat completion');

  return nested;
}
