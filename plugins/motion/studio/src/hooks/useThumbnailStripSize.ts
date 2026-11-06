import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import {
  isTimelineZoomPreviewing,
  subscribeTimelineZoomPreview,
} from "../player/components/timelineZoomInput";

export interface StripSize {
  width: number;
  height: number;
  inViewStart: number;
  inViewEnd: number;
}

const IN_VIEW_CHUNK_PX = 512;

const chunk = (px: number, round: (n: number) => number) =>
  Math.max(0, round(px / IN_VIEW_CHUNK_PX) * IN_VIEW_CHUNK_PX);

const spanAt = (left: number) => ({
  inViewStart: chunk(-left - IN_VIEW_CHUNK_PX, Math.floor),
  inViewEnd: chunk(window.innerWidth - left + IN_VIEW_CHUNK_PX, Math.ceil),
});

// scrollMargin widens the band inside the timeline's own scroller too; TypeScript's DOM types lack it.
const GAP_WARNING: IntersectionObserverInit & { scrollMargin: string } = {
  rootMargin: `0px ${IN_VIEW_CHUNK_PX / 2}px`,
  scrollMargin: `0px ${IN_VIEW_CHUNK_PX / 2}px`,
};

const SHORT_STRIP_MAX_PX = 8 * IN_VIEW_CHUNK_PX;
const isShort = (width: number) => width <= SHORT_STRIP_MAX_PX;

const EMPTY_STRIP: StripSize = { width: 0, height: 0, inViewStart: 0, inViewEnd: 0 };

// Clamped to a measured strip, so a strip changes only when it crosses the screen's edge.
const merge = (prev: StripSize, patch: Partial<StripSize>): StripSize => {
  const next = { ...prev, ...patch };
  const width = next.width > 0 ? Math.ceil(next.width) : Infinity;
  next.inViewStart = isShort(width) ? 0 : Math.min(next.inViewStart, width);
  next.inViewEnd = isShort(width) ? width : Math.min(next.inViewEnd, width);
  return (Object.keys(next) as (keyof StripSize)[]).every((key) => next[key] === prev[key])
    ? prev
    : next;
};

type Apply = (patch: Partial<StripSize>) => void;

interface Strip {
  apply: Apply;
  scroller: Element | null;
  box: { left: number; top: number; width: number; height: number };
  readAt: { x: number; y: number };
  showing: boolean;
}

const NEAR_PX = IN_VIEW_CHUNK_PX / 2;

// Each frame reads the strips showing tiles, which a move without a scroll may have carried, and the
// strips whose last box, moved by the scroll since, lands near the screen; reads precede one commit.
const strips = new Map<Element, Strip>();
let users = 0;
let frame = 0;
let shared: {
  resize: ResizeObserver;
  presence: IntersectionObserver | null;
  gaps: IntersectionObserver | null;
  stopZoomWatch: () => void;
} | null = null;

const offsetOf = (scroller: Element | null) =>
  scroller ? { x: scroller.scrollLeft, y: scroller.scrollTop } : { x: scrollX, y: scrollY };

const isNear = ({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}) =>
  left < innerWidth + NEAR_PX &&
  left + width > -NEAR_PX &&
  top < innerHeight + NEAR_PX &&
  top + height > -NEAR_PX;

const NOTHING_IN_VIEW = { inViewStart: 0, inViewEnd: 0 };

const spanOf = (box: Strip["box"]) => (isNear(box) ? spanAt(box.left) : NOTHING_IN_VIEW);

const read = (target: Element, strip: Strip) => {
  const { left, top, width, height } = target.getBoundingClientRect();
  strip.box = { left, top, width, height };
  strip.readAt = offsetOf(strip.scroller);
  return spanOf(strip.box);
};

const commit = (updates: (readonly [Apply, Partial<StripSize>])[]) =>
  flushSync(() => updates.forEach(([apply, patch]) => apply(patch)));

// A zoom preview scales the strips: reads wait, and each preview's layout re-measures them all.
const remeasureAfterPreview = () => {
  if (isTimelineZoomPreviewing()) return;
  commit(
    [...strips].map(
      ([target, strip]) =>
        [
          strip.apply,
          { width: target.clientWidth, height: target.clientHeight, ...read(target, strip) },
        ] as const,
    ),
  );
};

const refresh = () => {
  frame = 0;
  if (isTimelineZoomPreviewing()) return;
  const offsetsNow = new Map<Element | null, { x: number; y: number }>();
  const updates: (readonly [Apply, Partial<StripSize>])[] = [];
  for (const [target, strip] of strips) {
    if (isShort(strip.box.width)) continue;
    let now = offsetsNow.get(strip.scroller);
    if (!now) offsetsNow.set(strip.scroller, (now = offsetOf(strip.scroller)));
    const { box, readAt } = strip;
    const moved = {
      left: box.left - (now.x - readAt.x),
      top: box.top - (now.y - readAt.y),
      width: box.width,
      height: box.height,
    };
    if (strip.showing || isNear(moved)) updates.push([strip.apply, read(target, strip)]);
  }
  commit(updates);
};

const scheduleRefresh = () => {
  if (!frame) frame = requestAnimationFrame(refresh);
};

const measure = (entries: { target: Element; size?: { width: number; height: number } }[]) =>
  isTimelineZoomPreviewing() ||
  commit(
    entries.flatMap(({ target, size }) => {
      const strip = strips.get(target);
      return strip ? [[strip.apply, { ...size, ...read(target, strip) }] as const] : [];
    }),
  );

const onPresence = (entries: IntersectionObserverEntry[]) =>
  measure(entries.filter((entry) => entry.isIntersecting));

const pendingSizes = new Map<Element, { width: number; height: number }>();
let pendingSizesFrame = 0;
const applyPendingSizes = () => {
  pendingSizesFrame = 0;
  const entries = [...pendingSizes].map(([target, size]) => ({ target, size }));
  pendingSizes.clear();
  measure(entries);
};

const applyResizesNextFrame = (entries: ResizeObserverEntry[]) => {
  for (const { target, contentRect } of entries)
    pendingSizes.set(target, { width: contentRect.width, height: contentRect.height });
  pendingSizesFrame ||= requestAnimationFrame(applyPendingSizes);
};

const observeIntersections = (callback: IntersectionObserverCallback) =>
  typeof IntersectionObserver === "undefined"
    ? null
    : new IntersectionObserver(callback, GAP_WARNING);

function acquire() {
  if (users++ === 0) {
    shared = {
      resize: new ResizeObserver(applyResizesNextFrame),
      presence: observeIntersections(onPresence),
      gaps: observeIntersections(
        (entries) => entries.some((entry) => entry.isIntersecting) && scheduleRefresh(),
      ),
      stopZoomWatch: subscribeTimelineZoomPreview(remeasureAfterPreview),
    };
    window.addEventListener("scroll", scheduleRefresh, { capture: true, passive: true });
  }
  return shared!;
}

function release() {
  if (--users > 0) return;
  shared?.resize.disconnect();
  shared?.presence?.disconnect();
  shared?.gaps?.disconnect();
  shared?.stopZoomWatch();
  shared = null;
  window.removeEventListener("scroll", scheduleRefresh, { capture: true });
  cancelAnimationFrame(frame);
  frame = 0;
  cancelAnimationFrame(pendingSizesFrame);
  pendingSizesFrame = 0;
  pendingSizes.clear();
}

const watchGap = (gap: HTMLDivElement | null) => {
  if (!gap) return;
  const { gaps } = acquire();
  gaps?.observe(gap);
  return () => {
    gaps?.unobserve(gap);
    release();
  };
};

/** Size of the thumbnail's parent and its span in the window, kept current on resize, scroll and moves. */
export function useThumbnailStripSize() {
  const [size, setSize] = useState(EMPTY_STRIP);

  const ref = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const target = element.parentElement ?? element;
    const { resize, presence } = acquire();
    let current = EMPTY_STRIP;
    const apply: Apply = (patch) => {
      const next = merge(current, patch);
      if (next === current) return;
      current = next;
      strip.showing = next.inViewEnd > 0;
      setSize(next);
    };
    const scroller = target.closest("[data-timeline-scroll-viewport]");
    const strip: Strip = {
      apply,
      scroller,
      box: { left: 0, top: 0, width: 0, height: 0 },
      readAt: { x: 0, y: 0 },
      showing: false,
    };
    strips.set(target, strip);
    apply({ width: target.clientWidth, height: target.clientHeight, ...read(target, strip) });
    resize.observe(target);
    presence?.observe(target);
    return () => {
      resize.unobserve(target);
      presence?.unobserve(target);
      strips.delete(target);
      pendingSizes.delete(target);
      release();
    };
  }, []);

  return [size, ref, watchGap] as const;
}
