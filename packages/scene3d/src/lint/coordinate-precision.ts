import { Census, Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";

/**
 * Is this part far enough from the origin that its own size cannot survive?
 *
 * Vertex coordinates are float32 in Blender, in every exchange format, and
 * in every engine. A float32 near magnitude `d` resolves steps of about
 * `d · 2⁻²³`, so a part's dimensions have to be large enough to survive that
 * quantisation AT THE DISTANCE THE PART SITS. A 1 m cube at the origin is
 * exact; the same cube at x = 10,000,000 m has a resolution of ~1.2 m and
 * ships as a plane — every corner rounds to the same coordinate.
 *
 * The compiler already measured the wreckage and could not explain it: the
 * census reports the collapsed size, and the world rules report zero-area
 * faces and merge-distance vertex pairs. Those are the SYMPTOM. An author
 * reading "4 zero-area faces" has no way to reach "your scene is too far
 * from the origin", which is the one edit that fixes it — and which no
 * amount of re-exporting can work around, because the loss happens in the
 * build, before any container is written.
 *
 * A single verdict, keyed on a measurement: the part's own smallest
 * dimension against the float32 resolution at its own centre distance. It
 * fires for the far part, not for the whole scene, so a large but
 * origin-centred world stays quiet.
 */

/**
 * How many float32 quanta a dimension must span to be considered intact.
 *
 * A dimension of exactly one quantum is a coin flip between two adjacent
 * representable values; 8 is where relative error falls under ~12 %, which
 * is the point at which a box still reads as a box rather than a wedge. Not
 * a policy knob: it is the resolution of the number format every consumer of
 * this asset uses, so an author cannot raise it by declaring anything.
 */
const MIN_QUANTA = 8;

/** Float32 has a 24-bit significand, so the step near |v| is |v|·2⁻²³. */
const FLOAT32_EPS = Math.pow(2, -23);

export function float32Resolution(distance: number): number {
  return Math.max(Math.abs(distance) * FLOAT32_EPS, Number.MIN_VALUE);
}

export function lintCoordinatePrecision(census: Census | undefined, issues: Issue[]): void {
  if (!census) return;

  for (const mesh of census.meshes) {
    const min = mesh.spatial?.worldMin;
    const max = mesh.spatial?.worldMax;
    if (!min || !max) continue;
    // The part's own farthest coordinate is what sets its resolution — a
    // part straddling the origin is resolved by its far end.
    const reach = Math.max(
      ...[0, 1, 2].map((a) => Math.max(Math.abs(min[a]!), Math.abs(max[a]!))),
    );
    if (!Number.isFinite(reach) || reach <= 0) continue;
    const step = float32Resolution(reach);
    const dims = [0, 1, 2].map((a) => max[a]! - min[a]!);
    // A legitimately flat part (a decal, a ground plane) has a zero
    // dimension by design; only a dimension that EXISTS can be lost.
    const thin = dims.filter((d) => d > 0 && d < step * MIN_QUANTA);
    if (thin.length === 0) continue;

    const worst = Math.min(...thin);
    issues.push({
      code: ISSUE_CODES.COORDINATE_PRECISION_LOST,
      severity: "warning",
      message:
        `'${mesh.object}' sits ${fmt(reach)}m from the origin, where float32 resolves steps of ` +
        `${fmt(step)}m — its ${fmt(worst)}m dimension is only ${Number((worst / step).toFixed(1))} ` +
        `representable steps wide and cannot survive as authored geometry`,
      hint:
        "move the scene near the origin — the OFFSET costs the precision, not the size, so a part " +
        "this small simply cannot be represented out there. Vertex coordinates are float32 in " +
        "Blender, in every exchange format and in every engine, so no export setting recovers it",
      target: mesh.object,
      detail: {
        distanceM: round(reach),
        float32StepM: round(step),
        smallestDimensionM: round(worst),
        quantaWide: Number((worst / step).toFixed(2)),
        minQuanta: MIN_QUANTA,
      },
    });
  }
}

const round = (v: number): number => Number(v.toPrecision(6));
const fmt = (v: number): string => String(Number(v.toPrecision(4)));
