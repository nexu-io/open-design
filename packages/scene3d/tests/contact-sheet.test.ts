import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "../src/sheet/png.js";
import {
  GLYPH_H,
  GLYPH_W,
  drawText,
  fitText,
  textWidth,
  wrapText,
  type Surface,
} from "../src/read/font.js";
import {
  compassName,
  describeProofViews,
  orbitEye,
  projectDirection,
  turntableViews,
} from "../src/read/views.js";
import { renderContactSheet } from "../src/read/contact.js";

/**
 * The contact sheet and the orientation facts behind it.
 *
 * These pin the two claims the sheet makes that a reader cannot check for
 * themselves: that a frame's compass name really is where the camera stood,
 * and that a numbered badge really sits on the part it names. Everything else
 * here guards the ways the drawing has already gone wrong once — a glyph that
 * renders as the wrong letter, a label silently cut, output that changes
 * between two runs of the same compile.
 */

/** A blank RGBA surface, the shape the blitter writes into. */
function surface(width: number, height: number): Surface {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Which pixels of `text` are inked, as a set of "x,y" keys. */
function inked(text: string, scale = 1): Set<string> {
  const s = surface(textWidth(text, scale) + 4, GLYPH_H * scale + 4);
  drawText(s, text, 0, 0, [255, 255, 255, 255], scale);
  const on = new Set<string>();
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      if (s.data[(y * s.width + x) * 4 + 3]! > 0) on.add(`${x},${y}`);
    }
  }
  return on;
}

describe("font", () => {
  it("gives lowercase descenders their own rows, so 'p' is not 'P'", () => {
    /* The bug this pins produced `prp_plinth` as `PrP_Plinth` — a part name
       that matches nothing in any scene, printed on the artifact whose whole
       job is naming parts. `p` must ink rows below the baseline that `P`
       leaves blank, and must leave the top row `P` inks. */
    const lower = inked("p");
    const upper = inked("P");
    const rowsOf = (set: Set<string>) =>
      new Set([...set].map((key) => Number(key.split(",")[1])));
    const lowerRows = rowsOf(lower);
    const upperRows = rowsOf(upper);
    expect(upperRows.has(0)).toBe(true);
    expect(lowerRows.has(0)).toBe(false);
    // The descender bed exists and only the descenders reach it.
    expect(Math.max(...lowerRows)).toBeGreaterThan(Math.max(...upperRows));
  });

  it("distinguishes every lowercase letter from its capital", () => {
    /* `k` shipped identical to `K` and turned `prp_socket` into
       `prp_socKet`. Case is significant in part identifiers, so a face that
       cannot tell the two apart prints names that do not exist. */
    const same: string[] = [];
    for (const code of "abcdefghijklmnopqrstuvwxyz") {
      const lower = [...inked(code)].sort().join(" ");
      const upper = [...inked(code.toUpperCase())].sort().join(" ");
      if (lower === upper) same.push(code);
    }
    expect(same).toEqual([]);
  });

  it("renders an unknown character visibly rather than as a blank", () => {
    // A silently blank glyph reads as a shorter name; the reader then hunts
    // the manifest for a part that does not exist.
    expect(inked("Ж").size).toBeGreaterThan(0);
  });

  it("marks a truncated label so a cut name cannot read as a whole one", () => {
    const long = "prp_lantern_bracket_left";
    const cut = fitText(long, textWidth("prp_lan", 1), 1);
    expect(cut.endsWith("...")).toBe(true);
    expect(textWidth(cut, 1)).toBeLessThanOrEqual(textWidth("prp_lan", 1));
    // Text that fits is returned untouched — no gratuitous ellipsis.
    expect(fitText(long, 10_000, 1)).toBe(long);
  });

  it("wraps prose instead of cutting it", () => {
    const line = "azimuth 0 is front and increases toward positive X";
    const wrapped = wrapText(line, textWidth("azimuth 0 is front", 1), 1);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join(" ")).toBe(line);
  });

  it("scales by whole pixels, so a glyph has no interpolated edge", () => {
    const one = inked("A", 1);
    const two = inked("A", 2);
    // Every inked source pixel becomes exactly a 2x2 block.
    expect(two.size).toBe(one.size * 4);
    for (const key of one) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        expect(two.has(`${x * 2 + dx!},${y * 2 + dy!}`)).toBe(true);
      }
    }
  });

  it("keeps the cell five wide", () => {
    expect(GLYPH_W).toBe(5);
    expect(textWidth("AB", 1)).toBe(GLYPH_W * 2 + 1);
  });
});

describe("proof views", () => {
  it("puts azimuth 0 on -Y, which is the front", () => {
    /* The load-bearing convention. `orbit_offset` in runner.py places the
       camera at (cos e sin az, -cos e cos az, sin e); azimuth 0 therefore
       sits on -Y, Blender's own numpad-1 front view. Every compass name on
       the sheet and in the report is downstream of this one fact. */
    const eye = orbitEye(0, 30);
    expect(eye[0]).toBeCloseTo(0, 10);
    expect(eye[1]).toBeLessThan(0);
    expect(eye[2]).toBeGreaterThan(0);
  });

  it("sweeps front -> right -> back -> left as azimuth increases", () => {
    expect(turntableViews(8).map((v) => v.name)).toEqual([
      "front",
      "front-right",
      "right",
      "back-right",
      "back",
      "back-left",
      "left",
      "front-left",
    ]);
    // Right is +X: the orbit turns toward positive X, not away from it.
    expect(orbitEye(90, 0)[0]).toBeCloseTo(1, 10);
    // Back is +Y.
    expect(orbitEye(180, 0)[1]).toBeCloseTo(1, 10);
  });

  it("steps i/n, never i/(n-1), so the orbit does not repeat a pose", () => {
    // The runner loops the frames; a last frame equal to the first shows as
    // a stutter in playback.
    expect(turntableViews(6).map((v) => v.azimuthDeg)).toEqual([0, 60, 120, 180, 240, 300]);
  });

  it("marks an off-octant azimuth as approximate", () => {
    // A 6-step turntable lands on 60°, genuinely between two compass points.
    // Printing a bare `front-right` there claims a precision the frame lacks.
    expect(compassName(60)).toBe("~front-right");
    expect(compassName(45)).toBe("front-right");
    expect(compassName(360)).toBe("front");
    expect(compassName(-90)).toBe("left");
  });

  it("projects world axes onto the screen the way the camera sees them", () => {
    /* The gnomon's whole claim. From the front, world +X runs to screen
       right and +Z runs up (screen y is down, so up is negative). +Y points
       into the picture and must barely project at all. */
    const eye = orbitEye(0, 30);
    const x = projectDirection([1, 0, 0], eye);
    const z = projectDirection([0, 0, 1], eye);
    const y = projectDirection([0, 1, 0], eye);
    expect(x.x).toBeCloseTo(1, 6);
    expect(x.y).toBeCloseTo(0, 6);
    expect(z.y).toBeLessThan(-0.5);
    expect(Math.hypot(y.x, y.y)).toBeLessThan(0.6);

    // Seen from the right, world +Y takes over screen-right.
    const fromRight = orbitEye(90, 30);
    expect(projectDirection([0, 1, 0], fromRight).x).toBeCloseTo(1, 6);
  });

  it("refuses to name a pose the compiler never measured", () => {
    /* The honesty gate. A still through the AUTHOR's camera has no derivable
       azimuth, and labelling it `front · az 0°` would be a confident lie in
       exactly the case a reader most needs the truth. */
    expect(
      describeProofViews({ frameCount: 1, turntable: false, authoredCamera: true }),
    ).toBeUndefined();
    expect(
      describeProofViews({ frameCount: 8, turntable: true, authoredCamera: true }),
    ).toBeUndefined();
    expect(describeProofViews({ frameCount: 0, turntable: true })).toBeUndefined();
    expect(describeProofViews({ frameCount: 8, turntable: true })).toHaveLength(8);
  });

  it("names an authored still HONESTLY when the runner measured the camera pose", () => {
    // Absent beats a wrong name — but a MEASURED pose is not a guess, so an
    // author-placed camera earns a compass instead of silence.
    const authored = describeProofViews({
      frameCount: 1,
      turntable: false,
      authoredCamera: true,
      authoredAzimuthDeg: 135,
      authoredElevationDeg: 20,
    });
    expect(authored).toHaveLength(1);
    expect(authored![0]!.name).toBe("back-right"); // az 135
    expect(authored![0]!.azimuthDeg).toBe(135);
    expect(authored![0]!.elevationDeg).toBe(20);
    // Wrapped angles normalise; an authored MULTI-frame render is still not a
    // labelable orbit, pose or no pose.
    expect(
      describeProofViews({ frameCount: 1, turntable: false, authoredCamera: true, authoredAzimuthDeg: -225 })![0]!
        .name,
    ).toBe("back-right"); // -225 ≡ 135
    expect(
      describeProofViews({ frameCount: 3, turntable: false, authoredCamera: true, authoredAzimuthDeg: 90 }),
    ).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- *
 * Synthetic frames: a solid square in a known corner, plus the id
 * map that names it. Built rather than fixtured so the expected
 * badge position is arithmetic a reader can check in their head.
 * ---------------------------------------------------------------- */

const ID_STEPS = Array.from({ length: 8 }, (_, k) => Math.round((k * 255) / 7));

function idColour(code: number): [number, number, number] {
  return [
    ID_STEPS[Math.floor(code / 64) % 8]!,
    ID_STEPS[Math.floor(code / 8) % 8]!,
    ID_STEPS[code % 8]!,
  ];
}

/** A frame with one opaque block per part, laid out left to right. */
function syntheticFrames(size: number, partCount: number) {
  const beauty = { width: size, height: size, data: new Uint8Array(size * size * 4) };
  const ids = { width: size, height: size, data: new Uint8Array(size * size * 4) };
  const blockW = Math.floor(size / partCount);
  for (let part = 0; part < partCount; part++) {
    const [r, g, b] = idColour(part + 1);
    for (let y = Math.floor(size * 0.25); y < Math.floor(size * 0.75); y++) {
      for (let x = part * blockW; x < (part + 1) * blockW; x++) {
        const at = (y * size + x) * 4;
        beauty.data[at] = 200;
        beauty.data[at + 1] = 200;
        beauty.data[at + 2] = 200;
        beauty.data[at + 3] = 255;
        ids.data[at] = r;
        ids.data[at + 1] = g;
        ids.data[at + 2] = b;
        ids.data[at + 3] = 255;
      }
    }
  }
  return { png: encodePng(beauty), idPng: encodePng(ids) };
}

describe("id-map encoding agrees with the runner", () => {
  /* The badge placement decodes an image PYTHON wrote. Two languages hold
     the same constant, so nothing but a test stops them drifting — and the
     failure mode is silent and awful: every badge names the wrong part,
     confidently, on an artifact whose whole job is naming parts. So the
     Python source is read and its arithmetic re-derived here. */
  const here = path.dirname(fileURLToPath(import.meta.url));
  const runner = fs.readFileSync(
    path.join(here, "..", "scripts", "blender", "runner.py"),
    "utf8",
  );

  it("uses the same eight channel steps the runner encodes with", () => {
    const line = /^ID_STEPS = (.+)$/m.exec(runner)?.[1];
    expect(line).toBe("[round(k * 255 / 7) for k in range(8)]");
    // Python's round() is banker's rounding, but every k*255/7 here is far
    // from a .5 tie, so the two languages agree exactly. Spelled out rather
    // than recomputed so the expected values are readable.
    expect(ID_STEPS).toEqual([0, 36, 73, 109, 146, 182, 219, 255]);
  });

  it("splits a code into channels the same way the runner does", () => {
    const py = /r = ID_STEPS\[\(code \/\/ (\d+)\) % 8\]/.exec(runner)?.[1];
    const pg = /g = ID_STEPS\[\(code \/\/ (\d+)\) % 8\]/.exec(runner)?.[1];
    expect([py, pg]).toEqual(["64", "8"]);
    expect(/b = ID_STEPS\[code % 8\]/.test(runner)).toBe(true);
  });

  it("keeps neighbouring steps far enough apart to decode after filtering", () => {
    // The 36/37 gaps are what let a nearest-step decode survive dithering
    // and codec rounding. Narrow them and badges start landing on the
    // wrong part rather than failing loudly.
    for (let k = 1; k < ID_STEPS.length; k++) {
      expect(ID_STEPS[k]! - ID_STEPS[k - 1]!).toBeGreaterThanOrEqual(36);
    }
  });
});

describe("contact sheet", () => {
  const names = ["prp_alpha", "prp_beta", "prp_gamma"];
  const built = syntheticFrames(128, names.length);
  const views = turntableViews(4);
  const frames = views.map((view) => ({ png: built.png, idPng: built.idPng, view }));

  it("legends exactly the parts the orbit actually shows", () => {
    const sheet = renderContactSheet({ title: "t", frames, idParts: names, cellPx: 200 });
    expect(sheet.legend.map((e) => e.part)).toEqual(names);
    expect(sheet.legend.map((e) => e.badge)).toEqual([1, 2, 3]);
    expect(sheet.neverVisible).toEqual([]);
  });

  it("reports a part no frame shows instead of dropping it", () => {
    /* A part present in the census and invisible from every angle is
       enclosed or fully occluded — a fact about the SCENE that no render
       review can otherwise surface. Silently omitting it from the legend
       would hide exactly that. */
    const sheet = renderContactSheet({
      title: "t",
      frames,
      idParts: [...names, "prp_buried"],
      cellPx: 200,
    });
    expect(sheet.neverVisible).toEqual(["prp_buried"]);
    expect(sheet.legend.map((e) => e.part)).not.toContain("prp_buried");
  });

  it("is byte-identical across runs of the same input", () => {
    // The sheet is a compile artifact; a reader must be able to diff two
    // compiles and have the difference mean something.
    const a = renderContactSheet({ title: "t", frames, idParts: names, cellPx: 200 });
    const b = renderContactSheet({ title: "t", frames, idParts: names, cellPx: 200 });
    expect(Buffer.from(a.png).equals(Buffer.from(b.png))).toBe(true);
  });

  it("draws a labelled blank for a frame it cannot decode, never a gap", () => {
    const broken = [
      { png: new Uint8Array([0, 1, 2, 3]), view: views[0]! },
      ...frames.slice(1),
    ];
    const sheet = renderContactSheet({ title: "t", frames: broken, idParts: names, cellPx: 200 });
    // It still renders, still legends the parts the readable frames show.
    expect(sheet.legend.length).toBeGreaterThan(0);
    expect(decodePng(sheet.png).width).toBe(sheet.width);
  });

  it("still orients without id maps, it just cannot name shapes", () => {
    const bare = views.map((view) => ({ png: built.png, view }));
    const sheet = renderContactSheet({ title: "t", frames: bare, idParts: names, cellPx: 200 });
    expect(sheet.legend).toEqual([]);
    // Every declared part is reported unshown rather than silently forgotten.
    expect(sheet.neverVisible).toEqual(names);
  });

  it("produces a decodable PNG whose reported size matches its pixels", () => {
    const sheet = renderContactSheet({ title: "t", frames, idParts: names, cellPx: 200 });
    const image = decodePng(sheet.png);
    expect([image.width, image.height]).toEqual([sheet.width, sheet.height]);
    // Nothing is transparent: the sheet is a page, not an overlay.
    let clear = 0;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! < 255) clear++;
    expect(clear).toBe(0);
  });
});
