import { useCallback } from "react";
import type { TimelineElement } from "../player";
import { usePlayerStore } from "../player";

/** Drops an asset onto track 0 at the current playhead time. */
export function useAddAssetAtPlayhead(
  handleTimelineAssetDrop: (
    assetPath: string,
    placement: Pick<TimelineElement, "start" | "track">,
    durationOverride?: number,
  ) => unknown,
) {
  return useCallback(
    (assetPath: string) =>
      handleTimelineAssetDrop(assetPath, {
        start: usePlayerStore.getState().currentTime,
        track: 0,
      }),
    [handleTimelineAssetDrop],
  );
}
