import { useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { liveTime, usePlayerStore, type ZoomMode } from "../store/playerStore";
import { useMountEffect } from "../../hooks/useMountEffect";
import { getPinchTimelineZoomPercent } from "./timelineZoom";
import {
  currentTimelineZoomPercent,
  requestTimelineZoom,
  registerTimelineZoomViewport,
  redrawTimelineZoomPreview,
  settleTimelineZoom,
  subscribeTimelineZoomPreview,
  takeTimelineZoomAnchor,
  timelineTimeAtX,
  timelineZoomMapping,
} from "./timelineZoomInput";
import {
  getTimelinePlaybackFollowScrollLeft,
  getTimelineScrubTime,
  getTimelineScrollLeftForZoomTransition,
  getTimelineScrollLeftForZoomAnchor,
  shouldAutoScrollTimeline,
} from "./timelineLayout";
import { getTimelinePlayheadTransform } from "./timelinePlayheadTransform";
import { applyTimelineHorizontalAutoScrollStep } from "./timelineEditing";

function revealPlayheadScrollLeft(
  scroll: HTMLDivElement,
  playheadX: number,
  contentOrigin: number,
  from = scroll.scrollLeft,
): number {
  if (playheadX >= from + contentOrigin && playheadX <= from + scroll.clientWidth) return from;
  return getTimelinePlaybackFollowScrollLeft({
    playheadX,
    currentScrollLeft: from,
    viewportWidth: scroll.clientWidth,
    contentOrigin,
    maxScrollLeft: scroll.scrollWidth - scroll.clientWidth,
  });
}

interface UseTimelinePlayheadInput {
  playheadRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  syncScrollViewport: (scroll: HTMLDivElement) => void;
  ppsRef: React.RefObject<number>;
  durationRef: React.RefObject<number>;
  isDragging: React.RefObject<boolean>;
  currentTime: number;
  zoomMode: ZoomMode;
  zoomModeRef: React.RefObject<ZoomMode>;
  fitPps: number;
  fitPpsRef: React.RefObject<number>;
  effectiveDuration: number;
  pps: number;
  timelineReady: boolean;
  elementsLength: number;
  onSeek?: (time: number) => void;
  contentOrigin: number;
}

export function useTimelinePlayhead({
  playheadRef,
  scrollRef,
  syncScrollViewport,
  ppsRef,
  durationRef,
  isDragging,
  currentTime,
  zoomMode,
  zoomModeRef,
  fitPps: _fitPps,
  fitPpsRef,
  effectiveDuration,
  pps,
  timelineReady,
  elementsLength,
  onSeek,
  contentOrigin,
}: UseTimelinePlayheadInput) {
  const dragScrollRaf = useRef(0);
  const previousZoomModeRef = useRef<ZoomMode | null>(zoomMode);
  // A zoom keeps its anchor (pinch: pointer, else playhead) in place; a resize keeps the centre.
  const previousAnchorPpsRef = useRef(pps);
  const userZoomCount = usePlayerStore((s) => s.userZoomCount);
  const previousZoomCountRef = useRef(userZoomCount);
  const lastLiveTimeRef = useRef(usePlayerStore.getState().currentTime);
  const lastSeekCountRef = useRef(liveTime.seekCount());
  const contentOriginRef = useRef(contentOrigin);
  contentOriginRef.current = contentOrigin;

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const prevPps = previousAnchorPpsRef.current;
    previousAnchorPpsRef.current = pps;
    const prevZoomCount = previousZoomCountRef.current;
    previousZoomCountRef.current = userZoomCount;
    // Consumed even when pps didn't change (at the clamp), so it never lingers for a later zoom.
    const anchor = takeTimelineZoomAnchor();
    if (!scroll || pps === prevPps) return;
    if (anchor) {
      const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      const left = anchor.time * pps + contentOrigin - anchor.x;
      scroll.scrollLeft = Math.max(0, Math.min(maxScrollLeft, left));
      syncScrollViewport(scroll);
      return;
    }
    const zoomed = userZoomCount !== prevZoomCount;
    if (!zoomed && scroll.scrollLeft < 1) return;
    const time = Math.max(0, lastLiveTimeRef.current);
    const playheadX = contentOrigin + time * prevPps;
    const onScreen =
      revealPlayheadScrollLeft(scroll, playheadX, contentOrigin) === scroll.scrollLeft;
    const nextScrollLeft = getTimelineScrollLeftForZoomAnchor({
      pointerX: zoomed && onScreen ? playheadX - scroll.scrollLeft : scroll.clientWidth / 2,
      currentScrollLeft: scroll.scrollLeft,
      contentOrigin,
      currentPixelsPerSecond: prevPps,
      nextPixelsPerSecond: pps,
      duration: durationRef.current,
    });
    const maxScrollLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const anchored = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
    scroll.scrollLeft = zoomed
      ? revealPlayheadScrollLeft(scroll, contentOrigin + time * pps, contentOrigin, anchored)
      : anchored;
    syncScrollViewport(scroll);
  }, [pps, userZoomCount, scrollRef, durationRef, contentOrigin, syncScrollViewport]);

  const syncPlayheadPosition = useCallback(
    (time: number) => {
      if (!playheadRef.current || durationRef.current <= 0) return;
      const at = timelineZoomMapping(ppsRef.current, contentOrigin);
      playheadRef.current.style.transform = getTimelinePlayheadTransform(
        time,
        at.pps,
        at.contentOrigin,
        !usePlayerStore.getState().isPlaying,
      );
    },
    [playheadRef, durationRef, ppsRef, contentOrigin],
  );

  useEffect(() => {
    syncPlayheadPosition(currentTime);
  }, [currentTime, pps, syncPlayheadPosition, timelineReady, elementsLength]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || zoomMode !== "fit") return;
    scroll.scrollLeft = 0;
  }, [zoomMode, pps, scrollRef]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) {
      previousZoomModeRef.current = zoomMode;
      return;
    }
    scroll.scrollLeft = getTimelineScrollLeftForZoomTransition(
      previousZoomModeRef.current,
      zoomMode,
      scroll.scrollLeft,
    );
    previousZoomModeRef.current = zoomMode;
  }, [zoomMode, scrollRef]);

  useMountEffect(() => {
    const place = (t: number, atRest: boolean) => {
      if (!playheadRef.current || durationRef.current <= 0) return false;
      const at = timelineZoomMapping(ppsRef.current, contentOriginRef.current);
      playheadRef.current.style.transform = getTimelinePlayheadTransform(
        t,
        at.pps,
        at.contentOrigin,
        atRest,
      );
      return true;
    };
    const unsubPreview = subscribeTimelineZoomPreview(() =>
      place(lastLiveTimeRef.current, !usePlayerStore.getState().isPlaying),
    );
    const dragging = () => isDragging.current || usePlayerStore.getState().beatDragging;
    const unsubPlaying = usePlayerStore.subscribe((state, prev) => {
      if (prev.isPlaying && !state.isPlaying) place(lastLiveTimeRef.current, true);
    });
    lastSeekCountRef.current = liveTime.seekCount();
    const unsub = liveTime.subscribe((t) => {
      const sought = liveTime.seekCount() !== lastSeekCountRef.current;
      lastSeekCountRef.current = liveTime.seekCount();
      lastLiveTimeRef.current = t;
      const playing = usePlayerStore.getState().isPlaying;
      if (!place(t, !playing)) return;
      const at = timelineZoomMapping(ppsRef.current, contentOriginRef.current);
      const playheadX = at.contentOrigin + Math.max(0, t) * at.pps;
      const scroll = scrollRef.current;
      // Paused, only a seek scrolls: a reload's republish, frame-rounded, must not undo a person's scroll.
      if (!scroll || dragging() || zoomModeRef.current === "fit" || (!playing && !sought)) return;
      const nextScrollLeft = playing
        ? getTimelinePlaybackFollowScrollLeft({
            playheadX,
            currentScrollLeft: scroll.scrollLeft,
            viewportWidth: scroll.clientWidth,
            contentOrigin: contentOriginRef.current,
            maxScrollLeft: scroll.scrollWidth - scroll.clientWidth,
          })
        : revealPlayheadScrollLeft(scroll, playheadX, contentOriginRef.current);
      if (Math.abs(nextScrollLeft - scroll.scrollLeft) >= 0.5) {
        scroll.scrollLeft = nextScrollLeft;
      }
    });
    return () => {
      unsub();
      unsubPlaying();
      unsubPreview();
    };
  });

  const seekFromX = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el || effectiveDuration <= 0) return;
      const rect = el.getBoundingClientRect();
      const time = getTimelineScrubTime({
        clientX,
        viewportLeft: rect.left,
        scrollLeft: el.scrollLeft,
        contentOrigin,
        pixelsPerSecond: pps,
        duration: effectiveDuration,
      });
      liveTime.notify(time);
      onSeek?.(time);
    },
    [scrollRef, effectiveDuration, pps, onSeek, contentOrigin],
  );

  const autoScrollDuringDrag = useCallback(
    (clientX: number) => {
      cancelAnimationFrame(dragScrollRaf.current);
      const el = scrollRef.current;
      if (
        !el ||
        !isDragging.current ||
        !shouldAutoScrollTimeline(zoomModeRef.current, el.scrollWidth, el.clientWidth)
      )
        return;
      if (applyTimelineHorizontalAutoScrollStep(el, clientX)) {
        seekFromX(clientX);
        dragScrollRaf.current = requestAnimationFrame(() => autoScrollDuringDrag(clientX));
      }
    },
    [scrollRef, isDragging, zoomModeRef, seekFromX],
  );

  // Trackpad pinch arrives as ctrl+wheel; Cmd+wheel zooms too, as Mac editors do.
  const handlePinchWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const scroll = scrollRef.current;
      if (!scroll || durationRef.current <= 0 || fitPpsRef.current <= 0 || ppsRef.current <= 0)
        return;
      e.preventDefault();
      e.stopPropagation();
      const x = e.clientX - scroll.getBoundingClientRect().left;
      requestTimelineZoom(
        getPinchTimelineZoomPercent(
          e.deltaY,
          "manual",
          currentTimelineZoomPercent(),
          fitPpsRef.current,
        ),
        { time: Math.max(0, timelineTimeAtX(x) ?? 0), x },
      );
    },
    [scrollRef, durationRef, fitPpsRef, ppsRef],
  );

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.addEventListener("wheel", handlePinchWheel, { passive: false, capture: true });
    // A press meets the zoom it sees, not the one still waiting to be laid out.
    scroll.addEventListener("pointerdown", settleTimelineZoom, { capture: true });
    scroll.addEventListener("scroll", redrawTimelineZoomPreview, { passive: true });
    const unregisterZoomViewport = registerTimelineZoomViewport({
      scroll,
      contentOrigin,
      publishScroll: syncScrollViewport,
    });
    return () => {
      scroll.removeEventListener("wheel", handlePinchWheel, { capture: true });
      scroll.removeEventListener("pointerdown", settleTimelineZoom, { capture: true });
      scroll.removeEventListener("scroll", redrawTimelineZoomPreview);
      unregisterZoomViewport();
    };
  }, [
    handlePinchWheel,
    scrollRef,
    timelineReady,
    elementsLength,
    contentOrigin,
    syncScrollViewport,
  ]);

  return { seekFromX, autoScrollDuringDrag, dragScrollRaf };
}
