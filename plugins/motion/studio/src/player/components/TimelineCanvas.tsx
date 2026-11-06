import { memo } from "react";
import { TimelineRulerPart } from "./TimelineRulerPart";
import { PlayheadIndicator } from "./PlayheadIndicator";
import { TimelinePlayheadLayer } from "./TimelinePlayheadLayer";
import { RULER_H, CLIP_Y, TRACK_H, PLAYHEAD_HEAD_W, getTimelineRowHeight } from "./timelineLayout";
import { getTimelinePlayheadTransform } from "./timelinePlayheadTransform";
import { TimelineLanes } from "./TimelineLanes";
import { TimelineGestureOverlay } from "./TimelineGestureOverlay";
import { useTimelineContext } from "./TimelineProvider";

// A dropped clip's length is unknown until it lands; the preview shows a default.
const DROP_PREVIEW_SECONDS = 3;

export const TimelineCanvas = memo(function TimelineCanvas() {
  const { state, actions } = useTimelineContext();
  const props = state.canvas;
  const { draggedClip, scrollRef, displayTrackOrder } = props;
  const draggedRowIndex =
    draggedClip?.started === true
      ? (draggedClip.insertRow ?? displayTrackOrder.indexOf(draggedClip.previewTrack))
      : -1;
  const dropTrackIndex = props.dropPreview
    ? displayTrackOrder.indexOf(props.dropPreview.track)
    : -1;
  // A track not in the order is a new track, drawn one row past the last lane.
  const dropRowIndex = dropTrackIndex < 0 ? displayTrackOrder.length : dropTrackIndex;
  const insertLineRow =
    (draggedClip?.started ? draggedClip.insertRow : null) ?? props.dropPreview?.insertRow ?? null;
  const ghostLaneActive =
    (insertLineRow ?? -1) >= props.trackOrder.length ||
    (props.dropPreview?.insertRow == null && props.dropPreview != null && dropTrackIndex < 0);
  // A host bottom pad shorter than a track leaves no lane to draw.
  const showGhostLane = props.rowGeometry.padding.bottom >= TRACK_H;
  // Past the last committed track: a drag's new bottom-track preview row is the lane itself.
  const ghostLaneRow = props.rowGeometry.getRowIndex(props.trackOrder.at(-1) ?? Number.NaN) + 1;
  const draggedRowHeight = getTimelineRowHeight(draggedRowIndex, props.rowHeights);
  // A clip bar in an EXPANDED row still renders at TRACK_H (the property lanes
  // occupy the rest of the row — see TimelineLanes' clipHeight), so the drag
  // ghost and drop placeholder must clamp to it or they stretch to the full
  // expanded row height and stop matching the clip being dragged.
  const draggedClipHeight = Math.min(draggedRowHeight, TRACK_H) - CLIP_Y * 2;
  const beatDragging = props.beatDragging;
  const { draggedElement, snapGuide, multiDragPreview } = props;
  return (
    <div
      className="relative"
      style={{ height: props.totalH, width: props.contentOrigin + props.trackContentWidth }}
    >
      <TimelineRulerPart />

      {/* Breathing room between the sticky ruler and the first track lane — the
          top half of the CapCut-style padding (see TimelineRowGeometry.padding). */}
      <div
        aria-hidden="true"
        style={{ height: props.rowsVirtualized ? 0 : props.rowGeometry.padding.top }}
      />

      <TimelineLanes
        {...props}
        renderClipContent={actions.renderClipContent}
        renderClipOverlay={actions.renderClipOverlay}
        snapGuide={snapGuide}
        draggedElement={draggedElement}
        multiDragPreview={multiDragPreview}
        onToggleTrackHidden={props.onToggleTrackHidden}
        onTogglePropertyGroupKeyframe={props.onTogglePropertyGroupKeyframe}
        onResizeElement={props.onResizeElement}
        onMoveElement={props.onMoveElement}
        onRazorSplit={props.onRazorSplit}
        onRazorSplitAll={props.onRazorSplitAll}
      />

      {/* Breathing room below the last track lane (one track by default) — a real
          scrollable surface, so a clip can be dragged into the void to create a
          new bottom track (see TimelineRowGeometry.padding / canvasHeight). */}
      <div
        aria-hidden="true"
        style={{ height: props.rowsVirtualized ? 0 : props.rowGeometry.padding.bottom }}
      />

      {showGhostLane && (
        <div
          aria-hidden="true"
          data-testid="timeline-ghost-lane"
          data-active={ghostLaneActive || undefined}
          className={`pointer-events-none absolute flex items-center justify-center rounded-lg border border-dashed text-[11px] transition-colors duration-150 ${
            ghostLaneActive
              ? "border-studio-accent/60 bg-studio-accent/6 text-accent-ink"
              : "border-neutral-700/50 text-neutral-500"
          }`}
          style={{
            top: props.rowGeometry.getRowTop(ghostLaneRow) + CLIP_Y,
            left: props.contentOrigin,
            width: props.trackContentWidth,
            height: TRACK_H - CLIP_Y * 2,
          }}
        >
          {props.acceptsMediaDrop && "Drop media here"}
        </div>
      )}

      {/* Gap strips — loud dashed fill for the gap(s) a hovered "Close gap(s)"
          menu row would collapse; a quiet tint for every gap on the selected
          clip's lane. Geometry mirrors the drop placeholder (row top + clip
          inset) so strips sit exactly where a clip body would. */}
      {props.laneGapStrips.map((strip) => {
        const rowIndex = displayTrackOrder.indexOf(strip.track);
        if (rowIndex < 0) return null;
        const loud = strip.kind === "hover";
        const visibleIntervals = props.rowsVirtualized
          ? strip.intervals.filter(
              (gap) =>
                gap.start < props.renderTimeRange.end && gap.end > props.renderTimeRange.start,
            )
          : strip.intervals;
        return visibleIntervals.map((gap) => (
          <div
            key={`gap-${strip.kind}-${strip.track}-${gap.start}`}
            data-timeline-zoom-scale={-gap.start * props.pps}
            className="pointer-events-none absolute"
            style={{
              top: props.rowGeometry.getRowTop(rowIndex) + CLIP_Y,
              left: props.contentOrigin + gap.start * props.pps,
              width: Math.max((gap.end - gap.start) * props.pps, 2),
              height: TRACK_H - CLIP_Y * 2,
              background: loud ? "var(--timeline-accent-soft)" : "var(--timeline-accent-faint)",
              borderRadius: 4,
              zIndex: 25,
            }}
          />
        ));
      })}

      {/* Drop placeholder — a clip-sized slot at the exact landing spot (target
          lane + snapped start), parallel to the ghost. Hidden in insert mode. */}
      {draggedClip?.started && draggedClip.insertRow == null && draggedRowIndex >= 0 && (
        <div
          data-testid="timeline-drag-landing"
          className="absolute pointer-events-none"
          style={{
            top: props.rowGeometry.getRowTop(draggedRowIndex) + CLIP_Y,
            left: props.contentOrigin + draggedClip.previewStart * props.pps,
            width: Math.max(draggedClip.element.duration * props.pps, 4),
            height: draggedClipHeight,
            border: "1px solid color-mix(in srgb, var(--timeline-accent) 55%, transparent)",
            background: "color-mix(in srgb, var(--timeline-accent) 12%, transparent)",
            borderRadius: 4,
            zIndex: 30,
          }}
        />
      )}

      {/* Drop preview: where an asset or file dragged in from outside will land
          (a row past the last lane means a new track). */}
      {props.dropPreview && props.dropPreview.insertRow == null && (
        <div
          aria-hidden="true"
          data-testid="timeline-drop-preview"
          className="absolute pointer-events-none"
          style={{
            top: props.rowGeometry.getRowTop(dropRowIndex) + CLIP_Y,
            left: props.contentOrigin + props.dropPreview.start * props.pps,
            width: DROP_PREVIEW_SECONDS * props.pps,
            height: TRACK_H - CLIP_Y * 2,
            border: "1px solid color-mix(in srgb, var(--timeline-accent) 55%, transparent)",
            background: "color-mix(in srgb, var(--timeline-accent) 12%, transparent)",
            borderRadius: 4,
            zIndex: 30,
          }}
        />
      )}

      {/* Insertion line — a new track will be inserted at this boundary on drop.
          Shown while the pointer is near a lane boundary (insert mode). */}
      {insertLineRow != null && !draggedClip?.started && (
        <div
          data-testid="timeline-insert-line"
          className="absolute pointer-events-none"
          style={{
            top: props.rowGeometry.getRowTop(insertLineRow) - 0.5,
            left: props.contentOrigin,
            width: props.trackContentWidth,
            height: 1,
            background: "var(--timeline-accent)",
            boxShadow: "0 0 3px var(--timeline-accent-glow)",
            zIndex: 55,
          }}
        />
      )}

      {/* Snap guide for non-beat targets during a clip move or trim */}
      {snapGuide && snapGuide.type !== "beat" && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: props.contentOrigin + snapGuide.time * props.pps,
            top: RULER_H,
            bottom: 0,
            width: 1,
            background:
              snapGuide.type === "playhead"
                ? "var(--timeline-accent)"
                : "var(--timeline-snap-guide)",
            boxShadow:
              snapGuide.type === "playhead"
                ? "0 0 6px var(--timeline-accent-glow)"
                : "0 0 6px var(--timeline-text-dim)",
            zIndex: 60,
          }}
        />
      )}

      <TimelineGestureOverlay
        drag={draggedClip}
        scrollRef={scrollRef}
        pixelsPerSecond={props.pps}
        rowHeight={draggedClipHeight}
        rowGeometry={props.rowGeometry}
        contentOrigin={props.contentOrigin}
        selectedElementId={props.selectedElementId}
        currentTime={props.currentTime}
        theme={props.theme}
        getTrackStyle={props.getTrackStyle}
        renderClipContent={actions.renderClipContent}
        renderClipOverlay={actions.renderClipOverlay}
      />

      {/* Marquee (rubber-band) multi-select rectangle — mirrors the canvas
          MarqueeOverlay look: semi-transparent accent fill + dashed border. */}
      {props.marqueeRect && (
        <div
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            left: props.marqueeRect.left,
            top: props.marqueeRect.top,
            width: props.marqueeRect.width,
            height: props.marqueeRect.height,
            background: "var(--timeline-accent-fill)",
            border: "1px dashed var(--timeline-accent-border)",
            borderRadius: 2,
            zIndex: 70,
          }}
        />
      )}

      {/* Range highlight */}
      {props.rangeSelection && (
        <div
          data-timeline-zoom-scale={
            -Math.min(props.rangeSelection.start, props.rangeSelection.end) * props.pps
          }
          className="absolute pointer-events-none"
          style={{
            left:
              props.contentOrigin +
              Math.min(props.rangeSelection.start, props.rangeSelection.end) * props.pps,
            width: Math.abs(props.rangeSelection.end - props.rangeSelection.start) * props.pps,
            top: RULER_H,
            bottom: 0,
            backgroundColor: "var(--timeline-info-bg)",
            borderLeft: "1px solid var(--timeline-info-border)",
            borderRight: "1px solid var(--timeline-info-border)",
            zIndex: 50,
          }}
        />
      )}

      {/* Playhead — hidden while dragging a beat so its guideline doesn't
          track the scrub and clutter the beat being moved. Explicit width +
          the half-head offset baked into getTimelinePlayheadTransform keep the
          inner 1px line's CENTER exactly on contentOrigin + t * pps (the ruler
          ticks' center), instead of relying on shrink-wrap sizing. */}
      <TimelinePlayheadLayer scrollRef={props.scrollRef} contentOrigin={props.contentOrigin}>
        <div
          ref={props.playheadRef}
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: 0,
            transform: getTimelinePlayheadTransform(0, 0, props.contentOrigin, true),
            willChange: "transform",
            width: PLAYHEAD_HEAD_W,
            display: beatDragging ? "none" : undefined,
          }}
        >
          <PlayheadIndicator scrubbing={props.isScrubbing} />
        </div>
      </TimelinePlayheadLayer>
    </div>
  );
});
