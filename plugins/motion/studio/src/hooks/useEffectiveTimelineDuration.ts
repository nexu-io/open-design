import { useMemo } from "react";
import type { TimelineElement } from "../player/store/timelineElement";
import { getEffectiveTimelineDuration } from "../player/components/timelineViewModel";

/**
 * The stored `duration` lags a moment behind an edit that pushes an element
 * past it (drag, trim, paste) — this is the actual end of the timeline, the
 * later of the stored duration and the furthest element's end.
 */
export function useEffectiveTimelineDuration(
  timelineDuration: number,
  timelineElements: readonly TimelineElement[],
): number {
  // Delegates to `getEffectiveTimelineDuration` rather than restating the
  // arithmetic: that one guards a non-finite stored duration and a non-finite
  // result (an element with NaN timing), which this copy did not — it would
  // return NaN and every downstream width became NaN with it.
  return useMemo(
    () => getEffectiveTimelineDuration(timelineDuration, timelineElements),
    [timelineDuration, timelineElements],
  );
}
