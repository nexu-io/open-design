import { CLIP_Y } from "./timelineLayout";
import { sortedLaneClips, TRACK_GAP_EPSILON_S } from "./timelineGaps";
import type { TimelineElement } from "../store/playerStore";
import { TimelineTimeLayer, timeLayerPercent } from "./TimelineTimeLayer";

/** Times where one clip on a row ends exactly where the next begins. */
export function deriveTimelineClipJoins(elements: readonly TimelineElement[]): number[] {
  const sorted = sortedLaneClips(elements);
  const joins: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const end = previous.start + previous.duration;
    if (Math.abs(sorted[index]!.start - end) < TRACK_GAP_EPSILON_S) joins.push(end);
  }
  return joins;
}

interface TimelineClipJoinsProps {
  elements: readonly TimelineElement[];
  pixelsPerSecond: number;
  rowHeight: number;
  clipBarHeight?: number;
  color: string;
}

/** A hairline in the row colour over each join, so touching clips read as two without moving either. */
export function TimelineClipJoins({
  elements,
  pixelsPerSecond,
  rowHeight,
  clipBarHeight,
  color,
}: TimelineClipJoinsProps) {
  const height = clipBarHeight ?? rowHeight - 2 * CLIP_Y;
  return (
    <TimelineTimeLayer pixelsPerSecond={pixelsPerSecond}>
      {deriveTimelineClipJoins(elements).map((time) => (
        <div
          key={time}
          data-timeline-clip-join=""
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            left: timeLayerPercent(time),
            top: CLIP_Y,
            width: 1,
            height,
            transform: "translateX(-50%)",
            background: color,
            // Over an idle or hovered clip, under the diamonds (6) and a selected clip (10).
            zIndex: 5,
          }}
        />
      ))}
    </TimelineTimeLayer>
  );
}
