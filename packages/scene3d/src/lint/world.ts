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
  solved?: { parts: ReadonlyArray<{ id: string; restsOn?: string }> },
): void {
  if (!census) return;

  /* ---- rested pairs must actually touch ----------------------------- */
  // The solver floors every sits_on at exactly the contact offset, so a
  // restsOn pair whose MEASURED boxes never come within tolerance is a
  // certainty, not a heuristic: something between plan and build — a fitted
  // import that does not fill its box, a script part, a viewer tweak, a
  // curved rim — moved reality off the solve. A field build shipped cage
  // bars standing beside the ring they were meant to carry, through a
  // zero-error compile; the census had measured the missing contact and no
  // rule read it. Gated on an UNSKIPPED contact scan: with the scan capped,
  // an empty list means "not measured", never "nothing touches" (W-336
  // already says so).
  if (solved && (census.contactsSkipped ?? []).length === 0 && census.contacts) {
    const meshNames = new Set(census.meshes.map((m) => m.object));
    const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
    const separationOf = new Map(census.contacts.map((c) => [pairKey(c.a, c.b), c.separation]));
    // Slack above the solver's own 1mm floor, governed by the same grounding
    // tolerance the rest of the placement rules judge with.
    const touch = 0.001 + contract.grounding.tolerance;
    for (const part of solved.parts) {
      if (!part.restsOn) continue;
      if (!meshNames.has(part.id) || !meshNames.has(part.restsOn)) continue;
      const separation = separationOf.get(pairKey(part.id, part.restsOn));
      if (separation !== undefined && separation <= touch) continue;
      // Name what the built geometry ACTUALLY rests on before guessing at
      // causes: the census has already measured it, and "it sits on
      // 'prp_slat_3' instead" turns three hypothetical causes into one
      // observed fact (the commonest being a repeat clone whose support
      // edge came from its base part's relation). The generic causes are
      // the fallback for when nothing measurable is underneath.
      const actual = nearestSupportBelow(census, part.id);
      const actualIsOther = actual !== null && actual.name !== part.restsOn;
      issues.push({
        code: ISSUE_CODES.REST_NOT_TOUCHING,
        severity: "warning",
        message:
          separation === undefined
            ? `the solver rested '${part.id}' on '${part.restsOn}', but the built geometry never comes near it — no contact was measured between them`
            : `the solver rested '${part.id}' on '${part.restsOn}', but the built geometry sits ${fmt(separation)}m apart`,
        hint: actualIsOther
          ? `the built geometry rests on '${actual.name}' instead (${fmt(Math.abs(actual.gap))}m ${actual.gap >= 0 ? "clear" : "deep"}) — the solver's support edge came from the relation as authored; for a repeat clone that is the base part's relation, which is expected for stacked repeats`
          : "the plan and the build disagree — check a viewer tweak that moved one of them, a file/script part that does not fill its declared box, or a support whose curved surface falls short of its box",
        target: `${part.id} <-> ${part.restsOn}`,
        detail: {
          restsOn: part.restsOn,
          ...(separation !== undefined ? { separation } : {}),
          ...(actualIsOther ? { actualSupport: actual.name, actualGap: actual.gap } : {}),
        },
      });
    }
  }

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
      // Vertex-exact or NOT JUDGED. The old fallback to object.worldMin is
      // the very measure the comment above rules out: for a rotated part
      // the AABB-of-the-OBB dips below the real geometry, so the fallback
      // called correctly-grounded canted parts sunk. Unmeasured degrades
      // to a named note, never to a verdict from the wrong instrument.
      if (measured === undefined) {
        if (object.worldMin) {
          issues.push({
            code: ISSUE_CODES.GROUNDING_UNCHECKED,
            severity: "info",
            message: `grounding for '${object.name}' was not judged — no vertex-exact spatial measurement in this census (its box bound alone cannot say sunk or floating for a rotated part)`,
            target: object.name,
            detail: { unmeasured: true },
          });
        }
        continue;
      }
      const lowest = measured;
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
        // "floats -0.001m above" describes that as a defect it is not. But
        // contact has a lower bound too: a gap far below -tolerance is deep
        // INTERPENETRATION, and wearing the "rests on / nothing to fix"
        // message for it would direct the author to exempt visibly broken
        // geometry — so the three states get three messages.
        const resting = support !== null && Math.abs(support.gap) <= grounding.tolerance;
        const penetrating = support !== null && support.gap < -grounding.tolerance;
        issues.push({
          code: ISSUE_CODES.NOT_GROUNDED,
          severity: "warning",
          message: resting
            ? `'${object.name}' rests on '${support!.name}', whose lowest point is ${fmt(lowest)}m above the ground plane`
            : penetrating
              ? `'${object.name}' sinks ${fmt(-support!.gap)}m INTO '${support!.name}' (lowest point ${fmt(lowest)}m above the ground plane)`
              : support
                ? `'${object.name}' floats ${fmt(support.gap)}m above '${support.name}' (lowest point ${fmt(lowest)}m above the ground plane)`
                : `'${object.name}' floats ${fmt(lowest)}m above the ground plane`,
          hint: resting
            ? `nothing to fix if the stack is intended — add '${object.name}' to conventions.grounding.exempt to stop reporting it`
            : penetrating
              ? `raise it out of '${support!.name}', or add '${object.name}' to conventions.grounding.exempt if the embed is meant`
              : support
                ? `drop it onto '${support.name}', or add '${object.name}' to conventions.grounding.exempt if it is mounted or airborne`
                : `drop it onto the ground, or add '${object.name}' to conventions.grounding.exempt if it is mounted or airborne`,
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
