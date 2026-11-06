import type { ZoomMode } from "../store/playerStore";
import { STUDIO_PREVIEW_FPS } from "../lib/time";

export const MIN_TIMELINE_ZOOM_PERCENT = 10;
/** Inset so a range zoom does not sit on the viewport edge. Shared with the range box. */
export const TIMELINE_RANGE_MARGIN_PX = 24;
const MAX_TIMELINE_FRAME_WIDTH_PX = 48;
// CapCut-strength steps: one button press / pinch gesture moves the zoom
// meaningfully (user feedback, twice-doubled: 1.25×/0.8× + 0.0035 felt like
// "zooming several times to get anywhere", then 1.5× + 0.007 still too soft).
// Kept reciprocal (2 × 0.5 = 1) so in+out round-trips.
const ZOOM_OUT_FACTOR = 0.5;
const ZOOM_IN_FACTOR = 2;
const PINCH_ZOOM_SENSITIVITY = 0.014;

export function getMaxTimelineZoomPercent(fitPixelsPerSecond: number): number {
  if (!Number.isFinite(fitPixelsPerSecond) || fitPixelsPerSecond <= 0) return 100;
  const frameLevelPixelsPerSecond = STUDIO_PREVIEW_FPS * MAX_TIMELINE_FRAME_WIDTH_PX;
  return Math.max(100, Math.round((frameLevelPixelsPerSecond / fitPixelsPerSecond) * 100));
}

export function clampTimelineZoomPercent(percent: number, fitPixelsPerSecond: number): number {
  if (!Number.isFinite(percent)) return 100;
  const maxZoomPercent = getMaxTimelineZoomPercent(fitPixelsPerSecond);
  return Math.max(MIN_TIMELINE_ZOOM_PERCENT, Math.min(maxZoomPercent, Math.round(percent)));
}

export function getTimelineZoomPercent(
  zoomMode: ZoomMode,
  manualZoomPercent: number,
  fitPixelsPerSecond: number,
): number {
  return zoomMode === "fit" ? 100 : clampTimelineZoomPercent(manualZoomPercent, fitPixelsPerSecond);
}

/**
 * The manual-zoom percent that, applied to `fitPixelsPerSecond`, reproduces the
 * CURRENT on-screen pixels-per-second exactly. Used to PIN the timeline zoom on
 * the first edit so a duration change (which recomputes fit-pps) no longer
 * rescales every clip: we switch `zoomMode` to "manual" with this percent, so
 * `getTimelinePixelsPerSecond` keeps returning today's pps regardless of the new
 * fit basis.
 *
 * Since `pps = fitPps * (percent / 100)` in manual mode, and while fitting
 * `pps === fitPps`, the pinned percent is `currentPps / fitPps * 100`. Clamped to
 * the manual-zoom range so the pin can't land outside the slider's bounds; falls
 * back to 100 (a no-op pin at the current fit) when either input is unusable.
 */
export function computePinnedZoomPercent(
  currentPixelsPerSecond: number,
  fitPixelsPerSecond: number,
): number {
  if (
    !Number.isFinite(currentPixelsPerSecond) ||
    currentPixelsPerSecond <= 0 ||
    !Number.isFinite(fitPixelsPerSecond) ||
    fitPixelsPerSecond <= 0
  ) {
    return 100;
  }
  return clampTimelineZoomPercent(
    (currentPixelsPerSecond / fitPixelsPerSecond) * 100,
    fitPixelsPerSecond,
  );
}

export function getTimelinePixelsPerSecond(
  fitPixelsPerSecond: number,
  zoomMode: ZoomMode,
  manualZoomPercent: number,
): number {
  if (!Number.isFinite(fitPixelsPerSecond) || fitPixelsPerSecond <= 0) return 100;
  const zoomPercent = getTimelineZoomPercent(zoomMode, manualZoomPercent, fitPixelsPerSecond);
  return zoomMode === "fit" ? fitPixelsPerSecond : fitPixelsPerSecond * (zoomPercent / 100);
}

export function getNextTimelineZoomPercent(
  direction: "in" | "out",
  zoomMode: ZoomMode,
  manualZoomPercent: number,
  fitPixelsPerSecond: number,
): number {
  const current = getTimelineZoomPercent(zoomMode, manualZoomPercent, fitPixelsPerSecond);
  const next = direction === "in" ? current * ZOOM_IN_FACTOR : current * ZOOM_OUT_FACTOR;
  return clampTimelineZoomPercent(next, fitPixelsPerSecond);
}

export function getPinchTimelineZoomPercent(
  deltaY: number,
  zoomMode: ZoomMode,
  manualZoomPercent: number,
  fitPixelsPerSecond: number,
): number {
  const current = getTimelineZoomPercent(zoomMode, manualZoomPercent, fitPixelsPerSecond);
  if (!Number.isFinite(deltaY) || deltaY === 0) return current;
  return clampTimelineZoomPercent(
    current * Math.exp(-deltaY * PINCH_ZOOM_SENSITIVITY),
    fitPixelsPerSecond,
  );
}

const LOG_MIN = Math.log(MIN_TIMELINE_ZOOM_PERCENT);

/**
 * Maps the frame-level zoom range to a slider position (0–100) using a log scale.
 * Linear would compress the useful low end into a tiny sliver of the slider.
 */
export function timelineZoomPercentToSlider(percent: number, fitPixelsPerSecond: number): number {
  const clamped = clampTimelineZoomPercent(percent, fitPixelsPerSecond);
  const logMax = Math.log(getMaxTimelineZoomPercent(fitPixelsPerSecond));
  return ((Math.log(clamped) - LOG_MIN) / (logMax - LOG_MIN)) * 100;
}

/**
 * Maps a slider position (0–100) to the frame-level zoom range using a log scale.
 * Inverse of `timelineZoomPercentToSlider`.
 */
export function timelineSliderToZoomPercent(slider: number, fitPixelsPerSecond: number): number {
  const clampedSlider = Math.max(0, Math.min(100, slider));
  const logMax = Math.log(getMaxTimelineZoomPercent(fitPixelsPerSecond));
  const logValue = LOG_MIN + (clampedSlider / 100) * (logMax - LOG_MIN);
  return clampTimelineZoomPercent(Math.exp(logValue), fitPixelsPerSecond);
}

export interface ClipTimeSpan {
  start: number;
  end: number;
}

export interface SelectedClipsZoom {
  start: number;
  end: number;
  zoomPercent: number;
}

/** Union of clips with a positive duration. Zero-length entries are not a range. */
export function positiveClipSpan(
  clips: readonly ClipTimeSpan[],
): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const clip of clips) {
    if (!Number.isFinite(clip.start) || !Number.isFinite(clip.end) || !(clip.end > clip.start)) {
      continue;
    }
    if (clip.start < start) start = clip.start;
    if (clip.end > end) end = clip.end;
  }
  if (!Number.isFinite(start) || !(end > start)) return null;
  return { start, end };
}

export function zoomToSelectedClips(input: {
  clips: readonly ClipTimeSpan[];
  viewportWidth: number;
  contentOrigin: number;
  fitPixelsPerSecond: number;
  marginPx?: number;
}): SelectedClipsZoom | null {
  const margin = input.marginPx ?? TIMELINE_RANGE_MARGIN_PX;
  const span = positiveClipSpan(input.clips);
  const fitPps = input.fitPixelsPerSecond;
  const viewport = input.viewportWidth;
  const origin = input.contentOrigin;
  if (!span) return null;
  if (!Number.isFinite(fitPps) || !(fitPps > 0)) return null;
  // A collapsed timeline is no wider than its headers, so there is no track to fit.
  if (!Number.isFinite(viewport) || !Number.isFinite(origin) || !(viewport > origin)) return null;

  const usable = Math.max(1, viewport - origin - margin * 2);
  const zoomPercent = clampTimelineZoomPercent(
    (usable / (span.end - span.start) / fitPps) * 100,
    fitPps,
  );
  return { start: span.start, end: span.end, zoomPercent };
}
