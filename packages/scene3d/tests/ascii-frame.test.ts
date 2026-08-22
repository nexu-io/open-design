import { describe, expect, it } from "vitest";
import { renderAsciiFrame, formatAsciiFrame } from "../src/read/ascii.js";
import { encodePng } from "../src/sheet/png.js";

/**
 * Proof frames as text.
 *
 * The renderer exists because a model may have no image input at all, so a
 * finding about what a frame LOOKS like is otherwise a finding about evidence
 * the reader cannot reach. That makes its measurements load-bearing rather
 * than decorative: an agent acts on `clipped` and `coverage` the way it would
 * act on any other measured fact in this package, so they are pinned here
 * against images whose correct answer is known by construction.
 */

/** An image built from a per-pixel function, so expectations are arithmetic. */
function image(
  width: number,
  height: number,
  at: (x: number, y: number) => [number, number, number, number],
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = at(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }
  return encodePng({ width, height, data });
}

const BLACK: [number, number, number, number] = [0, 0, 0, 255];
const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const CLEAR: [number, number, number, number] = [0, 0, 0, 0];

describe("ascii proof frames", () => {
  it("maps dark to blank and lit to the ramp's top", () => {
    const dark = renderAsciiFrame(image(64, 64, () => BLACK), { columns: 16 });
    expect(dark.rows.join("")).toMatch(/^ +$/);
    expect(dark.meanLuminance).toBeCloseTo(0, 3);

    const lit = renderAsciiFrame(image(64, 64, () => WHITE), { columns: 16 });
    expect(lit.rows.join("")).toMatch(/^@+$/);
    expect(lit.meanLuminance).toBeCloseTo(1, 3);
  });

  it("measures clipping, which is the blow-out the proof lint judges", () => {
    // Half the image at full white, half mid-grey: half the LIT pixels clip.
    const half = renderAsciiFrame(
      image(64, 64, (_x, y) => (y < 32 ? WHITE : [128, 128, 128, 255])),
      { columns: 16 },
    );
    expect(half.clipped).toBeCloseTo(0.5, 2);
    // And nothing is transparent, so everything counts as covered.
    expect(half.coverage).toBeCloseTo(1, 3);
  });

  it("reads transparent background as uncovered, not as dark subject", () => {
    // A lit square on a transparent field — the shape of every proof frame.
    const frame = renderAsciiFrame(
      image(64, 64, (x, y) => (x >= 16 && x < 48 && y >= 16 && y < 48 ? WHITE : CLEAR)),
      { columns: 16 },
    );
    // A quarter of the area is subject; coverage measures exactly that, and
    // luminance is the SUBJECT's, undiluted by the background it sits on.
    expect(frame.coverage).toBeCloseTo(0.25, 2);
    expect(frame.meanLuminance).toBeCloseTo(1, 2);
    expect(frame.rows.join("")).toContain("@");
    expect(frame.rows[0]).toMatch(/^ +$/); // the empty top band stays empty
  });

  it("box-averages rather than point-samples, so a thin subject survives", () => {
    // One lit row in 64. Nearest-neighbour sampling to 8 rows would land
    // between the lit pixels and report an empty frame; averaging cannot.
    const thin = renderAsciiFrame(
      image(64, 64, (_x, y) => (y === 31 ? WHITE : CLEAR)),
      { columns: 32 },
    );
    expect(thin.coverage).toBeGreaterThan(0);
    expect(thin.rows.join("")).not.toMatch(/^ +$/);
  });

  it("keeps a square image square in a terminal's non-square cells", () => {
    const frame = renderAsciiFrame(image(100, 100, () => WHITE), { columns: 40, cellAspect: 2 });
    expect(frame.rows[0]!.length).toBe(40);
    // Half the rows, because a cell is about twice as tall as it is wide.
    expect(frame.rows.length).toBe(20);
  });

  it("reports the source dimensions it sampled down from", () => {
    const frame = renderAsciiFrame(image(128, 64, () => WHITE), { columns: 16 });
    expect(frame.width).toBe(128);
    expect(frame.height).toBe(64);
  });

  it("formats a labelled block carrying the numbers", () => {
    const text = formatAsciiFrame("frame-000.png", renderAsciiFrame(image(32, 32, () => WHITE), { columns: 12 }));
    const [header, ...rows] = text.split("\n");
    expect(header).toContain("frame-000.png");
    expect(header).toContain("lum 1.000");
    expect(header).toContain("clipped 100.0%");
    expect(header).toContain("32x32");
    expect(rows.every((r) => r.length === 12)).toBe(true);
  });
});
