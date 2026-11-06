/**
 * Pure move-vs-resize decision + absolute-time remap for keyframe drag-to-retime.
 *
 * Keyframes live inside the ANIMATION's window (tween position + duration), which
 * is usually shorter than the clip. Dragging a keyframe is one of:
 *   - MOVE: the drop stays within `[tweenStart, tweenEnd]` → re-key the tween-%.
 *   - RESIZE: the drop crosses the tween boundary (the LAST keyframe past the end,
 *     or the FIRST before the start, but still inside the clip — the gesture layer
 *     already clamped to neighbours + clip). The tween's window grows so the
 *     dragged keyframe lands exactly where dropped; every OTHER keyframe keeps its
 *     ABSOLUTE time (its tween-% remaps onto the new, longer window). Value + ease
 *     are preserved per keyframe.
 *
 * Kept pure (no React/store/GSAP) so the trickiest math is unit-testable. The
 * caller supplies the resolved tween window + the drop's absolute time.
 */
import { progressAtTime, timeAtProgress } from "../../utils/gsapKeyframeEases";

export interface RetimeKeyframe {
  /** Tween-relative percentage (the writer/runtime key on this). */
  percentage: number;
  properties: Record<string, number | string>;
  ease?: string;
}

/** One existing keyframe's old→new tween-% under a resize remap. */
export interface KeyframePctRemap {
  /** The existing keyframe's current tween-relative %. */
  from: number;
  /** Its new tween-relative % on the resized window. */
  to: number;
}

export interface KeyframeRetimeResult {
  kind: "noop" | "move" | "resize";
  /** MOVE: tween-relative drop position. */
  toTweenPct?: number;
  /** RESIZE: new tween position (absolute seconds). */
  position?: number;
  /** RESIZE: new tween duration (seconds). */
  duration?: number;
  /**
   * RESIZE: each existing keyframe's old→new tween-%. The commit re-keys each
   * keyframe IN PLACE (round-tripping its value node), so `_auto`, per-keyframe
   * `ease`, `easeEach`, and the outer tween `ease` all survive — unlike rebuilding
   * a fresh keyframes array.
   */
  pctRemap?: KeyframePctRemap[];
}

/** Below this (tween-%) a move resolves onto the source keyframe → skip the write. */
const NOOP_EPSILON_PCT = 0.1;
/** Slack (seconds) for the within-tween boundary test. */
const EPSILON_TIME = 1e-4;
/** Smallest authored tween window; avoids sub-millisecond/round-to-zero durations. */
const MIN_TWEEN_DURATION = 0.01;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Resolve timing for a flat tween's synthesized start/end diamond. */
function resolveFlatTweenBoundaryRetime(opts: {
  keyframeCount: number;
  draggedTweenPct: number;
  tweenStart: number;
  tweenEnd: number;
  dropAbsTime: number;
}): KeyframeRetimeResult | null {
  const { keyframeCount, draggedTweenPct, tweenStart, tweenEnd, dropAbsTime } = opts;
  if (keyframeCount > 0) return null;
  // Flat tweens have only synthesized boundary diamonds. Never delegate an
  // unexpected interior percentage to the authored-keyframe move path.
  if (draggedTweenPct !== 0 && draggedTweenPct !== 100) return { kind: "noop" };
  const draggedTime = draggedTweenPct === 0 ? tweenStart : tweenEnd;
  if (Math.abs(dropAbsTime - draggedTime) <= EPSILON_TIME) return { kind: "noop" };
  const newStart = draggedTweenPct === 0 ? dropAbsTime : tweenStart;
  const newEnd = draggedTweenPct === 100 ? dropAbsTime : tweenEnd;
  const newDuration = newEnd - newStart;
  if (newDuration < MIN_TWEEN_DURATION) return { kind: "noop" };
  return {
    kind: "resize",
    position: round3(newStart),
    duration: round3(newDuration),
    pctRemap: [],
  };
}

/**
 * Decide move vs resize for a dragged keyframe and, for resize, return the new
 * tween window + remapped keyframes.
 *
 * - `keyframes`: the tween's keyframes (tween-relative %, with value + ease).
 * - `draggedTweenPct`: identifies which keyframe is being dragged (closest match).
 * - `tweenStart` / `tweenDuration`: the tween's resolved absolute window.
 * - `dropAbsTime`: the drop's absolute time (handler converts clip-% → seconds).
 * - `runEase`: the tween's run ease, which decides when each keyframe plays.
 */
export function resolveKeyframeRetime(opts: {
  keyframes: ReadonlyArray<RetimeKeyframe>;
  draggedTweenPct: number;
  tweenStart: number;
  tweenDuration: number;
  dropAbsTime: number;
  runEase?: string;
}): KeyframeRetimeResult {
  const { keyframes, draggedTweenPct, tweenStart, tweenDuration, dropAbsTime, runEase } = opts;
  if (tweenDuration <= 0) return { kind: "noop" };
  const tweenEnd = tweenStart + tweenDuration;

  // A flat tween's synthesized diamonds are its real start/end boundaries —
  // there is no authored keyframe node to re-key. Moving either boundary must
  // therefore resize the tween window while keeping the opposite endpoint at
  // its absolute time. Returning `resize` with an empty remap lets the caller
  // update the flat tween's position/duration instead of sending a keyframe
  // mutation that would silently no-op.
  const flatBoundary = resolveFlatTweenBoundaryRetime({
    keyframeCount: keyframes.length,
    draggedTweenPct,
    tweenStart,
    tweenEnd,
    dropAbsTime,
  });
  if (flatBoundary) return flatBoundary;

  // Within the tween window → plain move (re-key the tween-%).
  if (dropAbsTime >= tweenStart - EPSILON_TIME && dropAbsTime <= tweenEnd + EPSILON_TIME) {
    // Round here, not at the return: the no-op test below and the value written
    // to source must be the same number. The resize branch already rounds, so
    // this keeps both write paths at the authored 3dp precision.
    const dropTimePct = clamp(((dropAbsTime - tweenStart) / tweenDuration) * 100, 0, 100);
    const toTweenPct = round3(progressAtTime(runEase, dropTimePct));
    if (Math.abs(toTweenPct - draggedTweenPct) < NOOP_EPSILON_PCT) return { kind: "noop" };
    return { kind: "move", toTweenPct };
  }

  // Boundary resize needs the real keyframes to remap. Flat start/end boundaries
  // were handled above.
  if (keyframes.length === 0) return { kind: "noop" };

  const newStart = Math.min(dropAbsTime, tweenStart);
  const newEnd = Math.max(dropAbsTime, tweenEnd);
  const newDuration = Math.max(MIN_TWEEN_DURATION, newEnd - newStart);

  // The dragged keyframe is the one whose tween-% is closest to draggedTweenPct.
  let draggedIdx = 0;
  let best = Infinity;
  keyframes.forEach((kf, i) => {
    const d = Math.abs(kf.percentage - draggedTweenPct);
    if (d < best) {
      best = d;
      draggedIdx = i;
    }
  });

  // Map each existing keyframe to its new tween-% on the grown window, preserving
  // its absolute time (the dragged one lands at the drop). Carry only the old→new
  // percentages; the commit re-keys in place so value + ease + _auto + easeEach
  // survive verbatim (no rebuilt keyframes array).
  const pctRemap: KeyframePctRemap[] = keyframes.map((kf, i) => {
    const absTime =
      i === draggedIdx
        ? dropAbsTime
        : tweenStart + (timeAtProgress(runEase, kf.percentage) / 100) * tweenDuration;
    const newTimePct = ((absTime - newStart) / newDuration) * 100;
    return { from: kf.percentage, to: round3(progressAtTime(runEase, newTimePct)) };
  });

  return {
    kind: "resize",
    position: round3(newStart),
    duration: round3(newDuration),
    pctRemap,
  };
}
