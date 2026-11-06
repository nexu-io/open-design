import { describe, expect, it } from "vitest";
import { fitEasesFromVelocity, type FittedKeyframe } from "./velocityEaseFitter";

function makeSamples(
  count: number,
  duration: number,
  velocityFn: (t: number) => number,
): { time: number; properties: Record<string, number> }[] {
  const samples = [];
  let pos = 0;
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * duration;
    const v = velocityFn(t / duration);
    pos += v * (duration / count);
    samples.push({ time: t, properties: { x: pos } });
  }
  return samples;
}

describe("fitEasesFromVelocity", () => {
  it("constant speed → no ease assigned", () => {
    const kfs: FittedKeyframe[] = [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 100, properties: { x: 100 } },
    ];
    const samples = makeSamples(60, 1, () => 100);
    const result = fitEasesFromVelocity(kfs, samples, 1);
    expect(result[1].ease).toBeUndefined();
  });

  it("decelerate at end → AE Easy Ease In (slow-end curve)", () => {
    const kfs: FittedKeyframe[] = [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 100, properties: { x: 100 } },
    ];
    // Start fast, end slow → playback must also be slow at the end (CP2 y=1).
    const samples = makeSamples(60, 1, (t) => Math.max(0, 200 * (1 - t)));
    const result = fitEasesFromVelocity(kfs, samples, 1);
    expect(result[1].ease).toBe("custom(M0,0 C0.333,0.333 0.667,1 1,1)");
  });

  it("accelerate from start → AE Easy Ease Out (slow-start curve)", () => {
    const kfs: FittedKeyframe[] = [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 100, properties: { x: 100 } },
    ];
    // Start slow, end fast → playback must also be slow at the start (CP1 y=0).
    const samples = makeSamples(60, 1, (t) => 200 * t);
    const result = fitEasesFromVelocity(kfs, samples, 1);
    expect(result[1].ease).toBe("custom(M0,0 C0.333,0 0.667,0.667 1,1)");
  });

  it("single keyframe → returns unchanged", () => {
    const kfs: FittedKeyframe[] = [{ percentage: 0, properties: { x: 0 } }];
    const result = fitEasesFromVelocity(kfs, [], 1);
    expect(result).toEqual(kfs);
  });
});
