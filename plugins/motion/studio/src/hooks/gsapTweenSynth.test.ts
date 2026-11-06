import { describe, expect, it } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { deduplicateKeyframes, synthesizeFlatTweenKeyframes } from "./gsapTweenSynth";

function anim(overrides: Partial<GsapAnimation>): GsapAnimation {
  return {
    id: "a1",
    targetSelector: "#title",
    method: "to",
    position: 0,
    properties: {},
    ...overrides,
  };
}

describe("synthesizeFlatTweenKeyframes", () => {
  it("returns null for a set() static hold", () => {
    expect(synthesizeFlatTweenKeyframes(anim({ method: "set", properties: { x: 5 } }))).toBeNull();
  });

  // Regression: removeAllKeyframesFromScript collapses a keyframed tween to
  // `tl.to(..., { duration: 0, immediateRender: true })` — a static hold with
  // the same "not an animation" semantics as set(), but a different method
  // string. Before this fix, only position-only (x/y) collapses were treated
  // as holds elsewhere; a collapse to scale/opacity (or anything else) still
  // synthesized a phantom keyframe diamond after "Delete All Keyframes".
  it("returns null for a to() collapsed to a zero-duration immediateRender hold", () => {
    const collapsed = anim({
      method: "to",
      duration: 0,
      // Both parsers encode a literal `immediateRender: true` as this raw
      // source string, not a boolean — see gsapParser.ts/gsapParserAcorn.ts.
      extras: { immediateRender: "__raw:true" },
      properties: { scale: 1, opacity: 1 },
    });
    expect(synthesizeFlatTweenKeyframes(collapsed)).toBeNull();
  });

  it("still synthesizes keyframes for a genuine animated to() tween", () => {
    const out = synthesizeFlatTweenKeyframes(
      anim({ method: "to", duration: 1, properties: { opacity: 1 } }),
    );
    expect(out).not.toBeNull();
    expect(out?.keyframes.map((k) => k.percentage)).toEqual([0, 100]);
  });

  it("still synthesizes keyframes for a duration:0 tween that isn't an immediateRender hold", () => {
    // duration:0 alone isn't enough — only paired with immediateRender does it
    // mean "this is a static hold, not an animation".
    const out = synthesizeFlatTweenKeyframes(
      anim({ method: "to", duration: 0, properties: { opacity: 1 } }),
    );
    expect(out).not.toBeNull();
  });
});

describe("deduplicateKeyframes colliding animation targets", () => {
  it("records each animation's tween percentage in first-seen order", () => {
    const merged = deduplicateKeyframes([
      {
        percentage: 45,
        tweenPercentage: 20,
        properties: { x: 10 },
        ease: "power2.in",
        animationId: "#a-position",
      },
      {
        percentage: 45,
        tweenPercentage: 80,
        properties: { opacity: 1 },
        ease: "power2.out",
        animationId: "#a-visual",
      },
    ]);
    const kf = merged.find((k) => k.percentage === 45);
    expect(kf?.collidingAnimationTargets).toEqual([
      { animationId: "#a-position", tweenPercentage: 20 },
      { animationId: "#a-visual", tweenPercentage: 80 },
    ]);
  });

  it("deduplicates three colliding animations while preserving first-seen order", () => {
    const merged = deduplicateKeyframes([
      {
        percentage: 45,
        tweenPercentage: 20,
        properties: { x: 10 },
        ease: "power2.in",
        animationId: "#a-position",
      },
      {
        percentage: 45,
        tweenPercentage: 80,
        properties: { opacity: 1 },
        ease: "power2.in",
        animationId: "#a-visual",
      },
      {
        percentage: 45,
        tweenPercentage: 40,
        properties: { y: 20 },
        ease: "power2.out",
        animationId: "#a-position",
      },
      {
        percentage: 45,
        tweenPercentage: 60,
        properties: { scale: 2 },
        ease: "power2.in",
        animationId: "#a-scale",
      },
    ]);
    expect(merged.find((k) => k.percentage === 45)?.collidingAnimationTargets).toEqual([
      { animationId: "#a-position", tweenPercentage: 20 },
      { animationId: "#a-visual", tweenPercentage: 80 },
      { animationId: "#a-scale", tweenPercentage: 60 },
    ]);
  });

  it("leaves the collision set undefined within a single animation", () => {
    const merged = deduplicateKeyframes([
      {
        percentage: 45,
        tweenPercentage: 20,
        properties: { x: 10 },
        ease: "power2.in",
        animationId: "#a-position",
      },
      {
        percentage: 45,
        tweenPercentage: 80,
        properties: { y: 20 },
        ease: "power2.out",
        animationId: "#a-position",
      },
    ]);
    expect(merged.find((k) => k.percentage === 45)?.collidingAnimationTargets).toBeUndefined();
  });
});
