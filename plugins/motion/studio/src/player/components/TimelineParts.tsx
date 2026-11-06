import { TimelineCanvas as TimelineCanvasImpl } from "./TimelineCanvas";
import {
  TimelineClipMenuOverlay as TimelineClipMenuImpl,
  TimelineEditPopoverOverlay as TimelineEditPopoverImpl,
  TimelineGapMenuOverlay as TimelineGapMenuImpl,
  TimelineKeyframeMenuOverlay as TimelineKeyframeMenuImpl,
  TimelineShortcutHintOverlay as TimelineShortcutHintImpl,
} from "./TimelineOverlays";
import { TimelineLanes as TimelineLanesImpl } from "./TimelineLanes";
import { PlayheadIndicator } from "./PlayheadIndicator";
import { useTimelineContext } from "./TimelineProvider";
import { TimelineEmptyState } from "./TimelineEmptyState";
import { TimelineRulerPart } from "./TimelineRulerPart";

/** The provider-backed canvas shell. */
export function TimelineFrame() {
  return <TimelineCanvasImpl />;
}

/** The provider-backed ruler. */
export const TimelineRuler = TimelineRulerPart;

/**
 * The provider-backed lane renderer. TimelineFrame remains the composed Studio
 * canvas; this part is exported for hosts that own the canvas arrangement.
 */
export function TimelineLanes() {
  const { state, actions } = useTimelineContext();
  const props = state.canvas;
  return (
    <TimelineLanesImpl
      {...props}
      renderClipContent={actions.renderClipContent}
      renderClipOverlay={actions.renderClipOverlay}
    />
  );
}

/** The provider-backed playhead indicator. */
export function TimelinePlayhead() {
  const { state } = useTimelineContext();
  const props = state.canvas;
  return <PlayheadIndicator scrubbing={props.isScrubbing} />;
}

/** The provider-backed razor guide. */
export function TimelineRazorGuide() {
  const { meta } = useTimelineContext();
  return meta.razorGuide;
}

/** The composed overlay surface used by the Studio variant. */
export { TimelineOverlays } from "./TimelineOverlays";

export function TimelineEmptyStatePart() {
  const { meta } = useTimelineContext();
  return <TimelineEmptyState {...meta.emptyState} />;
}

export function TimelineShortcutHint() {
  return <TimelineShortcutHintImpl />;
}
export function TimelineEditPopover() {
  return <TimelineEditPopoverImpl />;
}
export function TimelineClipMenu() {
  return <TimelineClipMenuImpl />;
}
export function TimelineKeyframeMenu() {
  return <TimelineKeyframeMenuImpl />;
}
export function TimelineGapMenu() {
  return <TimelineGapMenuImpl />;
}
