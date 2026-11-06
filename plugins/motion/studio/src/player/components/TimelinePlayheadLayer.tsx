import type { ReactNode, RefObject } from "react";
import { PLAYHEAD_GLOW_W } from "./PlayheadIndicator";
import { useSettledScrollLeft } from "./useSettledScrollLeft";

// Clips the playhead at the track headers' edge once a scroll settles, so one scrolled off to
// the left does not draw over the track names. Half the glow may pass the edge so 00:00 looks
// as before; mid-scroll it is not clipped.
export function TimelinePlayheadLayer({
  scrollRef,
  contentOrigin,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentOrigin: number;
  children: ReactNode;
}) {
  const settledScrollLeft = useSettledScrollLeft(scrollRef);
  return (
    <div
      data-timeline-playhead-layer=""
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 100,
        clipPath:
          settledScrollLeft === null
            ? undefined
            : `inset(0 0 0 ${settledScrollLeft + contentOrigin - PLAYHEAD_GLOW_W / 2}px)`,
      }}
    >
      {children}
    </div>
  );
}
