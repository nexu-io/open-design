import { trimTrailingKeyframeSpans } from "@hyperframes/parsers/gsap-writer-acorn";
import { gsap } from "gsap";
import { describe, expect, it } from "vitest";

const timeline = `const tl = gsap.timeline({ paused: true });\n`;

// What Studio saved for a plain element keyed at 1, 2 and 3 s, and for its size keyed at 3 s then 2 s.
const saved = {
  position:
    `tl.set("#target", { x: 299.893, data: "hf-hold" }, 0);\n` +
    `tl.to("#target", { keyframes: { "0%": { x: 299.893 }, "33.333%": { x: 297.086 }, "66.667%": { x: 47.754 } }, duration: 3 }, 1);`,
  size:
    `tl.set("#target", { width: 440, data: "hf-hold" }, 0);\n` +
    `tl.to("#target", { keyframes: { "0%": { width: 440 }, "50%": { width: 340, ease: "none" } }, duration: 2 }, 2);`,
};

function valueAt(script: string, prop: "x" | "width", seeks: number[]) {
  const target: Record<string, number> = { x: 0, width: 240 };
  const run = new Function(
    "gsap",
    "target",
    `${script.replaceAll('"#target"', "target")}\nreturn tl;`,
  );
  const tl = run(gsap, target) as gsap.core.Timeline;
  for (const time of seeks) tl.seek(time);
  return target[prop];
}

describe.each([
  ["position", "x", 47.754],
  ["size", "width", 340],
] as const)("a %s tween Studio keyed short of its end", (name, prop, atThree) => {
  it("plays and seeks to the same value once its tail is trimmed", () => {
    const script = trimTrailingKeyframeSpans(timeline, timeline + saved[name]);
    expect(valueAt(script, prop, [3])).toBeCloseTo(atThree, 3);
    expect(valueAt(script, prop, [1, 2, 3])).toBeCloseTo(atThree, 3);
  });

  it("is what GSAP 3.15 gets wrong on a direct seek without the trim", () => {
    const script = timeline + saved[name];
    expect(valueAt(script, prop, [1, 2, 3])).toBeCloseTo(atThree, 3);
    expect(valueAt(script, prop, [3])).not.toBeCloseTo(atThree, 0);
  });
});
