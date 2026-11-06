import type { CSSProperties } from "react";
import type { KeyframeCacheEntry, TimelineElement } from "../store/playerStore";
import { CLIP_Y } from "./timelineLayout";
import type { TimelineLaneBaseProps } from "./timelineLaneProps";
import { TimelineClipDiamonds } from "./TimelineClipDiamonds";

interface TimelineCompactDiamondsProps extends Pick<
  TimelineLaneBaseProps,
  | "currentTime"
  | "selectedKeyframes"
  | "onClickKeyframe"
  | "onShiftClickKeyframe"
  | "onContextMenuKeyframe"
  | "onMoveKeyframe"
  | "onSelectSegment"
  | "suppressClickRef"
> {
  element: TimelineElement;
  elementId: string;
  keyframesData: KeyframeCacheEntry;
  pixelsPerSecond: number;
  rowHeight: number;
  beatsActive: boolean;
  accentColor: string;
  isSelected: boolean;
  passengerStyle?: CSSProperties;
  rovingTargetId: string | null;
}

/** Inline diamonds shown while the clip's property lanes are collapsed. */
export function TimelineCompactDiamonds({
  element,
  elementId,
  keyframesData,
  pixelsPerSecond,
  rowHeight,
  beatsActive,
  accentColor,
  isSelected,
  passengerStyle,
  currentTime,
  selectedKeyframes,
  rovingTargetId,
  onClickKeyframe,
  onShiftClickKeyframe,
  onContextMenuKeyframe,
  onMoveKeyframe,
  onSelectSegment,
  suppressClickRef,
}: TimelineCompactDiamondsProps) {
  const width = Math.max(element.duration * pixelsPerSecond, 4);
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: element.start * pixelsPerSecond,
        top: CLIP_Y,
        width,
        height: rowHeight - 2 * CLIP_Y,
        zIndex: isSelected ? 11 : 6,
        ...passengerStyle,
      }}
    >
      <TimelineClipDiamonds
        keyframesData={keyframesData}
        clipWidthPx={width}
        clipHeightPx={rowHeight - 2 * CLIP_Y}
        beatsActive={beatsActive}
        accentColor={accentColor}
        isSelected={isSelected}
        currentPercentage={
          element.duration > 0 ? ((currentTime - element.start) / element.duration) * 100 : 0
        }
        elementId={elementId}
        clipStart={element.start}
        clipDuration={element.duration}
        selectedKeyframes={selectedKeyframes}
        rovingTargetId={rovingTargetId}
        onClickKeyframe={(_id, target) => onClickKeyframe?.(element, target)}
        onShiftClickKeyframe={onShiftClickKeyframe}
        onContextMenuKeyframe={onContextMenuKeyframe}
        onMoveKeyframe={onMoveKeyframe}
        onSelectSegment={onSelectSegment}
        suppressClickRef={suppressClickRef}
      />
    </div>
  );
}
