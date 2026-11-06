import { useMemo } from "react";
import { createTimelineClipIndex } from "../lib/timelineClipIndex";
import {
  getTimelineRenderTimeRange,
  getTimelineVisibleTimeRange,
} from "./timelineViewportGeometry";
import type { TimelineScrollViewportSnapshot } from "./useTimelineScrollViewport";

interface UseTimelineClipRenderWindowInput {
  tracks: Parameters<typeof createTimelineClipIndex>[0];
  viewport: TimelineScrollViewportSnapshot;
  pixelsPerSecond: number;
  contentOrigin: number;
  duration: number;
  selectedElementId?: string;
  draggedElementId?: string;
  resizingElementIds?: readonly string[];
  focusedElementId?: string;
  focusedEaseElementId?: string;
  clipContextMenuElementId?: string;
  keyframeContextMenuElementId?: string;
}

export function useTimelineClipRenderWindow({
  tracks,
  viewport,
  pixelsPerSecond,
  contentOrigin,
  duration,
  selectedElementId,
  draggedElementId,
  resizingElementIds,
  focusedElementId,
  focusedEaseElementId,
  clipContextMenuElementId,
  keyframeContextMenuElementId,
}: UseTimelineClipRenderWindowInput) {
  const clipIndex = useMemo(() => createTimelineClipIndex(tracks), [tracks]);
  const renderTimeRange = useMemo(
    () => getTimelineRenderTimeRange(viewport, pixelsPerSecond, contentOrigin, duration),
    [contentOrigin, duration, pixelsPerSecond, viewport],
  );
  const visibleTimeRange = useMemo(
    () => getTimelineVisibleTimeRange(viewport, pixelsPerSecond, contentOrigin, duration),
    [contentOrigin, duration, pixelsPerSecond, viewport],
  );
  const pinnedClipIdentities = useMemo(
    () =>
      new Set(
        [
          selectedElementId,
          draggedElementId,
          ...(resizingElementIds ?? []),
          focusedElementId,
          focusedEaseElementId,
          clipContextMenuElementId,
          keyframeContextMenuElementId,
        ].filter((identity): identity is string => identity !== undefined),
      ),
    [
      clipContextMenuElementId,
      draggedElementId,
      focusedEaseElementId,
      focusedElementId,
      keyframeContextMenuElementId,
      resizingElementIds,
      selectedElementId,
    ],
  );
  return { clipIndex, renderTimeRange, visibleTimeRange, pinnedClipIdentities };
}
