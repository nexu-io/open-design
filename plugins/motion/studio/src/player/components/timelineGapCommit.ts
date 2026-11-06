import type { TimelineElement } from "../store/playerStore";
import { getTimelineEditCapabilities } from "./timelineEditing";
import {
  persistMoveEdits,
  type DragCommitDeps,
  type TimelineMoveEdit,
} from "./timelineClipDragCommit";
import {
  laneGapFloor,
  resolveAllTrackGaps,
  resolveCloseGapShifts,
  resolveTrackGapAt,
  round3,
  TRACK_GAP_EPSILON_S,
  type TrackGapShift,
} from "./timelineGaps";
import { isMainTrackElement } from "./timelineZones";

/**
 * Commit layer for the track-gap context menu ("Close gap" / "Close all gaps").
 *
 * Each action is ONE atomic {@link persistMoveEdits} batch — pure time moves
 * (`updates.track === element.track`, no authored-track rewrite) tagged with a
 * per-gesture-unique coalesce key, so an action is exactly one undo entry and
 * flows through the existing move pipeline (optimistic store apply + rollback,
 * SDK fast path, patchIframeDomTiming preview).
 *
 * Refusal rule: if ANY clip that must shift is unmovable
 * ({@link getTimelineEditCapabilities}.canMove === false), the whole action is
 * refused — never a partial compaction. The menu disables the item via
 * {@link canShiftTrackGapClips}; the commit re-checks as defense in depth.
 */

const keyOf = (e: TimelineElement) => e.key ?? e.id;

// Per-gesture-unique coalesce key. A monotonic counter — NOT Date.now() /
// Math.random() (determinism rules) — mirrors laneChangeGestureSeq in
// timelineClipDragCommit.ts.
let gapCloseGestureSeq = 0;

/** Resolve each shift to its named element, dropping any shift whose key
 *  matches nothing — the type stays honest without a non-null assertion. */
export function resolveShiftedElements(
  elements: readonly TimelineElement[],
  shifts: readonly TrackGapShift[],
): Array<{ element: TimelineElement; start: number }> {
  const byKey = new Map(elements.map((e) => [keyOf(e), e]));
  return shifts.flatMap((s) => {
    const element = byKey.get(s.key);
    return element ? [{ element, start: s.newStart }] : [];
  });
}

/** True when every shift names a real clip that may be time-moved. */
export function canShiftTrackGapClips(
  laneElements: readonly TimelineElement[],
  shifts: readonly TrackGapShift[],
): boolean {
  const resolved = resolveShiftedElements(laneElements, shifts);
  return (
    resolved.length === shifts.length &&
    resolved.every((r) => getTimelineEditCapabilities(r.element).canMove)
  );
}

function buildShiftEdits(
  laneElements: readonly TimelineElement[],
  shifts: readonly TrackGapShift[],
): TimelineMoveEdit[] | null {
  if (shifts.length === 0 || !canShiftTrackGapClips(laneElements, shifts)) return null;
  return resolveShiftedElements(laneElements, shifts).map(({ element, start }) => ({
    element,
    updates: { start, track: element.track },
  }));
}

function commitShifts(
  laneElements: readonly TimelineElement[],
  shifts: readonly TrackGapShift[],
  deps: DragCommitDeps,
): boolean {
  const edits = buildShiftEdits(laneElements, shifts);
  if (!edits) return false;
  void persistMoveEdits(edits, deps, `track-gap-close:${gapCloseGestureSeq++}`);
  return true;
}

/**
 * Close the ONE gap under `time` on the lane: the next clip and every clip
 * after it on that lane shift left by the gap's width. Returns false (and
 * writes nothing) when there is no gap at the point or a shifting clip is
 * unmovable.
 */
export function commitCloseTrackGap(
  laneElements: readonly TimelineElement[],
  time: number,
  deps: DragCommitDeps,
): boolean {
  const gap = resolveTrackGapAt(laneElements, time, undefined, laneGapFloor(laneElements));
  if (!gap) return false;
  return commitShifts(laneElements, resolveCloseGapShifts(laneElements, gap), deps);
}

/**
 * Compact the whole lane (leading gap included): clips become contiguous from
 * 0, order and durations preserved. Returns false (and writes nothing) when
 * the lane has no gaps or a shifting clip is unmovable.
 */
export function commitCloseAllTrackGaps(
  laneElements: readonly TimelineElement[],
  deps: DragCommitDeps,
): boolean {
  return commitShifts(
    laneElements,
    resolveAllTrackGaps(laneElements, undefined, laneGapFloor(laneElements)),
    deps,
  );
}

/** What a ripple-edit delete must additionally shift on the main track. Pure
 *  — no IO; the caller persists the shifts itself. Null means nothing to
 *  ripple: off, nothing deleted was on the main track, already gapless, or a
 *  shifting clip is locked (same whole-action refusal as the gap-close menu). */
export function resolveMainTrackDeleteRippleShifts(
  survivingElements: readonly TimelineElement[],
  deletedElements: readonly TimelineElement[],
  rippleEnabled: boolean,
): TrackGapShift[] | null {
  const deletedMainTrack = deletedElements.filter(isMainTrackElement);
  if (!rippleEnabled || deletedMainTrack.length === 0) return null;
  const survivors = survivingElements.filter(isMainTrackElement);
  // Shift each survivor left by the duration of the deleted clips before it —
  // the removed span itself, not a gap re-resolved on the survivors, which
  // can't tell an untouched adjacent gap from the one just opened.
  const shifts: TrackGapShift[] = [];
  for (const survivor of survivors) {
    const width = deletedMainTrack
      .filter((d) => d.start < survivor.start)
      .reduce((sum, d) => sum + d.duration, 0);
    if (width <= 0) continue;
    const newStart = round3(Math.max(laneGapFloor(survivors), survivor.start - width));
    if (Math.abs(newStart - survivor.start) > TRACK_GAP_EPSILON_S) {
      shifts.push({ key: keyOf(survivor), newStart });
    }
  }
  if (shifts.length === 0 || !canShiftTrackGapClips(survivors, shifts)) return null;
  return shifts;
}
