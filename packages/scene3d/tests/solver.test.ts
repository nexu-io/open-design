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

  it("takes the support's lateral position when nothing else speaks for it", () => {
    // The commonest shape in the language: one part resting on one placed
    // part, with no `align`. `sits_on` resolves Z alone, so x/y arrive from
    // the support — the author already said where the thing sits by saying
    // what it sits ON.
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_floor", size: [4, 4, 0.1] },
        { id: "prp_crate", size: [0.6, 0.6, 0.6] },
      ],
      relations: [
        // Deliberately off-origin, so inheritance is observable rather than
        // coincidentally zero.
        { type: "at", part: "prp_floor", center: [1.25, -0.75, 0.05] },
        { type: "sits_on", part: "prp_crate", on: "prp_floor" },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).not.toContain("SOLVE-UNRESOLVED");
    const crate = solved.parts.find((p) => p.id === "prp_crate")!;
    expect(crate.center[0]).toBeCloseTo(1.25, 9);
    expect(crate.center[1]).toBeCloseTo(-0.75, 9);
  });

  it("inherits through a chain, where every support is itself inherited", () => {
    // This shape worked while the simple one above did not: each `sits_on`
    // here is BLOCKED at first (its support is unplaced), so the queue stays
    // full, the loop keeps spinning and reaches the stall that triggers
    // inheritance. The one above applies immediately and empties the queue —
    // which is how a loop that exited on `pending.size > 0` skipped
    // inheritance entirely for the case people actually write.
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_plinth", size: [0.8, 0.8, 0.12] },
        { id: "prp_base", size: [0.5, 0.5, 0.1] },
        { id: "prp_boiler", size: [0.36, 0.36, 0.5], shape: "cylinder" },
      ],
      relations: [
        { type: "at", part: "prp_plinth", center: [0.25, -0.1, 0.06] },
        { type: "sits_on", part: "prp_base", on: "prp_plinth" },
        { type: "sits_on", part: "prp_boiler", on: "prp_base" },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).not.toContain("SOLVE-UNRESOLVED");
    for (const id of ["prp_base", "prp_boiler"]) {
      const part = solved.parts.find((p) => p.id === id)!;
      expect(part.center[0], `${id} x`).toBeCloseTo(0.25, 9);
      expect(part.center[1], `${id} y`).toBeCloseTo(-0.1, 9);
    }
  });

  it("never overrides a lateral position an explicit relation gave", () => {
    // Inheritance may only fill what nothing constrains. `inset_from` puts the
    // crate against one edge; the support's centre must not pull it back.
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_floor", size: [4, 4, 0.1] },
        { id: "prp_crate", size: [0.6, 0.6, 0.6] },
      ],
      relations: [
        { type: "at", part: "prp_floor", center: [0, 0, 0.05] },
        { type: "sits_on", part: "prp_crate", on: "prp_floor" },
        { type: "inset_from", part: "prp_crate", from: "prp_floor", faces: ["x-"], by: 0.2 },
        { type: "align", part: "prp_crate", to: "prp_floor", axes: ["y"] },
      ],
    };
    const solved = solveScene(spec);
    const crate = solved.parts.find((p) => p.id === "prp_crate")!;
    // Against the -x edge: floor spans -2..2, inset 0.2, half-width 0.3.
    expect(crate.center[0]).toBeCloseTo(-2 + 0.2 + 0.3, 9);
    expect(crate.center[1]).toBeCloseTo(0, 9);
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

  it("names the reference a pending relation is blocked on", () => {
    // prp_box has no placement relation at all, so prp_lid's sits_on can
    // never resolve — the diagnostic should name prp_box specifically,
    // not just say "unplaced or a cycle" and leave the author guessing
    // which of the two it is.
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_box", size: [1, 1, 1] },
        { id: "prp_lid", size: [1, 1, 0.1] },
      ],
      relations: [{ type: "sits_on", part: "prp_lid", on: "prp_box" }],
    });
    const diag = solved.diagnostics.find(
      (d) => d.code === "SOLVE-UNRESOLVED" && d.part === "prp_lid",
    );
    expect(diag).toBeDefined();
    expect(diag!.message).toContain("prp_box");
    expect(diag!.message).toContain("was never placed");
  });

  it("detects and names a two-part cycle in the reference graph", () => {
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [1, 1, 1] },
        { id: "prp_b", size: [1, 1, 1] },
      ],
      relations: [
        { type: "sits_on", part: "prp_a", on: "prp_b" },
        { type: "sits_on", part: "prp_b", on: "prp_a" },
      ],
    });
    const diag = solved.diagnostics.find((d) => d.code === "SOLVE-UNRESOLVED");
    expect(diag).toBeDefined();
    expect(diag!.message).toContain("cycle:");
    expect(diag!.message).toContain("prp_a");
    expect(diag!.message).toContain("prp_b");
  });

  it("floors a scatter minGap below the contact minimum, reporting it (not silently)", () => {
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [2, 2, 0.1] },
        { id: "prp_rock", size: [0.1, 0.1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "scatter", part: "prp_rock", on: "prp_slab", count: 3, seed: 1, minGap: 0 },
      ],
    });
    const floor = solved.diagnostics.find(
      (d) => d.code === "SOLVE-EPSILON-FLOOR" && d.message.includes("minGap"),
    );
    expect(floor).toBeDefined();
    expect(floor!.part).toBe("prp_rock");
  });

  it("does not report a minGap floor when the request already clears the contact minimum", () => {
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [2, 2, 0.1] },
        { id: "prp_rock", size: [0.1, 0.1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "scatter", part: "prp_rock", on: "prp_slab", count: 3, seed: 1, minGap: 0.05 },
      ],
    });
    expect(
      solved.diagnostics.some((d) => d.code === "SOLVE-EPSILON-FLOOR" && d.message.includes("minGap")),
    ).toBe(false);
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

  it("judges a rotated part's repeat against the WORLD extent, both ways", () => {
    // The whole point of solving in the rotated bound: a 1m bar turned a
    // quarter about z is 0.2m wide on x, so a 0.5 pitch clears it — and a
    // 0.5 pitch on the SAME bar unrotated does not. One number, two
    // verdicts, decided by the box the part actually occupies.
    const bar = (rotate: unknown): SceneSpec =>
      ({
        schemaVersion: 1,
        parts: [{ id: "prp_bar", size: [1, 0.2, 0.2], ...(rotate ? { rotate } : {}) }],
        relations: [
          { type: "at", part: "prp_bar", center: [0, 0, 0.1] },
          { type: "repeat", part: "prp_bar", count: 3, along: "x", every: 0.5 },
        ],
      }) as SceneSpec;
    expect(solveScene(bar({ axis: "z", deg: 90 })).diagnostics).toEqual([]);
    expect(
      solveScene(bar(undefined)).diagnostics.filter((d) => d.code === "SOLVE-INTERSECTION"),
    ).toHaveLength(1);
  });

  it("keeps the no-coplanar-faces guarantee over rotated boxes", () => {
    // The solver's promise is a property of the boxes it places, and a
    // rotated part hands it a DIFFERENT box. The floors still own every
    // contact, so the property has to survive unchanged.
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [2, 2, 0.1] },
        { id: "prp_sign", size: [1, 0.2, 0.4], rotate: { axis: "z", deg: 30 } },
        { id: "prp_cap", size: [0.1, 0.1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "sits_on", part: "prp_sign", on: "prp_slab" },
        { type: "align", part: "prp_sign", to: "prp_slab", axes: ["x", "y"] },
        { type: "sits_on", part: "prp_cap", on: "prp_sign" },
      ],
    } as SceneSpec);
    expect(solved.diagnostics).toEqual([]);
    expect(findCoplanarFaces(solved)).toEqual([]);
  });

  it("stays silent when the pitch clears the part", () => {
    const solved = solveScene(
      scene([{ type: "repeat", part: "prp_block", count: 3, along: "x", every: 1.5 }]),
    );
    expect(solved.diagnostics.filter((d) => d.code === "SOLVE-INTERSECTION")).toEqual([]);
  });

  it("exempts instances resting on the same support from the contact-floor embed", () => {
    // Two lamps sits_on one pylon: each is embedded by MIN_CONTACT on z (the
    // solver's own floor), so their boxes interpenetrate by up to twice that
    // on the shared plane. That embed is the compiler's arithmetic, not an
    // authored mistake — reporting it trained agents to float parts with
    // `above` instead of seating them. The exemption is exact: same support,
    // shallowest axis z, depth within two deliberate embeds.
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_pylon", size: [0.2, 0.2, 2] },
        { id: "prp_lamp", size: [0.3, 0.3, 0.25] },
      ],
      relations: [
        { type: "at", part: "prp_pylon", center: [0, 0, 1] },
        { type: "sits_on", part: "prp_lamp", on: "prp_pylon" },
        { type: "inset_from", part: "prp_lamp", from: "prp_pylon", faces: ["x+"], by: 0.05 },
        { type: "repeat", part: "prp_lamp", count: 2, along: "y", every: 0.35 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.filter((d) => d.code === "SOLVE-INTERSECTION")).toEqual([]);
    expect(solved.parts).toHaveLength(3);
    // Both clones record what they rest on — the fact the exemption reads.
    for (const lamp of solved.parts.filter((p) => p.id.startsWith("prp_lamp"))) {
      expect(lamp.restsOn).toBe("prp_pylon");
    }
  });

  it("still reports a genuine overlap between same-support instances", () => {
    // The exemption is bounded by the two deliberate embeds. Lamps this close
    // overlap in y far beyond any contact floor — that is a real mistake.
    // count: 3 so two CLONES exist (the base is authored, not generated, and
    // only solver-generated pairs are policed).
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_pylon", size: [0.2, 0.2, 2] },
        { id: "prp_lamp", size: [0.3, 0.3, 0.25] },
      ],
      relations: [
        { type: "at", part: "prp_pylon", center: [0, 0, 1] },
        { type: "sits_on", part: "prp_lamp", on: "prp_pylon" },
        { type: "inset_from", part: "prp_lamp", from: "prp_pylon", faces: ["x+"], by: 0.05 },
        { type: "repeat", part: "prp_lamp", count: 3, along: "y", every: 0.15 },
      ],
    };
    const solved = solveScene(spec);
    const hit = solved.diagnostics.filter((d) => d.code === "SOLVE-INTERSECTION");
    expect(hit).toHaveLength(1);
    // The shallowest axis is y here — the real overlap — not the shared z plane.
    expect(hit[0]!.message).toContain("y");
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

describe("the part ceiling applies to every path that mints parts", () => {
  it("stops a scatter from growing the scene past the (raisable) part backstop", () => {
    // The backstop guards EVERY minting path, not just repeat — a guard that
    // watches one of two paths is not a guard. It is the contract-overridable
    // maxParts, not a fixed 4000 wall, so this drives it with a small explicit
    // budget (fast) rather than expanding to the generous default.
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_ground", size: [500, 500, 0.1] },
        { id: "prp_pebble", size: [0.1, 0.1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_ground", center: [0, 0, 0.05] },
        // count == the budget: legal as a per-relation count, but the two
        // authored parts push the TOTAL past it — the growth path this guards.
        { type: "scatter", part: "prp_pebble", on: "prp_ground", count: 500, seed: 1 },
      ],
    } as SceneSpec;
    const solved = solveScene(spec, { maxParts: 500 });
    const limit = solved.diagnostics.filter((d) => d.code === "SOLVE-LIMIT");
    expect(limit.length).toBeGreaterThan(0);
    expect(limit[0]!.message).toContain("ceiling is");
    // ...and it is reported ONCE for the one authored decision, not per instance.
    expect(limit).toHaveLength(1);
    expect(solved.parts.length).toBeLessThanOrEqual(500);
  });

  it("leaves a scatter that fits alone", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_ground", size: [50, 50, 0.1] },
        { id: "prp_pebble", size: [0.1, 0.1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_ground", center: [0, 0, 0.05] },
        { type: "scatter", part: "prp_pebble", on: "prp_ground", count: 12, seed: 1 },
      ],
    } as SceneSpec;
    const solved = solveScene(spec);
    expect(solved.diagnostics.filter((d) => d.code === "SOLVE-LIMIT")).toEqual([]);
    expect(solved.parts).toHaveLength(13);
  });
});

/**
 * The light is a derived rig the author can scale, not a two-word menu.
 *
 * A scene lit by its own lanterns, signage or windows is impossible to
 * photograph while the key is unreachable: `emission` makes a surface glow,
 * but against a full-power key and a bright world it can only blow out. These
 * pin that the rig is steerable, that scaling it is what the numbers do, and
 * that the preset words still mean exactly what they meant.
 */
describe("light: a derived rig, steerable", () => {
  const scene = (light: SceneSpec["light"]): SceneSpec => ({
    schemaVersion: 1,
    parts: [{ id: "prp_box", size: [1, 1, 1] }],
    relations: [{ type: "at", part: "prp_box", center: [0, 0, 0.5] }],
    ...(light !== undefined ? { light } : {}),
  });
  const emit = (light: SceneSpec["light"]): string =>
    emitBlenderScript(solveScene(scene(light)), { light } as never);

  it("scales the key rather than replacing it, so one number holds at every scale", () => {
    const full = emit("studio");
    const dim = emit({ key: 0.05 });
    const fullWatts = Number(/key\.data\.energy = ([\d.eE+-]+)/.exec(full)![1]);
    const dimWatts = Number(/key\.data\.energy = ([\d.eE+-]+)/.exec(dim)![1]);
    expect(dimWatts).toBeCloseTo(fullWatts * 0.05, 6);
  });

  it("key 0 emits NO lamp — the world and emissive surfaces are the only light", () => {
    // A 0W lamp would still be a part in the census that lights nothing.
    const out = emit({ key: 0 });
    expect(out).not.toContain("light_add");
    expect(out).toContain("no key at all");
  });

  it("authors the world when ambient is stated, so a dark scene is reachable", () => {
    const out = emit({ key: 0, ambient: 0.006 });
    expect(out).toContain("ShaderNodeBackground");
    expect(out).toContain("0.006");
  });

  it("an ambient triple is a coloured world, not a grey one", () => {
    const out = emit({ key: 0, ambient: [0.02, 0.01, 0.05] });
    expect(out).toMatch(/default_value = \(0\.02, 0\.01, 0\.05, 1\.0\)/);
  });

  it("places the key on the ONE pose convention when an angle is stated", () => {
    // azimuth 180 is behind the subject (+Y), which is the whole point of
    // being able to say it: a rim light is a key you moved.
    const out = emit({ azimuthDeg: 180, elevationDeg: 0 });
    const loc = /light_add\(type="AREA", location=\(([-\d.eE+]+), ([-\d.eE+]+), ([-\d.eE+]+)\)\)/.exec(out)!;
    expect(Number(loc[2])).toBeGreaterThan(0); // +Y — behind
    expect(Math.abs(Number(loc[1]))).toBeLessThan(1e-6); // no X offset
    // and it is AIMED, or moving it would point the lamp at nothing
    expect(out).toContain("to_track_quat");
  });

  it("the preset words still mean what they meant", () => {
    expect(emit("sun")).toContain('type="SUN"');
    expect(emit("studio")).toContain('type="AREA"');
    expect(emit({ preset: "sun" })).toContain('type="SUN"');
    // an unsteered spec is the unsteered default
    const bare = emit({});
    const word = emit("studio");
    expect(/key\.data\.energy = ([\d.eE+-]+)/.exec(bare)![1]).toBe(
      /key\.data\.energy = ([\d.eE+-]+)/.exec(word)![1],
    );
  });
});

describe("compiler-owned motion honours the contract's frame rate", () => {
  const spinScene: SceneSpec = {
    schemaVersion: 1,
    parts: [{ id: "prp_a", size: [1, 1, 1], spin: { seconds: 2 } }],
    relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
  };

  it("emits keyframes at the declared fps, not a constant", () => {
    // `conventions.animation.fps` was validated and cache-keyed, then
    // overridden by a hardcoded 24 — a project that asked for 30 got a clip a
    // third too slow and nothing said so. Two seconds of spin is 48 frames at
    // 24 and 60 at 30; the emitted range is the evidence.
    const at24 = emitBlenderScript(solveScene(spinScene), { fps: 24 } as never);
    const at30 = emitBlenderScript(solveScene(spinScene), { fps: 30 } as never);
    expect(at24).toContain("frame_end = 49");
    expect(at30).toContain("frame_end = 61");
    // The RATE travels with the count, or 60 frames play at 24fps and the
    // two-second clip runs 2.5 seconds in every export.
    expect(at24).toContain("render.fps = 24");
    expect(at30).toContain("render.fps = 30");
  });

  it("falls back to 24 when the contract states nothing", () => {
    expect(emitBlenderScript(solveScene(spinScene), {} as never)).toContain("frame_end = 49");
  });
});

describe("coincident faces are reported, whoever produced them", () => {
  it("names a ring whose instances meet exactly flush", () => {
    /*
     * `repeat` and `scatter` both floor their spacing 1mm from flush so a
     * shared plane is structurally impossible. `around` has no such floor, and
     * the intersection reporter exempted flush contact WHOLESALE — as a proxy
     * for "this contact was designed", which is a semantic fact a geometric
     * test cannot see. So a radius that put two instances edge to edge landed
     * two surfaces on one plane, z-fighting, with every diagnostic silent.
     *
     * Two 1×1 boxes at radius 0.5 sit exactly 1.0 apart centre to centre:
     * touching, not overlapping.
     */
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_hub", size: [0.1, 0.1, 0.1] },
        { id: "prp_arm", size: [1, 1, 1] },
      ],
      relations: [
        { type: "at", part: "prp_hub", center: [0, 0, 0.5] },
        // `around` fixes the ring plane; z still needs its own anchor.
        { type: "align", part: "prp_arm", to: "prp_hub", axes: ["z"] },
        { type: "around", part: "prp_arm", center: "prp_hub", count: 2, radius: 0.5, axis: "z" },
      ],
    } as never);
    const coincident = solved.diagnostics.filter((d) => d.code === "SOLVE-COINCIDENT");
    expect(coincident.length).toBeGreaterThan(0);
    expect(coincident[0]!.message).toContain("exactly flush");
  });

  it("stays quiet when a declared relation owns the interface", () => {
    // `sits_on` embeds a part into its support on purpose, and siblings on one
    // support share its top plane by the solver's own arithmetic. Reporting
    // those trained authors to float parts instead of seating them.
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_base", size: [2, 2, 0.2] },
        { id: "prp_top", size: [0.4, 0.4, 0.4] },
      ],
      relations: [
        { type: "at", part: "prp_base", center: [0, 0, 0.1] },
        { type: "sits_on", part: "prp_top", on: "prp_base" },
        { type: "repeat", part: "prp_top", count: 3, along: "x", every: 0.6 },
      ],
    } as never);
    expect(solved.diagnostics.filter((d) => d.code === "SOLVE-COINCIDENT")).toEqual([]);
  });
});

describe("the buildability recheck reads the box the emitter builds from", () => {
  it("does not fire on a valid rotated tube", () => {
    /*
     * A rotated part carries TWO boxes: `localSize`, the authored rectangle
     * the shape is actually built from, and `size`, the world AABB that
     * rectangle projects onto once turned. The emitter reads
     * `localSize ?? size`; the post-solve buildability check read `size`.
     *
     * They are different rectangles, and `axis` names a LOCAL axis — so
     * indexing it into a world vector after a quarter turn compares two
     * unrelated physical dimensions. A valid tube could be called unbuildable,
     * and an invalid one could pass because the projection inflates the
     * extent the wall is measured against.
     */
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        {
          id: "prp_pipe",
          shape: "tube",
          axis: "z",
          size: [0.4, 0.4, 1],
          thickness: 0.05,
          rotate: [0, 90, 0],
        },
      ],
      relations: [{ type: "at", part: "prp_pipe", center: [0, 0, 0.5] }],
    } as never);
    expect(solved.diagnostics.filter((d) => d.code === "SOLVE-SHAPE")).toEqual([]);
  });

  it("still catches a rotated shape that is genuinely unbuildable", () => {
    // Same turn, but the wall now consumes the whole bore. Reading the world
    // AABB could hide this; reading the built box cannot.
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        {
          id: "prp_pipe",
          shape: "tube",
          axis: "z",
          size: [0.4, 0.4, 1],
          thickness: 0.3,
          rotate: [0, 90, 0],
        },
      ],
      relations: [{ type: "at", part: "prp_pipe", center: [0, 0, 0.5] }],
    } as never);
    const bad = solved.diagnostics.filter((d) => d.code === "SOLVE-SHAPE");
    expect(bad.length).toBeGreaterThan(0);
    expect(bad[0]!.message).toContain("no bore");
  });
});
