import { describe, expect, it } from "vitest";

import { parseCaptureClip } from "../../src/main/runtime.js";

describe("parseCaptureClip", () => {
  it("scales CSS-pixel clip coordinates to DIP coordinates using the webContents zoom factor", () => {
    // At zoomLevel 0.5 (zoomFactor = 1.2^0.5 ≈ 1.095445), a centered mobile
    // preview iframe at CSS rect (858, 165, 384, 831) inside a 1643x1027 CSS
    // viewport actually occupies DIP (940, 181, 421, 910) inside an 1800x1125
    // window. Unscaled CSS coordinates shift the capture left into the
    // surrounding checkerboard and truncate the right edge of the device frame.
    const zoomFactor = Math.pow(1.2, 0.5);
    expect(
      parseCaptureClip(
        { clip: { x: 858, y: 165, width: 384, height: 831 } },
        zoomFactor,
      ),
    ).toEqual({
      x: 940,
      y: 181,
      width: 421,
      height: 910,
    });
  });

  it("preserves 1:1 rounding and clamping at default zoom", () => {
    expect(
      parseCaptureClip({ clip: { x: -4.2, y: 12.6, width: 0.4, height: 300.2 } }),
    ).toEqual({
      x: 0,
      y: 13,
      width: 1,
      height: 300,
    });
  });

  it("falls back to scale=1 when zoomFactor is non-positive or non-finite", () => {
    const payload = { clip: { x: 100, y: 200, width: 300, height: 400 } };
    expect(parseCaptureClip(payload, 0)).toEqual({
      x: 100,
      y: 200,
      width: 300,
      height: 400,
    });
    expect(parseCaptureClip(payload, -1)).toEqual({
      x: 100,
      y: 200,
      width: 300,
      height: 400,
    });
    expect(parseCaptureClip(payload, Number.NaN)).toEqual({
      x: 100,
      y: 200,
      width: 300,
      height: 400,
    });
  });

  it("returns undefined for missing or malformed clips", () => {
    expect(parseCaptureClip(null)).toBeUndefined();
    expect(parseCaptureClip({})).toBeUndefined();
    expect(parseCaptureClip({ clip: { x: 0, y: 0, width: "100", height: 100 } })).toBeUndefined();
  });
});
