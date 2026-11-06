// Real gsap: the ease the parser reports for keyframes must be the one GSAP plays.
import { parseGsapScriptAcorn } from "@hyperframes/core/gsap-parser-acorn";
import { gsap } from "gsap";
import { describe, expect, it } from "vitest";

const STEPS = { "0%": { x: 0 }, "100%": { x: 10 } };

function xAt(vars: gsap.TweenVars, time = 0.3): number {
  const target = { x: 0 };
  gsap
    .timeline({ paused: true })
    .to(target, { duration: 1, ...vars }, 0)
    .seek(time);
  return target.x;
}

const parsedEaseEach = (vars: string) =>
  parseGsapScriptAcorn(`const tl = gsap.timeline({ paused: true });
tl.to("#a", { duration: 1, ${vars} }, 0);`).animations[0]!.keyframes?.easeEach;

describe("the keyframes ease the parser reports", () => {
  it("is not a tween-level easeEach, which GSAP ignores", () => {
    expect(xAt({ keyframes: STEPS, easeEach: "power4.in" })).toBe(xAt({ keyframes: STEPS }));
    expect(
      parsedEaseEach('keyframes: { "0%": { x: 0 }, "100%": { x: 10 } }, easeEach: "power4.in"'),
    ).toBeUndefined();
  });

  it("is an easeEach inside the keyframes, which GSAP plays", () => {
    expect(xAt({ keyframes: { ...STEPS, easeEach: "power4.in" } })).not.toBe(
      xAt({ keyframes: STEPS }),
    );
    expect(
      parsedEaseEach('keyframes: { "0%": { x: 0 }, "100%": { x: 10 }, easeEach: "power4.in" }'),
    ).toBe("power4.in");
  });
});
