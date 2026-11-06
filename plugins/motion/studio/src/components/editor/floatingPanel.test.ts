import { describe, expect, it } from "vitest";
import { clampCentredLeft, resolveFloatingPanelPosition } from "./floatingPanel";

describe("clampCentredLeft", () => {
  it("leaves a bubble that already fits alone", () => {
    expect(clampCentredLeft(400, 104, 800, 8)).toBe(400);
  });

  it("pushes a bubble whose left half would leave the viewport", () => {
    // Trigger centred at x=20 with a 104px bubble would render at left=-32.
    expect(clampCentredLeft(20, 104, 800, 8)).toBe(60);
  });

  it("pushes a bubble whose right half would leave the viewport", () => {
    expect(clampCentredLeft(790, 104, 800, 8)).toBe(740);
  });

  it("keeps the left edge visible when the bubble is wider than the viewport", () => {
    expect(clampCentredLeft(10, 900, 800, 8)).toBe(458);
  });
});

describe("resolveFloatingPanelPosition", () => {
  it("places the panel below the anchor when there is space", () => {
    expect(
      resolveFloatingPanelPosition(
        { left: 100, top: 100, right: 220, bottom: 140, width: 120, height: 40 },
        { width: 800, height: 600 },
        { width: 280, height: 220 },
      ),
    ).toMatchObject({ top: 148, placement: "bottom" });
  });

  it("places the panel above the anchor when the bottom would be clipped", () => {
    expect(
      resolveFloatingPanelPosition(
        { left: 100, top: 500, right: 220, bottom: 540, width: 120, height: 40 },
        { width: 800, height: 600 },
        { width: 280, height: 220 },
      ),
    ).toMatchObject({ top: 272, placement: "top" });
  });

  it("clamps the panel horizontally inside the viewport", () => {
    expect(
      resolveFloatingPanelPosition(
        { left: 760, top: 100, right: 800, bottom: 140, width: 40, height: 40 },
        { width: 800, height: 600 },
        { width: 280, height: 220 },
      ).left,
    ).toBe(508);
  });
});
