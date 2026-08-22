import { Census, Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { NormalizedContract } from "../contract.js";
import { isExempt } from "./exempt.js";
import { triangleTotals } from "./triangles.js";
import { groundVerdict, nearestSupportBelow } from "../solve/contact.js";

/**
 * World placement and budget rules.
 *
 * Two things a screenshot cannot settle and a structural rule set misses:
 *
 * **Grounding.** A prop that floats two centimetres above the ground reads
 * as correct from every turntable angle and is broken the moment it is
 * placed in a scene. So does one that sinks. The rule is cheap — compare
 * the lowest world point against the ground plane — and it only works if
 * exemptions are *declared* rather than inferred: a bedded rock, a
 * wall-mounted bracket, and a skybox all legitimately break it. Making the
 * author name them means the exemption list doubles as documentation of
 * what the asset intends, instead of the rule quietly not applying.
 *
 * **Budgets.** "Web GLB under 20k triangles" is a real delivery constraint
 * that nobody notices until an engine rejects the import. The census counts
 * triangles exactly, so this is a measurement rather than an estimate.
 */
export function lintWorld(
  contract: NormalizedContract,
  census: Census | undefined,
  issues: Issue[],
): void {
  if (!census) return;

  /* ---- grounding --------------------------------------------------- */

  const grounding = contract.grounding;
  if (grounding.enabled) {
    // Blender is Z-up internally regardless of the export axis, and the
    // census is authored in Blender space, so "down" is Z here.
    const upIndex = 2;
    // Vertex-exact lowest point per object. The object AABB (worldMin) is the
    // AABB of the OBB for a ROTATED part, so its min-z sits below the real
    // geometry — measuring against it here would disagree with the vertex-based
    // claims.grounded on the very same part (two grounding truths). spatial
    // (from real vertices) is the shared source of truth.
    const groundGapByObject = new Map(
      census.meshes.filter((m) => m.spatial).map((m) => [m.object, m.spatial!.groundGap]),
    );
    for (const object of census.objects) {
      if (object.type !== "MESH") continue;
      if (isExempt(object.name, grounding.exempt)) continue;
      const measured = groundGapByObject.get(object.name);
      const lowest = measured ?? (object.worldMin ? object.worldMin[upIndex] : undefined);
      if (lowest === null || lowest === undefined || !Number.isFinite(lowest)) continue;

      // One predicate, shared with claims.grounded — see solve/contact.ts.
      const verdict = groundVerdict(lowest, grounding.tolerance);
      if (verdict === "sunk") {
        issues.push({
          code: ISSUE_CODES.SUNK_BELOW_GROUND,
          severity: "error",
          message: `'${object.name}' sinks ${fmt(-lowest)}m below the ground plane`,
          hint: `raise it, or add it to conventions.grounding.exempt if it is meant to be bedded`,
          target: object.name,
          detail: { lowest },
        });
      } else if (verdict === "floating") {
        // "Above the ground plane" is the least useful reference frame —
        // the actionable fact is what the part should be RESTING on. The
        // contact scan already measured every nearby pair; name the
        // nearest support below and the gap to it.
        const support = nearestSupportBelow(census, object.name);
        // A support in CONTACT is being rested on, not floated above — the
        // solver embeds a `sits_on` part by MIN_CONTACT on purpose, and
        // "floats -0.001m above" describes that as a defect it is not.
        const resting = support !== null && support.gap <= grounding.tolerance;
        issues.push({
          code: ISSUE_CODES.NOT_GROUNDED,
          severity: "warning",
          message: resting
            ? `'${object.name}' rests on '${support!.name}', whose lowest point is ${fmt(lowest)}m above the ground plane`
            : support
              ? `'${object.name}' floats ${fmt(support.gap)}m above '${support.name}' (lowest point ${fmt(lowest)}m above the ground plane)`
              : `'${object.name}' floats ${fmt(lowest)}m above the ground plane`,
          hint: resting
            ? `nothing to fix if the stack is intended — exempt '${object.name}' to stop reporting it`
            : support
              ? `drop it onto '${support.name}', or exempt it if it is mounted or airborne`
              : "drop it onto the ground, or exempt it if it is mounted or airborne",
          target: object.name,
          detail: { lowest, ...(support ? { nearestSupport: support.name, gap: support.gap } : {}) },
        });
      }
    }
  }

  /* ---- budgets ------------------------------------------------------ */

  const { maxTrianglesPerMesh, maxTrianglesTotal } = contract.budgets;
  // One computation of "how many triangles", shared with the intent judge and
  // the claims adjudicator — see lint/triangles.ts for why they used to differ.
  const triangles = triangleTotals(census);
  const total = triangles.total;
  // A budget measured from face counts UNDER-counts n-gons, so it can pass a
  // scene that actually breaks it. That is worth running anyway, and worth
  // saying out loud rather than leaving as a silent approximation.
  if (triangles.approximated.length > 0 && (maxTrianglesPerMesh !== undefined || maxTrianglesTotal !== undefined)) {
    issues.push({
      code: ISSUE_CODES.TRIANGLE_COUNT_APPROXIMATE,
      severity: "warning",
      message: `triangle budgets were measured from face counts for ${triangles.approximated.length} mesh(es) — this census carries no triangle counts, so an n-gon mesh reads smaller than it is`,
      hint: "recompile without --no-cache to remeasure, or ignore if the scene has no n-gons",
      detail: { meshes: triangles.approximated.slice(0, 12) },
    });
  }
  for (const mesh of census.meshes) {
    const tris = triangles.byObject.get(mesh.object) ?? 0;
    if (maxTrianglesPerMesh !== undefined && tris > maxTrianglesPerMesh) {
      issues.push({
        code: ISSUE_CODES.MESH_BUDGET,
        severity: "error",
        message: `mesh '${mesh.object}' is ${tris.toLocaleString()} triangles, over the ${maxTrianglesPerMesh.toLocaleString()} per-mesh budget`,
        hint: "split the mesh or decimate it",
        target: mesh.object,
        detail: { tris, budget: maxTrianglesPerMesh },
      });
    }
  }
  if (maxTrianglesTotal !== undefined && total > maxTrianglesTotal) {
    issues.push({
      code: ISSUE_CODES.SCENE_BUDGET,
      severity: "warning",
      message: `scene is ${total.toLocaleString()} triangles, over the ${maxTrianglesTotal.toLocaleString()} budget`,
      hint: "decimate the heaviest parts or drop detail that never faces camera",
      detail: { tris: total, budget: maxTrianglesTotal },
    });
  }
}

function fmt(value: number): string {
  return String(Number(value.toFixed(4)));
}
