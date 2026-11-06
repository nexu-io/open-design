// fallow-ignore-file code-duplication
// Snap computation engine — pure functions, zero React/DOM dependencies.
// All position values are in overlay-space (screen) pixels.

export const SNAP_THRESHOLD_PX = 6;
/**
 * Pointer travel a MOVE must reach before snapping is allowed to touch it.
 *
 * An element resting within the threshold of a guide is already "snappable", so
 * a snap computed on the very first frame displaces it by up to the threshold
 * while the pointer has moved nothing — pick a selection up and the whole thing
 * teleports before you have dragged at all. Snapping is meant to pull toward a
 * guide as the user drags, so it does not participate until the drag is real.
 * The value matches the distance a drag must cover to count as a drag rather
 * than a click, so nothing below it moves anything.
 */
const SNAP_ENGAGE_TRAVEL_PX = 4;

/** Whether a move of this size has travelled far enough for snapping to apply. */
export function snapEngagedForTravel(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= SNAP_ENGAGE_TRAVEL_PX;
}

const EQUIDISTANCE_TOLERANCE_PX = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapEdge {
  position: number;
  source: "grid";
  id: string;
}

export interface SnapTarget {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  id: string;
}

export interface SnapGuide {
  axis: "x" | "y";
  position: number;
  /** Extent of the guide line (min of involved elements). */
  from: number;
  /** Extent of the guide line (max of involved elements). */
  to: number;
}

export interface SpacingGuide {
  axis: "x" | "y";
  /** Position of the gap (start of gap). */
  position: number;
  /** Size of the gap in pixels. */
  size: number;
  /** Extent for rendering the indicator. */
  from: number;
  /** Extent for rendering the indicator. */
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
  spacingGuides: SpacingGuide[];
}

// ---------------------------------------------------------------------------
// Rect shorthand used across the public API
// ---------------------------------------------------------------------------

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rectRight(r: Rect): number {
  return r.left + r.width;
}

function rectBottom(r: Rect): number {
  return r.top + r.height;
}

function rectCenterX(r: Rect): number {
  return r.left + r.width / 2;
}

function rectCenterY(r: Rect): number {
  return r.top + r.height / 2;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert overlay rects to snap targets with precomputed edges & centers.
 */
export function extractSnapTargets(entries: Array<{ rect: Rect; id: string }>): SnapTarget[] {
  return entries.map(({ rect: r, id }) => ({
    left: r.left,
    top: r.top,
    right: rectRight(r),
    bottom: rectBottom(r),
    centerX: rectCenterX(r),
    centerY: rectCenterY(r),
    id,
  }));
}

/**
 * Create a snap target from the composition/overlay boundary.
 */
export function buildCompositionSnapTarget(rect: Rect): SnapTarget {
  return {
    left: rect.left,
    top: rect.top,
    right: rectRight(rect),
    bottom: rectBottom(rect),
    centerX: rectCenterX(rect),
    centerY: rectCenterY(rect),
    id: "composition",
  };
}

/**
 * Generate grid-line snap edges.
 * `gridSpacing` is in composition pixels; `scale` converts to overlay pixels.
 * X edges are vertical grid lines; Y edges are horizontal grid lines.
 */
export function buildGridSnapEdges(
  compositionRect: Rect,
  gridSpacing: number,
  scale: number,
): { x: SnapEdge[]; y: SnapEdge[] } {
  const xEdges: SnapEdge[] = [];
  const yEdges: SnapEdge[] = [];

  if (gridSpacing <= 0 || scale <= 0) return { x: xEdges, y: yEdges };

  const step = gridSpacing * scale;

  // Vertical grid lines (x-axis edges)
  let x = compositionRect.left + step;
  const xMax = compositionRect.left + compositionRect.width;
  let idx = 0;
  while (x < xMax) {
    xEdges.push({ position: x, source: "grid", id: `grid-x-${idx}` });
    x += step;
    idx++;
  }

  // Horizontal grid lines (y-axis edges)
  let y = compositionRect.top + step;
  const yMax = compositionRect.top + compositionRect.height;
  idx = 0;
  while (y < yMax) {
    yEdges.push({ position: y, source: "grid", id: `grid-y-${idx}` });
    y += step;
    idx++;
  }

  return { x: xEdges, y: yEdges };
}

// ---------------------------------------------------------------------------
// Internal snap resolution helpers
// ---------------------------------------------------------------------------

interface EdgeCandidate {
  /** Distance the moving rect must adjust to align with this edge. */
  adjustment: number;
  /** Absolute distance (for comparison). */
  distance: number;
  /** Position of the guide line. */
  guidePosition: number;
  /** Source of the match. */
  source: "element" | "composition" | "grid";
  /** Id of the target or grid line. */
  targetId: string;
}

/**
 * Collect edge candidates on a single axis for a moving rect.
 * `movingEdges` are the edges of the moving rect (e.g. left, centerX, right).
 * `targetEdges` are the corresponding edges on each target.
 */
// fallow-ignore-next-line complexity
function collectCandidates(
  movingEdges: number[],
  targets: SnapTarget[],
  targetEdgeExtractor: (t: SnapTarget) => number[],
  gridEdges: SnapEdge[] | undefined,
  threshold: number,
): EdgeCandidate[] {
  const candidates: EdgeCandidate[] = [];

  for (const target of targets) {
    const tEdges = targetEdgeExtractor(target);
    for (const mEdge of movingEdges) {
      for (const tEdge of tEdges) {
        const adjustment = tEdge - mEdge;
        const distance = Math.abs(adjustment);
        if (distance <= threshold) {
          candidates.push({
            adjustment,
            distance,
            guidePosition: tEdge,
            source: target.id === "composition" ? "composition" : "element",
            targetId: target.id,
          });
        }
      }
    }
  }

  if (gridEdges) {
    for (const edge of gridEdges) {
      for (const mEdge of movingEdges) {
        const adjustment = edge.position - mEdge;
        const distance = Math.abs(adjustment);
        if (distance <= threshold) {
          candidates.push({
            adjustment,
            distance,
            guidePosition: edge.position,
            source: "grid",
            targetId: edge.id,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * From a list of candidates, pick the best adjustment:
 * - Element/composition matches take priority over grid matches.
 * - Among equal-priority matches, pick the smallest distance.
 * - Return all guides that share the winning adjustment.
 */
function pickBest(candidates: EdgeCandidate[]): {
  adjustment: number;
  matches: EdgeCandidate[];
} | null {
  if (candidates.length === 0) return null;

  // Partition into element/composition vs grid
  const elementCandidates = candidates.filter(
    (c) => c.source === "element" || c.source === "composition",
  );
  const gridCandidates = candidates.filter((c) => c.source === "grid");

  // Pick the pool with the best (smallest distance) match, preferring element
  let pool: EdgeCandidate[];
  const bestElem = elementCandidates.length
    ? Math.min(...elementCandidates.map((c) => c.distance))
    : Infinity;
  const bestGrid = gridCandidates.length
    ? Math.min(...gridCandidates.map((c) => c.distance))
    : Infinity;

  if (bestElem <= bestGrid) {
    pool = elementCandidates;
  } else {
    pool = gridCandidates;
  }

  const minDist = Math.min(...pool.map((c) => c.distance));
  const winners = pool.filter((c) => c.distance === minDist);

  // When candidates at the same distance pull in opposite directions (e.g.
  // element centered between two equidistant targets), suppress the snap
  // entirely — the element holds where the user dragged it.
  const hasPositive = winners.some((c) => c.adjustment > 0);
  const hasNegative = winners.some((c) => c.adjustment < 0);
  if (hasPositive && hasNegative) return null;

  const adjustment = winners[0].adjustment;
  const matches = pool.filter((c) => c.adjustment === adjustment);
  return { adjustment, matches };
}

// ---------------------------------------------------------------------------
// Guide extent computation
// ---------------------------------------------------------------------------

function computeGuideExtent(
  axis: "x" | "y",
  movingRect: Rect,
  matchedTargetIds: string[],
  targetMap: Map<string, SnapTarget>,
): { from: number; to: number } {
  const extents: number[] = [];

  if (axis === "x") {
    extents.push(movingRect.top, rectBottom(movingRect));
    for (const tid of matchedTargetIds) {
      const t = targetMap.get(tid);
      if (t) extents.push(t.top, t.bottom);
    }
  } else {
    extents.push(movingRect.left, rectRight(movingRect));
    for (const tid of matchedTargetIds) {
      const t = targetMap.get(tid);
      if (t) extents.push(t.left, t.right);
    }
  }

  return { from: Math.min(...extents), to: Math.max(...extents) };
}

// ---------------------------------------------------------------------------
// Shared guide-building logic
// ---------------------------------------------------------------------------

function buildGuidesFromMatches(
  bestX: { adjustment: number; matches: EdgeCandidate[] } | null,
  bestY: { adjustment: number; matches: EdgeCandidate[] } | null,
  adjustedRect: Rect,
  targetMap: Map<string, SnapTarget>,
): SnapGuide[] {
  const guides: SnapGuide[] = [];

  for (const [axis, best] of [
    ["x", bestX],
    ["y", bestY],
  ] as const) {
    if (!best) continue;
    const seenPositions = new Set<number>();
    for (const m of best.matches) {
      if (seenPositions.has(m.guidePosition)) continue;
      seenPositions.add(m.guidePosition);
      const targetIds = best.matches
        .filter((mm) => mm.guidePosition === m.guidePosition)
        .map((mm) => mm.targetId);
      const extent = computeGuideExtent(axis, adjustedRect, targetIds, targetMap);
      guides.push({ axis, position: m.guidePosition, from: extent.from, to: extent.to });
    }
  }

  return guides;
}

const DISABLED_RESULT = (dx: number, dy: number): SnapResult => ({
  dx,
  dy,
  guides: [],
  spacingGuides: [],
});

// ---------------------------------------------------------------------------
// resolveSnapAdjustment — main drag snap entry point
// ---------------------------------------------------------------------------

// fallow-ignore-next-line complexity
export function resolveSnapAdjustment(input: {
  movingRect: Rect;
  proposedDx: number;
  proposedDy: number;
  targets: SnapTarget[];
  gridEdges?: { x: SnapEdge[]; y: SnapEdge[] };
  threshold: number;
  disabled: boolean;
  /** Set when the gesture has not travelled far enough for snapping yet. */
  disabledForTravel?: boolean;
  lockedAxis?: "x" | "y";
}): SnapResult {
  if (input.disabled || input.disabledForTravel || input.threshold <= 0) {
    return DISABLED_RESULT(input.proposedDx, input.proposedDy);
  }

  const mr = input.movingRect;
  const proposed: Rect = {
    left: mr.left + input.proposedDx,
    top: mr.top + input.proposedDy,
    width: mr.width,
    height: mr.height,
  };

  const xCandidates = collectCandidates(
    [proposed.left, rectCenterX(proposed), rectRight(proposed)],
    input.targets,
    (t) => [t.left, t.centerX, t.right],
    input.gridEdges?.x,
    input.threshold,
  );
  const yCandidates = collectCandidates(
    [proposed.top, rectCenterY(proposed), rectBottom(proposed)],
    input.targets,
    (t) => [t.top, t.centerY, t.bottom],
    input.gridEdges?.y,
    input.threshold,
  );

  const bestX = input.lockedAxis === "x" ? null : pickBest(xCandidates);
  const bestY = input.lockedAxis === "y" ? null : pickBest(yCandidates);
  const adjustedDx = input.proposedDx + (bestX?.adjustment ?? 0);
  const adjustedDy = input.proposedDy + (bestY?.adjustment ?? 0);

  const adjustedRect: Rect = {
    left: mr.left + adjustedDx,
    top: mr.top + adjustedDy,
    width: mr.width,
    height: mr.height,
  };

  const targetMap = new Map(input.targets.map((t) => [t.id, t]));

  return {
    dx: adjustedDx,
    dy: adjustedDy,
    guides: buildGuidesFromMatches(bestX, bestY, adjustedRect, targetMap),
    spacingGuides: [], // computed separately via resolveEquidistanceGuides
  };
}

// ---------------------------------------------------------------------------
// resolveGuideLineRect — screen rect for rendering a snap guide line
// ---------------------------------------------------------------------------

/**
 * Full-length guide line spanning the composition: a vertical line (axis "x")
 * runs the composition's height at the snapped x position; a horizontal line
 * (axis "y") runs the composition's width. `composition` is the composition
 * rect in overlay space — guide positions are already overlay-space, so the
 * line must be offset by the composition's left/top (the canvas is usually
 * letterboxed inside the overlay).
 */
export function resolveGuideLineRect(guide: SnapGuide, composition: Rect): Rect {
  if (guide.axis === "x") {
    return { left: guide.position, top: composition.top, width: 1, height: composition.height };
  }
  return { left: composition.left, top: guide.position, width: composition.width, height: 1 };
}

// ---------------------------------------------------------------------------
// resolveEquidistanceGuides
// ---------------------------------------------------------------------------

// fallow-ignore-next-line complexity
export function resolveEquidistanceGuides(input: {
  movingRect: Rect;
  targets: SnapTarget[];
  threshold: number;
}): SpacingGuide[] {
  const guides: SpacingGuide[] = [];
  const mr = input.movingRect;

  const movingTarget: SnapTarget = {
    left: mr.left,
    top: mr.top,
    right: rectRight(mr),
    bottom: rectBottom(mr),
    centerX: rectCenterX(mr),
    centerY: rectCenterY(mr),
    id: "\0__snap_moving__",
  };

  const allTargets = [...input.targets, movingTarget];

  // X axis: sort by centerX, scan for equal gaps between adjacent triplets
  const sortedX = [...allTargets].sort((a, b) => a.centerX - b.centerX);
  for (let i = 0; i < sortedX.length - 2; i++) {
    const a = sortedX[i];
    const b = sortedX[i + 1];
    const c = sortedX[i + 2];

    // Gap between A and B = B.left - A.right
    const gapAB = b.left - a.right;
    const gapBC = c.left - b.right;

    if (gapAB < 0 || gapBC < 0) continue; // overlapping elements

    // Check if the moving rect is one of A, B, or C
    const involvesMoving =
      a.id === "\0__snap_moving__" || b.id === "\0__snap_moving__" || c.id === "\0__snap_moving__";
    if (!involvesMoving) continue;

    if (Math.abs(gapAB - gapBC) <= EQUIDISTANCE_TOLERANCE_PX) {
      const crossMin = Math.min(a.top, b.top, c.top);
      const crossMax = Math.max(a.bottom, b.bottom, c.bottom);

      // Gap A-B
      guides.push({
        axis: "x",
        position: a.right,
        size: gapAB,
        from: crossMin,
        to: crossMax,
      });
      // Gap B-C
      guides.push({
        axis: "x",
        position: b.right,
        size: gapBC,
        from: crossMin,
        to: crossMax,
      });
    }
  }

  // Y axis: sort by centerY, scan for equal gaps between adjacent triplets
  const sortedY = [...allTargets].sort((a, b) => a.centerY - b.centerY);
  for (let i = 0; i < sortedY.length - 2; i++) {
    const a = sortedY[i];
    const b = sortedY[i + 1];
    const c = sortedY[i + 2];

    const gapAB = b.top - a.bottom;
    const gapBC = c.top - b.bottom;

    if (gapAB < 0 || gapBC < 0) continue;

    const involvesMoving =
      a.id === "\0__snap_moving__" || b.id === "\0__snap_moving__" || c.id === "\0__snap_moving__";
    if (!involvesMoving) continue;

    if (Math.abs(gapAB - gapBC) <= EQUIDISTANCE_TOLERANCE_PX) {
      const crossMin = Math.min(a.left, b.left, c.left);
      const crossMax = Math.max(a.right, b.right, c.right);

      guides.push({
        axis: "y",
        position: a.bottom,
        size: gapAB,
        from: crossMin,
        to: crossMax,
      });
      guides.push({
        axis: "y",
        position: b.bottom,
        size: gapBC,
        from: crossMin,
        to: crossMax,
      });
    }
  }

  return guides;
}
