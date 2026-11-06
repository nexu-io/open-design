import { useI18n } from "../../i18n/I18n";
import { Fragment, useId, useMemo, useRef, type CSSProperties } from "react";
import { BeatStrip, BeatBackgroundLines } from "./BeatStrip";
import { TimelineLaneClip, type TimelineLaneClipActions } from "./TimelineLaneClip";
import { TimelineCompactDiamonds } from "./TimelineCompactDiamonds";
import { TimelinePropertyLanes } from "./TimelinePropertyLanes";
import { TimelineAutomationLaneSlot } from "./TimelineAutomationLaneSlot";
import { useAutomationLanes } from "./useAutomationLanes";
import { useAutomationSelectionKeyboard } from "../../hooks/useAutomationSelectionKeyboard";
import { TimelineTrackHeader } from "./TimelineTrackHeader";
import { TimelineGroupRow } from "./TimelineGroupRow";
import { useTimelineLaneRowIndexes, useTimelineGroupDisclosure } from "./useTimelineLaneRowIndexes";
import { useTimelineClipDisclosure } from "./useTimelineClipDisclosure";
import { TimelineTimeLayer } from "./TimelineTimeLayer";
import { clipWidthPx } from "./TimelineClip";
import {
  isTrackRowExpanded,
  resolveTrackKeyframeClip,
  trackShowsBeatStrip,
} from "./useTimelineTrackLayout";
import { trackDisplayNumber, trackDisplaySuffix } from "./timelineTrackDisplay";
import { clipTimingStart } from "../../hooks/gsapShared";
import { useTimelineClipCapabilities } from "./timelineReadOnly";
import { CLIP_Y, TRACK_H } from "./timelineLayout";
import { usePlayerStore } from "../store/playerStore";
import { isMultiDragPassenger, multiDragPassengerOffsetPx } from "./timelineMultiDragPreview";
import { useTimelineMultiDragActorWindows } from "./useTimelineMultiDragActorWindows";
import type { TimelineLanesProps } from "./timelineLaneProps";
import { isAudioTimelineElement, isMusicTrack } from "../../utils/timelineInspector";
import { resolveClipRenderContext } from "./timelineClipChildren";
import { TimelineTrackRow } from "./TimelineTrackRow";
import { isTimelineClipActive } from "./useTimelineActiveClips";
import { queryTimelineClipIndex } from "../lib/timelineClipIndex";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import { timelineClipFocusId } from "./timelineNavigationIdentity";
import { useTimelineKeyboardActor } from "./useTimelineKeyboardActor";
import { TimelineTransitionOverlays } from "./TimelineTransitionOverlays";
import { deriveTimelineTransitionSeamsByTrack } from "./timelineTransitionSeams";

function passengerStyleAt(offsetPx: number): CSSProperties {
  return {
    transform: `translateX(${offsetPx}px)`,
    opacity: 0.85,
    zIndex: 20,
    pointerEvents: "none",
  };
}

export function TimelineLanes({
  pps,
  contentOrigin,
  contentGutter,
  trackContentWidth,
  theme,
  showAudioEffects,
  displayTrackOrder,
  rowGeometry,
  virtualRows,
  logicalRows,
  focusedTargetId,
  rowsVirtualized,
  clipIndex,
  renderTimeRange,
  visibleTimeRange,
  pinnedClipIdentities,
  trackOrder,
  tracks,
  groups,
  laneCounts,
  selectedElementId,
  selectedElementIds,
  hoveredClip,
  draggedClip,
  draggedElement,
  snapGuide,
  multiDragPreview,
  blockedClipRef,
  suppressClickRef,
  scrollRef,
  renderClipContent,
  renderClipOverlay,
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
  onSelectSegment,
  onClickKeyframe,
  onShiftClickKeyframe,
  onContextMenuKeyframe,
  onMoveKeyframe,
  onContextMenuClip,
  onContextMenuLane,
  beatAnalysis,
  onToggleTrackHidden,
  onTogglePropertyGroupKeyframe,
  onResizeElement,
  onMoveElement,
  onRazorSplit,
  onRazorSplitAll,
}: TimelineLanesProps) {
  const { t } = useI18n();
  // ponytail: One per-instance namespace prevents aria-controls and aria-owns
  // from resolving into a second timeline that renders the same logical rows.
  const lanesIdPrefix = `timeline-lanes${useId().replaceAll(":", "")}`;
  const expandedClipIds = usePlayerStore((s) => s.expandedClipIds);
  const { collapsedGroupIds, expandedLaneOwnerIds, toggleGroupExpanded, toggleLaneOwnerExpanded } =
    useTimelineGroupDisclosure();
  const automationLanes = useAutomationLanes();
  const getClipCapabilities = useTimelineClipCapabilities();
  const transitionSeamsByTrack = useMemo(
    () =>
      deriveTimelineTransitionSeamsByTrack(tracks.flatMap(([, els]) => els.map(getPreviewElement))),
    [getPreviewElement, tracks],
  );
  // A group's automation clock is COMPOSITION time (groups doc §1.3), so its
  // synthetic lane element spans the whole composition rather than a clip.
  const compositionDuration = usePlayerStore((s) => s.duration);
  useAutomationSelectionKeyboard({ lanes: automationLanes });
  const rowIndexes = useTimelineLaneRowIndexes(logicalRows, groups);
  const { logicalRowsByTrack, groupByAnchor, groupMemberTracks } = rowIndexes;
  const {
    toggleRowExpanded: toggleRowExpandedTracked,
    toggleClipExpanded: toggleClipExpandedTracked,
  } = useTimelineClipDisclosure();
  const actorWindows = useTimelineMultiDragActorWindows(
    multiDragPreview,
    rowsVirtualized,
    renderTimeRange,
  );
  const keyboard = useTimelineKeyboardActor({
    logicalRows,
    focusedTargetId,
    rowGeometry,
    scrollRef,
    onToggleRow: (row) => row.elementId && toggleClipExpandedTracked(row.elementId),
    onDrillDown,
  });
  const clipActions = useRef<TimelineLaneClipActions>(null!);
  clipActions.current = {
    gestures: {
      pps,
      onResizeElement,
      onMoveElement,
      onRazorSplit,
      onRazorSplitAll,
      blockedClipRef,
      suppressClickRef,
      scrollRef,
      setShowPopover,
      setRangeSelection,
      setResizingClip,
      setDraggedClip,
      setSelectedElementId,
      onSelectElement,
    },
    setHoveredClip,
    onContextMenuClip,
    onDrillDown,
  };
  return (
    <div
      role="treegrid"
      aria-label={t("Timeline tracks")}
      aria-rowcount={logicalRows.length}
      aria-colcount={2}
      onFocus={keyboard.onFocus}
      onKeyDown={keyboard.onKeyDown}
      className={rowsVirtualized ? "absolute inset-0" : undefined}
    >
      {
        // fallow-ignore-next-line complexity
        virtualRows.map(({ index: row, rowKey }) => {
          const trackNum = displayTrackOrder[row];
          if (trackNum === undefined) return null;
          const group = groupByAnchor.get(trackNum);
          if (group) {
            const groupLogicalRow = logicalRowsByTrack.get(trackNum)?.[0];
            if (!groupLogicalRow) return null;
            return (
              <TimelineGroupRow
                key={rowKey}
                index={row}
                rowKey={rowKey}
                group={group}
                logicalRow={groupLogicalRow}
                top={rowGeometry.getRowTop(row)}
                height={rowGeometry.getRowHeight(row)}
                virtualized={rowsVirtualized}
                contentOrigin={contentOrigin}
                theme={theme}
                showAudioEffects={showAudioEffects}
                rovingTargetId={keyboard.rovingTargetId}
                collapsedGroupIds={collapsedGroupIds}
                expandedLaneOwnerIds={expandedLaneOwnerIds}
                toggleGroupExpanded={toggleGroupExpanded}
                toggleLaneOwnerExpanded={toggleLaneOwnerExpanded}
                lanes={automationLanes}
                pps={pps}
                currentTime={currentTime}
                compositionDuration={compositionDuration}
                beatTimes={beatAnalysis?.beatTimes}
                contentGutter={contentGutter}
                trackContentWidth={trackContentWidth}
              />
            );
          }
          const displayNumber = trackDisplayNumber(displayTrackOrder, trackNum);
          const trackLogicalRows = logicalRowsByTrack.get(trackNum) ?? [];
          const logicalRow = trackLogicalRows[0];
          if (!logicalRow) return null;
          const rowHeight = rowGeometry.getRowHeight(row);
          const els = tracks.find(([t]) => t === trackNum)?.[1] ?? [];
          const renderElements = rowsVirtualized
            ? queryTimelineClipIndex(
                clipIndex,
                trackNum,
                renderTimeRange,
                pinnedClipIdentities,
                actorWindows,
              )
            : els;
          const isPendingTrack =
            draggedClip?.started === true && !trackOrder.includes(trackNum) && els.length === 0;
          if (isPendingTrack)
            return (
              <div
                key={rowKey}
                data-timeline-new-track-lane={row}
                aria-hidden="true"
                className={rowsVirtualized ? "absolute" : "relative"}
                style={{
                  top: rowsVirtualized ? rowGeometry.getRowTop(row) : undefined,
                  marginLeft: contentOrigin,
                  width: trackContentWidth,
                  height: TRACK_H,
                  border: "1px dashed var(--timeline-accent)",
                  background: "color-mix(in srgb, var(--timeline-accent) 5%, transparent)",
                  pointerEvents: "none",
                }}
              />
            );
          const rowBackground = theme.rowBackground;
          const beatStripOnTrack = trackShowsBeatStrip(els, beatAnalysis?.beatTimes, {
            selectedElementId,
            isMusicTrack,
          });
          const isTrackHidden = els.length > 0 && els.every((element) => element.hidden === true);
          const isAudioTrack = els.length > 0 && els.some(isAudioTimelineElement);
          // Only the selected/most-keyframed clip owns expanded lanes on a shared track.
          const keyframeClip = resolveTrackKeyframeClip(
            els,
            laneCounts,
            selectedElementId,
            selectedElementIds,
          );
          const keyframeClipKey = keyframeClip?.key ?? keyframeClip?.id;
          const rowExpanded = isTrackRowExpanded(els, expandedClipIds);
          // How tall a clip BAR is drawn. An expanded row is mostly lanes, and a
          // clip left to fill it painted its waveform straight over them — so the
          // bar is capped for every clip on the row, not just the one whose
          // property lanes are showing. Undefined means "fill the row", which is
          // right only while it is collapsed and the row is nothing but bar.
          const clipBarHeight = rowExpanded ? TRACK_H - 2 * CLIP_Y : undefined;
          const automationElements = els.map(getPreviewElement);
          // Minted here because this is the only place that sees BOTH ends of
          // the disclosure: the caret in the sticky header and the diamond lanes
          // on the canvas. Keyed by display row, not by `trackNum`, which is a
          // fractional sort key and would mint ids like `...-0.16666666666666666`.
          const lanesId = `${lanesIdPrefix}-track-${row}`;
          // The caret reveals two canvas regions now: the active clip's keyframe
          // lanes and the track's automation lanes. They cannot be one element —
          // one belongs to a clip, the other to the row — so the caret names both.
          const automationLanesId = `${lanesId}-automation`;
          // The header's remove buttons write through the same binding the lanes
          // themselves edit through, so a deletion persists exactly like dragging
          // a point does — and the binding reports read-only for an unselected
          // clip, which is what leaves the buttons off rather than offering one
          // that cannot act.
          const headerLanes =
            keyframeClip && keyframeClipKey
              ? automationLanes.bind(
                  keyframeClip,
                  selectedElementId === keyframeClipKey || selectedElementIds.has(keyframeClipKey),
                )
              : null;
          const removeAutomationLane =
            headerLanes && !headerLanes.readOnly
              ? (target: string) =>
                  headerLanes.onCommit({
                    version: 1,
                    lanes: headerLanes.lanes.filter((lane) => lane.target !== target),
                  })
              : undefined;
          return (
            <TimelineTrackRow
              key={rowKey}
              index={row}
              rowKey={rowKey}
              logicalRow={logicalRow}
              propertyRows={trackLogicalRows.slice(1)}
              lanesId={lanesId}
              headerLanesId={`${lanesId} ${automationLanesId}`}
              top={rowGeometry.getRowTop(row)}
              height={rowHeight}
              virtualized={rowsVirtualized}
              background={rowBackground}
              borderColor={theme.rowBorder}
              rovingTargetId={keyboard.rovingTargetId}
            >
              <TimelineTrackHeader
                trackNumber={trackNum}
                // What gets announced. `trackNum` is a fractional z-order sort
                // key, so it stays out of every label and in every callback.
                trackDisplayNumber={displayNumber}
                trackLabel={
                  els[0]?.label ??
                  els[0]?.domId ??
                  els[0]?.id ??
                  `Track${trackDisplaySuffix(displayNumber)}`
                }
                lanesId={`${lanesId} ${automationLanesId}`}
                contentOrigin={contentOrigin}
                keyframeClip={keyframeClip}
                trackElements={els}
                clipCount={els.length}
                isExpanded={rowExpanded}
                animations={keyframeClipKey ? (gsapAnimations.get(keyframeClipKey) ?? []) : []}
                currentTime={currentTime}
                isTrackHidden={isTrackHidden}
                isAudioTrack={isAudioTrack}
                isGroupMember={groupMemberTracks.has(trackNum)}
                theme={theme}
                showAudioEffects={showAudioEffects}
                onToggleClipExpanded={() => {
                  const keys = els.map(getTimelineElementIdentity);
                  if (keys.length > 0) toggleRowExpandedTracked(keys);
                }}
                onToggleTrackHidden={onToggleTrackHidden}
                onTogglePropertyGroupKeyframe={onTogglePropertyGroupKeyframe}
                onRemoveAutomationLane={removeAutomationLane}
                onSeek={onSeek}
                rovingTargetId={keyboard.rovingTargetId}
              />
              <div
                role="gridcell"
                aria-colindex={2}
                data-timeline-zoom-scale=""
                style={{
                  width: trackContentWidth,
                  marginLeft: contentGutter, // room for a 0% diamond left of t=0
                  opacity: isTrackHidden ? 0.35 : 1,
                  transition: "opacity 120ms ease",
                }}
                className="relative"
                onContextMenu={(e: React.MouseEvent) => {
                  // Clip / keyframe-diamond context menus preventDefault at the
                  // target before this bubble handler runs — respect them so a
                  // right-click on a clip never also opens the gap menu.
                  if (e.defaultPrevented || !onContextMenuLane) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const time = (e.clientX - rect.left) / pps;
                  if (time < 0) return;
                  e.preventDefault();
                  onContextMenuLane(e, trackNum, time);
                }}
              >
                {/* Faint beat lines in every track's background (behind the clips);
                    the active move-snap target is highlighted. */}
                <BeatBackgroundLines
                  beatTimes={beatAnalysis?.beatTimes}
                  beatStrengths={beatAnalysis?.beatStrengths}
                  pps={pps}
                  highlightTime={snapGuide?.type === "beat" ? snapGuide.time : null}
                  renderTimeRange={rowsVirtualized ? renderTimeRange : undefined}
                />
                {/* Beat dots on the active track (the one holding the selection),
                    falling back to the music track when nothing is selected. */}
                {beatStripOnTrack && (
                  <BeatStrip
                    beatTimes={beatAnalysis?.beatTimes}
                    beatStrengths={beatAnalysis?.beatStrengths}
                    pps={pps}
                    renderTimeRange={rowsVirtualized ? renderTimeRange : undefined}
                  />
                )}
                <TimelineTimeLayer pixelsPerSecond={pps}>
                  {
                    // fallow-ignore-next-line complexity
                    renderElements.map((el) => {
                      const clipStyle = getTrackStyle(el.tag);
                      const elementKey = getTimelineElementIdentity(el);
                      // Only the track's active keyframe clip shows expanded lanes;
                      // other clips (incl. siblings on a shared track) show compact
                      // diamonds on their own bar instead.
                      const isTrackKeyframeClip = elementKey === keyframeClipKey;
                      const showsLanes = isTrackKeyframeClip && rowExpanded;
                      const capabilities = getClipCapabilities(el);
                      const isSelected =
                        selectedElementId === elementKey || selectedElementIds.has(elementKey);
                      // Element identity stays stable across clip splices and reorders.
                      const clipKey = elementKey;
                      const isDraggingClip =
                        draggedClip?.started === true &&
                        draggedElement != null &&
                        getTimelineElementIdentity(draggedElement) === elementKey;
                      if (isDraggingClip) return null;
                      const previewElement = getPreviewElement(el);
                      const renderContext = resolveClipRenderContext(
                        previewElement,
                        visibleTimeRange,
                        isSelected || hoveredClip === clipKey || pinnedClipIdentities.has(clipKey),
                      );
                      // Passenger of a live multi-drag: preserve the formation without changing
                      // the passenger's timeline data until the owning drag commits.
                      const isPassenger =
                        multiDragPreview != null && isMultiDragPassenger(clipKey, multiDragPreview);
                      const passengerStyle = isPassenger
                        ? passengerStyleAt(
                            multiDragPassengerOffsetPx(clipKey, pps, multiDragPreview),
                          )
                        : undefined;
                      const clip = (
                        <TimelineLaneClip
                          key={clipKey}
                          el={el}
                          previewElement={previewElement}
                          elementKey={elementKey}
                          capabilities={capabilities}
                          pps={pps}
                          passengerStyle={passengerStyle}
                          clipBarHeight={clipBarHeight}
                          isSelected={isSelected}
                          isHovered={hoveredClip === clipKey}
                          isActive={isTimelineClipActive(previewElement, currentTime)}
                          tabIndex={
                            keyboard.rovingTargetId === timelineClipFocusId(elementKey) ? 0 : -1
                          }
                          priority={renderContext.priority}
                          rich={renderContext.rich}
                          theme={theme}
                          clipStyle={clipStyle}
                          renderClipContent={renderClipContent}
                          renderClipOverlay={renderClipOverlay}
                          actions={clipActions}
                        />
                      );
                      const compactKeyframes = keyframeCache?.get(elementKey);
                      const compactDiamonds = !showsLanes && compactKeyframes && (
                        <TimelineCompactDiamonds
                          key={`${clipKey}-diamonds`}
                          element={previewElement}
                          elementId={elementKey}
                          keyframesData={compactKeyframes}
                          pixelsPerSecond={pps}
                          rowHeight={rowHeight}
                          beatsActive={beatStripOnTrack}
                          accentColor={clipStyle.accent}
                          isSelected={isSelected}
                          passengerStyle={passengerStyle}
                          currentTime={currentTime}
                          selectedKeyframes={selectedKeyframes}
                          rovingTargetId={keyboard.rovingTargetId}
                          onClickKeyframe={onClickKeyframe}
                          onShiftClickKeyframe={onShiftClickKeyframe}
                          onContextMenuKeyframe={onContextMenuKeyframe}
                          onMoveKeyframe={onMoveKeyframe}
                          onSelectSegment={onSelectSegment}
                          suppressClickRef={suppressClickRef}
                        />
                      );
                      // Keep this shell mounted while collapsed so aria-controls stays valid
                      // and multi-drag cannot remount the subtree mid-gesture.
                      const propertyLanes = isTrackKeyframeClip && (
                        <TimelinePropertyLanes
                          key={`${clipKey}-property-lanes`}
                          id={lanesId}
                          animations={showsLanes ? (gsapAnimations.get(elementKey) ?? []) : []}
                          // clipTimingStart, not the raw start: an expanded sub-comp
                          // child's start is host-absolute while its tweens are
                          // local to its own file.
                          clipStart={clipTimingStart(previewElement)}
                          clipDuration={previewElement.duration}
                          clipLeftPx={previewElement.start * pps}
                          clipWidthPx={clipWidthPx(previewElement, pps)}
                          passengerStyle={passengerStyle}
                          accentColor={clipStyle.accent}
                          isSelected={isSelected}
                          currentPercentage={
                            previewElement.duration > 0
                              ? ((currentTime - previewElement.start) / previewElement.duration) *
                                100
                              : 0
                          }
                          elementId={elementKey}
                          selectedKeyframes={selectedKeyframes}
                          rovingTargetId={keyboard.rovingTargetId}
                          onSelectSegment={(target) => onSelectSegment?.(elementKey, target)}
                          onClickKeyframe={(target) => onClickKeyframe?.(previewElement, target)}
                          onShiftClickKeyframe={(target) =>
                            onShiftClickKeyframe?.(elementKey, target)
                          }
                          onContextMenuKeyframe={(e, target) =>
                            onContextMenuKeyframe?.(e, elementKey, target)
                          }
                          onMoveKeyframe={(target, toClipPercentage) =>
                            onMoveKeyframe?.(elementKey, target, toClipPercentage) ??
                            Promise.resolve(false)
                          }
                          suppressClickRef={suppressClickRef}
                        />
                      );

                      // No wrapper node per clip, and the same Fragment whether or not it rides a
                      // drag, so joining or leaving one restyles it, never remounts it.
                      return (
                        <Fragment key={clipKey}>
                          {clip}
                          {compactDiamonds}
                          {propertyLanes}
                        </Fragment>
                      );
                    })
                  }
                </TimelineTimeLayer>
                <TimelineTransitionOverlays
                  seams={transitionSeamsByTrack.get(trackNum) ?? []}
                  rowElements={draggedClip?.started ? [] : automationElements}
                  rowBackground={rowBackground}
                  pixelsPerSecond={pps}
                  rowHeight={rowHeight}
                  clipBarHeight={clipBarHeight}
                />
                {/* The automation lanes belong to the ROW, so they are mounted
                    here rather than under the active clip's property lanes.
                    Hanging off that clip meant selecting a sibling moved the
                    whole subtree into a different clip's element and remounted
                    every lane — which threw away each lane's hover state (and
                    any gesture mid-flight), so pressing a lane to select its
                    clip made the handles you were reaching for disappear.

                    Mounted in BOTH disclosure states, empty while collapsed, so
                    the caret's aria-controls resolves either way — same reason
                    the keyframe lanes are. Absolute positions inside resolve
                    against this same relative row, so the geometry is unchanged
                    by the move. */}
                <div id={automationLanesId}>
                  {rowExpanded ? (
                    <TimelineAutomationLaneSlot
                      elements={automationElements}
                      isSelected={(element) => {
                        const key = getTimelineElementIdentity(element);
                        return selectedElementId === key || selectedElementIds.has(key);
                      }}
                      lanes={automationLanes}
                      pps={pps}
                      laneCount={keyframeClipKey ? (laneCounts.get(keyframeClipKey) ?? 0) : 0}
                      accentColor={getTrackStyle(keyframeClip?.tag ?? "").accent}
                      currentTime={currentTime}
                      beatTimes={beatAnalysis?.beatTimes}
                    />
                  ) : null}
                </div>
              </div>
            </TimelineTrackRow>
          );
        })
      }
    </div>
  );
}
