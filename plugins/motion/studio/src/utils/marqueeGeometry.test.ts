import { describe, expect, it } from "vitest";
import { rectsOverlap } from "./marqueeGeometry";

describe("rectsOverlap", () => {
  it("overlapping rects", () => {
    expect(
      rectsOverlap(
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 5, top: 5, width: 10, height: 10 },
      ),
    ).toBe(true);
  });

  it("non-overlapping rects", () => {
    expect(
      rectsOverlap(
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 20, top: 20, width: 10, height: 10 },
      ),
    ).toBe(false);
  });

  it("touching edges do not overlap", () => {
    expect(
      rectsOverlap(
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 10, top: 0, width: 10, height: 10 },
      ),
    ).toBe(false);
  });

  it("one rect fully inside another overlaps", () => {
    expect(
      rectsOverlap(
        { left: 0, top: 0, width: 100, height: 100 },
        { left: 25, top: 25, width: 10, height: 10 },
      ),
    ).toBe(true);
  });
});
