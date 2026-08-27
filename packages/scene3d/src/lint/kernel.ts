import type { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import type { PredictedCensus } from "../kernel/mesh.js";

/**
 * Adjudicate a kernel part's exact PREDICTION against what Blender built.
 *
 * This is the debut consumer of the operator kernel and the purest expression
 * of the compiler's doctrine: even when the compiler is the author, it is not
 * the authority on whether the build succeeded. The kernel evaluates a part's
 * trace to an exact mesh and predicts its census; the runner measures the mesh
 * Blender actually produced; and these two INDEPENDENT readings are compared.
 *
 * The comparison is over the fit-INVARIANT facts only — vertex, face and
 * triangle counts, watertightness, and genus. The box-fit that places the mesh
 * inside its declared box is an affine bijection, so it cannot change any of
 * those; the bounding box, which the fit DOES change to the declared box, is
 * deliberately not adjudicated here. That makes every comparison an exact
 * integer/boolean equality, and any inequality a theorem-grade bug: the
 * evaluator, the emit bake, or Blender changed the topology, and the field
 * that differs localises which (a triangle-only delta is triangulation; a
 * vertex delta is the bake; a genus delta is a seam that opened or closed).
 */

export interface MeasuredMesh {
  vertices?: number;
  faces?: number;
  triangles?: number;
  watertight?: boolean;
  genus?: number | null;
  /** Morph-target (shape-key) names Blender built, excluding the Basis. */
  shapeKeys?: string[];
  /** Enclosed volume, fanned the SAME way the kernel fans (runner `fan_volume`),
   *  at full float precision — adjudicated against the exact rational volume. */
  volumeFan?: number;
}

/** Blender stores vertex coordinates as float32, so the built mesh's positions
 *  are the emitted float64 rounded to SINGLE precision — this, not the float64
 *  summation, dominates the gap between the kernel's exact volume and the
 *  build's fan measurement (a mesh at integer coords, exact in float32, matches
 *  to the bit; a subdivided mesh rounds at ~1e-7). The volume is degree-3 in the
 *  coordinates, so its relative error is a few float32 ε. */
const F32_EPS = 2 ** -23; // ≈ 1.19e-7
/** Generous headroom over the degree-3 propagation. It only has to sit far below
 *  a REAL divergence — a fit slip or a corrupt bake is macroscopic, orders of
 *  magnitude above float32 noise — so the separation stays clean. */
const KVOL = 32;

/** The four outcomes of comparing the build's fan volume to the kernel's exact:
 *  the build reproduced it within bound (`confirmed`); the census carried no
 *  finite volume (`unmeasured`); the exact value or its bound is outside
 *  float64's faithful range so the comparison is meaningless (`abstain`); or the
 *  build's volume is finite, comparable, and past the bound (`diverged`). */
export type VolumeCheckVerdict = "confirmed" | "unmeasured" | "abstain" | "diverged";

/**
 * The ONE predicate that decides whether a build's fan volume matches the exact.
 * Both the E-703 self-check and the `volume` claim's build-confirmation gate run
 * on it, so the claim can never disagree with the self-check about a part. Pure:
 * the same inputs give the same verdict on every machine.
 */
export function classifyVolumeCheck(
  exactVolume: number,
  exactVolumeStr: string,
  conditioning: number,
  volumeFan: number | undefined,
): VolumeCheckVerdict {
  if (volumeFan === undefined || !Number.isFinite(volumeFan)) return "unmeasured";
  const bound = KVOL * F32_EPS * conditioning;
  // The comparison can only speak when both magnitudes survive float64 and the
  // bound is a usable positive tolerance (see the E-703 notes below): a nonzero
  // exact volume that `toNumber` flushed to 0, a non-finite exact/bound, or a
  // bound that underflowed to 0 all make `|measured − exact| > bound` meaningless.
  if (
    !Number.isFinite(exactVolume) ||
    !Number.isFinite(bound) ||
    bound === 0 ||
    (exactVolume === 0 && exactVolumeStr !== "0")
  ) {
    return "abstain";
  }
  return Math.abs(volumeFan - exactVolume) > bound ? "diverged" : "confirmed";
}

export function adjudicateKernelPrediction(
  partId: string,
  predicted: PredictedCensus,
  measured: MeasuredMesh | undefined,
  /** Morph-target names the kernel predicted (empty when the recipe has none). */
  predictedShapeNames: readonly string[] = [],
): Issue[] {
  const issues: Issue[] = [];
  if (measured === undefined) {
    issues.push({
      code: ISSUE_CODES.KERNEL_PREDICTION_UNCHECKED,
      severity: "warning",
      message: `kernel part '${partId}': the build census was unavailable, so its exact prediction (${predicted.vertices} verts, ${predicted.faces} faces, ${predicted.triangles} tris, ${predicted.watertight ? "watertight" : "open"}) could not be adjudicated`,
      target: partId,
      detail: { predicted: summarize(predicted) },
    });
    return issues;
  }

  // Each field: compared when measured, reported as unchecked when the census
  // did not carry it — never silently assumed to agree.
  type CountField = "vertices" | "faces" | "triangles" | "watertight" | "genus";
  const checks: Array<{ field: CountField; predicted: number | boolean | null; kind: string }> = [
    { field: "vertices", predicted: predicted.vertices, kind: "vertex count" },
    { field: "faces", predicted: predicted.faces, kind: "face count" },
    { field: "triangles", predicted: predicted.triangles, kind: "triangle count" },
    { field: "watertight", predicted: predicted.watertight, kind: "watertightness" },
    { field: "genus", predicted: predicted.genus, kind: "genus" },
  ];

  const unchecked: string[] = [];
  for (const check of checks) {
    const got = measured[check.field];
    if (got === undefined) {
      unchecked.push(check.kind);
      continue;
    }
    if (!eq(check.predicted, got)) {
      issues.push({
        code: ISSUE_CODES.KERNEL_PREDICTION_MISMATCH,
        severity: "error",
        message: `kernel part '${partId}': predicted ${check.kind} ${fmt(check.predicted)} but the build measured ${fmt(got)} — the evaluator, the emit, or Blender changed the topology`,
        hint: hintFor(check.field),
        target: partId,
        detail: { field: check.field, predicted: check.predicted, measured: got },
      });
    }
  }

  // Morph targets: the census sees every shape key by name (absence = none
  // built), so this is a direct equality, not an unchecked field.
  const predictedShapes = [...predictedShapeNames].sort();
  const measuredShapes = (measured.shapeKeys ?? []).slice().sort();
  if (predictedShapes.length !== measuredShapes.length || predictedShapes.some((s, i) => s !== measuredShapes[i])) {
    issues.push({
      code: ISSUE_CODES.KERNEL_PREDICTION_MISMATCH,
      severity: "error",
      message: `kernel part '${partId}': predicted morph targets [${predictedShapes.join(", ")}] but the build has [${measuredShapes.join(", ")}] — the shape-key emit did not reach Blender intact`,
      hint: "a morph-target delta means the recipe's shape() brackets did not survive the emit",
      target: partId,
      detail: { field: "shapeKeys", predicted: predictedShapes, measured: measuredShapes },
    });
  }

  if (unchecked.length > 0) {
    issues.push({
      code: ISSUE_CODES.KERNEL_PREDICTION_UNCHECKED,
      severity: "warning",
      message: `kernel part '${partId}': the census did not measure ${unchecked.join(", ")}, so ${unchecked.length === 1 ? "that prediction was" : "those predictions were"} not adjudicated`,
      target: partId,
      detail: { unchecked },
    });
  }

  // Volume is the ONE real-valued fact, so it is judged within a FLOAT bound,
  // not by exact equality (kept out of the integer-exact block above on
  // purpose). The build's `volumeFan` is fanned identically to the kernel's
  // exact volume, so any gap beyond `K·ε·conditioning` is a real emit/build
  // divergence — a scaled or corrupted mesh — never Blender's own triangulation.
  if (predicted.mass) {
    const exact = predicted.mass.volume;
    const bound = KVOL * F32_EPS * predicted.mass.conditioning;
    // The verdict is the shared predicate `classifyVolumeCheck`, so the E-703
    // self-check here and the `volume` claim's build-confirmation gate can never
    // disagree about a part. The abstain rule keeps the check TOTAL: `toNumber`
    // underflows a nonzero exact volume to 0 below ~5e-324 and overflows a vast
    // one to Infinity, and the bound can underflow to exactly 0 (a zero tolerance
    // would fire on any float noise); wherever float64 cannot carry the magnitude
    // the comparison is meaningless, so E-703 ABSTAINS (W-702) rather than pass —
    // or fail — by accident. The EXACT rational claim (E-701) never leaves ℚ.
    const verdict = classifyVolumeCheck(exact, predicted.mass.volumeExact, predicted.mass.conditioning, measured.volumeFan);
    if (verdict === "unmeasured") {
      // Unchecked is not passed: a missing or non-finite measurement never reads
      // as agreement — the volume claim it would back stays unproven, not held.
      issues.push({
        code: ISSUE_CODES.KERNEL_PREDICTION_UNCHECKED,
        severity: "warning",
        message: `kernel part '${partId}': the census carried no finite volume, so the exact volume ${predicted.mass.volumeExact} could not be adjudicated`,
        target: partId,
        detail: { unchecked: ["volume"], predicted: predicted.mass.volumeExact },
      });
    } else if (verdict === "abstain") {
      issues.push({
        code: ISSUE_CODES.KERNEL_PREDICTION_UNCHECKED,
        severity: "warning",
        message: `kernel part '${partId}': the exact volume ${predicted.mass.volumeExact} is outside float64's faithful range, so the float-bound build check abstained (the exact volume claim still holds)`,
        target: partId,
        detail: { unchecked: ["volume"], predicted: predicted.mass.volumeExact },
      });
    } else if (verdict === "diverged") {
      issues.push({
        code: ISSUE_CODES.KERNEL_VOLUME_MISMATCH,
        severity: "error",
        message: `kernel part '${partId}': predicted exact volume ${exact} but the build measured ${measured.volumeFan} (float bound ±${bound.toExponential(2)}) — the emitted mesh was scaled or corrupted between the exact fit and the bake`,
        hint: "a volume delta far beyond float noise means the geometry changed between the exact mesh and the build — suspect the emit or a non-identity object scale",
        target: partId,
        detail: { predicted: exact, measured: measured.volumeFan, bound, conditioning: predicted.mass.conditioning },
      });
    }
  }
  return issues;
}

/** The one place that decides a hint from the field, so a mismatch always
 *  points at the most likely stage. */
function hintFor(field: keyof MeasuredMesh): string {
  switch (field) {
    case "triangles":
      return "counts of verts and faces agreeing while triangles differ points at triangulation, not the kernel";
    case "vertices":
    case "faces":
      return "a count delta means the emitted verts/faces did not reach Blender intact — suspect the bake or an importer merge";
    case "watertight":
    case "genus":
      return "a topology delta means a seam opened or closed between the exact mesh and the build — suspect a weld tolerance or a dropped face";
    default:
      return "the exact prediction and the build disagree";
  }
}

const eq = (a: number | boolean | null, b: number | boolean | null): boolean => a === b;
const fmt = (v: number | boolean | null): string => (v === null ? "n/a" : String(v));
const summarize = (c: PredictedCensus) => ({
  vertices: c.vertices,
  faces: c.faces,
  triangles: c.triangles,
  watertight: c.watertight,
  genus: c.genus,
});
