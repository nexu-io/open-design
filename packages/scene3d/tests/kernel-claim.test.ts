import { describe, expect, it } from "vitest";
import { adjudicateKernelPrediction, classifyVolumeCheck, MeasuredMesh } from "../src/lint/kernel.js";
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
const predicted = predictCensus(evalTrace(new Recorder().box().subdivide(1).trace()), { mass: true });

describe("kernel prediction adjudication", () => {
  it("stays silent when the build matches the prediction exactly", () => {
    const measured: MeasuredMesh = {
      vertices: predicted.vertices,
      faces: predicted.faces,
      triangles: predicted.triangles,
      watertight: predicted.watertight,
      genus: predicted.genus,
      volumeFan: predicted.mass!.volume, // the build measures exactly the exact volume
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

  it("fails E-703 when the measured volume diverges beyond the float bound", () => {
    // A volume off by 10% is orders of magnitude above the float32 bound — a
    // real emit/scale corruption, judged within a bound (not exact equality)
    // because volume is a real, kept separate from the integer-exact E-702.
    const measured: MeasuredMesh = { ...full(), volumeFan: predicted.mass!.volume * 1.1 };
    const issues = adjudicateKernelPrediction("prp_hull", predicted, measured);
    const bug = issues.find((i) => i.code === "S3D-E-703");
    expect(bug).toBeDefined();
    expect(bug!.detail).toMatchObject({ predicted: predicted.mass!.volume });
  });

  it("stays under the bound for a float-noise volume difference (no false E-703)", () => {
    // A perturbation at float32 scale (the build stores coords single-precision)
    // must NOT trip E-703.
    const measured: MeasuredMesh = { ...full(), volumeFan: predicted.mass!.volume * (1 + 5e-8) };
    expect(adjudicateKernelPrediction("prp_hull", predicted, measured).some((i) => i.code === "S3D-E-703")).toBe(false);
  });

  it("reports the volume UNCHECKED (W-702) when the census carried no finite volume", () => {
    // Unchecked is not passed: a missing/NaN measurement never reads as agreement.
    for (const bad of [undefined, NaN]) {
      const measured: MeasuredMesh = { ...full(), volumeFan: bad as number };
      const issues = adjudicateKernelPrediction("prp_hull", predicted, measured);
      const u = issues.find((i) => i.code === "S3D-W-702" && (i.detail?.unchecked as string[] | undefined)?.includes("volume"));
      expect(u).toBeDefined();
    }
  });

  it("ABSTAINS (W-702) when the exact volume is outside float64's range — never a silent E-703 pass", () => {
    // The E-703 bound is a float comparison; if the exact volume does not survive
    // the toNumber conversion (underflow of a nonzero volume to 0, or an overflow
    // to Infinity), the comparison is meaningless and must abstain, not pass. The
    // exact E-701 claim is unaffected — it never leaves ℚ.
    const unrepresentable = [
      { volume: Number.POSITIVE_INFINITY, volumeExact: "999999999999999999999999999999", conditioning: 1 }, // overflow
      { volume: 0, volumeExact: "1/100000000000000000000", conditioning: 1 }, // nonzero exact, underflowed float
      { volume: 1, volumeExact: "1", conditioning: 1e-320 }, // bound = K·ε·conditioning underflows to 0
    ];
    for (const bad of unrepresentable) {
      const p = { ...predicted, mass: { ...predicted.mass!, ...bad } };
      const measured: MeasuredMesh = { ...full(), volumeFan: 0.5 };
      const issues = adjudicateKernelPrediction("prp_hull", p, measured);
      expect(issues.some((i) => i.code === "S3D-E-703")).toBe(false);
      const u = issues.find((i) => i.code === "S3D-W-702" && (i.detail?.unchecked as string[] | undefined)?.includes("volume"));
      expect(u).toBeDefined();
    }
  });

  it("reports W-702 when there is no build census at all", () => {
    const issues = adjudicateKernelPrediction("prp_hull", predicted, undefined);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("S3D-W-702");
    expect(issues[0]!.message).toContain("build census was unavailable");
  });
});

describe("classifyVolumeCheck — the one verdict E-703 and the claim both consume", () => {
  // exact volume 1, conditioning 1 → bound = 32·2^-23 ≈ 3.8e-6.
  it("confirms a build within the float bound, including float32-scale noise", () => {
    expect(classifyVolumeCheck(1, "1", 1, 1)).toBe("confirmed");
    expect(classifyVolumeCheck(1, "1", 1, 1 + 1e-6)).toBe("confirmed"); // inside ~3.8e-6
  });
  it("reports a build past the bound as diverged", () => {
    expect(classifyVolumeCheck(1, "1", 1, 1.1)).toBe("diverged"); // 10% off ≫ bound
    expect(classifyVolumeCheck(1, "1", 1, 1 + 1e-4)).toBe("diverged"); // just past ~3.8e-6
  });
  it("reports a missing or non-finite measurement as unmeasured", () => {
    expect(classifyVolumeCheck(1, "1", 1, undefined)).toBe("unmeasured");
    expect(classifyVolumeCheck(1, "1", 1, NaN)).toBe("unmeasured");
  });
  it("abstains where float64 cannot carry the magnitude or the bound collapses", () => {
    expect(classifyVolumeCheck(Number.POSITIVE_INFINITY, "9e400", 1, 0.5)).toBe("abstain"); // exact overflow
    expect(classifyVolumeCheck(0, "1/100000000000000000000", 1, 0.5)).toBe("abstain"); // exact underflow, nonzero
    expect(classifyVolumeCheck(1, "1", 1e-320, 0.5)).toBe("abstain"); // bound underflows to 0
    expect(classifyVolumeCheck(0, "0", 1, 0)).toBe("confirmed"); // a true zero volume, measured zero
  });
});

function full(): MeasuredMesh {
  return {
    vertices: predicted.vertices,
    faces: predicted.faces,
    triangles: predicted.triangles,
    watertight: predicted.watertight,
    genus: predicted.genus,
    volumeFan: predicted.mass!.volume,
  };
}
