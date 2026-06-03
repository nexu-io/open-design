import { computeSkipRanges, isRealArtifactOpenAt, rangeContains, type Range } from './markdown-context';

const OPEN = '<artifact';
const CLOSE = '</artifact>';

function findUnskipped(content: string, needle: string, fromIndex: number, ranges: ReadonlyArray<Range>): number {
  let from = fromIndex;
  while (from <= content.length) {
    const idx = content.indexOf(needle, from);
    if (idx === -1) return -1;
    if (!rangeContains(ranges, idx)) return idx;
    from = idx + needle.length;
  }
  return -1;
}

// Like `findUnskipped(OPEN, …)` but also rejects prefix-shared literals like
// `<artifactual` — only `<artifact` followed by whitespace counts as a real
// protocol open. Matches the parser's `findOpenTag` real-open guard so the
// two paths agree on what the renderer will treat as a tag.
function findRealOpen(content: string, fromIndex: number, ranges: ReadonlyArray<Range>): number {
  let from = fromIndex;
  while (from <= content.length) {
    const idx = content.indexOf(OPEN, from);
    if (idx === -1) return -1;
    if (rangeContains(ranges, idx) || !isRealArtifactOpenAt(content, idx)) {
      from = idx + OPEN.length;
      continue;
    }
    return idx;
  }
  return -1;
}

/**
 * Remove the first real `<artifact …>…</artifact>` block from `content`.
 *
 * "Real" excludes any `<artifact` substring that the chat Markdown renderer
 * would render as inline code or part of a fenced code block — those are
 * literal recitations of the protocol and must survive intact, otherwise
 * the rendered chat reply gets silently truncated mid-explanation.
 *
 * If no real open tag exists, the content is returned unchanged. If a real
 * open exists but no matching real close is found, the content is also
 * returned unchanged (refusing to strip is safer than truncating to
 * end-of-string when a tag is malformed or still streaming).
 */
export function stripArtifact(content: string): string {
  const { ranges: baseRanges, unclosedFenceStart } = computeSkipRanges(content);
  // For complete (non-streaming) content, an unclosed fence is rendered by
  // the chat Markdown renderer as a code block extending to end of input
  // (see runtime/markdown.tsx:49 — the close-loop runs until lines exhaust).
  // The stripper has to mirror that, otherwise a literal `<artifact …>`
  // tucked into a code example at the bottom of a chat reply (no trailing
  // newline) gets treated as a real protocol tag and eaten.
  const ranges: Range[] =
    unclosedFenceStart !== null ? [...baseRanges, [unclosedFenceStart, content.length]] : baseRanges;
  const open = findRealOpen(content, 0, ranges);
  if (open === -1) return content;
  const closeTag = content.indexOf('>', open);
  if (closeTag === -1) return content;
  const end = findUnskipped(content, CLOSE, closeTag, ranges);
  if (end === -1) return content;
  return (content.slice(0, open) + content.slice(end + CLOSE.length)).trim();
}

function parseArtifactAttrs(raw: string): Record<string, string> {
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null = re.exec(raw);
  while (m !== null) {
    out[m[1] as string] = (m[2] ?? m[3] ?? '') as string;
    m = re.exec(raw);
  }
  return out;
}

export interface StreamingArtifact {
  artifactType: string;
  title: string;
  identifier: string;
  /** The artifact body received so far — raw, possibly mid-token. */
  content: string;
}

/**
 * Split `content` around the first real `<artifact …>` whose closing
 * `</artifact>` has NOT yet arrived — i.e. an artifact whose body is still
 * streaming in. Returns the text *before* the open tag as `head` (safe to
 * render as Markdown) and the in-flight artifact as `live`.
 *
 * This is the streaming-display counterpart to {@link stripArtifact}: the
 * stripper removes a *completed* block once `</artifact>` lands, whereas this
 * surfaces the *incomplete* one so the chat can show a live code preview
 * instead of leaking the raw `<artifact …>` tag + half-written HTML as text.
 *
 * Returns `{ head: content, live: null }` when there is no open artifact, when
 * the open tag has a matching close (let the stripper handle it), or when the
 * artifact `type` is a non-text/HTML kind (media artifacts must not render as
 * a code panel). "Real" open detection reuses the same skip-range logic as the
 * stripper so a literal `<artifact …>` recited inside a code fence is ignored.
 */
export function splitStreamingArtifact(content: string): {
  head: string;
  live: StreamingArtifact | null;
} {
  const { ranges: baseRanges, unclosedFenceStart } = computeSkipRanges(content);
  const ranges: Range[] =
    unclosedFenceStart !== null ? [...baseRanges, [unclosedFenceStart, content.length]] : baseRanges;
  const open = findRealOpen(content, 0, ranges);
  if (open === -1) return { head: content, live: null };
  const gt = content.indexOf('>', open);
  if (gt === -1) {
    // The open tag's attributes are still streaming — we can't read the type
    // or title yet, but we already know an artifact is starting, so show the
    // box (empty body) and hide the partial `<artifact …` tail from Markdown.
    return {
      head: content.slice(0, open).replace(/\s+$/, ''),
      live: { artifactType: '', title: '', identifier: '', content: '' },
    };
  }
  // A matching close means the block is complete; defer to stripArtifact.
  if (findUnskipped(content, CLOSE, gt, ranges) !== -1) return { head: content, live: null };
  const attrs = parseArtifactAttrs(content.slice(open, gt));
  const artifactType = attrs['type'] ?? '';
  // Only HTML/text artifacts read as code. An unknown type (attrs not fully
  // parsed, or omitted) is treated as code-eligible since the dominant case is
  // text/html; media/binary types fall through and render as raw text.
  if (artifactType && !/html|text\//i.test(artifactType)) return { head: content, live: null };
  return {
    head: content.slice(0, open).replace(/\s+$/, ''),
    live: {
      artifactType,
      title: attrs['title'] ?? '',
      identifier: attrs['identifier'] ?? '',
      content: content.slice(gt + 1),
    },
  };
}
