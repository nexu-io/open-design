/**
 * Internal control markers the model is instructed to emit for the daemon, not
 * for the reader: the conversation-title marker and the OD Next machine
 * protocol blocks. Each is consumed by a daemon-side stream stripper before the
 * text reaches the chat, so a marker showing up here means the producing turn
 * ran outside that stripper's window — a resumed CLI session repeating an
 * instruction from earlier in its own history is the usual way in.
 *
 * The chat is the last surface before the user, so it strips them again rather
 * than trusting the upstream window. This also repairs messages that were
 * already persisted with a leaked marker, which no daemon-side fix can reach.
 *
 * Deliberately NOT listed: `<question-form>`, `<od-card>` and `<artifact>`.
 * Those are renderable artifacts with their own display paths — removing them
 * here would delete UI the user is supposed to see.
 */
const INTERNAL_MARKER_TAGS = [
  'od-title',
  'open-design-plan-contract',
  'open-design-runtime-state',
] as const;

const COMPLETE_BLOCK_RE = new RegExp(
  `<(${INTERNAL_MARKER_TAGS.join('|')})(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1\\s*>`,
  'gi',
);

const STREAMING_UNCLOSED_TAIL_RE = new RegExp(
  `<(?:${INTERNAL_MARKER_TAGS.join('|')})(?:\\s[^>]*)?>[\\s\\S]*$`,
  'i',
);

const STRAY_TAG_RE = new RegExp(
  `<\\/?(?:${INTERNAL_MARKER_TAGS.join('|')})(?:\\s[^>]*)?>`,
  'gi',
);

const OPEN_TAG_PREFIXES = INTERNAL_MARKER_TAGS.map((tag) => `<${tag}`);

/**
 * Length of the trailing run of `value` that is a strict prefix of some marker
 * open tag — the half-arrived `<od-tit` a stream is mid-way through writing.
 */
function partialOpenTagSuffixLength(value: string): number {
  const longest = Math.max(...OPEN_TAG_PREFIXES.map((prefix) => prefix.length));
  const max = Math.min(value.length, longest - 1);
  for (let len = max; len > 0; len -= 1) {
    const tail = value.slice(-len).toLowerCase();
    if (OPEN_TAG_PREFIXES.some((prefix) => prefix.startsWith(tail))) return len;
  }
  return 0;
}

/**
 * Remove internal control markers from text about to be rendered as prose.
 *
 * A complete block goes entirely — tag, body and close. What is left over is
 * handled by how much the text can still change:
 *
 * - `streaming`: an open tag with no close yet is the start of a block whose
 *   rest is still arriving, so hide it and everything after it (plus a
 *   half-typed `<od-titl`) rather than flash raw markup for a frame.
 * - settled: an unmatched tag means the producing turn ended mid-marker. Drop
 *   the tag alone and keep the prose around it — deleting the remainder of a
 *   finished answer over one stray tag would lose real content.
 */
export function stripInternalControlMarkers(
  text: string,
  options?: { streaming?: boolean },
): string {
  if (!text || !text.includes('<')) return text;
  let out = text.replace(COMPLETE_BLOCK_RE, '');
  if (options?.streaming) {
    out = out.replace(STREAMING_UNCLOSED_TAIL_RE, '');
    const partial = partialOpenTagSuffixLength(out);
    if (partial > 0) out = out.slice(0, out.length - partial);
    return out;
  }
  return out.replace(STRAY_TAG_RE, '');
}
