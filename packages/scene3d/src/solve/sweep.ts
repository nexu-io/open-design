import { AXES, Axis, MIN_CONTACT, SolvedPart, Vec3 } from "./types.js";
import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";

/**
 * The kinematic linter: motion adjudicated as GEOMETRY, never simulated.
 *
 * Every motion the compiler owns is closed-form — `spin` is a full turn
 * about one world axis through the part's centre, `bob` a vertical sine —
 * so the volume a moving part sweeps over its whole cycle has a computable
 * bound, and "does the cycle collide" becomes a static inequality over
 * boxes. No timesteps, no integration, no drift: the same flattening of
 * time into geometry the bob-grounding adjudication already performs, made
 * a discipline. W-107 and the claims used to judge the REST POSE only; a
 * blade that cleared its post at frame 1 and split it at 90° compiled
 * clean.
 *
 * Three closed forms and one symmetry theorem:
 *
 *  - A shape rotationally symmetric about its spin axis sweeps to ITSELF —
 *    a spinning orb, a turning column, a rotating ring cost no envelope at
 *    all. The condition is exact: a revolution shape whose own axis is the
 *    spin axis, equal cross extents, and no static rotation off that axis.
 *  - Everything else sweeps the corner circle of its world box: the cross
 *    extents both become the box diagonal. EXACT for a box (its corners
 *    really trace that circle), conservative for rounder contents — the
 *    same safe direction every bound in this language errs in.
 *  - `bob` is a pure translation, so its sweep is exact for the box: a
 *    resting part is trough-anchored by the emitter (it only rises, by
 *    2·amplitude); a floating part is centred (±amplitude).
 *  - `screw` is the two composed, and composes here too: the turn about its
 *    axis obeys the same growth rule and the same symmetry theorem (a
 *    symmetric part screwing about its own axis reserves ONLY its travel),
 *    and the advance adds the interval [0, rise] along that axis — signed,
 *    anchored at the solved pose, which the emitter authors as the START of
 *    the cycle. Nothing is lost by adding the two separately: a turn about
 *    an axis never changes the extent ALONG it, and the advance never
 *    changes the extents across it, so the two are exactly separable.
 *
 * Because the spin bound is conservative, its findings are WARNINGS with
 * the measured envelope attached — "the envelope crosses" is may-collide,
 * not does-collide. The exact cases (a bob crest or screw climb vs a
 * claimed bound) are adjudicated as hard claim failures in lint/claims.ts
 * — the ONE claims adjudicator; this module only measures envelopes.
 */

/** The turn a part makes over its cycle — `spin` or the rotation half of a
 *  `screw`, which the validator guarantees are never both authored. */
export function turnAxis(part: SolvedPart): Axis | undefined {
  if (part.spin) return part.spin.axis ?? "z";
  if (part.screw) return part.screw.axis ?? "z";
  return undefined;
}

/** True when the part moves at all — the one predicate for "has a cycle". */
export const isMover = (part: SolvedPart): boolean =>
  Boolean(part.spin || part.bob || part.screw);

/** The swept world box of one part over its full motion cycle, or
 *  undefined when the part does not move. */
export function sweptBox(part: SolvedPart):
  | {
      min: Vec3;
      max: Vec3;
      spinGrew: boolean;
      bobRise: number;
      bobDip: number;
      /** Signed travel along the screw axis over one turn; 0 when no screw. */
      screwRise: number;
      /**
       * The exact swept solid's cross-section, when the cycle's occupancy in
       * the plane across the spin axis is EXACTLY a disc: a spin turns the
       * part about a world axis through its own centre, so over a full turn
       * it occupies the circle of its corner radius — never the corner
       * SQUARE the AABB above bounds it with. Present only when nothing else
       * perturbs that plane (a bob moves along z, so it only coexists with a
       * z spin; a screw's advance rides its own turn axis). The pairwise
       * adjudicator narrows its verdict through this: a neighbour outside
       * the circle but inside the square is CLEAR, and reporting it as a
       * penetration once cost a field agent 11 phantom warnings on one ring.
       */
      spinDisc?: { axis: Axis; centre: Vec3; radius: number };
      /**
       * True when this envelope is the part's TRUE cycle envelope, not a
       * conservative over-reserve — the flag the claims adjudicator's
       * interval calculus runs on (an exact envelope over a claim is a
       * proven failure; a conservative one is only an advisory).
       *
       * The exactness theorem, per motion:
       *  - bob and the screw advance are pure translations of the box —
       *    exact by construction.
       *  - a spin-symmetric part sweeps to ITSELF — exact.
       *  - a spinning BOX sweeps, over one full turn, a solid of revolution
       *    whose cross radius is exactly the corner radius: the union over
       *    θ of R_θ(S) projects to a disc of radius max‖p⊥‖ over p ∈ S, and
       *    for a box that maximum is attained at a corner which some θ
       *    carries onto each cross axis. So the cross extent is EXACTLY the
       *    local cross diagonal — the language's own "every shape fills its
       *    AABB" rule makes the rest box exact, and the diagonal is closed
       *    form. Holds under a static rotate about the SAME axis (it only
       *    phases the turn).
       *  - everything else (wedge, file, script, an off-axis static rotate)
       *    keeps the conservative world-box corner circle.
       */
      exact: boolean;
    }
  | undefined {
  if (!isMover(part)) return undefined;

  const half: Vec3 = [part.size[0]! / 2, part.size[1]! / 2, part.size[2]! / 2];
  const min: Vec3 = [part.center[0]! - half[0]!, part.center[1]! - half[1]!, part.center[2]! - half[2]!];
  const max: Vec3 = [part.center[0]! + half[0]!, part.center[1]! + half[1]!, part.center[2]! + half[2]!];

  let spinGrew = false;
  let spinDisc: { axis: Axis; centre: Vec3; radius: number } | undefined;
  // Imported content is never "exact": a file can carry its own clips, so
  // even a pure bob's crest (rest top + rise) is a pose playback may never
  // show. Compiler-procedural geometry has no such escape hatch — the
  // emitter owns every keyframe.
  let exact = !part.file && !part.script;
  const s = turnAxis(part);
  if (s !== undefined) {
    if (!spinSymmetric(part, s)) {
      const m = AXES.indexOf(s);
      const [u, v] = [0, 1, 2].filter((i) => i !== m) as [number, number];
      // A box turning about its own frame's axis: the corner circle is the
      // LOCAL cross diagonal, and it is exact (see the theorem above). A
      // static rotate about the spin axis merely phases the turn, so the
      // local extents still give the corner radius. NEVER exact for a
      // file/script part: imported content is fitted INSIDE its box and
      // need not reach the corners, so its corner circle only bounds.
      const boxExact =
        part.shape === "box" && !part.file && !part.script && (!part.rotate || part.rotate.axis === s);
      const cross = boxExact ? (part.localSize ?? part.size) : part.size;
      const d = Math.hypot(cross[u]!, cross[v]!);
      min[u] = part.center[u]! - d / 2;
      max[u] = part.center[u]! + d / 2;
      min[v] = part.center[v]! - d / 2;
      max[v] = part.center[v]! + d / 2;
      spinGrew = true;
      exact = exact && boxExact;
      // The AABB above is the tight box OF the swept cylinder; the disc
      // records the cylinder itself so pairwise verdicts don't inherit the
      // box's corners. Held to the same standard as any refinement: it may
      // only NARROW a bound that is provably a bound. Compiler shapes fill
      // their box (the language's own rule), so their swept occupancy lies
      // inside the cylinder; a file/script part's own clips can deform
      // beyond any solved box, so narrowing its envelope would turn an
      // already-heuristic bound into a confident miss — it keeps the AABB.
      // A bob off the spin axis translates the disc through its own plane
      // mid-cycle, so only a z-spin keeps it.
      if ((!part.bob || s === "z") && !part.file && !part.script) {
        spinDisc = { axis: s, centre: [...part.center] as Vec3, radius: d / 2 };
      }
    }
  }

  // The advance: an exact interval along the screw axis, from the solved pose
  // (the start of the cycle) to one turn's travel. Signed, so a left-hand
  // thread reserves below rather than above.
  let screwRise = 0;
  if (part.screw) {
    screwRise = part.screw.rise;
    const k = AXES.indexOf(part.screw.axis ?? "z");
    if (screwRise > 0) max[k] = max[k]! + screwRise;
    else min[k] = min[k]! + screwRise;
  }

  let bobRise = 0;
  let bobDip = 0;
  if (part.bob) {
    const amplitude = part.bob.amplitude;
    if (part.restsOn) {
      // Trough-anchored by the emitter: the solved pose is the LOWEST the
      // part ever sits, and the cycle only rises from it.
      bobRise = 2 * amplitude;
    } else {
      bobRise = amplitude;
      bobDip = amplitude;
    }
    max[2] = max[2]! + bobRise;
    min[2] = min[2]! - bobDip;
  }

  return { min, max, spinGrew, bobRise, bobDip, screwRise, exact, ...(spinDisc ? { spinDisc } : {}) };
}

/**
 * The scene's swept envelope, structured for the claims adjudicator's
 * interval calculus. Three facts, each with a different proof power:
 *
 *  - `envelope` — the union of every part's swept (or rest) box. An UPPER
 *    bound on everything the cycle can ever occupy: a claim the envelope
 *    respects is PROVEN to hold at every instant, sampled or not.
 *  - `exactParts` — the movers whose swept box is their true cycle
 *    envelope (see sweptBox.exact). Any one of these breaching a claim is
 *    a PROVEN failure, no frame sample required — this is what closes the
 *    hole where a fast spin's integer-frame samples never landed on the
 *    widest angle and the claim "held" at 98% of a bound the part
 *    demonstrably exceeds.
 *  - `exact` — the whole envelope is true (every mover exact), so the
 *    envelope number itself is THE cycle extent, not a bound.
 *
 * Rest boxes are exact by the language's own rule (every shape fills its
 * AABB); only swept growth can be conservative.
 */
export interface SweptSceneFacts {
  envelope: { min: Vec3; max: Vec3 };
  exact: boolean;
  exactParts: Array<{ id: string; min: Vec3; max: Vec3; motion: string }>;
  /** True when at least one part moves — otherwise the rest pose is the
   *  whole truth and none of this adds anything. */
  animates: boolean;
  /**
   * True when EVERY part is compiler-procedural (no file/script parts).
   * Only then is the envelope an upper bound over all time: imported
   * content can carry its own clips, which deform beyond any solved box,
   * so a "proven pass over the whole cycle" is only provable when the
   * emitter owns every keyframe in the scene.
   */
  procedural: boolean;
}

/** The motion vocabulary of one part, for prose ("spin+bob"). */
export function motionOf(part: SolvedPart): string {
  return [part.spin ? "spin" : null, part.screw ? "screw" : null, part.bob ? "bob" : null]
    .filter(Boolean)
    .join("+");
}

export function sweptSceneFacts(parts: ReadonlyArray<SolvedPart>): SweptSceneFacts | undefined {
  if (parts.length === 0) return undefined;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let exact = true;
  let animates = false;
  let procedural = true;
  const exactParts: SweptSceneFacts["exactParts"] = [];
  for (const part of parts) {
    if (part.file || part.script) procedural = false;
    const env = sweptBox(part);
    const box = env ?? restBox(part);
    for (let i = 0; i < 3; i++) {
      if (box.min[i]! < min[i]!) min[i] = box.min[i]!;
      if (box.max[i]! > max[i]!) max[i] = box.max[i]!;
    }
    if (env) {
      animates = true;
      if (env.exact) {
        exactParts.push({ id: part.id, min: env.min, max: env.max, motion: motionOf(part) });
      } else {
        exact = false;
      }
    }
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return undefined;
  return { envelope: { min, max }, exact, exactParts, animates, procedural };
}

/**
 * True when a full turn about `spinAxis` maps the part's occupied volume
 * onto itself — the no-growth case. Deliberately strict: any doubt means
 * the corner-circle bound, which can over-reserve but never under.
 */
function spinSymmetric(part: SolvedPart, spinAxis: Axis): boolean {
  // A static rotation about a DIFFERENT axis tips the revolution axis off
  // the spin axis; the same axis merely phases the turn.
  if (part.rotate && part.rotate.axis !== spinAxis) return false;
  const m = AXES.indexOf(spinAxis);
  const [u, v] = [0, 1, 2].filter((i) => i !== m) as [number, number];
  const size = part.localSize ?? part.size;
  const circular = Math.abs(size[u]! - size[v]!) <= 1e-9;
  if (!circular) return false;
  switch (part.shape) {
    case "sphere":
      // An equal-cross-section spheroid is symmetric about any axis
      // through its centre that aligns with a principal axis.
      return true;
    case "cylinder":
    case "tube":
    case "cone":
    case "capsule":
    case "torus":
      // Revolution solids, symmetric about their OWN axis only.
      return (part.axis ?? "z") === spinAxis;
    default:
      // box, wedge, file, script: corners exist (or are unknowable).
      return false;
  }
}

const overlap1d = (aMin: number, aMax: number, bMin: number, bMax: number): number =>
  Math.min(aMax, bMax) - Math.max(aMin, bMin);

/**
 * Penetration of a swept spin cylinder into an axis-aligned box — the disc
 * in the cross plane, the envelope's own interval along the spin axis.
 *
 * This is where the corner of the AABB stops lying: a neighbour whose box
 * sits at radial distance d from the spin axis with d > radius is CLEAR of
 * the swept solid, even when it overlaps the envelope's bounding square —
 * the square's corner reaches √2 further than the circle ever does. The
 * verdict was wrong by more than the part's own radius on a real ring
 * (+40 mm of true clearance reported as −30 mm of interpenetration).
 *
 * Returns the refined penetration (negative = separated), or undefined when
 * the disc centre projects INSIDE the neighbour's cross rectangle — there
 * the disc genuinely surrounds the neighbour's column and the AABB depth is
 * already honest.
 */
function spinCylinderPenetration(
  disc: { axis: Axis; centre: Vec3; radius: number },
  cylMin: Vec3,
  cylMax: Vec3,
  boxMin: Vec3,
  boxMax: Vec3,
): number | undefined {
  const m = AXES.indexOf(disc.axis);
  const [u, v] = [0, 1, 2].filter((i) => i !== m) as [number, number];
  const axisPen = overlap1d(cylMin[m]!, cylMax[m]!, boxMin[m]!, boxMax[m]!);
  const du = Math.max(boxMin[u]! - disc.centre[u]!, 0, disc.centre[u]! - boxMax[u]!);
  const dv = Math.max(boxMin[v]! - disc.centre[v]!, 0, disc.centre[v]! - boxMax[v]!);
  const dist = Math.hypot(du, dv);
  if (dist === 0) return undefined;
  return Math.min(axisPen, disc.radius - dist);
}

/** Minimum penetration across the three axes; <= 0 means separated. */
function penetration(aMin: Vec3, aMax: Vec3, bMin: Vec3, bMax: Vec3): number {
  let worst = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = overlap1d(aMin[i]!, aMax[i]!, bMin[i]!, bMax[i]!);
    if (o < worst) worst = o;
  }
  return worst;
}

function restBox(part: SolvedPart): { min: Vec3; max: Vec3 } {
  const half: Vec3 = [part.size[0]! / 2, part.size[1]! / 2, part.size[2]! / 2];
  return {
    min: [part.center[0]! - half[0]!, part.center[1]! - half[1]!, part.center[2]! - half[2]!],
    max: [part.center[0]! + half[0]!, part.center[1]! + half[1]!, part.center[2]! + half[2]!],
  };
}

/**
 * Adjudicate every motion envelope against the rest of the scene. Pure and
 * parse-time: boxes in, issues out, no Blender. Claims are NOT judged here —
 * that jurisdiction lives in lint/claims.ts, the one adjudicator, which
 * consumes `sweptSceneFacts` so the analytic envelope and the sampled census
 * can never issue contradicting verdicts about the same claim two lines
 * apart (they used to).
 */
export function motionEnvelopeIssues(
  solved: { parts: ReadonlyArray<SolvedPart> },
): Issue[] {
  const issues: Issue[] = [];
  const movers = solved.parts.filter(isMover);
  if (movers.length === 0) return issues;

  /* ---- envelope vs neighbours -------------------------------------- */
  // The finding is the DIFFERENCE the cycle makes: a pair already resting
  // in contact (the 1mm embed) is fine, and a pair the cycle pushes DEEPER
  // than its rest contact is not. Judged pairwise from the mover's side;
  // a moving pair is judged once, envelope against envelope.
  const seen = new Set<string>();
  for (const mover of movers) {
    const env = sweptBox(mover)!;
    for (const other of solved.parts) {
      if (other.id === mover.id) continue;
      const key = mover.id < other.id ? `${mover.id}\u0000${other.id}` : `${other.id}\u0000${mover.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const otherEnv = sweptBox(other);
      const oMin = otherEnv ? otherEnv.min : restBox(other).min;
      const oMax = otherEnv ? otherEnv.max : restBox(other).max;
      const rest = restBox(mover);
      const restOther = restBox(other);
      const restPen = Math.max(0, penetration(rest.min, rest.max, restOther.min, restOther.max));
      let cyclePen = penetration(env.min, env.max, oMin, oMax);
      /* Narrow the AABB verdict through the exact swept solids. Every
         refinement is an upper bound on the true overlap (the cylinder is a
         subset of its bounding box), so the minimum of all applicable bounds
         is the tightest honest number. Two discs on one axis meet as
         circles; a disc against anything else meets its cross rectangle. */
      if (env.spinDisc && otherEnv?.spinDisc && env.spinDisc.axis === otherEnv.spinDisc.axis) {
        const m = AXES.indexOf(env.spinDisc.axis);
        const [u, v] = [0, 1, 2].filter((i) => i !== m) as [number, number];
        const axisPen = overlap1d(env.min[m]!, env.max[m]!, oMin[m]!, oMax[m]!);
        const cd = Math.hypot(
          otherEnv.spinDisc.centre[u]! - env.spinDisc.centre[u]!,
          otherEnv.spinDisc.centre[v]! - env.spinDisc.centre[v]!,
        );
        cyclePen = Math.min(
          cyclePen,
          Math.min(axisPen, env.spinDisc.radius + otherEnv.spinDisc.radius - cd),
        );
      } else {
        if (env.spinDisc) {
          const refined = spinCylinderPenetration(env.spinDisc, env.min, env.max, oMin, oMax);
          if (refined !== undefined) cyclePen = Math.min(cyclePen, refined);
        }
        if (otherEnv?.spinDisc) {
          const refined = spinCylinderPenetration(otherEnv.spinDisc, oMin, oMax, env.min, env.max);
          if (refined !== undefined) cyclePen = Math.min(cyclePen, refined);
        }
      }
      if (cyclePen <= restPen + MIN_CONTACT + 1e-9) continue;
      const motion = motionOf(mover) + (otherEnv ? "+(both move)" : "");
      issues.push({
        code: ISSUE_CODES.MOTION_ENVELOPE_CROSSES,
        severity: "warning",
        message:
          restPen > 0
            ? `'${mover.id}' (${motion}) presses ${fmt(cyclePen)}m into '${other.id}' mid-cycle — their rest contact is only ${fmt(restPen)}m deep`
            : `'${mover.id}' (${motion}) sweeps ${fmt(cyclePen)}m into '${other.id}' mid-cycle — the rest pose clears it`,
        hint:
          "a spinning part is judged by its exact swept cylinder (a symmetric part spinning about its own axis sweeps nothing); the bound is conservative only for wedge/file/script movers — widen the gap, shrink the motion, or ignore this if the graze is intentional",
        target: `${mover.id} <-> ${other.id}`,
        detail: {
          restPenetration: round6(restPen),
          cyclePenetration: round6(cyclePen),
          envelope: { min: env.min.map(round6), max: env.max.map(round6) },
          ...(env.spinDisc ? { sweptRadius: round6(env.spinDisc.radius) } : {}),
        },
      });
    }
  }

  return issues;
}

const round6 = (v: number): number => Number(v.toFixed(6));
const fmt = (v: number): string => String(Number(v.toFixed(4)));
