import { describe, expect, it } from "vitest";
import { adjudicateKernelPrediction, MeasuredMesh } from "../src/lint/kernel.js";
import { evalTrace } from "../src/kernel/trace.js";
import { predictCensus } from "../src/kernel/mesh.js";
import { Recorder } from "../src/kernel/trace.js";

/**
 * The predicted-census claim: the compiler checking ITSELF. The kernel's exact
 * prediction is adjudicated against the build census, and the fit-invariant
 * fields must match exactly — a mismatch is a theorem-grade bug, not a
 * tolerance.
 */

// A real prediction: box → 1 CC step → 26 verts / 24 faces / 48 tris, watertight.
const predicted = predictCensus(evalTrace(new Recorder().box().subdivide(1).trace()));

describe("kernel prediction adjudication", () => {
  it("stays silent when the build matches the prediction exactly", () => {
    const measured: MeasuredMesh = {
      vertices: predicted.vertices,
      faces: predicted.faces,
      triangles: predicted.triangles,
      watertight: predicted.watertight,
      genus: predicted.genus,
    };
    expect(adjudicateKernelPrediction("prp_hull", predicted, measured)).toEqual([]);
  });

  it("fails with E-702 when the vertex count differs, and names the bake", () => {
    const measured: MeasuredMesh = { ...full(), vertices: predicted.vertices + 1 };
    const issues = adjudicateKernelPrediction("prp_hull", predicted, measured);
    const bug = issues.find((i) => i.code === "S3D-E-702");
    expect(bug?.detail).toMatchObject({ field: "vertices", predicted: 26, measured: 27 });
    expect(bug?.hint).toContain("bake");
  });

  it("a triangle-only delta points at triangulation, not the kernel", () => {
    const measured: MeasuredMesh = { ...full(), triangles: predicted.triangles + 2 };
    const issues = adjudicateKernelPrediction("prp_hull", predicted, measured);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("S3D-E-702");
    expect(issues[0]!.hint).toContain("triangulation");
  });

  it("a genus delta reads as a seam that opened or closed", () => {
    const measured: MeasuredMesh = { ...full(), genus: 1, watertight: true };
    const issues = adjudicateKernelPrediction("prp_hull", predicted, measured);
    const bug = issues.find((i) => i.code === "S3D-E-702" && i.detail?.field === "genus");
    expect(bug?.hint).toContain("seam");
  });

  it("reports W-702 for a field the census did not measure — never assumes agreement", () => {
    const measured: MeasuredMesh = { vertices: predicted.vertices, faces: predicted.faces };
    const issues = adjudicateKernelPrediction("prp_hull", predicted, measured);
    expect(issues.every((i) => i.code === "S3D-W-702")).toBe(true);
    expect(issues[0]!.message).toContain("triangle count");
    expect(issues[0]!.message).toContain("watertightness");
  });

  it("reports W-702 when there is no build census at all", () => {
    const issues = adjudicateKernelPrediction("prp_hull", predicted, undefined);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("S3D-W-702");
    expect(issues[0]!.message).toContain("build census was unavailable");
  });
});

function full(): MeasuredMesh {
  return {
    vertices: predicted.vertices,
    faces: predicted.faces,
    triangles: predicted.triangles,
    watertight: predicted.watertight,
    genus: predicted.genus,
  };
}
