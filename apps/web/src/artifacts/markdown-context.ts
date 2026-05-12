/**
 * Shared Markdown-context helpers used by both the streaming artifact parser
 * and the post-stream `<artifact>` stripper. The single source of truth for
 * what counts as a fenced code block or an inline code span — kept in lock
 * step with apps/web/src/runtime/markdown.tsx so the parser/stripper view of
 * a buffer matches what the chat UI will actually render.
 *
 * Anything that "looks like" an artifact tag inside one of these regions is
 * literal Markdown and must not be treated as a real protocol tag.
 */

// Line-anchored fence delimiters, mirror runtime/markdown.tsx:44 (open) and
// runtime/markdown.tsx:49 (close). The renderer is asymmetric on purpose:
// an opening fence may carry an info string (e.g. ```html), a closing fence
// must be a bare triple-backtick line. Neither permits leading indentation —
// an indented "   ```" line is rendered as a paragraph, not a fence.
export const FENCE_OPEN_RE = /^```(\w[\w+-]*)?\s*$/;
export const FENCE_CLOSE_RE = /^```\s*$/;

// Inline code span (single-backtick pair), mirrors runtime/markdown.tsx:164.
export const INLINE_CODE_RE = /`[^`]+`/g;

// Paragraph-break recognizers — these mirror the inner paragraph-accumulation
// loop in `parseBlocks()` (runtime/markdown.tsx:95-104), which is what
// actually decides where a paragraph ends. The outer loop in `parseBlocks`
// has additional block-starters (HR, fenced-code with `^```` prefix, etc.)
// but those only take effect when no paragraph is currently being built;
// mid-paragraph they are paragraph content. The renderer therefore treats
// `intro \`` / `---` / `<artifact …>` / `---` / `closing \`` as ONE paragraph
// whose backticks pair across the recitation — so this walker must too.
//
// Notable omission: HR — see comment above. HR-shaped lines (`---` / `***`
// / `___`) carry no backticks of their own, so leaving them inside the
// surrounding paragraph region is benign for inline-code scanning either way.
const HEADING_RE = /^#{1,4}\s+/;
const UL_ITEM_RE = /^\s*[-*+]\s+/;
const OL_ITEM_RE = /^\s*\d+\.\s+/;

// `<artifact` followed by whitespace is a real protocol open tag; any other
// continuation (e.g. `<artifactual`) is a prefix-shared literal that must not
// be treated as a tag. Mirrors the parser's `findOpenTag` real-open guard so
// the parser and the stripper agree on what counts as a real tag.
export function isRealArtifactOpenAt(content: string, idx: number): boolean {
  const next = content.charAt(idx + '<artifact'.length);
  return next !== '' && /\s/.test(next);
}

export type Range = readonly [number, number];

/**
 * Compute the half-open `[start, end)` ranges of `buffer` that the renderer
 * would treat as fenced code blocks or inline code spans. The `unclosedFenceStart`
 * is the index of an opening fence with no matching close in the buffer (or
 * `null` if every fence is closed) — the streaming parser uses it to hold
 * back; the stripper ignores it.
 *
 * Lines without a terminating `\n` (the trailing partial line during
 * streaming) are not classified as fence delimiters here. Callers that care
 * about partial-state behavior should inspect the tail themselves.
 */
export function computeSkipRanges(buffer: string): {
  ranges: Range[];
  unclosedFenceStart: number | null;
} {
  const ranges: Range[] = [];
  // Paragraph-block regions are contiguous spans of paragraph lines outside
  // any fenced code block. `renderInline` runs once per block, so inline-code
  // scanning is restricted to one block at a time — backticks never pair
  // across a block boundary in the rendered output.
  const blockRegions: Range[] = [];

  let pos = 0;
  let inFence = false;
  let fenceStart = -1;
  let blockStart = -1;
  const closeBlockBefore = (idx: number) => {
    if (blockStart !== -1 && idx > blockStart) blockRegions.push([blockStart, idx]);
    blockStart = -1;
  };
  while (pos < buffer.length) {
    const eol = buffer.indexOf('\n', pos);
    const lineEnd = eol === -1 ? buffer.length : eol;
    const line = buffer.slice(pos, lineEnd);
    const lineHasNewline = eol !== -1;
    if (!inFence) {
      if (lineHasNewline && FENCE_OPEN_RE.test(line)) {
        closeBlockBefore(pos);
        inFence = true;
        fenceStart = pos;
      } else if (line.trim() === '') {
        // Blank lines separate blocks.
        closeBlockBefore(pos);
      } else if (HEADING_RE.test(line) || UL_ITEM_RE.test(line) || OL_ITEM_RE.test(line)) {
        // Heading and list-item lines are each their own block in the
        // renderer (`renderInline` runs per item / per heading), so they get
        // a one-line inline-scan region rather than joining adjacent
        // paragraphs. The marker chars themselves are not backticks, so we
        // can scan the whole line without stripping the marker first.
        closeBlockBefore(pos);
        blockRegions.push([pos, lineEnd]);
      } else {
        if (blockStart === -1) blockStart = pos;
      }
    } else if (lineHasNewline && FENCE_CLOSE_RE.test(line)) {
      inFence = false;
      ranges.push([fenceStart, eol + 1]);
      fenceStart = -1;
    }
    if (!lineHasNewline) {
      // Trailing partial line — already accounted for above (either folded
      // into the current paragraph region, or skipped because it starts with
      // a block-starter pattern). Stop walking.
      break;
    }
    pos = eol + 1;
  }
  // Flush any open paragraph region at end-of-buffer (no trailing newline).
  if (!inFence) closeBlockBefore(buffer.length);

  for (const [s, e] of blockRegions) {
    INLINE_CODE_RE.lastIndex = 0;
    const segment = buffer.slice(s, e);
    let m: RegExpExecArray | null = INLINE_CODE_RE.exec(segment);
    while (m !== null) {
      ranges.push([s + m.index, s + m.index + m[0].length]);
      m = INLINE_CODE_RE.exec(segment);
    }
  }

  return { ranges, unclosedFenceStart: inFence ? fenceStart : null };
}

export function rangeContains(ranges: ReadonlyArray<Range>, p: number): boolean {
  for (const [s, e] of ranges) {
    if (p >= s && p < e) return true;
  }
  return false;
}
