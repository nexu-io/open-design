import type { TimelineElement } from "../store/playerStore";
import type { TimelineOverlaysState } from "./TimelineProvider";
import type { TimelineTimeRange } from "../store/rangeSelectionSlice";
import { useClipContextMenu } from "./useTimelineClipContextMenu";
import { useTimelineRangeSelection } from "./useTimelineRangeSelection";
import { usePublishRangeSelection } from "./usePublishRangeSelection";
import { useTimelineSelectionLifecycle } from "./useTimelineSelectionLifecycle";
import { useTrackGapMenu, type TrackGapHighlight } from "./useTrackGapMenu";

type OverlayStateInputs = Omit<
  TimelineOverlaysState,
  | "elements"
  | "elementsRef"
  | "gapContextMenu"
  | "onDismissGapContextMenu"
  | "onCloseTrackGap"
  | "onCloseAllTrackGaps"
  | "onHoverGapAction"
  | "rangeSelection"
  | "setRangeSelection"
> & {
  elements: TimelineElement[];
  elementsRef: { current: TimelineElement[] };
  rangeSelection: Parameters<typeof useTimelineRangeSelection>[0] & {
    onRangeSelect?: (range: TimelineTimeRange | null) => void;
  };
  gapMenu: Parameters<typeof useTrackGapMenu>[0];
  onSelectElement: ((element: TimelineElement | null) => void) | undefined;
  selectedElementId: string | null;
  setRangeSelectionRef: { current: ((selection: null) => void) | null };
};

export type TimelineOverlaysStateResult = {
  overlays: TimelineOverlaysState;
  marqueeRect: ReturnType<typeof useTimelineRangeSelection>["marqueeRect"];
  isScrubbing: ReturnType<typeof useTimelineRangeSelection>["isScrubbing"];
  handlePointerDown: ReturnType<typeof useTimelineRangeSelection>["handlePointerDown"];
  handlePointerMove: ReturnType<typeof useTimelineRangeSelection>["handlePointerMove"];
  handlePointerUp: ReturnType<typeof useTimelineRangeSelection>["handlePointerUp"];
  handlePointerCancel: ReturnType<typeof useTimelineRangeSelection>["handlePointerCancel"];
  gapHighlight: TrackGapHighlight | null;
  openGapMenu: ReturnType<typeof useTrackGapMenu>["openGapMenu"];
  onContextMenuClip: ReturnType<typeof useClipContextMenu>;
};

export function useTimelineOverlaysState({
  gapMenu,
  rangeSelection: rangeSelectionInputs,
  onSelectElement,
  selectedElementId,
  setRangeSelectionRef,
  ...state
}: OverlayStateInputs): TimelineOverlaysStateResult {
  const {
    rangeSelection,
    setRangeSelection,
    marqueeRect,
    isScrubbing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useTimelineRangeSelection(rangeSelectionInputs);
  usePublishRangeSelection(rangeSelection, rangeSelectionInputs.onRangeSelect);
  setRangeSelectionRef.current = () => setRangeSelection(null); // oxlint-disable-line react/refs -- stable ref consumed by useTimelineClipDrag
  useTimelineSelectionLifecycle(state.elements, selectedElementId, state.setShowPopover, () =>
    setRangeSelection(null),
  );
  const gap = useTrackGapMenu(gapMenu);
  const onContextMenuClip = useClipContextMenu(
    onSelectElement,
    gap.dismissGapMenu,
    state.setClipContextMenu,
  );

  return {
    overlays: {
      ...state,
      rangeSelection,
      setRangeSelection,
      gapContextMenu: gap.gapMenuModel,
      onDismissGapContextMenu: gap.dismissGapMenu,
      onCloseTrackGap: gap.closeTrackGap,
      onCloseAllTrackGaps: gap.closeAllTrackGaps,
      onHoverGapAction: gap.setHoveredGapAction,
    },
    marqueeRect,
    isScrubbing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    gapHighlight: gap.gapHighlight,
    openGapMenu: gap.openGapMenu,
    onContextMenuClip,
  };
}
