/**
 * Pure helpers for CapCut-style asset card click behavior.
 *
 * Clicking an asset card that is ALREADY ADDED to the timeline selects the
 * corresponding clip. Clicking one NOT yet in the timeline opens a lightweight
 * preview overlay. Both behaviors are gated on "this was a click, not a drag".
 *
 * Pure — unit-tested.
 */
import type { TimelineElement } from "../player/store/playerStore";

/**
 * Find the TimelineElement that references `assetPath`, returning the one with
 * the earliest start time when multiple clips share the same source.
 *
 * Matching mirrors `deriveUsedPaths` in AssetsTab: an element's `src` may be a
 * fully-absolute URL, a server-relative `/api/projects/…/preview/…` path, a
 * `./`-prefixed relative path, or a bare relative path — all normalised to the
 * project-relative form that `assetPath` carries.
 *
 * Returns `null` when no element matches.
 */
export function findClipForAsset(
  elements: TimelineElement[],
  assetPath: string,
): TimelineElement | null {
  let best: TimelineElement | null = null;
  for (const el of elements) {
    if (!el.src) continue;
    if (normalizeSrc(el.src) !== assetPath) continue;
    if (best === null || el.start < best.start) best = el;
  }
  return best;
}

/**
 * Normalise a raw element `src` to the bare project-relative path so it can be
 * compared against the asset-list strings (which have no leading slash, no
 * origin, no query string).
 *
 * Mirrors the logic in `deriveUsedPaths` (AssetsTab.tsx) — keep in sync.
 */
function normalizeSrc(src: string): string {
  let s = src;
  try {
    const u = new URL(s);
    s = u.pathname;
  } catch {
    // Not an absolute URL — leave as-is
  }
  s = s
    .replace(/^\/api\/projects\/[^/]+\/preview\//, "")
    .replace(/^\.?\//, "")
    .split(/[?#]/)[0];
  try {
    s = decodeURIComponent(s);
  } catch {
    // Malformed encoding — use as-is
  }
  return s;
}

/** Drag-detection threshold in pixels — movements within this are treated as clicks. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * Determine whether a pointer-up event should be treated as a click given the
 * total pointer displacement since pointer-down.
 *
 * @param dx  Horizontal distance moved in pixels.
 * @param dy  Vertical distance moved in pixels.
 */
export function isPointerClick(dx: number, dy: number): boolean {
  return Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX;
}
