import { useCallback, useMemo } from "react";
import type { TimelineElement } from "../store/playerStore";
import type { DraggedClipState } from "./timelineClipDragTypes";
import type { ResizingClipState } from "./useTimelineClipDrag";
import {
  resolveMultiDragPreview,
  resolveResizingElementIds,
} from "./timelineProviderStateBuilders";
import { getTimelinePreviewElement } from "./timelineViewModel";
import { resolveSnapGuide } from "./timelineSnapping";

/** What the lanes draw for a live move or trim: the ghost, the clips riding along, the snap guide. */
export function useTimelineDragPreviewState(
  draggedClip: DraggedClipState | null,
  resizingClip: ResizingClipState | null,
  selectedElementIds: ReadonlySet<string>,
  timelineElements: readonly TimelineElement[],
) {
  const getPreviewElement = useCallback(
    (element: TimelineElement): TimelineElement => getTimelinePreviewElement(element, resizingClip),
    [resizingClip],
  );
  const multiDragPreview = useMemo(
    () => resolveMultiDragPreview(draggedClip, selectedElementIds, timelineElements),
    [draggedClip, selectedElementIds, timelineElements],
  );
  return {
    resizingElementIds: resolveResizingElementIds(resizingClip),
    getPreviewElement,
    draggedElement: draggedClip?.element ?? null,
    multiDragPreview,
    snapGuide: resolveSnapGuide(draggedClip, resizingClip),
  };
}
