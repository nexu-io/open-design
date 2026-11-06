import { describe, expect, it } from "vitest";
import { SUPPORTED_PROPS } from "@hyperframes/parsers/gsap-constants";
import { buildTweenSummary } from "./gsapAnimationHelpers";
import { PROP_LABELS } from "./gsapAnimationConstants";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";

function anim(overrides: Partial<GsapAnimation>): GsapAnimation {
  return {
    id: "a1",
    method: "to",
    targetSelector: "#box",
    properties: {},
    position: 0,
    duration: 1,
    ease: "power2.out",
    ...overrides,
  } as GsapAnimation;
}

describe("buildTweenSummary", () => {
  it("describes a to tween", () => {
    const s = buildTweenSummary(anim({ properties: { opacity: 1, x: 100 } }));
    expect(s).toContain("#box");
    expect(s).toContain("opacity");
    expect(s).toContain("move x");
  });

  it("describes 3D transform tweens with labels and units", () => {
    const s = buildTweenSummary(
      anim({
        properties: {
          z: 120,
          rotationX: 45,
          rotationY: -30,
          rotationZ: 90,
          perspective: 800,
          transformOrigin: "50% 50%",
        },
      }),
    );
    expect(s).toContain("move z to 120px");
    expect(s).toContain("rotate x to 45°");
    expect(s).toContain("rotate y to -30°");
    expect(s).toContain("rotate z to 90°");
    expect(s).toContain("perspective to 800px");
    expect(s).toContain("transform origin to 50% 50%");
  });

  it("describes a from tween", () => {
    const s = buildTweenSummary(anim({ method: "from", properties: { opacity: 0 } }));
    expect(s).toContain("enters from");
    expect(s).toContain("opacity");
  });

  it("describes a keyframed tween by its keyframes and the segment ease it plays", () => {
    const keyframes = {
      easeEach: "power3.out",
      keyframes: [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 50, properties: { x: 300, opacity: 0.5 } },
        { percentage: 100, properties: { x: 600 } },
      ],
    };
    expect(buildTweenSummary(anim({ ease: undefined, keyframes } as Partial<GsapAnimation>))).toBe(
      "Starting at 0s, over 1s, animate #box's move x, opacity through 3 keyframes, each segment eased power3.out.",
    );
  });

  it("names a keyframed tween's run ease and mixed segment eases", () => {
    const keyframes = {
      keyframes: [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 50, properties: { x: 300 }, ease: "expo.in" },
        { percentage: 100, properties: { x: 600 } },
      ],
    };
    expect(
      buildTweenSummary(anim({ ease: "sine.inOut", keyframes } as Partial<GsapAnimation>)),
    ).toBe(
      "Starting at 0s, over 1s, animate #box's move x through 3 keyframes, with per-keyframe easing, across a sine.inOut run.",
    );
  });

  it("describes a set tween", () => {
    const s = buildTweenSummary(anim({ method: "set", properties: { opacity: 0 } }));
    expect(s).toMatch(/^At 0s, instantly set/);
    expect(s).toContain("opacity");
  });

  it("describes a fromTo tween with both from and to sections", () => {
    const s = buildTweenSummary(
      anim({
        method: "fromTo",
        fromProperties: { opacity: 0, x: -50 },
        properties: { opacity: 1, x: 0 },
        position: 0.5,
        duration: 1.5,
        ease: "expo.out",
      }),
    );
    expect(s).toContain("animates from");
    expect(s).toContain("[opacity 0%");
    expect(s).toContain("move x -50px");
    expect(s).toContain("opacity to 100%");
    expect(s).toContain("expo.out");
  });

  it("handles fromTo with empty fromProperties", () => {
    const s = buildTweenSummary(
      anim({ method: "fromTo", fromProperties: {}, properties: { scale: 2 } }),
    );
    expect(s).toContain("from [none]");
  });

  it("handles no properties", () => {
    const s = buildTweenSummary(anim({ properties: {} }));
    expect(s).toContain("no properties yet");
  });
});

describe("PROP_LABELS", () => {
  it("provides labels for every inspector-supported GSAP property", () => {
    expect(SUPPORTED_PROPS.filter((prop) => !PROP_LABELS[prop])).toEqual([]);
  });
});
