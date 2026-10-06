import { useLayoutEffect, useRef } from 'react';

/**
 * A label that slides its own overflow into view while the pointer rests on
 * its row, instead of leaving the name stuck behind an ellipsis. Long names
 * are the norm in the surfaces that use this — project titles are whole
 * prompts, workspace names carry a possessive — and the menus are only as wide
 * as the column they hang off, so the ellipsis routinely eats the part that
 * tells two rows apart.
 *
 * It travels ONCE and stays at the tail (`forwards`) rather than looping back
 * and forth: the reader needs the tail exactly once, and a marquee that keeps
 * moving under a resting pointer is the part that makes them hard to read.
 * Leaving the row rewinds it, because the animation stops applying.
 *
 * CSS owns *when* it plays — `:hover` / `:focus-visible` on whatever element
 * wraps this one, see `.od-marquee` in styles/primitives.css. JS only supplies
 * *how far*, which no stylesheet can know: the distance is the gap between the
 * untruncated string and the slot it has to fit in. Labels that fit carry no
 * `data-marquee`, so they never move.
 */
export function MarqueeLabel({
  className,
  text,
}: {
  /** Class for the clipping slot — the one the layout already positions. */
  className?: string;
  text: string;
}) {
  const slotRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const inner = textRef.current;
    if (!slot || !inner) return;
    const measure = () => {
      // `max-width: 100%` keeps the inner span inside the slot at rest, so its
      // scrollWidth — not its box — carries the full string's width.
      const overflow = Math.round(inner.scrollWidth - slot.clientWidth);
      if (overflow > 1) {
        // The expanded text starts at the slot's inline start: RTL must move
        // right to reveal its left-hand tail, while LTR moves left.
        const shift = getComputedStyle(slot).direction === 'rtl' ? overflow : -overflow;
        slot.style.setProperty('--marquee-shift', `${shift}px`);
        // ~38px/s, floored so a two-character overhang still reads as motion
        // rather than a twitch.
        slot.style.setProperty(
          '--marquee-duration',
          `${Math.max(650, Math.round(overflow * 26))}ms`,
        );
        slot.dataset.marquee = 'on';
      } else {
        delete slot.dataset.marquee;
      }
    };
    measure();
    // The slot resizes with the column it lives in; the inner one settles late
    // when a webfont swaps in. Either changes the answer, so both are watched —
    // and where ResizeObserver is missing (jsdom) the one measurement above
    // still stands, since neither box moves in a test render.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [text]);
  return (
    <span className={className ? `od-marquee ${className}` : 'od-marquee'} ref={slotRef}>
      <span className="od-marquee__text" ref={textRef}>
        {text}
      </span>
    </span>
  );
}
