import { RULER_H, type TimelineRowGeometry } from "./timelineLayout";
import { TIMELINE_VIEWPORT_BUDGETS } from "../lib/timelineViewportBudgets";
import type { TimelineTimeRange } from "../lib/timelineClipIndex";
import type { TimelineScrollViewportSnapshot } from "./useTimelineScrollViewport";

export function getTimelineRenderTimeRange(
  viewport: Pick<TimelineScrollViewportSnapshot, "scrollLeft" | "clientWidth">,
  pixelsPerSecond: number,
  contentOrigin: number,
  duration: number,
): TimelineTimeRange {
  if (!(pixelsPerSecond > 0) || !(duration > 0) || !(viewport.clientWidth > 0)) {
    return { start: 0, end: 0 };
  }
  const overscanPx = viewport.clientWidth * TIMELINE_VIEWPORT_BUDGETS.timeOverscanViewportRatio;
  const startPx = viewport.scrollLeft - contentOrigin - overscanPx;
  const endPx = viewport.scrollLeft + viewport.clientWidth - contentOrigin + overscanPx;
  return {
    start: Math.min(duration, Math.max(0, startPx / pixelsPerSecond)),
    end: Math.min(duration, Math.max(0, endPx / pixelsPerSecond)),
  };
}

export function getTimelineVisibleTimeRange(
  viewport: Pick<TimelineScrollViewportSnapshot, "scrollLeft" | "clientWidth">,
  pixelsPerSecond: number,
  contentOrigin: number,
  duration: number,
): { start: number; end: number } {
  if (!(pixelsPerSecond > 0) || !(duration > 0)) return { start: 0, end: 0 };
  const start = Math.max(0, (viewport.scrollLeft - contentOrigin) / pixelsPerSecond);
  const end = Math.min(
    duration,
    Math.max(start, (viewport.scrollLeft + viewport.clientWidth - contentOrigin) / pixelsPerSecond),
  );
  return { start: Math.min(start, duration), end };
}

export function getTimelineScrollTopForGeometryChange(
  previous: TimelineRowGeometry,
  next: TimelineRowGeometry,
  scrollTop: number,
  dragAutoScrollOwnsScrollTop = false,
): number {
  const atTopSoRowsAddedAboveStayShown = scrollTop <= 0;
  if (dragAutoScrollOwnsScrollTop || atTopSoRowsAddedAboveStayShown) return scrollTop;
  const anchor = previous.getRowPositionFromY(scrollTop + RULER_H);
  if (anchor.row < 0 || anchor.row >= previous.rowKeys.length) return scrollTop;
  const anchorKey = previous.rowKeys[anchor.row];
  if (anchorKey === undefined) return scrollTop;
  const nextRow = next.getRowIndex(anchorKey);
  if (nextRow < 0) return scrollTop;
  return Math.max(0, scrollTop + next.getRowTop(nextRow) - previous.getRowTop(anchor.row));
}
