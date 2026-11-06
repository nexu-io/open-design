import { useCallback, useRef, useSyncExternalStore, type RefObject } from "react";
import { TIMELINE_SCROLL_SETTLE_MS } from "./useTimelineScrollViewport";

// The timeline viewport's scrollLeft once a scroll settles, or null while it is scrolling. Readers
// re-render twice per gesture, never per frame: per-frame work cost 2-3x the viewport gate's budget
// on a large unvirtualized timeline.
export function useSettledScrollLeft(scrollRef: RefObject<HTMLDivElement | null>): number | null {
  const scrollingRef = useRef(false);
  const settledRef = useRef(0);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const el = scrollRef.current;
      settledRef.current = el?.scrollLeft ?? 0;
      onChange();
      let settle: ReturnType<typeof setTimeout> | undefined;
      const onScroll = () => {
        if (!scrollingRef.current) {
          scrollingRef.current = true;
          onChange();
        }
        clearTimeout(settle);
        settle = setTimeout(() => {
          scrollingRef.current = false;
          settledRef.current = el?.scrollLeft ?? 0;
          onChange();
        }, TIMELINE_SCROLL_SETTLE_MS);
      };
      el?.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        clearTimeout(settle);
        scrollingRef.current = false;
        el?.removeEventListener("scroll", onScroll);
      };
    },
    [scrollRef],
  );
  return useSyncExternalStore(
    subscribe,
    () => (scrollingRef.current ? null : settledRef.current),
    () => null,
  );
}
