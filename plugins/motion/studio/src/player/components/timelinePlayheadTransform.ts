import { getTimelinePlayheadLeft } from "./timelineLayout";

/**
 * Moves the playhead by transform, with no relayout. Playing, it keeps fractional pixels so slow motion stays
 * smooth; at rest it rounds to device pixels the way layout rounds the ruler ticks, so the line sits on its tick.
 */
export function getTimelinePlayheadTransform(
  time: number,
  pixelsPerSecond: number,
  contentOrigin: number,
  atRest: boolean,
  devicePixelRatio = globalThis.devicePixelRatio || 1,
): string {
  const left = getTimelinePlayheadLeft(time, pixelsPerSecond, contentOrigin);
  if (!atRest) return `translateX(${left}px)`;
  return `translateX(${Math.round(left * devicePixelRatio) / devicePixelRatio}px)`;
}
