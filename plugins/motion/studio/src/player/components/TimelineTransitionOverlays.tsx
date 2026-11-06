import { CLIP_Y } from "./timelineLayout";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import type { TimelineElement } from "../store/playerStore";
import type { TimelineTransitionSeam } from "./timelineTransitionSeams";
import { TimelineTransitionBadge } from "./TimelineTransitionBadge";
import { TimelineClipJoins } from "./TimelineClipJoins";

interface TimelineTransitionOverlaysProps {
  seams: readonly TimelineTransitionSeam[];
  rowElements: readonly TimelineElement[];
  rowBackground: string;
  pixelsPerSecond: number;
  rowHeight: number;
  clipBarHeight?: number;
}

/** What a row draws where its clips meet: a hairline at an exact join, a badge over a transition. */
export function TimelineTransitionOverlays({
  seams,
  rowElements,
  rowBackground,
  pixelsPerSecond,
  rowHeight,
  clipBarHeight,
}: TimelineTransitionOverlaysProps) {
  const top = CLIP_Y + (clipBarHeight ?? rowHeight - 2 * CLIP_Y) / 2;
  return (
    <>
      <TimelineClipJoins
        elements={rowElements}
        pixelsPerSecond={pixelsPerSecond}
        rowHeight={rowHeight}
        clipBarHeight={clipBarHeight}
        color={rowBackground}
      />
      {seams.map((seam) => (
        <TimelineTransitionBadge
          key={`${getTimelineElementIdentity(seam.outgoing)}-${getTimelineElementIdentity(seam.incoming)}`}
          centerPx={seam.centerTime * pixelsPerSecond}
          top={top}
          widthPx={Math.min(Math.max(seam.duration * pixelsPerSecond, 24), 32)}
          outgoingSrc={seam.outgoing.src}
          incomingSrc={seam.incoming.src}
        />
      ))}
    </>
  );
}
