import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { TimelineTimeRange } from "../lib/timelineClipIndex";
import { usePlayerStore } from "../store/playerStore";
import { markTimelineMotion, TIMELINE_REST_MS } from "./timelineMotion";
import { getTimelineRenderTimeRange } from "./timelineViewportGeometry";
import {
  clampTimelineZoomPercent,
  getNextTimelineZoomPercent,
  getTimelinePixelsPerSecond,
  getTimelineZoomPercent,
  TIMELINE_RANGE_MARGIN_PX,
  positiveClipSpan,
  zoomToSelectedClips,
  type ClipTimeSpan,
} from "./timelineZoom";

/** Where a zoom holds its place: `time` stays `x` px from the viewport's left edge. */
export interface TimelineZoomAnchor {
  time: number;
  x: number;
}

/** The mounted timeline's scroll viewport, which every zoom measures and previews against. */
export interface TimelineZoomViewport {
  scroll: HTMLDivElement;
  contentOrigin: number;
  publishScroll: (scroll: HTMLDivElement) => void;
}

/** How an eased zoom ended: it reached its range, or a person's zoom or the caller stopped it. */
export type TimelineZoomResult = "done" | "cancelled";

/**
 * A zoom drawn by scaling what is already laid out, on the compositor, until it is committed.
 * `shift` is the scrollLeft minus the scrollLeft the zoom will have: the translate that places it.
 */
interface ZoomPreview {
  percent: number;
  pps: number;
  shift: number;
  basePps: number;
  /** The times laid out (clips mounted, ruler drawn) when it began; past them it shows gaps. */
  drawn: TimelineTimeRange;
  byPerson: boolean;
}

const SMOOTH_ZOOM_MS = 220;
/** Past this the scaled-up preview turns soft. */
const MAX_PREVIEW_SCALE = 4;
/** Rounding at a drawn edge (whole-pixel content width, the fit track's 2px) is not a gap. */
const EDGE_SLACK_PX = 2;
const SCALED = "[data-timeline-zoom-scale]";

let viewport: TimelineZoomViewport | null = null;
/** While a preview shows, scales rows and strips React mounts into the timeline before they paint. */
let mounts: MutationObserver | null = null;
let preview: ZoomPreview | null = null;
let frame = 0;
let restTimer: ReturnType<typeof setTimeout> | null = null;
let anchorForCommit: TimelineZoomAnchor | null = null;
let animation = 0;
let easingTo: number | null = null;
let resolveEase: ((result: TimelineZoomResult) => void) | null = null;
const previewListeners = new Set<() => void>();

export function currentTimelineZoomPercent(): number {
  if (preview) return preview.percent;
  const s = usePlayerStore.getState();
  return getTimelineZoomPercent(s.zoomMode, s.manualZoomPercent, s.timelineFitPps);
}

/** The scale the timeline shows and the scrollLeft that scale would have. */
function shown(scroll: HTMLDivElement): { pps: number; left: number } {
  if (preview) return { pps: preview.pps, left: scroll.scrollLeft - preview.shift };
  return { pps: usePlayerStore.getState().timelinePps, left: scroll.scrollLeft };
}

/** The time under `x` px from the timeline viewport's left edge, as it is drawn now. */
export function timelineTimeAtX(x: number): number | null {
  if (!viewport) return null;
  const { pps, left } = shown(viewport.scroll);
  return pps > 0 ? (left + x - viewport.contentOrigin) / pps : null;
}

/** The scale and time-zero position to place something at a time by, while a zoom is previewed. */
export function timelineZoomMapping(pps: number, contentOrigin: number) {
  return preview
    ? { pps: preview.pps, contentOrigin: contentOrigin + preview.shift }
    : { pps, contentOrigin };
}

/** Whether a zoom is drawn scaled right now, so boxes read off the page are scaled too. */
export const isTimelineZoomPreviewing = (): boolean => preview !== null;

/** Called each frame a zoom preview moves, and once when it is laid out or dropped. */
export function subscribeTimelineZoomPreview(listener: () => void): () => void {
  previewListeners.add(listener);
  return () => previewListeners.delete(listener);
}

const subscribeShownZoom = (listener: () => void) => {
  const unsubscribePreview = subscribeTimelineZoomPreview(listener);
  const unsubscribeStore = usePlayerStore.subscribe(listener);
  return () => {
    unsubscribePreview();
    unsubscribeStore();
  };
};

/** The zoom percent the timeline shows, kept current through a preview. */
export function useShownTimelineZoomPercent(): number {
  return useSyncExternalStore(subscribeShownZoom, currentTimelineZoomPercent);
}

function writeZoom(percent: number, anchor: TimelineZoomAnchor | null, byPerson: boolean) {
  anchorForCommit = anchor;
  usePlayerStore.setState((s) => {
    const clamped = clampTimelineZoomPercent(percent, s.timelineFitPps);
    return {
      zoomMode: "manual",
      manualZoomPercent: clamped,
      // Only a person's zoom counts: the timeline and its host read it as the person taking over.
      userZoomCount: s.userZoomCount + (byPerson ? 1 : 0),
      timelinePps: getTimelinePixelsPerSecond(s.timelineFitPps, "manual", clamped),
    };
  });
}

const emitPreview = () => previewListeners.forEach((listener) => listener());

/** Stops the pending preview frame, rest timer and mount watch. */
function cancelPending() {
  mounts?.disconnect();
  mounts = null;
  if (restTimer) clearTimeout(restTimer);
  restTimer = null;
  cancelAnimationFrame(frame);
  frame = 0;
}

function clearScaled(scroll: HTMLElement) {
  scroll.querySelectorAll<HTMLElement>(SCALED).forEach((el) => {
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.willChange = "";
  });
}

/** Whether the preview shows time outside what was mounted, or is scaled up too far. */
function previewNeedsLayout(p: ZoomPreview, scroll: HTMLDivElement, contentOrigin: number) {
  if (p.pps / p.basePps > MAX_PREVIEW_SCALE) return true;
  const left = scroll.scrollLeft - p.shift;
  const start = left / p.pps;
  const end = (left + scroll.clientWidth - contentOrigin) / p.pps;
  const slack = EDGE_SLACK_PX / p.pps;
  return start < p.drawn.start - slack || end > p.drawn.end + slack;
}

/** The times laid out now: the render window clips, ruler ticks and beat lines are drawn in. */
function drawnRange(scroll: HTMLDivElement, pps: number, contentOrigin: number): TimelineTimeRange {
  const contentEnd = (scroll.scrollWidth - contentOrigin) / pps;
  return getTimelineRenderTimeRange(scroll, pps, contentOrigin, contentEnd);
}

function scalePreview(scroll: HTMLElement) {
  if (!preview) return;
  const transform = `translateX(${preview.shift}px) scaleX(${preview.pps / preview.basePps})`;
  scroll.querySelectorAll<HTMLElement>(SCALED).forEach((el) => {
    // The attribute's value is where time zero sits in the element, when not at its left edge.
    el.style.transformOrigin = `${el.dataset.timelineZoomScale || 0}px 0`;
    el.style.willChange = "transform";
    el.style.transform = transform;
  });
}

const holdsScaled = (node: Node) =>
  node instanceof Element && (node.matches(SCALED) || node.querySelector(SCALED) !== null);

function watchMounts(scroll: HTMLElement): MutationObserver {
  const observer = new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes].some(holdsScaled))) scalePreview(scroll);
  });
  observer.observe(scroll, { childList: true, subtree: true });
  return observer;
}

function drawPreview() {
  cancelAnimationFrame(frame);
  frame = 0;
  const view = viewport;
  if (!preview || !view) return;
  if (previewNeedsLayout(preview, view.scroll, view.contentOrigin)) {
    commitPreview();
    return;
  }
  scalePreview(view.scroll);
  mounts ??= watchMounts(view.scroll);
  emitPreview();
}

/** Lays the previewed zoom out for real and drops the scaling in the same frame. */
function commitPreview() {
  cancelPending();
  const view = viewport;
  const done = preview;
  if (!view || !done) return;
  const left = view.scroll.scrollLeft - done.shift;
  // Ending at the scale already laid out (an eased zoom-out) needs a scroll, not a layout.
  if (done.pps !== done.basePps) {
    flushSync(() =>
      writeZoom(done.percent, { time: left / done.pps, x: view.contentOrigin }, done.byPerson),
    );
  }
  preview = null;
  if (Math.abs(view.scroll.scrollLeft - left) >= 0.5) {
    view.scroll.scrollLeft = left;
    flushSync(() => view.publishScroll(view.scroll));
  }
  clearScaled(view.scroll);
  emitPreview();
}

/** The playhead's place if on screen, else the middle with the playhead brought to it. */
function defaultAnchor(view: TimelineZoomViewport, pps: number, left: number): TimelineZoomAnchor {
  const { currentTime } = usePlayerStore.getState();
  const x = view.contentOrigin + currentTime * pps - left;
  const onScreen = x >= view.contentOrigin && x <= view.scroll.clientWidth;
  return {
    time: currentTime,
    x: onScreen ? x : (view.contentOrigin + view.scroll.clientWidth) / 2,
  };
}

function request(percent: number, anchor: TimelineZoomAnchor | null, byPerson: boolean) {
  const view = viewport;
  const fitPps = usePlayerStore.getState().timelineFitPps;
  if (!view || !(fitPps > 0)) {
    writeZoom(percent, anchor, byPerson);
    return;
  }
  const clamped = clampTimelineZoomPercent(percent, fitPps);
  const pps = getTimelinePixelsPerSecond(fitPps, "manual", clamped);
  const { scroll, contentOrigin } = view;
  const now = shown(scroll);
  const at = anchor ?? defaultAnchor(view, now.pps, now.left);
  preview ??= {
    percent: clamped,
    pps,
    shift: 0,
    basePps: now.pps,
    drawn: drawnRange(scroll, now.pps, contentOrigin),
    byPerson,
  };
  // The content's width at this scale: the fit track (getTimelineFitPps), never narrower.
  const fitTrack = scroll.clientWidth - contentOrigin - 2;
  const width = contentOrigin + fitTrack * Math.max(1, pps / fitPps);
  const maxLeft = Math.max(0, width - scroll.clientWidth);
  const left = Math.max(0, Math.min(maxLeft, at.time * pps + contentOrigin - at.x));
  preview.percent = clamped;
  preview.pps = pps;
  preview.shift = scroll.scrollLeft - left;
  preview.byPerson ||= byPerson;
  if (!frame) frame = requestAnimationFrame(drawPreview);
  if (restTimer) clearTimeout(restTimer);
  restTimer = setTimeout(commitPreview, TIMELINE_REST_MS);
  // After the commit timer of the same delay, so the zoom is laid out before the timeline rests.
  markTimelineMotion();
}

/** A person's zoom input: previewed each frame, laid out once it rests. */
export function requestTimelineZoom(percent: number, anchor: TimelineZoomAnchor | null = null) {
  stopEase();
  request(percent, anchor, true);
}

/** Lays out a pending zoom now, so a press meets the real layout. */
export function settleTimelineZoom(): void {
  if (preview) commitPreview();
}

/** After a scroll: scales what it mounted, or lays the zoom out if it shows past what is drawn. */
export function redrawTimelineZoomPreview(): void {
  if (preview && !frame) frame = requestAnimationFrame(drawPreview);
}

/** Drops any pending or easing zoom without laying it out, as Fit does. */
export function cancelTimelineZoom(): void {
  stopEase();
  dropPreview();
}

function dropPreview() {
  cancelPending();
  if (!preview) return;
  if (viewport) clearScaled(viewport.scroll);
  preview = null;
  emitPreview();
}

function stopEase(result: TimelineZoomResult = "cancelled") {
  cancelAnimationFrame(animation);
  animation = 0;
  easingTo = null;
  const done = resolveEase;
  resolveEase = null;
  done?.(result);
}

/** The anchor of the zoom being committed; read once by the timeline as it lays the zoom out. */
export function takeTimelineZoomAnchor(): TimelineZoomAnchor | null {
  const anchor = anchorForCommit;
  anchorForCommit = null;
  return anchor;
}

export function registerTimelineZoomViewport(next: TimelineZoomViewport): () => void {
  viewport = next;
  return () => {
    // Another timeline mounted since keeps its registration.
    if (viewport !== next) return;
    viewport = null;
    // A re-render registers again in the same commit; only a real unmount drops the zoom.
    queueMicrotask(() => {
      if (!viewport) cancelTimelineZoom();
    });
  };
}

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The stretch a range zoom fills: from `x` px in, `width` px wide, inside the margins. */
function rangeBox(view: TimelineZoomViewport): { x: number; width: number } {
  const x = view.contentOrigin + TIMELINE_RANGE_MARGIN_PX;
  return { x, width: Math.max(1, view.scroll.clientWidth - x - TIMELINE_RANGE_MARGIN_PX) };
}

/** The seconds the timeline shows between its margins: what zoomTimelineToRange would fill. */
export function currentTimelineRange(): { start: number; end: number } | null {
  const view = viewport;
  const pps = view ? shown(view.scroll).pps : 0;
  if (!view || !(pps > 0)) return null;
  const { x, width } = rangeBox(view);
  const start = timelineTimeAtX(x)!;
  return { start, end: start + width / pps };
}

/**
 * Zooms and scrolls so `start`..`end` (seconds) fills the timeline, eased unless `smooth` is false
 * or motion is reduced. Resolves on landing; "cancelled" on a person's zoom, abort, or a newer one.
 */
export function zoomTimelineToRange(
  start: number,
  end: number,
  options: { smooth?: boolean; signal?: AbortSignal } = {},
): Promise<TimelineZoomResult> {
  return easeToRange(start, end, options, false);
}

function easeToRange(
  start: number,
  end: number,
  { smooth = true, signal }: { smooth?: boolean; signal?: AbortSignal },
  byPerson: boolean,
): Promise<TimelineZoomResult> {
  const view = viewport;
  const fitPps = usePlayerStore.getState().timelineFitPps;
  stopEase();
  const zoom =
    view && !signal?.aborted
      ? zoomToSelectedClips({
          clips: [{ start, end }],
          viewportWidth: view.scroll.clientWidth,
          contentOrigin: view.contentOrigin,
          fitPixelsPerSecond: fitPps,
        })
      : null;
  if (!view || !zoom) return Promise.resolve("cancelled");
  let resolveThis: (result: TimelineZoomResult) => void = () => {};
  const result = new Promise<TimelineZoomResult>((resolve) => (resolveThis = resolve));
  resolveEase = resolveThis;
  signal?.addEventListener("abort", () => resolveEase === resolveThis && stopEase(), {
    once: true,
  });
  const { x } = rangeBox(view);
  const toPercent = zoom.zoomPercent;
  const finish = () => {
    commitPreview();
    stopEase("done");
  };
  if (!smooth || reducedMotion()) {
    request(toPercent, { time: start, x }, byPerson);
    // Laid out next frame, never inside a caller's render or effect.
    animation = requestAnimationFrame(finish);
    return result;
  }
  easeZoom(view, fitPps, toPercent, { time: start, x }, byPerson, finish);
  return result;
}

/** Eases from the zoom shown now to `toPercent`, landing `to.time` at `to.x`, then `finish`es. */
function easeZoom(
  view: TimelineZoomViewport,
  fitPps: number,
  toPercent: number,
  to: TimelineZoomAnchor,
  byPerson: boolean,
  finish: () => void,
) {
  const { time: start, x } = to;
  const fromPercent = currentTimelineZoomPercent();
  const from = shown(view.scroll);
  const toPps = getTimelinePixelsPerSecond(fitPps, "manual", toPercent);
  const fromStart = timelineTimeAtX(x)!;
  const old = currentTimelineRange()!;
  // The one point both views put at the same place on screen; zooming about it, in log space,
  // moves every frame straight from the old view to the new. Equal scales are a plain scroll.
  const shift = from.pps === toPps ? null : (start - fromStart) / (1 / from.pps - 1 / toPps);
  const anchorAt = (k: number): TimelineZoomAnchor =>
    shift === null
      ? { time: fromStart + (start - fromStart) * k, x }
      : { time: fromStart + shift / from.pps, x: x + shift };
  // Zooming out to a view that holds the old one: lay the target out once, in the first frame,
  // and ease by scaling it down from the old view, instead of laying out again partway.
  const holdsOld =
    old.start >= start && old.end <= start + (old.end - old.start) * (from.pps / toPps);
  let layoutFirst = toPps < from.pps && from.pps / toPps <= MAX_PREVIEW_SCALE && holdsOld;
  const began = performance.now();
  easingTo = toPercent;
  const step = (now: number) => {
    if (layoutFirst) {
      layoutFirst = false;
      request(toPercent, to, byPerson);
      commitPreview();
    }
    const t = Math.min(1, Math.max(0, (now - began) / SMOOTH_ZOOM_MS));
    const k = 1 - (1 - t) ** 3;
    request(fromPercent * (toPercent / fromPercent) ** k, anchorAt(k), byPerson);
    // Drawn in this frame, not the next: the first one would otherwise paint a laid-out zoom-out bare.
    drawPreview();
    if (t < 1) animation = requestAnimationFrame(step);
    else finish();
  };
  animation = requestAnimationFrame(step);
}

/**
 * A zoom button: twice or half the scale, eased, keeping the playhead where it is on screen,
 * or centring it when it is off screen.
 */
export function zoomTimelineStep(direction: "in" | "out"): void {
  const fitPps = usePlayerStore.getState().timelineFitPps;
  const nextPercent = getNextTimelineZoomPercent(
    direction,
    "manual",
    easingTo ?? currentTimelineZoomPercent(),
    fitPps,
  );
  const view = viewport;
  // A collapsed timeline has no track to fit a range into, so the step still changes the percent.
  if (!view || !(fitPps > 0) || !(view.scroll.clientWidth > view.contentOrigin)) {
    requestTimelineZoom(nextPercent);
    return;
  }
  const { x, width } = rangeBox(view);
  const nextPps = getTimelinePixelsPerSecond(fitPps, "manual", nextPercent);
  const now = shown(view.scroll);
  const at = defaultAnchor(view, now.pps, now.left);
  const start = at.time - (at.x - x) / nextPps;
  void easeToRange(start, start + width / nextPps, {}, true);
}

function selectedClipSpans(state: {
  elements: readonly { key?: string | null; id: string; start: number; duration: number }[];
  selectedElementId: string | null;
  selectedElementIds: ReadonlySet<string>;
}): ClipTimeSpan[] {
  const keys = new Set(state.selectedElementIds);
  if (state.selectedElementId) keys.add(state.selectedElementId);
  const clips: ClipTimeSpan[] = [];
  for (const el of state.elements) {
    if (!keys.has(el.key ?? el.id)) continue;
    clips.push({ start: el.start, end: el.start + el.duration });
  }
  return clips;
}

/** Whether the selection matches a timeline clip the zoom can land on. */
export function canZoomToSelectedClips(state: {
  elements: readonly { key?: string | null; id: string; start: number; duration: number }[];
  selectedElementId: string | null;
  selectedElementIds: ReadonlySet<string>;
}): boolean {
  return positiveClipSpan(selectedClipSpans(state)) !== null;
}

export function zoomTimelineToSelectedClips(): boolean {
  const view = viewport;
  const state = usePlayerStore.getState();
  if (!view || !(state.timelineFitPps > 0) || !(view.scroll.clientWidth > view.contentOrigin))
    return false;
  const span = positiveClipSpan(selectedClipSpans(state));
  if (!span) return false;
  void zoomTimelineToRange(span.start, span.end);
  return true;
}
