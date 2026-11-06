interface TimedSample {
  time: number;
  value: number;
}

// After Effects convention (ease named by the keyframe side it acts on):
//   Easy Ease     — slow at both ends (cubic-bezier 0.333,0 0.667,1)
//   Easy Ease In   — eases *into* the keyframe → decelerates → slow at the END
//   Easy Ease Out  — eases *out of* the keyframe → accelerates → slow at the START
// The control-point y values must match that polarity (a flat tangent at the
// slow side): slow-end pins CP2 at y=1, slow-start pins CP1 at y=0.
const AE_EASE = "custom(M0,0 C0.333,0 0.667,1 1,1)";
const AE_EASE_IN = "custom(M0,0 C0.333,0.333 0.667,1 1,1)";
const AE_EASE_OUT = "custom(M0,0 C0.333,0 0.667,0.667 1,1)";
const VELOCITY_THRESHOLD = 0.3;

function averageSpeed(samples: TimedSample[], from: number, to: number): number {
  const seg = samples.filter((s) => s.time >= from && s.time <= to);
  if (seg.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < seg.length; i++) {
    const dt = seg[i].time - seg[i - 1].time;
    if (dt > 0) total += Math.abs(seg[i].value - seg[i - 1].value) / dt;
  }
  return total / (seg.length - 1);
}

function speedAtEdge(
  samples: TimedSample[],
  t: number,
  window: number,
  side: "start" | "end",
): number {
  const near = samples.filter((s) =>
    side === "start" ? s.time >= t && s.time <= t + window : s.time >= t - window && s.time <= t,
  );
  if (near.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < near.length; i++) {
    const dt = near[i].time - near[i - 1].time;
    if (dt > 0) total += Math.abs(near[i].value - near[i - 1].value) / dt;
  }
  return total / (near.length - 1);
}

export interface FittedKeyframe {
  percentage: number;
  properties: Record<string, number | string>;
  ease?: string;
}

/**
 * Analyze velocity profile of raw samples between keyframes and assign
 * per-keyframe eases based on deceleration/acceleration patterns.
 *
 * For each segment between consecutive keyframes:
 * - Constant speed → linear ("none")
 * - Decelerates at end → Easy Ease In
 * - Accelerates from start → Easy Ease Out
 * - Both → Easy Ease (full)
 */
// fallow-ignore-next-line complexity
export function fitEasesFromVelocity(
  keyframes: FittedKeyframe[],
  rawSamples: { time: number; properties: Record<string, number> }[],
  totalDuration: number,
): FittedKeyframe[] {
  if (keyframes.length < 2 || rawSamples.length < 3) return keyframes;

  const result = [...keyframes.map((kf) => ({ ...kf }))];

  for (let i = 1; i < result.length; i++) {
    const prevPct = result[i - 1].percentage;
    const currPct = result[i].percentage;
    const segStart = (prevPct / 100) * totalDuration;
    const segEnd = (currPct / 100) * totalDuration;
    const segDur = segEnd - segStart;
    if (segDur <= 0) continue;

    // Use the dominant property (largest range) for velocity analysis
    const props = Object.keys(result[i].properties);
    let bestProp = props[0] ?? "x";
    let bestRange = 0;
    for (const p of props) {
      const startVal = Number(result[i - 1].properties[p] ?? 0);
      const endVal = Number(result[i].properties[p] ?? 0);
      const range = Math.abs(endVal - startVal);
      if (range > bestRange) {
        bestRange = range;
        bestProp = p;
      }
    }

    const propSamples: TimedSample[] = rawSamples
      .filter((s) => s.time >= segStart && s.time <= segEnd)
      .map((s) => ({ time: s.time, value: s.properties[bestProp] ?? 0 }));

    if (propSamples.length < 3) continue;

    const edgeWindow = segDur * 0.25;
    const avgSpd = averageSpeed(propSamples, segStart, segEnd);
    if (avgSpd < 1e-6) continue;

    const startSpd = speedAtEdge(propSamples, segStart, edgeWindow, "start");
    const endSpd = speedAtEdge(propSamples, segEnd, edgeWindow, "end");

    const slowStart = startSpd / avgSpd < VELOCITY_THRESHOLD;
    const slowEnd = endSpd / avgSpd < VELOCITY_THRESHOLD;

    if (slowStart && slowEnd) {
      result[i].ease = AE_EASE;
    } else if (slowEnd) {
      result[i].ease = AE_EASE_IN;
    } else if (slowStart) {
      result[i].ease = AE_EASE_OUT;
    }
    // Otherwise leave ease undefined → linear (constant speed)
  }

  return result;
}
