import { describe, expect, it } from "vitest";
import { simplifyPoints } from "./automationSimplify";
import { VOLUME_RANGE } from "@hyperframes/core/audio-automation";
import { toUnit } from "./automationLaneGeometry";
import type { HfAutomationPoint } from "@hyperframes/core/audio-automation";

describe("simplifyPoints", () => {
  it("collapses collinear runs to their endpoints", () => {
    const line: HfAutomationPoint[] = Array.from({ length: 50 }, (_, i) => ({
      t: i * 0.1,
      v: 1 - i * 0.01,
    }));
    const out = simplifyPoints(line, VOLUME_RANGE);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(line[0]);
    expect(out[out.length - 1]).toEqual(line[line.length - 1]);
  });

  it("keeps every survivor within epsilon of the original", () => {
    const wave: HfAutomationPoint[] = Array.from({ length: 100 }, (_, i) => ({
      t: i * 0.05,
      v: 0.5 + 0.4 * Math.sin(i * 0.2),
    }));
    const out = simplifyPoints(wave, VOLUME_RANGE, 0.02);
    expect(out.length).toBeLessThan(wave.length / 2);
    // Every dropped point must sit within epsilon (unit space) of the
    // simplified polyline — check by linear interpolation between survivors.
    for (const p of wave) {
      const rIdx = out.findIndex((q) => q.t >= p.t);
      const b = out[rIdx] ?? out[out.length - 1];
      const a = out[rIdx - 1] ?? b;
      if (!a || !b) continue;
      const span = b.t - a.t;
      const f = span > 0 ? (p.t - a.t) / span : 0;
      const approx =
        toUnit(VOLUME_RANGE, a.v) + f * (toUnit(VOLUME_RANGE, b.v) - toUnit(VOLUME_RANGE, a.v));
      expect(Math.abs(approx - toUnit(VOLUME_RANGE, p.v))).toBeLessThanOrEqual(0.021);
    }
  });

  it("returns short inputs untouched", () => {
    const two: HfAutomationPoint[] = [
      { t: 0, v: 1 },
      { t: 1, v: 0 },
    ];
    expect(simplifyPoints(two, VOLUME_RANGE)).toEqual(two);
  });
});
