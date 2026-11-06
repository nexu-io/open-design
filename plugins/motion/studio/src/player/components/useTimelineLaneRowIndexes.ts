import { useMemo } from "react";
import { usePlayerStore } from "../store/playerStore";
import type { TimelineLogicalRow } from "./timelineKeyboardNavigation";
import type { TimelineTrackGroupInfo } from "./useTimelineTrackDerivations";

/** The four pieces of group-disclosure state a group row's header reads and writes. */
export function useTimelineGroupDisclosure() {
  return {
    collapsedGroupIds: usePlayerStore((s) => s.collapsedGroupIds),
    expandedLaneOwnerIds: usePlayerStore((s) => s.expandedLaneOwnerIds),
    toggleGroupExpanded: usePlayerStore((s) => s.toggleGroupExpanded),
    toggleLaneOwnerExpanded: usePlayerStore((s) => s.toggleLaneOwnerExpanded),
  };
}

/** Two lookups TimelineLanes needs once per render: a row's logical rows by
 *  physical key, and which physical key is a group's own anchor row. */
export function useTimelineLaneRowIndexes(
  logicalRows: readonly TimelineLogicalRow[],
  groups: readonly TimelineTrackGroupInfo[],
) {
  const logicalRowsByTrack = useMemo(() => {
    const byTrack = new Map<number, TimelineLogicalRow[]>();
    for (const logicalRow of logicalRows) {
      const trackRows = byTrack.get(logicalRow.physicalTrackKey) ?? [];
      trackRows.push(logicalRow);
      byTrack.set(logicalRow.physicalTrackKey, trackRows);
    }
    return byTrack;
  }, [logicalRows]);

  const groupByAnchor = useMemo(
    () => new Map(groups.map((group) => [group.anchorKey, group])),
    [groups],
  );

  const groupMemberTracks = useMemo(
    () => new Set(groups.flatMap((group) => group.memberTracks)),
    [groups],
  );

  return { logicalRowsByTrack, groupByAnchor, groupMemberTracks };
}
