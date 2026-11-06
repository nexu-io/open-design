import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { shouldShowTimelineShortcutHint } from "./timelineLayout";
import { STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED } from "./timelineRowVirtualizationFlag";

/** How long the timeline waits after the last scroll event before treating the scroll as settled. */
export const TIMELINE_SCROLL_SETTLE_MS = 100;

export interface TimelineScrollViewportSnapshot {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly isScrolling: boolean;
}

const EMPTY_VIEWPORT: TimelineScrollViewportSnapshot = Object.freeze({
  scrollLeft: 0,
  scrollTop: 0,
  clientWidth: 0,
  clientHeight: 0,
  scrollWidth: 0,
  scrollHeight: 0,
  isScrolling: false,
});

function readTimelineScrollViewport(
  element: Pick<
    HTMLElement,
    "scrollLeft" | "scrollTop" | "clientWidth" | "clientHeight" | "scrollWidth" | "scrollHeight"
  >,
  isScrolling: boolean,
): TimelineScrollViewportSnapshot {
  return {
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    isScrolling,
  };
}

/**
 * The timeline scroll container's viewport plumbing — extracted verbatim from
 * Timeline.tsx (600-line studio cap): the ResizeObserver-backed viewport width,
 * the rAF-throttled shortcut-hint visibility sync, and the callback ref that
 * wires both to the scroll element. `resyncShortcutHintOn` re-checks the hint
 * whenever any of its values change (timeline readiness / element count /
 * canvas height), matching the original effect.
 */
export function useTimelineScrollViewport(
  scrollRef: RefObject<HTMLDivElement | null>,
  resyncShortcutHintOn: ReadonlyArray<unknown>,
): {
  viewport: TimelineScrollViewportSnapshot;
  showShortcutHint: boolean;
  setScrollRef: (el: HTMLDivElement | null) => void;
  syncScrollViewport: (el: HTMLDivElement, isScrolling?: boolean) => void;
} {
  const [viewport, setViewport] = useState<TimelineScrollViewportSnapshot>(EMPTY_VIEWPORT);
  const [showShortcutHint, setShowShortcutHint] = useState(true);
  const roRef = useRef<ResizeObserver | null>(null);
  const shortcutHintRafRef = useRef(0);
  const viewportRafRef = useRef(0);
  const scrollSettledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollingRef = useRef(false);

  const syncScrollViewport = useCallback((el: HTMLDivElement, isScrolling = false) => {
    // Row virtualization is the only consumer of the per-frame scroll snapshot.
    // With the flag off, publishing it re-rendered every mounted clip on every
    // scroll frame and bought nothing, so the scroll path stops here and
    // `isScrolling` stays false. Resize-driven and programmatic syncs arrive
    // through the immediate path below and still publish.
    if (isScrolling && !STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED) return;
    scrollingRef.current = isScrolling;
    const publish = () => {
      viewportRafRef.current = 0;
      setViewport(readTimelineScrollViewport(el, scrollingRef.current));
    };
    if (isScrolling) {
      if (!viewportRafRef.current) viewportRafRef.current = requestAnimationFrame(publish);
    } else {
      if (viewportRafRef.current) cancelAnimationFrame(viewportRafRef.current);
      publish();
      return;
    }
    if (scrollSettledTimerRef.current) clearTimeout(scrollSettledTimerRef.current);
    scrollSettledTimerRef.current = setTimeout(() => {
      scrollSettledTimerRef.current = null;
      scrollingRef.current = false;
      if (viewportRafRef.current) cancelAnimationFrame(viewportRafRef.current);
      publish();
    }, TIMELINE_SCROLL_SETTLE_MS);
  }, []);

  const syncShortcutHintVisibility = useCallback(() => {
    const scroll = scrollRef.current;
    setShowShortcutHint(
      scroll ? shouldShowTimelineShortcutHint(scroll.scrollHeight, scroll.clientHeight) : true,
    );
  }, [scrollRef]);

  const scheduleShortcutHintVisibilitySync = useCallback(() => {
    if (shortcutHintRafRef.current) cancelAnimationFrame(shortcutHintRafRef.current);
    shortcutHintRafRef.current = requestAnimationFrame(() => {
      shortcutHintRafRef.current = 0;
      syncShortcutHintVisibility();
    });
  }, [syncShortcutHintVisibility]);

  const setScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      scrollRef.current = el;
      if (!el) {
        if (scrollSettledTimerRef.current) clearTimeout(scrollSettledTimerRef.current);
        scrollSettledTimerRef.current = null;
        scrollingRef.current = false;
        return;
      }

      const syncResize = () => {
        syncScrollViewport(el, scrollingRef.current);
        scheduleShortcutHintVisibilitySync();
      };

      syncResize();
      roRef.current = new ResizeObserver(syncResize);
      roRef.current.observe(el);
    },
    [scrollRef, scheduleShortcutHintVisibilitySync, syncScrollViewport],
  );

  useMountEffect(() => () => {
    roRef.current?.disconnect();
    if (shortcutHintRafRef.current) cancelAnimationFrame(shortcutHintRafRef.current);
    if (viewportRafRef.current) cancelAnimationFrame(viewportRafRef.current);
    if (scrollSettledTimerRef.current) clearTimeout(scrollSettledTimerRef.current);
  });

  useEffect(() => {
    syncShortcutHintVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncShortcutHintVisibility, ...resyncShortcutHintOn]);

  return { viewport, showShortcutHint, setScrollRef, syncScrollViewport };
}
