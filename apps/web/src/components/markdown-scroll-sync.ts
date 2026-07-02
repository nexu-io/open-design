import { parse, postprocess, preprocess } from 'micromark';
import { gfm } from 'micromark-extension-gfm';

// Split-view scroll sync between the raw markdown editor and the rendered
// preview. A naive ratio sync (scrollTop / scrollRange) drifts badly because a
// markdown source line and its rendered block have very different heights (a
// `## heading` is one short line in source but a tall heading block in
// preview). Instead we anchor on every top-level block: each block's source
// line maps to one top-level DOM element in the preview, and we piecewise-
// linearly interpolate scroll position between those anchor pairs so matching
// blocks line up at the top edge of both panes.

const CONTAINER_TOKENS = new Set(['blockQuote', 'listOrdered', 'listUnordered']);
const FLOW_BLOCK_TOKENS = new Set([
  'atxHeading',
  'setextHeading',
  'paragraph',
  'codeFenced',
  'codeIndented',
  'htmlFlow',
  'thematicBreak',
  'table',
]);

// Computed styles that influence text wrapping/line height. Copied from the
// textarea onto a hidden mirror so the mirror wraps identically. `box-sizing`,
// `width`, and borders are forced separately so the content box matches
// regardless of the textarea's own box model.
const MIRROR_COPIED_STYLES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-indent',
  'tab-size',
  'white-space',
  'overflow-wrap',
  'word-break',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
];

function hasVerticalProgression(offsets: number[]): boolean {
  if (offsets.length <= 1) return true;
  const first = offsets[0] ?? 0;
  return offsets.some((offset, index) => index > 0 && offset > first + 0.5);
}

/**
 * 1-based source start line of every top-level markdown block, in document
 * order. Nested blocks (list items, blockquote contents) collapse into their
 * top-level container so the result lines up 1:1 with the preview article's
 * direct element children.
 */
export function extractMarkdownBlockLines(markdown: string): number[] {
  if (!markdown) return [];
  let events: ReturnType<typeof postprocess>;
  try {
    events = postprocess(
      parse({ extensions: [gfm()] })
        .document()
        .write(preprocess()(markdown, undefined, true)),
    );
  } catch {
    return [];
  }
  const lines: number[] = [];
  let depth = 0;
  for (const event of events) {
    const phase = event[0];
    const token = event[1];
    const type = token.type;
    if (CONTAINER_TOKENS.has(type)) {
      if (phase === 'enter') {
        if (depth === 0) lines.push(token.start.line);
        depth += 1;
      } else {
        depth = Math.max(0, depth - 1);
      }
      continue;
    }
    if (phase === 'enter' && depth === 0 && FLOW_BLOCK_TOKENS.has(type)) {
      lines.push(token.start.line);
    }
  }
  return lines;
}

function escapeMirrorText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Pixel offset (within the textarea's scrollable content) of each block's
 * start line, accounting for soft-wrapping. Measured with a hidden mirror that
 * mimics the textarea's wrapping so the offsets stay accurate even when long
 * lines wrap. Returns `null` when measurement is not possible.
 */
export function measureEditorBlockOffsets(
  textarea: HTMLTextAreaElement,
  blockLines: number[],
  text: string,
): number[] | null {
  if (blockLines.length === 0 || typeof document === 'undefined') return null;
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const style = mirror.style;
  for (const prop of MIRROR_COPIED_STYLES) {
    style.setProperty(prop, computed.getPropertyValue(prop));
  }
  // Reproduce the textarea content-box width regardless of its box model.
  style.boxSizing = 'border-box';
  style.borderWidth = '0';
  style.margin = '0';
  style.position = 'absolute';
  style.top = '0';
  style.left = '-9999px';
  style.height = 'auto';
  style.overflow = 'hidden';
  style.visibility = 'hidden';
  style.pointerEvents = 'none';
  style.width = `${textarea.clientWidth}px`;
  if (style.whiteSpace === 'normal' || !style.whiteSpace) style.whiteSpace = 'pre-wrap';

  const lines = text.split('\n');
  const markersByLine = new Map<number, number[]>();
  blockLines.forEach((line, blockIndex) => {
    const lineIndex = Math.max(0, Math.min(lines.length - 1, line - 1));
    const existing = markersByLine.get(lineIndex);
    if (existing) existing.push(blockIndex);
    else markersByLine.set(lineIndex, [blockIndex]);
  });

  let buffer = '';
  for (let i = 0; i < lines.length; i += 1) {
    const markers = markersByLine.get(i);
    if (markers) {
      for (const blockIndex of markers) buffer += `<span data-md-block="${blockIndex}"></span>`;
    }
    buffer += escapeMirrorText(lines[i] ?? '');
    if (i < lines.length - 1) buffer += '\n';
  }
  mirror.innerHTML = buffer;

  document.body.appendChild(mirror);
  const offsets = new Array<number>(blockLines.length).fill(0);
  try {
    const markers = mirror.querySelectorAll<HTMLElement>('span[data-md-block]');
    for (const marker of Array.from(markers)) {
      const blockIndex = Number(marker.getAttribute('data-md-block'));
      if (Number.isInteger(blockIndex) && blockIndex >= 0 && blockIndex < offsets.length) {
        offsets[blockIndex] = marker.offsetTop;
      }
    }
  } finally {
    document.body.removeChild(mirror);
  }
  if (!hasVerticalProgression(offsets)) return null;
  return offsets;
}

/**
 * Pixel offset (within the preview pane's scrollable content) of each rendered
 * top-level block element. Returns `null` when the rendered article's direct
 * element children do not match the expected block count — the caller then
 * falls back to ratio sync rather than risk a wrong mapping.
 */
export function measurePreviewBlockOffsets(pane: HTMLElement, blockCount: number): number[] | null {
  if (blockCount === 0) return null;
  const article = pane.querySelector<HTMLElement>('.markdown-rendered');
  if (!article) return null;
  const children = Array.from(article.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (children.length !== blockCount) return null;
  const paneRect = pane.getBoundingClientRect();
  const contentTop = paneRect.top - pane.scrollTop;
  const offsets = children.map((child) => child.getBoundingClientRect().top - contentTop);
  if (!hasVerticalProgression(offsets)) return null;
  return offsets;
}

/**
 * Build a monotonic anchor array spanning the full scrollable range: a `0`
 * anchor at the top, the per-block offsets, and the total `scrollHeight` at the
 * bottom, clamped non-decreasing so interpolation stays stable.
 */
export function buildScrollAnchors(blockOffsets: number[], scrollHeight: number): number[] {
  const anchors = [0, ...blockOffsets, Math.max(0, scrollHeight)];
  let previous = 0;
  for (let i = 0; i < anchors.length; i += 1) {
    const raw = anchors[i] ?? 0;
    let value = Math.max(0, Math.min(scrollHeight, Number.isFinite(raw) ? raw : 0));
    if (value < previous) value = previous;
    anchors[i] = value;
    previous = value;
  }
  return anchors;
}

/**
 * Map a scroll position from the source pane to the target pane using paired
 * anchor arrays (same length, both monotonic). Linear interpolation within the
 * bracketing segment.
 */
export function mapScrollPosition(value: number, source: number[], target: number[]): number {
  const count = Math.min(source.length, target.length);
  if (count === 0) return value;
  if (count === 1) return target[0] ?? 0;
  if (value <= (source[0] ?? 0)) return target[0] ?? 0;
  if (value >= (source[count - 1] ?? 0)) return target[count - 1] ?? 0;
  let low = 0;
  let high = count - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((source[mid] ?? 0) <= value) low = mid;
    else high = mid;
  }
  const sourceLow = source[low] ?? 0;
  const sourceHigh = source[high] ?? 0;
  const targetLow = target[low] ?? 0;
  const targetHigh = target[high] ?? 0;
  const span = sourceHigh - sourceLow;
  const fraction = span > 0 ? (value - sourceLow) / span : 0;
  return targetLow + fraction * (targetHigh - targetLow);
}
