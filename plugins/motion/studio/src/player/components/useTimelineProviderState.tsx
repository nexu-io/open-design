import { useRef, useMemo, useCallback, useState } from "react";
import { useAdjustedBeatAnalysis, useMusicBeatAnalysis } from "../../hooks/useMusicBeatAnalysis";
import { usePlayerStore } from "../store/playerStore";
import { defaultTimelineTheme } from "./timelineTheme";
import { useTimelinePlayhead } from "./useTimelinePlayhead";
import { useTimelineZoom } from "./useTimelineZoom";
import { useTimelineAssetDrop } from "./timelineDragDrop";
import { type KeyframeDiamondContextMenuState } from "./KeyframeDiamondContextMenu";
import { useTimelineClipDrag } from "./useTimelineClipDrag";
import type { ClipContextMenuState, TimelineContextValue } from "./TimelineProvider";
import { buildTimelineShellMeta } from "./timelineShellMeta";
import { useTimelineDragPreviewState } from "./useTimelineDragPreviewState";
import { useTimelineOverlaysState } from "./useTimelineOverlaysState";
import { useTimelineEditPinning } from "./useTimelineEditPinning";
import { useTimelineStackingSync } from "./useTimelineStackingSync";
import { useTimelineGeometry } from "./useTimelineGeometry";
import { useAutoExpandKeyframedClips } from "./useAutoExpandKeyframedClips";
import { GUTTER } from "./timelineLayout";
import { useTimelineLabelColumn } from "./useTimelineLabelColumn";
import { useTimelineKeyframeData } from "./useTimelineKeyframeData";
import { useTimelineScrollViewport } from "./useTimelineScrollViewport";
import { ClipContentOnceShown } from "./timelineClipChildren";
import { useResolvedTimelineEditCallbacks } from "./useResolvedTimelineEditCallbacks";
import type { TimelineProps } from "./TimelineTypes";
import {
  getTrackStyle,
  useTimelineDisplayLayout,
  useTimelineTrackLayout,
} from "./useTimelineTrackLayout";
import {
  cancelTimelineKeyframeRetime,
  useTimelineKeyframeHandlers,
} from "./useTimelineKeyframeHandlers";
import { useTimelineGapHighlights } from "./useTimelineGapHighlights";
import { useTimelineRazorInteraction } from "./TimelineRazorInteraction";
import { useTimelinePerformanceTelemetry } from "./useTimelinePerformanceTelemetry";
import { getEffectiveTimelineDuration } from "./timelineViewModel";
import { useTimelineShiftModifier } from "./useTimelineShiftModifier";
import { useTimelineTicks } from "./useTimelineTicks";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import { useTimelineClipRenderWindow } from "./useTimelineClipRenderWindow";
import { useTimelineActiveClips } from "./useTimelineActiveClips";
import { useTimelineLaneMoveRefresh } from "./useTimelineLaneMoveRefresh";
import { useTimelineLogicalFocus } from "./useTimelineLogicalFocus";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import {
  refuseWhenReadOnly,
  useAbandonEditsOnReadOnly,
  useTimelineReadOnlyPress,
} from "./timelineReadOnly";
import { cancelBeatDrag } from "./BeatStrip";
export function useTimelineProviderState({
  onSeek,
  onDrillDown,
  renderClipContent,
  renderClipOverlay,
  onFileDrop,
  onAssetDrop,
  onBlockDrop,
  onCompositionDrop,
  onDeleteElement: _onDeleteElement,
  onMoveElement: onMoveElementOverride,
  onMoveElements: onMoveElementsOverride,
  onResizeElement: onResizeElementOverride,
  onResizeElements: onResizeElementsOverride,
  onBlockedEditAttempt: onBlockedEditAttemptOverride,
  onSplitElement: onSplitElementOverride,
  onSelectElement,
  onRangeSelect,
  onCopyClip,
  onPasteClip,
  onDuplicateClip,
  canPasteClip,
  clipMenuItems,
  splitShortcut,
  theme: themeOverrides,
  showAudioEffects = true,
  showKeyframes = true,
  trackPadding,
  sessionEpoch: sessionEpochProp,
  previewIframeRef,
  onZIndexReorder,
}: TimelineProps = {}): TimelineContextValue {
  const {
    onMoveElement,
    onMoveElements,
    onResizeElement,
    onResizeElements,
    onBlockedEditAttempt,
    onLinkEdit,
    onSplitElement,
    onRazorSplitAll,
    onDeleteKeyframe,
    onDeleteAllKeyframes,
    onMoveKeyframeToPlayhead,
    onMoveKeyframe,
  } = useResolvedTimelineEditCallbacks({
    onMoveElement: onMoveElementOverride,
    onMoveElements: onMoveElementsOverride,
    onResizeElement: onResizeElementOverride,
    onResizeElements: onResizeElementsOverride,
    onBlockedEditAttempt: onBlockedEditAttemptOverride,
    onSplitElement: onSplitElementOverride,
  });
  const theme = useMemo(() => ({ ...defaultTimelineTheme, ...themeOverrides }), [themeOverrides]);
  const editContext = useTimelineEditContextOptional();
  const readOnlyPress = useTimelineReadOnlyPress();
  const oneShotEdits = refuseWhenReadOnly(readOnlyPress, {
    onBlockedEditAttempt,
    onLinkEdit,
    onRazorSplitAll,
    onToggleTrackHidden: editContext.onToggleTrackHidden,
    onTogglePropertyGroupKeyframe: editContext.onTogglePropertyGroupKeyframe,
    onRazorSplit: editContext.onRazorSplit,
  });
  const refreshAfterLaneMove = useTimelineLaneMoveRefresh();
  useMusicBeatAnalysis();
  const timelineElements = usePlayerStore((s) => s.elements);
  const adjustedBeatAnalysis = useAdjustedBeatAnalysis();
  const duration = usePlayerStore((s) => s.duration);
  const timeDisplayMode = usePlayerStore((s) => s.timeDisplayMode);
  const timelineReady = usePlayerStore((s) => s.timelineReady);
  const selectedElementId = usePlayerStore((s) => s.selectedElementId);
  const selectedElementIds = usePlayerStore((s) => s.selectedElementIds);
  const focusedEaseSegment = usePlayerStore((s) => s.focusedEaseSegment);
  const { gsapAnimations, keyframeCache } = useTimelineKeyframeData(showKeyframes);
  const { labelMode, contentOrigin } = useTimelineLabelColumn(gsapAnimations, timelineElements);
  const setSelectedElementId = usePlayerStore((s) => s.setSelectedElementId);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const beatDragging = usePlayerStore((s) => s.beatDragging);
  const timelineSessionEpoch = usePlayerStore((s) => s.timelineSessionEpoch);
  const sessionEpoch = sessionEpochProp ?? timelineSessionEpoch;
  const setFocusedEaseSegment = usePlayerStore((s) => s.setFocusedEaseSegment);
  const { zoomMode, manualZoomPercent } = useTimelineZoom();
  const playheadRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTool = usePlayerStore((s) => s.activeTool);
  const [hoveredClip, setHoveredClip] = useState<string | null>(null);
  const isDragging = useRef(false);
  const shiftHeld = useTimelineShiftModifier();
  const [showPopover, setShowPopover] = useState(false);
  const [kfContextMenu, setKfContextMenu] = useState<KeyframeDiamondContextMenuState | null>(null);
  const [clipContextMenu, setClipContextMenu] = useState<ClipContextMenuState | null>(null);
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);
  const lastScrollLeftRef = useRef(0);
  const effectiveDuration = useMemo(
    () => getEffectiveTimelineDuration(duration, timelineElements),
    [duration, timelineElements],
  );
  useAutoExpandKeyframedClips(gsapAnimations);
  const {
    tracks,
    trackStyles,
    trackOrder,
    trackOrderRef,
    trackInsertLayoutRef,
    laneCounts,
    rowGeometry,
    rowGeometryRef,
    groups,
    trackGroupOf,
  } = useTimelineTrackLayout(
    timelineElements,
    gsapAnimations,
    selectedElementId,
    selectedElementIds,
    trackPadding,
  );
  const timelineElementsRef = useRef(timelineElements);
  timelineElementsRef.current = timelineElements; // oxlint-disable-line react/refs -- event handlers read the latest elements
  const ppsRef = useRef(100);
  const durationRef = useRef(effectiveDuration);
  durationRef.current = effectiveDuration; // oxlint-disable-line react/refs -- event handlers read the latest duration
  const fitPpsRef = useRef(100);
  const {
    pinZoomBeforeEdit,
    setRangeSelectionRef,
    pinnedOnMoveElement,
    pinnedOnMoveElements,
    pinnedOnResizeElement,
    pinnedOnResizeElements,
    pinnedOnFileDrop,
    pinnedOnAssetDrop,
    pinnedOnBlockDrop,
    pinnedOnCompositionDrop,
  } = useTimelineEditPinning({
    ppsRef,
    fitPpsRef,
    onMoveElement,
    onMoveElements,
    onResizeElement,
    onResizeElements,
    onFileDrop,
    onAssetDrop,
    onBlockDrop,
    onCompositionDrop,
  });
  const { readClipZIndex, applyStackingPatches, zSyncEnabled } = useTimelineStackingSync({
    expandedElementsRef: timelineElementsRef,
    previewIframeRef,
    onZIndexReorder,
  });
  const {
    draggedClip,
    setDraggedClip,
    resizingClip,
    setResizingClip,
    blockedClipRef,
    suppressClickRef,
  } = useTimelineClipDrag({
    scrollRef,
    ppsRef,
    durationRef,
    trackOrderRef,
    trackInsertLayoutRef,
    rowGeometryRef,
    onMoveElement: pinnedOnMoveElement,
    onMoveElements: pinnedOnMoveElements,
    onResizeElement: pinnedOnResizeElement,
    onResizeElements: pinnedOnResizeElements,
    onBlockedEditAttempt: oneShotEdits.onBlockedEditAttempt,
    onLinkEdit: oneShotEdits.onLinkEdit,
    setShowPopover,
    setRangeSelectionRef,
    readZIndex: zSyncEnabled ? readClipZIndex : undefined,
    onStackingPatches: zSyncEnabled ? applyStackingPatches : undefined,
    refreshAfterLaneMove,
    sessionEpoch,
  });
  const assetDrop = useTimelineAssetDrop({
    scrollRef,
    ppsRef,
    trackOrderRef,
    elementsRef: timelineElementsRef,
    rowGeometryRef,
    contentOrigin,
    onFileDrop: pinnedOnFileDrop,
    onAssetDrop: pinnedOnAssetDrop,
    onBlockDrop: pinnedOnBlockDrop,
    onCompositionDrop: pinnedOnCompositionDrop,
    sessionEpoch,
    readOnlyPress,
  });
  const displayLayout = useTimelineDisplayLayout(draggedClip, trackOrder, rowGeometry);
  const { resizingElementIds, getPreviewElement, draggedElement, multiDragPreview, snapGuide } =
    useTimelineDragPreviewState(draggedClip, resizingClip, selectedElementIds, timelineElements);
  const { recordTimelineScroll } = useTimelinePerformanceTelemetry({
    totalClipCount: timelineElements.length,
    totalRowCount: displayLayout.displayTrackOrder.length,
    zoomMode,
  });
  const { viewport, showShortcutHint, setScrollRef, syncScrollViewport } =
    useTimelineScrollViewport(scrollRef, [
      timelineReady,
      timelineElements.length,
      displayLayout.totalH,
    ]);
  const { pps, fitPps, displayContentWidth, displayDuration, zoomModeRef } = useTimelineGeometry({
    viewportWidth: viewport.clientWidth,
    effectiveDuration,
    zoomMode,
    manualZoomPercent,
    ppsRef,
    fitPpsRef,
    draggedClip,
    resizingClip,
    expandedElements: timelineElements,
    isDragging,
    scrollRef,
    lastScrollLeftRef,
    contentOrigin,
  });
  const timelineFocus = useTimelineLogicalFocus({
    scrollRef,
    tracks,
    layout: displayLayout,
    laneCounts,
    selectedElementId,
    selectedElementIds,
    groups,
    trackGroupOf,
    gsapAnimations,
    elements: timelineElements,
    pixelsPerSecond: pps,
    contentOrigin,
    allowHorizontal: zoomMode === "manual",
    viewport,
    sessionEpoch,
    draggedRowKey: displayLayout.draggedRowKey,
    resizingElementIds,
    clipContextMenuRowKey: clipContextMenu?.element.track,
    keyframeContextMenuRowKey: kfContextMenu?.element.track,
    lastScrollLeftRef,
    syncScrollViewport,
  });
  const selectedKeyframes = usePlayerStore((s) => s.selectedKeyframes);
  const toggleSelectedKeyframe = usePlayerStore((s) => s.toggleSelectedKeyframe);
  const { onClickKeyframe, onSelectSegment, onShiftClickKeyframe, onContextMenuKeyframe } =
    useTimelineKeyframeHandlers({
      expandedElements: timelineElements,
      keyframeCache,
      onSelectElement,
      onSeek,
      setSelectedElementId,
      setKfContextMenu,
      toggleSelectedKeyframe,
    });
  const { clipIndex, renderTimeRange, visibleTimeRange, pinnedClipIdentities } =
    useTimelineClipRenderWindow({
      tracks,
      viewport,
      pixelsPerSecond: pps,
      contentOrigin,
      duration: displayDuration,
      selectedElementId: selectedElementId ?? undefined,
      draggedElementId: draggedClip ? getTimelineElementIdentity(draggedClip.element) : undefined,
      resizingElementIds,
      focusedElementId: timelineFocus.pinnedElementId,
      focusedEaseElementId: focusedEaseSegment?.elementId,
      clipContextMenuElementId: clipContextMenu
        ? getTimelineElementIdentity(clipContextMenu.element)
        : undefined,
      keyframeContextMenuElementId: kfContextMenu
        ? getTimelineElementIdentity(kfContextMenu.element)
        : undefined,
    });
  useTimelineActiveClips({
    scrollRef,
    currentTime,
    clipStateVersion: renderTimeRange,
    elementStateVersion: timelineElements,
  });
  const { seekFromX, autoScrollDuringDrag, dragScrollRaf } = useTimelinePlayhead({
    playheadRef,
    scrollRef,
    syncScrollViewport,
    ppsRef,
    durationRef,
    isDragging,
    currentTime,
    zoomMode,
    zoomModeRef,
    fitPps,
    fitPpsRef,
    effectiveDuration,
    pps,
    timelineReady,
    elementsLength: timelineElements.length,
    onSeek,
    contentOrigin,
  });
  const { razorGuideX, updateRazorGuide, clearRazorGuide, splitAllAtPointer } =
    useTimelineRazorInteraction({
      active: activeTool === "razor",
      scrollRef,
      contentOrigin,
      pixelsPerSecond: pps,
      onSplitAll: oneShotEdits.onRazorSplitAll,
    });
  const overlaysProps = useTimelineOverlaysState({
    elements: timelineElements,
    elementsRef: timelineElementsRef,
    theme,
    showShortcutHint,
    showPopover,
    setShowPopover,
    kfContextMenu,
    setKfContextMenu,
    onDeleteKeyframe,
    onDeleteAllKeyframes,
    onMoveKeyframeToPlayhead,
    clipContextMenu,
    setClipContextMenu,
    currentTime,
    onSplitElement,
    pinZoomBeforeEdit,
    onDeleteElement: _onDeleteElement,
    onCopyClip,
    onPasteClip,
    onDuplicateClip,
    canPasteClip,
    clipMenuItems,
    splitShortcut,
    onSelectElement,
    selectedElementId,
    setRangeSelectionRef,
    rangeSelection: {
      scrollRef,
      ppsRef,
      effectiveDuration,
      pps,
      onSeek,
      seekFromX,
      autoScrollDuringDrag,
      dragScrollRaf,
      isDragging,
      setShowPopover,
      elementsRef: timelineElementsRef,
      clipIndex,
      rowGeometryRef,
      onSelectElement,
      contentOrigin,
      sessionEpoch,
      onRangeSelect,
    },
    gapMenu: {
      tracks,
      expandedElementsRef: timelineElementsRef,
      trackOrderRef,
      onMoveElement: pinnedOnMoveElement,
      onMoveElements: pinnedOnMoveElements,
    },
  });
  const {
    overlays,
    gapHighlight,
    openGapMenu,
    onContextMenuClip,
    marqueeRect,
    isScrubbing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = overlaysProps;
  const { rangeSelection, setRangeSelection } = overlays;
  useAbandonEditsOnReadOnly(readOnlyPress !== null, () => {
    setDraggedClip(null);
    cancelBeatDrag();
    cancelTimelineKeyframeRetime(scrollRef.current);
    setClipContextMenu(null);
    setKfContextMenu(null);
    overlays.onDismissGapContextMenu();
  });
  const laneGapStrips = useTimelineGapHighlights({
    gapHighlight,
    tracks,
    selectedElementId,
    selectedElementIds,
    expandedElements: timelineElements,
    dragActive: draggedClip?.started === true || resizingClip != null,
    displayDuration,
  });
  const { major, minor, majorTickInterval, frameRate } = useTimelineTicks(
    displayDuration,
    pps,
    timeDisplayMode,
    timelineFocus.rowVirtualizationActive ? renderTimeRange : undefined,
  );
  const canvasProps = {
    major,
    minor,
    pps,
    contentOrigin,
    contentGutter: labelMode ? GUTTER : 0,
    trackContentWidth: displayContentWidth,
    totalH: displayLayout.totalH,
    effectiveDuration,
    majorTickInterval,
    tickFrameRate: frameRate,
    rangeSelection,
    marqueeRect,
    laneGapStrips,
    dropPreview: assetDrop.dropPreview,
    acceptsMediaDrop: !!(onFileDrop || onAssetDrop),
    theme,
    showAudioEffects,
    displayTrackOrder: displayLayout.displayTrackOrder,
    rowHeights: displayLayout.displayRowHeights,
    rowGeometry: displayLayout.rowGeometry,
    virtualRows: timelineFocus.virtualRows,
    logicalRows: timelineFocus.logicalRows,
    focusedTargetId: timelineFocus.focusedTargetId,
    rowsVirtualized: timelineFocus.rowVirtualizationActive,
    clipIndex,
    renderTimeRange,
    visibleTimeRange,
    pinnedClipIdentities,
    trackOrder,
    tracks,
    trackStyles,
    groups,
    laneCounts,
    selectedElementId,
    selectedElementIds,
    hoveredClip,
    draggedClip,
    resizingClip,
    isScrubbing,
    blockedClipRef,
    suppressClickRef,
    scrollRef,
    playheadRef,
    onDrillDown,
    onSelectElement,
    setHoveredClip,
    setShowPopover,
    setRangeSelection,
    setResizingClip,
    setDraggedClip,
    setSelectedElementId,
    getPreviewElement,
    getTrackStyle,
    keyframeCache,
    gsapAnimations,
    selectedKeyframes,
    currentTime,
    onSeek,
    beatAnalysis: adjustedBeatAnalysis,
    onSelectSegment,
    onClickKeyframe,
    onShiftClickKeyframe,
    onMoveKeyframe,
    ...refuseWhenReadOnly(readOnlyPress, {
      onContextMenuKeyframe,
      onContextMenuClip,
      onContextMenuLane: (e: React.MouseEvent, track: number, time: number) => {
        if (draggedClip?.started || resizingClip) return;
        setClipContextMenu(null);
        openGapMenu({ x: e.clientX, y: e.clientY, track, time });
      },
    }),
    onResizeElement,
    onMoveElement,
    beatDragging,
    draggedElement,
    snapGuide,
    multiDragPreview,
    onToggleTrackHidden: oneShotEdits.onToggleTrackHidden,
    onTogglePropertyGroupKeyframe: oneShotEdits.onTogglePropertyGroupKeyframe,
    onRazorSplit: oneShotEdits.onRazorSplit,
    onRazorSplitAll: editContext.onRazorSplitAll,
  };
  const holdNewClipContent = timelineFocus.rowVirtualizationActive && viewport.isScrolling;
  const timelineRenderClipContent = useMemo<typeof renderClipContent>(
    () =>
      renderClipContent &&
      ((element, style, context) => (
        <ClipContentOnceShown hold={holdNewClipContent}>
          {renderClipContent(element, style, context)}
        </ClipContentOnceShown>
      )),
    [holdNewClipContent, renderClipContent],
  );
  const timelineMeta = buildTimelineShellMeta({
    isDragOver: assetDrop.isDragOver,
    hasFileDrop: !!onFileDrop && !readOnlyPress,
    drop: {
      onDragOver: assetDrop.handleAssetDragOver,
      onDragLeave: assetDrop.handleAssetDragLeave,
      onDrop: assetDrop.handleAssetDrop,
    },
    pointer: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
    setContainerRef,
    setScrollRef,
    focusProps: timelineFocus.timelineFocusProps,
    elementCount: timelineElements.length,
    activeTool,
    shiftHeld,
    labelMode,
    contentOrigin,
    zoomMode,
    theme,
    razor: { razorGuideX, updateRazorGuide, clearRazorGuide, splitAllAtPointer },
    lastScrollLeftRef,
    recordTimelineScroll,
    syncScrollViewport,
  });
  const contextValue: TimelineContextValue = {
    state: {
      timelineReady,
      elements: timelineElements,
      selectedElementId,
      sessionEpoch: timelineSessionEpoch,
      keyframeCache,
      canvas: canvasProps,
      overlays,
    },
    actions: {
      renderClipContent: timelineRenderClipContent,
      renderClipOverlay,
      setFocusedEaseSegment,
    },
    meta: timelineMeta,
  };
  return contextValue;
}
