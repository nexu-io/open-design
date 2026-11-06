/**
 * The grab target and translation gesture for one automation segment.
 *
 * Kept separate from the lane's gesture router: proximity is measured against
 * the sampled envelope, while movement reuses the same shape-preserving group
 * math as a box selection.
 */

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  sampleAutomationLane,
  type AutomationRange,
  type HfAutomationLane,
} from "@hyperframes/core/audio-automation";
import { SEGMENT_GRAB_PX } from "./automationLaneGeometry";
import { armSegmentDrag, computeGroupMove, type GroupDragSnapshot } from "./automationLaneDragMath";

interface UseAutomationSegmentDragInput {
  getBox(): DOMRect | null;
  lane: HfAutomationLane;
  range: AutomationRange;
  pointAt(clientX: number, clientY: number): { t: number; v: number };
  xOf(t: number): number;
  yOf(v: number): number;
  segmentIndex(clientX: number, clientY: number): number | null;
  commitPoints(points: HfAutomationLane["points"], persist: boolean): void;
  duration: number;
  snapTimes: readonly number[] | undefined;
  readOnly: boolean | undefined;
  onHint(hint: string | null): void;
}

export function useAutomationSegmentDrag({
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
  onHint,
}: UseAutomationSegmentDragInput) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const snapshot = useRef<GroupDragSnapshot | null>(null);

  /** Segment whose drawn line is close enough to grab, or null. */
  const hitIndex = useCallback(
    (clientX: number, clientY: number): number | null => {
      const box = getBox();
      if (!box) return null;
      const index = segmentIndex(clientX, clientY);
      if (index === null) return null;
      const { t } = pointAt(clientX, clientY);
      const value = sampleAutomationLane(lane, t, range.scale);
      return Math.abs(yOf(value) - (clientY - box.top)) <= SEGMENT_GRAB_PX ? index : null;
    },
    [getBox, lane, pointAt, range.scale, segmentIndex, yOf],
  );

  const arm = useCallback(
    (index: number, clientX: number, clientY: number): void => {
      snapshot.current = armSegmentDrag(lane, index, pointAt(clientX, clientY));
      setHoverIndex(null);
      setDragIndex(index);
    },
    [lane, pointAt],
  );

  const move = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): void => {
      const group = snapshot.current;
      if (!group) return;
      const moved = computeGroupMove({
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
      onHint(moved.hint);
      commitPoints(moved.points, false);
    },
    [commitPoints, duration, onHint, pointAt, range, snapTimes, xOf, yOf],
  );

  const finish = useCallback((): void => {
    snapshot.current = null;
    setDragIndex(null);
  }, []);

  const updateHover = useCallback(
    (clientX: number, clientY: number): void => {
      setHoverIndex(readOnly ? null : hitIndex(clientX, clientY));
    },
    [hitIndex, readOnly],
  );

  const clearHover = useCallback((): void => setHoverIndex(null), []);

  return { dragIndex, hoverIndex, hitIndex, arm, move, finish, updateHover, clearHover };
}
