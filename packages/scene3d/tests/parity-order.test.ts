import { describe, expect, it } from "vitest";
import { orderDrifts } from "../src/pipeline.js";

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
