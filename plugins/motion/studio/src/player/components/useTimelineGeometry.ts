import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { usePlayerStore, type TimelineElement, type ZoomMode } from "../store/playerStore";
import { computePinnedZoomPercent, getTimelinePixelsPerSecond } from "./timelineZoom";
import {
  DRAG_EXTEND_MARGIN_PX,
  getTimelineDisplayContentWidth,
  getTimelineFitPps,
} from "./timelineLayout";
import type { DraggedClipState, ResizingClipState } from "./useTimelineClipDrag";

interface UseTimelineGeometryInput {
  viewportWidth: number;
  effectiveDuration: number;
  zoomMode: ZoomMode;
  manualZoomPercent: number;
  ppsRef: RefObject<number>;
  fitPpsRef: RefObject<number>;
  draggedClip: DraggedClipState | null;
  resizingClip: ResizingClipState | null;
  expandedElements: TimelineElement[];
  isDragging: RefObject<boolean>;
  scrollRef: RefObject<HTMLDivElement | null>;
  lastScrollLeftRef: RefObject<number>;
  contentOrigin: number;
}

// Derive the timeline's horizontal geometry from the viewport, zoom, and any live
// drag/resize preview: the pixels-per-second scale, the rendered content width
// (CapCut-style over-extension while dragging/trimming), and the version key that
// re-triggers dependent effects after an edit re-derives the elements.
export function useTimelineGeometry({
  viewportWidth,
  effectiveDuration,
  zoomMode,
  manualZoomPercent,
  ppsRef,
  fitPpsRef,
  draggedClip,
  resizingClip,
  expandedElements,
  isDragging,
  scrollRef,
  lastScrollLeftRef,
  contentOrigin,
}: UseTimelineGeometryInput) {
  const fitPps = getTimelineFitPps(viewportWidth, effectiveDuration, contentOrigin);
  const pps = getTimelinePixelsPerSecond(fitPps, zoomMode, manualZoomPercent);
  ppsRef.current = pps;
  // Drag-to-extend: while a clip is dragged, keep the rendered extent a margin
  // past the ghost's end. Holding the pointer in the right edge zone then keeps
  // auto-scroll stepping (scrollWidth grows with the ghost), so the timeline
  // extends at auto-scroll pace — placing a clip farther than the timeline
  // currently shows. Growth is bounded per frame by AUTO_SCROLL_MAX_SPEED (no
  // fling); leaving the edge zone stops it; the extra width collapses when the
  // drag ends (the composition itself only grows on commit, content-driven).
  const dragGhostEndPx = draggedClip?.started
    ? (draggedClip.previewStart + draggedClip.element.duration) * pps + DRAG_EXTEND_MARGIN_PX
    : 0;
  // Trim-to-extend: same mechanic for a right-edge RESIZE — the rendered extent
  // tracks the trim preview's end so the edge auto-scroll zone always has room
  // to keep stepping while the trim grows past the current timeline width.
  const resizeGhostEndPx = resizingClip?.started
    ? (resizingClip.previewStart + resizingClip.previewDuration) * pps + DRAG_EXTEND_MARGIN_PX
    : 0;
  // The timeline canvas always fills at least the viewport width AND the fit
  // span at this zoom: the ruler + empty track lanes keep going into
  // the space instead of leaving dead black — CapCut-style. Only the RENDERED
  // extent grows; clip positions/durations are untouched.
  const displayContentWidth = getTimelineDisplayContentWidth({
    effectiveDuration,
    viewportWidth,
    contentOrigin,
    pps,
    dragGhostEndPx,
    resizeGhostEndPx,
  });
  const displayDuration = pps > 0 ? displayContentWidth / pps : effectiveDuration;
  const zoomModeRef = useRef(zoomMode);
  zoomModeRef.current = zoomMode;
  fitPpsRef.current = fitPps;

  // Restore the horizontal scroll offset after an edit re-derives the elements
  // (the immutable element snapshot changes) so the reload doesn't jump the view. Only in manual
  // (pinned) mode — fit mode hides the x-scrollbar (scrollLeft is always 0) — and
  // never mid-drag (auto-scroll owns the offset then). rAF waits for the new layout
  // so the clamp reads the post-resync scrollWidth. zoomMode is a legitimate dep:
  // re-running on a mode flip is a no-op thanks to the guard.
  useEffect(() => {
    if (zoomMode !== "manual" || isDragging.current) return;
    const el = scrollRef.current;
    if (!el) return;
    // Read the ref inside the frame, not here: a sibling effect in the same
    // commit (a fresh reveal) can still update lastScrollLeftRef before this
    // frame runs, and a value captured now would fight that reveal with a
    // stale target.
    const raf = requestAnimationFrame(() => {
      const target = lastScrollLeftRef.current;
      if (target <= 0) return;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const next = Math.min(target, max);
      if (Math.abs(el.scrollLeft - next) > 0.5) el.scrollLeft = next;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedElements, zoomMode]);
  // Publish the live scale for readers outside <Timeline> (the toolbar's zoom controls).
  // In a useEffect (not the render body) so React-18 concurrent replay — Suspense
  // retry, transitions, StrictMode double-invoke — can't double-publish. The write is
  // idempotent (same pps/fitPps → same fields), so this is behavior-preserving; the
  // effect placement is just the strictly-correct shape.
  useEffect(() => {
    usePlayerStore.getState().setTimelineScale(pps, fitPps);
  }, [pps, fitPps]);
  // In manual zoom a length change keeps the on-screen scale instead of rescaling every
  // clip, whichever edit caused it. A composition switch empties the clips first, so it refits.
  const hasClips = expandedElements.length > 0;
  const lastScale = useRef({ effectiveDuration, pps, hasClips });
  useLayoutEffect(() => {
    const last = lastScale.current;
    lastScale.current = { effectiveDuration, pps, hasClips };
    if (zoomMode !== "manual" || !last.hasClips || !hasClips) return;
    if (last.effectiveDuration === effectiveDuration) return;
    // Before paint; the percent is clamped against the new fit, not the store's last published one.
    usePlayerStore.setState({ manualZoomPercent: computePinnedZoomPercent(last.pps, fitPps) });
  });

  return {
    pps,
    fitPps,
    displayContentWidth,
    displayDuration,
    clipStateVersion: expandedElements,
    zoomModeRef,
  };
}
