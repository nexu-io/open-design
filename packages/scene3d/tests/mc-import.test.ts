import { describe, expect, it } from "vitest";
import { importJavaModel } from "../src/mc/import-java.js";
import { encodePng } from "../src/sheet/png.js";

/**
 * The Java-model import in isolation — pure JSON → scene-spec, no Blender. The
 * coordinate map is the exact inverse of the exporter's (validated end-to-end
 * by the round-trip pipeline test); this pins the conversion, material
 * resolution, and the skip semantics for what scene.json cannot represent.
 */

function solidPng(r: number, g: number, b: number): Uint8Array {
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return encodePng({ width: 16, height: 16, data });
}

describe("importJavaModel", () => {
  it("inverts the exporter's frame map: an element's px → a box in metres", () => {
    // The golem head as the exporter emits it: from [-3,18,-3] to [3,24,3].
    const model = {
      elements: [{ name: "head", from: [-3, 18, -3], to: [3, 24, 3], faces: { up: { texture: "#face" } } }],
      textures: { face: "block/face" },
    };
    const { spec, skipped } = importJavaModel(model);
    expect(skipped).toEqual([]);
    expect(spec!.parts).toHaveLength(1);
    // Inverse map: dims [6,6,6]px → [0.375,0.375,0.375]m; centre [0,21,0]px →
    // Blender (X,-Z,Y)/16 = [0, 0, 1.3125].
    expect(spec!.parts[0]!.size).toEqual([0.375, 0.375, 0.375]);
    expect(spec!.relations[0]!.center).toEqual([0, 0, 1.3125]);
    expect(spec!.parts[0]!.shape).toBe("box");
  });

  it("recovers a flat base colour from a resolvable texture, in linear space", () => {
    // A mid-grey sRGB texture (188) → linear ~0.5.
    const model = { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: "#body" } } }], textures: { body: "block/body" } };
    const png = solidPng(188, 188, 188);
    const { spec } = importJavaModel(model, { resolveTexture: (ref) => (ref === "body" ? png : undefined) });
    const mat = Object.values(spec!.materials)[0]!;
    expect(mat.baseColor[0]).toBeGreaterThan(0.48);
    expect(mat.baseColor[0]).toBeLessThan(0.52);
  });

  it("falls back to a neutral placeholder when a texture cannot be resolved", () => {
    const model = { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: "#missing" } } }], textures: {} };
    const { spec, warnings } = importJavaModel(model);
    expect(Object.values(spec!.materials)[0]!.baseColor).toEqual([0.6, 0.6, 0.6]);
    expect(warnings.some((w) => w.includes("missing"))).toBe(true);
  });

  it("decodes an embedded Blockbench data-URI texture", () => {
    const png = solidPng(0, 128, 255);
    const dataUri = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
    const model = {
      elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: "#0" } } }],
      textures: [{ id: "0", name: "sky", source: dataUri }],
    };
    const { spec } = importJavaModel(model);
    const c = Object.values(spec!.materials)[0]!.baseColor;
    expect(c[2]).toBeGreaterThan(c[0]); // blue-dominant, as authored
  });

  it("skips a rotated element rather than importing it at the wrong orientation", () => {
    const model = {
      elements: [
        { name: "post", from: [0, 0, 0], to: [2, 16, 2], rotation: { angle: 45, axis: "y", origin: [8, 8, 8] }, faces: {} },
        { name: "base", from: [0, 0, 0], to: [16, 4, 16], faces: {} },
      ],
    };
    const { spec, skipped } = importJavaModel(model);
    expect(spec!.parts).toHaveLength(1); // only the un-rotated base
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toContain("rotated");
  });

  it("skips a degenerate (zero-extent) element", () => {
    const model = { elements: [{ from: [0, 0, 0], to: [0, 16, 16], faces: {} }, { from: [0, 0, 0], to: [16, 16, 16], faces: {} }] };
    const { spec, skipped } = importJavaModel(model);
    expect(spec!.parts).toHaveLength(1);
    expect(skipped[0]!.reason).toContain("extent");
  });

  it("rejects a non-model with a clear reason, not a throw", () => {
    expect(importJavaModel({ foo: "bar" }).spec).toBeNull();
    expect(importJavaModel(null).spec).toBeNull();
    expect(importJavaModel({ elements: [{ from: [0, 0, 0], to: [1, 1, 1], rotation: { angle: 22.5, axis: "y" }, faces: {} }] }).spec).toBeNull();
  });

  it("terminates on duplicate names long enough to fill the id budget", () => {
    // A 58-char element name makes `prp_` + name exactly 62 chars. Appending
    // `_2` and slicing the JOINED string back to 63 collapses every candidate
    // onto one value, so the uniquifier used to spin forever — synchronously,
    // in TypeScript, before any Blender watchdog exists. A dropped-in .bbmodel
    // could wedge the compile promise (and the daemon route) permanently.
    const name = "e".repeat(58);
    const model = {
      elements: Array.from({ length: 12 }, () => ({ from: [0, 0, 0], to: [16, 16, 16], name, faces: {} })),
    };
    const { spec } = importJavaModel(model);
    const ids = spec!.parts.map((p) => p.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_]{2,63}$/);
  });

  it("gives every part a schema-valid unique id", () => {
    const model = {
      elements: [
        { name: "Left Arm!", from: [0, 0, 0], to: [4, 4, 4], faces: {} },
        { name: "Left Arm!", from: [4, 0, 0], to: [8, 4, 4], faces: {} },
      ],
    };
    const { spec } = importJavaModel(model);
    const ids = spec!.parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(2); // unique
    for (const id of ids) expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_]{2,63}$/);
  });

  it("names the faces it could not bring across", () => {
    // A furnace, a crafting table, any block with a distinct top: different
    // texture per face is ordinary Minecraft. scene.json binds ONE material
    // per part, so the others genuinely cannot come along — but this module's
    // docblock promises "faithful, not lossy-silent", and it was dropping five
    // of six faces without a word, right beside a rotated-element skip that
    // reports itself properly.
    const model = {
      textures: { top: "block/furnace_top", side: "block/furnace_side", front: "block/furnace_front" },
      elements: [
        {
          name: "furnace",
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: {
            up: { texture: "#top" },
            down: { texture: "#top" },
            north: { texture: "#front" },
            south: { texture: "#side" },
            east: { texture: "#side" },
            west: { texture: "#side" },
          },
        },
      ],
    };
    const { spec, warnings } = importJavaModel(model);
    expect(spec).not.toBeNull();
    const note = warnings.find((w) => w.includes("texture per face"));
    expect(note, "the loss must be reported").toBeDefined();
    expect(note).toContain("furnace");
    // Names what survived AND what did not, so the reader can act on it.
    expect(note).toContain("side");
    expect(note).toContain("front");
    expect(note).toContain("top");
  });

  it("says nothing when every face shares one texture", () => {
    const model = {
      textures: { all: "block/stone" },
      elements: [
        {
          name: "stone",
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: { up: { texture: "#all" }, down: { texture: "#all" }, north: { texture: "#all" } },
        },
      ],
    };
    expect(importJavaModel(model).warnings.filter((w) => w.includes("texture per face"))).toEqual([]);
  });
});
