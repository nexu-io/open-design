import { describe, expect, it } from "vitest";
import { encodePng, decodePng, PngDecodeError } from "../src/sheet/png.js";

/** A tiny solid-colour RGBA image, generated so the test is auditable. */
function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

describe("decodePng (SH-6)", () => {
  it("round-trips a valid PNG", () => {
    const src = solid(4, 3, [10, 20, 30, 255]);
    const decoded = decodePng(encodePng(src));
    expect([decoded.width, decoded.height]).toEqual([4, 3]);
    expect(Array.from(decoded.data.subarray(0, 4))).toEqual([10, 20, 30, 255]);
  });

  it("throws on a truncated PNG instead of decoding garbage", () => {
    // A sheet cut short must read as SHEET_UNREADABLE (collect.ts routes a
    // decode throw there), not as a confident-but-wrong measurement.
    const full = encodePng(solid(8, 8, [200, 100, 50, 255]));
    const cut = full.subarray(0, full.length - 12); // drop IEND
    expect(() => decodePng(cut)).toThrow(PngDecodeError);
  });

  it("still rejects a non-PNG", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(PngDecodeError);
  });
});
