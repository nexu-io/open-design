import type { TimelineElement } from "../store/playerStore";
import { roundToCenti } from "../../utils/rounding";

export type TimelineSnapType = "beat" | "playhead" | "clip-edge" | "grid";

export interface TimelineSnapTarget {
  time: number;
  type: TimelineSnapType;
}

/** The guide the canvas draws: the live move's snap target, else the live trim's. */
export function resolveSnapGuide(
  moving: { started: boolean; snapTime: number | null; snapType: TimelineSnapType | null } | null,
  trimming: { snapTime?: number | null; snapType?: TimelineSnapType | null } | null,
): TimelineSnapTarget | null {
  const source = moving?.started ? moving : trimming;
  if (source?.snapTime == null || source.snapType == null) return null;
  return { time: source.snapTime, type: source.snapType };
}

/** Pixel radius within which a time snaps to a target (matches historical beat snap). */
export const TIMELINE_SNAP_PX = 8;

const TYPE_PRIORITY: Record<TimelineSnapType, number> = {
  playhead: 0,
  "clip-edge": 1,
  beat: 2,
  grid: 3,
};

export function collectTimelineSnapTargets(input: {
  elements: ReadonlyArray<Pick<TimelineElement, "start" | "duration" | "key" | "id">>;
  playheadTime: number | null;
  beatTimes: readonly number[];
  excludeElementKey?: string | null;
}): TimelineSnapTarget[] {
  const byTime = new Map<number, TimelineSnapTarget>();
  const add = (time: number, type: TimelineSnapType) => {
    if (!Number.isFinite(time) || time < 0) return;
    const rounded = Math.round(time * 1000) / 1000;
    const existing = byTime.get(rounded);
    if (!existing || TYPE_PRIORITY[type] < TYPE_PRIORITY[existing.type]) {
      byTime.set(rounded, { time: rounded, type });
    }
  };

  for (const beat of input.beatTimes) add(beat, "beat");
  for (const el of input.elements) {
    if (input.excludeElementKey != null && (el.key ?? el.id) === input.excludeElementKey) continue;
    add(el.start, "clip-edge");
    add(el.start + el.duration, "clip-edge");
  }
  if (input.playheadTime != null) add(input.playheadTime, "playhead");

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

/** Nearest ruler line in range, at its saved centisecond, and only within a pixel of it. */
function nearestGridLine(
  time: number,
  gridStep: number,
  thresholdSecs: number,
): TimelineSnapTarget | null {
  if (!(gridStep > 0)) return null;
  const line = Math.round(time / gridStep) * gridStep;
  const saved = roundToCenti(line);
  const pixelsPerSecond = TIMELINE_SNAP_PX / thresholdSecs;
  if (Math.abs(saved - line) * pixelsPerSecond >= 1) return null;
  return Math.abs(saved - time) < thresholdSecs ? { time: saved, type: "grid" } : null;
}

export function snapTimelineTime(
  time: number,
  targets: readonly TimelineSnapTarget[],
  thresholdSecs: number,
  gridStep = 0,
): { time: number; target: TimelineSnapTarget | null } {
  let best: TimelineSnapTarget | null = null;
  let bestDist = thresholdSecs;
  for (const target of targets) {
    const d = Math.abs(target.time - time);
    if (
      d < bestDist ||
      (d === bestDist && best && TYPE_PRIORITY[target.type] < TYPE_PRIORITY[best.type])
    ) {
      bestDist = d;
      best = target;
    }
  }
  best ??= nearestGridLine(time, gridStep, thresholdSecs);
  return best ? { time: best.time, target: best } : { time, target: null };
}

/**
 * Snap a moved clip so whichever edge (start or end) is nearest a target lands
 * on it, keeping duration fixed. Mirrors the historical beat-snap semantics:
 * clamp to [0, timelineDuration - duration]; if clamping pulls the clip off the
 * target, drop the highlight.
 */
export function snapMoveToTargets(
  start: number,
  duration: number,
  targets: readonly TimelineSnapTarget[],
  pixelsPerSecond: number,
  timelineDuration: number,
  gridStep = 0,
): { start: number; snapTime: number | null; snapType: TimelineSnapType | null } {
  if (targets.length === 0 && !(gridStep > 0)) return { start, snapTime: null, snapType: null };
  const thresholdSecs = TIMELINE_SNAP_PX / Math.max(pixelsPerSecond, 1);
  const startSnap = snapTimelineTime(start, targets, thresholdSecs, gridStep);
  const endSnap = snapTimelineTime(start + duration, targets, thresholdSecs, gridStep);
  // The nearer edge wins, but a grid line only when neither edge has a real target.
  const rank = (snap: typeof startSnap, edgeTime: number) =>
    snap.target === null
      ? Infinity
      : Math.abs(snap.time - edgeTime) + (snap.target.type === "grid" ? thresholdSecs : 0);
  const startRank = rank(startSnap, start);
  const endRank = rank(endSnap, start + duration);

  let candidate = start;
  let target: TimelineSnapTarget | null = null;
  if (startRank !== Infinity && startRank <= endRank) {
    candidate = startSnap.time;
    target = startSnap.target;
  } else if (endRank !== Infinity) {
    candidate = endSnap.time - duration;
    target = endSnap.target;
  }

  const maxStart = Math.max(0, timelineDuration - duration);
  // Round the candidate to ms FIRST, then compare the clamp against that rounded
  // value — not the raw candidate. A frame-quantized duration (e.g. 1/30s, 10/3s)
  // leaves sub-ms residue after rounding that exceeds a 1e-6 tolerance, so comparing
  // the clamp to the raw candidate dropped the snap-line indicator on every snap
  // even though no clamping happened. Comparing against the rounded candidate makes
  // the residue exactly 0 unless the timeline-bounds clamp actually moved the clip.
  const roundedCandidate = Math.round(candidate * 1000) / 1000;
  const clamped = Math.max(0, Math.min(maxStart, roundedCandidate));
  if (target && Math.abs(clamped - roundedCandidate) > 1e-6) target = null;
  return { start: clamped, snapTime: target?.time ?? null, snapType: target?.type ?? null };
}
