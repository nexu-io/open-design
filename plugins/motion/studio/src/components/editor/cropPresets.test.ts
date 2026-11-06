import { describe, expect, it } from "vitest";
import { CROP_ASPECT_PRESETS, centredCropInsets } from "./cropPresets";

describe("centredCropInsets", () => {
  it("trims the sides of a wide frame to 9:16, centred", () => {
    const insets = centredCropInsets(1920, 1080, 9 / 16);
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(0);
    expect(insets.left).toBeCloseTo((1920 - 607.5) / 2, 6);
    expect(insets.right).toBeCloseTo(insets.left, 6);
  });

  it("trims top and bottom of a tall frame to 16:9", () => {
    const insets = centredCropInsets(1080, 1920, 16 / 9);
    expect(insets.left).toBe(0);
    expect(insets.right).toBe(0);
    expect(insets.top).toBeCloseTo((1920 - 607.5) / 2, 6);
    expect(insets.bottom).toBeCloseTo(insets.top, 6);
  });

  it("leaves the visible box in the requested ratio", () => {
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1920],
      [800, 800],
    ]) {
      for (const { ratio } of CROP_ASPECT_PRESETS) {
        const i = centredCropInsets(w, h, ratio);
        expect((w - i.left - i.right) / (h - i.top - i.bottom)).toBeCloseTo(ratio, 6);
      }
    }
  });

  it("is no crop when the frame already has the ratio", () => {
    expect(centredCropInsets(1600, 900, 16 / 9)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("offers the four spec ratios", () => {
    expect(CROP_ASPECT_PRESETS.map((p) => p.label)).toEqual(["16:9", "9:16", "1:1", "4:5"]);
  });
});
