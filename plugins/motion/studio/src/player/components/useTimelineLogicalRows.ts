import { useMemo } from "react";
import {
  buildTimelineLogicalRows,
  type BuildTimelineLogicalRowsInput,
} from "./timelineKeyboardNavigation";

type TimelineLogicalRowsInput = BuildTimelineLogicalRowsInput;

/** Shared by rendering and focus coordination; stable input refs preserve memo identity. */
export function useTimelineLogicalRows({
  tracks,
  displayTrackOrder,
  laneCounts,
  selectedElementId,
  selectedElementIds,
  expandedClipIds,
  collapsedGroupIds,
  expandedLaneOwnerIds,
  groups,
  trackGroupOf,
  gsapAnimations,
}: TimelineLogicalRowsInput) {
  return useMemo(
    () =>
      buildTimelineLogicalRows({
        tracks,
        displayTrackOrder,
        laneCounts,
        selectedElementId,
        selectedElementIds,
        expandedClipIds,
        collapsedGroupIds,
        expandedLaneOwnerIds,
        groups,
        trackGroupOf,
        gsapAnimations,
      }),
    [
      displayTrackOrder,
      expandedClipIds,
      collapsedGroupIds,
      expandedLaneOwnerIds,
      groups,
      trackGroupOf,
      gsapAnimations,
      laneCounts,
      selectedElementId,
      selectedElementIds,
      tracks,
    ],
  );
}
