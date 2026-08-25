import { describe, expect, it } from "vitest";
import { Rng } from "../src/solve/rng.js";
import { obbSeparation, rotatedBoxSize, rotatedShapeSize } from "../src/solve/types.js";
import { validateSceneSpec, specDeclarationLines } from "../src/solve/validate.js";
import { findCoplanarFaces, solveScene } from "../src/solve/solver.js";
import { emitBlenderScript, frameScene } from "../src/solve/emit-bpy.js";
import { lintClaims } from "../src/lint/claims.js";
import { nearestKey } from "../src/solve/did-you-mean.js";
import {
  AUTOFIT_DISTANCE,
  CAMERA_FILL,
  CAMERA_HALF_FOV,
  MAX_REPEAT_COUNT,
  MIN_CONTACT,
  SceneSpec,
} from "../src/solve/types.js";
import { ISSUE_CODES } from "../src/errors.js";
import type { Census, Issue } from "../src/types.js";

/**
 * The declarative language, end to end without Blender: schema validation,
 * repeat expansion, shape emission, and claims adjudication are all pure,
 * so every rule of the language is pinned here at unit cost. The real-
 * Blender complement lives in spec-pipeline.test.ts.
 */

function colonnade(): SceneSpec {
  return {
    schemaVersion: 1,
    materials: {
      mtl_stone: { baseColor: [0.6, 0.6, 0.58], roughness: 0.9 },
      mtl_brass: { baseColor: [0.85, 0.65, 0.3], roughness: 0.3, metallic: 1 },
    },
    parts: [
      { id: "prp_plinth", size: [3, 1, 0.1], material: "mtl_stone" },
      { id: "prp_column", size: [0.2, 0.2, 1.5], shape: "cylinder", material: "mtl_stone" },
      { id: "prp_orb", size: [0.3, 0.3, 0.3], shape: "sphere", material: "mtl_brass" },
    ],
    relations: [
      { type: "at", part: "prp_plinth", center: [0, 0, 0.05] },
      { type: "sits_on", part: "prp_column", on: "prp_plinth" },
      { type: "inset_from", part: "prp_column", from: "prp_plinth", faces: ["x-"], by: 0.2 },
      { type: "align", part: "prp_column", to: "prp_plinth", axes: ["y"] },
      { type: "repeat", part: "prp_column", count: 4, along: "x", every: 0.8 },
      { type: "sits_on", part: "prp_orb", on: "prp_plinth" },
      { type: "align", part: "prp_orb", to: "prp_plinth", axes: ["x", "y"] },
    ],
  };
}

describe("validateSceneSpec", () => {
  it("accepts the colonnade and round-trips its content", () => {
    const { spec, errors } = validateSceneSpec(colonnade());
    expect(errors).toEqual([]);
    expect(spec!.parts).toHaveLength(3);
    expect(spec!.materials!.mtl_brass!.metallic).toBe(1);
  });

  it("names the JSON path of every error and collects them all", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_ok", size: [1, 1, 1] },
        { id: "prp_bad", size: [1, -1, 1] },
        { id: "prp_worse", size: [1, 1, 1], shape: "dodecahedron" },
      ],
      relations: [{ type: "teleport", part: "prp_ok" }],
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("parts[1].size[1]"))).toBe(true);
    expect(errors.some((e) => e.includes("parts[2].shape"))).toBe(true);
    expect(errors.some((e) => e.includes("relations[0].type"))).toBe(true);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects a sub-micron size as a unit slip, with a JSON path (S-11)", () => {
    // 1e-9 "metres" that meant millimetres would build a degenerate mesh and
    // surface only as a late DEGENERATE_SCALE / ZERO_AREA cascade. Catch it at
    // validation, before any geometry exists.
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_speck", size: [1e-9, 1, 1] }],
      relations: [{ type: "at", part: "prp_speck", center: [0, 0, 0.5] }],
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("parts[0].size[0]") && /unit slip/.test(e))).toBe(true);
  });

  it("still accepts a small-but-real detail part (S-11)", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_rivet", size: [0.002, 0.002, 0.002] }],
      relations: [{ type: "at", part: "prp_rivet", center: [0, 0, 0.5] }],
    });
    expect(errors).toEqual([]);
  });

  it("rejects a part referencing an undeclared material", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_ghost" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e.includes("mtl_ghost") && e.includes("not declared"))).toBe(true);
  });

  it("rejects in-between metallic with the reason", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_x: { baseColor: [1, 1, 1], metallic: 0.5 } },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e.includes("metallic must be 0 or 1"))).toBe(true);
  });

  it("rejects a torus whose tube does not fit its ring", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_ring", size: [0.4, 0.4, 0.3], shape: "torus" }],
      relations: [{ type: "at", part: "prp_ring", center: [0, 0, 0.15] }],
    });
    expect(errors.some((e) => e.includes("torus tube"))).toBe(true);
  });

  it("rejects a non-circular torus cross-section", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_ring", size: [0.6, 0.5, 0.1], shape: "torus" }],
      relations: [{ type: "at", part: "prp_ring", center: [0, 0, 0.05] }],
    });
    expect(errors.some((e) => e.includes("must be circular"))).toBe(true);
  });

  /* ---- the second wave of shapes: frustum, wedge, tube, capsule ------ */
  //
  // Each new word is a shape parameter or a shape constraint, and the whole
  // point of both is that they FAIL EARLY: a tip on a box, a ramp that
  // climbs the sky, a wall thicker than its own pipe, and a capsule shorter
  // than it is wide are all statements the author believes they made.

  it("accepts every new shape at its happy path", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_pot", size: [0.3, 0.3, 0.3], shape: "cone", tip: 0.6 },
        { id: "prp_ramp", size: [0.6, 0.4, 0.2], shape: "wedge", axis: "x" },
        { id: "prp_pipe", size: [0.4, 0.4, 1], shape: "tube", thickness: 0.05 },
        { id: "prp_pill", size: [0.2, 0.2, 0.8], shape: "capsule" },
      ],
      relations: [
        { type: "at", part: "prp_pot", center: [0, 0, 0.15] },
        { type: "at", part: "prp_ramp", center: [1, 0, 0.1] },
        { type: "at", part: "prp_pipe", center: [2, 0, 0.5] },
        { type: "at", part: "prp_pill", center: [3, 0, 0.4] },
      ],
    });
    expect(errors).toEqual([]);
    expect(spec!.parts[0]!.tip).toBe(0.6);
    expect(spec!.parts[2]!.thickness).toBe(0.05);
    // A capsule exactly as long as it is wide IS a sphere and is allowed:
    // the shift collapses to zero rather than to a degenerate shape.
    const equal = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_pill", size: [0.4, 0.4, 0.4], shape: "capsule" }],
      relations: [{ type: "at", part: "prp_pill", center: [0, 0, 0.2] }],
    });
    expect(equal.errors).toEqual([]);
  });

  it("rejects a cone tip outside 0 up to 1, and a tip on anything but a cone", () => {
    const high = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_pot", size: [1, 1, 1], shape: "cone", tip: 1 }],
      relations: [{ type: "at", part: "prp_pot", center: [0, 0, 0.5] }],
    });
    expect(
      high.errors.some((e) => e.includes("parts[0].tip must be a number from 0 up to but not including 1")),
    ).toBe(true);
    const negative = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_pot", size: [1, 1, 1], shape: "cone", tip: -0.2 }],
      relations: [{ type: "at", part: "prp_pot", center: [0, 0, 0.5] }],
    });
    expect(negative.errors.some((e) => e.includes("parts[0].tip"))).toBe(true);
    const onBox = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_crate", size: [1, 1, 1], tip: 0.5 }],
      relations: [{ type: "at", part: "prp_crate", center: [0, 0, 0.5] }],
    });
    expect(onBox.errors.some((e) => e.includes("tip is a cone field"))).toBe(true);
    expect(onBox.errors.some((e) => e.includes("'box'"))).toBe(true);
  });

  it("refuses a wedge that slopes along z — a ramp climbs a horizontal axis", () => {
    const named = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_ramp", size: [1, 1, 0.3], shape: "wedge", axis: "z" }],
      relations: [{ type: "at", part: "prp_ramp", center: [0, 0, 0.15] }],
    });
    expect(named.errors.some((e) => e.includes("must be x or y"))).toBe(true);
    // The default axis IS z, so an omitted axis is the same mistake.
    const omitted = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_ramp", size: [1, 1, 0.3], shape: "wedge" }],
      relations: [{ type: "at", part: "prp_ramp", center: [0, 0, 0.15] }],
    });
    expect(omitted.errors.some((e) => e.includes("slopes UP"))).toBe(true);
  });

  it("requires a tube's thickness, refuses it elsewhere, and makes it fit", () => {
    const missing = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_pipe", size: [0.4, 0.4, 1], shape: "tube" }],
      relations: [{ type: "at", part: "prp_pipe", center: [0, 0, 0.5] }],
    });
    expect(missing.errors.some((e) => e.includes("thickness is required on a tube"))).toBe(true);

    const elsewhere = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_ball", size: [1, 1, 1], shape: "sphere", thickness: 0.1 }],
      relations: [{ type: "at", part: "prp_ball", center: [0, 0, 0.5] }],
    });
    expect(elsewhere.errors.some((e) => e.includes("thickness is a tube field"))).toBe(true);

    // Half the diameter is exactly where the hole disappears.
    const tooThick = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_pipe", size: [0.4, 0.4, 1], shape: "tube", thickness: 0.2 }],
      relations: [{ type: "at", part: "prp_pipe", center: [0, 0, 0.5] }],
    });
    expect(
      tooThick.errors.some((e) => e.includes("does not fit its outer diameter")),
    ).toBe(true);

    const oval = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_pipe", size: [0.4, 0.3, 1], shape: "tube", thickness: 0.05 }],
      relations: [{ type: "at", part: "prp_pipe", center: [0, 0, 0.5] }],
    });
    expect(oval.errors.some((e) => e.includes("a tube must be circular"))).toBe(true);
  });

  it("refuses a capsule shorter than its own diameter, and a non-circular one", () => {
    const stubby = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_pill", size: [0.4, 0.4, 0.2], shape: "capsule" }],
      relations: [{ type: "at", part: "prp_pill", center: [0, 0, 0.1] }],
    });
    expect(stubby.errors.some((e) => e.includes("shorter than it is wide"))).toBe(true);
    expect(stubby.errors.some((e) => e.includes('use shape "sphere"'))).toBe(true);

    const oval = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_pill", size: [0.4, 0.3, 1], shape: "capsule" }],
      relations: [{ type: "at", part: "prp_pill", center: [0, 0, 0.5] }],
    });
    expect(oval.errors.some((e) => e.includes("a capsule must be circular"))).toBe(true);
  });

  it("rejects duplicate part ids", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [1, 1, 1] },
        { id: "prp_a", size: [2, 2, 2] },
      ],
      relations: [],
    });
    expect(errors.some((e) => e.includes("declared twice"))).toBe(true);
  });

  it("finds the declaration line of parts and materials", () => {
    const text = JSON.stringify(colonnade(), null, 2);
    const lines = specDeclarationLines(text);
    expect(lines.prp_column).toBeGreaterThan(0);
    expect(lines.mtl_brass).toBeGreaterThan(0);
    const rows = text.split("\n");
    expect(rows[lines.prp_column! - 1]).toContain('"prp_column"');
    expect(rows[lines.mtl_brass! - 1]).toContain('"mtl_brass"');
  });

  /* ---- unknown keys are errors, never swallows ---------------------- */

  it("refuses an unknown part key instead of swallowing it (H1)", () => {
    // `rotation` typed in good faith used to parse clean and emit a flat
    // box — the author shipped a cube believing it was a pitched roof. The
    // refusal names the vocabulary that DOES exist.
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_roof", size: [2, 2, 0.4], rotation: [0.35, 0, 0] }],
      relations: [{ type: "at", part: "prp_roof", center: [0, 0, 0.2] }],
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("parts[0].rotation is not a part field"))).toBe(true);
    expect(errors.some((e) => e.includes("known fields"))).toBe(true);
  });

  it("refuses unknown camera keys — include/target were swallowed into an AABB shot", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1] }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
      camera: { distance: 3, include: ["prp_a"] },
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("camera.include is not a camera field"))).toBe(true);
  });

  it("refuses a claim with no oracle instead of adjudicating nothing (H1)", () => {
    // `doorWidth` compiled clean and checked nothing — the author believed
    // they had signed a door and had signed air.
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1] }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
      claims: { parts: 1, doorWidth: 0.9 },
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("claims.doorWidth has no oracle"))).toBe(true);
    // The refusal teaches: it lists what DOES adjudicate.
    expect(errors.some((e) => e.includes("parts, maxTriangles"))).toBe(true);
  });

  it("refuses an unknown material key instead of swallowing it", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_x: { baseColor: [0.5, 0.5, 0.5], offset: 0.2 } },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("materials.mtl_x.offset is not a material field"))).toBe(true);
    expect(errors.some((e) => e.includes("known fields"))).toBe(true);
  });

  it("refuses an unknown key on a relation, scoped to that relation's own field set", () => {
    // `offset` typed where `embed` was meant on a sits_on used to compile
    // clean and place the part flush against its default embed, silently.
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_base", size: [1, 1, 0.2] },
        { id: "prp_lid", size: [1, 1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_base", center: [0, 0, 0.1] },
        { type: "sits_on", part: "prp_lid", on: "prp_base", offset: 0.01 },
      ],
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("relations[1].offset is not a field of relation 'sits_on'"))).toBe(
      true,
    );
    expect(errors.some((e) => e.includes("known fields: type, part, on, embed"))).toBe(true);
  });

  it("refuses a key that IS legal on a different relation type", () => {
    // `to` belongs to align, not sits_on — the message must name the
    // AUTHORED type's vocabulary, not some other relation's.
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_base", size: [1, 1, 0.2] },
        { id: "prp_lid", size: [1, 1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_base", center: [0, 0, 0.1] },
        { type: "sits_on", part: "prp_lid", on: "prp_base", to: "prp_base" },
      ],
    });
    expect(errors.some((e) => e.includes("relations[1].to is not a field of relation 'sits_on'"))).toBe(
      true,
    );
  });

  it("refuses an unknown top-level scene.json key", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1] }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
      claim: { parts: 1 },
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("claim is not a scene.json field"))).toBe(true);
    expect(errors.some((e) => e.includes("known fields"))).toBe(true);
  });

  /* ---- field-precise diagnostics ------------------------------------ */

  it("reports spin.axis and spin.seconds as separate failures", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], spin: { axis: "w", seconds: 0.01 } }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e === "parts[0].spin.axis must be x, y or z")).toBe(true);
    expect(errors.some((e) => e === "parts[0].spin.seconds must be a number greater than 0.1")).toBe(true);
  });

  it("reports only the bad spin field, not both, when one is fine", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], spin: { axis: "z", seconds: 0.01 } }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e.includes("spin.axis"))).toBe(false);
    expect(errors.some((e) => e.includes("spin.seconds"))).toBe(true);
  });

  it("reports bob.amplitude and bob.seconds as separate failures", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], bob: { amplitude: -1, seconds: 0.01 } }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e === "parts[0].bob.amplitude must be a positive number")).toBe(true);
    expect(errors.some((e) => e === "parts[0].bob.seconds must be a number greater than 0.1")).toBe(true);
  });

  /* ---- screw: the turn-plus-rise primitive -------------------------- */

  const screwSpec = (screw: unknown, extra: Record<string, unknown> = {}): SceneSpec =>
    ({
      schemaVersion: 1,
      parts: [{ id: "prp_bit", size: [0.2, 0.2, 1], shape: "cylinder", screw, ...extra }],
      relations: [{ type: "at", part: "prp_bit", center: [0, 0, 1] }],
    }) as unknown as SceneSpec;

  it("accepts a screw and carries it through solve to the emitted script", () => {
    const { errors, spec } = validateSceneSpec(screwSpec({ axis: "z", seconds: 2, rise: 0.4 }));
    expect(errors).toEqual([]);
    expect(spec!.parts[0]!.screw).toEqual({ axis: "z", seconds: 2, rise: 0.4 });

    const solved = solveScene(spec!);
    expect(solved.parts[0]!.screw).toEqual({ axis: "z", seconds: 2, rise: 0.4 });

    const script = emitBlenderScript(solved);
    expect(script).toContain('_animate_screw("prp_bit", 2, 48, 0.4)');
    // The helper is authored beside the call, and its advance REPEATS: the
    // loop point is a snap, and the script must say so rather than pretend.
    expect(script).toContain("def _animate_screw(name, axis_index, period_frames, rise):");
    expect(script).toContain('fc.modifiers.new("CYCLES")');
  });

  it("defaults the screw to z and a four-second turn", () => {
    const { spec } = validateSceneSpec(screwSpec({ rise: -0.25 }));
    const script = emitBlenderScript(solveScene(spec!));
    expect(script).toContain('_animate_screw("prp_bit", 2, 96, -0.25)');
  });

  it("emits a byte-identical script for a scene with no screw in it", () => {
    // The helper is keyword-gated at the call site precisely so adding this
    // primitive cannot move a single byte of an unchanged spec's script.
    const plain = emitBlenderScript(solveScene(validateSceneSpec(colonnade()).spec!));
    expect(plain).not.toContain("_animate_screw");
    expect(plain).toBe(emitBlenderScript(solveScene(validateSceneSpec(colonnade()).spec!)));
  });

  it("refuses spin and screw on one part — a screw IS a spin with a rise", () => {
    const { errors } = validateSceneSpec(screwSpec({ rise: 0.2 }, { spin: { axis: "z" } }));
    expect(errors).toContain(
      "parts[0] declares both spin and screw — a screw IS a spin with a rise along its axis, so drop the spin and let screw.seconds carry the turn",
    );
  });

  it("refuses a z screw beside a bob, and accepts one about x", () => {
    const clash = validateSceneSpec(screwSpec({ rise: 0.2 }, { bob: { amplitude: 0.1 } }));
    expect(clash.errors).toContain(
      "parts[0] declares a screw about z and a bob — both author z travel, and two authorities over one axis is not a composition; screw about x or y composes with bob, or drop one of the two",
    );
    const ok = validateSceneSpec(screwSpec({ axis: "x", rise: 0.2 }, { bob: { amplitude: 0.1 } }));
    expect(ok.errors).toEqual([]);
  });

  it("refuses a zero rise — that is a spin written the long way", () => {
    const { errors } = validateSceneSpec(screwSpec({ rise: 0 }));
    expect(errors).toContain(
      "parts[0].screw.rise is 0, which is a spin written the long way — write the metres the part advances per turn, or use spin",
    );
  });

  it("puts no ceiling on the rise — travel per turn is scale taste, in both directions", () => {
    // The ceiling this test used to pin was a taste judgment wearing a
    // rule's clothes; a 40m auger on a 200m crane is a sentence an author
    // can mean. Finite and nonzero are the only structural requirements.
    for (const rise of [10.5, -10.5, 40, 500]) {
      expect(validateSceneSpec(screwSpec({ rise })).errors).toEqual([]);
    }
  });

  it("reports a missing rise, a bad axis and a bad seconds as separate failures", () => {
    const { errors } = validateSceneSpec(screwSpec({ axis: "w", seconds: 0.01 }));
    expect(errors).toContain("parts[0].screw.axis must be x, y or z");
    expect(errors).toContain("parts[0].screw.seconds must be a number greater than 0.1");
    expect(errors).toContain(
      "parts[0].screw.rise must be a finite number of metres travelled along the axis per turn",
    );
  });

  it("refuses unknown keys on spin and bob — the contract is uniform across motion", () => {
    // The audit case verbatim: both compiled clean and derived an
    // animation off defaults, while rotate/screw refused the same shape
    // of mistake. `rpm` is the natural first guess, so its refusal
    // teaches the conversion.
    const spec = (parts: object[]): unknown => ({
      schemaVersion: 1,
      parts,
      relations: (parts as Array<{ id: string }>).map((p, i) => ({
        type: "at", part: p.id, center: [i, 0, 0.1],
      })),
    });
    const spun = validateSceneSpec(
      spec([{ id: "prp_spin", size: [0.2, 0.2, 0.2], spin: { zzz: 1, wobble: "yes" } }]),
    );
    expect(spun.errors.some((e) => /spin\.zzz is not a spin field/.test(e))).toBe(true);
    expect(spun.errors.some((e) => /spin\.wobble is not a spin field/.test(e))).toBe(true);
    const rpm = validateSceneSpec(
      spec([{ id: "prp_spin", size: [0.2, 0.2, 0.2], spin: { rpm: 30 } }]),
    );
    expect(rpm.errors.some((e) => /seconds = 60 \/ rpm/.test(e))).toBe(true);
    const bobbed = validateSceneSpec(
      spec([{ id: "prp_bob", size: [0.2, 0.2, 0.2], bob: { amplitude: 0.2, zzz: 1 } }]),
    );
    expect(bobbed.errors.some((e) => /bob\.zzz is not a bob field/.test(e))).toBe(true);
    // Margin notes stay legal inside both, like every other object.
    const commented = validateSceneSpec(
      spec([{ id: "prp_ok", size: [0.2, 0.2, 0.2], spin: { "//": "slow", seconds: 6 }, bob: { amplitude: 0.05, "// why": "breathing" } }]),
    );
    expect(commented.errors).toEqual([]);
  });

  it("refuses a prototype-key material name that was never declared", () => {
    // `"toString" in {}` is true — the `in` operator walks the prototype
    // chain, so a part could reference an undeclared material named after
    // any Object.prototype member and validate clean, then resolve to an
    // inherited FUNCTION downstream. The maps are null-prototype now.
    for (const name of ["toString", "constructor", "hasOwnProperty"]) {
      const { errors } = validateSceneSpec({
        schemaVersion: 1,
        parts: [{ id: "prp_a", size: [0.2, 0.2, 0.2], material: name }],
        relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.1] }],
      });
      expect(
        errors.some((e) => e.includes("is not declared in materials")),
        `undeclared material '${name}' must be refused`,
      ).toBe(true);
    }
  });

  it("validates the floor claims and refuses an impossible floor/ceiling pair", () => {
    const spec = (claims: object): unknown => ({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [0.2, 0.2, 0.2] }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.1] }],
      claims,
    });
    expect(validateSceneSpec(spec({ minHeight: 0.1, minFootprint: [0.1, 0.1] })).errors).toEqual([]);
    expect(
      validateSceneSpec(spec({ minHeight: -1 })).errors.some((e) =>
        /minHeight must be a positive number/.test(e),
      ),
    ).toBe(true);
    expect(
      validateSceneSpec(spec({ minHeight: 2, maxHeight: 1 })).errors.some((e) =>
        /no scene can hold both/.test(e),
      ),
    ).toBe(true);
    expect(
      validateSceneSpec(spec({ minFootprint: [3, 1], footprint: [2, 2] })).errors.some((e) =>
        /no scene can hold both/.test(e),
      ),
    ).toBe(true);
  });

  it("names the nearest screw field on an unknown key", () => {
    const { errors } = validateSceneSpec(screwSpec({ rise: 0.2, second: 3 }));
    expect(errors).toContain(
      'parts[0].screw.second is not a screw field — did you mean "seconds"? known fields: axis, seconds, rise',
    );
  });

  it("reports every bad component of a vec3, not just the first", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_bad", size: [-1, NaN, 1] }],
      relations: [{ type: "at", part: "prp_bad", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e.includes("parts[0].size[0]"))).toBe(true);
    expect(errors.some((e) => e.includes("parts[0].size[1]"))).toBe(true);
    expect(errors.some((e) => e.includes("parts[0].size[2]"))).toBe(false);
  });

  it("states the id/material name bound in plain words alongside the regex", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "x", size: [1, 1, 1] }],
      relations: [],
    });
    expect(
      errors.some(
        (e) =>
          e.includes("parts[0].id") &&
          e.includes("3-64 characters, starting with a letter, then letters, digits or underscores"),
      ),
    ).toBe(true);
  });

  it("suggests the nearest legal metallic value", () => {
    const low = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_x: { baseColor: [1, 1, 1], metallic: 0.1 } },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(low.errors.some((e) => e.includes("metallic must be 0 or 1") && e.includes("(use 0)"))).toBe(
      true,
    );

    const high = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_x: { baseColor: [1, 1, 1], metallic: 0.9 } },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(high.errors.some((e) => e.includes("metallic must be 0 or 1") && e.includes("(use 1)"))).toBe(
      true,
    );
  });

  it("explains the sizeJitter ceiling instead of stating it bare", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [1, 1, 0.1] },
        { id: "prp_rock", size: [0.1, 0.1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "scatter", part: "prp_rock", on: "prp_slab", count: 1, sizeJitter: 0.95 },
      ],
    });
    expect(
      errors.some(
        (e) => e.includes("sizeJitter must be a number in [0, 0.9)") && e.includes("10%"),
      ),
    ).toBe(true);
  });

  it("still accepts every key the language actually reads", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_x: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
      parts: [
        {
          id: "prp_full",
          size: [1, 1, 1],
          shape: "cylinder",
          axis: "y",
          flip: true,
          material: "mtl_x",
          role: "roller",
          spin: { axis: "z", seconds: 2 },
          bob: { amplitude: 0.05, seconds: 3 },
        },
        // screw is exclusive with spin, so the key it reads lives on its own
        // part — the list is still every key, just not all on one line.
        {
          id: "prp_bit",
          size: [0.2, 0.2, 1],
          shape: "cylinder",
          screw: { axis: "z", seconds: 2, rise: 0.3 },
        },
      ],
      relations: [
        { type: "at", part: "prp_full", center: [0, 0, 0.5] },
        { type: "at", part: "prp_bit", center: [2, 0, 0.5] },
      ],
      camera: { azimuthDeg: 30, elevationDeg: 20, distance: 5 },
      claims: { parts: 2, grounded: true },
    });
    expect(errors).toEqual([]);
  });

  /* ---- script-backed parts: freeform as a shape kind ---------------- */

  it("accepts a script-backed part and rejects its conflicts", () => {
    const ok = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_hull", size: [3, 1.2, 0.8], script: "hull.py" }],
      relations: [{ type: "at", part: "prp_hull", center: [0, 0, 0.4] }],
    });
    expect(ok.errors).toEqual([]);
    expect(ok.spec!.parts[0]!.script).toBe("hull.py");

    // One filler per box: script vs shape, script vs file are both refused —
    // a silent winner would make "which geometry shipped" unanswerable.
    const both = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_x", size: [1, 1, 1], script: "a.py", shape: "box" }],
      relations: [],
    });
    expect(both.errors.some((e) => e.includes("script and shape are mutually exclusive"))).toBe(true);

    const triple = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_y", size: [1, 1, 1], script: "a.py", file: "b.glb" }],
      relations: [],
    });
    expect(triple.errors.some((e) => e.includes("script and file are mutually exclusive"))).toBe(true);

    // Path discipline matches file: scene-relative, no '..'.
    const escape = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_z", size: [1, 1, 1], script: "../evil.py" }],
      relations: [],
    });
    expect(escape.errors.some((e) => e.includes("scene-relative"))).toBe(true);

    // Orientation knobs belong to the script, not the JSON.
    const axis = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_w", size: [1, 1, 1], script: "a.py", axis: "x" }],
      relations: [],
    });
    expect(axis.errors.some((e) => e.includes("axis has no meaning on a script part"))).toBe(true);
  });

  it("emits _script_part calls for script-backed parts", () => {
    const { spec } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_brass: { baseColor: [0.85, 0.65, 0.3], roughness: 0.3, metallic: 1 } },
      parts: [
        { id: "prp_hull", size: [3, 1.2, 0.8], script: "hull.py" },
        { id: "prp_cap", size: [0.4, 0.4, 0.2], script: "cap.py", material: "mtl_brass" },
        { id: "prp_plain", size: [1, 1, 1] },
      ],
      relations: [
        { type: "at", part: "prp_hull", center: [0, 0, 0.4] },
        { type: "sits_on", part: "prp_cap", on: "prp_hull" },
        { type: "align", part: "prp_cap", to: "prp_hull", axes: ["x", "y"] },
        { type: "at", part: "prp_plain", center: [5, 0, 0.5] },
      ],
    }) as { spec: SceneSpec };
    const script = emitBlenderScript(solveScene(spec), {});
    expect(script).toContain('_script_part("prp_hull", "hull.py"');
    expect(script).toContain('_script_part("prp_cap", "cap.py", (0.4, 0.4, 0.2)');
    expect(script).toContain('"prp_plain", "box"'); // primitives unchanged
    // The runner-side machinery ships exactly once, before any part call.
    expect(script.indexOf("def _run_script")).toBeLessThan(script.indexOf("_script_part("));
    expect(script.match(/_SCRIPT_SEQ = \[0\]/g)).toHaveLength(1);
  });
});

describe("repeat expansion", () => {
  it("expands a solved base into pitched instances that keep the language's guarantees", () => {
    const solved = solveScene(colonnade());
    expect(solved.diagnostics).toEqual([]);
    const columns = solved.parts.filter((p) => p.id.startsWith("prp_column"));
    expect(columns.map((p) => p.id).sort()).toEqual([
      "prp_column",
      "prp_column_2",
      "prp_column_3",
      "prp_column_4",
    ]);
    const xs = columns.map((p) => p.center[0]).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(0.8, 9);
    expect(xs[3]! - xs[2]!).toBeCloseTo(0.8, 9);
    // Instances inherit shape and material, and record their base.
    const clone = columns.find((p) => p.id === "prp_column_3")!;
    expect(clone.shape).toBe("cylinder");
    expect(clone.material).toBe("mtl_stone");
    expect(clone.from).toBe("prp_column");
    // And the scene still cannot z-fight.
    expect(findCoplanarFaces(solved)).toEqual([]);
  });

  it("composes two repeats on one part into a grid", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [4, 4, 0.1] },
        { id: "prp_peg", size: [0.1, 0.1, 0.3] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "sits_on", part: "prp_peg", on: "prp_slab" },
        { type: "inset_from", part: "prp_peg", from: "prp_slab", faces: ["x-", "y-"], by: 0.2 },
        { type: "repeat", part: "prp_peg", count: 3, along: "x", every: 1 },
        { type: "repeat", part: "prp_peg", count: 2, along: "y", every: 1.5 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics).toEqual([]);
    const pegs = solved.parts.filter((p) => p.id.startsWith("prp_peg"));
    expect(pegs).toHaveLength(6);
    const key = (p: { center: [number, number, number] }) =>
      `${p.center[0].toFixed(3)},${p.center[1].toFixed(3)}`;
    expect(new Set(pegs.map(key)).size).toBe(6);
  });

  it("floors a face-flush pitch instead of emitting z-fighting neighbours", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [{ id: "prp_brick", size: [0.5, 0.2, 0.1] }],
      relations: [
        { type: "at", part: "prp_brick", center: [0, 0, 0.05] },
        { type: "repeat", part: "prp_brick", count: 3, along: "x", every: 0.5 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-EPSILON-FLOOR");
    const bricks = solved.parts.sort((a, b) => a.center[0] - b.center[0]);
    expect(bricks[1]!.center[0] - bricks[0]!.center[0]).toBeCloseTo(0.5 + MIN_CONTACT, 9);
    expect(findCoplanarFaces(solved)).toEqual([]);
  });

  it("reports a minted id colliding with an authored part", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [0.2, 0.2, 0.2] },
        { id: "prp_a_2", size: [1, 1, 1] },
      ],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0.1] },
        { type: "at", part: "prp_a_2", center: [5, 0, 0.5] },
        { type: "repeat", part: "prp_a", count: 2, along: "x", every: 1 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-CONFLICT");
  });

  it("refuses a repeat that would blow the part ceiling", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [0.1, 0.1, 0.1] }],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0.05] },
        { type: "repeat", part: "prp_a", count: 150, along: "x", every: 0.2 },
        { type: "repeat", part: "prp_a", count: 150, along: "y", every: 0.2 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-LIMIT");
  });
});

describe("shape emission", () => {
  it("emits each shape with its axis and applied transforms", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_beam", size: [2, 0.1, 0.1], shape: "cylinder", axis: "x" },
        { id: "prp_spike", size: [0.2, 0.2, 0.4], shape: "cone", flip: true },
        { id: "prp_ring", size: [0.6, 0.6, 0.1], shape: "torus" },
      ],
      relations: [
        { type: "at", part: "prp_beam", center: [0, 0, 1] },
        { type: "at", part: "prp_spike", center: [1, 0, 0.2] },
        { type: "at", part: "prp_ring", center: [-1, 0, 0.05] },
      ],
    };
    const script = emitBlenderScript(solveScene(spec));
    expect(script).toContain('_part("prp_beam", "cylinder", (2, 0.1, 0.1), (0, 0, 1), "x", False)');
    expect(script).toContain('_part("prp_spike", "cone", (0.2, 0.2, 0.4), (1, 0, 0.2), "z", True)');
    expect(script).toContain('_part("prp_ring", "torus"');
    // Caps are trifans so generated geometry can never trip the ngon rule.
    expect(script.match(/end_fill_type="TRIFAN"/g)).toHaveLength(2);
  });

  it("emits the frustum, wedge, tube and capsule with their own construction", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_pot", size: [0.3, 0.3, 0.3], shape: "cone", tip: 0.6 },
        { id: "prp_ramp", size: [0.6, 0.4, 0.2], shape: "wedge", axis: "x" },
        { id: "prp_pipe", size: [0.4, 0.4, 1], shape: "tube", thickness: 0.05 },
        { id: "prp_pill", size: [0.2, 0.2, 0.8], shape: "capsule" },
      ],
      relations: [
        { type: "at", part: "prp_pot", center: [0, 0, 0.15] },
        { type: "at", part: "prp_ramp", center: [1, 0, 0.1] },
        { type: "at", part: "prp_pipe", center: [2, 0, 0.5] },
        { type: "at", part: "prp_pill", center: [3, 0, 0.4] },
      ],
    };
    const { spec: valid, errors } = validateSceneSpec(spec);
    expect(errors).toEqual([]);
    const script = emitBlenderScript(solveScene(valid!));

    // Shape parameters ride as keywords, only where they were authored.
    expect(script).toContain(
      '_part("prp_pot", "cone", (0.3, 0.3, 0.3), (0, 0, 0.15), "z", False, tip=0.6)',
    );
    expect(script).toContain(
      '_part("prp_pipe", "tube", (0.4, 0.4, 1), (2, 0, 0.5), "z", False, thickness=0.05)',
    );
    // A shape with no parameters emits exactly the call it always did — a
    // cached build of an untouched spec must not be invalidated by words it
    // never used.
    expect(script).toContain('_part("prp_pill", "capsule", (0.2, 0.2, 0.8), (3, 0, 0.4), "z", False)');

    // The frustum is the cone's second radius, not a second primitive.
    expect(script).toContain("radius2=0.5 * tip");

    // Explicit-vertex shapes: six verts for the prism, four rings for the
    // pipe, and every face a quad or a triangle so no ngon can exist.
    expect(script).toContain("def _wedge_verts(axis, flip):");
    expect(script).toContain("p(-0.5, 0.5, -0.5), p(0.5, -0.5, 0.5), p(0.5, 0.5, 0.5),");
    expect(script).toContain("faces = [(0, 3, 2, 1), (1, 2, 5, 4), (0, 4, 5, 3), (0, 1, 4), (3, 5, 2)]");
    expect(script).toContain("def _tube_verts(outer, inner, length, segments):");
    expect(script).toContain("_inner = _outer - thickness");
    expect(script).toContain("mesh.from_pydata(list(verts), [], list(faces))");

    // The capsule is a sphere pulled apart at the equator, with an ODD ring
    // count so no ring is left sitting on the seam.
    expect(script).toContain("_shift = _len / 2.0 - _r");
    expect(script).toContain("if _rings % 2 == 0:");
    expect(script).toContain("_v.co.z += _shift");

    // Real-radius shapes skip the scale step; the wedge skips the rotations.
    expect(script).toContain('if shape not in ("torus", "tube", "capsule"):');
    expect(script).toContain('if shape != "wedge":');
    expect(script).toContain('if shape in ("sphere", "torus", "capsule"):');
  });

  it("stays byte-stable across compiles of a spec using the new shapes", () => {
    const build = (): SceneSpec => ({
      schemaVersion: 1,
      parts: [
        { id: "prp_pot", size: [0.3, 0.3, 0.3], shape: "cone", tip: 0.6 },
        { id: "prp_ramp", size: [0.6, 0.4, 0.2], shape: "wedge", axis: "y", flip: true },
        // Axis "x": the long extent moves to x and the CIRCULAR pair to y/z.
        { id: "prp_pipe", size: [1, 0.4, 0.4], shape: "tube", thickness: 0.05, axis: "x" },
        { id: "prp_pill", size: [0.2, 0.2, 0.8], shape: "capsule" },
      ],
      relations: [
        { type: "at", part: "prp_pot", center: [0, 0, 0.15] },
        { type: "at", part: "prp_ramp", center: [1, 0, 0.1] },
        { type: "at", part: "prp_pipe", center: [2, 0, 0.5] },
        { type: "at", part: "prp_pill", center: [3, 0, 0.4] },
      ],
    });
    const a = emitBlenderScript(solveScene(validateSceneSpec(build()).spec!));
    const b = emitBlenderScript(solveScene(validateSceneSpec(build()).spec!));
    expect(a).toBe(b);
    // Axis and flip reach the emitted call, so the wedge's own coordinate
    // construction has the two facts it needs.
    expect(a).toContain('_part("prp_ramp", "wedge", (0.6, 0.4, 0.2), (1, 0, 0.1), "y", True)');
    expect(a).toContain('_part("prp_pipe", "tube", (1, 0.4, 0.4), (2, 0, 0.5), "x", False, thickness=0.05)');
  });

  it("emits authored material specs, emission and alpha included", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      materials: {
        mtl_lamp: {
          baseColor: [1, 0.9, 0.7],
          roughness: 0.4,
          emission: [1, 0.85, 0.6],
          emissionStrength: 5,
        },
        mtl_glass: { baseColor: [0.8, 0.9, 1], roughness: 0.05, alpha: 0.3 },
      },
      parts: [
        { id: "prp_bulb", size: [0.2, 0.2, 0.2], shape: "sphere", material: "mtl_lamp" },
        { id: "prp_pane", size: [1, 0.02, 1], material: "mtl_glass" },
      ],
      relations: [
        { type: "at", part: "prp_bulb", center: [0, 0, 1] },
        { type: "at", part: "prp_pane", center: [0, 1, 0.5] },
      ],
    };
    const { spec: valid } = validateSceneSpec(spec);
    const script = emitBlenderScript(solveScene(valid!), { materials: valid!.materials! });
    expect(script).toContain('"emission": (1, 0.85, 0.6, 1)');
    expect(script).toContain('"emission_strength": 5');
    expect(script).toContain('"alpha": 0.3');
    expect(script).toContain('"base_color": (0.8, 0.9, 1, 0.3)');
  });

  it("steers the camera without replacing the derived framing", () => {
    const spec = colonnade();
    const front = emitBlenderScript(solveScene(spec), { camera: { azimuthDeg: 0 } });
    const threeQ = emitBlenderScript(solveScene(spec), { camera: {} });
    expect(front).not.toBe(threeQ);
    expect(front).toContain('cam.name = "cam_hero"');
  });

  it("emits a sun for outdoor lighting", () => {
    const script = emitBlenderScript(solveScene(colonnade()), { light: "sun" });
    expect(script).toContain('type="SUN"');
  });

  it("stays byte-stable for an unchanged spec, repeats and shapes included", () => {
    const a = emitBlenderScript(solveScene(colonnade()));
    const b = emitBlenderScript(solveScene(colonnade()));
    expect(a).toBe(b);
  });
});

describe("static rotation", () => {
  /* ---- validation: a rotation that rotates nothing is refused -------- */

  it("refuses a rotation axis that is not an axis", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], rotate: { axis: "w", deg: 30 } }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors).toContain("parts[0].rotate.axis must be x, y or z");
  });

  it("refuses a whole turn — the no-op the author believes did something", () => {
    for (const deg of [0, 360, -360, 720]) {
      const { errors } = validateSceneSpec({
        schemaVersion: 1,
        parts: [{ id: "prp_a", size: [1, 1, 1], rotate: { axis: "z", deg } }],
        relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
      });
      expect(errors.join("\n"), `deg ${deg}`).toContain(
        `parts[0].rotate.deg is ${deg}, a whole number of turns`,
      );
    }
  });

  it("refuses more than a full turn and names the angle it actually reaches", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], rotate: { axis: "z", deg: 430 } }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.join("\n")).toContain(
      "parts[0].rotate.deg must be greater than -360 and less than 360 — 430 is more than a full turn; write the angle it actually reaches (70)",
    );
  });

  it("accepts a right angle — reorienting a wedge is a real thing to want", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [1, 0.2, 0.2], shape: "wedge", axis: "x", rotate: { axis: "z", deg: 90 } },
      ],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.1] }],
    });
    expect(errors).toEqual([]);
    expect(spec!.parts[0]!.rotate).toEqual({ axis: "z", deg: 90 });
  });

  it("refuses an unknown key inside rotate", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], rotate: { axis: "z", deg: 30, pivot: [0, 0, 0] } }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors).toContain(
      "parts[0].rotate.pivot is not a rotate field — known fields: axis, deg",
    );
  });

  it("refuses span and rotate on the same part — two authorities over one extent", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_l", size: [0.2, 0.2, 1] },
        { id: "prp_r", size: [0.2, 0.2, 1] },
        { id: "prp_beam", size: [0.1, 0.1, 0.1], rotate: { axis: "y", deg: 20 } },
      ],
      relations: [
        { type: "at", part: "prp_l", center: [-1, 0, 0.5] },
        { type: "at", part: "prp_r", center: [1, 0, 0.5] },
        { type: "span", part: "prp_beam", from: "prp_l", to: "prp_r", axis: "x" },
      ],
    });
    expect(errors.join("\n")).toContain(
      "relations: part 'prp_beam' is both spanned and rotated — a span solves the part's size on a world axis, which a rotation would un-solve",
    );
  });

  it("lists rotate in the vocabulary an unknown part key is measured against", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], rotated: 30 }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.join("\n")).toContain("rotate");
  });

  /* ---- the world box: the solver reasons in the rotated bound -------- */

  it("solves a quarter-turned part as its swapped world box", () => {
    const scene = solveScene({
      schemaVersion: 1,
      parts: [{ id: "prp_bar", size: [1, 0.2, 0.2], rotate: { axis: "z", deg: 90 } }],
      relations: [{ type: "at", part: "prp_bar", center: [0, 0, 0.1] }],
    });
    const bar = scene.parts[0]!;
    expect(bar.size[0]).toBeCloseTo(0.2, 9);
    expect(bar.size[1]).toBeCloseTo(1, 9);
    // The extent ALONG the rotation axis is untouched.
    expect(bar.size[2]).toBe(0.2);
    // The local box — what the shape still fills exactly — rides alongside.
    expect(bar.localSize).toEqual([1, 0.2, 0.2]);
    expect(bar.rotate).toEqual({ axis: "z", deg: 90 });
  });

  it("solves a 45-degree unit cube as a root-two bound", () => {
    const scene = solveScene({
      schemaVersion: 1,
      parts: [{ id: "prp_cube", size: [1, 1, 1], rotate: { axis: "z", deg: 45 } }],
      relations: [{ type: "at", part: "prp_cube", center: [0, 0, 0.5] }],
    });
    const cube = scene.parts[0]!;
    expect(cube.size[0]).toBeCloseTo(Math.SQRT2, 9);
    expect(cube.size[1]).toBeCloseTo(Math.SQRT2, 9);
    expect(cube.size[2]).toBe(1);
  });

  it("leaves an unrotated part's solved shape byte-identical (no stray fields)", () => {
    const scene = solveScene({
      schemaVersion: 1,
      parts: [{ id: "prp_cube", size: [1, 1, 1] }],
      relations: [{ type: "at", part: "prp_cube", center: [0, 0, 0.5] }],
    });
    expect(scene.parts[0]!.size).toEqual([1, 1, 1]);
    expect("localSize" in scene.parts[0]!).toBe(false);
    expect("rotate" in scene.parts[0]!).toBe(false);
  });

  /* ---- relations see the world box and nothing else ------------------ */

  it("rests a part on the ROTATED bound's top face", () => {
    // A 1m bar tipped a quarter turn about y stands 1m tall: its world box
    // is [0.2, 0.2, 1], so anything sitting on it starts a metre up — not
    // at the 0.2m the authored size would suggest.
    const scene = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_bar", size: [1, 0.2, 0.2], rotate: { axis: "y", deg: 90 } },
        { id: "prp_cap", size: [0.1, 0.1, 0.1] },
      ],
      relations: [
        { type: "at", part: "prp_bar", center: [0, 0, 0.5] },
        { type: "sits_on", part: "prp_cap", on: "prp_bar" },
      ],
    });
    const bar = scene.parts.find((p) => p.id === "prp_bar")!;
    const cap = scene.parts.find((p) => p.id === "prp_cap")!;
    expect(bar.size[2]).toBeCloseTo(1, 9);
    // top of the world box (1.0) minus the 1mm embed plus half the cap.
    expect(cap.center[2]).toBeCloseTo(1 - MIN_CONTACT + 0.05, 9);
  });

  it("insets from the ROTATED bound, so a canted part still clears the edge", () => {
    const scene = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [4, 4, 0.1] },
        { id: "prp_sign", size: [1, 0.2, 0.2], rotate: { axis: "z", deg: 90 } },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "sits_on", part: "prp_sign", on: "prp_slab" },
        { type: "inset_from", part: "prp_sign", from: "prp_slab", faces: ["y-"], by: 0.5 },
      ],
    });
    const sign = scene.parts.find((p) => p.id === "prp_sign")!;
    // World y extent is 1 (the local x extent, turned), so the centre sits
    // half a metre further in than the authored 0.2 would have put it.
    expect(sign.center[1]).toBeCloseTo(-2 + 0.5 + 0.5, 9);
  });

  it("repeat clones inherit the rotation and both boxes", () => {
    const scene = solveScene({
      schemaVersion: 1,
      parts: [{ id: "prp_fin", size: [1, 0.2, 0.2], rotate: { axis: "z", deg: 90 } }],
      relations: [
        { type: "at", part: "prp_fin", center: [0, 0, 0.1] },
        { type: "repeat", part: "prp_fin", count: 3, along: "x", every: 0.5 },
      ],
    });
    const clones = scene.parts.filter((p) => p.from === "prp_fin");
    expect(clones).toHaveLength(2);
    for (const clone of clones) {
      expect(clone.rotate).toEqual({ axis: "z", deg: 90 });
      expect(clone.localSize).toEqual([1, 0.2, 0.2]);
      expect(clone.size[1]).toBeCloseTo(1, 9);
    }
    // And the pitch was judged against the WORLD extent on x (0.2), not the
    // authored 1 — so a 0.5 pitch is legal here and nothing was floored.
    expect(scene.diagnostics).toEqual([]);
  });

  /* ---- emission ------------------------------------------------------ */

  it("builds the primitive at the LOCAL box and rotates it at the solved centre", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [{ id: "prp_bar", size: [1, 0.2, 0.2], rotate: { axis: "z", deg: 90 } }],
      relations: [{ type: "at", part: "prp_bar", center: [0, 0, 0.1] }],
    };
    const script = emitBlenderScript(solveScene(spec));
    // The local box feeds the primitive; the inflated world bound must not.
    expect(script).toContain(
      '_static_rotate(_part("prp_bar", "box", (1, 0.2, 0.2), (0, 0, 0.1), "z", False), 2, 1.570796, (0, 0, 0.1))',
    );
    // The rotation is BAKED, so the exported transform stays identity and
    // the transform-hygiene rules stay quiet by construction.
    expect(script).toContain(
      "bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)",
    );
  });

  it("rotates the real-radius shapes identically — they skip the scale step, not this one", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_pipe", size: [0.4, 0.4, 1], shape: "tube", thickness: 0.05, rotate: { axis: "x", deg: 30 } },
        { id: "prp_pill", size: [0.2, 0.2, 0.8], shape: "capsule", rotate: { axis: "y", deg: 30 } },
      ],
      relations: [
        { type: "at", part: "prp_pipe", center: [0, 0, 1] },
        { type: "at", part: "prp_pill", center: [2, 0, 1] },
      ],
    };
    const script = emitBlenderScript(solveScene(spec));
    expect(script).toContain('_static_rotate(_part("prp_pipe", "tube", (0.4, 0.4, 1)');
    expect(script).toContain(", 0, 0.523599, (0, 0, 1))");
    expect(script).toContain('_static_rotate(_part("prp_pill", "capsule", (0.2, 0.2, 0.8)');
    expect(script).toContain(", 1, 0.523599, (2, 0, 1))");
  });

  it("emits nothing new for an unrotated spec, and stays byte-stable", () => {
    const plain = emitBlenderScript(solveScene(colonnade()));
    expect(plain).not.toContain("_static_rotate(_part");
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [{ id: "prp_bar", size: [1, 0.2, 0.2], rotate: { axis: "z", deg: 37.5 } }],
      relations: [{ type: "at", part: "prp_bar", center: [0, 0, 0.1] }],
    };
    expect(emitBlenderScript(solveScene(spec))).toBe(emitBlenderScript(solveScene(spec)));
  });

  it("frames the shot from the rotated bound, so a canted part cannot leave frame", () => {
    // frameScene reads the same world boxes the solver placed, which is the
    // whole reason `size` had to stay the world box: a diagonal slab needs a
    // wider shot than its authored extents ask for.
    const slabScene = (rotate?: { axis: "x" | "y" | "z"; deg: number }) =>
      solveScene({
        schemaVersion: 1,
        parts: [{ id: "prp_slab", size: [2, 0.4, 0.1], ...(rotate ? { rotate } : {}) }],
        relations: [{ type: "at", part: "prp_slab", center: [0, 0, 0.05] }],
      });
    const turned = frameScene(slabScene({ axis: "z", deg: 45 }));
    const flat = frameScene(slabScene());
    expect(turned.radius).toBeGreaterThan(flat.radius);
  });
});

describe("Rng (path-addressed)", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = new Rng(7).at("scatter/prp_rock");
    const b = new Rng(7).at("scatter/prp_rock");
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("KNOWN ANSWER: the first draws for seed 7 at 'k' are pinned", () => {
    // Any metric used as evidence needs a known-answer test — a randomness
    // source doubly so. These literals pin the exact bit-level behaviour
    // of the hash and the generator; a platform or refactor that changes
    // them changes every scattered scene on disk.
    const rng = new Rng(7).at("k");
    const draws = [rng.next(), rng.next(), rng.next()];
    expect(draws).toEqual([0.11132319500404175, 0.6377507481439104, 0.31257054802892126]);
  });

  it("is path-addressed, not counter-addressed", () => {
    // Kiln's property, verbatim: how much a SIBLING stream draws must not
    // move this stream. seed+counter schemes fail exactly this.
    const quiet = new Rng(3);
    const busy = new Rng(3);
    const sibling = busy.at("hair");
    for (let i = 0; i < 57; i++) sibling.next();
    expect(busy.at("freckles").next()).toBe(quiet.at("freckles").next());
  });

  it("distinguishes paths, seeds, and seed types", () => {
    expect(new Rng(1).at("a").next()).not.toBe(new Rng(1).at("b").next());
    expect(new Rng(1).at("a").next()).not.toBe(new Rng(2).at("a").next());
    expect(new Rng(1).at("a").next()).not.toBe(new Rng("1").at("a").next());
    // Nested derivation is not string concatenation.
    expect(new Rng(1).at("a").at("b").next()).not.toBe(new Rng(1).at("ab").next());
  });
});

describe("scatter", () => {
  const garden = (extra: { parts?: SceneSpec["parts"]; relations?: SceneSpec["relations"] } = {}): SceneSpec => ({
    schemaVersion: 1,
    parts: [
      { id: "prp_slab", size: [3, 3, 0.1] },
      { id: "prp_rock", size: [0.25, 0.25, 0.18], shape: "sphere" },
      ...(extra.parts ?? []),
    ],
    relations: [
      { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
      { type: "scatter", part: "prp_rock", on: "prp_slab", count: 12, seed: 7, minGap: 0.02, sizeJitter: 0.3 },
      ...(extra.relations ?? []),
    ],
  });

  it("places exactly count instances, all on the support, none touching", () => {
    const solved = solveScene(garden());
    expect(solved.diagnostics).toEqual([]);
    const rocks = solved.parts.filter((p) => p.id.startsWith("prp_rock"));
    expect(rocks).toHaveLength(12);
    for (const rock of rocks) {
      // Fully on the slab footprint…
      expect(rock.center[0] - rock.size[0] / 2).toBeGreaterThanOrEqual(-1.5);
      expect(rock.center[0] + rock.size[0] / 2).toBeLessThanOrEqual(1.5);
      expect(rock.center[1] - rock.size[1] / 2).toBeGreaterThanOrEqual(-1.5);
      expect(rock.center[1] + rock.size[1] / 2).toBeLessThanOrEqual(1.5);
      // …and embedded 1mm into its top, like sits_on.
      expect(rock.center[2] - rock.size[2] / 2).toBeCloseTo(0.1 - 0.001, 9);
    }
    // Pairwise: at least minGap of clear air on some horizontal axis.
    for (let i = 0; i < rocks.length; i++) {
      for (let j = i + 1; j < rocks.length; j++) {
        const a = rocks[i]!;
        const b = rocks[j]!;
        const sepX = Math.abs(a.center[0] - b.center[0]) - (a.size[0] + b.size[0]) / 2;
        const sepY = Math.abs(a.center[1] - b.center[1]) - (a.size[1] + b.size[1]) / 2;
        expect(Math.max(sepX, sepY)).toBeGreaterThanOrEqual(0.02 - 1e-9);
      }
    }
    expect(findCoplanarFaces(solved)).toEqual([]);
  });

  it("jitters size within the declared bound", () => {
    const rocks = solveScene(garden()).parts.filter((p) => p.id.startsWith("prp_rock"));
    const scales = rocks.map((r) => r.size[0] / 0.25);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.7);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.3);
    // With 12 draws at 30% jitter, identical sizes would mean the jitter
    // is not actually applied.
    expect(new Set(scales.map((s) => s.toFixed(6))).size).toBeGreaterThan(1);
  });

  it("is deterministic and immune to unrelated additions", () => {
    const before = solveScene(garden()).parts.filter((p) => p.id.startsWith("prp_rock"));
    // Add an unrelated part AND an unrelated relation. seed+counter RNG
    // fails this; path-addressed RNG cannot.
    const after = solveScene(
      garden({
        parts: [{ id: "prp_bench", size: [0.8, 0.3, 0.4] }],
        relations: [
          { type: "sits_on", part: "prp_bench", on: "prp_slab" },
          { type: "align", part: "prp_bench", to: "prp_slab", axes: ["x", "y"] },
        ],
      }),
    ).parts.filter((p) => p.id.startsWith("prp_rock"));
    expect(after).toEqual(before);
  });

  it("changes layout with the seed", () => {
    const a = solveScene(garden()).parts.filter((p) => p.id.startsWith("prp_rock"));
    const spec = garden();
    (spec.relations[1] as { seed: number }).seed = 8;
    const b = solveScene(spec).parts.filter((p) => p.id.startsWith("prp_rock"));
    expect(b.map((p) => p.center)).not.toEqual(a.map((p) => p.center));
  });

  it("fails loudly when the region cannot fit the count", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [0.6, 0.6, 0.1] },
        { id: "prp_rock", size: [0.25, 0.25, 0.18] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "scatter", part: "prp_rock", on: "prp_slab", count: 40, seed: 1 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-LIMIT");
    // No partial scatter sneaks into the scene.
    expect(solved.parts.filter((p) => p.id.startsWith("prp_rock"))).toHaveLength(0);
  });

  it("keeps two scatters on one support clear of each other", () => {
    const solved = solveScene(
      garden({
        parts: [{ id: "prp_tuft", size: [0.1, 0.1, 0.2], shape: "cone" }],
        relations: [
          { type: "scatter", part: "prp_tuft", on: "prp_slab", count: 10, seed: 3, minGap: 0.02 },
        ],
      }),
    );
    expect(solved.diagnostics).toEqual([]);
    const all = solved.parts.filter((p) => p.id !== "prp_slab");
    expect(all).toHaveLength(22);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        const sepX = Math.abs(a.center[0] - b.center[0]) - (a.size[0] + b.size[0]) / 2;
        const sepY = Math.abs(a.center[1] - b.center[1]) - (a.size[1] + b.size[1]) / 2;
        expect(Math.max(sepX, sepY), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(0.02 - 1e-9);
      }
    }
  });

  it("records the base part for provenance on every instance", () => {
    const rocks = solveScene(garden()).parts.filter((p) => p.from === "prp_rock");
    expect(rocks).toHaveLength(11);
  });
});

describe("lintClaims", () => {
  const censusOf = (over: Partial<Census>): Census =>
    ({
      blenderVersion: "5.0",
      sceneName: "Scene",
      objects: [],
      meshes: [],
      materials: [],
      textures: [],
      uvObjectsWithoutLayers: [],
      objectsWithoutMaterial: [],
      zFightingPairs: [],
      camera: { present: true, name: "cam_hero" },
      lightCount: 1,
      animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
      offCameraObjects: [],
      ...over,
    }) as Census;

  const mesh = (
    object: string,
    over: Partial<Census["meshes"][number]> = {},
  ): Census["meshes"][number] => ({
    object,
    verts: 8,
    faces: 6,
    tris: 12,
    ngons: 0,
    nonManifoldEdges: 0,
    zeroAreaFaces: 0,
    nan: false,
    uvLayers: [],
    materials: ["mtl_stone"],
    spatial: {
      worldMin: [-0.5, -0.5, 0],
      worldMax: [0.5, 0.5, 1],
      size: [1, 1, 1],
      bboxCenter: [0, 0, 0.5],
      centroid: [0, 0, 0.5],
      groundGap: 0,
    },
    ...over,
  });

  const run = (claims: Parameters<typeof lintClaims>[0], census: Census | undefined) => {
    const issues: Issue[] = [];
    lintClaims(claims, census, issues);
    return issues;
  };

  it("passes silently when every claim holds", () => {
    const census = censusOf({ meshes: [mesh("prp_a"), mesh("prp_b")] });
    expect(
      run(
        {
          parts: 2,
          maxTriangles: 24,
          grounded: true,
          maxHeight: 1,
          footprint: [1, 1],
          watertight: true,
          materialsUsed: ["mtl_stone"],
        },
        census,
      ),
    ).toEqual([]);
  });

  it("fails a wrong part count with both numbers", () => {
    const issues = run({ parts: 3 }, censusOf({ meshes: [mesh("prp_a")] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe(ISSUE_CODES.CLAIM_FAILED);
    expect(issues[0]!.severity).toBe("error");
    expect(issues[0]!.message).toContain("1 mesh parts, not 3");
  });

  it("fails a blown triangle budget with the measured total", () => {
    const issues = run(
      { maxTriangles: 20 },
      censusOf({ meshes: [mesh("prp_a"), mesh("prp_b", { tris: 100 })] }),
    );
    expect(issues[0]!.message).toContain("112 triangles");
  });

  it("fails grounding per sunken part, naming it", () => {
    const sunk = mesh("prp_buried", {
      spatial: {
        worldMin: [-0.5, -0.5, -0.2],
        worldMax: [0.5, 0.5, 0.8],
        size: [1, 1, 1],
        bboxCenter: [0, 0, 0.3],
        centroid: [0, 0, 0.3],
        groundGap: -0.2,
      },
    });
    const issues = run({ grounded: true }, censusOf({ meshes: [mesh("prp_ok"), sunk] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.target).toBe("prp_buried");
  });

  it("fails height and footprint against the union of all parts", () => {
    const tall = mesh("prp_tower", {
      spatial: {
        worldMin: [2, 2, 0],
        worldMax: [3, 3, 5],
        size: [1, 1, 5],
        bboxCenter: [2.5, 2.5, 2.5],
        centroid: [2.5, 2.5, 2.5],
        groundGap: 0,
      },
    });
    const issues = run({ maxHeight: 2, footprint: [2, 2] }, censusOf({ meshes: [mesh("prp_a"), tall] }));
    const claims = issues.map((i) => (i.detail as { claim: string }).claim).sort();
    expect(claims).toEqual(["footprint", "footprint", "maxHeight"]);
  });

  it("fails watertight on non-manifold edges", () => {
    const issues = run(
      { watertight: true },
      censusOf({ meshes: [mesh("prp_open", { nonManifoldEdges: 4 })] }),
    );
    expect(issues[0]!.message).toContain("4 non-manifold edges");
  });

  it("fails a claimed material bound to nothing", () => {
    const issues = run({ materialsUsed: ["mtl_ghost"] }, censusOf({ meshes: [mesh("prp_a")] }));
    expect(issues[0]!.target).toBe("mtl_ghost");
  });

  it("reports every claim as unchecked when there is no census — never as passed", () => {
    const issues = run({ parts: 1, grounded: true }, undefined);
    expect(issues).toHaveLength(2);
    for (const issue of issues) {
      expect(issue.code).toBe(ISSUE_CODES.CLAIM_UNCHECKED);
      expect(issue.severity).toBe("warning");
    }
  });

  it("reports maxTriangles unchecked when the census lacks triangle counts", () => {
    const legacy = mesh("prp_a");
    delete (legacy as { tris?: number }).tris;
    const issues = run({ maxTriangles: 100 }, censusOf({ meshes: [legacy] }));
    expect(issues[0]!.code).toBe(ISSUE_CODES.CLAIM_UNCHECKED);
  });
});

type AroundRelation = Extract<SceneSpec["relations"][number], { type: "around" }>;

describe("around (radial repeat)", () => {
  /**
   * A hub on the floor and one bar to ring it. The bar's Z comes from its own
   * `sits_on`, exactly as a repeat clone's does — `around` owns the circle's
   * plane and nothing else.
   */
  const ring = (
    around: Partial<AroundRelation> = {},
    bar: Partial<SceneSpec["parts"][number]> = {},
  ): SceneSpec => ({
    schemaVersion: 1,
    parts: [
      { id: "prp_floor", size: [4, 4, 0.1] },
      { id: "prp_hub", size: [0.3, 0.3, 0.3], shape: "cylinder" },
      { id: "prp_bar", size: [0.2, 0.2, 0.6], ...bar },
    ],
    relations: [
      { type: "at", part: "prp_floor", center: [0, 0, 0.05] },
      { type: "sits_on", part: "prp_hub", on: "prp_floor" },
      { type: "align", part: "prp_hub", to: "prp_floor", axes: ["x", "y"] },
      { type: "sits_on", part: "prp_bar", on: "prp_floor" },
      {
        type: "around",
        part: "prp_bar",
        center: "prp_hub",
        radius: 1,
        count: 4,
        ...around,
      } as AroundRelation,
    ],
  });

  it("lands four bars on the four compass points at the authored radius", () => {
    const solved = solveScene(ring());
    expect(solved.diagnostics).toEqual([]);
    const bars = solved.parts.filter((p) => p.id.startsWith("prp_bar"));
    expect(bars.map((p) => p.id)).toEqual(["prp_bar", "prp_bar_2", "prp_bar_3", "prp_bar_4"]);
    // The hub is centred on the floor at the origin, so the compass points
    // are exact rather than approximate.
    // `+ 0` folds the -0 a cosine of 270 degrees legitimately produces; the
    // emitter's own fixed-precision writer does the same, so it never reaches
    // a script either.
    const points = bars
      .map((p) => [Number(p.center[0].toFixed(6)) + 0, Number(p.center[1].toFixed(6)) + 0])
      .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    expect(points).toEqual([
      [-1, 0],
      [0, -1],
      [0, 1],
      [1, 0],
    ]);
    for (const bar of bars) {
      expect(Math.hypot(bar.center[0], bar.center[1])).toBeCloseTo(1, 9);
    }
  });

  it("takes the along-axis coordinate from the base's own relations", () => {
    const solved = solveScene(ring());
    const bars = solved.parts.filter((p) => p.id.startsWith("prp_bar"));
    // The floor's top is at 0.1 and sits_on sinks the bar by the contact
    // floor; every instance inherits that resting height, clones included.
    const restingZ = 0.1 - MIN_CONTACT + 0.3;
    for (const bar of bars) {
      expect(bar.center[2]).toBeCloseTo(restingZ, 9);
      expect(bar.restsOn).toBe("prp_floor");
    }
  });

  it("records the base part for provenance on every minted instance", () => {
    const solved = solveScene(ring());
    const clones = solved.parts.filter((p) => p.id.startsWith("prp_bar_"));
    expect(clones).toHaveLength(3);
    for (const clone of clones) expect(clone.from).toBe("prp_bar");
    // The base is the line the author wrote, so it carries no pointer.
    expect(solved.parts.find((p) => p.id === "prp_bar")!.from).toBeUndefined();
  });

  it("honours startDeg and rings about a named axis", () => {
    // A vertical wheel: normal x, so the circle spans (y, z) in cyclic order
    // and the ring owns the part's HEIGHT. Nothing else may, which is why
    // this spec has no sits_on on the ringed part — around owns the plane,
    // and a second authority over an axis in it is a SOLVE-CONFLICT.
    const solved = solveScene({
      schemaVersion: 1,
      parts: [
        { id: "prp_hub", size: [0.3, 0.3, 0.3] },
        { id: "prp_spoke", size: [0.1, 0.1, 0.2] },
      ],
      relations: [
        { type: "at", part: "prp_hub", center: [0, 0, 1] },
        { type: "align", part: "prp_spoke", to: "prp_hub", axes: ["x"] },
        {
          type: "around",
          part: "prp_spoke",
          center: "prp_hub",
          axis: "x",
          radius: 0.5,
          count: 2,
          startDeg: 90,
        },
      ],
    });
    expect(solved.diagnostics).toEqual([]);
    const spokes = solved.parts.filter((p) => p.id.startsWith("prp_spoke"));
    // 90 degrees is +z off the hub (the sine axis), 270 is -z, and neither
    // moves off the hub in y (the cosine axis).
    const zs = spokes.map((p) => p.center[2]).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(0.5, 9);
    expect(zs[1]).toBeCloseTo(1.5, 9);
    for (const spoke of spokes) expect(spoke.center[1]).toBeCloseTo(0, 9);
  });

  it("swells each instance's world box by its own orient angle", () => {
    const solved = solveScene(ring({ count: 4, orient: true }, { size: [0.8, 0.2, 0.6] }));
    expect(solved.diagnostics).toEqual([]);
    const byId = new Map(solved.parts.map((p) => [p.id, p]));
    // startDeg defaults to 0, so the base is un-turned and carries no rotate;
    // the clones turn a quarter, a half and three quarters about the circle.
    expect(byId.get("prp_bar")!.rotate).toBeUndefined();
    expect(byId.get("prp_bar_2")!.rotate).toEqual({ axis: "z", deg: 90 });
    expect(byId.get("prp_bar_3")!.rotate).toEqual({ axis: "z", deg: 180 });
    expect(byId.get("prp_bar_4")!.rotate).toEqual({ axis: "z", deg: 270 });
    // A quarter turn swaps the world box's x and y — rotatedBoxSize, the same
    // predicate every rotated part is measured with.
    expect(byId.get("prp_bar_2")!.size[0]).toBeCloseTo(0.2, 9);
    expect(byId.get("prp_bar_2")!.size[1]).toBeCloseTo(0.8, 9);
    // The LOCAL box, which the emitter builds at, is untouched by the turn.
    expect(byId.get("prp_bar_2")!.localSize).toEqual([0.8, 0.2, 0.6]);
    expect(byId.get("prp_bar_3")!.size[0]).toBeCloseTo(0.8, 9);
  });

  it("turns the BASE too when startDeg is not zero, and sums an authored rotate", () => {
    const solved = solveScene(
      ring(
        { count: 4, startDeg: 30, orient: true },
        { size: [0.8, 0.2, 0.6], rotate: { axis: "z", deg: 15 } },
      ),
    );
    expect(solved.diagnostics).toEqual([]);
    const byId = new Map(solved.parts.map((p) => [p.id, p]));
    // 15 authored + 30 start = 45 on the base; each clone adds a quarter turn,
    // and the composed angles stay inside the (-360, 360) window every other
    // consumer reads `rotate.deg` in, rather than running on past a full turn.
    expect(byId.get("prp_bar")!.rotate).toEqual({ axis: "z", deg: 45 });
    expect(byId.get("prp_bar_2")!.rotate).toEqual({ axis: "z", deg: 135 });
    expect(byId.get("prp_bar_4")!.rotate).toEqual({ axis: "z", deg: 315 });
    for (const bar of solved.parts.filter((p) => p.id.startsWith("prp_bar"))) {
      expect(Math.abs(bar.rotate!.deg)).toBeLessThan(360);
    }
    // The base's world box was measured WITH its composed turn — which is the
    // box its sits_on read to seat it.
    const bound = 0.8 * Math.cos(Math.PI / 4) + 0.2 * Math.sin(Math.PI / 4);
    expect(byId.get("prp_bar")!.size[0]).toBeCloseTo(bound, 9);
  });

  it("emits a ring as ordinary placed parts — no new emitter vocabulary", () => {
    const script = emitBlenderScript(solveScene(ring({ count: 4, orient: true })));
    expect(script).toContain('_part("prp_bar", "box"');
    // Oriented clones wear the same _static_rotate wrapper an authored
    // rotate has always used.
    expect(script).toContain('_static_rotate(_part("prp_bar_2", "box"');
    expect(script).toContain('_static_rotate(_part("prp_bar_3", "box"');
  });

  it("is byte-stable across compiles of an around-expanded spec", () => {
    const a = emitBlenderScript(solveScene(ring({ count: 6, startDeg: 22.5, orient: true })));
    const b = emitBlenderScript(solveScene(ring({ count: 6, startDeg: 22.5, orient: true })));
    expect(a).toBe(b);
  });

  it("cannot z-fight: a ring of bars keeps every face off its neighbours", () => {
    expect(findCoplanarFaces(solveScene(ring({ count: 8, radius: 1.5 })))).toEqual([]);
  });

  it("names the unplaced centre through the blocker-chain machinery", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_hub", size: [0.3, 0.3, 0.3] },
        { id: "prp_bar", size: [0.2, 0.2, 0.6] },
      ],
      // Nothing places the hub, so the ring can never resolve.
      relations: [{ type: "around", part: "prp_bar", center: "prp_hub", radius: 1, count: 3 }],
    };
    const solved = solveScene(spec);
    const unresolved = solved.diagnostics.filter((d) => d.code === "SOLVE-UNRESOLVED");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved[0]!.message).toContain("around");
    expect(unresolved[0]!.message).toContain("prp_hub");
    expect(unresolved[0]!.message).toContain("never placed");
  });

  it("refuses a ring past the repeat ceiling", () => {
    // Pinned to the constant, not a literal: the ceiling is a runaway
    // backstop whose exact value may move, and this test guards the
    // refusal, not the number.
    const solved = solveScene(ring({ count: MAX_REPEAT_COUNT + 1, radius: 50 }));
    const limit = solved.diagnostics.filter((d) => d.code === "SOLVE-LIMIT");
    expect(limit).toHaveLength(1);
    expect(limit[0]!.message).toContain(String(MAX_REPEAT_COUNT + 1));
    expect(limit[0]!.message).toContain(`the ceiling is ${MAX_REPEAT_COUNT}`);
  });

  it("refuses a minted id that collides with an authored part", () => {
    const spec = ring();
    spec.parts.push({ id: "prp_bar_2", size: [0.1, 0.1, 0.1] });
    spec.relations.push({ type: "at", part: "prp_bar_2", center: [3, 3, 0.05] });
    const solved = solveScene(spec);
    const conflict = solved.diagnostics.find((d) => d.code === "SOLVE-CONFLICT")!;
    expect(conflict.message).toContain("prp_bar_2");
    expect(conflict.message).toContain("already exists");
  });

  /* ---- validation ---------------------------------------------------- */

  const errorsFor = (relations: unknown[], parts?: unknown[]): string[] =>
    validateSceneSpec({
      schemaVersion: 1,
      parts: parts ?? [
        { id: "prp_hub", size: [0.3, 0.3, 0.3] },
        { id: "prp_bar", size: [0.2, 0.2, 0.6] },
      ],
      relations: [{ type: "at", part: "prp_hub", center: [0, 0, 0.15] }, ...relations],
    }).errors;

  it("accepts a well-formed around and round-trips its fields", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_hub", size: [0.3, 0.3, 0.3] },
        { id: "prp_bar", size: [0.2, 0.2, 0.6] },
      ],
      relations: [
        { type: "at", part: "prp_hub", center: [0, 0, 0.15] },
        { type: "at", part: "prp_bar", center: [0, 0, 0.3] },
        {
          type: "around",
          part: "prp_bar",
          center: "prp_hub",
          axis: "y",
          radius: 1.25,
          count: 8,
          startDeg: -45,
          orient: true,
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(spec!.relations[2]).toEqual({
      type: "around",
      part: "prp_bar",
      center: "prp_hub",
      axis: "y",
      radius: 1.25,
      count: 8,
      startDeg: -45,
      orient: true,
    });
  });

  it("refuses a non-positive radius, a count below two, and a runaway startDeg", () => {
    const errors = errorsFor([
      { type: "around", part: "prp_bar", center: "prp_hub", radius: 0, count: 1, startDeg: 720 },
    ]);
    expect(errors.some((e) => e.includes(".radius must be a positive number"))).toBe(true);
    expect(errors.some((e) => e.includes(".count must be an integer >= 2"))).toBe(true);
    expect(errors.some((e) => e.includes(".startDeg must be greater than -360"))).toBe(true);
  });

  it("refuses an unknown key on around, scoped to around's own field set", () => {
    const errors = errorsFor([
      { type: "around", part: "prp_bar", center: "prp_hub", radius: 1, count: 3, every: 0.5 },
    ]);
    expect(errors.some((e) => e.includes("every is not a field of relation 'around'"))).toBe(true);
  });

  it("refuses around beside repeat, scatter, another around, or a span", () => {
    const base = { type: "around", part: "prp_bar", center: "prp_hub", radius: 1, count: 3 };
    expect(
      errorsFor([base, { type: "repeat", part: "prp_bar", count: 2, along: "x", every: 1 }]).some(
        (e) => e.includes("targeted by both around and repeat"),
      ),
    ).toBe(true);
    expect(
      errorsFor([base, { type: "scatter", part: "prp_bar", on: "prp_hub", count: 2 }]).some((e) =>
        e.includes("targeted by both around and scatter"),
      ),
    ).toBe(true);
    expect(
      errorsFor([base, { ...base, radius: 2 }]).some((e) =>
        e.includes("is targeted by 2 around relations"),
      ),
    ).toBe(true);
    expect(
      errorsFor([
        base,
        { type: "span", part: "prp_bar", from: "prp_hub", to: "prp_hub", axis: "x" },
      ]).some((e) => e.includes("is both spanned and placed around a centre")),
    ).toBe(true);
  });

  it("refuses orient composed onto a part that already rotates about another axis", () => {
    const errors = errorsFor(
      [{ type: "around", part: "prp_bar", center: "prp_hub", radius: 1, count: 4, orient: true }],
      [
        { id: "prp_hub", size: [0.3, 0.3, 0.3] },
        { id: "prp_bar", size: [0.2, 0.2, 0.6], rotate: { axis: "x", deg: 20 } },
      ],
    );
    expect(errors).toContain(
      "relations: orient composes a rotation about z onto the clones, and 'prp_bar' already rotates about x — one axis per part for now",
    );
  });

  it("accepts orient composed onto a rotation about the SAME axis", () => {
    const errors = errorsFor(
      [{ type: "around", part: "prp_bar", center: "prp_hub", radius: 1, count: 4, orient: true }],
      [
        { id: "prp_hub", size: [0.3, 0.3, 0.3] },
        { id: "prp_bar", size: [0.2, 0.2, 0.6], rotate: { axis: "z", deg: 20 } },
      ],
    );
    expect(errors).toEqual([]);
  });

  it("lists around in the vocabulary an unknown relation type is measured against", () => {
    const errors = errorsFor([{ type: "round", part: "prp_bar" }]);
    expect(errors.some((e) => e.includes("expected at, sits_on"))).toBe(true);
    expect(errors.some((e) => e.includes('did you mean "around"?'))).toBe(true);
  });
});

describe("camera auto-framing", () => {
  const subject = (metres: number): SceneSpec => ({
    schemaVersion: 1,
    parts: [{ id: "prp_subject", size: [metres, metres, metres] }],
    relations: [{ type: "at", part: "prp_subject", center: [0, 0, metres / 2] }],
  });

  it("derives the default distance from the lens, not from a literal", () => {
    // d = r / (tan(fov/2) * fill) — recomputed here from the published lens
    // rather than restated as the number it happens to come out as.
    expect(AUTOFIT_DISTANCE).toBeCloseTo(1 / (Math.tan(CAMERA_HALF_FOV) * CAMERA_FILL), 12);
    expect(AUTOFIT_DISTANCE).toBeCloseTo(3.472222, 5);
  });

  it("fits a 26cm subject and a 26m subject to the same fraction of frame", () => {
    const lantern = frameScene(solveScene(subject(0.26)));
    const hangar = frameScene(solveScene(subject(26)));
    expect(lantern.fill).toBeCloseTo(CAMERA_FILL, 9);
    expect(hangar.fill).toBeCloseTo(CAMERA_FILL, 9);
    // Which is inside the band the framing promises, at both scales.
    for (const shot of [lantern, hangar]) {
      expect(shot.fill).toBeGreaterThan(0.75);
      expect(shot.fill).toBeLessThan(0.85);
    }
    // The METRES move with the subject, which is the thing the field report
    // was reaching for when it asked for 0.6 on a 26cm lantern.
    const away = (shot: ReturnType<typeof frameScene>) =>
      Math.hypot(
        shot.location[0] - shot.center[0],
        shot.location[1] - shot.center[1],
        shot.location[2] - shot.center[2],
      );
    expect(away(lantern)).toBeCloseTo(AUTOFIT_DISTANCE * lantern.radius, 9);
    expect(away(lantern)).toBeLessThan(1);
    expect(away(hangar)).toBeGreaterThan(50);
  });

  it("leaves an AUTHORED distance meaning exactly what it always meant", () => {
    const { radius } = frameScene(solveScene(subject(1)));
    const shot = frameScene(solveScene(subject(1)), { distance: 5 });
    expect(
      Math.hypot(
        shot.location[0] - shot.center[0],
        shot.location[1] - shot.center[1],
        shot.location[2] - shot.center[2],
      ),
    ).toBeCloseTo(5 * radius, 9);
    expect(shot.fill).toBeCloseTo(1 / (5 * Math.tan(CAMERA_HALF_FOV)), 12);
  });

  it("emits the lens the derivation reads instead of inheriting a default", () => {
    const script = emitBlenderScript(solveScene(subject(1)));
    expect(script).toContain("cam.data.lens = 50");
    expect(script).toContain("cam.data.sensor_width = 36");
  });

  it("names the unit, the floor's meaning, and the fitting value when distance is refused", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [0.26, 0.26, 0.26] }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.13] }],
      // 0.6 metres, which is what an author reaches for when they read this
      // knob as a distance instead of a multiple.
      camera: { distance: 0.6 },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("MULTIPLE OF THE SCENE'S BOUNDING RADIUS, not metres");
    expect(errors[0]).toContain("1 puts the camera on the bounding sphere itself");
    expect(errors[0]).toContain(AUTOFIT_DISTANCE.toFixed(2));
  });
});

describe("did-you-mean on unknown keys", () => {
  it("names the nearest part field, in full", () => {
    const message = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], materal: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    }).errors.find((e) => e.includes("materal"))!;
    expect(message).toBe(
      'parts[0].materal is not a part field — did you mean "material"? known fields: id, size, shape, file, script, axis, flip, tip, thickness, material, role, spin, bob, screw, rotate',
    );
  });

  it("suggests a truncated top-level key", () => {
    const message = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1] }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
      cam: { distance: 3 },
    }).errors.find((e) => e.includes("cam is not"))!;
    expect(message).toContain('did you mean "camera"?');
    expect(message).toContain("known fields: schemaVersion");
  });

  it("suggests across the claim, material, camera and relation gates too", () => {
    const errors = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_a: { baseColor: [1, 1, 1], metalic: 1 } },
      parts: [
        { id: "prp_a", size: [1, 1, 1], material: "mtl_a" },
        { id: "prp_b", size: [1, 1, 1] },
      ],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0.5] },
        { type: "sits_on", part: "prp_b", on: "prp_a", embeded: 0.01 },
      ],
      camera: { distence: 3 },
      claims: { maxHight: 2 },
    }).errors;
    expect(
      errors.some((e) =>
        e.includes('materials.mtl_a.metalic is not a material field — did you mean "metallic"?'),
      ),
    ).toBe(true);
    expect(
      errors.some((e) => e.includes('claims.maxHight has no oracle — did you mean "maxHeight"?')),
    ).toBe(true);
    expect(
      errors.some((e) =>
        e.includes('camera.distence is not a camera field — did you mean "distance"?'),
      ),
    ).toBe(true);
    expect(
      errors.some((e) =>
        e.includes(
          `relations[1].embeded is not a field of relation 'sits_on' — did you mean "embed"?`,
        ),
      ),
    ).toBe(true);
  });

  it("says nothing when nothing is close, rather than guessing", () => {
    const message = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], quaternionBasis: 3 }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    }).errors.find((e) => e.includes("quaternionBasis"))!;
    expect(message).not.toContain("did you mean");
    expect(message).toContain("known fields:");
  });

  it("does not guess at a short key, where two edits are noise", () => {
    expect(nearestKey("zz", ["id", "at", "by"])).toBeUndefined();
    // One edit on a short key is still a real match.
    expect(nearestKey("ax", ["at", "by"])).toBe("at");
  });

  it("prefers a case slip, then a prefix, then an edit — deterministically", () => {
    expect(nearestKey("BaseColor", ["baseColor", "baseColour"])).toBe("baseColor");
    expect(nearestKey("texelDensity", ["texelDensityMaxRatio", "roughness"])).toBe(
      "texelDensityMaxRatio",
    );
    expect(nearestKey("offste", ["offset", "onset"])).toBe("offset");
    // Same answer every call: the suggestion is a fact about the strings, not
    // about iteration order.
    expect(nearestKey("offste", ["onset", "offset"])).toBe("offset");
  });
});

describe("cross-file key guidance", () => {
  it("tells the author that target belongs in scene3d.json, not scene.json", () => {
    // No within-file did-you-mean can rescue this one: nothing in
    // scene.json vocabulary is near "target", and deleting the key loses
    // the voxel discipline silently. The message must name the other file.
    const result = validateSceneSpec({
      schemaVersion: 1,
      target: "minecraft",
      parts: [{ id: "prp_a", size: [1, 1, 1] }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(result.spec).toBeUndefined();
    expect(result.errors.some((e) => e.includes("target is not a scene.json field"))).toBe(true);
    expect(result.errors.some((e) => e.includes("scene3d.json"))).toBe(true);
  });
});

/*
 * Shape-aware rotated bounds and axis-general stacking — the sword-assembly
 * round. rotatedBoxSize's rectangle formula inflated any round shape's box
 * (a cylinder turned about its OWN axis grew 41% at 45°, so "flush" boxes
 * shipped meshes a centimetre apart), and sits_on could only stack along Z.
 */
describe("rotatedShapeSize", () => {
  it("a cylinder turned about its own axis keeps its box exactly", () => {
    const size = rotatedShapeSize(
      { shape: "cylinder", axis: "y" },
      [0.08, 0.01, 0.08],
      { axis: "y", deg: 45 },
    );
    expect(size[0]).toBeCloseTo(0.08, 12);
    expect(size[1]).toBeCloseTo(0.01, 12);
    expect(size[2]).toBeCloseTo(0.08, 12);
  });

  it("a sphere is rotation-invariant when its box is a cube", () => {
    const size = rotatedShapeSize({ shape: "sphere" }, [0.04, 0.04, 0.04], { axis: "x", deg: 33 });
    for (const extent of size) expect(extent).toBeCloseTo(0.04, 12);
  });

  it("an ellipsoid (sphere in a non-cubic box) rotates exactly, not by the box formula", () => {
    // Semi-axes 0.2 and 0.1 turned 45° about z: the support is
    // sqrt((a·dx)² + (b·dy)²) with d = (√½, ±√½, 0) → √(a²+b²)/√2 each way.
    const size = rotatedShapeSize({ shape: "sphere" }, [0.4, 0.2, 0.2], { axis: "z", deg: 45 });
    // width = 2·√((a·dx)² + (b·dy)²) with d = (√½, −√½, 0) → √2·√(a² + b²).
    expect(size[0]).toBeCloseTo(Math.sqrt(2) * Math.sqrt(0.2 ** 2 + 0.1 ** 2), 12);
    expect(size[1]).toBeCloseTo(size[0]!, 12);
    expect(size[2]).toBeCloseTo(0.2, 12);
    // Strictly tighter than the rectangle bound the old formula gave.
    expect(size[0]!).toBeLessThan(rotatedBoxSize([0.4, 0.2, 0.2], { axis: "z", deg: 45 })[0]!);
  });

  it("a box still gets the exact rectangle bound", () => {
    const viaShape = rotatedShapeSize({ shape: "box" }, [0.8, 0.2, 0.6], { axis: "z", deg: 31 });
    const viaBox = rotatedBoxSize([0.8, 0.2, 0.6], { axis: "z", deg: 31 });
    for (let i = 0; i < 3; i++) expect(viaShape[i]).toBeCloseTo(viaBox[i]!, 12);
  });

  it("a quarter turn swaps a cylinder's axes exactly", () => {
    const size = rotatedShapeSize(
      { shape: "cylinder", axis: "z" },
      [0.4, 0.4, 1.0],
      { axis: "x", deg: 90 },
    );
    expect(size[0]).toBeCloseTo(0.4, 12);
    expect(size[1]).toBeCloseTo(1.0, 12);
    expect(size[2]).toBeCloseTo(0.4, 12);
  });

  it("a frustum's rims govern its turned box", () => {
    // tip 0 cone, axis z, half-height 0.5, base radius 0.2, turned 90° about
    // x: the base disc now spans z, the apex reaches along y.
    const size = rotatedShapeSize(
      { shape: "cone", axis: "z", tip: 0 },
      [0.4, 0.4, 1.0],
      { axis: "x", deg: 90 },
    );
    expect(size[0]).toBeCloseTo(0.4, 12);
    expect(size[1]).toBeCloseTo(1.0, 12);
    expect(size[2]).toBeCloseTo(0.4, 12);
  });
});

describe("sits_on / above along an authored axis", () => {
  const sword = {
    schemaVersion: 1 as const,
    materials: { mtl_steel: { baseColor: [0.6, 0.6, 0.62] as [number, number, number] } },
    parts: [
      { id: "prp_grip", shape: "cylinder" as const, axis: "y" as const, size: [0.03, 0.12, 0.03] as [number, number, number], material: "mtl_steel" },
      { id: "prp_rainguard", shape: "cylinder" as const, axis: "y" as const, size: [0.08, 0.01, 0.08] as [number, number, number], material: "mtl_steel" },
    ],
    relations: [
      { type: "at" as const, part: "prp_grip", center: [0, -0.08, 0.1] as [number, number, number] },
      { type: "sits_on" as const, part: "prp_rainguard", on: "prp_grip", axis: "y" as const },
      { type: "align" as const, part: "prp_rainguard", to: "prp_grip", axes: ["x", "z"] as Array<"x" | "z"> },
    ],
  };

  it("stacks along Y with the 1mm embed, and records no gravity support", () => {
    const solved = solveScene(sword as never);
    expect(solved.diagnostics).toEqual([]);
    const guard = solved.parts.find((p) => p.id === "prp_rainguard")!;
    // grip top at -0.02; embed floor 1mm; guard half-height 0.005.
    expect(guard.center[1]).toBeCloseTo(-0.02 - 0.001 + 0.005, 9);
    // A Y attachment is not a gravity rest: grounding must not think the
    // rainguard is held up by the grip.
    expect(guard.restsOn).toBeUndefined();
  });

  it("validates the axis field instead of refusing it", () => {
    const result = validateSceneSpec({
      ...sword,
      relations: [
        sword.relations[0],
        { type: "sits_on", part: "prp_rainguard", on: "prp_grip", axis: "w" },
      ],
    });
    expect(result.errors.join("\n")).toContain("axis must be x, y or z");
  });
});

describe("obbSeparation", () => {
  it("proves two canted bars apart where their AABBs interpenetrate", () => {
    // Two parallel 45°-turned bars, offset 0.2m perpendicular to their
    // length: true face gap 0.1m, while each AABB spans ~0.778m per axis
    // and the AABBs overlap deeply — the false SOLVE-INTERSECTION case.
    const a = { center: [0, 0, 0] as [number, number, number], size: [1, 0.1, 0.1] as [number, number, number], rotate: { axis: "z" as const, deg: 45 } };
    const b = {
      center: [-0.2 * Math.SQRT1_2, 0.2 * Math.SQRT1_2, 0] as [number, number, number],
      size: [1, 0.1, 0.1] as [number, number, number],
      rotate: { axis: "z" as const, deg: 45 },
    };
    expect(obbSeparation(a, b)).toBeGreaterThan(0.099);
    // AABB overlap for contrast: rotated world extent ≈ 0.778 each.
    const world = rotatedShapeSize({ shape: "box" }, a.size, a.rotate);
    expect(world[0]!).toBeGreaterThan(0.7);
  });

  it("reports the exact minimum translation distance when they do intersect", () => {
    const a = { center: [0, 0, 0] as [number, number, number], size: [1, 0.1, 0.1] as [number, number, number], rotate: { axis: "z" as const, deg: 45 } };
    const b = {
      center: [-0.05 * Math.SQRT1_2, 0.05 * Math.SQRT1_2, 0] as [number, number, number],
      size: [1, 0.1, 0.1] as [number, number, number],
      rotate: { axis: "z" as const, deg: 45 },
    };
    expect(obbSeparation(a, b)).toBeCloseTo(-0.05, 9);
  });

  it("reduces to the AABB verdict for unrotated boxes", () => {
    const a = { center: [0, 0, 0] as [number, number, number], size: [1, 1, 1] as [number, number, number] };
    const b = { center: [1.25, 0, 0] as [number, number, number], size: [1, 1, 1] as [number, number, number] };
    expect(obbSeparation(a, b)).toBeCloseTo(0.25, 12);
    const c = { center: [0.75, 0, 0] as [number, number, number], size: [1, 1, 1] as [number, number, number] };
    expect(obbSeparation(a, c)).toBeCloseTo(-0.25, 12);
  });
});

describe("margin notes in the name maps", () => {
  it("ignores // keys as siblings of shader and material names", () => {
    // The convention's doc says "every unknown-key check" — which must
    // include the NAME MAPS, where a comment used to be refused as a badly
    // named shader, steering the author toward renaming their own note.
    const result = validateSceneSpec({
      schemaVersion: 1,
      "//": "top-level note",
      materials: {
        "//": "palette note",
        mtl_a: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5, metallic: 0 },
      },
      shaders: {
        "//": "kernel note",
        shd_rust: { kernel: "rust.glsl", size: 128, outputs: ["baseColor"] },
      },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_a" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(result.errors).toEqual([]);
    expect(result.spec).toBeDefined();
    // The notes are dropped, not carried: they never reach the emitter.
    expect(Object.keys(result.spec!.materials ?? {})).toEqual(["mtl_a"]);
    expect(Object.keys(result.spec!.shaders ?? {})).toEqual(["shd_rust"]);
  });
});

/* ---- the field-audit hardening round (valid-but-suspect + error voice) --- */

describe("valid-but-suspect authoring warnings (W-105 channel)", () => {
  it("warns on a kilometre-scale dimension with the unit-slip hint", () => {
    const { errors, warnings } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
      parts: [{ id: "prp_a", size: [100000, 1, 1], material: "mtl_m" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("millimetres written as metres"))).toBe(true);
  });

  it("warns that a rotation about a cylinder's own axis does nothing", () => {
    const { errors, warnings } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
      parts: [
        {
          id: "prp_spun",
          shape: "cylinder",
          size: [0.2, 0.2, 0.4],
          rotate: { axis: "z", deg: 45 },
          material: "mtl_m",
        },
      ],
      relations: [{ type: "at", part: "prp_spun", center: [0, 0, 0.2] }],
    });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("rotate does nothing"))).toBe(true);
  });

  it("stays silent for a rotation that actually turns something", () => {
    const { warnings } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
      parts: [
        { id: "prp_tilt", size: [0.3, 0.2, 0.2], rotate: { axis: "z", deg: 37 }, material: "mtl_m" },
      ],
      relations: [{ type: "at", part: "prp_tilt", center: [0, 0, 0.1] }],
    });
    expect(warnings).toEqual([]);
  });
});

describe("error voice (field-audit inconsistencies)", () => {
  const minimal = (partExtra: object, relations: unknown[] = []) => ({
    schemaVersion: 1,
    materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
    parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_m", ...partExtra }],
    relations: relations.length
      ? relations
      : [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
  });

  it("suggests the nearest shape for a one-character typo", () => {
    const { errors } = validateSceneSpec(minimal({ shape: "cylindar" }));
    expect(errors.some((e) => e.includes('did you mean "cylinder"'))).toBe(true);
  });

  it("says a wedge's axis is REQUIRED when none was written", () => {
    const { errors } = validateSceneSpec(minimal({ shape: "wedge" }));
    expect(errors.some((e) => e.includes("axis is required for a wedge"))).toBe(true);
  });

  it("maps above's `of`/`gap` to the real field names", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
      parts: [
        { id: "prp_a", size: [1, 1, 1], material: "mtl_m" },
        { id: "prp_b", size: [1, 1, 1], material: "mtl_m" },
      ],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0.5] },
        { type: "above", part: "prp_b", of: "prp_a", gap: 0.2 },
      ],
    });
    expect(errors.some((e) => e.includes('.of is not a field') && e.includes('did you mean "over"'))).toBe(true);
    expect(errors.some((e) => e.includes('.gap is not a field') && e.includes('did you mean "clearance"'))).toBe(true);
  });

  it("says schemaVersion is MISSING when it is missing", () => {
    const { errors } = validateSceneSpec({ parts: [], relations: [] });
    expect(errors.some((e) => e.includes("schemaVersion is missing"))).toBe(true);
  });

  it("does not cascade a broken shader into false material errors", () => {
    // One wrong key (`file` for `kernel`) plus an array size. The material
    // referencing the DECLARED-but-broken shader must produce no error of
    // its own, and no baseColor-fallback demand.
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      shaders: { shd_rust: { file: "rust.glsl", size: [512, 512] } },
      materials: { mtl_rust: { shader: "shd_rust" } },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_rust" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e.includes('did you mean "kernel"'))).toBe(true);
    expect(errors.some((e) => e.includes("size is one number"))).toBe(true);
    expect(errors.some((e) => e.includes("not declared in shaders"))).toBe(false);
    expect(errors.some((e) => e.includes("baseColor"))).toBe(false);
  });

  it("names a two-node placement cycle as a cycle, not a double constraint", () => {
    const { spec } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
      parts: [
        { id: "prp_a", size: [0.2, 0.2, 0.2], material: "mtl_m" },
        { id: "prp_b", size: [0.2, 0.2, 0.2], material: "mtl_m" },
      ],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0.1] },
        { type: "sits_on", part: "prp_b", on: "prp_a" },
        { type: "sits_on", part: "prp_a", on: "prp_b" },
      ],
    });
    const solved = solveScene(spec!);
    const conflict = solved.diagnostics.find((d) => d.code === "SOLVE-CONFLICT");
    expect(conflict).toBeDefined();
    expect(conflict!.message).toContain("cycle: prp_a → prp_b → prp_a");
  });

  it("warns when a span's body never reaches an anchor it names", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
      parts: [
        { id: "prp_column", size: [0.3, 0.3, 1], material: "mtl_m" },
        { id: "prp_post", size: [0.3, 0.3, 1], material: "mtl_m" },
        { id: "prp_rail", size: [0.1, 0.05, 0.05], material: "mtl_m" },
      ],
      relations: [
        { type: "at", part: "prp_column", center: [0, 0, 0.5] },
        // Diagonal neighbour: the x span solves, the y midpoint bridges air.
        { type: "at", part: "prp_post", center: [1.4, 1.4, 0.5] },
        { type: "span", part: "prp_rail", from: "prp_column", to: "prp_post", axis: "x" },
        { type: "at", part: "prp_rail", center: [null as unknown as number, undefined as unknown as number, 0.5] },
      ].slice(0, 3),
    });
    expect(errors).toEqual([]);
    const solved = solveScene(spec!);
    const suspect = solved.diagnostics.filter((d) => d.code === "SOLVE-SUSPECT");
    expect(suspect.length).toBeGreaterThan(0);
    expect(suspect[0]!.message).toContain("bridging air");
  });
});
