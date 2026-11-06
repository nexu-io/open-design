import { useCallback, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { getTimelineContentXFromClient } from "./timelineLayout";

interface TimelineRazorInteractionOptions {
  active: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  contentOrigin: number;
  pixelsPerSecond: number;
  onSplitAll?: (time: number) => void;
}

export function useTimelineRazorInteraction({
  active,
  scrollRef,
  contentOrigin,
  pixelsPerSecond,
  onSplitAll,
}: TimelineRazorInteractionOptions) {
  const [razorGuideX, setRazorGuideX] = useState<number | null>(null);

  const updateRazorGuide = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const scroll = scrollRef.current;
      if (!active || !scroll) return;
      const rect = scroll.getBoundingClientRect();
      setRazorGuideX(event.clientX - rect.left + scroll.scrollLeft);
    },
    [active, scrollRef],
  );

  const clearRazorGuide = useCallback(() => setRazorGuideX(null), []);

  const splitAllAtPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const scroll = scrollRef.current;
      if (!active || !event.shiftKey || event.button !== 0 || !scroll) return false;
      const rect = scroll.getBoundingClientRect();
      const x = getTimelineContentXFromClient({
        clientX: event.clientX,
        rectLeft: rect.left,
        scrollLeft: scroll.scrollLeft,
        contentOrigin,
      });
      onSplitAll?.(Math.max(0, x / pixelsPerSecond));
      return true;
    },
    [active, contentOrigin, onSplitAll, pixelsPerSecond, scrollRef],
  );

  return { razorGuideX, updateRazorGuide, clearRazorGuide, splitAllAtPointer };
}

export function TimelineRazorGuideOverlay({ x }: { x: number }) {
  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-10"
      style={{ left: x, width: 1, background: "var(--timeline-danger)" }}
    />
  );
}
