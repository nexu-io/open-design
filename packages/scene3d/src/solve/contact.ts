import type { Census } from "../types.js";


/**
 * The contact model: one definition of what "touching" and "resting" mean.
 *
 * The solver, the world linter and the claims adjudicator all reason about the
 * same physical relation, and each had its own arithmetic for it. That is how
 * they came to disagree:
 *
 *  - The solver deliberately EMBEDS a `sits_on` part by `MIN_CONTACT` so two
 *    faces can never land on the same plane and z-fight. The world linter's
 *    support search then rejected any contact with a negative gap as "not
 *    below me" — which is exactly what a deliberate embed looks like — so the
 *    rule designed to name the thing a part should be resting on could never
 *    name it for the one relation that puts a part on something.
 *  - `claims.grounded` and the linter's NOT_GROUNDED both spoke about being
 *    grounded and meant different things, so a part hovering metres in the air
 *    could collect the warning from one and PASS the claim from the other —
 *    and the compile then awarded its "claims declared, none failed" badge to
 *    a floating asset.
 *
 * The fix is not a wider epsilon in one place. It is that resting is a
 * RELATION, not a coordinate: a part rests when the ground or another part is
 * directly beneath it, in contact. A stacked roof rests on its columns without
 * touching the floor; a box hovering in mid-air rests on nothing, whatever its
 * height. Both authorities ask that question here.
 */

export type GroundVerdict = "grounded" | "sunk" | "floating";

/** Where a part sits relative to the ground plane, within tolerance. */
export function groundVerdict(groundGap: number, tolerance: number): GroundVerdict {
  if (groundGap < -tolerance) return "sunk";
  if (groundGap > tolerance) return "floating";
  return "grounded";
}

/**
 * The nearest measured contact whose partner sits below `name` — the part a
 * floating object is most plausibly resting on, or meant to. Pure lookup over
 * the census's already-measured contact pairs; no new Blender work.
 *
 * "Below" is geometric, not an epsilon. The first attempt at this allowed a
 * partner to be embedded by at most the solver's own 1mm contact floor, which
 * is right for what the SOLVER builds and wrong for what MODELLERS build: a
 * hand-authored blocky asset overlaps its junctions by a whole pixel (1/16 m)
 * precisely so the faces can never coincide, and every one of those joints
 * read as "not below me". So the test is that the partner STARTS lower and
 * overlaps this part's footprint — which covers flush, embedded and deeply
 * interpenetrating alike, and still excludes a part sitting on top or standing
 * beside it.
 */
export function nearestSupportBelow(
  census: Census,
  name: string,
): { name: string; gap: number } | null {
  const objectByName = new Map(census.objects.map((o) => [o.name, o]));
  const self = objectByName.get(name);
  if (!self?.worldMin || !self.worldMax) return null;
  let best: { name: string; gap: number } | null = null;
  for (const contact of census.contacts ?? []) {
    const otherName = contact.a === name ? contact.b : contact.b === name ? contact.a : null;
    if (otherName === null) continue;
    const other = objectByName.get(otherName);
    if (!other?.worldMax || !other.worldMin || other.type !== "MESH") continue;
    // It must START lower, or it is sitting ON this part rather than under it.
    if (other.worldMin[2]! >= self.worldMin[2]! - 1e-9) continue;
    // ...and be UNDER it, not merely lower and off to one side.
    if (!overlapsInPlan(self, other)) continue;
    const gap = self.worldMin[2]! - other.worldMax[2]!;
    if (best === null || Math.abs(gap) < Math.abs(best.gap)) best = { name: otherName, gap };
  }
  return best;
}

/** Do two AABBs share any ground footprint (x and y)? */
function overlapsInPlan(
  a: { worldMin?: number[] | null; worldMax?: number[] | null },
  b: { worldMin?: number[] | null; worldMax?: number[] | null },
): boolean {
  for (let i = 0; i < 2; i++) {
    if (a.worldMin![i]! > b.worldMax![i]! || b.worldMin![i]! > a.worldMax![i]!) return false;
  }
  return true;
}
