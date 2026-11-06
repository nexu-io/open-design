import { RULER_H, CLIP_Y, TRACK_H, type TimelineRowGeometry } from "./timelineLayout";
import { rectsOverlap, type Rect } from "../../utils/marqueeGeometry";
import { queryTimelineClipIndex, type TimelineClipIndex } from "../lib/timelineClipIndex";
import type { TimelineElement } from "../store/playerStore";

/** Pointer must travel at least this far (either axis) before a pointerdown on
 *  the empty timeline body becomes a marquee drag instead of a plain click. */
export const MARQUEE_DRAG_THRESHOLD_PX = 4;

/** Minimum rendered clip width, mirrors TimelineClip's `Math.max(w, 4)`. */
const MIN_CLIP_W = 4;

export interface MarqueeClipInput {
  id: string;
  start: number;
  duration: number;
  track: number;
}

/**
 * Ruler-vs-body decision for a pointerdown on the timeline scroll container.
 *
 * The ruler is `position: sticky; top: 0` — once the body is scrolled down its
 * VISUAL position stays pinned to the container top while its LAYOUT position
 * scrolls away. The hit test must therefore use VIEWPORT-space y (clientY
 * relative to the scroll container's bounding rect), NOT content-space y
 * (clientY - rect.top + scrollTop), which misclassifies a press on the stuck
 * ruler as a body/marquee press whenever scrollTop > 0.
 */
export function isTimelineRulerPress(
  clientY: number,
  scrollRectTop: number,
  rulerHeight: number = RULER_H,
): boolean {
  return clientY - scrollRectTop < rulerHeight;
}

export function isMarqueeDrag(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  threshold: number = MARQUEE_DRAG_THRESHOLD_PX,
): boolean {
  return Math.abs(currentX - originX) >= threshold || Math.abs(currentY - originY) >= threshold;
}

/** Normalized marquee rect (canvas/content coordinates) from the drag origin and
 *  the current pointer — handles drags in any direction (negative deltas). */
export function getMarqueeRect(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
): Rect {
  return {
    left: Math.min(originX, currentX),
    top: Math.min(originY, currentY),
    width: Math.abs(currentX - originX),
    height: Math.abs(currentY - originY),
  };
}

/**
 * A clip's rendered rect in canvas/content coordinates (the same space the
 * marquee rect lives in): x from the shared content origin + start * pps, y from the clip's row
 * index within the canonical row geometry (cumulative row top + CLIP_Y).
 * Returns null when the clip's track is not currently displayed.
 */
export function getTimelineClipRect(
  clip: Pick<MarqueeClipInput, "start" | "duration" | "track">,
  rowGeometry: TimelineRowGeometry,
  pps: number,
  contentOrigin: number,
): Rect | null {
  const row = rowGeometry.getRowIndex(clip.track);
  if (row < 0 || !Number.isFinite(pps) || pps <= 0) return null;
  return {
    left: contentOrigin + clip.start * pps,
    top: rowGeometry.getRowTop(row) + CLIP_Y,
    width: Math.max(clip.duration * pps, MIN_CLIP_W),
    height: TRACK_H - CLIP_Y * 2,
  };
}

export interface MarqueeSelectionResult {
  /** Every clip id the marquee currently covers (plus the additive base). */
  ids: Set<string>;
  /** The last marquee-hit clip in element order — the primary selection.
   *  Null when the marquee covers nothing new (caller keeps its current primary). */
  primaryId: string | null;
}

/** Narrow a marquee hit test to the intersecting logical rows and time span. */
export function getMarqueeClipCandidates(input: {
  clipIndex: TimelineClipIndex;
  rowGeometry: TimelineRowGeometry;
  marquee: Rect;
  pps: number;
  contentOrigin: number;
}): readonly TimelineElement[] {
  if (!(input.pps > 0) || input.marquee.width <= 0 || input.marquee.height <= 0) return [];
  const lastRow = input.rowGeometry.rowKeys.length - 1;
  const first = Math.max(0, Math.floor(input.rowGeometry.getRowFromY(input.marquee.top)));
  const last = Math.min(
    lastRow,
    Math.floor(input.rowGeometry.getRowFromY(input.marquee.top + input.marquee.height)),
  );
  if (first > last) return [];
  const paddingSeconds = MIN_CLIP_W / input.pps;
  const start = Math.max(
    0,
    (input.marquee.left - input.contentOrigin) / input.pps - paddingSeconds,
  );
  const end =
    (input.marquee.left + input.marquee.width - input.contentOrigin) / input.pps + paddingSeconds;
  if (end <= start) return [];

  const candidates: TimelineElement[] = [];
  for (let row = first; row <= last; row += 1) {
    const rowKey = input.rowGeometry.rowKeys[row];
    if (rowKey === undefined) continue;
    candidates.push(...queryTimelineClipIndex(input.clipIndex, rowKey, { start, end }));
  }
  return candidates;
}

/**
 * Live marquee selection: every clip whose rendered rect intersects the marquee.
 * `baseSelection` (shift/cmd-additive) is unioned in but never affects primaryId.
 */
export function computeMarqueeSelection(input: {
  clips: MarqueeClipInput[];
  rowGeometry: TimelineRowGeometry;
  pps: number;
  contentOrigin: number;
  marquee: Rect;
  baseSelection?: Iterable<string>;
}): MarqueeSelectionResult {
  const ids = new Set<string>(input.baseSelection ?? []);
  let primaryId: string | null = null;
  for (const clip of input.clips) {
    const rect = getTimelineClipRect(clip, input.rowGeometry, input.pps, input.contentOrigin);
    if (rect && rectsOverlap(rect, input.marquee)) {
      ids.add(clip.id);
      primaryId = clip.id;
    }
  }
  return { ids, primaryId };
}
