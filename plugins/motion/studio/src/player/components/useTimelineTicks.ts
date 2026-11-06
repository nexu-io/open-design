import { useMemo } from "react";
import type { TimelineTimeDisplayMode } from "../../utils/studioUiPreferences";
import { useCompositionFps } from "../../utils/linkedClipPreferences";
import type { TimelineTimeRange } from "../lib/timelineClipIndex";
import {
  generateTicks,
  getTimelineMajorTickInterval,
  rulerFrameRate,
} from "./timelineRulerGeometry";

export function useTimelineTicks(
  duration: number,
  pixelsPerSecond: number,
  timeDisplayMode: TimelineTimeDisplayMode,
  renderTimeRange?: TimelineTimeRange,
) {
  const compositionFps = useCompositionFps();
  const frameRate = rulerFrameRate(timeDisplayMode, compositionFps);
  const ticks = useMemo(
    () => generateTicks(duration, pixelsPerSecond, frameRate, renderTimeRange),
    [duration, frameRate, pixelsPerSecond, renderTimeRange],
  );
  return {
    ...ticks,
    frameRate,
    majorTickInterval: getTimelineMajorTickInterval(duration, pixelsPerSecond, frameRate),
  };
}
