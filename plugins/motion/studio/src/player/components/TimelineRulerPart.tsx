import { TimelineRuler as TimelineRulerImpl } from "./TimelineRuler";
import { useTimelineContext } from "./TimelineProvider";

export function TimelineRulerPart() {
  const { state } = useTimelineContext();
  const props = state.canvas;
  return (
    <TimelineRulerImpl
      major={props.major}
      minor={props.minor}
      pps={props.pps}
      trackContentWidth={props.trackContentWidth}
      totalH={props.totalH}
      effectiveDuration={props.effectiveDuration}
      majorTickInterval={props.majorTickInterval}
      tickFrameRate={props.tickFrameRate}
      theme={props.theme}
      beatAnalysis={props.beatAnalysis}
      contentOrigin={props.contentOrigin}
      renderTimeRange={props.rowsVirtualized ? props.renderTimeRange : undefined}
      scrollRef={props.scrollRef}
    />
  );
}
