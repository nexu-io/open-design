import { getTimelineTrackStyle, type TimelineTrackStyle } from "./timelineTheme";

export type TrackVisualStyle = TimelineTrackStyle;

export function getTrackStyle(tag: string): TrackVisualStyle {
  // Defensive: callers may pass an empty/undefined tag; fall back to "div"
  // (restores the #1679 null-guard that a restack had dropped).
  const safeTag = tag || "div";
  return getTimelineTrackStyle(safeTag);
}
