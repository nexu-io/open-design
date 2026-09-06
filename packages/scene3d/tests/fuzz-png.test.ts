import { describe, expect, it } from "vitest";
import { encodePng, decodePng, PngDecodeError } from "../src/sheet/png.js";
import { Rng } from "../src/solve/rng.js";

/**
 * Property fuzzing for the PNG decoder (SH-6).
 *
 * Invariant: for ANY byte buffer, decodePng either returns a structurally
 * consistent image (data length == w*h*4) or throws PngDecodeError — never a
 * different error, never a garbage image, always terminating. The sheet
 * collector routes a throw to SHEET_UNREADABLE, so "throws cleanly" is a first-
 * class outcome, and "returns garbage" is the failure this guards against.
 */

function assertDecodeInvariant(bytes: Uint8Array): void {
  let img;
  try {
    img = decodePng(bytes);
  } catch (err) {
    if (!(err instanceof PngDecodeError)) {
      throw new Error(`decodePng threw ${(err as Error).constructor?.name} (not PngDecodeError): ${(err as Error).message}`);
    }
    return;
  }
  expect(img.width).toBeGreaterThan(0);
  expect(img.height).toBeGreaterThan(0);
  expect(img.data.length).toBe(img.width * img.height * 4);
}

function solid(rng: Rng, w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng.next() * 256);
  return encodePng({ width: w, height: h, data });
}

describe("fuzz: decodePng returns a consistent image or throws PngDecodeError", () => {
  it("survives random byte buffers", () => {
    const rng = new Rng("fuzz-png-random");
    for (let i = 0; i < 4000; i++) {
      const len = Math.floor(rng.next() * 300);
      const bytes = new Uint8Array(len);
      for (let j = 0; j < len; j++) bytes[j] = Math.floor(rng.next() * 256);
      assertDecodeInvariant(bytes);
    }
  });

  it("survives PNGs with a valid signature but random tail", () => {
    // Get past the signature check so the chunk loop itself is exercised.
    const rng = new Rng("fuzz-png-sig");
    const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 4000; i++) {
      const len = 8 + Math.floor(rng.next() * 200);
      const bytes = new Uint8Array(len);
      bytes.set(SIG);
      for (let j = 8; j < len; j++) bytes[j] = Math.floor(rng.next() * 256);
      assertDecodeInvariant(bytes);
    }
  });

  it("survives truncations and byte-flips of a real PNG", () => {
    const rng = new Rng("fuzz-png-mutate");
    for (let i = 0; i < 2000; i++) {
      const w = 1 + Math.floor(rng.next() * 12);
      const h = 1 + Math.floor(rng.next() * 12);
      const png = solid(rng, w, h);
      const mutated = png.slice(0, png.length - Math.floor(rng.next() * png.length));
      // A handful of byte-flips on top of the truncation.
      const flips = Math.floor(rng.next() * 6);
      for (let f = 0; f < flips && mutated.length > 0; f++) {
        mutated[Math.floor(rng.next() * mutated.length)] = Math.floor(rng.next() * 256);
      }
      assertDecodeInvariant(mutated);
    }
  });
});
