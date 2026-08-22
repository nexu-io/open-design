import type { Census } from "../types.js";
import { MIN_CONTACT } from "./types.js";

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

/**
 * How far a partner may be embedded into a part and still count as beneath it.
 *
 * The solver's own floor plus a float-noise margin: anything the solver builds
 * on purpose has to read as contact, or the linter contradicts the solver.
 */
export const EMBED_WINDOW = MIN_CONTACT + 1e-6;

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
 */
export function nearestSupportBelow(
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
    // A support sits below: its top is at, just under, or deliberately
    // embedded into this part's bottom.
    const gap = self.worldMin[2]! - other.worldMax[2]!;
    if (gap < -EMBED_WINDOW) continue;
    if (best === null || gap < best.gap) best = { name: otherName, gap };
  }
  return best;
}

/**
 * Does this part rest on something — the ground, or another part?
 *
 * `null` when the census cannot say (no spatial measurement), so the caller
 * can report "unchecked" rather than inventing a pass.
 */
export function restsOnSomething(
  census: Census,
  name: string,
  groundGap: number | undefined,
  tolerance: number,
): boolean | null {
  if (groundGap === undefined || !Number.isFinite(groundGap)) return null;
  if (groundVerdict(groundGap, tolerance) !== "floating") return true;
  return nearestSupportBelow(census, name) !== null;
}
