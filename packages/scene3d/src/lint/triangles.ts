import { Census, CensusMesh } from "../types.js";

/**
 * How many triangles a mesh has, and whether anybody had to guess.
 *
 * "Total scene triangles" was computed in three places with three different
 * postures. `world.ts` (budgets) and `facts.ts` (the intent judge) both
 * substituted the FACE count for a missing `tris` and said nothing; `claims.ts`
 * refused to adjudicate the whole `maxTriangles` claim instead. Same fact,
 * incompatible answers — and the two silent ones under-count n-gons, so a
 * budget could PASS a scene that actually breaks it, which is the exact
 * "silence is not evidence" failure the rest of this package polices.
 *
 * The substitution itself is right: a budget that runs approximately beats one
 * that does not run. What was wrong is that it happened invisibly, in two
 * copies. So it happens here, once, and the caller is TOLD.
 *
 * The current runner always emits `tris`, and the cache key includes the
 * runner's own hash — so a census without it can only come from a build that
 * predates the field. That makes this a compatibility path rather than a live
 * one, which is precisely why it should not be silently forked across three
 * modules where it can drift again.
 */
export interface TriangleTotals {
  /** Scene total, using the face-count substitution where needed. */
  total: number;
  /** Per-mesh counts, same substitution. */
  byObject: Map<string, number>;
  /** Meshes whose count was substituted — empty when every count was measured. */
  approximated: string[];
}

/** One mesh's triangle count, substituting faces when the census predates
 *  `tris`. Under-counts n-gons; never invents a violation. */
export function trianglesOf(mesh: CensusMesh): number {
  return mesh.tris ?? mesh.faces;
}

/** True when this census carries a real triangle count for every mesh. */
export function trianglesAreExact(census: Census): boolean {
  return census.meshes.every((m) => m.tris !== undefined);
}

export function triangleTotals(census: Census): TriangleTotals {
  const byObject = new Map<string, number>();
  const approximated: string[] = [];
  let total = 0;
  for (const mesh of census.meshes) {
    const tris = trianglesOf(mesh);
    if (mesh.tris === undefined) approximated.push(mesh.object);
    byObject.set(mesh.object, tris);
    total += tris;
  }
  return { total, byObject, approximated };
}
