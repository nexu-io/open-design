import { memo, type CSSProperties, type RefObject } from "react";
import type { TimelineElement } from "../store/playerStore";
import type { ThumbnailPriority } from "../lib/thumbnailScheduler";
import { TimelineClip, clipZoomKey } from "./TimelineClip";
import { createClipGestureHandlers, type ClipGestureDeps } from "./timelineClipGestureHandlers";
import { renderClipChildren } from "./timelineClipChildren";
import type { TimelineEditCapabilities } from "./timelineEditCapabilities";
import type { TrackVisualStyle } from "./timelineIcons";
import { CLIP_Y } from "./timelineLayout";
import type { TimelineTheme } from "./timelineTheme";
import type { TimelineProps } from "./TimelineTypes";

/** The lane's callbacks as of its last render, read when a clip is pressed rather than drawn. */
export interface TimelineLaneClipActions {
  gestures: ClipGestureDeps;
  setHoveredClip(key: string | null): void;
  onContextMenuClip?: (e: React.MouseEvent, element: TimelineElement) => void;
  onDrillDown?: (element: TimelineElement) => void;
}

interface TimelineLaneClipProps {
  el: TimelineElement;
  previewElement: TimelineElement;
  elementKey: string;
  capabilities: TimelineEditCapabilities;
  pps: number;
  passengerStyle?: CSSProperties;
  clipBarHeight?: number;
  isSelected: boolean;
  isHovered: boolean;
  isActive: boolean;
  tabIndex: 0 | -1;
  priority: ThumbnailPriority;
  rich: boolean;
  theme: TimelineTheme;
  clipStyle: TrackVisualStyle;
  renderClipContent: TimelineProps["renderClipContent"];
  renderClipOverlay: TimelineProps["renderClipOverlay"];
  actions: RefObject<TimelineLaneClipActions>;
}

const sameCapabilities = (a: TimelineEditCapabilities, b: TimelineEditCapabilities) =>
  a.canMove === b.canMove &&
  a.canTrimStart === b.canTrimStart &&
  a.canTrimEnd === b.canTrimEnd &&
  a.readOnly === b.readOnly;

const zoomKey = (p: TimelineLaneClipProps) =>
  clipZoomKey(p.previewElement, p.pps, p.isSelected || p.isHovered);

/** A zoom step re-renders only the clips whose drawing it changes. */
function sameClip(prev: TimelineLaneClipProps, next: TimelineLaneClipProps): boolean {
  for (const key of Object.keys(next) as (keyof TimelineLaneClipProps)[]) {
    if (key === "pps" || key === "capabilities" || prev[key] === next[key]) continue;
    return false;
  }
  return sameCapabilities(prev.capabilities, next.capabilities) && zoomKey(prev) === zoomKey(next);
}

/** One clip bar in a lane; its handlers read the lane's current callbacks when pressed. */
export const TimelineLaneClip = memo(function TimelineLaneClip({
  el,
  previewElement,
  elementKey,
  capabilities,
  pps,
  passengerStyle,
  clipBarHeight,
  isSelected,
  isHovered,
  isActive,
  tabIndex,
  priority,
  rich,
  theme,
  clipStyle,
  renderClipContent,
  renderClipOverlay,
  actions,
}: TimelineLaneClipProps) {
  const gestures = () =>
    createClipGestureHandlers(
      el,
      elementKey,
      previewElement,
      capabilities,
      actions.current.gestures,
    );
  const isComposition = !!el.compositionSrc;
  return (
    <TimelineClip
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        actions.current.onContextMenuClip?.(e, el);
      }}
      el={previewElement}
      pps={pps}
      passengerStyle={passengerStyle}
      clipY={CLIP_Y}
      clipHeight={clipBarHeight}
      isSelected={isSelected}
      isHovered={isHovered}
      isDragging={false}
      isActive={isActive}
      hasCustomContent={!!renderClipContent}
      capabilities={capabilities}
      theme={theme}
      isComposition={isComposition}
      tabIndex={tabIndex}
      onHoverStart={() => actions.current.setHoveredClip(elementKey)}
      onHoverEnd={() => actions.current.setHoveredClip(null)}
      onResizeStart={(edge, e) => gestures().onResizeStart(edge, e)}
      onPointerDown={(e) => gestures().onPointerDown(e)}
      onClick={(e) => gestures().onClick(e)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (actions.current.gestures.suppressClickRef.current) return;
        if (isComposition) actions.current.onDrillDown?.(el);
      }}
    >
      {renderClipChildren(previewElement, clipStyle, renderClipContent, renderClipOverlay, {
        priority,
        rich,
      })}
    </TimelineClip>
  );
}, sameClip);
