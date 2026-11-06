// ponytail: Gaussian-weighted moving average over gesture keyframes.
// Rounds off jittery corners from raw pointer input while preserving
// overall path shape. First/last keyframes are pinned (never moved).
// Upgrade path: Catmull-Rom spline if users need curve-fitted paths.

interface Keyframe {
  percentage: number;
  properties: Record<string, number | string>;
}

function gaussianWeight(distance: number, sigma: number): number {
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

export function smoothGestureKeyframes(keyframes: Keyframe[], radius: number): Keyframe[] {
  if (keyframes.length <= 2 || radius <= 0) return keyframes;
  const sigma = radius / 2;
  const numericKeys = new Set<string>();
  for (const kf of keyframes) {
    for (const [k, v] of Object.entries(kf.properties)) {
      if (typeof v === "number") numericKeys.add(k);
    }
  }
  if (numericKeys.size === 0) return keyframes;

  return keyframes.map((kf, i) => {
    if (i === 0 || i === keyframes.length - 1) return kf;
    const smoothed: Record<string, number | string> = { ...kf.properties };
    for (const key of numericKeys) {
      let weightSum = 0;
      let valueSum = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(keyframes.length - 1, i + radius); j++) {
        const v = keyframes[j].properties[key];
        if (typeof v !== "number") continue;
        // Weight by index distance, not time. Samples here are roughly evenly
        // spaced, so for the small radius (3) this is fine; switch to a
        // percentage-domain distance if the window ever grows much larger.
        const w = gaussianWeight(j - i, sigma);
        weightSum += w;
        valueSum += v * w;
      }
      if (weightSum > 0) smoothed[key] = Math.round((valueSum / weightSum) * 1000) / 1000;
    }
    return { percentage: kf.percentage, properties: smoothed };
  });
}
