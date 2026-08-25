import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { decodePng, encodePng, DecodedImage } from "../src/sheet/png.js";
import { measureSheet } from "../src/sheet/measure.js";
import { collectSheets } from "../src/sheet/collect.js";
import { lintSheets, SheetSpec } from "../src/lint/sheet.js";
import { Issue } from "../src/types.js";
import { runLint } from "../src/lint/rules.js";
import { normalizeContract, validateContract } from "../src/contract.js";
import { ISSUE_CODES } from "../src/errors.js";

/* ------------------------------------------------------------------ */
/* Generated fixtures. The corpus is code, not committed binaries, so   */
/* every defect is described where it is introduced.                    */
/* ------------------------------------------------------------------ */

function blank(width: number, height: number): DecodedImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function setPixel(img: DecodedImage, x: number, y: number, rgba: [number, number, number, number]) {
  const at = (y * img.width + x) * 4;
  img.data[at] = rgba[0];
  img.data[at + 1] = rgba[1];
  img.data[at + 2] = rgba[2];
  img.data[at + 3] = rgba[3];
}

/** A neutral-grey blob centred in each cell — a well-formed flipbook. */
function flipbook(size = 64, cols = 2, rows = 2, options: {
  blankCells?: number[];
  bleedCell?: number;
  static?: boolean;
  hue?: boolean;
} = {}): DecodedImage {
  const img = blank(size, size);
  const cw = size / cols;
  const ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      if (options.blankCells?.includes(index)) continue;
      // Radius grows per frame so the cells are visually distinct, unless
      // the fixture is deliberately static.
      const radius = options.static ? 6 : 4 + index * 2;
      const cx = cw / 2;
      const cy = ch / 2;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          if (Math.hypot(x - cx, y - cy) > radius) continue;
          const grey = 200;
          setPixel(img, c * cw + x, r * ch + y, [
            grey,
            options.hue ? 40 : grey,
            options.hue ? 40 : grey,
            255,
          ]);
        }
      }
      if (options.bleedCell === index) {
        // Paint into the cell's 2px inner border: filtering will sample it
        // from the neighbouring frame.
        for (let x = 0; x < cw; x++) setPixel(img, c * cw + x, r * ch, [200, 200, 200, 255]);
      }
    }
  }
  return img;
}

/** A flipbook with one small distinct dot per cell, staying well inside every
 *  cell border — used to isolate POT/atlas rules from blob-size side effects. */
function dottedFlipbook(atlas: number, cols: number, rows: number): DecodedImage {
  const img = blank(atlas, atlas);
  const cw = atlas / cols;
  const ch = atlas / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      const bright = 120 + index * 10; // distinct per frame, never clipped
      // Shift the dot per frame so the distinct-cell signature (which keys on
      // position and pixel count, not brightness) sees genuine animation.
      const cx = Math.floor(cw / 2) + (index % 3) - 1;
      const cy = Math.floor(ch / 2) + Math.floor(index / 3) - 1;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setPixel(img, c * cw + cx + dx, r * ch + cy + dy, [bright, bright, bright, 255]);
        }
      }
    }
  }
  return img;
}

/** A horizontally tileable ribbon that never touches its long edges. */
function beam(width = 128, height = 32, options: { breakSeam?: boolean; touchEdge?: boolean } = {}): DecodedImage {
  const img = blank(width, height);
  for (let x = 0; x < width; x++) {
    for (let y = 4; y < height - 4; y++) {
      const a = 255 - Math.abs(y - height / 2) * 8;
      setPixel(img, x, y, [200, 200, 200, Math.max(0, Math.min(255, a))]);
    }
  }
  if (options.breakSeam) {
    for (let y = 0; y < height; y++) setPixel(img, width - 1, y, [10, 10, 10, 255]);
  }
  if (options.touchEdge) {
    for (let x = 0; x < width; x++) setPixel(img, x, 0, [200, 200, 200, 255]);
  }
  return img;
}

/** A fully opaque sky face filled with a flat colour. */
function skyFace(size: number, rgb: [number, number, number]): DecodedImage {
  const img = blank(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) setPixel(img, x, y, [rgb[0], rgb[1], rgb[2], 255]);
  }
  return img;
}

function write(dir: string, name: string, img: DecodedImage): void {
  fs.writeFileSync(path.join(dir, name), encodePng(img));
}

function codes(dir: string, specs: SheetSpec[], seamTolerance?: number): string[] {
  const collected = collectSheets(dir, specs);
  const issues: Issue[] = [];
  lintSheets(
    { ...collected, ...(seamTolerance !== undefined ? { seamTolerance } : {}) },
    issues,
  );
  return issues.map((i) => i.code);
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "scene3d-sheet-"));
}

/* ------------------------------------------------------------------ */

describe("PNG codec", () => {
  it("round-trips an image through encode and decode", () => {
    const original = flipbook(32, 2, 2);
    const decoded = decodePng(encodePng(original));
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(32);
    expect(Array.from(decoded.data)).toEqual(Array.from(original.data));
  });

  it("is byte-stable, so fixtures do not churn", () => {
    expect(Array.from(encodePng(flipbook(32)))).toEqual(Array.from(encodePng(flipbook(32))));
  });

  it("rejects a non-PNG rather than decoding garbage", () => {
    expect(() => decodePng(new Uint8Array(64))).toThrow(/not a PNG/);
  });

  it("refuses an interlaced PNG instead of returning scrambled pixels", () => {
    const bytes = encodePng(flipbook(16));
    bytes[8 + 8 + 12] = 1; // IHDR interlace flag
    // A GENUINE interlaced PNG carries a valid CRC over its flipped flag,
    // so the fixture must too — without the recompute this now (rightly)
    // dies at the CRC check instead of exercising the interlace refusal.
    const crc = zlib.crc32(bytes.subarray(12, 12 + 4 + 13)) >>> 0;
    new DataView(bytes.buffer, bytes.byteOffset).setUint32(12 + 4 + 13, crc);
    expect(() => decodePng(bytes)).toThrow(/interlaced/);
  });

  it("refuses a corrupted chunk instead of fabricating pixel facts", () => {
    // The inverse case: a flipped byte with a STALE CRC is corruption, and
    // measuring it would hand the sheet rules confidently wrong pixels.
    const bytes = encodePng(flipbook(16));
    bytes[8 + 8 + 12] = 1; // same flip, CRC left stale
    expect(() => decodePng(bytes)).toThrow(/CRC mismatch/);
  });
});

describe("sheet rules — well-formed assets stay silent", () => {
  it("passes a clean flipbook, particle, beam and sky set", () => {
    const dir = tempDir();
    write(dir, "flame.png", flipbook(64, 2, 2));
    write(dir, "strip.png", beam());
    for (const face of ["ft", "bk", "lf", "rt", "up", "dn"]) {
      write(dir, `sky_${face}.png`, skyFace(32, [90, 120, 180]));
    }
    const specs: SheetSpec[] = [
      { file: "flame.png", kind: "flipbook", grid: [2, 2], tint: true },
      { file: "strip.png", kind: "beam" },
      ...["ft", "bk", "lf", "rt", "up", "dn"].map((face) => ({
        file: `sky_${face}.png`,
        kind: "sky" as const,
        face: face as SheetSpec["face"],
        set: "sky",
      })),
    ];
    expect(codes(dir, specs)).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("sheet rules — every rule catches its defect", () => {
  it("catches a non-power-of-two sheet", () => {
    const dir = tempDir();
    write(dir, "odd.png", flipbook(48, 2, 2));
    expect(codes(dir, [{ file: "odd.png", kind: "sprite" }])).toContain("S3D-E-603");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches an empty sheet", () => {
    const dir = tempDir();
    write(dir, "empty.png", blank(32, 32));
    expect(codes(dir, [{ file: "empty.png", kind: "sprite" }])).toContain("S3D-E-605");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches art that never reaches full alpha", () => {
    const dir = tempDir();
    const faded = flipbook(32, 2, 2);
    for (let i = 3; i < faded.data.length; i += 4) {
      if (faded.data[i]! > 0) faded.data[i] = 180;
    }
    write(dir, "faded.png", faded);
    expect(codes(dir, [{ file: "faded.png", kind: "sprite" }])).toContain("S3D-E-606");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches hue baked into tintable art", () => {
    const dir = tempDir();
    write(dir, "red.png", flipbook(32, 2, 2, { hue: true }));
    expect(codes(dir, [{ file: "red.png", kind: "flipbook", grid: [2, 2], tint: true }])).toContain(
      "S3D-E-607",
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches a grid that does not divide the sheet evenly", () => {
    const dir = tempDir();
    write(dir, "grid.png", flipbook(64, 2, 2));
    expect(codes(dir, [{ file: "grid.png", kind: "flipbook", grid: [3, 3] }])).toContain("S3D-E-608");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches blank frames", () => {
    const dir = tempDir();
    write(dir, "gap.png", flipbook(64, 2, 2, { blankCells: [2] }));
    expect(codes(dir, [{ file: "gap.png", kind: "flipbook", grid: [2, 2] }])).toContain("S3D-E-609");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches frames bleeding into a cell border", () => {
    const dir = tempDir();
    write(dir, "bleed.png", flipbook(64, 2, 2, { bleedCell: 1 }));
    expect(codes(dir, [{ file: "bleed.png", kind: "flipbook", grid: [2, 2] }])).toContain("S3D-E-610");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("warns when a flipbook never actually animates", () => {
    const dir = tempDir();
    write(dir, "still.png", flipbook(64, 2, 2, { static: true }));
    expect(codes(dir, [{ file: "still.png", kind: "flipbook", grid: [2, 2] }])).toContain("S3D-W-601");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches a particle touching the atlas border", () => {
    const dir = tempDir();
    const img = blank(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) setPixel(img, x, y, [200, 200, 200, 255]);
    write(dir, "fills.png", img);
    expect(codes(dir, [{ file: "fills.png", kind: "particle" }])).toContain("S3D-E-611");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches a strip that will not tile", () => {
    const dir = tempDir();
    write(dir, "notile.png", beam(128, 32, { breakSeam: true }));
    expect(codes(dir, [{ file: "notile.png", kind: "beam" }])).toContain("S3D-E-612");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches a ribbon touching its own long edge", () => {
    const dir = tempDir();
    write(dir, "edge.png", beam(128, 32, { touchEdge: true }));
    expect(codes(dir, [{ file: "edge.png", kind: "beam" }])).toContain("S3D-E-613");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches a transparent skybox face", () => {
    const dir = tempDir();
    const face = skyFace(32, [90, 120, 180]);
    face.data[3] = 128;
    write(dir, "hole.png", face);
    expect(codes(dir, [{ file: "hole.png", kind: "sky", face: "ft", set: "s" }])).toContain("S3D-E-614");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches an incomplete cube set", () => {
    const dir = tempDir();
    write(dir, "sky_ft.png", skyFace(32, [90, 120, 180]));
    expect(
      codes(dir, [{ file: "sky_ft.png", kind: "sky", face: "ft", set: "sky" }]),
    ).toContain("S3D-E-616");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches a broken cube seam", () => {
    // Every face is flat and identical except `rt`, which is a different
    // colour — so ft.right cannot meet rt.left.
    const dir = tempDir();
    for (const face of ["ft", "bk", "lf", "rt", "up", "dn"]) {
      write(dir, `sky_${face}.png`, skyFace(32, face === "rt" ? [200, 40, 40] : [90, 120, 180]));
    }
    const specs: SheetSpec[] = ["ft", "bk", "lf", "rt", "up", "dn"].map((face) => ({
      file: `sky_${face}.png`,
      kind: "sky" as const,
      face: face as SheetSpec["face"],
      set: "sky",
    }));
    expect(codes(dir, specs)).toContain("S3D-E-615");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not demand full alpha from an additive sheet, but still does for an alpha sheet", () => {
    const dir = tempDir();
    const faded = flipbook(32, 2, 2);
    for (let i = 3; i < faded.data.length; i += 4) if (faded.data[i]! > 0) faded.data[i] = 120;
    write(dir, "add.png", faded);
    // Alpha blend: the missing hot-core error fires, as it always has.
    expect(codes(dir, [{ file: "add.png", kind: "sprite" }])).toContain("S3D-E-606");
    // Additive blend: alpha carries nothing, so the rule is correctly gated off.
    expect(
      codes(dir, [{ file: "add.png", kind: "sprite", blend: "additive" }]),
    ).not.toContain("S3D-E-606");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("warns when an additive sheet carries a bright border (the E-606 opt-out's price)", () => {
    const dir = tempDir();
    const img = blank(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) setPixel(img, x, y, [200, 200, 200, 80]);
    write(dir, "glow.png", img);
    expect(codes(dir, [{ file: "glow.png", kind: "sprite", blend: "additive" }])).toContain("S3D-W-605");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("warns when a flipbook's cells are not power-of-two, without the atlas error", () => {
    const dir = tempDir();
    write(dir, "cells.png", flipbook(96, 2, 2)); // 48px cells, atlas 96 — both non-POT
    const c = codes(dir, [{ file: "cells.png", kind: "flipbook", grid: [2, 2] }]);
    expect(c).toContain("S3D-W-604");
    // The atlas-POT error is suppressed: a flipbook is addressed by cell.
    expect(c).not.toContain("S3D-E-603");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a flipbook whose atlas is non-POT but whose cells are POT", () => {
    // 96 = 3 × 32: the atlas is not a power of two, but each cell is, so the
    // shader samples cleanly and the sheet must stay silent (the false
    // positive the atlas-only rule used to raise on legitimate flipbooks).
    const dir = tempDir();
    write(dir, "ok.png", dottedFlipbook(96, 3, 3));
    expect(codes(dir, [{ file: "ok.png", kind: "flipbook", grid: [3, 3] }])).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("catches a broken cap seam the horizontal ring cannot see", () => {
    // Every side face is identical, so the vertical ring is seam-perfect —
    // only the `up` cap is a different colour. A ring-only checker would pass
    // this; the 12-edge check catches it on a top-cap edge.
    const dir = tempDir();
    for (const face of ["ft", "bk", "lf", "rt", "up", "dn"]) {
      write(dir, `sky_${face}.png`, skyFace(32, face === "up" ? [200, 40, 40] : [90, 120, 180]));
    }
    const specs: SheetSpec[] = ["ft", "bk", "lf", "rt", "up", "dn"].map((face) => ({
      file: `sky_${face}.png`,
      kind: "sky" as const,
      face: face as SheetSpec["face"],
      set: "sky",
    }));
    expect(codes(dir, specs)).toContain("S3D-E-615");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports a declared sheet that does not exist", () => {
    const dir = tempDir();
    expect(codes(dir, [{ file: "ghost.png", kind: "sprite" }])).toContain("S3D-E-601");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports a file that is not decodable rather than throwing", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "broken.png"), Buffer.from("not a png at all"));
    expect(codes(dir, [{ file: "broken.png", kind: "sprite" }])).toContain("S3D-E-602");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

/**
 * Real production art, generated by an agent in an actual session and kept
 * verbatim.
 *
 * The generated fixtures above prove the rules have no false negatives:
 * each one catches its defect. This suite proves the other half, which is
 * the half that makes a linter usable — that a well-formed asset produces
 * silence. A rule set that flags real work is worse than no rule set,
 * because the first thing anyone does with a noisy gate is switch it off.
 */
describe("sheet rules against real production assets", () => {
  const real = path.join(__dirname, "fixtures", "sheets", "real");
  const specs: SheetSpec[] = [
    { file: "burst_ring.png", kind: "flipbook", grid: [4, 4], tint: true },
    { file: "streak.png", kind: "particle", tint: true },
    { file: "mote.png", kind: "particle", tint: true },
    { file: "beam_bolt.png", kind: "beam", tint: true },
    ...(["ft", "bk", "lf", "rt", "up", "dn"] as const).map((face) => ({
      file: `sky_day_${face}.png`,
      kind: "sky" as const,
      face,
      set: "sky_day",
    })),
  ];

  it("decodes every real asset", () => {
    const collected = collectSheets(real, specs);
    expect(collected.missing).toEqual([]);
    expect([...collected.unreadable.keys()]).toEqual([]);
    expect(collected.measurements.size).toBe(specs.length);
  });

  it("stays completely silent on all of them", () => {
    expect(codes(real, specs)).toEqual([]);
  });

  it("confirms the tintable art really is neutral", () => {
    const collected = collectSheets(real, specs);
    for (const file of ["streak.png", "mote.png", "beam_bolt.png", "burst_ring.png"]) {
      expect(collected.measurements.get(file)!.hueRatio).toBeLessThan(0.001);
    }
  });

  it("confirms the sky faces are fully opaque and seam-continuous", () => {
    const collected = collectSheets(real, specs);
    for (const face of ["ft", "bk", "lf", "rt", "up", "dn"]) {
      expect(collected.measurements.get(`sky_day_${face}.png`)!.nonOpaqueRatio).toBe(0);
    }
    // The seam rule ran as part of the silent-on-real-assets check above;
    // this pins the underlying measurement so a convention change is loud.
    const issues: Issue[] = [];
    lintSheets({ ...collected, seamTolerance: 1 }, issues);
    expect(issues.filter((i) => i.code === "S3D-E-615")).toEqual([]);
  });

  it("still catches a defect injected into a real asset", () => {
    // Take genuine production art, break one thing, and confirm the rule
    // fires — silence on real assets must be because they are correct, not
    // because the rules quietly do not run on them.
    const dir = tempDir();
    for (const spec of specs) {
      fs.copyFileSync(path.join(real, spec.file), path.join(dir, spec.file));
    }
    const sky = decodePng(fs.readFileSync(path.join(dir, "sky_day_rt.png")));
    for (let i = 3; i < sky.data.length; i += 4) sky.data[i] = 200; // punch a hole
    fs.writeFileSync(path.join(dir, "sky_day_rt.png"), encodePng(sky));
    expect(codes(dir, specs)).toContain("S3D-E-614");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("measureSheet", () => {
  it("reports hue only for visible pixels", () => {
    // Fully transparent coloured pixels must not count as baked hue: they
    // are invisible and would make every trimmed sprite fail the tint rule.
    const img = blank(4, 4);
    setPixel(img, 0, 0, [255, 0, 0, 0]);
    setPixel(img, 1, 1, [200, 200, 200, 255]);
    expect(measureSheet("x.png", img).hueRatio).toBe(0);
  });

  it("counts distinct cells so a static flipbook is detectable", () => {
    expect(measureSheet("f.png", flipbook(64, 2, 2), { grid: [2, 2] }).cells!.distinct).toBe(4);
    expect(
      measureSheet("f.png", flipbook(64, 2, 2, { static: true }), { grid: [2, 2] }).cells!.distinct,
    ).toBe(1);
  });

  it("sees a shape that ROTATED between frames", () => {
    // Pixel count, mean alpha and centroid are all invariant under rotation
    // about the centroid — which is what most flipbooks animate. A spinning
    // blade therefore read as ONE signature, and the atlas was reported a
    // static kernel (W-601) while plainly animating. Three arms rotating 90
    // degrees per cell is the minimal case: same pixels, different picture.
    const size = 64;
    const half = size / 2;
    const img = blank(size, size);
    const arms = [0, 120, 240].map((d) => (d * Math.PI) / 180);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * half;
      const oy = Math.floor(cell / 2) * half;
      const spin = (cell * Math.PI) / 2;
      for (const arm of arms) {
        for (let t = 2; t < half / 2 - 2; t++) {
          const x = Math.round(half / 2 + Math.cos(arm + spin) * t);
          const y = Math.round(half / 2 + Math.sin(arm + spin) * t);
          setPixel(img, ox + x, oy + y, [220, 220, 220, 255]);
        }
      }
    }
    expect(measureSheet("fan.png", img, { grid: [2, 2] }).cells!.distinct).toBe(4);
  });
});

describe("sheet thresholds are contract data", () => {
  // Every other lint family takes its thresholds from the contract. This one
  // only LOOKED like it did: `SheetLintInput.maxDimension` existed, the
  // comment beside the constant invited users to "reach for the override",
  // and nothing in the pipeline ever set it — there was no contract field to
  // set it FROM. So the check went through runLint, which is where the wiring
  // was dead, rather than through lintSheets, which was always fine.
  const sheetInput = (dir: string, specs: SheetSpec[]) => {
    const collected = collectSheets(dir, specs);
    return { ...collected, specs };
  };

  it("honours a project's own sheet size cap", () => {
    const dir = tempDir();
    // 64px: far under the 4096 default, so only a real override can flag it.
    write(dir, "s.png", skyFace(64, [200, 200, 200]));
    const specs: SheetSpec[] = [{ file: "s.png", kind: "sprite" }];

    const permissive: Issue[] = runLint({
      contract: normalizeContract({ schemaVersion: 1 }),
      sheets: sheetInput(dir, specs),
    });
    expect(permissive.map((i) => i.code)).not.toContain(ISSUE_CODES.SHEET_TOO_LARGE);

    const strict: Issue[] = runLint({
      contract: normalizeContract({
        schemaVersion: 1,
        conventions: { sheets: { maxDimension: 32 } },
      }),
      sheets: sheetInput(dir, specs),
    });
    expect(strict.map((i) => i.code)).toContain(ISSUE_CODES.SHEET_TOO_LARGE);
    expect(strict.find((i) => i.code === ISSUE_CODES.SHEET_TOO_LARGE)!.message).toContain("32px");
  });

  it("rejects a malformed sheet threshold rather than silently ignoring it", () => {
    // The whole point of the field being declared in the schema table.
    expect(
      validateContract({ schemaVersion: 1, conventions: { sheets: { maxDimension: "big" } } }),
    ).toContain("conventions.sheets.maxDimension must be a positive integer");
  });

  /*
   * The rest of the sheet family was the least contract-governed rule set in
   * the range: eight judgement numbers lived as bare literals inside
   * lint/sheet.ts with no contract path at all. Each pin below proves one of
   * them moved for real — an authored value flips the verdict — while every
   * fixture elsewhere in this file keeps its byte-identical outcome under the
   * (unchanged) defaults.
   */

  it("honours a raised particle border-touch tolerance", () => {
    const dir = tempDir();
    const img = blank(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) setPixel(img, x, y, [200, 200, 200, 255]);
    write(dir, "fills.png", img);
    const specs: SheetSpec[] = [{ file: "fills.png", kind: "particle" }];

    const strict: Issue[] = runLint({
      contract: normalizeContract({ schemaVersion: 1 }),
      sheets: sheetInput(dir, specs),
    });
    expect(strict.map((i) => i.code)).toContain(ISSUE_CODES.SHEET_BORDER_TOUCH);

    // The touching sprite is unchanged; only the tolerance moved, so a
    // project that genuinely wants edge-touching particles can say so.
    const permissive: Issue[] = runLint({
      contract: normalizeContract({
        schemaVersion: 1,
        conventions: { sheets: { particleBorderTouchMax: 200 } },
      }),
      sheets: sheetInput(dir, specs),
    });
    expect(permissive.map((i) => i.code)).not.toContain(ISSUE_CODES.SHEET_BORDER_TOUCH);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("honours a raised sky clip tolerance for an HDR-authored face", () => {
    const dir = tempDir();
    // A sky face with a small pure-white highlight band — the kind of clipped
    // specular an HDR-authored sky legitimately carries above the 0.2%
    // default, but well under a project that has decided to tolerate it.
    const face = skyFace(32, [90, 120, 180]);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 32; x++) setPixel(face, x, y, [255, 255, 255, 255]);
    }
    write(dir, "hdr_sky.png", face);
    const specs: SheetSpec[] = [{ file: "hdr_sky.png", kind: "sky", face: "ft", set: "hdr" }];

    const strict: Issue[] = runLint({
      contract: normalizeContract({ schemaVersion: 1 }),
      sheets: sheetInput(dir, specs),
    });
    expect(strict.map((i) => i.code)).toContain(ISSUE_CODES.SHEET_SKY_CLIPPED);

    const permissive: Issue[] = runLint({
      contract: normalizeContract({
        schemaVersion: 1,
        conventions: { sheets: { skyClipMax: 0.5 } },
      }),
      sheets: sheetInput(dir, specs),
    });
    expect(permissive.map((i) => i.code)).not.toContain(ISSUE_CODES.SHEET_SKY_CLIPPED);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("honours a lowered full-alpha floor for an intentionally translucent sheet", () => {
    const dir = tempDir();
    const faded = flipbook(32, 2, 2);
    for (let i = 3; i < faded.data.length; i += 4) if (faded.data[i]! > 0) faded.data[i] = 180;
    write(dir, "faded.png", faded);
    const specs: SheetSpec[] = [{ file: "faded.png", kind: "sprite" }];

    const strict: Issue[] = runLint({
      contract: normalizeContract({ schemaVersion: 1 }),
      sheets: sheetInput(dir, specs),
    });
    expect(strict.map((i) => i.code)).toContain(ISSUE_CODES.SHEET_NO_FULL_ALPHA);

    const permissive: Issue[] = runLint({
      contract: normalizeContract({
        schemaVersion: 1,
        conventions: { sheets: { fullAlphaMin: 150 } },
      }),
      sheets: sheetInput(dir, specs),
    });
    expect(permissive.map((i) => i.code)).not.toContain(ISSUE_CODES.SHEET_NO_FULL_ALPHA);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
