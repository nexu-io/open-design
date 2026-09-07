import { describe, expect, it } from "vitest";
import { emitBlenderScript } from "../src/solve/emit-bpy.js";
import { evalTrace, Recorder } from "../src/kernel/trace.js";
import { toEmitMesh } from "../src/kernel/mesh.js";
import type { SolvedPart, SolvedScene } from "../src/solve/types.js";

/**
 * The emit boundary for recipe parts: the pipeline hands the emitter the
 * already-evaluated, once-rounded kernel mesh, and the emitter serializes it
 * as a `_kernel_part` call. A scene that uses no recipe must be byte-identical
 * to before, and a recipe part with no provided mesh is a loud pipeline bug.
 */

const recipePart: SolvedPart = {
  id: "prp_hull",
  size: [1, 1, 1],
  center: [0, 0, 0],
  shape: "box",
  axis: "z",
  flip: false,
  recipe: "hull.py",
};
const boxPart: SolvedPart = { id: "prp_box", size: [1, 1, 1], center: [0, 0, 0], shape: "box", axis: "z", flip: false };
const scene = (parts: SolvedPart[]): SolvedScene => ({ parts, diagnostics: [] });
const mesh = toEmitMesh(evalTrace(new Recorder().box().subdivide(1).trace()));

describe("emit: recipe parts become _kernel_part", () => {
  it("serializes the evaluated mesh and emits the helper", () => {
    const script = emitBlenderScript(scene([recipePart]), { kernelMeshes: { prp_hull: mesh } });
    expect(script).toContain("def _kernel_part(");
    expect(script).toContain('_kernel_part("prp_hull"');
    // The exact topology travels: 26 verts, 24 faces for one CC step of a box.
    expect(mesh.verts).toHaveLength(26);
    expect(mesh.faces).toHaveLength(24);
    // Faces are emitted as tuples of the kernel's indices.
    expect(script).toMatch(/_kernel_part\("prp_hull", \[\(/);
  });

  it("leaves a scene without recipes byte-identical (no helper, no cache churn)", () => {
    const script = emitBlenderScript(scene([boxPart]));
    expect(script).not.toContain("_kernel_part");
    // The same scene emits the same bytes with an empty kernelMeshes map.
    expect(emitBlenderScript(scene([boxPart]), { kernelMeshes: {} })).toBe(script);
  });

  it("throws when a recipe part's mesh was not evaluated", () => {
    expect(() => emitBlenderScript(scene([recipePart]), {})).toThrow(/no evaluated kernel mesh/);
  });
});
