/**
 * Pure math for the timeline keyframe-diamond drag-to-retime gesture. Kept free
 * of React/store so the gesture handler stays a thin orchestrator and the
 * click-vs-drag + neighbor clamp are unit-testable in isolation.
 *
 * The diamond is positioned by clip-relative % (same basis it's drawn with), so
 * this layer works entirely in clip-%: it converts the pointer pixel delta to a
 * clip-% drop and clamps it between the dragged keyframe's neighbours (and the
 * clip bounds). The clip-%→tween-% conversion and the move-vs-resize decision
 * happen in the studio handler (it has the tween window + clip timing this layer
 * deliberately doesn't), see `keyframeRetime.ts`.
 */

/** Screen-px the pointer must travel before a press counts as a drag (else click). */
export const KEYFRAME_DRAG_THRESHOLD_PX = 4;
/** Clip-% movement below this is treated as no change (drop == original). */
const NOOP_EPSILON_PCT = 0.1;
/** Gap (clip-%) kept between a dragged interior keyframe and each neighbour so it
 *  can't equal/cross them (which would reorder the keyframes). */
const NEIGHBOR_EPSILON_PCT = 0.5;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Clamp a dragged keyframe's clip-% strictly between its immediate neighbours
 * (with a small epsilon so it can't equal/cross them) and to the clip bounds.
 *
 * - Interior keyframe → bounded by both neighbours.
 * - First keyframe (index 0) → left bound is the clip start (0%), so it's free to
 *   travel left toward/past the tween start (a boundary RESIZE the handler owns).
 * - Last keyframe → right bound is the clip end (100%), free to travel right.
 * - Lone keyframe → free across the whole clip [0, 100].
 */
export function clampToNeighbors(
  clipPct: number,
  sortedClipPcts: ReadonlyArray<number>,
  draggedIndex: number,
): number {
  const left =
    draggedIndex > 0 ? (sortedClipPcts[draggedIndex - 1] ?? 0) + NEIGHBOR_EPSILON_PCT : 0;
  const right =
    draggedIndex < sortedClipPcts.length - 1
      ? (sortedClipPcts[draggedIndex + 1] ?? 100) - NEIGHBOR_EPSILON_PCT
      : 100;
  // Degenerate window (neighbours closer than 2·epsilon): pin to the midpoint so
  // the result stays ordered between them.
  if (left > right) return (left + right) / 2;
  return clamp(clipPct, left, right);
}

export interface KeyframeDragResult {
  /** `click`: under the drag threshold → seek. `noop`: moved but resolved onto
   *  the original keyframe → skip the commit. `move`: commit the retime. */
  kind: "click" | "noop" | "move";
  /** Clip-relative drop position, neighbour- and clip-clamped (only on `move`). */
  toClipPct?: number;
}

/**
 * Decide whether a diamond press was a click or a drag, and for a drag compute
 * the neighbour-clamped clip-% drop position.
 *
 * - `draggedClipPct`: the dragged diamond's own clip-relative percentage.
 * - `draggedIndex` / `sortedClipPcts`: index of the dragged keyframe within the
 *   clip's keyframes sorted by clip-%, used for the neighbour clamp.
 */
export function resolveKeyframeDrag(opts: {
  pointerDownX: number;
  pointerUpX: number;
  clipWidthPx: number;
  draggedClipPct: number;
  draggedIndex: number;
  sortedClipPcts: ReadonlyArray<number>;
}): KeyframeDragResult {
  const dx = opts.pointerUpX - opts.pointerDownX;
  if (Math.abs(dx) < KEYFRAME_DRAG_THRESHOLD_PX || opts.clipWidthPx <= 0) {
    return { kind: "click" };
  }
  const rawClipPct = opts.draggedClipPct + (dx / opts.clipWidthPx) * 100;
  const toClipPct = clampToNeighbors(rawClipPct, opts.sortedClipPcts, opts.draggedIndex);
  if (Math.abs(toClipPct - opts.draggedClipPct) < NOOP_EPSILON_PCT) return { kind: "noop" };
  return { kind: "move", toClipPct };
}

/**
 * Live drag preview: the dragged diamond's clip-% as it follows the pointer,
 * neighbour- and clip-clamped to match where the commit will land. Visual only —
 * no runtime/GSAP hold (the #1763 flake).
 */
export function previewClipPct(opts: {
  pointerDownX: number;
  pointerMoveX: number;
  clipWidthPx: number;
  draggedClipPct: number;
  draggedIndex: number;
  sortedClipPcts: ReadonlyArray<number>;
}): number {
  if (opts.clipWidthPx <= 0) return opts.draggedClipPct;
  const dx = opts.pointerMoveX - opts.pointerDownX;
  return clampToNeighbors(
    opts.draggedClipPct + (dx / opts.clipWidthPx) * 100,
    opts.sortedClipPcts,
    opts.draggedIndex,
  );
}
