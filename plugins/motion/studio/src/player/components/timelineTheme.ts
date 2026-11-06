import type { TimelineElement } from "../store/playerStore";

export const CLIP_TRIM_HIT_PX = 14;

export interface TimelineTrackStyle {
  clip: string;
  accent: string;
  label: string;
  clipActive?: string;
}

export interface TimelineTheme {
  shellBackground: string;
  shellBorder: string;
  rulerBorder: string;
  rowBackground: string;
  rowBorder: string;
  gutterBackground: string;
  gutterBorder: string;
  textPrimary: string;
  textSecondary: string;
  tickText: string;
  tickMajor: string;
  tickMinor: string;
  clipBackground: string;
  clipBackgroundActive: string;
  clipBackgroundHover: string;
  clipBackgroundDragging: string;
  clipBorder: string;
  clipBorderHover: string;
  clipBorderActive: string;
  handleColor: string;
  panelResizeSeam: string;
  panelResizeActive: string;
  clipRadius: string;
  audioClipRadius: string;
  transitionZone: string;
  transitionBadge: string;
  transitionBadgeInk: string;
}

const TRACK_STYLE: TimelineTrackStyle = {
  clip: "var(--timeline-track-clip-fill)",
  clipActive: "var(--timeline-track-clip-active)",
  accent: "var(--color-accent)",
  label: "var(--timeline-track-label)",
};

// Every field reads a CSS custom property (declared in styles/theme.css)
// rather than a literal, so a host themes the timeline the same way it
// themes the rest of Studio: by overriding the token, not this object.
export const defaultTimelineTheme: TimelineTheme = {
  shellBackground: "var(--timeline-shell-bg)",
  shellBorder: "var(--timeline-shell-border)",
  rulerBorder: "var(--timeline-ruler-border)",
  rowBackground: "var(--timeline-row-bg)",
  rowBorder: "var(--timeline-row-border)",
  gutterBackground: "var(--timeline-gutter-bg)",
  gutterBorder: "var(--timeline-gutter-border)",
  textPrimary: "var(--timeline-text-primary)",
  textSecondary: "var(--timeline-text-secondary)",
  tickText: "var(--timeline-tick-text)",
  tickMajor: "var(--timeline-tick-major)",
  tickMinor: "var(--timeline-tick-minor)",
  clipBackground: "var(--timeline-clip-bg)",
  clipBackgroundActive: "var(--timeline-clip-bg-active)",
  clipBackgroundHover: "var(--timeline-clip-bg-hover)",
  clipBackgroundDragging: "var(--timeline-clip-bg-dragging)",
  clipBorder: "var(--timeline-clip-border)",
  clipBorderHover: "var(--timeline-clip-border-hover)",
  clipBorderActive: "var(--timeline-clip-border-active)",
  handleColor: "var(--timeline-handle)",
  panelResizeSeam: "var(--timeline-resize-seam)",
  panelResizeActive: "var(--timeline-resize-active)",
  clipRadius: "var(--timeline-clip-radius)",
  audioClipRadius: "var(--timeline-clip-audio-radius)",
  transitionZone: "var(--timeline-transition-zone)",
  transitionBadge: "var(--timeline-transition-badge)",
  transitionBadgeInk: "var(--timeline-transition-badge-ink)",
};

export type ClipWidthLadder = "labeled" | "picture" | "frame";

/** Label chip from 60px. Under 24px the clip is one cropped frame. */
export function clipWidthLadder(widthPx: number): ClipWidthLadder {
  if (widthPx < 24) return "frame";
  if (widthPx < 60) return "picture";
  return "labeled";
}

export function getTimelineTrackStyle(_tag: string): TimelineTrackStyle {
  return TRACK_STYLE;
}

export function getClipHandleOpacity({
  isHovered,
  isSelected,
  isDragging,
}: {
  isHovered: boolean;
  isSelected: boolean;
  isDragging: boolean;
}): number {
  if (isDragging) return 0.95;
  if (isSelected) return 0.82;
  if (isHovered) return 0.76;
  return 0;
}

export function getRenderedTimelineElement({
  element,
  draggedElementId,
  previewStart,
  previewTrack,
}: {
  element: TimelineElement;
  draggedElementId: string | null;
  previewStart: number | null;
  previewTrack: number | null;
}): TimelineElement {
  if (
    (element.key ?? element.id) !== draggedElementId ||
    previewStart === null ||
    previewTrack === null
  ) {
    return element;
  }
  return {
    ...element,
    start: previewStart,
    track: previewTrack,
  };
}
