import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { parseGsapScriptAcorn } from "@hyperframes/parsers/gsap-parser-acorn";
import { replaceTweenWithKeyframesInScript } from "@hyperframes/parsers/gsap-writer-acorn";
import { describe, expect, it } from "vitest";
import { resolveKeyframeRetime } from "../components/editor/keyframeRetime";
import { absoluteToPercentageForAnimation } from "../utils/globalTimeCompiler";
import { runEaseOf, timeAtProgress } from "../utils/gsapKeyframeEases";
import { buildExtendedKeyframes } from "./gsapDragPositionCommit";
import { keyframeEases } from "./gsapShared";

const script = (ease: string) =>
  `const tl = gsap.timeline({ paused: true });\ntl.to("#x", { keyframes: { "0%": { x: 0 }, "50%": { x: 600 }, "100%": { x: 1200 } }, duration: 2, ease: "${ease}" }, 1);`;

const percentages = (anim: GsapAnimation) => anim.keyframes!.keyframes.map((k) => k.percentage);
const distinctInRange = (pcts: number[]) =>
  pcts.every((p, i) => p >= 0 && p <= 100 && (i === 0 || p > pcts[i - 1]!));

describe.each(["back.out(1.7)", "back.in(1.7)", "elastic.out(1, 0.3)", "steps(4)"])(
  "an outer %s, which does not map time to progress one to one",
  (ease) => {
    const src = script(ease);
    const anim = parseGsapScriptAcorn(src).animations[0]!;

    it("adding a keyframe past the end keeps every keyframe, distinct and in range, after a reparse", () => {
      const out = buildExtendedKeyframes(anim, 5, { x: 1500 });
      const written = replaceTweenWithKeyframesInScript(src, anim.id, {
        targetSelector: "#x",
        ...keyframeEases(anim),
        ...out,
      })!;
      const back = parseGsapScriptAcorn(written).animations[0]!;
      expect(distinctInRange(percentages(back))).toBe(true);
      expect(back.keyframes!.keyframes.map((k) => k.properties.x)).toEqual([0, 600, 1200, 1500]);
    });

    it("a keyframe added inside the tween lands within 0-100%", () => {
      const pct = absoluteToPercentageForAnimation(1 + 0.7 * 2, anim)!;
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    });

    it("dragging the last keyframe later keeps every keyframe distinct and in range", () => {
      const retime = resolveKeyframeRetime({
        keyframes: anim.keyframes!.keyframes,
        draggedTweenPct: 100,
        tweenStart: 1,
        tweenDuration: 2,
        dropAbsTime: 4,
        runEase: runEaseOf(anim),
      });
      expect(retime.kind).toBe("resize");
      expect(distinctInRange(retime.pctRemap!.map((r) => r.to))).toBe(true);
    });
  },
);

it("extending a tween under steps(4) loses no keyframe", () => {
  const src = `const tl = gsap.timeline({ paused: true });\ntl.to("#x", { keyframes: { "0%": { x: 0 }, "25%": { x: 60 }, "60%": { x: 120 }, "100%": { x: 30 } }, duration: 2, ease: "steps(4)" }, 1);`;
  const anim = parseGsapScriptAcorn(src).animations[0]!;
  const out = buildExtendedKeyframes(anim, 4, { x: 999 });
  expect(distinctInRange(out.keyframes.map((k) => k.percentage))).toBe(true);
  expect(out.keyframes.map((k) => k.properties.x)).toEqual([0, 60, 120, 30, 999]);
});

it("still times keyframes through an outer ease that rises one to one", () => {
  expect(timeAtProgress("power2.in", 50)).toBeCloseTo(79.37, 1);
});
