import { Census, Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import type { ClaimsSpec } from "../solve/types.js";

/**
 * Adjudicate a spec's `claims` block against the measured census.
 *
 * The Kiln inversion, adopted whole: the author (a model, usually) is never
 * the authority on whether the build succeeded — it will claim "7 parts
 * within 20k triangles, grounded" having produced something else, and the
 * wrongness must surface immediately and specifically. So every claim is
 * checked against what Blender actually measured, never against the spec
 * that made the claim, and a failed claim is a compile ERROR: the artifact
 * is not what it says it is.
 *
 * The other half of the discipline: a claim the census cannot adjudicate is
 * reported as UNCHECKED, never silently passed. A check that silently did
 * not run is worse than a check that does not exist.
 */
export function lintClaims(
  claims: ClaimsSpec,
  census: Census | undefined,
  issues: Issue[],
  options: {
    /**
     * Forgiven sink below z=0 for the `grounded` claim, in metres. Comes
     * from the contract's grounding convention — contact embeds
     * legitimately dip a part below its support by design, and how much is
     * the project's call, not this module's.
     */
    groundTolerance?: number;
  } = {},
): void {
  const fail = (claim: string, message: string, detail: Record<string, unknown>): void => {
    issues.push({
      code: ISSUE_CODES.CLAIM_FAILED,
      severity: "error",
      message: `claim ${claim} failed: ${message}`,
      hint: "the built scene is not what the spec claims — fix the scene or fix the claim",
      // Per-part claim failures name the part, so provenance attribution
      // points the reader at the line that authored it.
      ...(typeof detail.target === "string" ? { target: detail.target } : {}),
      detail: { claim, ...detail },
    });
  };
  const unchecked = (claim: string, reason: string): void => {
    issues.push({
      code: ISSUE_CODES.CLAIM_UNCHECKED,
      severity: "warning",
      message: `claim ${claim} could not be adjudicated: ${reason} — unchecked is not passed`,
      detail: { claim },
    });
  };

  if (!census) {
    for (const claim of Object.keys(claims)) {
      unchecked(claim, "no census — the build stage did not produce measurements");
    }
    return;
  }

  /* Geometric slack for boundary claims: a claim of "2.4m tall" must not
     fail on a 2.4000000001m measurement. 1e-6 m is far below anything an
     author can express and far above float error at scene scale. */
  const EPS = 1e-6;

  if (claims.parts !== undefined) {
    const actual = census.meshes.length;
    if (actual !== claims.parts) {
      fail("parts", `the built scene has ${actual} mesh parts, not ${claims.parts}`, {
        expected: claims.parts,
        actual,
      });
    }
  }

  if (claims.maxTriangles !== undefined) {
    const measured = census.meshes.map((m) => m.tris);
    if (measured.some((t) => t === undefined)) {
      unchecked("maxTriangles", "this census does not carry triangle counts");
    } else {
      const total = measured.reduce<number>((sum, t) => sum + (t ?? 0), 0);
      if (total > claims.maxTriangles) {
        fail("maxTriangles", `the built scene has ${total} triangles, over the claimed ${claims.maxTriangles}`, {
          expected: claims.maxTriangles,
          actual: total,
        });
      }
    }
  }

  if (claims.grounded === true) {
    const TOLERANCE = options.groundTolerance ?? 0.005;
    for (const mesh of census.meshes) {
      if (!mesh.spatial) {
        unchecked("grounded", `'${mesh.object}' has no spatial measurements`);
        continue;
      }
      if (mesh.spatial.groundGap < -TOLERANCE) {
        fail("grounded", `'${mesh.object}' sinks ${(-mesh.spatial.groundGap).toFixed(4)}m below the ground plane`, {
          target: mesh.object,
          groundGap: mesh.spatial.groundGap,
        });
      }
    }
  }

  if (claims.maxHeight !== undefined || claims.footprint !== undefined) {
    const spatials = census.meshes.map((m) => m.spatial).filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (spatials.length === 0) {
      if (claims.maxHeight !== undefined) unchecked("maxHeight", "no spatial measurements in the census");
      if (claims.footprint !== undefined) unchecked("footprint", "no spatial measurements in the census");
    } else {
      const max = [-Infinity, -Infinity, -Infinity];
      const min = [Infinity, Infinity, Infinity];
      for (const s of spatials) {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, s.worldMin[i]!);
          max[i] = Math.max(max[i]!, s.worldMax[i]!);
        }
      }
      if (claims.maxHeight !== undefined && max[2]! > claims.maxHeight + EPS) {
        fail("maxHeight", `the built scene reaches ${max[2]!.toFixed(4)}m, over the claimed ${claims.maxHeight}m`, {
          expected: claims.maxHeight,
          actual: max[2],
        });
      }
      if (claims.footprint !== undefined) {
        const extent: [number, number] = [max[0]! - min[0]!, max[1]! - min[1]!];
        for (const [i, axisName] of (["x", "y"] as const).entries()) {
          if (extent[i]! > claims.footprint[i]! + EPS) {
            fail(
              "footprint",
              `the built scene spans ${extent[i]!.toFixed(4)}m on ${axisName}, over the claimed ${claims.footprint[i]}m`,
              { axis: axisName, expected: claims.footprint[i], actual: extent[i] },
            );
          }
        }
      }
    }
  }

  if (claims.watertight === true) {
    for (const mesh of census.meshes) {
      if (mesh.nonManifoldEdges > 0) {
        fail("watertight", `'${mesh.object}' has ${mesh.nonManifoldEdges} non-manifold edges — it is not a closed solid`, {
          target: mesh.object,
          nonManifoldEdges: mesh.nonManifoldEdges,
        });
      }
    }
  }

  if (claims.materialsUsed !== undefined) {
    const bound = new Set(census.meshes.flatMap((m) => m.materials ?? []));
    for (const name of claims.materialsUsed) {
      if (!bound.has(name)) {
        fail("materialsUsed", `material '${name}' is not bound to any part in the built scene`, {
          target: name,
        });
      }
    }
  }
}
