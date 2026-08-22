import { Issue, Census } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { LintContext } from "./naming.js";

/**
 * Geometric and numerical discipline. Everything here is computed by the
 * Blender runner (bmesh + mathutils) so the numbers are ground truth — the
 * linter only maps counts to stable codes.
 */
export function lintTopology(ctx: LintContext, issues: Issue[]): void {
  const census = ctx.census;
  if (!census) return;

  // Imported geometry is NOT special-cased here. These rules measure and
  // report on every mesh; lint/provenance.ts reclassifies findings about
  // third-party assets afterwards, so the relaxation is visible in the report
  // instead of being a rule that silently never fired.

  for (const mesh of census.meshes) {
    if (mesh.nan) {
      issues.push({
        code: ISSUE_CODES.NAN_TRANSFORM,
        severity: "error",
        message: `mesh '${mesh.object}' contains non-finite vertex coordinates`,
        target: mesh.object,
      });
    }
    // Open meshes are the norm in real game assets (single-sided cards,
    // non-closed skins — the Khronos Fox ships 1728 boundary edges), so
    // whether "not watertight" is a defect is the CONTRACT's call, not
    // this rule's. Authored scenes keep the strict default; scenes that
    // ingest third-party assets opt out. A `watertight` claim still
    // enforces closure regardless, because a claim is the author's own
    // assertion about a specific artifact.
    if (mesh.nonManifoldEdges > 0 && !ctx.contract.geometry.allowOpenMeshes) {
      issues.push({
        code: ISSUE_CODES.NON_MANIFOLD,
        severity: "error",
        message: `mesh '${mesh.object}' has ${mesh.nonManifoldEdges} non-manifold edge(s)`,
        hint: "repair the geometry before export, or set conventions.geometry.allowOpenMeshes for imported game assets",
        target: mesh.object,
        detail: { nonManifoldEdges: mesh.nonManifoldEdges },
      });
    }
    if (mesh.ngons > 0) {
      issues.push({
        code: ISSUE_CODES.NGONS,
        severity: "warning",
        message: `mesh '${mesh.object}' has ${mesh.ngons} ngon face(s)`,
        hint: "prefer quads for rigging/animation robustness",
        target: mesh.object,
        detail: { ngons: mesh.ngons },
      });
    }
    if (mesh.zeroAreaFaces > 0) {
      issues.push({
        code: ISSUE_CODES.ZERO_AREA_FACES,
        severity: "warning",
        message: `mesh '${mesh.object}' has ${mesh.zeroAreaFaces} zero-area face(s)`,
        target: mesh.object,
        detail: { zeroAreaFaces: mesh.zeroAreaFaces },
      });
    }

    /* Engine hygiene — counted by the runner, judged by the contract.
       All three are invisible in a Blender viewport and punished on
       import, which is exactly why they are compiler rules. */
    const geo = ctx.contract.geometry;
    const loose = (mesh.looseVerts ?? 0) + (mesh.looseEdges ?? 0);
    if (!geo.allowLooseGeometry && loose > 0) {
      issues.push({
        code: ISSUE_CODES.LOOSE_GEOMETRY,
        severity: "warning",
        message: `mesh '${mesh.object}' has ${mesh.looseVerts ?? 0} loose vertex(es) and ${mesh.looseEdges ?? 0} loose edge(s)`,
        hint: "delete loose geometry — it still exports, ray-picks, and inflates bounds",
        target: mesh.object,
        detail: { looseVerts: mesh.looseVerts ?? 0, looseEdges: mesh.looseEdges ?? 0 },
      });
    }
    if (!geo.allowDoubleVertices && (mesh.doubleVertices ?? 0) > 0) {
      issues.push({
        code: ISSUE_CODES.DOUBLE_VERTICES,
        severity: "warning",
        message: `mesh '${mesh.object}' has ${mesh.doubleVertices} vertex pair(s) within merge distance`,
        hint: "merge by distance — doubles split normals along their seam",
        target: mesh.object,
        detail: { doubleVertices: mesh.doubleVertices },
      });
    }
    // The doubles pass was skipped past the vertex cap: silence is "not
    // measured", not "clean". Only fires when the runner said so explicitly.
    if (!geo.allowDoubleVertices && mesh.doublesSampled === false) {
      issues.push({
        code: ISSUE_CODES.DOUBLE_VERTICES_UNCHECKED,
        severity: "warning",
        message: `mesh '${mesh.object}' is too dense (${mesh.verts.toLocaleString()} verts) to check for double vertices`,
        hint: "decimate or split the mesh if its seams must be verified",
        target: mesh.object,
        detail: { verts: mesh.verts },
      });
    }
    if (!geo.allowInconsistentWinding && (mesh.inconsistentWindingEdges ?? 0) > 0) {
      issues.push({
        code: ISSUE_CODES.INCONSISTENT_WINDING,
        severity: "warning",
        message: `mesh '${mesh.object}' has ${mesh.inconsistentWindingEdges} edge(s) where face winding disagrees — flipped normals`,
        hint: "recalculate normals outside; engines light the flipped side inside-out",
        target: mesh.object,
        detail: { inconsistentWindingEdges: mesh.inconsistentWindingEdges },
      });
    }
  }

  for (const obj of census.objects) {
    for (const [axis, value] of (["x", "y", "z"] as const).map((a, i) => [a, obj.location[i]] as const)) {
      if (!Number.isFinite(value)) {
        issues.push({
          code: ISSUE_CODES.NAN_TRANSFORM,
          severity: "error",
          message: `object '${obj.name}' has non-finite location (${axis})`,
          target: obj.name,
          detail: { axis, value: String(value) },
        });
      }
    }
    if (obj.scale.some((s) => !Number.isFinite(s))) {
      issues.push({
        code: ISSUE_CODES.NAN_TRANSFORM,
        severity: "error",
        message: `object '${obj.name}' has non-finite scale`,
        target: obj.name,
      });
    }
    // Degeneracy judged on the RAW scale, not the R6-rounded one: a 1e-9 axis
    // rounds to 0 and would fire (or not) by accident of rounding, and the
    // reported detail showed 0, hiding the true magnitude. NaN axes are the
    // NAN_TRANSFORM rule's business above, so null is skipped here.
    const rawScale = obj.scaleRaw ?? obj.scale;
    if (rawScale.some((s) => s !== null && Math.abs(s) < 1e-6)) {
      issues.push({
        code: ISSUE_CODES.DEGENERATE_SCALE,
        severity: "error",
        message: `object '${obj.name}' has a near-zero scale axis`,
        hint: "apply transforms or set scale to 1",
        target: obj.name,
        detail: { scale: rawScale },
      });
    }
    // A hidden mesh object still exports, counts against budget, and can
    // z-fight — while the master exporter may drop it, causing a parity loss.
    // Surfaced, never silently excluded from the census.
    if (obj.hasMeshData && obj.visible === false) {
      issues.push({
        code: ISSUE_CODES.HIDDEN_MESH,
        severity: "warning",
        message: `mesh object '${obj.name}' is hidden but still ships in the census`,
        hint: "unhide it, or delete it if it should not exist — a hidden mesh still exports and can drop from the master, causing a parity loss",
        target: obj.name,
        detail: { visible: false },
      });
    }
  }

  for (const pair of census.zFightingPairs) {
    issues.push({
      code: ISSUE_CODES.Z_FIGHTING,
      severity: "error",
      message: pair.worst
        ? `'${pair.a}' and '${pair.b}' share a ${pair.worst.axis}-facing plane at ${pair.worst.axis}=${pair.worst.at}m — ${pair.worst.extent[0]}×${pair.worst.extent[1]}m of overlap across ${pair.faceCount} face pair(s)`
        : `coplanar overlap between '${pair.a}' and '${pair.b}' (${pair.faceCount} face pair(s))`,
      hint: pair.worst
        ? `offset one surface along ${pair.worst.axis} by at least 1e-3`
        : "offset or separate the overlapping surfaces",
      target: `${pair.a} <-> ${pair.b}`,
      detail: { faceCount: pair.faceCount, area: pair.area, ...(pair.worst ? { worst: pair.worst } : {}) },
    });
  }

  /*
   * The coplanar search has caps, and a capped search that reports nothing
   * is indistinguishable from a clean scene. Say so out loud: "no z-fighting
   * found" and "did not look everywhere" are different claims, and only the
   * compiler knows which one it is making.
   */
  const skipped = census.zFightingSkipped ?? [];
  if (skipped.length > 0) {
    issues.push({
      code: ISSUE_CODES.Z_FIGHTING_UNCHECKED,
      severity: "warning",
      message: `z-fighting search did not cover the whole scene (${skipped.length} exclusion(s))`,
      hint: "split the scene or reduce mesh density if this surface must be verified",
      detail: { skipped },
    });
  }
}

/** Presence of a mesh is a sanity floor for a "modelling" pipeline. */
export function lintEmptyMeshes(census: Census, issues: Issue[]): void {
  for (const mesh of census.meshes) {
    if (mesh.verts === 0) {
      issues.push({
        code: ISSUE_CODES.EMPTY_MESH,
        severity: "error",
        message: `mesh '${mesh.object}' has no vertices`,
        target: mesh.object,
      });
    }
  }
}