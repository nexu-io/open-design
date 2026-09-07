import type { Axis, Vec3 } from "./types.js";

/**
 * Whether a shape's box can actually be built as that shape.
 *
 * The one predicate for "is this size buildable", because the question has two
 * askers and they must not answer it differently. The validator asks it about
 * what the AUTHOR wrote, so a mistake is reported at the author's JSON path
 * before anything runs. The solver asks it again about what it SOLVED, because
 * a relation can rewrite a size after validation has finished — `span` sets an
 * axis from the gap between two anchors, and nothing re-checked the result.
 *
 * That gap was reachable: a torus builds its ring from `across / 2 - tube`, so
 * a span that pulls the ring narrower than its own tube hands Blender a
 * negative radius. Checking the solver's OUTPUT rather than any particular
 * relation closes it for every relation, including ones not written yet.
 *
 * Returns a sentence per violation, or an empty array. It states facts and
 * leaves severity and code to the caller: the same violation is a parse error
 * when authored and a solve error when derived.
 */

/** How far two extents may differ and still be the same measurement. */
const CIRCULAR_TOLERANCE = 1e-9;

const AXES: readonly Axis[] = ["x", "y", "z"];

/** The two box extents across a part's axis. */
function crossExtents(size: Vec3, axis: Axis): [number, number] {
  const across = AXES.filter((a) => a !== axis).map((a) => size[AXES.indexOf(a)]!);
  return [across[0]!, across[1]!];
}

export function shapeViolations(
  shape: string,
  size: Vec3 | undefined,
  axis: Axis,
  thickness?: number,
): string[] {
  if (!size) return [];
  const out: string[] = [];
  const along = size[AXES.indexOf(axis)]!;
  const [a, b] = crossExtents(size, axis);
  const across = Math.min(a, b);

  if (shape === "torus") {
    // The ring radius is (across / 2) − tube, and the tube radius is half the
    // extent ALONG the axis. A ring narrower than its own tube is not a thin
    // torus, it is a negative radius.
    const tube = along / 2;
    const ring = across / 2 - tube;
    if (ring <= 0) {
      out.push(
        `a torus ${across} across cannot have a ${along} tube — its ring radius would be ` +
          `${Number(ring.toFixed(6))}; the extent across the axis must exceed the extent along it`,
      );
    }
  }

  if (shape === "tube" && thickness !== undefined) {
    // A wall measured inward from the outer surface cannot reach past the
    // centre, or the bore is inside-out.
    if (thickness * 2 >= across - CIRCULAR_TOLERANCE) {
      out.push(
        `a tube ${across} across cannot have a ${thickness} wall — two walls consume ` +
          `${thickness * 2}, leaving no bore; the wall must be under half the outer width`,
      );
    }
  }

  if (shape === "capsule") {
    if (along < across - CIRCULAR_TOLERANCE) {
      out.push(
        `capsule length ${along} along ${axis} is shorter than its ${across} diameter — a ` +
          `capsule is a cylinder capped by two hemispheres, so it can never be shorter than it ` +
          `is wide; use shape "sphere" for a rounded blob`,
      );
    }
  }

  return out;
}
