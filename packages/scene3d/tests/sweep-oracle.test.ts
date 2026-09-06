import { describe, expect, it } from "vitest";
import { motionEnvelopeIssues, sweptBox } from "../src/solve/sweep.js";
import { Rng } from "../src/solve/rng.js";
import {
  AXES,
  MIN_CONTACT,
  rotatedShapeSize,
  shapeWidthAlong,
} from "../src/solve/types.js";
import type { Axis, PartShape, ShapeFacts, SolvedPart, Vec3 } from "../src/solve/types.js";

/**
 * ADVERSARIAL falsification of the kinematic sweep math.
 *
 * `sweptBox` is closed form: a corner-circle disc for spin, an exact
 * translation for bob, a screw that composes the two, and a symmetry theorem
 * that claims some turns cost nothing at all. This file tries to BREAK all
 * four with a brute-force numeric oracle that shares none of that arithmetic:
 *
 *   - the rotation is composed here as a 3×3 matrix product (sweep.ts and
 *     types.ts both use quaternions, and those helpers are not exported),
 *   - the per-angle world extent comes from `shapeWidthAlong` — the support
 *     function, NOT sweptBox's diagonal. That function is PRODUCTION code,
 *     so a defect shared with it would blind this oracle; the corner-
 *     enumeration audit at the bottom of this file closes that hole for
 *     the box family, which is the family the exactness claims rest on,
 *   - the full turn is sampled at 720 angles and the per-axis maximum is
 *     then ternary-refined, so the union is a true maximum rather than a
 *     sample of one (a raw 720-sample max under-reads a 14m diagonal by
 *     ~1e-4, which would silently pass a tightness claim it should fail).
 *
 * PROPERTY 1 (soundness) is the one that must never fail: an envelope that
 * under-reserves is a lie the solver builds on.
 */

/* ------------------------------------------------------------------ */
/* Independent rotation composition (matrices, not quaternions)        */
/* ------------------------------------------------------------------ */

type Mat3 = [Vec3, Vec3, Vec3]; // rows

const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Right-handed rotation about a world axis, built from first principles. */
function rotationAbout(axis: Axis, rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  if (axis === "x") {
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c],
    ];
  }
  if (axis === "y") {
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c],
    ];
  }
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

function matMul(a: Mat3, b: Mat3): Mat3 {
  const out: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i]![j] = a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!;
    }
  }
  return out;
}

/**
 * Rᵀ·e_i — the world axis carried back into the shape's local frame.
 * (Rᵀe_i)_j = R_ij, i.e. ROW i of R, not column i. Getting this backwards
 * measures the shape under the wrong rotation and manufactures violations.
 */
function inverseApplyBasis(r: Mat3, i: number): Vec3 {
  return [r[i]![0]!, r[i]![1]!, r[i]![2]!];
}

/* ------------------------------------------------------------------ */
/* The oracle                                                          */
/* ------------------------------------------------------------------ */

const factsOf = (p: SolvedPart): ShapeFacts => ({ shape: p.shape, axis: p.axis, tip: p.tip, flip: p.flip });

/**
 * World extent of the part along world axis `i` at spin angle `theta`.
 *
 * The emitter BAKES the static rotation into the mesh and then animates
 * `rotation_euler` about a world axis, so the composed world rotation is
 * spin(θ) ∘ static. The width is the support width of the shape in its own
 * local box, measured along the world axis pulled back through that
 * rotation — the same convention every consumer of `rotatedShapeSize` uses
 * (a centred box of the measured width).
 */
function widthAt(p: SolvedPart, i: number, theta: number): number {
  const local = p.localSize ?? p.size;
  const stat = p.rotate ? rotationAbout(p.rotate.axis, (p.rotate.deg * Math.PI) / 180) : IDENTITY;
  const turn = turnAxisOf(p);
  const spin = turn ? rotationAbout(turn, theta) : IDENTITY;
  const r = matMul(spin, stat);
  return shapeWidthAlong(factsOf(p), local, inverseApplyBasis(r, i));
}

/** The axis the part turns about — `spin`, or a `screw`'s rotation half. */
function turnAxisOf(p: SolvedPart): Axis | undefined {
  if (p.spin) return p.spin.axis ?? "z";
  if (p.screw) return p.screw.axis ?? "z";
  return undefined;
}

/**
 * World offset the SCREW has translated the part by at cycle phase t ∈ [0,1].
 *
 * Read off the emitter's keyframes (`_animate_screw` in emit-bpy.ts): two
 * LINEAR keys, `base` at frame 1 and `base + rise` at frame 1 + period, then
 * a REPEAT cycles modifier. So the advance is t·rise, and the phase the
 * envelope must cover is the closed interval — t = 1 is a real frame the
 * clip reaches before it snaps back.
 */
function screwOffset(p: SolvedPart, i: number, t: number): number {
  if (!p.screw) return 0;
  if (AXES.indexOf(p.screw.axis ?? "z") !== i) return 0;
  return t * p.screw.rise;
}

const SAMPLES = 720;

/**
 * The extreme world coordinate on one side of axis `i`, over the whole cycle.
 *
 * `dir` is +1 for the far side and −1 for the near one, so the objective is
 * dir·offset(t) + width(θ(t))/2 — the turn and the advance optimised
 * JOINTLY over the single cycle parameter, not per-motion and recombined.
 * That is deliberate: sweptBox's screw arithmetic ASSUMES the two are
 * separable (a turn about an axis cannot change the extent along it), and an
 * oracle that assumed the same thing could not falsify the assumption.
 */
function extreme(p: SolvedPart, i: number, dir: 1 | -1): number {
  const turn = turnAxisOf(p);
  const f = (t: number): number => dir * screwOffset(p, i, t) + widthAt(p, i, 2 * Math.PI * t) / 2;
  if (!turn) return f(0);
  let best = -Infinity;
  let bestK = 0;
  // Inclusive of t = 1: the advance reaches its full rise on the last frame
  // of the cycle, and an exclusive sweep would under-read it by one step.
  for (let k = 0; k <= SAMPLES; k++) {
    const w = f(k / SAMPLES);
    if (w > best) {
      best = w;
      bestK = k;
    }
  }
  // Ternary refinement in the bracket the sampled maximum sits in. Without
  // it a 0.5° grid under-reads a large diagonal by ~1e-4 and PROPERTY 2's
  // exactness claim would pass on a formula that was merely close.
  let lo = Math.max(0, (bestK - 1) / SAMPLES);
  let hi = Math.min(1, (bestK + 1) / SAMPLES);
  for (let it = 0; it < 40; it++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    const wa = f(a);
    const wb = f(b);
    if (wa > best) best = wa;
    if (wb > best) best = wb;
    if (wa < wb) lo = a;
    else hi = b;
  }
  return best;
}

/**
 * Bob sweep sampled from the waveform the EMITTER authors (`_animate_bob`
 * in emit-bpy.ts): keyframes (mid, high, mid, low, mid) over the period,
 * where a grounded part takes its solved z as the TROUGH (low = base,
 * high = base + 2A) and a hoverer oscillates around it (low = base − A).
 * Sampled as the sine that interpolation traces through those keys.
 */
function bobSamples(p: SolvedPart): { rise: number; dip: number } {
  if (!p.bob) return { rise: 0, dip: 0 };
  const base = p.center[2]!;
  const a = p.bob.amplitude;
  const low = p.restsOn ? base : base - a;
  const mid = low + a;
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < SAMPLES; k++) {
    const z = mid + a * Math.sin((2 * Math.PI * k) / SAMPLES);
    if (z < min) min = z;
    if (z > max) max = z;
  }
  return { rise: max - base, dip: base - min };
}

/** Brute-force swept box: union of the per-angle world AABBs, plus bob. */
function numericSweep(p: SolvedPart): { min: Vec3; max: Vec3 } {
  const min = [0, 0, 0] as Vec3;
  const max = [0, 0, 0] as Vec3;
  for (let i = 0; i < 3; i++) {
    min[i] = p.center[i]! - extreme(p, i, -1);
    max[i] = p.center[i]! + extreme(p, i, 1);
  }
  const bob = bobSamples(p);
  max[2] = max[2]! + bob.rise;
  min[2] = min[2]! - bob.dip;
  return { min, max };
}

const restBox = (p: SolvedPart): { min: Vec3; max: Vec3 } => ({
  min: [
    p.center[0]! - p.size[0]! / 2,
    p.center[1]! - p.size[1]! / 2,
    p.center[2]! - p.size[2]! / 2,
  ],
  max: [
    p.center[0]! + p.size[0]! / 2,
    p.center[1]! + p.size[1]! / 2,
    p.center[2]! + p.size[2]! / 2,
  ],
});

const repro = (p: SolvedPart): string => JSON.stringify(p);

/* ------------------------------------------------------------------ */
/* Deterministic adversarial corpus                                    */
/* ------------------------------------------------------------------ */

const SHAPES: PartShape[] = [
  "box",
  "cylinder",
  "sphere",
  "cone",
  "torus",
  "wedge",
  "tube",
  "capsule",
];

const logUniform = (r: Rng, lo: number, hi: number): number =>
  Math.exp(r.uniform(Math.log(lo), Math.log(hi)));

function pick<T>(r: Rng, xs: readonly T[]): T {
  return xs[Math.min(xs.length - 1, Math.floor(r.next() * xs.length))]!;
}

/** One fuzz case, addressed by index so a failure is a one-paste repro. */
function caseAt(index: number): SolvedPart {
  const r = new Rng("sweep-oracle-v1").at(`case/${index}`);
  const shape = pick(r, SHAPES);
  // A wedge slopes along a horizontal axis; validate.ts refuses z.
  const axis: Axis = shape === "wedge" ? pick(r, ["x", "y"] as const) : pick(r, AXES);
  const localSize: Vec3 = [
    logUniform(r, 1e-3, 10),
    logUniform(r, 1e-3, 10),
    logUniform(r, 1e-3, 10),
  ];
  const m = AXES.indexOf(axis);
  const [u, v] = [0, 1, 2].filter((i) => i !== m) as [number, number];
  // Only proportions the language ACCEPTS are fair game: validate.ts refuses
  // an elliptical torus/tube/capsule, a torus whose tube does not fit its
  // ring, and a capsule shorter than it is wide. Fuzzing illegal boxes would
  // report "violations" of a shape no author can write.
  const circular = shape === "torus" || shape === "tube" || shape === "capsule";
  // A quarter of the remaining cases get an EQUAL cross about the shape's own
  // axis anyway — the precondition of the symmetry theorem, which random
  // sizes would otherwise never hit.
  if (circular || r.next() < 0.25) localSize[v] = localSize[u]!;
  if (shape === "torus") localSize[m] = localSize[u]! * r.uniform(0.02, 0.49);
  if (shape === "capsule") localSize[m] = Math.max(localSize[m]!, localSize[u]!);
  // One case in five is CUBE-proportioned. It is the ONLY way a revolution
  // solid presents an equal cross about a FOREIGN axis, which is precisely
  // the configuration the symmetry theorem has to keep refusing — without it
  // a mutant that returns `true` for every revolution solid survives the
  // whole fuzz. (A torus can never be cubic: its ring must clear its tube.)
  if (shape !== "torus" && r.next() < 0.2) {
    localSize[0] = localSize[u]!;
    localSize[1] = localSize[u]!;
    localSize[2] = localSize[u]!;
  }

  const facts: ShapeFacts = { shape, axis };
  if (shape === "cone") facts.tip = r.next() < 0.3 ? 0 : r.uniform(0, 1);

  const spinRoll = r.next();
  const bobRoll = r.next();
  // At least one motion, or sweptBox is undefined and there is nothing to
  // falsify.
  const wantSpin = spinRoll < 0.8 || bobRoll >= 0.8;
  const wantBob = bobRoll < 0.8 || !wantSpin;

  const spinAxis = pick(r, AXES);
  const rotateRoll = r.next();
  const rotate =
    rotateRoll < 0.25
      ? undefined
      : {
          // Half of the rotated cases turn about the SPIN axis (the case the
          // symmetry theorem tolerates), half about a foreign one.
          axis: rotateRoll < 0.6 ? spinAxis : pick(r, AXES),
          deg: r.uniform(-360, 360),
        };

  // `flip` feeds the world box, because a wedge's support is not
  // flip-symmetric (the high end of the slope reaches a different corner) —
  // so the box must be computed WITH it, exactly as the solver does by
  // passing the whole part to rotatedShapeSize (solver.ts). Drawing it here
  // rather than inside the literal keeps the box and the part in agreement.
  const flip = r.next() < 0.5;
  const part: SolvedPart = {
    id: `prp_fuzz_${index}`,
    shape,
    axis,
    flip,
    size: rotatedShapeSize({ ...facts, flip }, localSize, rotate),
    center: [r.uniform(-5, 5), r.uniform(-5, 5), r.uniform(-5, 5)],
  };
  if (facts.tip !== undefined) part.tip = facts.tip;
  if (shape === "tube") part.thickness = Math.min(...localSize) / 4;
  if (rotate) {
    part.rotate = rotate;
    part.localSize = localSize;
  }
  if (wantSpin) part.spin = { axis: spinAxis };
  if (wantBob) part.bob = { amplitude: logUniform(r, 1e-3, 2) };
  if (wantBob && r.next() < 0.5) part.restsOn = "prp_ground";
  if (r.next() < 0.08) part.file = "assets/thing.glb";

  // The screw draws ride at the END of the sequence on purpose: every case
  // above keeps the exact geometry the earlier properties were tuned
  // against, and a third of the turning ones are then promoted from spin to
  // screw — the same rotation, plus a rise. The exclusivity mirrors the
  // validator's, because an oracle for parts the language refuses proves
  // nothing: never both spin and screw, and never a z screw beside a bob.
  if (part.spin && r.next() < 0.35) {
    const axis: Axis = part.bob ? pick(r, ["x", "y"] as const) : (part.spin.axis ?? "z");
    const rise = logUniform(r, 1e-3, 10) * (r.next() < 0.5 ? -1 : 1);
    delete part.spin;
    part.screw = { axis, rise };
  }
  return part;
}

const CASES = 600;

/* ------------------------------------------------------------------ */

describe("sweptBox vs a brute-force numeric oracle", () => {
  it("oracle self-check: at rest the oracle reproduces the solved world box", () => {
    // If the rotation composition were wrong, every downstream verdict would
    // be about a different part than the one sweptBox is judging.
    const bad: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const p = caseAt(i);
      for (let a = 0; a < 3; a++) {
        const w = widthAt(p, a, 0);
        const tol = 1e-9 * Math.max(1, p.size[a]!);
        if (Math.abs(w - p.size[a]!) > tol) {
          bad.push(`axis ${a}: oracle ${w} vs solved ${p.size[a]} — ${repro(p)}`);
        }
      }
    }
    expect(bad.join("\n")).toBe("");
  });

  it("PROPERTY 1 — the closed form NEVER under-reserves (600 adversarial cases)", () => {
    const bad: string[] = [];
    let screws = 0;
    for (let i = 0; i < CASES; i++) {
      const p = caseAt(i);
      if (p.screw) screws++;
      const env = sweptBox(p)!;
      const num = numericSweep(p);
      for (let a = 0; a < 3; a++) {
        if (env.min[a]! > num.min[a]! + 1e-9) {
          bad.push(
            `case ${i} axis ${a}: closed min ${env.min[a]} > numeric min ${num.min[a]} — ${repro(p)}`,
          );
        }
        if (env.max[a]! < num.max[a]! - 1e-9) {
          bad.push(
            `case ${i} axis ${a}: closed max ${env.max[a]} < numeric max ${num.max[a]} — ${repro(p)}`,
          );
        }
      }
    }
    expect(bad.join("\n")).toBe("");
    // Coverage before verdict: a corpus with no screw in it would pass this
    // property against a sweptBox that ignored screw entirely.
    expect(screws).toBeGreaterThan(40);
  });

  it("PROPERTY 2a — the symmetry theorem is TRUE, not merely convenient", () => {
    // Every case sweptBox declares costless must actually sweep to its rest
    // box under the independent oracle, and the theorem must fire on the
    // cases that satisfy its stated precondition.
    const bad: string[] = [];
    let costless = 0;
    for (let i = 0; i < CASES; i++) {
      const p = caseAt(i);
      if (!turnAxisOf(p)) continue;
      const env = sweptBox(p)!;
      if (env.spinGrew) continue;
      costless++;
      const rest = restBox(p);
      const num = numericSweep(p);
      const screwAxis = p.screw ? AXES.indexOf(p.screw.axis ?? "z") : -1;
      for (let a = 0; a < 3; a++) {
        // The rest box, before bob is added back on z and the screw's own
        // travel on its axis — costless means the TURN reserves nothing, and
        // a screw still advances.
        let lo = a === 2 ? rest.min[2]! - env.bobDip : rest.min[a]!;
        let hi = a === 2 ? rest.max[2]! + env.bobRise : rest.max[a]!;
        if (a === screwAxis) {
          if (env.screwRise > 0) hi += env.screwRise;
          else lo += env.screwRise;
        }
        if (Math.abs(lo - num.min[a]!) > 1e-9 || Math.abs(hi - num.max[a]!) > 1e-9) {
          bad.push(
            `case ${i} axis ${a}: claimed costless [${lo}, ${hi}] but the turn sweeps [${num.min[a]}, ${num.max[a]}] — ${repro(p)}`,
          );
        }
      }
    }
    expect(bad.join("\n")).toBe("");
    // Coverage: a green result on zero costless cases proves nothing.
    expect(costless).toBeGreaterThan(20);
  });

  it("PROPERTY 2b — the corner circle is EXACT for an unrotated spinning box", () => {
    const bad: string[] = [];
    let checked = 0;
    for (let i = 0; i < CASES; i++) {
      const p = caseAt(i);
      if (p.shape !== "box" || p.rotate || !turnAxisOf(p)) continue;
      checked++;
      const env = sweptBox(p)!;
      const num = numericSweep(p);
      for (let a = 0; a < 3; a++) {
        if (Math.abs(env.min[a]! - num.min[a]!) > 1e-6 || Math.abs(env.max[a]! - num.max[a]!) > 1e-6) {
          bad.push(
            `case ${i} axis ${a}: closed [${env.min[a]}, ${env.max[a]}] vs numeric [${num.min[a]}, ${num.max[a]}] — ${repro(p)}`,
          );
        }
      }
    }
    expect(bad.join("\n")).toBe("");
    expect(checked).toBeGreaterThan(8);

    // …and a dedicated family, so the exactness claim is not resting on
    // whatever fraction of the mixed fuzz happened to land on a box.
    const bad2: string[] = [];
    for (let i = 0; i < 200; i++) {
      const r = new Rng("sweep-oracle-box-v1").at(`box/${i}`);
      const p: SolvedPart = {
        id: `prp_box_${i}`,
        shape: "box",
        axis: "z",
        flip: false,
        size: [logUniform(r, 1e-3, 10), logUniform(r, 1e-3, 10), logUniform(r, 1e-3, 10)],
        center: [r.uniform(-5, 5), r.uniform(-5, 5), r.uniform(-5, 5)],
        spin: { axis: pick(r, AXES) },
      };
      if (r.next() < 0.5) p.bob = { amplitude: logUniform(r, 1e-3, 2) };
      if (p.bob && r.next() < 0.5) p.restsOn = "prp_ground";
      const env = sweptBox(p)!;
      const num = numericSweep(p);
      for (let a = 0; a < 3; a++) {
        if (Math.abs(env.min[a]! - num.min[a]!) > 1e-6 || Math.abs(env.max[a]! - num.max[a]!) > 1e-6) {
          bad2.push(
            `box ${i} axis ${a}: closed [${env.min[a]}, ${env.max[a]}] vs numeric [${num.min[a]}, ${num.max[a]}] — ${repro(p)}`,
          );
        }
      }
    }
    expect(bad2.join("\n")).toBe("");
  });

  it("PROPERTY 2b — hand-built boxes: the disc is the diagonal, to 1e-9", () => {
    for (const [w, h, d] of [
      [0.4, 0.2, 0.1],
      [10, 1e-3, 3],
      [7, 7, 7],
      [1e-3, 1e-3, 10],
    ] as const) {
      for (const axis of AXES) {
        const p: SolvedPart = {
          id: "prp_box",
          shape: "box",
          axis: "z",
          flip: false,
          size: [w, h, d],
          center: [0, 0, 0],
          spin: { axis },
        };
        const env = sweptBox(p)!;
        const num = numericSweep(p);
        for (let a = 0; a < 3; a++) {
          expect(env.min[a]!, repro(p)).toBeCloseTo(num.min[a]!, 9);
          expect(env.max[a]!, repro(p)).toBeCloseTo(num.max[a]!, 9);
        }
      }
    }
  });

  it("PROPERTY 4 — screw: the closed form is EXACT for an unrotated box (200 cases)", () => {
    // A dedicated family, because the mixed fuzz promotes only a third of
    // its spins and the exactness claim must not rest on that fraction. The
    // objective the oracle optimises here is JOINT in the cycle parameter,
    // so a closed form that separated turn from advance incorrectly — or
    // anchored the advance anywhere but the solved pose — fails.
    const bad: string[] = [];
    let signs = 0;
    for (let i = 0; i < 200; i++) {
      const r = new Rng("sweep-oracle-screw-v1").at(`screw/${i}`);
      const axis = pick(r, AXES);
      const rise = logUniform(r, 1e-3, 10) * (r.next() < 0.5 ? -1 : 1);
      if (rise < 0) signs++;
      const p: SolvedPart = {
        id: `prp_screw_${i}`,
        shape: "box",
        axis: "z",
        flip: false,
        size: [logUniform(r, 1e-3, 10), logUniform(r, 1e-3, 10), logUniform(r, 1e-3, 10)],
        center: [r.uniform(-5, 5), r.uniform(-5, 5), r.uniform(-5, 5)],
        screw: { axis, rise },
      };
      // A bob only where the language allows one: never beside a z screw.
      if (axis !== "z" && r.next() < 0.4) {
        p.bob = { amplitude: logUniform(r, 1e-3, 2) };
        if (r.next() < 0.5) p.restsOn = "prp_ground";
      }
      const env = sweptBox(p)!;
      const num = numericSweep(p);
      for (let a = 0; a < 3; a++) {
        const tol = 1e-6 * Math.max(1, Math.abs(rise));
        if (Math.abs(env.min[a]! - num.min[a]!) > tol || Math.abs(env.max[a]! - num.max[a]!) > tol) {
          bad.push(
            `screw ${i} axis ${a}: closed [${env.min[a]}, ${env.max[a]}] vs numeric [${num.min[a]}, ${num.max[a]}] — ${repro(p)}`,
          );
        }
      }
    }
    expect(bad.join("\n")).toBe("");
    // Coverage: both thread handednesses must be in the corpus, or a closed
    // form that reserved |rise| upward regardless of sign would survive.
    expect(signs).toBeGreaterThan(50);
    expect(200 - signs).toBeGreaterThan(50);
  });

  it("PROPERTY 4 — a symmetric part screwing about its own axis reserves ONLY its travel", () => {
    // The symmetry theorem survives the composition: the turn of a cylinder
    // about its own axis costs nothing, so the whole envelope growth is the
    // rise — and it grows on the side the sign names, never both.
    const auger = (rise: number): SolvedPart => ({
      id: "prp_auger",
      shape: "cylinder",
      axis: "z",
      flip: false,
      size: [0.2, 0.2, 1],
      center: [0, 0, 0.5],
      screw: { axis: "z", rise },
    });
    const up = sweptBox(auger(0.3))!;
    expect(up.spinGrew).toBe(false);
    expect(up.screwRise).toBe(0.3);
    expect(up.max[2]).toBeCloseTo(1.3, 12);
    expect(up.min[2]).toBeCloseTo(0, 12);
    expect(up.max[0] - up.min[0]).toBeCloseTo(0.2, 12);

    const down = sweptBox(auger(-0.3))!;
    expect(down.max[2]).toBeCloseTo(1, 12);
    expect(down.min[2]).toBeCloseTo(-0.3, 12);

    for (const p of [auger(0.3), auger(-0.3)]) {
      const num = numericSweep(p);
      const env = sweptBox(p)!;
      for (let a = 0; a < 3; a++) {
        expect(env.min[a]!, repro(p)).toBeCloseTo(num.min[a]!, 9);
        expect(env.max[a]!, repro(p)).toBeCloseTo(num.max[a]!, 9);
      }
    }
  });

  it("PROPERTY 3 — bob: the sampled waveform's extremes ARE bobRise/bobDip", () => {
    const bad: string[] = [];
    let grounded = 0;
    let floating = 0;
    for (let i = 0; i < CASES; i++) {
      const p = caseAt(i);
      if (!p.bob) continue;
      if (p.restsOn) grounded++;
      else floating++;
      const env = sweptBox(p)!;
      const sampled = bobSamples(p);
      const tol = 1e-12 * Math.max(1, Math.abs(p.center[2]!), p.bob.amplitude);
      if (Math.abs(sampled.rise - env.bobRise) > tol || Math.abs(sampled.dip - env.bobDip) > tol) {
        bad.push(
          `case ${i}: emitter waveform rises ${sampled.rise}/dips ${sampled.dip}, sweptBox says ${env.bobRise}/${env.bobDip} — ${repro(p)}`,
        );
      }
      // And the envelope must actually contain the sampled travel on z.
      const rest = restBox(p);
      if (env.max[2]! < rest.max[2]! + sampled.rise - 1e-9 || env.min[2]! > rest.min[2]! - sampled.dip + 1e-9) {
        bad.push(`case ${i}: envelope does not contain the bob travel — ${repro(p)}`);
      }
    }
    expect(bad.join("\n")).toBe("");
    expect(grounded).toBeGreaterThan(20);
    expect(floating).toBeGreaterThan(20);
  });

  it("PROPERTY 3 — a grounded part never descends; a hoverer is symmetric", () => {
    const base = (over: Partial<SolvedPart>): SolvedPart => ({
      id: "prp_bobber",
      shape: "box",
      axis: "z",
      flip: false,
      size: [1, 1, 1],
      center: [0, 0, 0.5],
      bob: { amplitude: 0.25 },
      ...over,
    });
    const grounded = base({ restsOn: "prp_deck" });
    const gs = bobSamples(grounded);
    expect(gs.dip).toBe(0);
    expect(gs.rise).toBeCloseTo(0.5, 12);
    expect(sweptBox(grounded)!.min[2]).toBeCloseTo(0, 12);

    const hover = base({});
    const hs = bobSamples(hover);
    expect(hs.rise).toBeCloseTo(0.25, 12);
    expect(hs.dip).toBeCloseTo(0.25, 12);
  });
});

/* ------------------------------------------------------------------ */
/* Boundary falsification of the issue predicate                       */
/* ------------------------------------------------------------------ */

describe("motionEnvelopeIssues boundary", () => {
  /**
   * The predicate is `cyclePen <= restPen + MIN_CONTACT + 1e-9` → silent,
   * so the true boundary is one 1e-9 slack ABOVE the contact floor. Built
   * so the cycle penetration is exactly `amplitude − 0.5`: mover box 1×1×1
   * at the origin bobbing by A, slab from z=1 to z=2 above it, wide enough
   * that z is always the minimum overlap. Rest penetration is 0 (the rest
   * box tops out at 0.5, half a metre clear).
   */
  const scene = (amplitude: number) => ({
    parts: [
      {
        id: "prp_mover",
        shape: "box" as const,
        axis: "z" as const,
        flip: false,
        size: [1, 1, 1] as Vec3,
        center: [0, 0, 0] as Vec3,
        bob: { amplitude },
      },
      {
        id: "prp_slab",
        shape: "box" as const,
        axis: "z" as const,
        flip: false,
        size: [10, 10, 1] as Vec3,
        center: [0, 0, 1.5] as Vec3,
      },
    ] satisfies SolvedPart[],
  });

  it("the fixture's penetration is the quantity it claims to be", () => {
    // Assert coverage before asserting the verdict: a boundary test whose
    // fixture misses the boundary passes against broken code.
    const issues = motionEnvelopeIssues(scene(0.6));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detail?.restPenetration).toBe(0);
    expect(issues[0]!.detail?.cyclePenetration).toBeCloseTo(0.1, 9);
  });

  it("is silent at exactly restPen + MIN_CONTACT", () => {
    expect(motionEnvelopeIssues(scene(0.5 + MIN_CONTACT))).toEqual([]);
  });

  it("is silent inside the 1e-9 slack the comparison carries", () => {
    expect(motionEnvelopeIssues(scene(0.5 + MIN_CONTACT + 0.5e-9))).toEqual([]);
  });

  it("fires 2e-9 above the floor — the slack is 1e-9, not a free millimetre", () => {
    const issues = motionEnvelopeIssues(scene(0.5 + MIN_CONTACT + 2e-9));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("S3D-W-108");
    expect(issues[0]!.message).toContain("the rest pose clears it");
  });

  it("is silent just BELOW the floor", () => {
    expect(motionEnvelopeIssues(scene(0.5 + MIN_CONTACT - 1e-6))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Independence audit: the oracle's own width function, cross-checked  */
/* ------------------------------------------------------------------ */

describe("shapeWidthAlong vs corner enumeration (shared-defect audit)", () => {
  /**
   * The oracle above imports the production support function, so a defect
   * shared by `shapeWidthAlong` and `sweptBox` would let implementation and
   * oracle agree while both are wrong. For the BOX family — the family every
   * exactness claim in this file ultimately rests on — there is a second,
   * fully independent derivation: rotate the eight corners explicitly (the
   * file's own Mat3 machinery, no production code) and take max−min of
   * their projections. If the support function and the corners ever
   * disagree, the whole oracle's foundation is the thing that broke.
   */
  it("agrees with explicit corner projection for 200 random rotated boxes", () => {
    const rng = new Rng("width-independence");
    for (let caseId = 0; caseId < 200; caseId++) {
      const r = rng.at(`case/${caseId}`);
      const size: Vec3 = [
        0.05 + r.next() * 4,
        0.05 + r.next() * 4,
        0.05 + r.next() * 4,
      ];
      const axis = AXES[Math.floor(r.next() * 3)]!;
      const deg = r.next() * 720 - 360;
      const rot = rotationAbout(axis, (deg * Math.PI) / 180);

      // Eight corners of the local box, rotated into world by the matrix.
      const corners: Vec3[] = [];
      for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
        const local: Vec3 = [sx * size[0]!, sy * size[1]!, sz * size[2]!];
        corners.push([
          rot[0]![0]! * local[0]! + rot[0]![1]! * local[1]! + rot[0]![2]! * local[2]!,
          rot[1]![0]! * local[0]! + rot[1]![1]! * local[1]! + rot[1]![2]! * local[2]!,
          rot[2]![0]! * local[0]! + rot[2]![1]! * local[1]! + rot[2]![2]! * local[2]!,
        ]);
      }

      for (let i = 0; i < 3; i++) {
        const projections = corners.map((c) => c[i]!);
        const cornerWidth = Math.max(...projections) - Math.min(...projections);
        const supportWidth = shapeWidthAlong(
          { shape: "box", axis: "z" } as ShapeFacts,
          size,
          inverseApplyBasis(rot, i),
        );
        expect(
          supportWidth,
          `case ${caseId}: box ${size.map((v) => v.toFixed(3)).join("×")} rot ${axis} ${deg.toFixed(1)}° axis ${i}`,
        ).toBeCloseTo(cornerWidth, 9);
      }
    }
  });
});
