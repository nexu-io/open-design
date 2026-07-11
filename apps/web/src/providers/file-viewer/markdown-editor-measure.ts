// DOM-touching measurement adapter for the markdown editor/preview
// scroll-sync: measures a textarea's soft-wrapped block offsets via a hidden
// mirror element that mimics its computed text-wrapping styles. Lives in
// providers/ because it touches bare `document`/`window` globals (creating
// and appending the mirror to `document.body`, reading `window.getComputedStyle`);
// the slice hook reaches it through `MarkdownEditorMeasurePort` so it stays
// DOM-free and unit-testable.

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
