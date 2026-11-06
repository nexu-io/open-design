import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { describe, expect, it } from "vitest";
import { progressAtTime, runEaseOf } from "../../utils/gsapKeyframeEases";
import { valuesAt, valuesBefore } from "./trackHeaderLaneValues";

const tween = (format: string, vars: { ease?: string; easeEach?: string }) =>
  ({
    id: "#x-to-0-position",
    targetSelector: "#x",
    method: "to",
    position: 0,
    duration: 1,
    properties: {},
    ...(vars.ease ? { ease: vars.ease } : {}),
    keyframes: {
      format,
      keyframes: [
        { percentage: 50, properties: { x: 60 } },
        { percentage: 100, properties: { x: 120 } },
      ],
      ...(vars.easeEach ? { easeEach: vars.easeEach } : {}),
    },
  }) as unknown as GsapAnimation;

const xAt = (animation: GsapAnimation, timePercentage: number) =>
  Number(
    valuesAt(animation, "position", progressAtTime(runEaseOf(animation), timePercentage)).x.toFixed(
      2,
    ),
  );

// Each row is what GSAP 3.15 draws for x at 12.5, 37.5, 62.5 and 87.5% of the tween.
describe("valuesAt at the playhead", () => {
  it.each([
    ["a step list", tween("object-array", {}), [15, 45, 75, 105]],
    [
      "a step list with an outer ease",
      tween("object-array", { ease: "power1.out" }),
      [28.13, 73.13, 103.13, 118.13],
    ],
    ["percentage keyframes", tween("percentage", {}), [7.5, 52.5, 67.5, 112.5]],
    [
      "percentage keyframes with an outer ease",
      tween("percentage", { ease: "power1.out", easeEach: "power1.out" }),
      [43.07, 83.38, 115.25, 119.94],
    ],
  ])("reads %s as GSAP plays it", (_, animation, expected) => {
    expect([12.5, 37.5, 62.5, 87.5].map((at) => xAt(animation, at))).toEqual(expected);
  });
});

describe("valuesBefore", () => {
  it("starts a step list from the value an earlier set left, not a default", () => {
    const set = { id: "s", method: "set", position: 0, resolvedStart: 0, properties: { x: 300 } };
    const stepList = { ...tween("object-array", { ease: "none" }), position: 1, resolvedStart: 1 };
    stepList.keyframes!.keyframes = [
      { percentage: 50, properties: { x: 300 } },
      { percentage: 100, properties: { x: 500 } },
    ];
    const start = valuesBefore(stepList, [set as unknown as GsapAnimation, stepList]);
    expect(start).toEqual({ x: 300 });
    expect(valuesAt(stepList, "position", 25, start)).toEqual({ x: 300 });
  });

  it("takes a set placed at the tween's own start, and never a relative string", () => {
    const at = (id: string, resolvedStart: number, x: number | string) =>
      ({ id, method: "set", resolvedStart, properties: { x } }) as unknown as GsapAnimation;
    const stepList = { ...tween("object-array", { ease: "none" }), resolvedStart: 1 };
    const relative = at("r", 0.5, "+=50");
    expect(valuesBefore(stepList, [at("s", 1, 300), stepList])).toEqual({ x: 300 });
    expect(valuesBefore(stepList, [stepList, at("s", 1, 300)])).toEqual({});
    expect(valuesBefore(stepList, [at("s", 0, 300), relative, stepList])).toEqual({});
  });

  it("skips a tween still running when this one starts", () => {
    const set = { id: "s", method: "set", resolvedStart: 0, properties: { x: 300 } };
    const running = {
      id: "r",
      method: "to",
      resolvedStart: 0.5,
      duration: 1,
      properties: { x: 900 },
    };
    const stepList = { ...tween("object-array", { ease: "none" }), resolvedStart: 1 };
    const others = [set, running] as unknown as GsapAnimation[];
    expect(valuesBefore(stepList, [...others, stepList])).toEqual({ x: 300 });
    expect(valuesBefore({ ...stepList, resolvedStart: undefined }, others)).toEqual({});
  });
});
