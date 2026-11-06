import type { TimelineElement } from "../store/playerStore";
import type { TimelineSnapType } from "./timelineSnapping";
import type { BlockedTimelineEditIntent } from "./timelineEditing";

/* ── Shared clip-drag state types ───────────────────────────────── */
export interface DraggedClipState {
  /** Pointer captured by the viewport coordinator; null for a keyboard pickup. */
  pointerId: number | null;
  element: TimelineElement;
  originClientX: number;
  originClientY: number;
  originScrollLeft: number;
  originScrollTop: number;
  pointerClientX: number;
  pointerClientY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  previewStart: number;
  previewTrack: number;
  /**
   * The lane the POINTER aims at, before the kind-zone clamp picks `previewTrack`.
   * The commit reads it to tell a deliberate vertical lane change (stacking sync
   * allowed) from a horizontal drag. Absent: the commit falls back to `previewTrack`.
   */
  desiredTrack?: number;
  /**
   * When non-null, the drop inserts a NEW track at this visual row boundary
   * (0 = above the top lane, trackOrder.length = below the bottom) instead of
   * landing on previewTrack. Drives the opened preview lane.
   */
  insertRow: number | null;
  /** Snap target the clip will land on, for the guide highlight. */
  snapTime: number | null;
  snapType: TimelineSnapType | null;
  started: boolean;
  altKey?: boolean;
}

export interface ResizingClipState {
  /** Pointer captured by the stable viewport coordinator for this gesture. */
  pointerId: number;
  element: TimelineElement;
  edge: "start" | "end";
  originClientX: number;
  /**
   * scrollLeft at gesture start. Edge auto-scroll moves the content under a
   * stationary pointer, so the trim math folds (current − origin) scrollLeft
   * into the pointer x — mirroring resolveTimelineMove's scroll compensation.
   * Optional so pre-existing constructors/tests stay valid; when absent the
   * first preview update captures the current scrollLeft.
   */
  originScrollLeft?: number;
  previewStart: number;
  previewDuration: number;
  previewPlaybackStart?: number;
  /** Snap target the trimmed edge landed on, for the guide highlight. */
  snapTime?: number | null;
  snapType?: TimelineSnapType | null;
  /** Coordinator-owned group projection; canonical elements change only on commit. */
  groupPreview?: readonly {
    key: string;
    start: number;
    duration: number;
    playbackStart?: number;
  }[];
  started: boolean;
  altKey?: boolean;
}

export interface BlockedClipState {
  pointerId: number;
  element: TimelineElement;
  intent: BlockedTimelineEditIntent;
  originClientX: number;
  originClientY: number;
  started: boolean;
}
