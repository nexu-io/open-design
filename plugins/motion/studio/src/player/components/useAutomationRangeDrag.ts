/**
 * Drawing a new selection box over an automation lane's empty background.
 *
 * Its own module for the same reason useAutomationEdgeStretch is: a sixth
 * mutually-exclusive gesture on a hook already at the file's complexity
 * budget, and one with no use for anything the others snapshot.
 */

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { snapLaneTime } from "./automationLaneGeometry";
import { capturePointer } from "./automationLanePointer";
import { SNAP_SEC } from "./automationLaneDragMath";

export interface UseAutomationRangeDragInput {
  pointAt(clientX: number, clientY: number): { t: number; v: number };
  xOf(t: number): number;
  yOf(v: number): number;
  duration: number;
  snapTimes?: readonly number[] | undefined;
  onRangeSelect?: ((t0: number, t1: number, v0: number, v1: number) => void) | undefined;
  onRangeClear?: (() => void) | undefined;
}

export interface UseAutomationRangeDragResult {
  /** Whether a box is being drawn right now. */
  dragging: boolean;
  /** Arms a new box at the press, or declines when no caller wants to hear
   *  about one (a read-only lane). */
  arm(e: ReactPointerEvent<SVGSVGElement>): void;
  move(e: ReactPointerEvent<SVGSVGElement>): void;
  /** A sub-threshold press clears the selection rather than leaving a
   *  zero-width one behind. */
  finish(): void;
}

/**
 * A corner of the selection box under the pointer.
 *
 * Time is clamped to the clip and snaps to the grid, because the box's span is
 * also what a shape insert or a paste acts over and those want beat-aligned
 * edges. The value is taken as it lies: there is no grid on a parameter axis,
 * and rounding a dB bound would move which points the box catches.
 */
function boxCornerAt(
  e: ReactPointerEvent<SVGSVGElement>,
  input: Pick<UseAutomationRangeDragInput, "pointAt" | "duration" | "snapTimes">,
): { t: number; v: number } {
  const raw = input.pointAt(e.clientX, e.clientY);
  const clamped = Math.min(input.duration, Math.max(0, raw.t));
  return {
    t: e.altKey ? clamped : snapLaneTime(clamped, input.snapTimes ?? [], SNAP_SEC),
    v: raw.v,
  };
}

export function useAutomationRangeDrag({
  pointAt,
  xOf,
  yOf,
  duration,
  snapTimes,
  onRangeSelect,
  onRangeClear,
}: UseAutomationRangeDragInput): UseAutomationRangeDragResult {
  const [box, setBox] = useState<{
    from: { t: number; v: number };
    to: { t: number; v: number };
  } | null>(null);
  /** Whether the live drag has crossed the pixel threshold that turns a press
   *  into an actual box, rather than a click that should just clear one. */
  const crossed = useRef(false);

  const arm = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (!onRangeSelect) return;
      e.preventDefault();
      capturePointer(e);
      const corner = boxCornerAt(e, { pointAt, duration, snapTimes });
      crossed.current = false;
      setBox({ from: corner, to: corner });
    },
    [onRangeSelect, pointAt, duration, snapTimes],
  );

  const move = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      if (box === null) return;
      const to = boxCornerAt(e, { pointAt, duration, snapTimes });
      const { from } = box;
      setBox({ from, to });
      const travelled = Math.max(
        Math.abs(xOf(to.t) - xOf(from.t)),
        Math.abs(yOf(to.v) - yOf(from.v)),
      );
      if (travelled <= 3) return;
      crossed.current = true;
      onRangeSelect?.(
        Math.min(from.t, to.t),
        Math.max(from.t, to.t),
        Math.min(from.v, to.v),
        Math.max(from.v, to.v),
      );
    },
    [box, pointAt, duration, snapTimes, xOf, yOf, onRangeSelect],
  );

  const finish = useCallback((): void => {
    if (!crossed.current) onRangeClear?.();
    crossed.current = false;
    setBox(null);
  }, [onRangeClear]);

  return { dragging: box !== null, arm, move, finish };
}
