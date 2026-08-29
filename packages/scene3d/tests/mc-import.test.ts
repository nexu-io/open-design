import { describe, expect, it } from "vitest";
import { importJavaModel } from "../src/mc/import-java.js";
import { rotationToMc } from "../src/mc/common.js";
import { encodePng } from "../src/sheet/png.js";

/**
 * The Java-model import in isolation — pure JSON → scene-spec, no Blender. The
 * POSITION half of the coordinate map is the exact inverse of the exporter's,
 * validated end-to-end (from/to byte-for-byte) by the round-trip pipeline test;
 * that fixture carries no rotated element, so the ROTATION half of the inverse
 * is closed here instead (`import ∘ export` on every MC axis). This also pins
 * material resolution and the skip semantics for what scene.json cannot express.
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

  it("imports a single-axis rotated element as a rotate part, exactly", () => {
    // The skip this test used to pin predates the language's `rotate`: a
    // Java element rotation IS single-axis with local extents kept, which
    // is `rotate` verbatim. Expectations computed independently: the post's
    // MC centre [1, 8, 1] pivots 45° about MC-y at origin [8, 8, 8] to
    // [8 − 14·√½, 8, 8] ≈ [−1.8995, 8, 8]; the frame map (x, −z, y)/16
    // lands it at [−0.11872, −0.5, 0.5]; MC-y maps to Blender-z with the
    // angle preserved.
    const model = {
      elements: [
        { name: "post", from: [0, 0, 0], to: [2, 16, 2], rotation: { angle: 45, axis: "y", origin: [8, 8, 8] }, faces: {} },
        { name: "base", from: [0, 0, 0], to: [16, 4, 16], faces: {} },
      ],
    };
    const { spec, skipped } = importJavaModel(model);
    expect(skipped).toHaveLength(0);
    expect(spec!.parts).toHaveLength(2);
    const post = spec!.parts.find((p) => p.id.includes("post"))!;
    expect(post.rotate).toEqual({ axis: "z", deg: 45 });
    expect(post.size).toEqual([2 / 16, 2 / 16, 1]); // LOCAL extents, unrotated
    const at = spec!.relations.find(
      (r) => r.part === post.id && r.type === "at",
    ) as { center: [number, number, number] };
    expect(at.center[0]).toBeCloseTo((8 - 14 * Math.SQRT1_2) / 16, 5);
    expect(at.center[1]).toBeCloseTo(-0.5, 9);
    expect(at.center[2]).toBeCloseTo(0.5, 9);
  });

  it("still skips what rotate cannot express: rescale and multi-axis eulers", () => {
    const { spec, skipped } = importJavaModel({
      elements: [
        { name: "stretched", from: [0, 0, 0], to: [4, 4, 4], rotation: { angle: 45, axis: "y", rescale: true }, faces: {} },
        { name: "tumbled", from: [0, 0, 0], to: [4, 4, 4], rotation: [45, 45, 0], faces: {} },
      ],
    });
    expect(spec).toBeNull(); // nothing importable
    expect(skipped).toHaveLength(2);
    expect(skipped[0]!.reason).toContain("rescale");
    expect(skipped[1]!.reason).toContain("more than one axis");
  });

  it("round-trips a rotation through import ∘ export on every MC axis", () => {
    // The golem fixture (the byte-for-byte pipeline round-trip) carries NO
    // rotated element, so this is the only place the rotation half of
    // `import(export(x))` is closed: import an element rotated about its OWN
    // centre (so from/to is stable under the round-trip), read the Blender-axis
    // rotate the language emits, then send it back through the exporter's
    // rotationToMc — the composition must land on the original MC axis+angle.
    // A sign flip on any single axis would break here and nowhere else in the
    // fast suite.
    for (const mc of [
      { axis: "x", angle: 45 },
      { axis: "y", angle: 22.5 },
      { axis: "z", angle: -22.5 },
    ] as const) {
      // A 4×4×4 box centred at the block centre [8,8,8], rotated about that
      // same point — origin == centre keeps the placement fixed, isolating the
      // axis/angle map from the pivot translation.
      const { spec, skipped } = importJavaModel({
        elements: [
          { name: `r_${mc.axis}`, from: [6, 6, 6], to: [10, 10, 10], rotation: { angle: mc.angle, axis: mc.axis, origin: [8, 8, 8] }, faces: {} },
        ],
      });
      expect(skipped).toHaveLength(0);
      const part = spec!.parts[0]!;
      expect(part.rotate).toBeDefined();
      // The exporter maps the Blender-axis rotate back to MC; it must be the
      // element we started from.
      const back = rotationToMc(part.rotate!.axis, part.rotate!.deg);
      expect(back).toEqual({ axis: mc.axis, angle: mc.angle });
    }
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
    // A rotation with no origin defaults to the block centre [8, 8, 8] and
    // imports (it used to be a skip — see the rotate round-trip pin above).
    const rotated = importJavaModel({
      elements: [{ from: [0, 0, 0], to: [1, 1, 1], rotation: { angle: 22.5, axis: "y" }, faces: {} }],
    });
    expect(rotated.spec).not.toBeNull();
    expect(rotated.spec!.parts[0]!.rotate).toEqual({ axis: "z", deg: 22.5 });
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

describe("texture resolution hardening (bug-shaker round)", () => {
  it("chases Java texture alias chains to the real reference", () => {
    // `textures.all = "#stone"` is legal indirection; one flat lookup
    // stopped at the alias and fell to the neutral placeholder while the
    // real texture sat in the map.
    const calls: string[] = [];
    const { spec } = importJavaModel(
      {
        textures: { all: "#stone", stone: "block/stone_top" },
        elements: [
          { name: "slab", from: [0, 0, 0], to: [16, 8, 16], faces: { up: { texture: "#all" } } },
        ],
      },
      {
        resolveTexture: (ref) => {
          calls.push(ref);
          return undefined; // resolution fails, but the CHAIN must be followed
        },
      },
    );
    expect(spec).not.toBeNull();
    // The resolver was offered the alias-resolved key, not only the alias.
    expect(calls.some((c) => c.includes("stone"))).toBe(true);
  });

  it("recovers the real texture through the alias chain, full mapped path included", () => {
    // The chain-following test above keeps its resolver failing on purpose;
    // this one proves RECOVERY — a regression that requests the resolved
    // alias but still assigns the placeholder passes that test and fails
    // here. The resolver is keyed by the FULL mapped resource path
    // ("block/stone_top"), which used to be offered only as a basename.
    const red = solidPng(255, 0, 0);
    const { spec, warnings } = importJavaModel(
      {
        textures: { all: "#stone", stone: "block/stone_top" },
        elements: [
          { name: "slab", from: [0, 0, 0], to: [16, 8, 16], faces: { up: { texture: "#all" } } },
        ],
      },
      { resolveTexture: (ref) => (ref === "block/stone_top" ? red : undefined) },
    );
    expect(spec).not.toBeNull();
    expect(warnings.filter((w) => w.includes("placeholder"))).toEqual([]);
    const mat = spec!.materials[spec!.parts[0]!.material!]!;
    expect(mat.baseColor[0]).toBeGreaterThan(0.5); // the red texture, not the grey placeholder
    expect(mat.baseColor[1]).toBeLessThan(0.3);
  });

  it("keeps distinct resolved textures on distinct materials despite sanitised collisions", () => {
    // `a-b` and `a_b` both sanitise to `a_b`; the second used to overwrite
    // the first in the materials record and parts with different textures
    // shared the wrong colour. (UNRESOLVED refs still deliberately collapse
    // onto one placeholder — the compiler cannot tell those apart and says
    // so once; this pins the resolved case, where it can.)
    const red = solidPng(255, 0, 0);
    const blue = solidPng(0, 0, 255);
    const { spec } = importJavaModel(
      {
        textures: { "a-b": "block/a-b", a_b: "block/a_b" },
        elements: [
          { name: "one", from: [0, 0, 0], to: [4, 4, 4], faces: { up: { texture: "#a-b" } } },
          { name: "two", from: [8, 0, 0], to: [12, 4, 4], faces: { up: { texture: "#a_b" } } },
        ],
      },
      { resolveTexture: (ref) => (ref.includes("a-b") ? red : ref.includes("a_b") ? blue : undefined) },
    );
    expect(spec).not.toBeNull();
    const mats = spec!.parts.map((p) => p.material!);
    expect(new Set(mats).size).toBe(2);
    const c0 = spec!.materials[mats[0]!]!.baseColor;
    const c1 = spec!.materials[mats[1]!]!.baseColor;
    expect(c0[0]).toBeGreaterThan(c0[2]); // one red-dominant…
    expect(c1[2]).toBeGreaterThan(c1[0]); // …one blue-dominant
  });
});

describe("non-finite rotation refusals (bug-shaker round)", () => {
  it("skips an element whose rotation angle is NaN or Infinity, loudly", () => {
    // Red before the fix: `typeof rot.angle === "number"` admitted NaN,
    // which rode cos/sin into non-finite centres in the returned spec.
    for (const angle of [NaN, Infinity]) {
      const { spec, skipped } = importJavaModel({
        textures: {},
        elements: [
          {
            name: "bad",
            from: [0, 0, 0],
            to: [16, 16, 16],
            rotation: { angle, axis: "y", origin: [8, 8, 8] },
            faces: {},
          },
          { name: "good", from: [0, 0, 0], to: [16, 8, 16], faces: {} },
        ],
      });
      expect(spec).not.toBeNull();
      expect(spec!.parts).toHaveLength(1);
      expect(skipped.some((s) => s.reason.includes("not a finite number"))).toBe(true);
    }
  });

  it("skips an element whose rotation array carries a non-finite value", () => {
    const { spec, skipped } = importJavaModel({
      textures: {},
      elements: [
        { name: "bad", from: [0, 0, 0], to: [16, 16, 16], rotation: [0, NaN, 0], faces: {} },
      ],
    });
    expect(spec === null || spec.parts.length === 0).toBe(true);
    expect(skipped.some((s) => s.reason.includes("non-finite"))).toBe(true);
  });

  it("names every format field it cannot carry — model-, element- and face-level — instead of dropping them silently", () => {
    // The importer's own doctrine is "faithful, not lossy-silent"; this pins
    // the fields scene.json genuinely has no word for, at all three scopes
    // the Java model format spreads them across.
    const { spec, warnings } = importJavaModel({
      parent: "block/cube_all",
      display: { gui: { rotation: [30, 45, 0] } },
      ambientocclusion: false,
      gui_light: "front",
      textures: { face: "block/face" },
      elements: [
        {
          name: "tinted",
          shade: false,
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: {
            up: {
              texture: "#face",
              uv: [0, 0, 8, 8],
              rotation: 90,
              cullface: "up",
              tintindex: 0,
            },
          },
        },
      ],
    });
    expect(spec).not.toBeNull();
    expect(spec!.parts).toHaveLength(1); // geometry still imports exactly
    const joined = warnings.join(" | ");
    expect(joined).toContain("'parent'");
    expect(joined).toContain("'display'");
    expect(joined).toContain("'ambientocclusion'");
    expect(joined).toContain("'gui_light'");
    expect(joined).toContain("'uv'");
    expect(joined).toContain("'rotation'");
    expect(joined).toContain("'cullface'");
    expect(joined).toContain("'tintindex'");
    expect(joined).toContain("'shade'");
  });

  it("stays quiet about format fields the model never used", () => {
    // A resolvable texture, so the only warning in play is the one under
    // test — an unresolved texture legitimately warns on its own channel,
    // which isn't what this test is pinning.
    const png = solidPng(120, 80, 40);
    const { warnings } = importJavaModel(
      {
        textures: { face: "block/face" },
        elements: [{ name: "plain", from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: "#face" } } }],
      },
      { resolveTexture: (ref) => (ref === "block/face" ? png : undefined) },
    );
    expect(warnings).toEqual([]);
  });
});
