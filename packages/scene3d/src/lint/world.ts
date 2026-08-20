import { Census, Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { NormalizedContract } from "../contract.js";

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
    for (const object of census.objects) {
      if (object.type !== "MESH") continue;
      if (isExempt(object.name, grounding.exempt)) continue;
      const min = object.worldMin;
      if (!min) continue;
      const lowest = min[upIndex];
      if (lowest === null || lowest === undefined || !Number.isFinite(lowest)) continue;

      if (lowest < -grounding.tolerance) {
        issues.push({
          code: ISSUE_CODES.SUNK_BELOW_GROUND,
          severity: "error",
          message: `'${object.name}' sinks ${fmt(-lowest)}m below the ground plane`,
          hint: `raise it, or add it to conventions.grounding.exempt if it is meant to be bedded`,
          target: object.name,
          detail: { lowest },
        });
      } else if (lowest > grounding.tolerance) {
        // "Above the ground plane" is the least useful reference frame —
        // the actionable fact is what the part should be RESTING on. The
        // contact scan already measured every nearby pair; name the
        // nearest support below and the gap to it.
        const support = nearestSupportBelow(census, object.name);
        issues.push({
          code: ISSUE_CODES.NOT_GROUNDED,
          severity: "warning",
          message: support
            ? `'${object.name}' floats ${fmt(support.gap)}m above '${support.name}' (lowest point ${fmt(lowest)}m above the ground plane)`
            : `'${object.name}' floats ${fmt(lowest)}m above the ground plane`,
          hint: support
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
  let total = 0;
  for (const mesh of census.meshes) {
    // Older runners did not report `tris`; fall back to the face count,
    // which under-counts n-gons but never invents a violation.
    const tris = mesh.tris ?? mesh.faces;
    total += tris;
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

/** Exemptions match an exact name or a prefix, so `mount_` covers a family. */
function isExempt(name: string, exempt: readonly string[]): boolean {
  return exempt.some((entry) => name === entry || name.startsWith(entry));
}

/**
 * The nearest measured contact whose partner sits below `name` — the part
 * a floating object is most plausibly meant to rest on. Pure lookup over
 * the census's already-measured contact pairs; no new Blender work.
 */
function nearestSupportBelow(
  census: Census,
  name: string,
): { name: string; gap: number } | null {
  const objectByName = new Map(census.objects.map((o) => [o.name, o]));
  const self = objectByName.get(name);
  if (!self?.worldMin) return null;
  let best: { name: string; gap: number } | null = null;
  for (const contact of census.contacts ?? []) {
    const otherName = contact.a === name ? contact.b : contact.b === name ? contact.a : null;
    if (otherName === null) continue;
    const other = objectByName.get(otherName);
    if (!other?.worldMax || other.type !== "MESH") continue;
    // A support sits below: its top is at or under this part's bottom.
    const gap = self.worldMin![2] - other.worldMax[2];
    if (gap < -1e-6) continue;
    if (best === null || gap < best.gap) best = { name: otherName, gap };
  }
  return best;
}

function fmt(value: number): string {
  return String(Number(value.toFixed(4)));
}
