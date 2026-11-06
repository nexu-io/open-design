/**
 * Stretching an automation selection by one of its edges.
 *
 * Its own module because edge-stretch is a fifth mutually-exclusive gesture on a
 * lane that already sits near the studio's file ceiling, and because it has to
 * follow the same three-part contract the other gestures do — a movement
 * threshold before anything is written, a live preview the user can see, and a
 * revert when the browser abandons the gesture. It was first written without
 * them, and every one of its bugs came from that: a bare click near an edge
 * pushed an undo entry that changed nothing, the highlight stayed frozen at the
 * pre-drag bounds so the handle was invisible while it moved, and a
 * `pointercancel` persisted whatever partial retime it had reached.
 *
 * `retimeRange` is a RELATIVE transform — it scales a lane's own current point
 * positions by newSpan/oldSpan — so it must always run against the snapshot
 * taken when the drag armed, never the live draft, or the scale factor compounds
 * on every pointermove.
 */

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  AutomationRange,
  HfAutomationLane,
  HfAutomationPoint,
} from "@hyperframes/core/audio-automation";
import { capturePointer } from "./automationLanePointer";
import { retimeRange } from "./automationLaneSelection";

/** Hit radius for grabbing a selection's edge, in screen px — independent of a
 *  point's own grab radius so the two zones can be reasoned about on their own. */
const EDGE_GRAB_PX = 8;

/** Screen px a press has to travel before it counts as a stretch rather than a
 *  click. The sibling range-drag uses the same 3px, and for the same reason:
 *  below it, a press is the "clear the selection" escape, and writing anything
 *  would put a no-op entry in undo. */
const EDGE_DRAG_PX = 3;

/**
 * Narrowest selection a stretch can leave behind, in clip seconds. Its own
 * constant rather than a borrowed `POINT_MERGE_SEC`: that one is about when two
 * breakpoints are the same breakpoint, which is a different question from how
 * thin a time selection may get and still be grabbable.
 */
const MIN_SELECTION_SEC = 0.02;

export interface UseAutomationEdgeStretchInput {
  getBox(): DOMRect | null;
  lane: HfAutomationLane;
  range: AutomationRange;
  /** Pointer position as a clip-local time and a parameter value. */
  pointAt(clientX: number, clientY: number): { t: number; v: number };
  xOf(t: number): number;
  commitPoints(points: HfAutomationLane["points"], persist: boolean, ended?: boolean): void;
  /** Clamp bound for the dragged edge. */
  duration: number;
  readOnly?: boolean | undefined;
  /** Active selection on this lane, so its edges have something to grab. */
  rangeSelection?: { t0: number; t1: number; v0: number; v1: number } | null | undefined;
  /** Whether the pointer is over a point the current selection contains. Such a
   *  press is a group drag, not a stretch — see `arm`. */
  pointInSelectionAt?: ((clientX: number, clientY: number) => boolean) | undefined;
  onRangeSelect?: ((t0: number, t1: number, v0: number, v1: number) => void) | undefined;
  onRangeClear?: (() => void) | undefined;
  /** Value readout owned by the lane's gesture hook. */
  onHint(text: string | null): void;
}

export interface UseAutomationEdgeStretchResult {
  /** Edge being stretched, for the cursor. Null when no stretch is live. */
  edge: "t0" | "t1" | null;
  /** Pointer sits over a handle with no gesture live — the col-resize hint. */
  hover: boolean;
  /** Take the press as a stretch, or decline it so another gesture can have it. */
  arm(e: ReactPointerEvent<SVGSVGElement>): boolean;
  move(e: ReactPointerEvent<SVGSVGElement>): void;
  /** Pointer released: persist the stretch, or clear the selection when the
   *  press never travelled far enough to be one. */
  finish(): void;
  /** The browser abandoned the gesture: put the envelope and the selection back
   *  the way they were, with nothing persisted. */
  cancel(): void;
  updateHover(e: ReactPointerEvent<SVGSVGElement>): void;
}

/** The dragged edge, clamped inside the clip AND clear of its partner. The
 *  0/duration bound is applied LAST so a selection thinner than
 *  `MIN_SELECTION_SEC` can never push its own t0 negative — core's `cleanPoint`
 *  collapses negative times onto a duplicate t=0 on the next serialize.
 *  Exported for that ordering's own test: reaching it through the pointer needs
 *  a selection so thin that no drag can clear the movement threshold. */
export function clampEdge(
  edge: "t0" | "t1",
  raw: number,
  origin: { t0: number; t1: number; v0: number; v1: number },
  duration: number,
): number {
  if (edge === "t0") {
    return Math.max(0, Math.min(raw, origin.t1 - MIN_SELECTION_SEC));
  }
  return Math.min(duration, Math.max(raw, origin.t0 + MIN_SELECTION_SEC));
}

export function useAutomationEdgeStretch({
  getBox,
  lane,
  range,
  pointAt,
  xOf,
  commitPoints,
  duration,
  readOnly,
  rangeSelection,
  pointInSelectionAt,
  onRangeSelect,
  onRangeClear,
  onHint,
}: UseAutomationEdgeStretchInput): UseAutomationEdgeStretchResult {
  /** The live stretch: which edge, the selection it started from (fixed, as the
   *  retime's untouched anchor), the edge's own live position, and the lane's
   *  points as they stood at arm time. */
  const [drag, setDrag] = useState<{
    edge: "t0" | "t1";
    origin: { t0: number; t1: number; v0: number; v1: number };
    current: number;
    points: HfAutomationPoint[];
  } | null>(null);
  /** Whether the drag has travelled far enough to write anything at all. */
  const crossed = useRef(false);
  const [hover, setHover] = useState(false);

  /**
   * Which edge of the active selection is within grab range of the pointer's
   * screen x, over the full lane height — the handle spans the rect.
   *
   * A selection narrower than two halos has both edges under one press. The
   * midpoint split says which one wins — the same rule a nearest-distance
   * comparison expresses, written so that is legible rather than inferred, since
   * on a narrow selection it is the ONLY thing deciding the gesture. Pressing a
   * handle without moving clears the selection (see `finish`), which is what
   * gets a user out of a halo too small to aim inside.
   */
  const edgeAt = useCallback(
    (clientX: number): "t0" | "t1" | null => {
      if (!rangeSelection) return null;
      const box = getBox();
      if (!box) return null;
      const px = clientX - box.left;
      const x0 = xOf(rangeSelection.t0);
      const x1 = xOf(rangeSelection.t1);
      const near0 = Math.abs(x0 - px) <= EDGE_GRAB_PX;
      const near1 = Math.abs(x1 - px) <= EDGE_GRAB_PX;
      if (near0 && near1) return px <= (x0 + x1) / 2 ? "t0" : "t1";
      if (near0) return "t0";
      return near1 ? "t1" : null;
    },
    [rangeSelection, getBox, xOf],
  );

  const arm = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): boolean => {
      if (readOnly || !rangeSelection) return false;
      const edge = edgeAt(e.clientX);
      if (!edge) return false;
      // Selected CONTENT outranks the edge it sits on.
      //
      // #3207 had the opposite rule, and it was right for a time-only selection:
      // every range operation leaves a breakpoint exactly on the edge it created,
      // so a point-first rule made the second stretch of an edge resolve to a
      // point-drag. A box selection changes the question — a point on the edge is
      // now visibly INSIDE the selection, with the value axis saying so, and
      // dragging selected content has to move it or the box means nothing.
      //
      // So the edge still stretches everywhere it is not also selected content,
      // which is most of its length.
      if (pointInSelectionAt?.(e.clientX, e.clientY)) return false;
      e.preventDefault();
      capturePointer(e);
      setHover(false);
      crossed.current = false;
      setDrag({
        edge,
        origin: rangeSelection,
        current: edge === "t0" ? rangeSelection.t0 : rangeSelection.t1,
        points: lane.points,
      });
      return true;
    },
    [readOnly, rangeSelection, edgeAt, lane, pointInSelectionAt],
  );

  /** Preview the stretch: the partner edge stays put as the retime's anchor, and
   *  the selection itself follows the pointer so the handle being dragged is
   *  visible — the same live `onRangeSelect` the marquee drag fires. */
  const move = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (drag === null) return;
      const { edge, origin, points } = drag;
      const current = clampEdge(edge, pointAt(e.clientX, e.clientY).t, origin, duration);
      setDrag({ edge, origin, current, points });
      if (!crossed.current) {
        const from = edge === "t0" ? origin.t0 : origin.t1;
        if (Math.abs(xOf(current) - xOf(from)) <= EDGE_DRAG_PX) return;
        crossed.current = true;
      }
      const newT0 = edge === "t0" ? current : origin.t0;
      const newT1 = edge === "t1" ? current : origin.t1;
      onHint(`${newT0.toFixed(2)}s → ${newT1.toFixed(2)}s`);
      onRangeSelect?.(newT0, newT1, origin.v0, origin.v1);
      commitPoints(
        retimeRange({
          lane: { target: lane.target, points },
          range,
          t0: origin.t0,
          t1: origin.t1,
          newT0,
          newT1,
        }),
        false,
      );
    },
    [drag, pointAt, duration, xOf, onHint, onRangeSelect, commitPoints, lane.target, range],
  );

  const finish = useCallback((): void => {
    if (drag === null) return;
    const { edge, origin, current } = drag;
    setDrag(null);
    onHint(null);
    // A press that never travelled is the "clear the selection" click, exactly
    // as it is anywhere else on the background. Persisting here instead pushed
    // an undo entry that changed nothing AND made that escape unreachable
    // within a halo of either edge.
    if (!crossed.current) {
      onRangeClear?.();
      return;
    }
    crossed.current = false;
    commitPoints(lane.points, true);
    onRangeSelect?.(
      edge === "t0" ? current : origin.t0,
      edge === "t1" ? current : origin.t1,
      origin.v0,
      origin.v1,
    );
  }, [drag, onHint, onRangeClear, commitPoints, lane, onRangeSelect]);

  const cancel = useCallback((): void => {
    if (drag === null) return;
    const { origin, points } = drag;
    setDrag(null);
    onHint(null);
    if (!crossed.current) return;
    crossed.current = false;
    // Nothing was persisted: the snapshot goes back as the last live write, which
    // also ends the lane's gesture so its before-value does not outlive it.
    commitPoints(points, false, true);
    onRangeSelect?.(origin.t0, origin.t1, origin.v0, origin.v1);
  }, [drag, onHint, commitPoints, onRangeSelect]);

  const updateHover = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (!readOnly) setHover(edgeAt(e.clientX) !== null);
    },
    [readOnly, edgeAt],
  );

  return { edge: drag?.edge ?? null, hover, arm, move, finish, cancel, updateHover };
}
