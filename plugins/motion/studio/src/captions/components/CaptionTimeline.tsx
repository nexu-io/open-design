import { useI18n } from "../../i18n/I18n";
import { memo, useCallback } from "react";
import { useCaptionStore } from "../store";
import { usePlayerStore } from "../../player";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GROUP_COLORS = [
  "#3CE6AC",
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#A78BFA",
  "#F472B6",
  "#34D399",
  "#FB923C",
  "#60A5FA",
  "#C084FC",
];

const TRACK_LEFT_PAD = 32;

// Timing edge-drag and double-click group split were removed deliberately:
// segment timing and group structure only mutate the in-memory model — they
// are never applied to playback nor serialized to caption-overrides.json, so
// the UI was confirming edits that didn't exist. Restore them only alongside
// a real apply/persist pipeline.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptionTimelineProps {
  pixelsPerSecond: number;
  onSeek?: (time: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CaptionTimeline = memo(function CaptionTimeline({
  pixelsPerSecond,
  onSeek,
}: CaptionTimelineProps) {
  const { t } = useI18n();
  const model = useCaptionStore((s) => s.model);
  const selectedSegmentIds = useCaptionStore((s) => s.selectedSegmentIds);
  const selectSegment = useCaptionStore((s) => s.selectSegment);
  const currentTime = usePlayerStore((s) => s.currentTime);

  const handleBlockClick = useCallback(
    (e: React.MouseEvent, segId: string) => {
      e.stopPropagation();
      selectSegment(segId, e.shiftKey);
    },
    [selectSegment],
  );

  const handleBlockKeyDown = useCallback(
    (e: React.KeyboardEvent, segId: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        selectSegment(segId, e.shiftKey);
      }
    },
    [selectSegment],
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek) return;
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left - TRACK_LEFT_PAD;
      const time = Math.max(0, x / pixelsPerSecond);
      onSeek(time);
    },
    [onSeek, pixelsPerSecond],
  );

  if (!model) return null;

  const playheadLeft = TRACK_LEFT_PAD + currentTime * pixelsPerSecond;

  return (
    <div
      className="relative select-none overflow-x-auto"
      style={{ height: 40, minWidth: "100%" }}
      onClick={handleTrackClick}
    >
      {model.groupOrder.map((groupId, groupIdx) => {
        const group = model.groups.get(groupId);
        if (!group) return null;
        const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length];

        return group.segmentIds.map((segId) => {
          const seg = model.segments.get(segId);
          if (!seg) return null;

          const left = TRACK_LEFT_PAD + seg.start * pixelsPerSecond;
          const width = Math.max((seg.end - seg.start) * pixelsPerSecond, 4);
          const isSelected = selectedSegmentIds.has(segId);

          return (
            <div
              key={segId}
              role="button"
              tabIndex={0}
              aria-label={t("Caption word \"{value0}\"", { value0: seg.text })}
              aria-pressed={isSelected}
              className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden cursor-pointer focus-visible:ring-1 focus-visible:ring-text-0 outline-hidden${
                isSelected ? " ring-1 ring-text-0/50 z-10" : ""
              }`}
              style={{
                left,
                width,
                backgroundColor: color,
                zIndex: isSelected ? 10 : 1,
              }}
              onClick={(e) => handleBlockClick(e, segId)}
              onKeyDown={(e) => handleBlockKeyDown(e, segId)}
            >
              {/* Text label */}
              <span
                className="flex-1 truncate px-2 pointer-events-none"
                style={{ fontSize: 9, color: "#000000", lineHeight: 1 }}
              >
                {seg.text}
              </span>
            </div>
          );
        });
      })}

      {/* Playhead — correlates blocks with the current frame */}
      <div
        className="absolute top-0 bottom-0 w-px bg-text-0/70 pointer-events-none z-20"
        style={{ left: playheadLeft }}
        aria-hidden="true"
      />
    </div>
  );
});
