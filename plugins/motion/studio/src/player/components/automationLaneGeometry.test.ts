// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  applyShiftConstraint,
  automationTargets,
  curveForDrag,
  fromUnit,
  snapLaneTime,
  toUnit,
} from "./automationLaneGeometry";
import { applyCurve, sampleAutomationLane } from "@hyperframes/core/audio-automation";
import { resolveAutomationRange, VOLUME_RANGE } from "@hyperframes/core/audio-automation";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";

const chain: HfAudioFxChain = {
  version: 1,
  nodes: [
    { type: "lowpass", id: "n1", enabled: true, params: {} },
    // No id: the panel has not touched it, so nothing can address it.
    { type: "peaking", enabled: true, params: {} },
    // Worklet-backed: no AudioParams to schedule.
    { type: "compressor", id: "n3", enabled: true, params: {} },
  ],
};

describe("automationTargets", () => {
  it("offers volume plus every addressable automatable knob", () => {
    const targets = automationTargets(chain).map((t) => t.target);
    expect(targets[0]).toBe("volume");
    expect(targets).toContain("fx.n1.frequency");
    expect(targets).toContain("fx.n1.q");
  });

  it("skips a node with no id — a lane could not address it stably", () => {
    expect(automationTargets(chain).some((t) => t.target.includes("peaking"))).toBe(false);
  });

  it("skips a worklet effect, which exposes no AudioParams", () => {
    expect(automationTargets(chain).some((t) => t.target.startsWith("fx.n3."))).toBe(false);
  });

  it("offers just the fader for a track with no chain", () => {
    expect(automationTargets(null).map((t) => t.target)).toEqual(["volume"]);
  });

  it("labels an fx target with its effect and knob", () => {
    const found = automationTargets(chain).find((t) => t.target === "fx.n1.frequency");
    expect(found?.label).toMatch(/Cutoff/);
    expect(found?.range.scale).toBe("log");
  });
});

describe("value ↔ lane position", () => {
  it("maps a linear range straight onto the lane", () => {
    const unit = { ...VOLUME_RANGE, max: 1 };
    expect(toUnit(unit, 0)).toBe(0);
    expect(toUnit(unit, 1)).toBe(1);
    expect(toUnit(unit, 0.25)).toBeCloseTo(0.25, 10);
  });

  it("puts unity a quarter up the volume lane, which reaches +12 dB", () => {
    expect(toUnit(VOLUME_RANGE, VOLUME_RANGE.max)).toBe(1);
    expect(toUnit(VOLUME_RANGE, 1)).toBeCloseTo(1 / VOLUME_RANGE.max, 10);
  });

  it("maps a log-read knob on its own scale, so its middle is geometric", () => {
    const range = resolveAutomationRange("fx.n1.frequency", chain)!;
    const mid = fromUnit(range, 0.5);
    expect(mid).toBeCloseTo(Math.sqrt(range.min * range.max), 4);
    // Round trip: a value put in comes back out.
    expect(fromUnit(range, toUnit(range, 900))).toBeCloseTo(900, 6);
  });

  it("clamps a pointer that has left the lane", () => {
    expect(fromUnit(VOLUME_RANGE, -3)).toBe(0);
    expect(fromUnit(VOLUME_RANGE, 4)).toBe(VOLUME_RANGE.max);
  });

  it("reads a zero-width range as the bottom rather than dividing by zero", () => {
    expect(toUnit({ ...VOLUME_RANGE, min: 1, max: 1 }, 1)).toBe(0);
  });
});

describe("curveForDrag", () => {
  const a = { t: 0, v: 1 };
  const b = { t: 4, v: 0 };

  /** The segment the drag describes, as the model would store it. */
  const bentLane = (bend: { viaX: number; viaY: number } | null) => ({
    target: "volume",
    points: [{ ...a, ...(bend ?? {}) }, b],
  });

  it("puts the curved segment through the point that was dragged", () => {
    // The whole contract: sampling the segment at the dragged time gives the dragged
    // value back, so the line never runs away from the pointer. Anywhere in the
    // segment, at any depth.
    for (const [t, v] of [
      [0.4, 0.75],
      [1.6, 0.65],
      [2, 0.6],
      [2, 0.1],
      [2.8, 0.4],
      [3.6, 0.5],
    ] as const) {
      const bend = curveForDrag({ range: VOLUME_RANGE, a, b, t, v });
      expect(bend).not.toBeNull();
      expect(sampleAutomationLane(bentLane(bend), t, "linear")).toBeCloseTo(v, 2);
    }
  });

  it("follows the pointer into the corner of a segment, as deep as it is dragged", () => {
    // The extreme: 10% along, pulled almost to the floor of a falling ramp. The old
    // exponent saturated a third of the segment away from the pointer, and a later
    // slope cap stopped following it too. Reached exactly now, and the shape it draws
    // stays one smooth arc — checked by sampling it, not by trusting it.
    const bend = curveForDrag({ range: VOLUME_RANGE, a, b, t: 0.4, v: 0.05 });
    expect(bend).not.toBeNull();
    const drawn = bentLane(bend);
    expect(sampleAutomationLane(drawn, 0.4, "linear")).toBeCloseTo(0.05, 2);

    let previous: number | null = null;
    let worst = 1;
    for (let i = 1; i < 60; i += 1) {
      const t = (4 * i) / 60;
      const h = 0.01;
      const slope =
        (sampleAutomationLane(drawn, t + h, "linear") -
          sampleAutomationLane(drawn, t - h, "linear")) /
        (2 * h);
      if (previous !== null && Math.abs(previous) > 1e-6) {
        const ratio = Math.abs(slope) > Math.abs(previous) ? slope / previous : previous / slope;
        worst = Math.max(worst, Math.abs(ratio));
      }
      previous = slope;
    }
    // Gradual: a crease would show up here as a step change in slope.
    expect(worst).toBeLessThan(3);
  });

  it("biases the bend toward whichever point the pointer is nearer", () => {
    // The behaviour a single exponent could not give: grabbing the line near the
    // right-hand point has to bulge it on the RIGHT. Measured as where the curve
    // deviates furthest from the straight line it replaced.
    const apexOf = (bend: { viaX: number; viaY: number } | null): number => {
      const lane = bentLane(bend);
      let best = 0;
      let at = 0;
      for (let i = 1; i < 40; i++) {
        const t = (4 * i) / 40;
        const straight = 1 - t / 4;
        const gap = Math.abs(sampleAutomationLane(lane, t, "linear") - straight);
        if (gap > best) {
          best = gap;
          at = t;
        }
      }
      return at;
    };
    const nearA = curveForDrag({ range: VOLUME_RANGE, a, b, t: 0.6, v: 0.55 });
    const nearB = curveForDrag({ range: VOLUME_RANGE, a, b, t: 3.4, v: 0.45 });
    expect(apexOf(nearA)).toBeLessThan(1.6);
    expect(apexOf(nearB)).toBeGreaterThan(2.4);
    // And the two sit on opposite sides of centre, which is the whole complaint:
    // every bend used to land on the same side whatever the pointer did.
    expect(apexOf(nearA)).toBeLessThan(apexOf(nearB));
  });

  it("stays inside the normalised segment the model will accept", () => {
    // Both coordinates are clamped clear of the ends on parse, so a drag right up
    // against a breakpoint has to describe an interior point, not the breakpoint.
    const bend = curveForDrag({ range: VOLUME_RANGE, a, b, t: 0.05, v: 0.02 });
    expect(bend).not.toBeNull();
    expect(bend?.viaX).toBeGreaterThan(0);
    expect(bend?.viaX).toBeLessThan(1);
    expect(bend?.viaY).toBeGreaterThan(0);
    expect(bend?.viaY).toBeLessThan(1);
    expect(applyCurve(0.5, 0)).toBe(0.5);
  });

  it("declines a segment with no room to bend", () => {
    // Flat: every curve draws the same line, so there is nothing to solve.
    expect(curveForDrag({ range: VOLUME_RANGE, a, b: { t: 4, v: 1 }, t: 2, v: 0.5 })).toBeNull();
    // At the very ends the exponent divides by zero.
    expect(curveForDrag({ range: VOLUME_RANGE, a, b, t: 0, v: 1 })).toBeNull();
    expect(curveForDrag({ range: VOLUME_RANGE, a, b, t: 4, v: 0 })).toBeNull();
  });
});

describe("applyShiftConstraint", () => {
  const origin = { t: 1, v: 0.5 };
  const xOf = (t: number) => t * 100;
  const yOf = (v: number) => (1 - v) * 40;

  it("holds the value when the gesture is mostly sideways", () => {
    const out = applyShiftConstraint({
      range: VOLUME_RANGE,
      origin,
      raw: { t: 3, v: 0.55 },
      xOf,
      yOf,
    });
    expect(out).toEqual({ t: 3, v: 0.5 });
  });

  it("holds the time and fines the value when it is mostly vertical", () => {
    const out = applyShiftConstraint({
      range: VOLUME_RANGE,
      origin,
      raw: { t: 1.05, v: 0.9 },
      xOf,
      yOf,
    });
    expect(out.t).toBe(1);
    // A quarter of the travel: 0.5 + (0.9 - 0.5) / 4.
    expect(out.v).toBeCloseTo(0.6, 5);
  });

  it("decides which axis won in pixels, not in units", () => {
    // 0.2 s against 0.2 of a fader are not comparable numbers; at this zoom the
    // horizontal move is 20px and the vertical one is 8px.
    const out = applyShiftConstraint({
      range: VOLUME_RANGE,
      origin,
      raw: { t: 1.2, v: 0.7 },
      xOf,
      yOf,
    });
    expect(out.v).toBe(0.5);
  });
});

describe("snapLaneTime", () => {
  it("takes the nearest target inside the threshold", () => {
    expect(snapLaneTime(2.02, [1, 2, 3], 0.04)).toBe(2);
  });

  it("leaves a time alone when nothing is close enough", () => {
    expect(snapLaneTime(2.5, [1, 2, 3], 0.04)).toBe(2.5);
  });

  it("has nothing to snap to on an empty grid", () => {
    expect(snapLaneTime(2.5, [], 0.04)).toBe(2.5);
  });
});
