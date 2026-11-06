import { describe, expect, it } from "vitest";
import { clipToTweenPercentage } from "./KeyframeNavigation";

/**
 * Regression: keyframe add/remove are keyed by TWEEN-relative percentage (what the
 * GSAP writer + runtime use), NOT the clip-relative playhead used for display/seek.
 * The Layout-panel diamond used to emit clip-relative %, so the mutation missed
 * every keyframe (off by the tween's offset/scale) → a silent no-op on disk that
 * the optimistic cache hid, so the motion path never refreshed.
 */

// A tween that starts partway through the element's lifetime and is shorter than
// it: the clip→tween map is linear with tween% = (clip% - 20) * 2.5 over [20, 60].
const KEYFRAMES = [
  { percentage: 20, tweenPercentage: 0, properties: { x: 0 } },
  { percentage: 30, tweenPercentage: 25, properties: { x: -180 } },
  { percentage: 50, tweenPercentage: 75, properties: { x: -320 } },
  { percentage: 60, tweenPercentage: 100, properties: { x: -460 } },
];

describe("clipToTweenPercentage", () => {
  it("maps anchor keyframes to their tween-relative percentages", () => {
    expect(clipToTweenPercentage(KEYFRAMES, 20)).toBeCloseTo(0, 5);
    expect(clipToTweenPercentage(KEYFRAMES, 60)).toBeCloseTo(100, 5);
  });

  it("linearly interpolates a clip-relative playhead into tween space", () => {
    // clip 40% is the midpoint of the tween's clip span [20, 60] → tween 50%.
    expect(clipToTweenPercentage(KEYFRAMES, 40)).toBeCloseTo(50, 5);
  });

  it("falls back to the input when there's no usable mapping", () => {
    expect(clipToTweenPercentage([], 40)).toBe(40);
    expect(clipToTweenPercentage([{ percentage: 10 }], 40)).toBe(40);
  });
});
