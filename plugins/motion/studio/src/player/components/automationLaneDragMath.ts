/**
 * Pure position math for the two multi-point drags on an automation lane: a
 * group move (dragging a whole box-selected set by one delta) and a single
 * point's move (the modifiers and neighbour clamp one breakpoint honours).
 *
 * Split out of useAutomationLaneGestures.ts so the hook's own onPointerDown
 * and movePoint stay orchestration — read the pointer, call one of these,
 * apply the result — rather than carrying this branching themselves.
 */

import type { AutomationRange, HfAutomationLane } from "@hyperframes/core/audio-automation";
import {
  applyShiftConstraint,
  dominantDragAxis,
  MIN_POINT_GAP_SEC,
  snapLaneTime,
} from "./automationLaneGeometry";
import { pointInSelection } from "./automationLaneSelection";

/** Snap radius in clip seconds, shared with the single-point and group drags. */
export const SNAP_SEC = 0.04;

export type AutomationSelectionBox = { t0: number; t1: number; v0: number; v1: number };

/** Which points a press on `pressed` should drag together: the whole box-selected
 *  set if it contains more than one member, otherwise none (an ordinary
 *  single-point drag, selection or no). */
function resolveGroupDragIndices(
  lane: HfAutomationLane,
  pressed: HfAutomationLane["points"][number] | undefined,
  rangeSelection: AutomationSelectionBox | null | undefined,
): number[] {
  if (!rangeSelection || !pressed || !pointInSelection(pressed, rangeSelection)) return [];
  return lane.points.flatMap((p, i) => (pointInSelection(p, rangeSelection) ? [i] : []));
}

export interface GroupDragSnapshot {
  points: HfAutomationLane["points"];
  indices: number[];
  anchor: { t: number; v: number };
  selection: AutomationSelectionBox;
}

/** Snapshot to arm a group drag from a press on `pressed`, or null when the
 *  press does not land on a multi-point selection — an ordinary single-point
 *  drag, selection or no. */
export function armGroupDrag(
  lane: HfAutomationLane,
  pressed: HfAutomationLane["points"][number] | undefined,
  rangeSelection: AutomationSelectionBox | null | undefined,
): GroupDragSnapshot | null {
  const indices = resolveGroupDragIndices(lane, pressed, rangeSelection);
  if (indices.length <= 1 || !pressed) return null;
  return {
    points: lane.points.map((p) => ({ ...p })),
    indices,
    anchor: { t: pressed.t, v: pressed.v },
    selection: rangeSelection ? { ...rangeSelection } : { t0: 0, t1: 0, v0: 0, v1: 0 },
  };
}

/**
 * Snapshot the two endpoints owned by a segment drag.
 *
 * The pointer itself is the anchor: a line can be grabbed anywhere along its
 * span, and the segment must not jump so either endpoint takes the pointer's
 * place when the gesture starts.
 */
export function armSegmentDrag(
  lane: HfAutomationLane,
  index: number,
  anchor: { t: number; v: number },
): GroupDragSnapshot | null {
  const a = lane.points[index];
  const b = lane.points[index + 1];
  if (!a || !b) return null;
  return {
    points: lane.points.map((p) => ({ ...p })),
    indices: [index, index + 1],
    anchor: { ...anchor },
    selection: {
      t0: a.t,
      t1: b.t,
      v0: Math.min(a.v, b.v),
      v1: Math.max(a.v, b.v),
    },
  };
}

export interface GroupMoveResult {
  points: HfAutomationLane["points"];
  selection: AutomationSelectionBox;
  hint: string;
}

/**
 * Move a selected set by one delta, taken from the point under the pointer.
 *
 * The whole group has to stop when its first member reaches a boundary, not
 * each point on its own: clamping individually squashes the shape flat against
 * the edge, and the gesture is meant to preserve it. Deltas are in the
 * parameter's own units, so on a logarithmic axis a group moves by Hz rather
 * than by octaves — the same as dragging one point does.
 */
export function computeGroupMove(input: {
  group: GroupDragSnapshot;
  raw: { t: number; v: number };
  shiftKey: boolean;
  altKey: boolean;
  range: AutomationRange;
  duration: number;
  snapTimes: readonly number[] | undefined;
  xOf(t: number): number;
  yOf(v: number): number;
}): GroupMoveResult {
  const { group, raw, shiftKey, altKey, range, duration, snapTimes, xOf, yOf } = input;
  const moving = group.indices.map((i) => group.points[i]!);
  let dt = raw.t - group.anchor.t;
  let dv = raw.v - group.anchor.v;
  if (shiftKey) {
    // The axis lock, as a single-point drag has it: keep whichever the pointer
    // has travelled further along and drop the other.
    const alongTime = Math.abs(dt * (xOf(1) - xOf(0)));
    const alongValue = Math.abs((dv * (yOf(range.min) - yOf(range.max))) / (range.max - range.min));
    if (alongTime >= alongValue) dv = 0;
    else dt = 0;
  } else if (!altKey) {
    // Snap the point under the pointer, and move the set by that same amount.
    const others = group.points.filter((_, i) => !group.indices.includes(i)).map((p) => p.t);
    dt =
      snapLaneTime(group.anchor.t + dt, [...(snapTimes ?? []), ...others], SNAP_SEC) -
      group.anchor.t;
  }
  const times = moving.map((p) => p.t);
  const values = moving.map((p) => p.v);
  // No member may cross a point that is staying put. Only stationary
  // neighbours constrain: two selected points travel together, so the gap
  // between them never changes. Per member rather than per end of the group,
  // because a box can select a non-contiguous set — the peaks of an envelope
  // and not the dip between them.
  const gapTo = (step: 1 | -1): number[] =>
    group.indices.flatMap((i) => {
      const neighbour = group.points[i + step];
      if (!neighbour || group.indices.includes(i + step)) return [];
      // Short of the neighbour, not onto it — the lane collapses points that
      // share a time, and a group drag must not consume what it runs into.
      return [Math.max(0, Math.abs(neighbour.t - group.points[i]!.t) - MIN_POINT_GAP_SEC)];
    });
  dt = Math.min(
    Math.max(dt, -Math.min(Math.min(...times), ...gapTo(-1))),
    Math.min(duration - Math.max(...times), ...gapTo(1)),
  );
  dv = Math.min(Math.max(dv, range.min - Math.min(...values)), range.max - Math.max(...values));

  // No re-sort: clamped to the neighbours, the lane's order cannot change
  // under a drag, so the point under the pointer keeps its index.
  const points = group.points.map((p, i) =>
    group.indices.includes(i) ? { ...p, t: p.t + dt, v: p.v + dv } : p,
  );
  return {
    points,
    // The box travels with the points — both axes, or a vertical nudge would
    // slide its own points out of the box that caught them and a second nudge
    // would move fewer of them.
    selection: {
      t0: group.selection.t0 + dt,
      t1: group.selection.t1 + dt,
      v0: group.selection.v0 + dv,
      v1: group.selection.v1 + dv,
    },
    hint: `${group.indices.length} points ${dt >= 0 ? "+" : ""}${dt.toFixed(2)}s`,
  };
}

/** Where Shift last locked a single-point drag's axis. */
export type ShiftAxis = "time" | "value" | null;

/** The clip-local time and value a single dragged point should land on,
 *  honouring the modifiers held with it and the neighbours it cannot cross. */
export function computeSinglePointMove(input: {
  raw: { t: number; v: number };
  origin: { t: number; v: number } | null;
  shiftKey: boolean;
  altKey: boolean;
  shiftAxis: ShiftAxis;
  range: AutomationRange;
  duration: number;
  snapTimes: readonly number[] | undefined;
  lane: HfAutomationLane;
  dragIndex: number;
  xOf(t: number): number;
  yOf(v: number): number;
}): { t: number; v: number; shiftAxis: ShiftAxis } {
  const { raw, origin, shiftKey, altKey, range, duration, snapTimes, lane, dragIndex, xOf, yOf } =
    input;
  let shiftAxis = shiftKey ? input.shiftAxis : null;
  let { t, v } = raw;
  if (shiftKey && origin) {
    shiftAxis ??= dominantDragAxis({ origin, raw, xOf, yOf });
    ({ t, v } = applyShiftConstraint({ range, origin, raw, xOf, yOf, axis: shiftAxis }));
  }
  // Shift is a deliberate free-hand move as much as Alt is, so neither snaps.
  if (!altKey && !shiftKey) {
    const neighbours = lane.points.filter((_, i) => i !== dragIndex).map((p) => p.t);
    t = snapLaneTime(t, [...(snapTimes ?? []), ...neighbours], SNAP_SEC);
  }
  // A breakpoint cannot cross another in time, and cannot land exactly on one
  // either: the lane collapses points that share a `t`, so arriving on top of a
  // neighbour deletes it. It stops a hair short instead, which reads as touching
  // and keeps both points. Applied after the snap, which can itself put the
  // point on a beat past a neighbour.
  const floor = (lane.points[dragIndex - 1]?.t ?? -Infinity) + MIN_POINT_GAP_SEC;
  const ceiling = (lane.points[dragIndex + 1]?.t ?? Infinity) - MIN_POINT_GAP_SEC;
  const held = lane.points[dragIndex]?.t ?? t;
  t =
    ceiling >= floor
      ? Math.min(ceiling, Math.max(floor, Math.min(duration, Math.max(0, t))))
      : // Neighbours closer together than the gap leave nowhere to go, so the
        // point stays where it is rather than being flung to one side.
        held;
  return { t, v, shiftAxis };
}
