import { useI18n } from "../../i18n/I18n";
import { memo } from "react";
import type { TimelineTheme } from "./timelineTheme";
import { getRenderedTimelineElement } from "./timelineTheme";
import { CLIP_Y, type TimelineRowGeometry } from "./timelineLayout";
import { TimelineClip } from "./TimelineClip";
import { getTimelineEditCapabilities } from "./timelineEditing";
import { renderClipChildren } from "./timelineClipChildren";
import { getTimelineDragOverlayPosition } from "./timelineClipDragPreview";
import type { DraggedClipState } from "./timelineClipDragTypes";
import type { TrackVisualStyle } from "./timelineIcons";
import { isTimelineClipActive } from "./useTimelineActiveClips";
import type { TimelineProps } from "./TimelineTypes";
import { TimelineTimeLayer } from "./TimelineTimeLayer";

interface TimelineGestureOverlayProps {
  drag: DraggedClipState | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pixelsPerSecond: number;
  rowHeight: number;
  contentOrigin: number;
  rowGeometry: TimelineRowGeometry;
  selectedElementId: string | null;
  currentTime: number;
  theme: TimelineTheme;
  getTrackStyle: (tag: string) => TrackVisualStyle;
  renderClipContent?: TimelineProps["renderClipContent"];
  renderClipOverlay?: TimelineProps["renderClipOverlay"];
}

/** Stable canvas child that owns the live drag actor independently of source rows. */
export const TimelineGestureOverlay = memo(function TimelineGestureOverlay({
  drag,
  scrollRef,
  pixelsPerSecond,
  rowHeight,
  contentOrigin,
  rowGeometry,
  selectedElementId,
  currentTime,
  theme,
  getTrackStyle,
  renderClipContent,
  renderClipOverlay,
}: TimelineGestureOverlayProps) {
  const { t } = useI18n();
  if (!drag?.started)
    return <div data-timeline-gesture-overlay className="absolute inset-0 pointer-events-none" />;
  const element = getRenderedTimelineElement({
    element: drag.element,
    draggedElementId: drag.element.key ?? drag.element.id,
    previewStart: drag.previewStart,
    previewTrack: drag.previewTrack,
  });
  let position = getTimelineDragOverlayPosition(drag, scrollRef.current);
  const insertRow = drag.insertRow;
  if (insertRow !== null)
    position = {
      left: contentOrigin + drag.previewStart * pixelsPerSecond,
      top: rowGeometry.getRowTop(insertRow) + CLIP_Y,
    };
  const clipWidth = Math.max(element.duration * pixelsPerSecond, 4);
  const viewport = scrollRef.current;
  let labelLeft = clipWidth + 10;
  if (
    position &&
    viewport &&
    position.left + labelLeft + 100 > viewport.scrollLeft + viewport.clientWidth
  ) {
    labelLeft = -100;
    if (position.left + labelLeft < viewport.scrollLeft + contentOrigin)
      labelLeft = Math.max(0, Math.min(clipWidth - 100, drag.pointerOffsetX));
  }
  return (
    <div data-timeline-gesture-overlay className="absolute inset-0 pointer-events-none">
      {position && (
        <div
          data-timeline-gesture-actor={element.key ?? element.id}
          className="absolute"
          style={{
            top: position.top,
            left: position.left,
            width: clipWidth,
            height: rowHeight,
            zIndex: 40,
          }}
        >
          {insertRow !== null && (
            <span
              data-timeline-new-track-label
              role="status"
              className="absolute whitespace-nowrap"
              style={{
                left: labelLeft,
                top: (rowHeight - 22) / 2,
                height: 22,
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                color: "var(--timeline-accent)",
                background: theme.rowBackground,
                border: "1px solid var(--timeline-accent)",
                zIndex: 25,
              }}
            >
              {t("+ New track")}<span className="sr-only">{t(", before track")}{" "}{insertRow + 1}</span>
            </span>
          )}
          <TimelineTimeLayer pixelsPerSecond={pixelsPerSecond}>
            <TimelineClip
              el={{ ...element, start: 0 }}
              pps={pixelsPerSecond}
              clipY={0}
              isSelected={selectedElementId === (element.key ?? element.id)}
              isHovered={false}
              isDragging
              isGestureActor
              isActive={isTimelineClipActive(element, currentTime)}
              hasCustomContent={!!renderClipContent}
              capabilities={getTimelineEditCapabilities(element)}
              theme={theme}
              isComposition={!!element.compositionSrc}
              onHoverStart={() => {}}
              onHoverEnd={() => {}}
              onResizeStart={() => {}}
              onClick={() => {}}
              onDoubleClick={() => {}}
            >
              {renderClipChildren(
                element,
                getTrackStyle(element.tag),
                renderClipContent,
                renderClipOverlay,
                { priority: "interaction", rich: false },
              )}
            </TimelineClip>
          </TimelineTimeLayer>
        </div>
      )}
    </div>
  );
});
