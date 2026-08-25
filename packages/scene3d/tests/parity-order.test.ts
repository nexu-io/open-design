import { describe, expect, it } from "vitest";
import {
  orderDrifts,
  fingerprintLosses,
  isCompilerProofFrame,
  isCompilerMaterialBall,
  boundsShift,
} from "../src/pipeline.js";

/**
 * W-902 (MASTER_ORDER_DRIFT): the set of joints/morphs survives lowering but
 * their ORDER does not. Counts and names still match, so E-901 stays silent —
 * yet index-bound skinning/morph animation can misalign. These pin the exact
 * boundary: drift only when the set is identical and the sequence differs.
 */
describe("orderDrifts", () => {
  it("stays silent when bone and morph order are preserved", () => {
    const fp = {
      boneOrder: { rig: ["hips", "spine", "head"] },
      morphs: { face: ["smile", "blink"] },
    };
    expect(orderDrifts(fp, fp)).toEqual([]);
  });

  it("flags a reordered joint list that kept every name", () => {
    const build = { boneOrder: { rig: ["hips", "spine", "head"] } };
    const master = { boneOrder: { rig: ["hips", "head", "spine"] } };
    expect(orderDrifts(build, master)).toEqual(["bone order on 'rig'"]);
  });

  it("flags a reordered morph-target list", () => {
    const build = { morphs: { face: ["smile", "blink", "frown"] } };
    const master = { morphs: { face: ["blink", "smile", "frown"] } };
    expect(orderDrifts(build, master)).toEqual(["morph-target order on 'face'"]);
  });

  it("does NOT flag a shrunk set — that is an E-901 loss, not a reorder", () => {
    const build = { boneOrder: { rig: ["hips", "spine", "head"] } };
    const master = { boneOrder: { rig: ["hips", "spine"] } };
    expect(orderDrifts(build, master)).toEqual([]);
  });

  it("does NOT flag an entry the master dropped entirely", () => {
    const build = { morphs: { face: ["smile", "blink"] } };
    const master = { morphs: {} };
    expect(orderDrifts(build, master)).toEqual([]);
  });
});

/**
 * E-901 (MASTER_LOSS): what the build had that the lowered master does not.
 * orderDrifts deliberately punts a shrunk/vanished set to "an E-901 loss" —
 * these pin that the loss is ACTUALLY emitted, which it was not for partial
 * action loss or for morphs at all. (E-1)
 */
describe("fingerprintLosses", () => {
  it("is silent when nothing was lost", () => {
    const fp = {
      meshes: { a: 10, b: 10 },
      materials: ["m"],
      armatures: { rig: 3 },
      actions: ["walk", "idle"],
      morphs: { face: ["smile", "blink"] },
    };
    expect(fingerprintLosses(fp, fp)).toEqual([]);
  });

  it("flags PARTIAL animation-clip loss, not just a total wipe", () => {
    const build = { actions: ["walk", "idle", "run"] };
    const master = { actions: ["walk"] };
    expect(fingerprintLosses(build, master)).toContain("2 of 3 animation clip(s)");
  });

  it("flags a single dropped morph target", () => {
    const build = { morphs: { face: ["smile", "blink", "frown"] } };
    const master = { morphs: { face: ["smile", "blink"] } };
    expect(fingerprintLosses(build, master)).toContain("1 of 3 morph target(s)");
  });

  it("flags a whole mesh's morphs vanishing", () => {
    const build = { morphs: { face: ["smile", "blink"], hand: ["fist"] } };
    const master = { morphs: { hand: ["fist"] } };
    expect(fingerprintLosses(build, master)).toContain("2 of 3 morph target(s)");
  });
});

/**
 * L-6: the proof-frame prune must delete ONLY the compiler's own output shape
 * (`proof-<24 hex>-<frame>.png`) so a user's hand-dropped file in the visible
 * out/proof dir is never silently removed.
 */
describe("isCompilerProofFrame", () => {
  it("matches the compiler's exact 24-hex frame names", () => {
    expect(isCompilerProofFrame("proof-0123456789abcdef01234567-000.png")).toBe(true);
    expect(isCompilerProofFrame("proof-0123456789abcdef01234567-359.png")).toBe(true);
  });

  it("spares a user file that merely resembles a proof frame", () => {
    expect(isCompilerProofFrame("proof-deadbeef-999.png")).toBe(false); // 8 hex, not 24
    expect(isCompilerProofFrame("my-render-001.png")).toBe(false);
    expect(isCompilerProofFrame("proof-0123456789abcdef01234567.png")).toBe(false); // no frame
  });
});

/**
 * The material-ball prune inherits the proof-frame lesson: `out/materials/`
 * is user-visible, so the pruner deletes only names the runner's own
 * `safe_filename` could have produced (alphanumerics, dot, underscore, dash)
 * and leaves everything else where the user put it.
 */
describe("isCompilerMaterialBall", () => {
  it("matches the compiler's own ball names, sanitised material and all", () => {
    expect(isCompilerMaterialBall("ball-mat_lava.png")).toBe(true);
    expect(isCompilerMaterialBall("ball-Gold.001.png")).toBe(true);
    // Deterministic collision suffix from two names that sanitise alike.
    expect(isCompilerMaterialBall("ball-mat_rust-2.png")).toBe(true);
  });

  it("spares anything the runner could not have written", () => {
    expect(isCompilerMaterialBall("ball-.png")).toBe(false); // empty stem
    expect(isCompilerMaterialBall("ball-my mat.png")).toBe(false); // space never survives
    expect(isCompilerMaterialBall("reference-ball.png")).toBe(false);
    expect(isCompilerMaterialBall("ball-lava.jpg")).toBe(false);
    expect(isCompilerMaterialBall("ball-lava.png.bak")).toBe(false);
  });
});

describe("boundsShift — parity asks WHERE the geometry is", () => {
  // The rest of the fingerprint counts content, so an asset that comes back
  // rotated or resized keeps every mesh, material, bone and clip and nothing
  // reports it. Calibration against 23 Khronos assets found the round trip
  // currently sound; this is what keeps it that way.
  const at = (bounds: number[] | null) => ({ bounds });

  it("is silent when the extents survive", () => {
    expect(boundsShift(at([1.5, 0.3, 2.2]), at([1.5, 0.3, 2.2]))).toBeNull();
  });

  it("forgives float drift through a text stage, proportionally", () => {
    // A 3.7km Sponza and a 2cm Avocado cannot share an absolute epsilon.
    expect(boundsShift(at([3720.854, 1555.876, 2288.233]), at([3720.9, 1555.87, 2288.24]))).toBeNull();
    expect(boundsShift(at([0.0426, 0.0629, 0.0276]), at([0.0426, 0.0629, 0.0276]))).toBeNull();
  });

  it("calls a permuted set a rotation, by name", () => {
    const shift = boundsShift(at([1.1789, 0.3259, 1.4499]), at([1.1789, 1.4499, 0.3259]))!;
    expect(shift).not.toBeNull();
    expect(shift.permuted).toBe(true);
    expect(shift.from).toContain("1.179");
  });

  it("calls a changed size a resize, not a rotation", () => {
    const shift = boundsShift(at([1, 1, 1]), at([100, 100, 100]))!;
    expect(shift.permuted).toBe(false);
  });

  it("says nothing when there is nothing to compare", () => {
    // Absent bounds (an older runner, or a scene with no renderable geometry)
    // must read as "not measured", never as a loss.
    expect(boundsShift(at(null), at([1, 1, 1]))).toBeNull();
    expect(boundsShift({}, {})).toBeNull();
    expect(boundsShift(at([0, 0, 0]), at([0, 0, 0]))).toBeNull();
  });
});
