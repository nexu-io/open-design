import { Rational } from "./rational.js";
import {
  edgeKey,
  edgesOf,
  extrude,
  inset,
  KernelMesh,
  meshOf,
  mirror,
  PredictedCensus,
  predictCensus,
  RVec3,
  subdivideCatmullClark,
  triangulate,
} from "./mesh.js";
import { clip, type Plane } from "./clip.js";

/**
 * The operator trace — the kernel's language-neutral IR.
 *
 * A recipe is not a mesh and not code; it is a SERIALIZED SEQUENCE OF EXACT
 * OPERATORS. That indirection is the whole architecture:
 *
 *  - Every scalar is a rational STRING (`"3/4"`, `"-1"`), so the IR carries no
 *    float and re-parses to the same value on every machine. The trace is the
 *    only thing that crosses a boundary; the mesh is a projection of it.
 *  - There is exactly ONE evaluator (`evalTrace`, below), in the compiler. A
 *    front-end — the raw-path `recipe:` Python recorder today, a declarative
 *    kernel shape later — only PRODUCES a trace; it never runs the kernel. So
 *    the author writes ordinary imperative code and the compiler still owns
 *    the geometry, which is what lets it predict the census and adjudicate it.
 *  - The canonical serialization is content-hashed into the existing stage
 *    cache exactly like a build script's bytes, so an unchanged recipe is a
 *    cache hit and a changed one is not — determinism the whole pipeline
 *    already relies on.
 *
 * The opset is deliberately small and extensible: `cage` seeds geometry,
 * `subdivide` and `mirror` transform it. `crease`, `delta` (path-keyed vertex
 * moves — the blendshape opcode) and per-identity attributes (skin weights)
 * are future rows in the same union, needing new opcodes, never a new
 * architecture.
 */

/**
 * A coordinate region — a conjunction of per-axis inclusive rational bounds.
 * A vertex is IN the region when, for every axis a bound is given, its
 * coordinate lies within [min, max]. Exact rational comparison, so a vertex
 * exactly on a bound is deterministically included and the selection is the
 * same on every machine. An axis omitted is unconstrained, so `{}` is the
 * whole mesh and `{ z: ["1", "1"] }` is exactly the plane z = 1.
 */
export interface Region {
  x?: [string, string];
  y?: [string, string];
  z?: [string, string];
}

export type TraceOp =
  | {
      op: "cage";
      /** Each point is three rational strings; welded by exact coordinate. */
      points: Array<[string, string, string]>;
      faces: number[][];
      ids?: string[];
    }
  | { op: "subdivide"; levels: number }
  | { op: "mirror"; axis: 0 | 1 | 2 }
  | {
      /**
       * Cut the mesh by a plane, keeping the half-space `normal·x ≤ d` and
       * capping the cut so the result is still a closed solid — the first
       * CONSTRUCTIVE-SOLID operator. Exact: a vertex's side is the sign of
       * `normal·v − d`, an edge splits at the exact rational crossing, and the
       * cap welds with no tolerance because both faces of a shared edge compute
       * the same point. A single clip chamfers or bevels a corner; a sequence of
       * clips intersects the solid with a convex tool (a box hole, a wedge
       * notch). `normal` (three rational strings) must be non-zero.
       */
      op: "clip";
      normal: [string, string, string];
      d: string;
    }
  | {
      /**
       * Triangulate every face by exact ear-clipping — the author's opt-in fix
       * for a `volume` claim on a non-planar mesh. A curved surface's quads are
       * non-planar, so its enclosed volume depends on which diagonal an exporter
       * picks and the claim stays UNCHECKED. Triangulating bakes ONE valid
       * triangulation in: every face becomes a planar triangle, so the volume is
       * triangulation-independent and becomes a provable property of the shipped
       * asset. Topology-only (no new vertices), so watertightness and genus are
       * invariant; the trade is quad editability. Ear-clipping (not a first-
       * vertex fan) because a fan self-intersects on a concave face.
       */
      op: "triangulate";
    }
  | {
      /**
       * Translate every vertex inside `region` by `offset` (three rational
       * strings). A pure deformation: topology is untouched, so counts,
       * watertightness and genus are invariant and the predicted census still
       * adjudicates. Because subdivision is linear, a delta on a cage
       * propagates to the limit surface EXACTLY (the KILN S·Δ property) — a
       * localized move here composes with a later `subdivide` with no fitting
       * and no residual.
       */
      op: "move";
      region: Region;
      offset: [string, string, string];
    }
  | {
      /**
       * Mark every edge whose BOTH endpoints lie in `region` as infinitely
       * sharp. A later `subdivide` keeps those edges (and the corners where
       * three meet) crisp instead of rounding them — the difference between a
       * subdivided box that melts toward a sphere and one that keeps a flat
       * base or hard rim. Creases propagate through subdivision.
       */
      op: "crease";
      region: Region;
    }
  | {
      /**
       * Scale the vertices in `region` about `pivot` by a per-axis `factor`:
       * v -> pivot + factor .* (v - pivot). The multiplicative sibling of
       * `move` — taper, bulge, or squash a region. Exact and topology-
       * preserving, like every deformation here.
       */
      op: "scale";
      region: Region;
      factor: [string, string, string];
      pivot: [string, string, string];
    }
  | {
      /**
       * Grow the faces whose every vertex is in `region` outward by `offset`
       * (a rational vector — no normal, so it stays exact): the selected faces
       * lift to a raised top and the region's boundary is walled. The first
       * operator that adds topology (a bump, a boss, a socket) rather than
       * refining or deforming it.
       */
      op: "extrude";
      region: Region;
      offset: [string, string, string];
    }
  | {
      /**
       * Inset the faces in `region` by `factor` (a rational): a shrunk inner
       * copy of each face ringed back to its border — a panel, a frame, a
       * recessed detail. The complement of extrude; `factor` in (0,1) insets,
       * > 1 outsets.
       */
      op: "inset";
      region: Region;
      factor: string;
    }
  | {
      /**
       * Begin recording a named morph target (blendshape). Everything up to
       * the matching `endShape` deforms a COPY of the current base with
       * `move`/`scale` only; the difference is the shape. Because subdivision
       * is linear, a delta authored on the cage here propagates to the limit
       * surface EXACTLY (the KILN S·Δ property) — author tens of numbers per
       * shape, not tens of thousands. Only meaningful through
       * `evalTraceShapes`.
       */
      op: "shape";
      name: string;
    }
  | { op: "endShape" };

export interface Trace {
  version: 1;
  ops: TraceOp[];
}

/* ------------------------------------------------------------------ */
/* Work meter — the ONE runaway guard (no arbitrary count caps)        */
/* ------------------------------------------------------------------ */

/**
 * The default evaluation work budget, in abstract WORK UNITS (one unit ≈ one
 * vertex or face produced/processed — a memory-proportional measure). This is
 * NOT a cap on how large an asset may be; it is a resource-denominated guard
 * sized so only a genuine RUNAWAY trips it — an accidental `subdivide(1000000)`,
 * an infinite `while` in a recipe — never a legitimately large model. A very
 * detailed real asset is single-digit millions of units; this default clears
 * ~10× that, at roughly the geometry that fills a few GB of RAM, so the meter
 * fires (with a diagnostic) before the machine would OOM. Overridable per
 * compile via `EvalOptions.workBudget` for a bigger machine and a bigger asset —
 * a wall you can raise is a resource negotiation, not a refusal.
 *
 * Determinism holds in the strong form the kernel needs: the meter is a pure
 * function of the trace and the budget (no clock, no machine state), so
 * same recipe + same budget → same bytes, or the same failure at the same op
 * with the same message, on every machine. A legitimate recipe never trips it,
 * so its output is byte-identical regardless of the budget.
 *
 * The unit is calibrated for the EXACT kernel: a vertex carries three arbitrary-
 * precision rationals (~hundreds of bytes), so a couple of million units is
 * already ~a GB of live geometry. The default is generous for any real recipe (a
 * richly subdivided hull is tens to low hundreds of thousands of faces — well
 * under this), yet low enough that the meter fires with a diagnostic before a
 * modest machine would OOM, and — because subdivide is metered BEFORE each level
 * is built — the largest intermediate a runaway allocates before tripping stays
 * small. Raise it for a bigger asset on a bigger machine.
 */
export const DEFAULT_WORK_BUDGET = 2_000_000;

export interface EvalOptions {
  /** Work-unit budget for this evaluation (default {@link DEFAULT_WORK_BUDGET}).
   *  Raise it to build a larger asset on a machine with the memory for it. */
  workBudget?: number;
  /** Cooperative cancellation: polled at every work-meter checkpoint (which
   *  fire BEFORE each expensive grow — e.g. once per subdivide level), so a
   *  long evaluation can be abandoned promptly without a wall-clock cap. When it
   *  returns true the evaluator throws {@link EvalCancelledError}. This is the
   *  ONLY way to interrupt the synchronous exact-arithmetic loop; a message can't
   *  reach it until it yields, which it never does mid-evaluation. */
  shouldCancel?: () => boolean;
}

/** Thrown when a trace's cumulative work exceeds the budget — a runaway, not a
 *  size cap. Carries the op that tipped it over so the report can point at it. */
export class WorkBudgetError extends Error {
  constructor(
    readonly opIndex: number,
    readonly opKind: string,
    readonly spent: number,
    readonly budget: number,
  ) {
    super(
      `evalTrace: op ${opIndex} '${opKind}' pushed the recipe's work to ${spent} units, past the ${budget} budget — this reads as a runaway (an accidental loop or an absurd subdivide/grid). If the asset is genuinely this large, raise the compile's workBudget; otherwise check the op that exploded.`,
    );
    this.name = "WorkBudgetError";
  }
}

/** Thrown when a caller cancels the evaluation (see {@link EvalOptions.shouldCancel}).
 *  Distinct from every domain failure: it means "the caller walked away", not
 *  "the recipe is wrong", so the pipeline re-throws it rather than reporting an
 *  issue against the author's scene. */
export class EvalCancelledError extends Error {
  constructor(
    readonly opIndex: number,
    readonly opKind: string,
  ) {
    super(`evalTrace: cancelled at op ${opIndex} '${opKind}'`);
    this.name = "EvalCancelledError";
  }
}

interface WorkMeter {
  spent: number;
  budget: number;
  shouldCancel?: () => boolean;
}

/** A caller's budget, sanitised: a finite POSITIVE number, else the default. A
 *  NaN/Infinity/≤0 budget must NOT be honoured — it would silently disable the
 *  one runaway guard (`spent > NaN` is always false; Infinity is never exceeded).
 *  To build a genuinely larger asset, raise the budget to a big FINITE number. */
function resolveBudget(workBudget: number | undefined): number {
  return typeof workBudget === "number" && Number.isFinite(workBudget) && workBudget > 0
    ? workBudget
    : DEFAULT_WORK_BUDGET;
}

/** Charge `units` of work and throw if the running total passes the budget.
 *  The single guard that replaces every domain-count cap. */
function charge(meter: WorkMeter, units: number, opIndex: number, opKind: string): void {
  // Cancellation shares the meter's checkpoint: it fires before every grow, so
  // a cancelled deep subdivide stops between levels without ever building the
  // next one. Cheap (a bool read) and keeps the one hot path single-purpose.
  if (meter.shouldCancel?.()) throw new EvalCancelledError(opIndex, opKind);
  meter.spent += units;
  if (meter.spent > meter.budget) throw new WorkBudgetError(opIndex, opKind, meter.spent, meter.budget);
}

/**
 * Bit-length of a bigint's magnitude — a cheap proxy for arithmetic cost.
 *
 * Two properties this guard needs: allocation-free on the COMMON path (a coord
 * numerator/denominator that fits in 32 bits — box corners, short fractions — is
 * the overwhelming majority, and `coordComplexity` now reads EVERY vertex, so a
 * per-call string allocation would dominate), and LINEAR (never O(bits²)) on the
 * rare deep coordinate. A repeated 32-bit bigint shift-loop would be O(bits²);
 * base-2 `toString` is O(bits) in V8 (a power-of-two base needs no division), so
 * a pathologically deep coord costs the meter O(bits) — bounded by what it
 * already cost to BUILD that coord, which was itself metered.
 */
const bitLen = (x: bigint): number => {
  const v = x < 0n ? -x : x;
  if (v <= 0n) return 0;
  if (v <= 0xffffffffn) return 32 - Math.clz32(Number(v));
  return v.toString(2).length;
};

/**
 * Exact integer ⌈log₂ n⌉ for n ≥ 1 — no `Math.log2`, whose last-ULP result is
 * not guaranteed bit-identical across libm implementations. The meter is
 * documented as identical on every machine; a transcendental in it could flip a
 * charge sitting exactly on a budget boundary from pass to `WorkBudgetError`.
 * n here is a face's vertex count (small), so the loop is trivial.
 */
const ceilLog2 = (n: number): number => {
  let bits = 0;
  let v = 1;
  while (v < n) {
    v *= 2;
    bits++;
  }
  return bits;
};

/**
 * A coordinate-complexity multiplier for the work charge, ≥ 1. The unit "1 ≈ one
 * element" assumes SMALL-coordinate arithmetic; but exact rationals grow in
 * bit-length as a recipe compounds fractions (repeated `scale(1/3)` drives the
 * denominator to 3ᵏ), and arithmetic on B-bit rationals costs ~O(B). Element
 * COUNT alone stays flat under such an op, so without this factor a
 * bit-length-exploding runaway would spend real seconds while reading as "under
 * budget".
 *
 * Reads EVERY vertex's bit-length, not a stride sample. An earlier version
 * sampled every ⌊n/32⌋-th coordinate; a red-team proved the blindspot — a
 * region-selected op (`scale`/`move` on a `y`-band) can drive only the UNSAMPLED
 * vertices to 10^300 while the sampler reads ~1, so wall-clock went quadratic
 * while `spent` stayed linear and "under budget". A subset-deep coordinate is
 * exactly the adversarial shape, so the scan must be exhaustive. `bitLen` is
 * allocation-free for the common small coord, so the full scan is cheap for the
 * uniform-small meshes that dominate and only grows costly when coordinates
 * genuinely have (making the honest cost the thing being charged). Deliberately
 * GENTLE (÷32): ordinary small-integer/short-fraction meshes read ~1, so it
 * never penalises a legitimate large asset — it rises only when coordinates
 * themselves have exploded, at ANY index.
 *
 * The exhaustive scan is O(Σ vertex bit-length) per call, and that is bounded by
 * the budget, not unbounded: reaching a mesh of size S at depth D bits already
 * cost the meter ~S·D/32 ≤ budget (the ops that built it), so any later scan is
 * O(S·D) ≤ 32·budget — the same order as the op's own charge. Total scanning
 * across an evaluation is therefore within a constant factor of the metered work
 * (a deliberate constant, not a runaway; an incremental maxCoordBits carried on
 * the mesh could make it O(1) but would spread the fact across every producer).
 * Cancellation stays per-op (polled at the top of applyOp), the existing grain.
 */
function coordComplexity(m: KernelMesh): number {
  const n = m.verts.length;
  if (n === 0) return 1;
  let maxBits = 1;
  for (let i = 0; i < n; i++) {
    const v = m.verts[i]!;
    const b = bitLen(v[0].n) + bitLen(v[0].d) + bitLen(v[1].n) + bitLen(v[1].d) + bitLen(v[2].n) + bitLen(v[2].d);
    if (b > maxBits) maxBits = b;
  }
  return Math.max(1, Math.round(maxBits / 32));
}

/** The work a mesh contributes: its size (verts + faces) scaled by how expensive
 *  its coordinates are to compute with (bit-length). */
const meshWork = (m: KernelMesh): number => (m.verts.length + m.faces.length) * coordComplexity(m);

/** Mesh size scaled by an EXPLICIT complexity — used where an op's own
 *  parameters may be deeper than the input mesh's coordinates. */
const meshWorkCC = (m: KernelMesh, cc: number): number => (m.verts.length + m.faces.length) * cc;

/** The rational-string bounds of a region, flattened — parameters the op parses
 *  and compares against every vertex, so their bit-length is a real cost. */
const regionStrings = (r: Region): string[] =>
  [r.x, r.y, r.z].flatMap((b) => (b ? [b[0]!, b[1]!] : []));

/**
 * A complexity multiplier (≥1, same ÷32 currency as {@link coordComplexity})
 * for an op's OWN rational-string parameters — a `move` offset, a `scale`
 * factor/pivot, a `clip` plane, region bounds.
 *
 * The sampled-scan gap was one axis of the meter's blindness; the PARAMETER axis
 * is the other, and the required reviewer found it. Every param-bearing op
 * parses these strings and does arithmetic with them across the mesh, so a giant
 * parameter (a 10⁵-digit factor, a deep clip normal) costs real O(digits) parse
 * plus per-vertex BigInt work that the INPUT mesh's coordinates never reveal — a
 * shallow box scaled by an astronomical factor gets a shallow charge, and if
 * that op is the last (or alternates back to shallow so no later op's
 * coordComplexity sees the depth) the work is never metered. Charged from string
 * LENGTH (no parse needed — a decimal digit is < 4 bits, so `len·4` is a safe
 * over-estimate of the parse's bit cost), folded into the op's up-front charge
 * BEFORE the giant parse runs.
 *
 * SUMS each parameter's cost, not the max: an op parses and computes with EVERY
 * one of its parameters (scale touches six factor/pivot strings plus up to six
 * region bounds), so six giant parameters are six times the work, not one
 * (reviewer risk finding). Returns the RAW sum, which is 0 for anything whose
 * parameters are all under 8 characters — so it is ADDED to the mesh's own
 * coordinate complexity at the call site: an op like `scale` or `clip`
 * multiplies a parameter INTO each coordinate (factor·coord, normal·coord), so
 * the exact-arithmetic bit-length is the SUM of the two depths, not their max
 * (reviewer risk finding). Because the sum is 0 for ordinary short parameters,
 * a normal recipe adds nothing and its charge is exactly the mesh term.
 */
const paramUnits = (...strings: Array<string | undefined>): number => {
  let units = 0;
  for (const s of strings) if (s) units += Math.floor((s.length * 4) / 32);
  return units;
};

/* ------------------------------------------------------------------ */
/* The one evaluator                                                   */
/* ------------------------------------------------------------------ */

/**
 * Replay a trace into an exact mesh. Pure: no I/O, no Blender, no float until
 * a caller asks for one. A trace must begin by establishing geometry (a
 * `cage`); a transform before any geometry is a malformed recipe, reported
 * rather than guessed.
 */
export function evalTrace(trace: Trace, opts: EvalOptions = {}): KernelMesh {
  if (trace.version !== 1) {
    throw new Error(`evalTrace: unsupported trace version ${trace.version}`);
  }
  const meter: WorkMeter = {
    spent: 0,
    budget: resolveBudget(opts.workBudget),
    ...(opts.shouldCancel ? { shouldCancel: opts.shouldCancel } : {}),
  };
  let mesh: KernelMesh | null = null;
  trace.ops.forEach((op, i) => {
    if (op.op === "shape" || op.op === "endShape") {
      throw new Error(`evalTrace: op ${i} '${op.op}' — morph targets need evalTraceShapes`);
    }
    mesh = applyOp(op, mesh, i, meter);
  });
  if (!mesh) throw new Error("evalTrace: empty trace produced no geometry");
  return mesh;
}

/** Apply one geometry op to the current mesh (null only before the seeding
 *  `cage`), charging its work against the meter. The single place every op's
 *  exact semantics live, shared by `evalTrace` and `evalTraceShapes`. */
function applyOp(op: TraceOp, mesh: KernelMesh | null, i: number, meter: WorkMeter): KernelMesh {
  const need = (): KernelMesh => {
    if (!mesh) throw new Error(`evalTrace: op ${i} '${op.op}' before any geometry`);
    return mesh;
  };
  // Poll cancellation ONCE per op, before it runs. Some ops (extrude, inset)
  // build their result and only THEN charge, so the in-`charge` checkpoint alone
  // would let a large op finish before it could stop; checking here interrupts
  // before any op executes. The per-charge check still adds finer granularity
  // INSIDE multi-level ops (subdivide charges — and so polls — before each level).
  if (meter.shouldCancel?.()) throw new EvalCancelledError(i, op.op);
  switch (op.op) {
    case "cage": {
      // Charge the cage BEFORE parsing: its element count PLUS the total length of
      // the coordinate strings, since parsing an arbitrary-precision rational is
      // ~O(digits) — so a small cage carrying a few million-digit coordinates
      // (expensive BigInt parsing) is charged for that work, not just its 3 points.
      let coordText = 0;
      for (const p of op.points) coordText += p[0].length + p[1].length + p[2].length;
      charge(meter, op.points.length + op.faces.length + coordText, i, "cage");
      const points: RVec3[] = op.points.map((p) => [Rational.parse(p[0]), Rational.parse(p[1]), Rational.parse(p[2])]);
      return meshOf(points, op.faces, op.ids);
    }
    case "subdivide": {
      const m = need();
      if (!Number.isInteger(op.levels) || op.levels < 0) {
        throw new Error(`evalTrace: op ${i} 'subdivide' levels must be a non-negative integer`);
      }
      // Meter each level BEFORE building it: a Catmull-Clark level turns every
      // k-sided face into k quads, so the next level's face count is exactly the
      // current sum of sides — cheap to predict. Charging that up front means an
      // accidental subdivide(1000000) trips the budget after a dozen cheap levels
      // with a diagnostic, never allocating the explosive level (no OOM), while
      // any realistic subdivision passes freely.
      let sub = m;
      for (let lvl = 0; lvl < op.levels; lvl++) {
        const nextFaces = sub.faces.reduce((a, f) => a + f.length, 0);
        // ≈ verts_out + faces_out, scaled by the current coordinate complexity
        // (CC deepens the rationals a little each level, so per-element cost rises).
        charge(meter, (nextFaces + sub.verts.length + nextFaces) * coordComplexity(sub), i, "subdivide");
        sub = subdivideCatmullClark(sub);
      }
      return sub;
    }
    case "mirror": {
      const m = need();
      // Mirror doubles the mesh — predictable, so charge 2× the input BEFORE
      // building either copy: a runaway trips before the doubled arrays exist.
      charge(meter, 2 * meshWork(m), i, "mirror");
      return mirror(m, op.axis);
    }
    case "triangulate": {
      const m = need();
      // Charge the TRUE cost BEFORE running it: the monotone sweep triangulates
      // an n-gon in O(n log n) exact-rational work, so Σ n·log₂n over faces is
      // the topology term — work ≈ output, so a realistic face is cheap and even a
      // huge face is bounded (no O(n²) corner to stall on). Scale by
      // `coordComplexity` like every other grower: each rational predicate costs
      // ~O(coordinate bit length), so a mesh with deep coordinates (a chain of
      // `scale(1/3)`) pays for its arithmetic, not just its topology.
      const triTopology = m.faces.reduce(
        (a, f) => a + f.length * Math.max(1, ceilLog2(f.length)),
        0,
      );
      charge(meter, triTopology * coordComplexity(m), i, "triangulate");
      return triangulate(m);
    }
    case "clip": {
      const m = need();
      // Validate the payload SHAPE first — a directly-constructed trace (a test,
      // a future front-end that does not flow through recipe.ts) gets a NAMED
      // error, never an opaque `undefined.split` out of Rational.parse. This must
      // precede the parameter charge so a malformed payload's error does not
      // depend on its length or the remaining budget (reviewer warn).
      if (
        !Array.isArray(op.normal) ||
        op.normal.length !== 3 ||
        !op.normal.every((c) => typeof c === "string") ||
        typeof op.d !== "string"
      ) {
        throw new Error(`evalTrace: op ${i} 'clip' needs normal:[x,y,z] and d, all rational strings`);
      }
      // Meter BEFORE parsing — the parse of a giant rational (BigInt build +
      // `bgcd` normalize, plain Euclid → super-linear on deep integers) is real
      // unmetered CPU otherwise (reviewer risk). cc folds the plane's own
      // string-length depth in (additive), uniform with move/scale/extrude. clip runs
      // exact rational dot/crossingPoint per vertex and per straddling edge, so
      // per-corner cost is O(coordinate bit length); the cap ear-clip (~O(L²) per
      // cross-section loop) is charged as each loop forms — a grazing cut that
      // makes a huge cap trips the meter, not just the linear output.
      //
      // Consequence, BY DESIGN: a normal plane charges ~faceSum·1 and still
      // reaches its non-zero-normal check below; only an adversarially-GIANT
      // literal is resource-rejected before that value check. The meter must see
      // every parse, and the validity of a giant literal is not worth an
      // unmetered one — a normal zero normal still gets its named error.
      // One-time parse (mesh-independent) + per-corner arithmetic (additive: clip
      // multiplies normal INTO each coordinate — dot products, crossing divisions
      // — so per-corner cost is coord + plane depth). Both reviewer risks.
      const pu = paramUnits(op.normal[0], op.normal[1], op.normal[2], op.d);
      const cc = coordComplexity(m) + pu;
      charge(meter, pu + m.faces.reduce((a, f) => a + f.length, 0) * cc, i, "clip");
      const normal: RVec3 = [Rational.parse(op.normal[0]!), Rational.parse(op.normal[1]!), Rational.parse(op.normal[2]!)];
      if (normal[0].isZero() && normal[1].isZero() && normal[2].isZero()) {
        throw new Error(`evalTrace: op ${i} 'clip' needs a non-zero normal — a plane has a direction`);
      }
      const plane: Plane = { normal, d: Rational.parse(op.d) };
      const out = clip(m, plane, (loopLength) => charge(meter, loopLength * loopLength * cc, i, "clip"));
      return out;
    }
    case "move": {
      const m = need();
      // Two costs: the one-time parameter PARSE (mesh-size independent — a giant
      // literal is parsed once whether the mesh has a million vertices or none,
      // so charging it × mesh size would let an empty/tiny mesh slip the parse;
      // reviewer risk) plus the per-element ARITHMETIC (additive: when both the
      // mesh coordinate and the region comparison are deep the cost is their sum,
      // not their max; reviewer risk).
      const pu = paramUnits(op.offset[0], op.offset[1], op.offset[2], ...regionStrings(op.region));
      charge(meter, pu + meshWorkCC(m, coordComplexity(m) + pu), i, "move");
      const region = parseRegion(op.region);
      const dx = Rational.parse(op.offset[0]);
      const dy = Rational.parse(op.offset[1]);
      const dz = Rational.parse(op.offset[2]);
      const verts: RVec3[] = m.verts.map((v) =>
        inRegion(v, region) ? [v[0].add(dx), v[1].add(dy), v[2].add(dz)] : v,
      );
      return { ...m, verts };
    }
    case "crease": {
      const m = need();
      const pu = paramUnits(...regionStrings(op.region));
      charge(meter, pu + meshWorkCC(m, coordComplexity(m) + pu), i, "crease");
      const region = parseRegion(op.region);
      const marked = new Set<string>(m.creases ?? []);
      for (const e of edgesOf(m).values()) {
        if (inRegion(m.verts[e.a]!, region) && inRegion(m.verts[e.b]!, region)) marked.add(edgeKey(e.a, e.b));
      }
      return { ...m, creases: marked };
    }
    case "extrude": {
      const m = need();
      // extrude/inset charge their OUTPUT (its size isn't predictable up front),
      // so a giant offset would run its deep parse + per-vertex arithmetic BEFORE
      // any charge. Guard the parameter bit-length up front (only when it is
      // genuinely deep, so a normal recipe is unaffected). Charge over verts PLUS
      // face-corners: the inRegion predicate walks every face corner (which can
      // exceed the vertex count), and a giant region bound that selects no faces
      // leaves the output shallow, so the post-build meshWork(out) cannot recover
      // this cost (reviewer risk finding).
      const pu = paramUnits(op.offset[0], op.offset[1], op.offset[2], ...regionStrings(op.region));
      if (pu > 0) {
        // Flat one-time parse (mesh-independent, so an empty/faceless mesh cannot
        // slip a giant parse) + the per-corner region scan.
        const corners = m.faces.reduce((a, f) => a + f.length, 0);
        charge(meter, pu + (m.verts.length + corners) * pu, i, "extrude");
      }
      const region = parseRegion(op.region);
      const off: RVec3 = [Rational.parse(op.offset[0]), Rational.parse(op.offset[1]), Rational.parse(op.offset[2])];
      const out = extrude(m, (v) => inRegion(v, region), off);
      charge(meter, meshWork(out), i, "extrude");
      return out;
    }
    case "inset": {
      const m = need();
      // Meter BEFORE parsing the factor — a giant rational's parse (BigInt +
      // `bgcd`) is unmetered CPU otherwise (reviewer risk). Over verts +
      // face-corners: the inRegion scan can exceed the vertex count, and a giant
      // region bound selecting no faces leaves the output shallow so meshWork(out)
      // cannot recover it. A normal factor charges ~0 and still reaches its
      // positive-check below; only a giant literal is resource-rejected first.
      const pu = paramUnits(op.factor, ...regionStrings(op.region));
      if (pu > 0) {
        // Flat one-time parse (mesh-independent) + the per-corner region scan.
        const corners = m.faces.reduce((a, f) => a + f.length, 0);
        charge(meter, pu + (m.verts.length + corners) * pu, i, "inset");
      }
      const region = parseRegion(op.region);
      const factor = Rational.parse(op.factor);
      if (factor.cmp(Rational.ZERO) <= 0) throw new Error(`evalTrace: op ${i} 'inset' factor must be positive`);
      const out = inset(m, (v) => inRegion(v, region), factor);
      charge(meter, meshWork(out), i, "inset");
      return out;
    }
    case "scale": {
      const m = need();
      // A shallow mesh scaled by an astronomical factor is the reviewer's Block
      // case: the factor's parse + per-vertex multiply is real work the input
      // mesh's complexity cannot see, and a lone/alternating scale never lets a
      // later op's coordComplexity catch the resulting depth. Fold the parameters
      // into the up-front charge, BEFORE parsing them.
      // One-time parse (mesh-independent) + per-element arithmetic (additive:
      // scale multiplies factor INTO each coordinate, so bit-length is coord +
      // factor, not their max). Both reviewer risks.
      const pu = paramUnits(
        op.factor[0], op.factor[1], op.factor[2],
        op.pivot[0], op.pivot[1], op.pivot[2],
        ...regionStrings(op.region),
      );
      charge(meter, pu + meshWorkCC(m, coordComplexity(m) + pu), i, "scale");
      const region = parseRegion(op.region);
      const f: RVec3 = [Rational.parse(op.factor[0]), Rational.parse(op.factor[1]), Rational.parse(op.factor[2])];
      const p: RVec3 = [Rational.parse(op.pivot[0]), Rational.parse(op.pivot[1]), Rational.parse(op.pivot[2])];
      const verts: RVec3[] = m.verts.map((v) =>
        inRegion(v, region)
          ? [p[0].add(f[0].mul(v[0].sub(p[0]))), p[1].add(f[1].mul(v[1].sub(p[1]))), p[2].add(f[2].mul(v[2].sub(p[2])))]
          : v,
      );
      return { ...m, verts };
    }
    default: {
      const bad = op as { op: string };
      throw new Error(`evalTrace: op ${i} unknown op '${bad.op}'`);
    }
  }
}

export interface ShapeResult {
  name: string;
  mesh: KernelMesh;
}

/**
 * Evaluate a trace WITH morph targets: a base mesh plus every named shape.
 *
 * A `shape(name)` ... `endShape` bracket deforms a COPY of the current base
 * with `move`/`scale` only (a morph may reposition vertices, never change
 * topology), and every GLOBAL op outside a bracket applies to the base AND
 * each shape alike — so they stay in lockstep topology, and a delta authored
 * before a `subdivide` propagates to the limit surface exactly. Each shape's
 * mesh therefore shares the base's vertex order, and the blendshape is the
 * per-vertex difference.
 */
export function evalTraceShapes(
  trace: Trace,
  opts: EvalOptions = {},
): { base: KernelMesh; shapes: ShapeResult[] } {
  if (trace.version !== 1) {
    throw new Error(`evalTraceShapes: unsupported trace version ${trace.version}`);
  }
  const meter: WorkMeter = {
    spent: 0,
    budget: resolveBudget(opts.workBudget),
    ...(opts.shouldCancel ? { shouldCancel: opts.shouldCancel } : {}),
  };
  let base: KernelMesh | null = null;
  const shapes: ShapeResult[] = [];
  let recording: string | null = null;
  let variant: KernelMesh | null = null;
  trace.ops.forEach((op, i) => {
    if (op.op === "shape") {
      if (recording !== null) throw new Error(`evalTraceShapes: op ${i} shape '${op.name}' inside shape '${recording}'`);
      if (!base) throw new Error(`evalTraceShapes: op ${i} shape before any geometry`);
      if (typeof op.name !== "string" || op.name.length === 0) throw new Error(`evalTraceShapes: op ${i} shape needs a name`);
      if (shapes.some((s) => s.name === op.name)) throw new Error(`evalTraceShapes: op ${i} duplicate shape '${op.name}'`);
      recording = op.name;
      variant = base;
      return;
    }
    if (op.op === "endShape") {
      if (recording === null) throw new Error(`evalTraceShapes: op ${i} endShape without an open shape`);
      shapes.push({ name: recording, mesh: variant! });
      recording = null;
      variant = null;
      return;
    }
    if (recording !== null) {
      if (op.op !== "move" && op.op !== "scale") {
        throw new Error(
          `evalTraceShapes: op ${i} only move/scale are allowed inside shape '${recording}' (got '${op.op}') — a morph target repositions vertices, it cannot change topology`,
        );
      }
      variant = applyOp(op, variant, i, meter);
    } else {
      // Once a shape exists, only ops that keep the base and every morph in
      // LOCKSTEP may run globally: `subdivide` (Catmull-Clark connectivity is a
      // pure function of the face list, not positions, so base and shapes get the
      // same topology) and `triangulate`. `mirror` (exact-coordinate weld),
      // `extrude`/`inset` (region selection on coordinates), `move`/`scale`/
      // `crease` (region selection) all decide something from geometry, so a
      // deformed shape would diverge from the base — silently mismatching vertex
      // counts or crease sets (both red-teams found this). Author them BEFORE the
      // first shape, or inside the shape bracket.
      if (shapes.length > 0 && op.op !== "subdivide" && op.op !== "triangulate") {
        throw new Error(
          `evalTraceShapes: op ${i} '${op.op}' cannot run globally once a shape exists — only 'subdivide' and 'triangulate' stay in lockstep with every morph target; do region/mirror/extrude/inset ops before the first shape`,
        );
      }
      base = applyOp(op, base, i, meter);
      if (op.op === "triangulate") {
        // Ear-clipping is coordinate-DEPENDENT (its diagonal choice reads vertex
        // positions), so re-running it on each morph could pick a different
        // diagonal and diverge the shapes' face lists from the base's. A
        // blendshape set REQUIRES one shared topology (base mesh + per-vertex
        // deltas), so the base's triangulation is applied verbatim to every shape
        // — they share its vertex indexing, so its face list is a valid index
        // partition of each. That shared triangulation is chosen for the base's
        // geometry, not re-optimised per morph (an extreme morph could make a
        // shared diagonal self-cross in that shape's positions — inherent to a
        // fixed-topology blendshape, and moot here: shape faces carry only the
        // topology, the morph itself is the vertex deltas, which stay untouched).
        // Charge the per-shape face-list copies (shapes × base faces) — real work
        // the meter must see, or many morph targets could allocate past the budget.
        charge(meter, shapes.length * base.faces.length, i, "triangulate");
        for (const s of shapes) s.mesh = { ...s.mesh, faces: base.faces.map((f) => [...f]) };
      } else {
        for (const s of shapes) s.mesh = applyOp(op, s.mesh, i, meter);
      }
    }
  });
  if (recording !== null) throw new Error(`evalTraceShapes: shape '${recording}' was never closed with endShape`);
  if (base === null) throw new Error("evalTraceShapes: empty trace produced no geometry");
  const finalBase: KernelMesh = base;
  // Defense in depth: every morph target MUST share the base's vertex count, or
  // the shape-key write downstream would truncate or overrun.
  for (const s of shapes) {
    if (s.mesh.verts.length !== finalBase.verts.length) {
      throw new Error(
        `evalTraceShapes: shape '${s.name}' has ${s.mesh.verts.length} vertices but the base has ${finalBase.verts.length} — a morph target must stay in lockstep with the base`,
      );
    }
  }
  return { base: finalBase, shapes };
}

interface ParsedRegion {
  x?: [Rational, Rational];
  y?: [Rational, Rational];
  z?: [Rational, Rational];
}

function parseRegion(region: Region): ParsedRegion {
  const axis = (b: [string, string] | undefined): [Rational, Rational] | undefined =>
    b ? [Rational.parse(b[0]), Rational.parse(b[1])] : undefined;
  const out: ParsedRegion = {};
  const x = axis(region.x);
  const y = axis(region.y);
  const z = axis(region.z);
  if (x) out.x = x;
  if (y) out.y = y;
  if (z) out.z = z;
  return out;
}

/** A vertex is in the region when every present axis-bound contains it —
 *  inclusive, exact rational comparison. */
function inRegion(v: RVec3, region: ParsedRegion): boolean {
  const bounds = [region.x, region.y, region.z] as const;
  for (let i = 0; i < 3; i++) {
    const b = bounds[i];
    if (!b) continue;
    if (v[i]!.cmp(b[0]) < 0 || v[i]!.cmp(b[1]) > 0) return false;
  }
  return true;
}

/** A trace's exact mesh AND the census predicted from it — the two projections
 *  of one exact object the pipeline hands forward (geometry to emit, census to
 *  adjudicate as a claim). */
export function evalTraceWithCensus(trace: Trace): { mesh: KernelMesh; census: PredictedCensus } {
  const mesh = evalTrace(trace);
  return { mesh, census: predictCensus(mesh, { mass: true }) };
}

/* ------------------------------------------------------------------ */
/* Canonical serialization + content hash                              */
/* ------------------------------------------------------------------ */

/** Deterministic JSON: object keys sorted recursively, so the SAME trace is
 *  the SAME bytes regardless of how a producer happened to order fields. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(",");
  return `{${body}}`;
}

export function canonicalize(trace: Trace): string {
  return canonicalJson(trace);
}

/** 64-bit FNV-1a over the canonical bytes, hex — a stable content id for the
 *  stage cache. Not cryptographic; it only has to be collision-free enough to
 *  key a cache and identical on every machine. */
export function traceHash(trace: Trace): string {
  const s = canonicalize(trace);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ BigInt(s.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/* ------------------------------------------------------------------ */
/* The recording ctx — a trace producer                               */
/* ------------------------------------------------------------------ */

/**
 * The reference recording context: the verbs an author calls, each APPENDING
 * an exact op rather than performing it. This TS class is the contract the
 * solve-time Python `ctx` mirrors verb-for-verb — the author writes ordinary
 * imperative code (loops, helpers, halves-then-mirror) and what comes out is a
 * trace, which the compiler alone evaluates.
 *
 * Coordinates are given as rational strings or integers, never floats, so the
 * recipe is exact from the first keystroke; `box`/`grid` mint their cages in
 * exact rationals for the common seeds.
 */
export type Coord = string | number | Rational;

const coordStr = (c: Coord): string =>
  c instanceof Rational ? c.toString() : typeof c === "number" ? Rational.of(c).toString() : Rational.parse(c).toString();

export class Recorder {
  private readonly ops: TraceOp[] = [];

  private pushOp(op: TraceOp): void {
    this.ops.push(op);
  }

  /** Seed arbitrary geometry. Points are welded by exact coordinate. */
  cage(points: Array<[Coord, Coord, Coord]>, faces: number[][], ids?: string[]): this {
    this.pushOp({
      op: "cage",
      points: points.map((p) => [coordStr(p[0]), coordStr(p[1]), coordStr(p[2])]),
      faces: faces.map((f) => [...f]),
      ...(ids ? { ids: [...ids] } : {}),
    });
    return this;
  }

  /** The unit cube cage centred at the origin — the canonical CC seed. */
  box(half: Coord = 1): this {
    const h = coordStr(half);
    const n = Rational.parse(h).neg().toString();
    const c = (x: string, y: string, z: string): [Coord, Coord, Coord] => [x, y, z];
    return this.cage(
      [
        c(n, n, n), c(h, n, n), c(h, h, n), c(n, h, n),
        c(n, n, h), c(h, n, h), c(h, h, h), c(n, h, h),
      ],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
    );
  }

  /** An nx×ny flat quad grid in the z=0 plane, centred, spanning `size` — an
   *  open patch for terrains, panels, or a mirror/crease base. Pure sugar over
   *  `cage` (exact rational coordinates), so it needs no new opcode. */
  grid(nx: number, ny: number, size: Coord = 1): this {
    if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1) {
      throw new Error("grid(nx, ny): nx and ny must be positive integers");
    }
    const s = size instanceof Rational ? size : typeof size === "number" ? Rational.of(size) : Rational.parse(size);
    const half = s.div(Rational.of(2));
    const dx = s.div(Rational.of(nx));
    const dy = s.div(Rational.of(ny));
    const pts: Array<[Coord, Coord, Coord]> = [];
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        pts.push([dx.mul(Rational.of(i)).sub(half), dy.mul(Rational.of(j)).sub(half), Rational.ZERO]);
      }
    }
    const idx = (i: number, j: number): number => j * (nx + 1) + i;
    const faces: number[][] = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) faces.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
    }
    return this.cage(pts, faces);
  }

  subdivide(levels = 1): this {
    this.pushOp({ op: "subdivide", levels });
    return this;
  }

  mirror(axis: 0 | 1 | 2): this {
    this.pushOp({ op: "mirror", axis });
    return this;
  }

  /** Cut the mesh by a plane, keeping the half-space `normal·x ≤ d` and capping
   *  the cut so the solid stays closed — a chamfer, a bevel, a flat facet; chain
   *  clips to intersect with a convex tool. `normal` is any non-zero exact
   *  direction; `d` the exact plane offset. */
  clip(normal: [Coord, Coord, Coord], d: Coord): this {
    this.pushOp({
      op: "clip",
      normal: [coordStr(normal[0]), coordStr(normal[1]), coordStr(normal[2])],
      d: coordStr(d),
    });
    return this;
  }

  /** Triangulate every face by exact ear-clipping — the opt-in fix that makes a
   *  `volume` claim provable on a non-planar (curved/subdivided) mesh by making
   *  every face planar, so the volume is triangulation-independent. Topology-only;
   *  trades quad editability. */
  triangulate(): this {
    this.pushOp({ op: "triangulate" });
    return this;
  }

  /** Translate the vertices in a coordinate region by an offset — an exact,
   *  topology-preserving deformation. Bounds and offset are exact (ints,
   *  rational strings, or Fractions). */
  move(
    region: { x?: [Coord, Coord]; y?: [Coord, Coord]; z?: [Coord, Coord] },
    offset: [Coord, Coord, Coord],
  ): this {
    const bound = (b: [Coord, Coord] | undefined): [string, string] | undefined =>
      b ? [coordStr(b[0]), coordStr(b[1])] : undefined;
    const r: Region = {};
    const x = bound(region.x);
    const y = bound(region.y);
    const z = bound(region.z);
    if (x) r.x = x;
    if (y) r.y = y;
    if (z) r.z = z;
    this.pushOp({
      op: "move",
      region: r,
      offset: [coordStr(offset[0]), coordStr(offset[1]), coordStr(offset[2])],
    });
    return this;
  }

  /** Mark every edge with both endpoints in a coordinate region as sharp, so a
   *  later subdivide keeps it crisp. */
  crease(region: { x?: [Coord, Coord]; y?: [Coord, Coord]; z?: [Coord, Coord] }): this {
    const bound = (b: [Coord, Coord] | undefined): [string, string] | undefined =>
      b ? [coordStr(b[0]), coordStr(b[1])] : undefined;
    const r: Region = {};
    const x = bound(region.x);
    const y = bound(region.y);
    const z = bound(region.z);
    if (x) r.x = x;
    if (y) r.y = y;
    if (z) r.z = z;
    this.pushOp({ op: "crease", region: r });
    return this;
  }

  /** Grow the faces inside a region outward by an offset vector — a bump, a
   *  boss, a socket. The first operator that adds topology. */
  extrude(
    region: { x?: [Coord, Coord]; y?: [Coord, Coord]; z?: [Coord, Coord] },
    offset: [Coord, Coord, Coord],
  ): this {
    const bound = (b: [Coord, Coord] | undefined): [string, string] | undefined =>
      b ? [coordStr(b[0]), coordStr(b[1])] : undefined;
    const r: Region = {};
    const x = bound(region.x);
    const y = bound(region.y);
    const z = bound(region.z);
    if (x) r.x = x;
    if (y) r.y = y;
    if (z) r.z = z;
    this.pushOp({
      op: "extrude",
      region: r,
      offset: [coordStr(offset[0]), coordStr(offset[1]), coordStr(offset[2])],
    });
    return this;
  }

  /** Inset the faces in a region by a factor — a panel, frame, recessed
   *  detail. factor in (0,1) insets; > 1 outsets. */
  inset(region: { x?: [Coord, Coord]; y?: [Coord, Coord]; z?: [Coord, Coord] }, factor: Coord): this {
    const bound = (b: [Coord, Coord] | undefined): [string, string] | undefined =>
      b ? [coordStr(b[0]), coordStr(b[1])] : undefined;
    const r: Region = {};
    const x = bound(region.x);
    const y = bound(region.y);
    const z = bound(region.z);
    if (x) r.x = x;
    if (y) r.y = y;
    if (z) r.z = z;
    this.pushOp({ op: "inset", region: r, factor: coordStr(factor) });
    return this;
  }

  /** Scale a region about a pivot by a per-axis factor — taper, bulge, squash. */
  scale(
    region: { x?: [Coord, Coord]; y?: [Coord, Coord]; z?: [Coord, Coord] },
    factor: [Coord, Coord, Coord],
    pivot: [Coord, Coord, Coord] = [0, 0, 0],
  ): this {
    const bound = (b: [Coord, Coord] | undefined): [string, string] | undefined =>
      b ? [coordStr(b[0]), coordStr(b[1])] : undefined;
    const r: Region = {};
    const x = bound(region.x);
    const y = bound(region.y);
    const z = bound(region.z);
    if (x) r.x = x;
    if (y) r.y = y;
    if (z) r.z = z;
    this.pushOp({
      op: "scale",
      region: r,
      factor: [coordStr(factor[0]), coordStr(factor[1]), coordStr(factor[2])],
      pivot: [coordStr(pivot[0]), coordStr(pivot[1]), coordStr(pivot[2])],
    });
    return this;
  }

  /** Begin a named morph target — deform the base with move/scale, then
   *  `endShape()`. The delta propagates through a later subdivide exactly. */
  shape(name: string): this {
    this.pushOp({ op: "shape", name });
    return this;
  }

  /** Close the current morph target. */
  endShape(): this {
    this.pushOp({ op: "endShape" });
    return this;
  }

  trace(): Trace {
    return { version: 1, ops: this.ops.map((o) => ({ ...o })) };
  }
}
