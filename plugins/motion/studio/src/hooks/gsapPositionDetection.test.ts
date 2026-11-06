import { afterEach, describe, expect, it } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { usePlayerStore } from "../player/store/playerStore";
import { tween } from "./gsapParsedTween.test-helpers";
import { findGsapPositionAnimation, pickClosestToPlayhead } from "./gsapPositionDetection";

afterEach(() => usePlayerStore.setState({ currentTime: 0 }));

const slide = (
  id: string,
  resolvedStart: number,
  duration: number,
  fields: Partial<GsapAnimation> = {},
) => tween({ id, method: "to", properties: { x: 10 }, resolvedStart, duration, ...fields });
const keyed = (...percentages: number[]) => ({
  keyframes: {
    format: "object-array" as const,
    keyframes: percentages.map((percentage) => ({ percentage, properties: { x: percentage } })),
  },
});

describe("pickClosestToPlayhead", () => {
  it.each([
    ["the one spanning the playhead", 1.5, [slide("a", 0, 1), slide("b", 1, 1)], "b"],
    ["the nearer end when none spans it", 5, [slide("a", 0, 1), slide("b", 2, 2)], "b"],
    [
      "the one whose file states the playhead's value",
      1,
      [slide("a", 0, 1), slide("b", 1, 1)],
      "a",
    ],
    [
      "the later one when both state it",
      1,
      [slide("a", 0, 2, keyed(0, 50, 100)), slide("b", 0.5, 1, keyed(0, 50, 100))],
      "b",
    ],
    [
      "the one with more keyframes on a tie",
      5,
      [slide("a", 0, 1, keyed(0, 100)), slide("b", 0, 1, keyed(0, 50, 100))],
      "b",
    ],
  ])("picks %s", (_, time, anims, id) => {
    usePlayerStore.setState({ currentTime: time });
    expect(pickClosestToPlayhead(anims)?.id).toBe(id);
  });
});

describe("findGsapPositionAnimation", () => {
  it.each([
    [
      "the tween spanning the playhead",
      1.5,
      undefined,
      [slide("a", 0, 1, keyed(0, 100)), slide("b", 1, 1)],
      "b",
    ],
    ["the nearer tween", 9, undefined, [slide("a", 0, 1), slide("b", 6, 1)], "b"],
    [
      "the selected target's tween",
      0.5,
      "#box",
      [slide("a", 0, 1, { targetSelector: "#card", ...keyed(0, 100) }), slide("b", 0, 1)],
      "b",
    ],
    [
      "a tween on one target over a shared one",
      0.5,
      undefined,
      [slide("a", 0, 1, { targetSelector: "#box, #card" }), slide("b", 0, 1)],
      "b",
    ],
  ])("prefers %s", (_, time, selector, anims, id) => {
    usePlayerStore.setState({ currentTime: time });
    expect(findGsapPositionAnimation(anims, selector)?.id).toBe(id);
  });
});
