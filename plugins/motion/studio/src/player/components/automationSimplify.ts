/**
 * Ramer–Douglas–Peucker over an envelope's points, deviation measured
 * VERTICALLY in unit space. Vertical (not perpendicular) because an envelope
 * is a function of time — what matters is how far the value strays, and it
 * keeps the metric independent of the time axis' units. Exists for dense
 * producers: carve output and heavy hand edits.
 */
import type { AutomationRange, HfAutomationPoint } from "@hyperframes/core/audio-automation";
import { toUnit } from "./automationLaneGeometry";

export function simplifyPoints(
  points: HfAutomationPoint[],
  range: AutomationRange,
  epsilon = 0.02,
): HfAutomationPoint[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  const last = keep.length - 1;
  keep[0] = true;
  keep[last] = true;

  const stack: Array<[number, number]> = [[0, last]];
  while (stack.length > 0) {
    const seg = stack.pop();
    if (!seg) break;
    const [a, b] = seg;
    const pa = points[a];
    const pb = points[b];
    if (!pa || !pb || b - a < 2) continue;
    const ua = toUnit(range, pa.v);
    const ub = toUnit(range, pb.v);
    const span = pb.t - pa.t;
    let worst = -1;
    let worstDev = epsilon;
    for (let i = a + 1; i < b; i += 1) {
      const p = points[i];
      if (!p) continue;
      const f = span > 0 ? (p.t - pa.t) / span : 0;
      const dev = Math.abs(toUnit(range, p.v) - (ua + f * (ub - ua)));
      if (dev > worstDev) {
        worstDev = dev;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
