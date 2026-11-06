import { describe, expect, test } from "vitest";
import {
  absoluteToPercentage,
  absoluteToPercentageForAnimation,
  findTweenAtTime,
  isTimeWithinTween,
  percentageToAbsolute,
  percentageToAbsoluteForAnimation,
  resolveTweenDuration,
  resolveTweenStart,
} from "./globalTimeCompiler";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";

function makeAnim(overrides: Partial<GsapAnimation> = {}): GsapAnimation {
  return {
    id: "#el-to-0",
    targetSelector: "#el",
    method: "to",
    position: 0,
    properties: { x: 100 },
    ...overrides,
  };
}

describe("absoluteToPercentage", () => {
  test("mid-point of a tween", () => {
    expect(absoluteToPercentage(0.5, 0, 2)).toBe(25);
  });

  test("tween with offset start", () => {
    expect(absoluteToPercentage(1.0, 0.5, 1)).toBe(50);
  });

  test("preserves playhead timing beyond tenths of a percent", () => {
    const percentage = absoluteToPercentage(17, 12.17, 20);
    expect(percentage).toBe(24.15);
    expect(percentageToAbsolute(percentage, 12.17, 20)).toBe(17);
  });

  test("clamps below tween start to 0%", () => {
    expect(absoluteToPercentage(-1, 0, 2)).toBe(0);
  });

  test("clamps past tween end to 100%", () => {
    expect(absoluteToPercentage(5, 0, 2)).toBe(100);
  });

  test("zero duration returns 0", () => {
    expect(absoluteToPercentage(1, 0, 0)).toBe(0);
  });
});

describe("percentageToAbsolute", () => {
  test("converts percentage back to absolute time", () => {
    expect(percentageToAbsolute(50, 0.5, 1)).toBe(1.0);
  });

  test("0% returns tween start", () => {
    expect(percentageToAbsolute(0, 2, 3)).toBe(2);
  });

  test("100% returns tween end", () => {
    expect(percentageToAbsolute(100, 2, 3)).toBe(5);
  });
});

describe("isTimeWithinTween", () => {
  test("time inside returns true", () => {
    expect(isTimeWithinTween(0.5, 0, 2)).toBe(true);
  });

  test("time at start returns true", () => {
    expect(isTimeWithinTween(0, 0, 2)).toBe(true);
  });

  test("time at end returns true", () => {
    expect(isTimeWithinTween(2, 0, 2)).toBe(true);
  });

  test("time before returns false", () => {
    expect(isTimeWithinTween(-0.1, 0, 2)).toBe(false);
  });

  test("time after returns false", () => {
    expect(isTimeWithinTween(2.1, 0, 2)).toBe(false);
  });
});

describe("resolveTweenStart", () => {
  test("numeric position", () => {
    expect(resolveTweenStart(makeAnim({ position: 1.5 }))).toBe(1.5);
  });

  test("parseable string position", () => {
    expect(resolveTweenStart(makeAnim({ position: "2.5" }))).toBe(2.5);
  });

  test("unparseable string position returns null", () => {
    expect(resolveTweenStart(makeAnim({ position: "myLabel" }))).toBeNull();
  });

  test("relative position +=0.5 returns null", () => {
    expect(resolveTweenStart(makeAnim({ position: "+=0.5" }))).toBeNull();
  });
});

describe("resolveTweenDuration", () => {
  test("explicit duration", () => {
    expect(resolveTweenDuration(makeAnim({ duration: 2 }))).toBe(2);
  });

  test("missing duration defaults to GSAP default (0.5)", () => {
    expect(resolveTweenDuration(makeAnim({ duration: undefined }))).toBe(0.5);
  });
});

describe("findTweenAtTime", () => {
  const anims = [
    makeAnim({ id: "#el-to-0", position: 0, duration: 0.5 }),
    makeAnim({ id: "#el-to-1", position: 1, duration: 1 }),
    makeAnim({
      id: "#other-to-0",
      targetSelector: "#other",
      position: 0,
      duration: 2,
    }),
  ];

  test("finds tween at time within range", () => {
    expect(findTweenAtTime(0.3, anims, "#el")?.id).toBe("#el-to-0");
  });

  test("finds second tween", () => {
    expect(findTweenAtTime(1.5, anims, "#el")?.id).toBe("#el-to-1");
  });

  test("returns null for gap between tweens", () => {
    expect(findTweenAtTime(0.7, anims, "#el")).toBeNull();
  });

  test("filters by selector", () => {
    expect(findTweenAtTime(0.3, anims, "#other")?.id).toBe("#other-to-0");
  });

  test("returns null for unmatched selector", () => {
    expect(findTweenAtTime(0.3, anims, "#missing")).toBeNull();
  });

  test("skips tweens with unresolvable string positions", () => {
    const withLabel = [makeAnim({ id: "#el-to-0", position: "myLabel", duration: 1 })];
    expect(findTweenAtTime(0.5, withLabel, "#el")).toBeNull();
  });
});

describe("animation-level helpers", () => {
  const anim = makeAnim({ position: 0.5, duration: 2 });

  test("absoluteToPercentageForAnimation", () => {
    expect(absoluteToPercentageForAnimation(1.5, anim)).toBe(50);
  });

  test("absoluteToPercentageForAnimation returns null for string position", () => {
    const labelAnim = makeAnim({ position: "label" });
    expect(absoluteToPercentageForAnimation(0.5, labelAnim)).toBeNull();
  });

  test("percentageToAbsoluteForAnimation", () => {
    expect(percentageToAbsoluteForAnimation(50, anim)).toBe(1.5);
  });

  test("percentageToAbsoluteForAnimation returns null for string position", () => {
    const labelAnim = makeAnim({ position: "+=1" });
    expect(percentageToAbsoluteForAnimation(50, labelAnim)).toBeNull();
  });
});
