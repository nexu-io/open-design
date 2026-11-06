/**
 * Convert a live tween (from `readRuntimeKeyframes`) into renderable motion-path
 * geometry for the on-canvas overlay. Pure — no React/DOM — so it unit-tests in
 * isolation. Coordinates are in composition space (the same space the overlay's
 * viewBox uses), so the caller renders nodes/points directly.
 */
import type { ReadTween } from "../../hooks/gsapRuntimeKeyframes";

/** Which source edit a dragged node maps to. */
export type MotionNodeRef =
  | { type: "keyframe"; pct: number; step?: number } // x/y keyframe at this tween-relative %, array slot
  | { type: "waypoint"; index: number }; // motionPath waypoint (anchor) at this index

/** An offset on the path and the layout width/height set there, when one is. */
export interface MotionPathPoint {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface MotionPathNode extends MotionPathPoint {
  ref: MotionNodeRef;
}

/** The live layer's centre without its x/y offset, its layout size now, and the share of a size
 *  change that moves the centre (0.5 from the left edge; 0 when xPercent -50 centres it). */
export type MotionPathHome = { x: number; y: number; w: number; h: number; ax: number; ay: number };

/** Where the layer's centre is at a node, with the size that keyframe sets. */
export function nodeCentre(n: MotionPathPoint, home: MotionPathHome, pScale: number) {
  const grow = (to: number | undefined, now: number, share: number) =>
    to === undefined ? 0 : (to - now) * share;
  return {
    x: home.x + (n.x + grow(n.w, home.w, home.ax)) * pScale,
    y: home.y + (n.y + grow(n.h, home.h, home.ay)) * pScale,
  };
}

export interface MotionPathGeometry {
  /** "linear" = x/y keyframes; "arc" = motionPath tween. */
  kind: "linear" | "arc";
  /** SVG polyline points: "x,y x,y ...". */
  points: string;
  nodes: MotionPathNode[];
  /** Where GSAP started the tween, when its first keyframe comes later: drawn, not draggable. */
  start?: MotionPathPoint;
}

/**
 * Build motion-path geometry, or null when the tween carries no positional path
 * (fewer than two keyframes with both x and y). For motionPath tweens the
 * keyframes are the arc waypoints (anchors), index-aligned with the source path
 * — so a waypoint node at index `i` rewrites source waypoint `i`.
 *
 * ponytail: the arc is drawn as a polyline through its waypoints (matching the
 * angular dotted look of the reference), not GSAP's resolved curve. Dense
 * curve sampling is a later refinement if the straight-segment preview proves
 * insufficient.
 */
/**
 * Nearest point on a polyline to (px, py), with the index of the segment it
 * lies on and `t` = how far along that segment the returned point sits.
 *
 * `t` semantics: clamped to the inclusive range [0, 1].
 *   - `t === 0` → the point is at (or projects before) the segment's start node
 *     (`segIndex`); a perpendicular dropped from (px, py) falls at or behind `a`.
 *   - `0 < t < 1` → the point is strictly interior to the segment.
 *   - `t === 1` → the point is at (or projects PAST) the segment's end node
 *     (`segIndex + 1`); past-the-end projections are clamped back onto the endpoint,
 *     so the returned (x, y) is exactly `nodes[segIndex + 1]`. Callers can read
 *     `t === 1` as "snapped to the end anchor of this segment" (equivalently, the
 *     start anchor of the next segment).
 * A degenerate zero-length segment (`a === b`) yields `t === 0`.
 *
 * Used to position the ghost "add" node and decide where a new node goes: a
 * motionPath waypoint inserts between `segIndex`/`segIndex + 1`, a keyframe
 * interpolates its tween-% from the two adjacent keyframes via `t`.
 * Coordinates are whatever space the caller passes (overlay uses absolute px).
 */
export function nearestPointOnPath(
  px: number,
  py: number,
  nodes: Array<{ x: number; y: number }>,
): { x: number; y: number; segIndex: number; t: number; dist: number } | null {
  if (nodes.length < 2) return null;
  let best: { x: number; y: number; segIndex: number; t: number; dist: number } | null = null;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    const dist = Math.hypot(px - cx, py - cy);
    if (!best || dist < best.dist) best = { x: cx, y: cy, segIndex: i, t, dist };
  }
  return best;
}

const finiteNumber = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/** The layout width/height a keyframe sets, when it sets one. */
function sizeAt(p: Record<string, unknown>): { w?: number; h?: number } {
  return {
    ...(finiteNumber(p.width) && { w: p.width }),
    ...(finiteNumber(p.height) && { h: p.height }),
  };
}

export function buildMotionPathGeometry(
  read: ReadTween | null,
  base: { x: number; y: number } = { x: 0, y: 0 },
): MotionPathGeometry | null {
  if (!read) return null;
  const isArc = Boolean(read.arcPath);
  const nodes: MotionPathNode[] = [];

  // Index by source position so a waypoint node maps to the matching source
  // anchor. Arc waypoints always carry x/y (never filtered), so source index
  // and node order stay aligned.
  // Which axes does the tween animate at all? A single-axis tween (e.g.
  // `to({ x: -260 })`) only carries x; its y stays at `base`, GSAP's live y (a CSS
  // translate it folded in, else 0), so we default it and still draw a path. But if the tween
  // DOES animate an axis and a given keyframe omits it, that value is interpolated
  // (not 0) and can't be placed here → skip that node (the prior behavior).
  const tweenHasX = read.keyframes.some((kf) => finiteNumber(kf.properties.x));
  const tweenHasY = read.keyframes.some((kf) => finiteNumber(kf.properties.y));
  if (!tweenHasX && !tweenHasY) return null; // no positional motion (opacity/scale only)

  const pointAt = (p: Record<string, unknown>): MotionPathPoint | null => {
    if ((tweenHasX && !finiteNumber(p.x)) || (tweenHasY && !finiteNumber(p.y))) return null;
    const x = tweenHasX ? (p.x as number) : base.x;
    const y = tweenHasY ? (p.y as number) : base.y;
    return { x, y, ...sizeAt(p) };
  };
  read.keyframes.forEach((kf, i) => {
    const at = pointAt(kf.properties);
    if (!at) return;
    nodes.push({
      ...at,
      ref: isArc
        ? { type: "waypoint", index: i }
        : { type: "keyframe", pct: kf.percentage, ...(kf.step == null ? {} : { step: kf.step }) },
    });
  });

  if (nodes.length < 2) return null;
  const start = !isArc && read.start ? pointAt(read.start) : null;

  return {
    kind: isArc ? "arc" : "linear",
    points: nodes.map((n) => `${n.x},${n.y}`).join(" "),
    nodes,
    ...(start && { start }),
  };
}
