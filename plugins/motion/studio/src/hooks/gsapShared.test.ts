import { describe, it, expect } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import {
  idFromSelector,
  idSelector,
  isInstantHold,
  keyframeEases,
  parsePercentageKeyframes,
  resolveClipTimingBasis,
  playsNear,
  toClipKeyframes,
  toClipPercentage,
} from "./gsapShared";

describe("keyframeEases", () => {
  it("carries the keyframes' own ease into the tween ease, which GSAP plays the same", () => {
    const anim = {
      ease: "back.out",
      keyframes: { keyframes: [], ease: "sine.inOut", easeEach: "power2.out" },
    } as unknown as GsapAnimation;
    expect(keyframeEases(anim)).toEqual({ ease: "sine.inOut", easeEach: "power2.out" });
  });
});

describe("isInstantHold", () => {
  const animation = (method: GsapAnimation["method"], duration?: number) =>
    ({ method, duration }) as unknown as GsapAnimation;

  it("classifies set and duration-zero to/fromTo writes as instant holds", () => {
    expect(isInstantHold(animation("set"))).toBe(true);
    expect(isInstantHold(animation("to", 0))).toBe(true);
    expect(isInstantHold(animation("fromTo", 0))).toBe(true);
  });

  it("does not classify live tweens or duration-zero from writes as instant holds", () => {
    expect(isInstantHold(animation("to", 1))).toBe(false);
    expect(isInstantHold(animation("fromTo"))).toBe(false);
    expect(isInstantHold(animation("from", 0))).toBe(false);
  });
});

describe("parsePercentageKeyframes", () => {
  it("parses the object/percentage form", () => {
    const out = parsePercentageKeyframes({ "0%": { x: 0, y: 0 }, "100%": { x: 9, y: 4 } });
    expect(out?.keyframes).toEqual([
      { percentage: 0, properties: { x: 0, y: 0 } },
      { percentage: 100, properties: { x: 9, y: 4 } },
    ]);
  });

  it("parses GSAP array-form keyframes at each step's end, as the parser does", () => {
    // A multi-point shuttle path authored as `keyframes: [...]` has no `N%` keys;
    // step i of n ends at (i+1)/n.
    const out = parsePercentageKeyframes([
      { x: 0, y: 0 },
      { x: 520, y: 120 },
      { x: 1040, y: 0 },
      { x: 1480, y: 160 },
    ] as unknown as Record<string, unknown>);
    expect(out?.keyframes.map((k) => k.percentage)).toEqual([25, 50, 75, 100]);
    expect(out?.keyframes.map((k) => k.step)).toEqual([0, 1, 2, 3]);
    expect(out?.keyframes[1]!.properties).toEqual({ x: 520, y: 120 });
    const timed = parsePercentageKeyframes([
      { x: 0, duration: 1 },
      { x: 50, duration: 3 },
    ] as unknown as Record<string, unknown>);
    expect(timed?.keyframes.map((k) => k.percentage)).toEqual([25, 100]);
  });

  it("strips a per-entry ease without shifting the step spacing of the others", () => {
    // GSAP positions array keyframes by array index, so a `{ ease }` carried on an
    // entry is a segment ease (skipped as a property) — it must not change where
    // the surrounding keyframes land. 3 entries → 33.3 / 66.7 / 100, even though the
    // middle entry also carries an ease.
    const out = parsePercentageKeyframes([
      { x: 0 },
      { x: 100, ease: "power2.in" },
      { x: 200 },
    ] as unknown as Record<string, unknown>);
    expect(out?.keyframes.map((k) => k.percentage)).toEqual([33.3, 66.7, 100]);
    expect(out?.keyframes.map((k) => k.properties)).toEqual([{ x: 0 }, { x: 100 }, { x: 200 }]);
  });

  it("keeps the step spacing when an interior array slot has no animatable prop", () => {
    // A degenerate `{ ease }`-only slot contributes no output keyframe, but it is
    // still an array slot GSAP allocates a position to — so the remaining entries
    // keep their 3-slot percentages (33.3 and 100), not a 2-entry spacing.
    const out = parsePercentageKeyframes([
      { x: 0 },
      { ease: "power2.in" },
      { x: 200 },
    ] as unknown as Record<string, unknown>);
    expect(out?.keyframes.map((k) => k.percentage)).toEqual([33.3, 100]);
    expect(out?.keyframes.map((k) => k.properties)).toEqual([{ x: 0 }, { x: 200 }]);
  });

  it("returns null for keyframes with no positional/animatable props", () => {
    expect(parsePercentageKeyframes([] as unknown as Record<string, unknown>)).toBeNull();
    expect(parsePercentageKeyframes({})).toBeNull();
  });
});

describe("idSelector", () => {
  it("uses #id for valid CSS identifiers", () => {
    expect(idSelector("hero-word")).toBe("#hero-word");
    expect(idSelector("el_1")).toBe("#el_1");
  });

  it("uses an attribute selector for ids that #id can't address (digit-leading, dots, spaces)", () => {
    // #01-... / #a.b / #a b throw a SyntaxError in querySelector / GSAP, crashing
    // the preview when such a target is committed (e.g. dragging the element).
    expect(idSelector("01-hook-hero-word")).toBe('[id="01-hook-hero-word"]');
    expect(idSelector("my.class")).toBe('[id="my.class"]');
    expect(idSelector("1box")).toBe('[id="1box"]');
  });

  it("escapes quotes and backslashes in the attribute selector value", () => {
    expect(idSelector('1"x')).toBe('[id="1\\"x"]');
  });

  it("only ever emits #id for ids that can't break querySelector", () => {
    // Every id resolves to either a plain #id (only when safe) or an attribute
    // selector — never a #id that would throw a SyntaxError.
    for (const id of ["hero-word", "01-hook", "a.b", "a b", "1", "--x", '1"q']) {
      const sel = idSelector(id);
      if (sel.startsWith("#")) expect(sel).toBe(`#${id}`);
      else expect(sel.startsWith('[id="')).toBe(true);
    }
  });
});

describe("toClipPercentage", () => {
  // Selection keys embed this number, so every keyframe-cache writer has to round
  // it identically: a coarser writer rewrites the cache with a different value and
  // orphans the live selection key built from the finer one.
  it("keeps three decimals so a beat-snapped keyframe lands on its beat", () => {
    expect(toClipPercentage(1 / 3, 0, 1, 0)).toBe(33.333);
    expect(toClipPercentage(2.5, 2, 4, 0)).toBe(12.5);
  });

  it("passes the tween percentage through for a zero-length clip", () => {
    expect(toClipPercentage(5, 0, 0, 42)).toBe(42);
  });
});

describe("toClipKeyframes", () => {
  // Fixture carries only the fields the function under test reads; the
  // double-cast is the documented way to stand in for the full runtime shape
  // (CONTRIBUTING.md).
  const durationless = {
    id: "a1",
    method: "to",
    targetSelector: "#box",
    vars: {},
    resolvedStart: 0,
  } as unknown as GsapAnimation;

  it("places a duration-less tween's keyframes where GSAP plays them, not across the clip", () => {
    const rows = toClipKeyframes([{ percentage: 0 }, { percentage: 100 }], durationless, 0, 4);
    expect(rows.map((row) => row.percentage)).toEqual([0, 12.5]);
  });

  it("matches a keyframe by the time it plays, not its warped progress", () => {
    const eased = {
      ...durationless,
      duration: 1,
      ease: "power2.in",
      keyframes: { format: "percentage", keyframes: [] },
    } as unknown as GsapAnimation;
    // At 20% of the time power2.in (cubic) shows 0.8% progress: close in progress, far in time.
    expect(playsNear(eased, 0, 0.8)).toBe(false);
    expect(playsNear(eased, 50, 50.5)).toBe(true);
  });

  it("places a keyframe where an outer ease makes GSAP reach it", () => {
    const eased = {
      ...durationless,
      duration: 1,
      ease: "power2.in",
      keyframes: { format: "percentage", keyframes: [] },
    } as unknown as GsapAnimation;
    const rows = toClipKeyframes(
      [{ percentage: 0 }, { percentage: 50 }, { percentage: 100 }],
      eased,
      0,
      1,
    );
    // GSAP's power2 is cubic: it reaches 50% at the cube root of 0.5.
    expect(rows.map((row) => row.percentage)).toEqual([0, 79.37, 100]);
  });

  it("keeps the tween percentage and the animation identity on every row", () => {
    const rows = toClipKeyframes([{ percentage: 50 }], durationless, 0, 4);
    expect(rows[0]).toMatchObject({ tweenPercentage: 50, animationId: "a1" });
  });
});

describe("resolveClipTimingBasis", () => {
  // Measured on v-product-promo: `captions-comp` mounts at 1.5s for 12.5s, and the
  // six tweens inside it resolve to 0..12.5 — composition-local, not main-timeline
  // absolute. Subtracting the host's 1.5 mount from a 0s tween cached pct -12.
  const host = { id: "captions-comp", domId: "captions-comp", start: 1.5, duration: 12.5 };
  const children = [{ id: "line", hostId: "captions-comp" }];

  it("gives a sub-composition inner element the host window in the tween's own frame", () => {
    expect(resolveClipTimingBasis("line", "captions.html", [host], children)).toEqual({
      elStart: 0,
      elDuration: 12.5,
    });
  });

  it("leaves a root-composition element on the main timeline", () => {
    const box = { id: "box", domId: "box", start: 3, duration: 2 };
    expect(resolveClipTimingBasis("box", "index.html", [box], [])).toEqual({
      elStart: 3,
      elDuration: 2,
    });
  });

  it("rebases an expanded sub-comp child by its host mount", () => {
    // Expanded children carry host-ABSOLUTE display starts; the tweens they own are
    // still composition-local, so the basis is the child's local start.
    const pill = { id: "pill", domId: "pill", start: 8, duration: 4, parentCompositionStart: 6 };
    expect(resolveClipTimingBasis("pill", "scene.html", [pill], [])).toEqual({
      elStart: 2,
      elDuration: 4,
    });
  });

  it("rebases by the parent composition clip when the child is not expanded", () => {
    const parent = { id: "scene-comp", domId: "scene-comp", start: 5, duration: 10 };
    const pill = {
      id: "pill",
      domId: "pill",
      start: 7,
      duration: 3,
      parentCompositionId: "scene-comp",
    };
    expect(resolveClipTimingBasis("pill", "scene.html", [parent, pill], [])).toEqual({
      elStart: 2,
      elDuration: 3,
    });
  });

  it("treats a child whose parent composition is missing as starting at 0", () => {
    // The mount is unknowable, so the only safe frame is the child's own. The
    // old `?? 0` handed back `start` unchanged, which is a main-timeline value
    // masquerading as a composition-local one and caches negative percentages.
    const pill = {
      id: "pill",
      domId: "pill",
      start: 7,
      duration: 3,
      parentCompositionId: "not-in-elements",
    };
    expect(resolveClipTimingBasis("pill", "scene.html", [pill], [])).toEqual({
      elStart: 0,
      elDuration: 3,
    });
  });

  it("keeps a main-timeline clip's own start when it names no parent", () => {
    const box = { id: "box", domId: "box", start: 4, duration: 2 };
    expect(resolveClipTimingBasis("box", "index.html", [box], [])).toEqual({
      elStart: 4,
      elDuration: 2,
    });
  });

  it("falls back to a unit window when neither the element nor a host resolves", () => {
    expect(resolveClipTimingBasis("ghost", "index.html", [], [])).toEqual({
      elStart: 0,
      elDuration: 1,
    });
  });
});

describe("sub-composition keyframe percentages", () => {
  const host = { id: "captions-comp", domId: "captions-comp", start: 1.5, duration: 12.5 };
  const children = [{ id: "line", hostId: "captions-comp" }];
  const basis = () => resolveClipTimingBasis("line", "captions.html", [host], children);
  const inner = (resolvedStart: number, duration?: number) =>
    ({
      id: `t-${resolvedStart}`,
      method: "to",
      targetSelector: "#line",
      vars: {},
      resolvedStart,
      duration,
    }) as unknown as GsapAnimation;
  const percentages = (animation: GsapAnimation) => {
    const { elStart, elDuration } = basis();
    return toClipKeyframes(
      [{ percentage: 0 }, { percentage: 100 }],
      animation,
      elStart,
      elDuration,
    ).map((row) => row.percentage);
  };

  it("puts a tween on the host's first frame at 0%, never below zero", () => {
    // A clip-relative percentage can never be negative; this one cached -12.
    expect(percentages(inner(0))).toEqual([0, 4]);
  });

  it("puts the last tween's end keyframe at 100%", () => {
    expect(percentages(inner(12.1, 0.4))).toEqual([96.8, 100]);
  });

  it("keeps every measured tween of the fixture inside 0..100", () => {
    for (const start of [0, 3.2, 3.5, 7.7, 8, 12.1]) {
      for (const percentage of percentages(inner(start, 0.4))) {
        expect(percentage).toBeGreaterThanOrEqual(0);
        expect(percentage).toBeLessThanOrEqual(100);
      }
    }
  });

  it("keeps a root-composition tween at the head of its own clip", () => {
    const box = { id: "box", domId: "box", start: 3, duration: 2 };
    const { elStart, elDuration } = resolveClipTimingBasis("box", "index.html", [box], []);
    const rows = toClipKeyframes([{ percentage: 0 }], inner(3, 2), elStart, elDuration);
    expect(rows[0]!.percentage).toBe(0);
  });

  it("passes tween percentages through for a zero-length clip", () => {
    expect(toClipKeyframes([{ percentage: 40 }], inner(0, 0.4), 0, 0)[0]!.percentage).toBe(40);
  });

  it("round-trips a clip percentage through the basis it was written with", () => {
    // The drag commit converts a dropped clip-% back to a time with this basis
    // (useTimelineEditCallbacks) and compares it against the tween's own
    // resolvedStart, so the basis has to be in the tween's frame on both sides.
    const { elStart, elDuration } = basis();
    const absTime = elStart + (40 / 100) * elDuration;
    expect(absTime).toBe(5);
    expect(toClipPercentage(absTime, elStart, elDuration, 0)).toBe(40);
  });
});

describe("idFromSelector", () => {
  it("round-trips every shape idSelector emits", () => {
    for (const id of ["hero-word", "el_1", "01-hook-hero-word", "my.class", "1box", '1"x']) {
      expect(idFromSelector(idSelector(id))).toBe(id);
    }
  });

  it("returns null for a selector that does not address an id", () => {
    expect(idFromSelector(".dot")).toBeNull();
    expect(idFromSelector("[data-hf-id='x']")).toBeNull();
    expect(idFromSelector(undefined)).toBeNull();
  });
});
