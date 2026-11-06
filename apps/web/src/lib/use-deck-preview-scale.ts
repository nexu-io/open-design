import { useEffect } from 'react';
import type { RefObject } from 'react';

// Logical width every deck preview iframe is rendered at before being scaled
// down to its card frame. Matches PreviewModal's `designWidth` so a deck's first
// slide lays out at its authored 16:9 canvas (templates that declare a stage all
// use 1280) and then shrinks proportionally instead of overflowing the thumbnail.
export const DECK_PREVIEW_DESIGN_WIDTH = 1280;

// Deck template previews render their real HTML inside a small iframe. Letting
// the iframe fill the frame natively (width/height:100%, transform:none) only
// looks right for decks that self-scale to their viewport; a template authored
// on a fixed pixel canvas (`.deck{width:100vw;height:100vh}` + fixed-px content,
// no fit script) then renders full-size in the tiny iframe and its content
// overflows into an overlapping mess. The robust fix — matching PreviewModal —
// is to render the iframe at a fixed 1280×720 logical viewport and visually
// scale it down to the frame, so every template previews proportionally
// regardless of its internal strategy.
//
// CSS cannot divide two lengths, so the scale factor (frame width / 1280) is
// measured here and published as the `--deck-preview-scale` custom property on
// the frame; the frame's own CSS default covers the gap before the observer's
// first callback. A no-op when `enabled` is false (non-deck previews keep their
// own treatment) or when ResizeObserver is unavailable (SSR / jsdom).
export function useDeckPreviewScale(
  frameRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      const width = el.clientWidth;
      if (width > 0) {
        el.style.setProperty('--deck-preview-scale', String(width / DECK_PREVIEW_DESIGN_WIDTH));
      }
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [frameRef, enabled]);
}
