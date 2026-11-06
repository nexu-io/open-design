/**
 * Ramer-Douglas-Peucker simplification for time-series data.
 *
 * Used to reduce gesture recording samples into a minimal set of keyframes
 * that approximate the original curve within a configurable tolerance.
 */

// ---------------------------------------------------------------------------
// 1D time-series simplification
// ---------------------------------------------------------------------------

/**
 * Perpendicular distance from point (t, v) to the line segment between
 * (t1, v1) and (t2, v2).  For 1D time-series this reduces to the vertical
 * distance from the point to the interpolated value on the line.
 */
function perpendicularDistance(
  t: number,
  v: number,
  t1: number,
  v1: number,
  t2: number,
  v2: number,
): number {
  // Degenerate case: start and end share the same time
  if (t2 === t1) return Math.abs(v - v1);
  const interpolated = v1 + ((v2 - v1) * (t - t1)) / (t2 - t1);
  return Math.abs(v - interpolated);
}

/**
 * Standard Ramer-Douglas-Peucker on 1D time-series data.
 *
 * Each point is treated as (time, value) in 2D space.  Returns the minimal
 * subset of input points that approximates the curve within `epsilon`.
 *
 * - `epsilon = 0` returns all points (no simplification).
 * - A large `epsilon` returns just the first and last points.
 * - Empty or single-point input is returned unchanged.
 */
function simplifyTimeSeries(
  points: Array<{ time: number; value: number }>,
  epsilon: number,
): Array<{ time: number; value: number }> {
  if (points.length <= 2) return points;
  if (epsilon <= 0) return points;

  const first = points[0];
  const last = points[points.length - 1];

  let maxDist = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(
      points[i].time,
      points[i].value,
      first.time,
      first.value,
      last.time,
      last.value,
    );
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyTimeSeries(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyTimeSeries(points.slice(maxIndex), epsilon);
    // left includes maxIndex, right starts with maxIndex — drop the duplicate
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
}

// ---------------------------------------------------------------------------
// Multi-property gesture simplification
// ---------------------------------------------------------------------------

/**
 * Simplify gesture recording samples into percentage-keyed keyframes.
 *
 * Runs `simplifyTimeSeries` independently per property across all samples,
 * then merges the retained time points into a single Map keyed by percentage
 * of `totalDuration` (0–100, rounded to 1 decimal).
 *
 * Independent per-property simplification means that complex motion on one
 * property (e.g. `x`) does not force extra keyframes on a simpler property
 * (e.g. `opacity`).
 *
 * At each retained percentage the output contains all properties interpolated
 * at that time — not just the property that caused the time point to survive.
 */
export function simplifyGestureSamples(
  samples: Array<{ time: number; properties: Record<string, number> }>,
  totalDuration: number,
  epsilon: number | ((key: string) => number),
): Map<number, Record<string, number>> {
  if (samples.length === 0) return new Map();
  if (totalDuration <= 0) return new Map();

  // Collect all property keys present across samples
  const propertyKeys = new Set<string>();
  for (const s of samples) {
    for (const key of Object.keys(s.properties)) {
      propertyKeys.add(key);
    }
  }

  // Run RDP independently per property and collect surviving times
  const survivingTimes = new Set<number>();

  for (const key of propertyKeys) {
    const series: Array<{ time: number; value: number }> = [];
    for (const s of samples) {
      if (key in s.properties) {
        series.push({ time: s.time, value: s.properties[key] });
      }
    }
    const keyEpsilon = typeof epsilon === "function" ? epsilon(key) : epsilon;
    const simplified = simplifyTimeSeries(series, keyEpsilon);
    for (const pt of simplified) {
      survivingTimes.add(pt.time);
    }
  }

  // Sort surviving times so we can iterate in order
  const sortedTimes = Array.from(survivingTimes).sort((a, b) => a - b);

  // For each surviving time, interpolate all properties and store by percentage
  const result = new Map<number, Record<string, number>>();

  for (const t of sortedTimes) {
    const pct = Math.round((t / totalDuration) * 1000) / 10; // 1 decimal
    const props: Record<string, number> = {};

    for (const key of propertyKeys) {
      props[key] = interpolatePropertyAtTime(samples, key, t);
    }

    result.set(pct, props);
  }

  return result;
}

/**
 * Linearly interpolate a single property value at the given time from the
 * samples array.  Assumes samples are sorted by time.
 */
function interpolatePropertyAtTime(
  samples: Array<{ time: number; properties: Record<string, number> }>,
  key: string,
  t: number,
): number {
  // Find bracketing samples that contain this property
  let before: { time: number; value: number } | undefined;
  let after: { time: number; value: number } | undefined;

  for (const s of samples) {
    if (!(key in s.properties)) continue;
    const v = s.properties[key];

    if (s.time <= t) {
      before = { time: s.time, value: v };
    }
    if (s.time >= t && after === undefined) {
      after = { time: s.time, value: v };
    }
  }

  // Exact match or only one side available
  if (before && before.time === t) return before.value;
  if (after && after.time === t) return after.value;
  if (!before) return after!.value;
  if (!after) return before.value;

  // Linear interpolation
  const ratio = (t - before.time) / (after.time - before.time);
  return before.value + (after.value - before.value) * ratio;
}
