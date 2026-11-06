// Boundary cases share an arrange/assert shape on purpose: each case states its
// own window, drag, and expected remap so a failure reads without cross-referencing.
// fallow-ignore-file code-duplication
import { describe, expect, it } from "vitest";
import { resolveKeyframeRetime, type RetimeKeyframe } from "./keyframeRetime";

// Tween window [2, 6] (start 2s, duration 4s). Keyframes at tween-% 0/50/100 →
// absolute times 2 / 4 / 6. First + last carry an ease to prove it's preserved.
const KEYFRAMES: RetimeKeyframe[] = [
  { percentage: 0, properties: { x: 0 }, ease: "power1.out" },
  { percentage: 50, properties: { x: 50 } },
  { percentage: 100, properties: { x: 100 }, ease: "power2.in" },
];
const WINDOW = { tweenStart: 2, tweenDuration: 4 };
const LEFT_BOUNDARY_DROP = { ...WINDOW, dropAbsTime: 0.5 };

function expectLeftResize(
  keyframes: RetimeKeyframe[],
  draggedTweenPct: number,
  pctRemap: Array<{ from: number; to: number }>,
): void {
  const result = resolveKeyframeRetime({
    ...LEFT_BOUNDARY_DROP,
    keyframes,
    draggedTweenPct,
  });
  expect(result.kind).toBe("resize");
  expect(result.position).toBeCloseTo(0.5, 5);
  expect(result.duration).toBeCloseTo(5.5, 5);
  expect(result.pctRemap).toEqual(pctRemap);
}

describe("resolveKeyframeRetime — move (within the tween window)", () => {
  it("re-keys an interior keyframe to the tween-% of the drop", () => {
    const r = resolveKeyframeRetime({
      ...WINDOW,
      keyframes: KEYFRAMES,
      draggedTweenPct: 50,
      dropAbsTime: 3, // (3-2)/4 = 25%
    });
    expect(r.kind).toBe("move");
    expect(r.toTweenPct).toBeCloseTo(25, 5);
  });

  it("no-ops a drop that resolves onto the source keyframe", () => {
    const r = resolveKeyframeRetime({
      ...WINDOW,
      keyframes: KEYFRAMES,
      draggedTweenPct: 50,
      dropAbsTime: 4, // exactly 50%
    });
    expect(r.kind).toBe("noop");
  });

  it("shortens a flat tween when its synthesized end diamond moves left", () => {
    const r = resolveKeyframeRetime({
      ...WINDOW,
      keyframes: [],
      draggedTweenPct: 100,
      dropAbsTime: 5,
    });
    expect(r.kind).toBe("resize");
    expect(r.position).toBe(2);
    expect(r.duration).toBe(3);
    expect(r.pctRemap).toEqual([]);
  });

  it("moves a flat tween's start while preserving its absolute end", () => {
    const r = resolveKeyframeRetime({
      ...WINDOW,
      keyframes: [],
      draggedTweenPct: 0,
      dropAbsTime: 3,
    });
    expect(r.kind).toBe("resize");
    expect(r.position).toBe(3);
    expect(r.duration).toBe(3);
    expect(r.pctRemap).toEqual([]);
  });

  it("no-ops an unexpected interior percentage on a flat tween", () => {
    expect(
      resolveKeyframeRetime({
        ...WINDOW,
        keyframes: [],
        draggedTweenPct: 50,
        dropAbsTime: 5,
      }).kind,
    ).toBe("noop");
  });

  it("no-ops instead of rounding a sub-10ms flat tween to zero", () => {
    expect(
      resolveKeyframeRetime({
        tweenStart: 2,
        tweenDuration: 4,
        keyframes: [],
        draggedTweenPct: 100,
        dropAbsTime: 2.0004,
      }).kind,
    ).toBe("noop");
  });
});

describe("resolveKeyframeRetime — resize (past the tween boundary)", () => {
  it("extends the LAST keyframe past the end, keeping others' absolute times", () => {
    const r = resolveKeyframeRetime({
      ...WINDOW,
      keyframes: KEYFRAMES,
      draggedTweenPct: 100,
      dropAbsTime: 8, // past end (6) → grow duration
    });
    expect(r.kind).toBe("resize");
    expect(r.position).toBeCloseTo(2, 5); // start unchanged
    expect(r.duration).toBeCloseTo(6, 5); // 8 - 2
    // abs 2/4/8 over the new [2,8] window → 0 / 33.333 / 100. pctRemap carries each
    // existing keyframe's old→new tween-%; the commit re-keys in place (value +
    // ease + _auto preserved by round-tripping the source node, not re-emitted here).
    expect(r.pctRemap).toEqual([
      { from: 0, to: 0 },
      { from: 50, to: 33.333 },
      { from: 100, to: 100 },
    ]);
  });

  it("extends the FIRST keyframe before the start, shifting position earlier", () => {
    // abs 0.5/4/6 over [0.5,6] → 0 / 63.636 / 100.
    expectLeftResize(KEYFRAMES, 0, [
      { from: 0, to: 0 },
      { from: 50, to: 63.636 },
      { from: 100, to: 100 },
    ]);
  });
});

describe("resolveKeyframeRetime — single keyframe (both first and last)", () => {
  const lone: RetimeKeyframe[] = [{ percentage: 100, properties: { x: 9 } }];

  it("resizes right past the end", () => {
    const r = resolveKeyframeRetime({
      ...WINDOW, // lone keyframe sits at abs 6
      keyframes: lone,
      draggedTweenPct: 100,
      dropAbsTime: 9,
    });
    expect(r.kind).toBe("resize");
    expect(r.position).toBeCloseTo(2, 5);
    expect(r.duration).toBeCloseTo(7, 5);
    expect(r.pctRemap).toEqual([{ from: 100, to: 100 }]);
  });

  it("resizes left before the start", () => {
    expectLeftResize(lone, 100, [{ from: 100, to: 0 }]);
  });
});

describe("resolveKeyframeRetime — guards", () => {
  it("no-ops a zero-duration tween", () => {
    expect(
      resolveKeyframeRetime({
        tweenStart: 2,
        tweenDuration: 0,
        keyframes: KEYFRAMES,
        draggedTweenPct: 50,
        dropAbsTime: 3,
      }).kind,
    ).toBe("noop");
  });

  it("extends a flat tween when its synthesized end diamond moves right", () => {
    const r = resolveKeyframeRetime({
      ...WINDOW,
      keyframes: [],
      draggedTweenPct: 100,
      dropAbsTime: 8,
    });
    expect(r.kind).toBe("resize");
    expect(r.position).toBe(2);
    expect(r.duration).toBe(6);
    expect(r.pctRemap).toEqual([]);
  });
});

describe("resolveKeyframeRetime — move percentages are rounded like the resize path", () => {
  // The move branch used to return the raw quotient, so `74.81203007518799%`
  // landed in the user's source and churned the diff on every drag.
  const decimals = (n: number): number => String(n).split(".")[1]?.length ?? 0;

  it("rounds a repeating quotient to 3dp", () => {
    const r = resolveKeyframeRetime({
      tweenStart: 2,
      tweenDuration: 3,
      keyframes: KEYFRAMES,
      draggedTweenPct: 0,
      dropAbsTime: 3, // (3-2)/3 = 33.333333333333336%
    });
    expect(r.kind).toBe("move");
    expect(r.toTweenPct).toBe(33.333);
  });

  it("never emits more than 3 decimal places", () => {
    for (const tweenDuration of [3, 7, 9, 11, 133]) {
      const r = resolveKeyframeRetime({
        tweenStart: 2,
        tweenDuration,
        keyframes: KEYFRAMES,
        draggedTweenPct: 0,
        dropAbsTime: 3,
      });
      expect(r.kind).toBe("move");
      expect(decimals(r.toTweenPct ?? 0)).toBeLessThanOrEqual(3);
    }
  });

  it("leaves an already-short percentage untouched", () => {
    const r = resolveKeyframeRetime({
      ...WINDOW,
      keyframes: KEYFRAMES,
      draggedTweenPct: 0,
      dropAbsTime: 3, // (3-2)/4 = exactly 25%
    });
    expect(r.toTweenPct).toBe(25);
  });
});
