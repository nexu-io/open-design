/**
 * Pure scroll-target math for revealing a timeline clip inside the timeline's
 * scroll container (the overflow div in Timeline.tsx).
 *
 * Coordinates are content-space: a clip edge measured from the scroll
 * container's content origin (rect delta + current scroll offset). The visible
 * window on each axis is reduced by the sticky chrome that occludes it — the
 * track gutter on the left (GUTTER) and the ruler on top (RULER_H) — so a clip
 * "hidden" under the sticky gutter still counts as off-screen.
 *
 * Scrolls minimally: an axis already fully visible returns null for that axis;
 * otherwise the nearest edge is brought just inside the window (plus padding).
 * A clip larger than the window aligns its start edge. Pure — unit-tested.
 */

export interface RevealScrollInput {
  scrollLeft: number;
  scrollTop: number;
  /** Scroll container clientWidth / clientHeight. */
  viewportWidth: number;
  viewportHeight: number;
  /** Clip bounds in content-space (relative to the scroll content origin). */
  clipLeft: number;
  clipRight: number;
  clipTop: number;
  clipBottom: number;
  /** Width of the sticky left gutter occluding the viewport's left edge. */
  stickyLeft: number;
  /** Height of the sticky ruler occluding the viewport's top edge. */
  stickyTop: number;
  /** False in "fit" zoom mode, where horizontal scrolling is disabled. */
  allowHorizontal: boolean;
}

export interface RevealScrollTarget {
  /** Target scrollLeft, or null when the horizontal axis needs no scroll. */
  left: number | null;
  /** Target scrollTop, or null when the vertical axis needs no scroll. */
  top: number | null;
}

/** Breathing room between the revealed clip edge and the window edge. */
export const REVEAL_SCROLL_PADDING_PX = 12;

/**
 * Minimal scroll on one axis to bring [start, end] inside the visible window
 * [scroll + stickyStart, scroll + viewport], with padding. Returns null when
 * the range is already fully visible.
 */
function revealAxis(
  scroll: number,
  viewport: number,
  stickyStart: number,
  start: number,
  end: number,
): number | null {
  const windowStart = scroll + stickyStart + REVEAL_SCROLL_PADDING_PX;
  const windowEnd = scroll + viewport - REVEAL_SCROLL_PADDING_PX;
  const windowSize = windowEnd - windowStart;
  // Degenerate viewport (container smaller than the sticky chrome + padding):
  // there is no visible window to reveal into, so never scroll on this axis.
  if (windowSize <= 0) return null;
  if (start >= windowStart && end <= windowEnd) return null;
  // Oversized range (or start hidden): align the start edge to the window start.
  if (end - start > windowSize || start < windowStart) {
    return Math.max(0, start - stickyStart - REVEAL_SCROLL_PADDING_PX);
  }
  // Only the end is clipped: pull it just inside the window's far edge.
  return Math.max(0, end - viewport + REVEAL_SCROLL_PADDING_PX);
}

export function computeRevealScroll(input: RevealScrollInput): RevealScrollTarget {
  return {
    left: input.allowHorizontal
      ? revealAxis(
          input.scrollLeft,
          input.viewportWidth,
          input.stickyLeft,
          input.clipLeft,
          input.clipRight,
        )
      : null,
    top: revealAxis(
      input.scrollTop,
      input.viewportHeight,
      input.stickyTop,
      input.clipTop,
      input.clipBottom,
    ),
  };
}
