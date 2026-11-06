import type { TimelineElement } from "../store/playerStore";

/**
 * Pure gap math for a single timeline display lane (CapCut/Premiere-style
 * "Close gap" / "Close all gaps"). Operates on the DISPLAY element set the
 * timeline renders for one lane — the caller passes the clips of the
 * right-clicked lane only; cross-lane behavior is out of scope by design.
 *
 * Conventions:
 * - A clip occupies the half-open interval [start, start + duration).
 * - Comparisons are epsilon-tolerant ({@link TRACK_GAP_EPSILON_S}) so float
 *   drift (e.g. 8.4 + 2.7 = 11.100000000000001) never fabricates a sliver gap.
 * - Computed starts are rounded to millisecond precision, matching the drag
 *   commit's `round3`.
 */
export const TRACK_GAP_EPSILON_S = 1e-3;

const keyOf = (e: TimelineElement) => e.key ?? e.id;

/** The lane's time ORIGIN — the earliest start a clip on this lane may take. */
export function laneGapFloor(_elements: readonly TimelineElement[]): number {
  return 0;
}
export const round3 = (v: number) => Math.round(v * 1000) / 1000;
const endOf = (e: TimelineElement) => e.start + e.duration;

/** Lane clips sorted by start (key as a deterministic tie-break). */
export function sortedLaneClips(elements: readonly TimelineElement[]): TimelineElement[] {
  return [...elements].sort((a, b) => a.start - b.start || keyOf(a).localeCompare(keyOf(b)));
}

export interface TrackGapAt {
  /** Gap left edge: the max end of the clips left of the point (0 for the leading gap). */
  gapStart: number;
  /** Gap right edge: the start of the next clip on the lane. */
  gapEnd: number;
  /** Keys of the next clip and every clip after it on the lane, in start order. */
  followingKeys: string[];
}

/**
 * Resolve the gap under a right-clicked point on one lane.
 *
 * Returns null when the point sits inside a clip, when there is no clip to the
 * right of the point (nothing to close), or when the neighbouring clips are
 * epsilon-adjacent (no real gap).
 */
export function resolveTrackGapAt(
  elements: readonly TimelineElement[],
  time: number,
  epsilon: number = TRACK_GAP_EPSILON_S,
  floor: number = 0,
): TrackGapAt | null {
  const clips = sortedLaneClips(elements);
  // Point inside a clip's half-open [start, end) → not empty space.
  const occupied = clips.some((c) => time >= c.start - epsilon && time < endOf(c) - epsilon);
  if (occupied) return null;

  const following = clips.filter((c) => c.start > time - epsilon);
  if (following.length === 0) return null; // nothing to the right — nothing to close

  const gapEnd = following[0].start;
  // Max end among clips left of the point (they all end at/before it since the
  // point is unoccupied); the lane floor for the leading gap before the first
  // clip (0 for ordinary lanes, the host window start for expanded children).
  const gapStart = Math.max(
    floor,
    ...clips.filter((c) => c.start <= time - epsilon).map((c) => endOf(c)),
  );
  if (gapEnd - gapStart <= epsilon) return null; // epsilon-adjacent — no gap

  return { gapStart, gapEnd, followingKeys: following.map(keyOf) };
}

export interface TrackGapShift {
  key: string;
  newStart: number;
}

/** An empty interval on the lane, [start, end) in seconds. */
export interface TrackGapInterval {
  start: number;
  end: number;
}

/**
 * Every CURRENT empty interval on the lane, leading gap included — the regions
 * "Close all gaps" would collapse, in left-to-right order. Purely descriptive
 * (for the hover-highlight overlay): unlike {@link resolveAllTrackGaps} it
 * reports the gaps as they are now, not the post-compaction clip starts.
 * Overlapping clips never fabricate a negative interval (the cursor tracks the
 * max end seen so far).
 */
export function resolveAllGapIntervals(
  elements: readonly TimelineElement[],
  epsilon: number = TRACK_GAP_EPSILON_S,
  floor: number = 0,
): TrackGapInterval[] {
  const gaps: TrackGapInterval[] = [];
  let cursor = floor;
  for (const clip of sortedLaneClips(elements)) {
    if (clip.start - cursor > epsilon) gaps.push({ start: cursor, end: clip.start });
    cursor = Math.max(cursor, endOf(clip));
  }
  return gaps;
}

/**
 * Compact the whole lane: every clip lands at the sum of the durations of the
 * clips before it (contiguous from 0, order and durations preserved).
 * Overlapping clips (spill lanes) are serialized in start order — sane, if
 * lossy for deliberate overlaps; the display lane set should not contain them.
 *
 * Returns ONLY the clips whose start actually changes (beyond epsilon).
 */
export function resolveAllTrackGaps(
  elements: readonly TimelineElement[],
  epsilon: number = TRACK_GAP_EPSILON_S,
  floor: number = 0,
): TrackGapShift[] {
  const shifts: TrackGapShift[] = [];
  let cursor = floor;
  for (const clip of sortedLaneClips(elements)) {
    const newStart = round3(cursor);
    if (Math.abs(newStart - clip.start) > epsilon) {
      shifts.push({ key: keyOf(clip), newStart });
    }
    cursor += clip.duration;
  }
  return shifts;
}

/**
 * Every empty interval on the lane across the FULL rendered extent `[0, end)`:
 * the closable gaps plus the open region after the last clip. Powers the
 * click-selected lane highlight ("light the whole track except the clips") —
 * unlike {@link resolveAllGapIntervals} it is not limited to what a gap-close
 * could collapse.
 */
export function resolveLaneEmptyIntervals(
  elements: readonly TimelineElement[],
  end: number,
  epsilon: number = TRACK_GAP_EPSILON_S,
  floor: number = 0,
): TrackGapInterval[] {
  const gaps = resolveAllGapIntervals(elements, epsilon, floor);
  const maxEnd = Math.max(floor, ...elements.map(endOf));
  if (end - maxEnd > epsilon) gaps.push({ start: maxEnd, end });
  return gaps;
}

/** Whether the lane has any gap "Close all gaps" would collapse. */
export function trackHasGaps(
  elements: readonly TimelineElement[],
  epsilon: number = TRACK_GAP_EPSILON_S,
  floor: number = 0,
): boolean {
  return resolveAllTrackGaps(elements, epsilon, floor).length > 0;
}

/**
 * Per-clip shifts for closing ONE gap: the next clip and every clip after it
 * on the lane move left by the gap's width. Starts are clamped at 0 (float
 * safety; real shifts never cross the gap's own left edge).
 */
export function resolveCloseGapShifts(
  elements: readonly TimelineElement[],
  gap: TrackGapAt,
): TrackGapShift[] {
  const width = gap.gapEnd - gap.gapStart;
  const followSet = new Set(gap.followingKeys);
  return sortedLaneClips(elements)
    .filter((c) => followSet.has(keyOf(c)))
    .map((c) => ({ key: keyOf(c), newStart: Math.max(gap.gapStart, round3(c.start - width)) }));
}
