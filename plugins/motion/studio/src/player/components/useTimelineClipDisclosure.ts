/**
 * Opening and closing a track's keyframe property lanes, with the telemetry that
 * goes with it.
 *
 * Split out of `TimelineLanes.tsx` to keep that file under the studio's 600-line
 * cap. Both callbacks were already the only place the disclosure state and its
 * `keyframe_lane_expand` event were written together, which is what makes them a
 * seam rather than a shuffle.
 */

import { usePlayerStore } from "../store/playerStore";
import { trackStudioKeyframeLaneExpand } from "../../telemetry/events";

export interface TimelineClipDisclosure {
  /** The caret belongs to the ROW, so it opens and closes every clip on it at
   *  once. Toggling only the active clip left the row's state depending on which
   *  sibling happened to be selected: expand one, click another, and the row
   *  collapsed under a caret that still pointed down. */
  toggleRowExpanded: (keys: readonly string[]) => void;
  toggleClipExpanded: (key: string) => void;
}

export function useTimelineClipDisclosure(): TimelineClipDisclosure {
  const expandedClipIds = usePlayerStore((s) => s.expandedClipIds);
  const expandClips = usePlayerStore((s) => s.expandClips);
  const setClipExpanded = usePlayerStore((s) => s.setClipExpanded);
  const toggleClipExpanded = usePlayerStore((s) => s.toggleClipExpanded);

  return {
    toggleRowExpanded: (keys) => {
      const willExpand = !keys.some((key) => expandedClipIds.has(key));
      trackStudioKeyframeLaneExpand({ expanded: willExpand });
      if (willExpand) expandClips(keys);
      else for (const key of keys) setClipExpanded(key, false);
    },
    toggleClipExpanded: (key) => {
      trackStudioKeyframeLaneExpand({ expanded: !expandedClipIds.has(key) });
      toggleClipExpanded(key);
    },
  };
}
