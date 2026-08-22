import { describe, expect, it } from "vitest";
import { findCoplanarFaces, solveScene } from "../src/solve/solver.js";
import { emitBlenderScript, frameScene } from "../src/solve/emit-bpy.js";
import { MIN_CONTACT, SceneSpec } from "../src/solve/types.js";

/**
 * The crate from the real session, expressed as relations instead of
 * coordinates. Every number here is a *dimension* or a *joint tolerance* —
 * there is not one placement coordinate in the whole spec, which is the
 * entire point.
 */
function crate(overrides: Partial<{ postHeight: number }> = {}): SceneSpec {
  const postHeight = overrides.postHeight ?? 0.5;
  return {
    schemaVersion: 1,
    parts: [
      { id: "prp_crate_base", size: [0.9, 0.6, 0.08], material: "mtl_wood_body", role: "base" },
      { id: "prp_post_nw", size: [0.05, 0.05, postHeight], material: "mtl_wood_body", role: "post" },
      { id: "prp_post_ne", size: [0.05, 0.05, postHeight], material: "mtl_wood_body", role: "post" },
      { id: "prp_slat_north", size: [0.1, 0.02, 0.12], material: "mtl_wood_body", role: "slat" },
      { id: "prp_crate_lid", size: [0.92, 0.62, 0.06], material: "mtl_iron_band", role: "lid" },
    ],
    relations: [
      { type: "at", part: "prp_crate_base", center: [0, 0, 0.04] },
      { type: "sits_on", part: "prp_post_nw", on: "prp_crate_base", embed: 0.006 },
      { type: "inset_from", part: "prp_post_nw", from: "prp_crate_base", faces: ["x-", "y-"], by: 0.004 },
      { type: "sits_on", part: "prp_post_ne", on: "prp_crate_base", embed: 0.006 },
      { type: "inset_from", part: "prp_post_ne", from: "prp_crate_base", faces: ["x+", "y-"], by: 0.004 },
      { type: "span", part: "prp_slat_north", from: "prp_post_nw", to: "prp_post_ne", axis: "x", embed: 0.003 },
      { type: "align", part: "prp_slat_north", to: "prp_post_nw", axes: ["y"] },
      { type: "sits_on", part: "prp_slat_north", on: "prp_crate_base", embed: 0.002 },
      { type: "above", part: "prp_crate_lid", over: "prp_post_nw", clearance: 0.002 },
      { type: "align", part: "prp_crate_lid", to: "prp_crate_base", axes: ["x", "y"] },
    ],
  };
}

describe("solveScene", () => {
  it("resolves every part with no diagnostics", () => {
    const solved = solveScene(crate());
    expect(solved.diagnostics).toEqual([]);
    expect(solved.parts).toHaveLength(5);
  });

  it("makes coplanar faces structurally impossible", () => {
    // The guarantee the whole layer exists for: a scene built from relations
    // cannot produce the configuration S3D-E-324 detects.
    expect(findCoplanarFaces(solveScene(crate()))).toEqual([]);
  });

  it("sinks a part into its support rather than resting flush on it", () => {
    const solved = solveScene(crate());
    const base = solved.parts.find((p) => p.id === "prp_crate_base")!;
    const post = solved.parts.find((p) => p.id === "prp_post_nw")!;
    const baseTop = base.center[2] + base.size[2] / 2;
    const postBottom = post.center[2] - post.size[2] / 2;
    expect(baseTop - postBottom).toBeCloseTo(0.006, 9);
  });

  it("insets side faces so they are not flush either", () => {
    const solved = solveScene(crate());
    const base = solved.parts.find((p) => p.id === "prp_crate_base")!;
    const post = solved.parts.find((p) => p.id === "prp_post_nw")!;
    const baseMinX = base.center[0] - base.size[0] / 2;
    const postMinX = post.center[0] - post.size[0] / 2;
    expect(postMinX - baseMinX).toBeCloseTo(0.004, 9);
  });

  it("spans a slat between two posts, biting into both", () => {
    const solved = solveScene(crate());
    const slat = solved.parts.find((p) => p.id === "prp_slat_north")!;
    const nw = solved.parts.find((p) => p.id === "prp_post_nw")!;
    const ne = solved.parts.find((p) => p.id === "prp_post_ne")!;
    // Reaches past each post's inner face by the embed on both ends.
    const expected = (ne.center[0] - ne.size[0] / 2) - (nw.center[0] + nw.size[0] / 2) + 0.006;
    expect(slat.size[0]).toBeCloseTo(expected, 9);
  });

  it("seats the lid above the posts with a measured clearance", () => {
    const solved = solveScene(crate());
    const post = solved.parts.find((p) => p.id === "prp_post_nw")!;
    const lid = solved.parts.find((p) => p.id === "prp_crate_lid")!;
    const gap = (lid.center[2] - lid.size[2] / 2) - (post.center[2] + post.size[2] / 2);
    expect(gap).toBeCloseTo(0.002, 9);
  });

  it("re-solves the whole model when one dimension changes", () => {
    // "Make the posts 30% taller" — one edit, everything anchored above moves.
    const base = solveScene(crate({ postHeight: 0.5 }));
    const taller = solveScene(crate({ postHeight: 0.65 }));
    const lidOf = (s: typeof base) => s.parts.find((p) => p.id === "prp_crate_lid")!.center[2];
    expect(taller.parts.find((p) => p.id === "prp_crate_base")!.center[2]).toBeCloseTo(
      base.parts.find((p) => p.id === "prp_crate_base")!.center[2],
      9,
    );
    expect(lidOf(taller) - lidOf(base)).toBeCloseTo(0.15, 9);
    expect(findCoplanarFaces(taller)).toEqual([]);
  });

  it("floors a zero contact offset instead of emitting flush faces", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [1, 1, 0.1] },
        { id: "prp_block", size: [0.5, 0.5, 0.2] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0] },
        { type: "sits_on", part: "prp_block", on: "prp_slab", embed: 0 },
        { type: "align", part: "prp_block", to: "prp_slab", axes: ["x", "y"] },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-EPSILON-FLOOR");
    expect(findCoplanarFaces(solved)).toEqual([]);
    const slab = solved.parts.find((p) => p.id === "prp_slab")!;
    const block = solved.parts.find((p) => p.id === "prp_block")!;
    expect(slab.center[2] + slab.size[2] / 2 - (block.center[2] - block.size[2] / 2)).toBeCloseTo(
      MIN_CONTACT,
      9,
    );
  });

  it("is independent of the order relations are written in", () => {
    const spec = crate();
    const shuffled: SceneSpec = { ...spec, relations: [...spec.relations].reverse() };
    expect(solveScene(shuffled).parts).toEqual(solveScene(spec).parts);
  });

  it("reports an unanchored part instead of guessing a placement", () => {
    const solved = solveScene({
      schemaVersion: 1,
      parts: [{ id: "prp_floating", size: [1, 1, 1] }],
      relations: [],
    });
    expect(solved.parts).toEqual([]);
    expect(solved.diagnostics[0]!.code).toBe("SOLVE-UNRESOLVED");
  });

  it("reports a reference to a part that does not exist", () => {
    const solved = solveScene({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1] }],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0] },
        { type: "sits_on", part: "prp_a", on: "prp_ghost" },
      ],
    });
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-UNKNOWN-PART");
  });

  it("reports a conflict rather than letting the last relation win silently", () => {
    const solved = solveScene({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1] }],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0] },
        { type: "at", part: "prp_a", center: [5, 0, 0] },
      ],
    });
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-CONFLICT");
    expect(solved.parts[0]!.center[0]).toBe(0);
  });
});

describe("emitBlenderScript", () => {
  it("emits one named part per solved part", () => {
    const script = emitBlenderScript(solveScene(crate()));
    expect(script).toContain('_part("prp_crate_base", "box"');
    expect(script).toContain('_part("prp_crate_lid", "box"');
    // Names come from the spec, so a Blender default name cannot appear.
    expect(script).not.toMatch(/Cube\.\d/);
  });

  it("is byte-stable for an unchanged spec", () => {
    expect(emitBlenderScript(solveScene(crate()))).toBe(emitBlenderScript(solveScene(crate())));
  });

  it("derives the camera from the solved bounds rather than a literal", () => {
    const small = frameScene(solveScene(crate()));
    const script = emitBlenderScript(solveScene(crate()));
    expect(script).toContain('cam.name = "cam_hero"');
    // The framing distance scales with the subject, so a model authored at a
    // different scale is still fully in shot.
    expect(small.radius).toBeGreaterThan(0);
    expect(Math.hypot(...small.location)).toBeGreaterThan(small.radius);
  });

  it("scales the key light to the subject", () => {
    const script = emitBlenderScript(solveScene(crate()));
    expect(script).toContain('key.name = "lgt_key"');
    expect(script).toContain("key.data.energy");
  });
});

describe("the solver's own output is checked, not assumed", () => {
  /** One part, placed, plus whatever relations the case needs. */
  const scene = (relations: unknown[], size = [1, 1, 1]): SceneSpec =>
    ({
      schemaVersion: 1,
      parts: [{ id: "prp_block", size }],
      relations: [{ type: "at", part: "prp_block", center: [0, 0, size[2]! / 2] }, ...relations],
    }) as SceneSpec;

  it("reports repeat instances that land inside each other", () => {
    // `every: 0.5` on a 1m box ships three boxes overlapping by half a metre
    // each. It used to compile ok:true with an empty diagnostics list: the
    // coplanar rule stays silent because interpenetrating faces are not
    // coplanar, and no rule owned "these are simply inside each other".
    const solved = solveScene(
      scene([{ type: "repeat", part: "prp_block", count: 3, along: "x", every: 0.5 }]),
    );
    const hit = solved.diagnostics.filter((d) => d.code === "SOLVE-INTERSECTION");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.message).toContain("0.5000");
    expect(hit[0]!.message).toContain("x");
    // Still buildable — this is a warning about geometry, not an unsolvable
    // graph, and the author may be told rather than blocked.
    expect(solved.parts).toHaveLength(3);
  });

  it("stays silent when the pitch clears the part", () => {
    const solved = solveScene(
      scene([{ type: "repeat", part: "prp_block", count: 3, along: "x", every: 1.5 }]),
    );
    expect(solved.diagnostics.filter((d) => d.code === "SOLVE-INTERSECTION")).toEqual([]);
  });

  it("does not police interpenetration the author wrote by hand", () => {
    // Overlapping a junction by a pixel is how a careful modeller avoids
    // z-fighting; the golem fixture is built that way on purpose. Only
    // instances the SOLVER generated are its responsibility.
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [1, 1, 1] },
        { id: "prp_b", size: [1, 1, 1] },
      ],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0.5] },
        { type: "at", part: "prp_b", center: [0.5, 0, 0.5] },
      ],
    } as SceneSpec);
    expect(solved.diagnostics).toEqual([]);
  });

  it("refuses a span whose anchors already overlap", () => {
    // lo/hi invert when the anchors intersect, and the same arithmetic then
    // returns the OVERLAP region: a beam inside both anchors at roughly twice
    // the intended size, silently.
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [2, 2, 2] },
        { id: "prp_b", size: [2, 2, 2] },
        { id: "prp_span", size: [0.2, 0.2, 0.2] },
      ],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 1] },
        { type: "at", part: "prp_b", center: [0.1, 0, 1] },
        { type: "span", part: "prp_span", from: "prp_a", to: "prp_b", axis: "x" },
      ],
    } as SceneSpec);
    const conflict = solved.diagnostics.find((d) => d.message.includes("overlapping anchors"));
    expect(conflict).toBeDefined();
    expect(conflict!.code).toBe("SOLVE-CONFLICT");
  });

  it("still spans the gap between separated anchors", () => {
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [2, 2, 2] },
        { id: "prp_b", size: [2, 2, 2] },
        { id: "prp_span", size: [0.2, 0.2, 0.2] },
      ],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 1] },
        { type: "at", part: "prp_b", center: [5, 0, 1] },
        { type: "span", part: "prp_span", from: "prp_a", to: "prp_b", axis: "x" },
      ],
    } as SceneSpec);
    expect(solved.diagnostics.filter((d) => d.code === "SOLVE-CONFLICT")).toEqual([]);
    const span = solved.parts.find((p) => p.id === "prp_span")!;
    // gap 1..4 plus the 1mm embed at each end.
    expect(span.size[0]).toBeCloseTo(3 + 2 * MIN_CONTACT, 6);
  });
});
