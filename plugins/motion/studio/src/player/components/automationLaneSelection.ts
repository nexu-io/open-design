/**
 * Range operations over one automation lane.
 *
 * `replaceRange` is the only mutator every range feature (delete, shapes,
 * paste) composes, and it carries the invariant that makes them safe:
 * the envelope OUTSIDE the selection never moves. It samples the lane at both
 * edges first and pins anchor points there, so cutting the middle out of a
 * ramp cannot reshape the rest of the clip.
 *
 * Exact for linear segments. A curved segment straddling an edge keeps its
 * edge VALUE but reshapes slightly between its own start and the anchor — the
 * curve exponent now runs over a shorter span. Accepted: the alternative is
 * splitting curves analytically for a difference the ear cannot place.
 */

import {
  MAX_AUTOMATION_POINTS,
  sampleAutomationLane,
  type AutomationRange,
  type HfAutomationLane,
  type HfAutomationPoint,
} from "@hyperframes/core/audio-automation";
import { POINT_MERGE_SEC } from "./automationLaneGeometry";

/** Points inside [t0, t1], endpoints inclusive. */
export function pointsIn(lane: HfAutomationLane, t0: number, t1: number): HfAutomationPoint[] {
  return lane.points.filter((p) => p.t >= t0 && p.t <= t1);
}

/** An anchor, unless `inner` already provides the edge within the merge radius. */
function anchor(
  lane: HfAutomationLane,
  range: AutomationRange,
  t: number,
  inner: readonly HfAutomationPoint[],
): HfAutomationPoint[] {
  if (inner.some((p) => Math.abs(p.t - t) <= POINT_MERGE_SEC)) return [];
  return [{ t, v: sampleAutomationLane(lane, t, range.scale) }];
}

/** Evenly subsample items to a budget, preserving first and last. */
function decimateEvenly<T>(items: readonly T[], budget: number): T[] {
  if (budget <= 0) return [];
  if (items.length <= budget) return [...items];
  if (budget === 1) {
    const item = items[0];
    return item ? [item] : [];
  }
  const out: T[] = [];
  const step = (items.length - 1) / (budget - 1);
  for (let i = 0; i < budget; i += 1) {
    const item = items[Math.round(i * step)];
    if (item) out.push(item);
  }
  return out;
}

export function replaceRange(input: {
  lane: HfAutomationLane;
  range: AutomationRange;
  t0: number;
  t1: number;
  inner: HfAutomationPoint[];
}): HfAutomationPoint[] {
  const { lane, range, t0, t1, inner } = input;
  // An empty lane draws a flat default; there is nothing to preserve, and
  // pinning anchors would turn "no automation" into a constant lane.
  if (lane.points.length === 0 && inner.length === 0) return [];
  const outside = lane.points.filter((p) => p.t < t0 || p.t > t1);
  const edges =
    lane.points.length === 0
      ? []
      : [...anchor(lane, range, t0, inner), ...anchor(lane, range, t1, inner)];
  const budget = Math.max(0, MAX_AUTOMATION_POINTS - outside.length - edges.length);
  const cappedInner = inner.length <= budget ? inner : decimateEvenly(inner, budget);
  return [...outside, ...edges, ...cappedInner].sort((a, b) => a.t - b.t);
}

/**
 * Whether a breakpoint falls inside the selection box, edges included.
 *
 * The one rule three places need: what Delete removes, what the lane rings, and
 * what a group drag moves. They have to agree — a point drawn as caught but left
 * behind by the drag is worse than either answer.
 *
 * Both axes, which is what makes a selection a box: a point at the right time but
 * the wrong value is not in it. Values compare in the parameter's own units, and
 * that is correct on a logarithmic axis too — the mapping to screen is monotonic,
 * so a box drawn around some pixels holds exactly the values it looks like it does.
 */
export function pointInSelection(
  point: { t: number; v: number },
  box: { t0: number; t1: number; v0: number; v1: number },
): boolean {
  return point.t >= box.t0 && point.t <= box.t1 && point.v >= box.v0 && point.v <= box.v1;
}
/**
 * Retime a selection: interior points scale proportionally into the new span,
 * then replaceRange runs over the UNION of old and new spans — growing eats
 * whatever it covers, shrinking pins anchors where the envelope re-enters.
 *
 * Interior is `pointsIn`, so a breakpoint sitting exactly ON an edge travels
 * with the stretch. Deliberate: every range operation leaves a breakpoint on the
 * edge it created, so treating that point as a fixed anchor would make the
 * commonest stretch of all — grabbing the edge to drag that point outward —
 * delete it instead. The price is that such a point lands on the union's own
 * boundary, where `anchor` then stands down (one time cannot hold two values),
 * so the segment leaving the union reshapes. That is the ONE place
 * `replaceRange`'s outside-never-moves invariant bends, and it is pinned by name
 * in automationLaneSelection.test.ts.
 */
export function retimeRange(input: {
  lane: HfAutomationLane;
  range: AutomationRange;
  t0: number;
  t1: number;
  newT0: number;
  newT1: number;
}): HfAutomationPoint[] {
  const { lane, range, t0, t1, newT0, newT1 } = input;
  const oldSpan = t1 - t0;
  const newSpan = newT1 - newT0;
  if (oldSpan <= 0 || newSpan <= 0) return lane.points;
  const inner = pointsIn(lane, t0, t1).map((p) => ({
    ...p,
    t: newT0 + ((p.t - t0) * newSpan) / oldSpan,
  }));
  return replaceRange({
    lane,
    range,
    t0: Math.min(t0, newT0),
    t1: Math.max(t1, newT1),
    inner,
  });
}
