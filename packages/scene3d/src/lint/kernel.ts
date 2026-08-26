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
}

export function adjudicateKernelPrediction(
  partId: string,
  predicted: PredictedCensus,
  measured: MeasuredMesh | undefined,
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
  const checks: Array<{ field: keyof MeasuredMesh; predicted: number | boolean | null; kind: string }> = [
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

  if (unchecked.length > 0) {
    issues.push({
      code: ISSUE_CODES.KERNEL_PREDICTION_UNCHECKED,
      severity: "warning",
      message: `kernel part '${partId}': the census did not measure ${unchecked.join(", ")}, so ${unchecked.length === 1 ? "that prediction was" : "those predictions were"} not adjudicated`,
      target: partId,
      detail: { unchecked },
    });
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
