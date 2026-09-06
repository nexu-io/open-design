import { MIN_CONTACT, obbSeparation, SolvedPart, Vec3 } from "./types.js";
import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";

/**
 * Minkowski clearance: assembly tolerance as morphology.
 *
 * Dilating every part by ε and asking "what now collides" is the classical
 * erosion/dilation question, and on boxes it needs no new geometry at all —
 * h_{A⊕εB} = h_A + ε, so a pair violates the ε-dilated world exactly when
 * its measured separation is below 2ε. A project that declares
 * `conventions.geometry.minClearance` is stating a manufacturing /
 * animation / printing tolerance: parts that are NEITHER in contact NOR at
 * least that far apart are the assembly's pinch points, and today they
 * compile silently — visible only when a printed part fuses or an animated
 * one grazes.
 *
 * Deliberate scope:
 *  - Pairs in solver contact (separation ≤ the contact floor) are DESIGNED
 *    touches — a `sits_on` embed is not a pinch. The rule reports the band
 *    BETWEEN contact and clearance: close enough to worry, not declared as
 *    touching.
 *  - Boxes, not meshes: conservative for round shapes exactly like every
 *    other bound in the language — a reported pinch may have more real
 *    clearance than its boxes do, never less.
 *  - Parse-time and pure: the fast gear sees it before any Blender run.
 */
export function clearanceIssues(
  solved: { parts: ReadonlyArray<SolvedPart> },
  minClearance: number,
): Issue[] {
  const issues: Issue[] = [];
  if (!(minClearance > 0)) return issues;
  const parts = solved.parts;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!;
      const b = parts[j]!;
      const separation = boxSeparation(a, b);
      // ≤ contact floor: a designed touch (or an overlap, which is
      // W-107/E-324's jurisdiction, not a clearance question).
      if (separation <= MIN_CONTACT + 1e-9) continue;
      if (separation >= minClearance - 1e-9) continue;
      issues.push({
        code: ISSUE_CODES.CLEARANCE_THIN,
        severity: "warning",
        message: `'${a.id}' and '${b.id}' sit ${fmt(separation)}m apart — inside the declared ${fmt(minClearance)}m clearance, without being in contact`,
        hint: "widen the gap, or make the touch deliberate (sits_on/align) so it reads as design rather than a pinch; governed by conventions.geometry.minClearance",
        target: `${a.id} <-> ${b.id}`,
        detail: { separation: round6(separation), minClearance },
      });
    }
  }
  return issues;
}

/**
 * Box-to-box separation; ≤ 0 when they overlap, > 0 is a proven gap.
 *
 * When either part is rotated, the WORLD AABB is a strict over-estimate of
 * the box (a canted bar's axis-aligned bound spans its diagonal), so two
 * parts that are cleanly apart can have overlapping AABBs — and the world-
 * axis gap then reads negative, which the caller treats as a designed touch
 * and skips. That silently DROPS a real pinch between two canted parts, and
 * for parts that do read apart it invents pinches the oriented boxes never
 * had. The exact SAT verdict on the true oriented boxes decides instead —
 * the same predicate, on the same `localSize ?? size` + `rotate`, that the
 * solver's intersection report switches to for rotated pairs (contact.ts),
 * so clearance and contact never disagree about one oriented pair. For an
 * unrotated pair obbSeparation reduces to this exact per-axis gap, so the
 * fast path is kept for the common case rather than paying for 15 axes.
 */
function boxSeparation(a: SolvedPart, b: SolvedPart): number {
  if (a.rotate || b.rotate) {
    return obbSeparation(
      { center: a.center, size: a.localSize ?? a.size, rotate: a.rotate },
      { center: b.center, size: b.localSize ?? b.size, rotate: b.rotate },
    );
  }
  let widest = -Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const aHalf = a.size[axis]! / 2;
    const bHalf = b.size[axis]! / 2;
    const gap = Math.abs(a.center[axis]! - b.center[axis]!) - aHalf - bHalf;
    if (gap > widest) widest = gap;
  }
  return widest;
}

const round6 = (v: number): number => Number(v.toFixed(6));
const fmt = (v: number): string => String(Number(v.toFixed(4)));
export type { Vec3 };
