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
