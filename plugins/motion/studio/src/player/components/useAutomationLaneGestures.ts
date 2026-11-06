/**
 * The pointer gestures over an automation lane.
 *
 * Its own hook because the lane component sits at the studio's file ceiling and
 * because these are the parts worth testing on their own: which of a press,
 * a drag and a modifier resolves to moving a point, bending a segment,
 * drawing a selection box, or nothing at all.
 *
 * Modifiers follow Ableton's, since that is the muscle memory an automation lane
 * inherits: Shift locks a drag to one axis and fines the value down, Alt over a
 * segment curves it, and Alt during a point drag ignores the grid.
 */

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AutomationRange, HfAutomationLane } from "@hyperframes/core/audio-automation";
import { curveForDrag, formatValue, GRAB_PX, mergeInsertPoint } from "./automationLaneGeometry";
import { pointInSelection } from "./automationLaneSelection";
import { capturePointer } from "./automationLanePointer";
import { useAutomationEdgeStretch } from "./useAutomationEdgeStretch";
import { useAutomationRangeDrag } from "./useAutomationRangeDrag";
import {
  armGroupDrag,
  computeGroupMove,
  computeSinglePointMove,
  type GroupDragSnapshot,
  type ShiftAxis,
} from "./automationLaneDragMath";
import { useAutomationSegmentDrag } from "./useAutomationSegmentDrag";
import { reportPressOnTravel, useTimelineReadOnlyPress } from "./timelineReadOnly";

/** How far a press may travel and still count as a click rather than a drag. */
const CLICK_SLOP_PX = 3;

/** A point's position, or the origin when the index no longer resolves. */
function originOf(point: HfAutomationLane["points"][number] | undefined): { t: number; v: number } {
  return point ? { t: point.t, v: point.v } : { t: 0, v: 0 };
}

export interface UseAutomationLaneGesturesInput {
  /** The lane's box on screen. A getter, not the ref: the hook only ever needs
   *  the rectangle, and a ref read inside a callback is a lint the rule is right
   *  about — the value is not a dependency it can track. */
  getBox(): DOMRect | null;
  lane: HfAutomationLane;
  range: AutomationRange;
  /** Pointer position as a clip-local time and a parameter value. */
  pointAt(clientX: number, clientY: number): { t: number; v: number };
  xOf(t: number): number;
  yOf(v: number): number;
  commitPoints(points: HfAutomationLane["points"], persist: boolean, ended?: boolean): void;
  /** Clip-local times a dragged point snaps to, on top of its own neighbours. */
  snapTimes?: readonly number[] | undefined;
  readOnly?: boolean | undefined;
  onSelect?: (() => void) | undefined;
  /** Live box-select callbacks; absent = background drags do nothing (read-only lanes). */
  onRangeSelect?: ((t0: number, t1: number, v0: number, v1: number) => void) | undefined;
  onRangeClear?: (() => void) | undefined;
  duration: number; // clamp bound for box endpoints
  /** Active selection box on this lane, so a press inside it can drag its points. */
  rangeSelection?: { t0: number; t1: number; v0: number; v1: number } | null | undefined;
}

export interface UseAutomationLaneGesturesResult {
  /** Point being dragged, for the cursor and the grab circle's size. */
  dragIndex: number | null;
  /** Segment being bent, identified by the point that owns its curve. */
  curveIndex: number | null;
  /** Segment whose two endpoints are being translated together. */
  segmentDragIndex: number | null;
  /** Segment close enough to the pointer to offer that translation. */
  segmentHoverIndex: number | null;
  /** Value readout to show while a gesture is live. */
  hint: string | null;
  hitIndex(clientX: number, clientY: number): number | null;
  segmentIndex(clientX: number, clientY: number): number | null;
  /** Clear hover feedback when the pointer leaves the lane. */
  onPointerLeave(): void;
  onPointerDown(e: ReactPointerEvent<SVGSVGElement>): void;
  onPointerMove(e: ReactPointerEvent<SVGSVGElement>): void;
  /** Edge being stretched, for the cursor. Null when no stretch is live. */
  edgeDrag: "t0" | "t1" | null;
  /** Pointer resting over a stretch handle with nothing armed, so the cursor
   *  can advertise the gesture before it starts. */
  edgeHover: boolean;
  /** `pointercancel`: a live stretch reverts; anything else ends normally. */
  cancelDrag(e: ReactPointerEvent<SVGSVGElement>): void;
  endDrag(e: ReactPointerEvent<SVGSVGElement>): void;
  /** Adds a point, opens the value field on one, or straightens a segment. */
  onDoubleClick(e: ReactPointerEvent<SVGSVGElement>): void;
  /** The point whose value is being typed, and the text so far. */
  editing: { index: number; text: string } | null;
  setEditingText(text: string): void;
  commitEdit(): void;
  cancelEdit(): void;
}

export function useAutomationLaneGestures({
  getBox,
  lane,
  range,
  pointAt,
  xOf,
  yOf,
  commitPoints,
  snapTimes,
  readOnly,
  onSelect,
  onRangeSelect,
  onRangeClear,
  duration,
  rangeSelection,
}: UseAutomationLaneGesturesInput): UseAutomationLaneGesturesResult {
  const timelineReadOnlyPress = useTimelineReadOnlyPress();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [curveIndex, setCurveIndex] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  /**
   * Stretching a selection by one of its time edges (#3207).
   *
   * Kept as its own module rather than inlined: it is a fifth mutually-exclusive
   * gesture on a hook already at the file's complexity budget, and it owns a
   * snapshot the other gestures have no use for — `retimeRange` scales against
   * the bounds captured when the drag armed, so running it against the live
   * draft would compound the scale factor on every pointermove.
   *
   * Only the time edges stretch. The value extent rides through untouched, which
   * is what keeps this the same gesture it was before the selection became a box.
   */
  const stretch = useAutomationEdgeStretch({
    getBox,
    lane,
    range,
    pointAt,
    xOf,
    commitPoints,
    duration,
    readOnly,
    rangeSelection,
    // The stretch stands down on a press that lands on selected content — that
    // gesture belongs to the group drag below.
    pointInSelectionAt: (clientX, clientY) => {
      if (!rangeSelection) return false;
      const i = hitIndex(clientX, clientY);
      const p = i === null ? null : lane.points[i];
      return p ? pointInSelection(p, rangeSelection) : false;
    },
    onRangeSelect,
    onRangeClear,
    onHint: setHint,
  });
  /** Where a point drag began, so Shift can lock an axis and fine the value. */
  const dragOrigin = useRef<{ t: number; v: number } | null>(null);
  /**
   * The set a group drag moves, snapshotted on the press.
   *
   * Snapshotted rather than recomputed per move for two reasons: every point is
   * moving, so "which ones are selected" has to mean what it meant when the
   * gesture started, and the deltas have to accumulate from the original
   * positions or a rounded move would drift on every pointermove.
   */
  const groupDrag = useRef<GroupDragSnapshot | null>(null);
  /** Point whose value is being typed, and the text so far. */
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const rangeDrag = useAutomationRangeDrag({
    pointAt,
    xOf,
    yOf,
    duration,
    snapTimes,
    onRangeSelect,
    onRangeClear,
  });
  /** Where a press on a point landed, and whether it has travelled since. A press
   *  that goes nowhere is a click, which is a different gesture from a drag even
   *  though both start the same way — see the Shift branch in `endDrag`. */
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  const pressTravelled = useRef(false);
  /**
   * The axis Shift locked, decided on the gesture's first travel and held until
   * the drag ends or Shift is let go. Deciding per event followed whichever way
   * the last move leaned, so a drifting hand unlocked the axis mid-drag.
   */
  const shiftAxis = useRef<ShiftAxis>(null);

  // The value field's own handlers, above the gestures that close it: a press on the
  // lane applies whatever was typed, so onPointerDown lists commitEdit as a
  // dependency and cannot be declared before it.
  const setEditingText = useCallback((text: string): void => {
    setEditing((current) => (current ? { index: current.index, text } : null));
  }, []);

  const cancelEdit = useCallback((): void => setEditing(null), []);

  /** Apply a typed value, or drop the edit when it is not a number. */
  const commitEdit = useCallback((): void => {
    const active = editing;
    setEditing(null);
    if (!active) return;
    const typed = Number(active.text);
    if (!Number.isFinite(typed)) return;
    const clamped = Math.min(range.max, Math.max(range.min, typed));
    commitPoints(
      lane.points.map((p, i) => (i === active.index ? { ...p, v: clamped } : p)),
      true,
    );
  }, [editing, lane, range, commitPoints]);

  /** Index of a point under the pointer, or null. */
  const hitIndex = useCallback(
    (clientX: number, clientY: number): number | null => {
      const box = getBox();
      if (!box) return null;
      const px = clientX - box.left;
      const py = clientY - box.top;
      for (let i = 0; i < lane.points.length; i += 1) {
        const p = lane.points[i];
        if (p && Math.hypot(xOf(p.t) - px, yOf(p.v) - py) <= GRAB_PX * 1.6) return i;
      }
      return null;
    },
    [getBox, lane, xOf, yOf],
  );

  /** Index of the point owning the segment under the pointer, or null. */
  const segmentIndex = useCallback(
    (clientX: number, clientY: number): number | null => {
      const { t } = pointAt(clientX, clientY);
      for (let i = 0; i + 1 < lane.points.length; i += 1) {
        const a = lane.points[i];
        const b = lane.points[i + 1];
        if (a && b && t > a.t && t < b.t) return i;
      }
      return null;
    },
    [lane, pointAt],
  );

  const segmentDrag = useAutomationSegmentDrag({
    getBox,
    lane,
    range,
    pointAt,
    xOf,
    yOf,
    segmentIndex,
    commitPoints,
    duration,
    snapTimes,
    readOnly,
    onHint: setHint,
  });

  /** What a press starts: point move, segment move, or Alt segment bend. */
  const gestureAt = useCallback(
    (
      e: ReactPointerEvent<SVGSVGElement>,
    ): { kind: "point" | "segment" | "curve"; index: number } | null => {
      const index = hitIndex(e.clientX, e.clientY);
      if (index !== null) return { kind: "point", index };
      // Alt is an explicit bend gesture and retains its span-wide hit target.
      // The unmodified translation is offered only close to the drawn line.
      const segment = e.altKey
        ? segmentIndex(e.clientX, e.clientY)
        : segmentDrag.hitIndex(e.clientX, e.clientY);
      if (segment === null) return null;
      return { kind: e.altKey ? "curve" : "segment", index: segment };
    },
    [hitIndex, segmentDrag, segmentIndex],
  );

  const reportLaneEditPress = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (gestureAt(e)) reportPressOnTravel(e, timelineReadOnlyPress);
    },
    [gestureAt, timelineReadOnlyPress],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (e.button !== 0) return;
      // The lane owns this region either way. Letting a press through starts the
      // timeline's own gesture (scrub / marquee / clip drag), which then eats the
      // rest of the sequence — including the second half of a double-click.
      e.stopPropagation();
      // A press anywhere on the lane closes the value field, applying what was
      // typed — the same thing Enter and a blur do. It cannot rely on the blur: the
      // gesture branches below call preventDefault to keep the timeline from
      // scrubbing, and that suppresses the focus change the blur would come from,
      // so the field sat open until Enter however far away the next click landed.
      if (editing) commitEdit();
      if (readOnly) {
        reportLaneEditPress(e);
        // The lane sits below the clip bar, so the timeline's selection handler
        // never sees this press; selecting here is the only way in. The press then
        // goes on to arm a range drag rather than being spent on the selection: a
        // press that only selected made the first drag over any lane do nothing
        // visible, so a range took two gestures and looked broken on the first.
        onSelect?.();
        rangeDrag.arm(e);
        return;
      }
      // An active selection's edge outranks a point sitting on it. Every range
      // operation leaves a breakpoint exactly on the edge it just created, so a
      // point-first rule made the second stretch of the same edge resolve to a
      // point-drag — which is how the feature silently stopped working.
      if (stretch.arm(e)) return;
      const gesture = gestureAt(e);
      if (!gesture) {
        rangeDrag.arm(e);
        return;
      }
      e.preventDefault();
      capturePointer(e);
      segmentDrag.clearHover();
      if (gesture.kind === "curve") {
        setCurveIndex(gesture.index);
        return;
      }
      if (gesture.kind === "segment") {
        segmentDrag.arm(gesture.index, e.clientX, e.clientY);
        return;
      }
      dragOrigin.current = originOf(lane.points[gesture.index]);
      // Pressing one of a selected set drags the whole set. Pressing a point
      // outside the selection is an ordinary single-point drag, selection or no.
      groupDrag.current = armGroupDrag(lane, lane.points[gesture.index], rangeSelection);
      pressAt.current = { x: e.clientX, y: e.clientY };
      pressTravelled.current = false;
      setDragIndex(gesture.index);
    },
    [
      gestureAt,
      lane,
      readOnly,
      reportLaneEditPress,
      onSelect,
      rangeDrag,
      editing,
      commitEdit,
      // The press decides whether it starts a group drag, so it has to see the
      // selection as it is now — captured stale, a point pressed straight after
      // selecting a range read the previous selection, or none.
      rangeSelection,
      stretch,
      segmentDrag,
    ],
  );

  /** Bend the segment under the pointer, which is what Alt-dragging the line does. */
  const bendSegment = useCallback(
    (clientX: number, clientY: number): void => {
      if (curveIndex === null) return;
      const a = lane.points[curveIndex];
      const b = lane.points[curveIndex + 1];
      if (!a || !b) return;
      const { t, v } = pointAt(clientX, clientY);
      const bend = curveForDrag({ range, a, b, t, v });
      if (bend === null) return;
      // Read out where the bend now sits along the segment, which is what the
      // pointer is choosing: a percentage means more here than a curve exponent
      // the author never types.
      setHint(`bend ${Math.round(bend.viaX * 100)}%`);
      commitPoints(
        // `curve` is dropped rather than carried: the via point supersedes it, and
        // leaving a stale exponent behind would make the segment's shape depend on
        // which of the two the reader happened to honour.
        lane.points.map((p, i) =>
          i === curveIndex ? { ...p, curve: undefined, viaX: bend.viaX, viaY: bend.viaY } : p,
        ),
        false,
      );
    },
    [curveIndex, lane, pointAt, range, commitPoints],
  );

  /**
   * Move a selected set by one delta, taken from the point under the pointer.
   *
   * The whole group has to stop when its first member reaches a boundary, not
   * each point on its own: clamping individually squashes the shape flat against
   * the edge, and the gesture is meant to preserve it. Deltas are in the
   * parameter's own units, so on a logarithmic axis a group moves by Hz rather
   * than by octaves — the same as dragging one point does.
   */
  const moveGroup = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>, group: GroupDragSnapshot): void => {
      const { points, selection, hint } = computeGroupMove({
        group,
        raw: pointAt(e.clientX, e.clientY),
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        range,
        duration,
        snapTimes,
        xOf,
        yOf,
      });
      onRangeSelect?.(selection.t0, selection.t1, selection.v0, selection.v1);
      setHint(hint);
      commitPoints(points, false);
    },
    [commitPoints, duration, onRangeSelect, pointAt, range, snapTimes, xOf, yOf],
  );

  /** Move the point being dragged, honouring the modifiers held with it. */
  const movePoint = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (dragIndex === null) return;
      const group = groupDrag.current;
      if (group) {
        moveGroup(e, group);
        return;
      }
      if (!e.shiftKey) shiftAxis.current = null;
      const {
        t,
        v,
        shiftAxis: nextAxis,
      } = computeSinglePointMove({
        raw: pointAt(e.clientX, e.clientY),
        origin: dragOrigin.current,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        shiftAxis: shiftAxis.current,
        range,
        duration,
        snapTimes,
        lane,
        dragIndex,
        xOf,
        yOf,
      });
      shiftAxis.current = nextAxis;
      const next = lane.points.map((p, i) => (i === dragIndex ? { ...p, t, v } : p));
      setHint(`${formatValue(range, v)} @ ${t.toFixed(2)}s`);
      commitPoints(next, false);
    },
    [dragIndex, duration, lane, pointAt, range, commitPoints, snapTimes, xOf, yOf, moveGroup],
  );

  /** Route a live point, bend, or segment gesture after global gestures stand down. */
  const moveLiveGesture = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      const from = pressAt.current;
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > CLICK_SLOP_PX) {
        pressTravelled.current = true;
      }
      if (curveIndex !== null) bendSegment(e.clientX, e.clientY);
      else if (segmentDrag.dragIndex !== null) segmentDrag.move(e);
      else movePoint(e);
    },
    [bendSegment, curveIndex, movePoint, segmentDrag],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (stretch.edge !== null) {
        e.stopPropagation();
        // A button-less move means the browser handed the gesture back without a
        // pointerup — revert rather than leaving a half-applied retime.
        if (e.buttons === 0) stretch.cancel();
        else stretch.move(e);
        return;
      }
      if (rangeDrag.dragging) {
        e.stopPropagation();
        rangeDrag.move(e);
        return;
      }
      if (curveIndex === null && dragIndex === null && segmentDrag.dragIndex === null) {
        stretch.updateHover(e);
        segmentDrag.updateHover(e.clientX, e.clientY);
        return;
      }
      e.stopPropagation();
      moveLiveGesture(e);
    },
    [rangeDrag, curveIndex, dragIndex, segmentDrag, moveLiveGesture, stretch],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (stretch.edge !== null) {
        e.stopPropagation();
        stretch.finish();
        return;
      }
      if (rangeDrag.dragging) {
        e.stopPropagation();
        rangeDrag.finish();
        return;
      }
      if (dragIndex === null && curveIndex === null && segmentDrag.dragIndex === null) return;
      e.stopPropagation();
      const index = dragIndex;
      const shiftClicked = index !== null && e.shiftKey && !pressTravelled.current;
      setDragIndex(null);
      setCurveIndex(null);
      segmentDrag.finish();
      dragOrigin.current = null;
      groupDrag.current = null;
      shiftAxis.current = null;
      pressAt.current = null;
      setHint(null);
      // Shift+click removes the point. Decided on RELEASE, not on the press: Shift
      // held through a drag is the axis lock, and acting on the press would take
      // that gesture away. A press that never travelled was a click.
      if (shiftClicked) {
        commitPoints(
          lane.points.filter((_, i) => i !== index),
          true,
        );
        return;
      }
      commitPoints(lane.points, true);
    },
    [rangeDrag, curveIndex, dragIndex, segmentDrag, lane, commitPoints, stretch],
  );

  /**
   * `pointercancel`: the browser abandoned the gesture, so a stretch reverts
   * rather than persisting the partial retime `endDrag` would have committed.
   * Anything else ends the way a release ends it.
   */
  const cancelDrag = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (stretch.edge !== null) {
        e.stopPropagation();
        stretch.cancel();
        return;
      }
      endDrag(e);
    },
    [stretch, endDrag],
  );

  const onDoubleClick = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (readOnly) return timelineReadOnlyPress?.();
      e.stopPropagation();
      e.preventDefault();
      const onPoint = hitIndex(e.clientX, e.clientY);
      if (e.altKey) {
        // Straighten the segment back out — the counterpart to Alt-dragging it.
        const segment = onPoint ?? segmentIndex(e.clientX, e.clientY);
        if (segment === null) return;
        commitPoints(
          lane.points.map((p, i) => (i === segment ? { t: p.t, v: p.v } : p)),
          true,
        );
        return;
      }
      if (onPoint !== null) {
        // Typing beats dragging when the value has to be exact — -6.0 dB is not
        // a pixel you can find.
        const p = lane.points[onPoint];
        if (p) setEditing({ index: onPoint, text: String(Number(p.v.toFixed(3))) });
        return;
      }
      const { t, v } = pointAt(e.clientX, e.clientY);
      commitPoints(mergeInsertPoint(lane.points, t, v), true);
    },
    [lane, pointAt, commitPoints, readOnly, timelineReadOnlyPress, hitIndex, segmentIndex],
  );

  return {
    dragIndex,
    curveIndex,
    segmentDragIndex: segmentDrag.dragIndex,
    segmentHoverIndex: segmentDrag.hoverIndex,
    edgeDrag: stretch.edge,
    edgeHover: stretch.hover,
    cancelDrag,
    hint,
    hitIndex,
    segmentIndex,
    onPointerLeave: segmentDrag.clearHover,
    onPointerDown,
    onPointerMove,
    endDrag,
    onDoubleClick,
    editing,
    setEditingText,
    commitEdit,
    cancelEdit,
  };
}
