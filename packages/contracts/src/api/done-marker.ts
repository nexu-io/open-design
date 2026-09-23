/**
 * The turn-completion marker — the boundary between a turn's *process* and its
 * *conclusion*.
 *
 * The chat panel folds everything a turn does (thinking, tool calls, working
 * narration) into a collapsed execution log and leaves only the conclusion in
 * the open. The agent says where that boundary is by emitting one self-closing
 * marker inline:
 *
 *     <od-done key="a7f3c91ed2b40561"/>
 *
 * `key` is a nonce the daemon mints per run, injects into that turn's prompt,
 * and publishes to the client as a `done_key` agent event before any model
 * output. A client only honours a marker whose key matches the one it holds for
 * that turn.
 *
 * **Why a key at all.** The boundary used to be a bare `<done/>` — a string no
 * prompt ever taught. Every match was therefore content that happened to
 * contain it, which made the boundary forgeable by the turn's own output: an
 * agent asked to produce HTML containing `<done/>`, or simply to explain the
 * tag, threw the rest of its answer out of the execution shell (and, when a
 * todo list was open, out of the todo it belonged to). A model cannot reproduce
 * a nonce it was never shown — and neither can a page it is cloning, a document
 * it is summarising, or an injected instruction inside either.
 *
 * **Why self-closing.** Wrapping the conclusion in a container would mean
 * nothing could render until the closing tag arrived, holding the entire answer
 * back mid-stream.
 *
 * This module is the single source of truth for the marker's shape. The daemon
 * uses it to keep the marker out of the persisted message body; the chat client
 * uses it to find the boundary and to strip the marker from what it renders.
 * Two hand-maintained copies of this regex would eventually disagree about what
 * counts as a marker, and the failure mode is a protocol tag on screen.
 */

/**
 * Every `<od-done …>` occurrence, valid key or not.
 *
 * Deliberately permissive about the attribute list: a marker with a wrong,
 * malformed, or missing key is still protocol noise and must never reach the
 * user, exactly like the `<od-title>` marker (whose earlier "only strip it when
 * we asked for a title" behaviour leaked raw tags into production chat).
 *
 * Global + case-insensitive; callers that keep state must clone it (`lastIndex`
 * is shared on a module-level regex).
 */
export const OD_DONE_TAG_RE = /<od-done\b[^>]*>/gi;

/**
 * Pull the key out of one `<od-done …>` tag.
 *
 * Quotes are optional and both styles are accepted because model formatting
 * drifts; the key charset is restricted so a stray attribute cannot smuggle
 * markup through.
 */
export const OD_DONE_KEY_ATTR_RE = /\bkey\s*=\s*["']?([A-Za-z0-9_-]{4,64})["']?/i;

/** The marker's opening tag, for streaming hold-back of a half-arrived marker. */
export const OD_DONE_OPEN_TAG = '<od-done';

/**
 * Render the marker for a given key. The one place the wire format is written.
 */
export function renderDoneMarker(key: string): string {
  return `<od-done key="${key}"/>`;
}

/**
 * Remove every `<od-done …>` tag from a string.
 *
 * Used on the persisted assistant message body so the marker never reaches
 * copy-to-clipboard, exports, or a legacy render path that reconstructs a turn
 * from `content` alone. The live event stream keeps its markers — that is where
 * the chat client reads the boundary from.
 *
 * Caller beware: this is context-free. Call sites that must preserve a marker
 * an agent quoted inside a code fence have to do their own fenced-region check
 * first (the chat client does; the message body does not, because a body with a
 * fenced marker in it is still a body no consumer should see raw protocol in).
 */
export function stripDoneMarkers(text: string): string {
  if (!text || !text.includes('<')) return text;
  return text.replace(new RegExp(OD_DONE_TAG_RE.source, OD_DONE_TAG_RE.flags), '');
}
