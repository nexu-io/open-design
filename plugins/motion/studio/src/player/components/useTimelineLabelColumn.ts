import { useMemo } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { TimelineElement } from "../store/playerStore";
import { GUTTER, LABEL_COL_W, TRACKS_LEFT_PAD } from "./timelineLayout";
import { timelineNeedsLabelColumn } from "./timelineViewModel";

export function useTimelineLabelColumn(
  animationsByElement: ReadonlyMap<string, readonly GsapAnimation[]>,
  elements: readonly TimelineElement[],
) {
  const labelMode = useMemo(
    () => timelineNeedsLabelColumn(animationsByElement, elements),
    [animationsByElement, elements],
  );
  // The label column provides pre-t=0 space; otherwise keep TRACKS_LEFT_PAD after the gutter.
  const contentOrigin = labelMode ? LABEL_COL_W + GUTTER : GUTTER + TRACKS_LEFT_PAD;
  return { labelMode, contentOrigin };
}
