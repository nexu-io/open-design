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

/**
 * The set of mesh parts transitively supported by the ground: every part
 * whose bottom sits at (or below) the ground plane within tolerance, plus
 * everything reachable from those through measured contacts.
 *
 * This predicate answers ONE of the grounded claim's two questions — "does
 * a load path reach the ground" — and deliberately not the other. A SUNK
 * part seeds the closure on purpose: a chain standing on a sunk plinth
 * really does reach the ground, so calling the chain unsupported would be a
 * second, wrong finding about the plinth's one defect. The sinking itself
 * is adjudicated by the claim's other direction (the per-part groundGap
 * check in lint/claims.ts), which fails the claim for the sunk part no
 * matter what this closure contains — membership here can never launder a
 * sunk part past the ledger or the proven badge.
 *
 * Contact, not stacking: a side-mounted pommel on a grounded grip is
 * supported (it is rigidly attached to something that reaches the ground),
 * so the edge relation is the census's own measured contact within
 * tolerance — the same pairs the connectivity line counts — rather than a
 * strictly-below test that would fail every lateral attachment.
 *
 * `verified` is false when the census could not measure contacts (the scan
 * was skipped, or never ran): an unverifiable support chain must surface as
 * UNCHECKED, never as a failure — a part is not "floating" because the
 * oracle that would have seen its support was over budget.
 *
 * `assumedRoots` are parts the CALLER vouches for — declared floats
 * (`above` relations), grounding exemptions — that seed the flood fill
 * beside the measured ground contacts, so a lamp hanging from a
 * declared-floating chandelier inherits its licence. A parameter rather
 * than a second flood fill at the call site: what counts as a support
 * edge is this module's one predicate ("one predicate per physical
 * relation"), and the adjudicator re-implementing the propagation is
 * exactly how the two authorities last drifted.
 */
export function groundedSupport(
  census: Census,
  tolerance: number,
  assumedRoots: Iterable<string> = [],
): { supported: Set<string>; verified: boolean } {
  const supported = new Set<string>();
  const verified =
    census.contacts !== undefined && (census.contactsSkipped?.length ?? 0) === 0;
  const adjacency = new Map<string, string[]>();
  for (const contact of census.contacts ?? []) {
    if (contact.separation > tolerance) continue; // near, but not touching
    (adjacency.get(contact.a) ?? adjacency.set(contact.a, []).get(contact.a)!).push(contact.b);
    (adjacency.get(contact.b) ?? adjacency.set(contact.b, []).get(contact.b)!).push(contact.a);
  }
  const queue: string[] = [];
  for (const root of assumedRoots) {
    if (!supported.has(root)) {
      supported.add(root);
      queue.push(root);
    }
  }
  for (const mesh of census.meshes) {
    const gap = mesh.spatial?.groundGap;
    if (gap === undefined) continue;
    if (groundVerdict(gap, tolerance) !== "floating") {
      supported.add(mesh.object);
      queue.push(mesh.object);
    }
  }
  while (queue.length > 0) {
    const name = queue.pop()!;
    for (const next of adjacency.get(name) ?? []) {
      if (!supported.has(next)) {
        supported.add(next);
        queue.push(next);
      }
    }
  }
  return { supported, verified };
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
