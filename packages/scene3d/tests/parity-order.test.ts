import { describe, expect, it } from "vitest";
import { orderDrifts, fingerprintLosses, isCompilerProofFrame } from "../src/pipeline.js";

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
