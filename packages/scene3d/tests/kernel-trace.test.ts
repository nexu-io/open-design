import { describe, expect, it } from "vitest";
import { Rational } from "../src/kernel/rational.js";
import { meshOf, mirror, predictCensus, subdivide, KernelMesh, RVec3 } from "../src/kernel/mesh.js";
import {
  canonicalize,
  EvalCancelledError,
  evalTrace,
  evalTraceShapes,
  evalTraceWithCensus,
  Recorder,
  Trace,
  traceHash,
  WorkBudgetError,
} from "../src/kernel/trace.js";

/**
 * The operator trace is the kernel's IR: a recipe is a serialized sequence of
 * exact operators, and there is exactly ONE evaluator. These prove that a
 * trace produced by the recording ctx evaluates to the SAME exact geometry as
 * calling the kernel directly — the equivalence the whole architecture rests
 * on — and that its content hash is stable and sensitive.
 */

const cube = (): KernelMesh =>
  meshOf(
    [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
  );
const keys = (m: KernelMesh): string[] =>
  m.verts.map((v: RVec3) => `${v[0].key()},${v[1].key()},${v[2].key()}`).sort();

describe("kernel trace: cooperative cancellation", () => {
  // Cancellation rides the work-meter checkpoint (once per grow / subdivide
  // level) — the only place a caller can interrupt the synchronous exact loop.
  // These pin the exact behaviour the off-thread worker depends on.

  it("stops immediately when cancelled from the first checkpoint", () => {
    const trace = new Recorder().box().subdivide(4).trace();
    expect(() => evalTrace(trace, { shouldCancel: () => true })).toThrow(EvalCancelledError);
  });

  it("is cooperative: it keeps evaluating until the signal flips, then stops", () => {
    const trace = new Recorder().box().subdivide(6).trace();
    let polls = 0;
    // Flip true only after several checkpoints — proves it polls repeatedly and
    // interrupts partway, not just at op 0.
    expect(() =>
      evalTrace(trace, { shouldCancel: () => ++polls > 3 }),
    ).toThrow(EvalCancelledError);
    expect(polls).toBeGreaterThan(3);
  });

  it("a cancel is not a budget trip — distinct error, so the report can tell them apart", () => {
    const trace = new Recorder().box().subdivide(3).trace();
    let err: unknown;
    try {
      evalTrace(trace, { shouldCancel: () => true, workBudget: 10_000_000 });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EvalCancelledError);
    expect(err).not.toBeInstanceOf(WorkBudgetError);
  });

  it("evalTraceShapes honours cancellation too (the entry the pipeline uses)", () => {
    const trace = new Recorder().box().subdivide(2).trace();
    expect(() => evalTraceShapes(trace, { shouldCancel: () => true })).toThrow(EvalCancelledError);
  });

  it("interrupts a charge-after op (extrude) BEFORE it builds, not only at its post-build charge", () => {
    // extrude builds its result and charges afterwards, so the per-charge poll
    // alone would let it finish first. The per-op checkpoint must catch it. Poll
    // sequence: cage top (1), cage charge (2), extrude top (3) → stop here. If the
    // per-op check were gone, only the two charges would poll and this never trips.
    const trace = new Recorder().box().extrude({ z: [0, 2] }, [0, 0, "1/2"]).trace();
    let n = 0;
    let caught: EvalCancelledError | undefined;
    try {
      evalTrace(trace, { shouldCancel: () => ++n >= 3 });
    } catch (e) {
      caught = e as EvalCancelledError;
    }
    expect(caught).toBeInstanceOf(EvalCancelledError);
    expect(caught?.opKind).toBe("extrude"); // stopped AT the extrude, before its build
  });

  it("without a signal it runs to completion unchanged", () => {
    const trace = new Recorder().box().subdivide(3).trace();
    expect(() => evalTrace(trace)).not.toThrow();
  });
});

describe("kernel trace: the work meter guards runaway, not scale", () => {
  it("builds a large legitimate asset with no arbitrary cap (a level-5 cube)", () => {
    // ~6k faces — a smooth surface, well under the default budget. No cap on
    // verts, faces, sides, ops, or subdivide levels refuses it.
    const mesh = evalTrace(new Recorder().box().subdivide(5).trace());
    expect(mesh.faces.length).toBe(6 * 4 ** 5);
  });

  it("trips the work budget on a genuine runaway — DETERMINISTICALLY, same failure twice", () => {
    // subdivide(30) is 4^30 faces — an accidental typo, not an asset. With a small
    // explicit budget the meter fires after a handful of cheap levels (predicted
    // BEFORE building the explosive one, so no OOM) with a diagnostic, and the
    // SAME op with the SAME message on every run — determinism holds for the
    // failure too, because the meter is a pure function of the trace + budget.
    const trace = new Recorder().box().subdivide(30).trace();
    const budget = 200_000;
    let first: WorkBudgetError | undefined;
    let second: WorkBudgetError | undefined;
    try { evalTrace(trace, { workBudget: budget }); } catch (e) { first = e as WorkBudgetError; }
    try { evalTrace(trace, { workBudget: budget }); } catch (e) { second = e as WorkBudgetError; }
    expect(first).toBeInstanceOf(WorkBudgetError);
    expect(first!.opKind).toBe("subdivide");
    expect(first!.spent).toBe(second!.spent); // same tipping point, deterministic
    expect(first!.message).toBe(second!.message);
  });

  it("an invalid budget (NaN/Infinity/≤0) falls back to the default — the guard can't be disabled", () => {
    // A bad budget must NOT silently switch the runaway guard off: `spent > NaN`
    // is always false, `> Infinity` never true. A cage of many points whose
    // coordinate TEXT totals over the ~2M default costs that many parse units —
    // charged BEFORE any mesh is built, so it trips cheaply (no allocation), and
    // it must still fire for each bad budget rather than passing through
    // unmetered. (The triangulate charge is now O(n·log n), too cheap to trip.)
    const n = 20_000;
    const coord = "1234567890123456789012345678901234567890"; // 40 digits ⇒ ~2.4M coord-text units
    const pts: Array<[string, string, string]> = Array.from({ length: n }, () => [coord, coord, coord]);
    const trace = new Recorder().cage(pts, [Array.from({ length: n }, (_, k) => k)]).trace();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -100] as number[]) {
      expect(() => evalTrace(trace, { workBudget: bad })).toThrow(WorkBudgetError);
    }
    // (That the SAME charge clears under a raised budget — the wall raised, not
    // disabled — is the next test.)
  });

  it("a raised budget builds what the default would refuse — a wall you can raise", () => {
    // The budget is an INPUT, not a constant: the same trace that trips the
    // default succeeds with a bigger budget (on a machine with the memory).
    const trace = new Recorder().box().subdivide(6).trace(); // 6·4^6 = 24,576 faces
    expect(() => evalTrace(trace, { workBudget: 1_000 })).toThrow(WorkBudgetError); // tiny budget refuses
    expect(() => evalTrace(trace, { workBudget: 10_000_000 })).not.toThrow(); // raised budget builds it
  });
});

describe("kernel trace: the meter reads deep coordinates at EVERY index (S7/S8 red-team)", () => {
  // The work meter is the ONE runaway guard the no-caps doctrine rests on, and
  // its coordinate-cost term used to SAMPLE every ⌊n/32⌋-th vertex. A red-team
  // proved the blindspot: a region-selected op can drive only the UNSAMPLED
  // vertices to astronomical bit-length, so a few-hundred-KB trace pegged CPU
  // quadratically while `spent` read "under budget". The scan is now exhaustive.

  const N = 64; // ≥64 so the old ⌊n/32⌋=2 stride skipped the odd indices
  const DEEP = "1" + "0".repeat(300); // 10^300 — ~1000 bits added per scale
  const SHALLOW = "3"; // 3^k grows ~1.6 bits per scale — stays cheap forever

  // Vertex k sits at y = k%2, so region {y:[1,1]} selects EXACTLY the odd
  // indices — precisely the band the old sampler never read. The deepest vertex
  // (k=63, odd) is in the band, so the coordinate max is identical whether we
  // scale the band or the whole mesh: location cannot change the honest cost.
  const chain = (region: { y?: [string, string] }, factorX: string, times: number): Trace => {
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k < N; k++) pts.push([k, k % 2, 0]);
    const r = new Recorder().cage(pts, [Array.from({ length: N }, (_, k) => k)]);
    for (let s = 0; s < times; s++) r.scale(region, [factorX, "1", "1"], [0, 0, 0]);
    return r.trace();
  };

  it("charges a SUBSET-deep scale chain — the stride blindspot is closed", () => {
    // 25 scales driving only the odd (y=1) band's x by 10^300: post-fix the full
    // scan sees the deep band and the meter trips. Pre-fix the stride sampler
    // read only the even band (coords ~one unit) and sailed under budget.
    const trace = chain({ y: ["1", "1"] }, DEEP, 25);
    expect(() => evalTrace(trace, { workBudget: 500_000 })).toThrow(WorkBudgetError);
  });

  it("it is coordinate DEPTH being charged, not op count — the same 25 ops stay cheap when shallow", () => {
    // Identical topology and op count, but a factor that never deepens the
    // coordinates: this must NOT trip, or the test above would be proving
    // nothing but "25 scales is a lot".
    const trace = chain({ y: ["1", "1"] }, SHALLOW, 25);
    expect(() => evalTrace(trace, { workBudget: 500_000 })).not.toThrow();
  });

  it("the charge is LOCATION-independent — a banded deep chain costs what a whole-mesh one does", () => {
    // With the deepest vertex in the band, scaling the band and scaling the
    // whole mesh reach the coordinate max identically, so the meter trips at the
    // SAME op with the SAME spent. A sampler that reads position, not value,
    // could never guarantee this.
    let banded: WorkBudgetError | undefined;
    let whole: WorkBudgetError | undefined;
    try { evalTrace(chain({ y: ["1", "1"] }, DEEP, 25), { workBudget: 500_000 }); } catch (e) { banded = e as WorkBudgetError; }
    try { evalTrace(chain({}, DEEP, 25), { workBudget: 500_000 }); } catch (e) { whole = e as WorkBudgetError; }
    expect(banded).toBeInstanceOf(WorkBudgetError);
    expect(whole).toBeInstanceOf(WorkBudgetError);
    expect(banded!.spent).toBe(whole!.spent);
  });

  it("a lone giant-PARAMETER scale is charged for its parse + arithmetic (reviewer Block)", () => {
    // A shallow box scaled by a 10^100000 factor as the FINAL op: pre-fix the
    // charge read only the shallow input mesh (~14 units) and the huge parse +
    // BigInt multiply ran unmetered (nothing later ever sees the depth). The
    // parameter-complexity term now charges it up front, before the giant parse.
    const trace = new Recorder().box().scale({}, ["1" + "0".repeat(100_000), "1", "1"], [0, 0, 0]).trace();
    expect(() => evalTrace(trace, { workBudget: 100_000 })).toThrow(WorkBudgetError);
    let err: WorkBudgetError | undefined;
    try { evalTrace(trace, { workBudget: 100_000 }); } catch (e) { err = e as WorkBudgetError; }
    expect(err!.opKind).toBe("scale");
  });

  it("clip is charged for its exact per-vertex arithmetic, not just topology (S8)", () => {
    // clip runs rational dot/crossing per vertex — O(coordinate bit length) —
    // yet used to be charged purely topologically (a box has ~24 face-sides).
    // On a deep-coordinate solid the topological charge is trivially under
    // budget; only the coordinate-complexity factor makes clip pay for the
    // arithmetic it is about to run. Post-fix it trips before running the cut.
    const deepBox = new Recorder().box().scale({}, ["1" + "0".repeat(100_000), "1", "1"], [0, 0, 0]);
    const trace = deepBox.clip(["1", "0", "0"], "0").trace();
    // Budget clears the (now correctly-charged) deep scale, so the tipping op is
    // the clip's CC-scaled charge, not the earlier ops.
    expect(() => evalTrace(trace, { workBudget: 300_000 })).toThrow(WorkBudgetError);
    let err: WorkBudgetError | undefined;
    try { evalTrace(trace, { workBudget: 300_000 }); } catch (e) { err = e as WorkBudgetError; }
    expect(err!.opKind).toBe("clip");
  });

  it("ordinary fractional parameters do not inflate the charge — no false trip", () => {
    // The parameter term reads short rationals as complexity 1, so a normal
    // recipe's charge is exactly what it was before the fix.
    const trace = new Recorder()
      .box()
      .move({ z: ["1", "1"] }, [0, "1/3", "1/7"])
      .scale({}, ["3/2", "2/3", 1], [0, 0, 0])
      .subdivide(2)
      .trace();
    expect(() => evalTrace(trace, { workBudget: 20_000 })).not.toThrow();
  });

  it("sums parameter costs — six giant parameters cost more than one (reviewer risk)", () => {
    // An op computes with EVERY parameter, so six giant factor/pivot strings are
    // six times the work of one. A budget between them passes the single-giant
    // scale and trips the six-giant one — the max-only charge would have billed
    // them identically.
    const G = "1" + "0".repeat(30_000); // ~30k chars ⇒ ~3750 units each
    const one = new Recorder().box().scale({}, [G, "1", "1"], [0, 0, 0]).trace();
    const six = new Recorder().box().scale({}, [G, G, G], [G, G, G]).trace();
    expect(() => evalTrace(one, { workBudget: 120_000 })).not.toThrow(); // ~52,500
    expect(() => evalTrace(six, { workBudget: 120_000 })).toThrow(WorkBudgetError); // ~315,000
  });

  it("a malformed clip gets its NAMED error regardless of parameter length or budget", () => {
    // The shape validation must precede the parameter charge: a giant but
    // malformed normal fails the documented shape check, never as a budget trip
    // whose identity would depend on how long the bad payload happened to be.
    const bad: Trace = {
      version: 1,
      ops: [
        ...new Recorder().box().trace().ops,
        { op: "clip", normal: ["1" + "0".repeat(100_000)] as never, d: "0" },
      ],
    };
    expect(() => evalTrace(bad, { workBudget: 10_000 })).toThrow(/needs normal:\[x,y,z\]/);
    expect(() => evalTrace(bad, { workBudget: 10_000 })).not.toThrow(WorkBudgetError);
  });

  it("a NORMAL invalid parameter still gets its own named error (the realistic case)", () => {
    // Charge-before-parse is only consequential for adversarially giant literals;
    // a normal zero normal / non-positive factor charges ~0, never trips, and
    // reaches its named error. This is the case authors actually hit.
    expect(() => evalTrace(new Recorder().box().clip(["0", "0", "0"], "0").trace())).toThrow(/non-zero normal/);
    expect(() => evalTrace(new Recorder().box().inset({}, "-1").trace())).toThrow(/factor must be positive/);
  });

  it("a giant VALID clip plane is metered BEFORE its (super-linear) parse", () => {
    // A valid but giant normal component: the charge must land before the
    // BigInt + bgcd parse, so it trips AT the clip op rather than spending
    // unmetered parse CPU — the sole runaway guard must see every parse.
    const trace = new Recorder().box().clip(["1" + "0".repeat(100_000), "0", "0"], "0").trace();
    let err: WorkBudgetError | undefined;
    try { evalTrace(trace, { workBudget: 50_000 }); } catch (e) { err = e as WorkBudgetError; }
    expect(err).toBeInstanceOf(WorkBudgetError);
    expect(err!.opKind).toBe("clip");
  });

  it("a giant VALID inset factor is metered BEFORE its parse", () => {
    const trace = new Recorder().box().inset({}, "1" + "0".repeat(100_000)).trace();
    let err: WorkBudgetError | undefined;
    try { evalTrace(trace, { workBudget: 50_000 }); } catch (e) { err = e as WorkBudgetError; }
    expect(err).toBeInstanceOf(WorkBudgetError);
    expect(err!.opKind).toBe("inset");
  });

  it("guards a giant parameter on a DIRECTLY-constructed trace — the real untrusted boundary", () => {
    // The untrusted author writes Python in a spawned subprocess (parse/recipe.ts)
    // and the trace returns as validated JSON; the meter lives at evalTrace, which
    // parses that serialized trace. So the guard must fire on a trace built WITHOUT
    // the TS Recorder (a trusted reference builder that normalizes at record time).
    // This constructs the op object directly — the shape the daemon actually feeds
    // evalTrace — and proves the charge precedes evalTrace's own parse.
    const giant = "1" + "0".repeat(100_000);
    const direct: Trace = {
      version: 1,
      ops: [
        ...new Recorder().box().trace().ops, // cage only — small, from the builder
        { op: "scale", region: {}, factor: [giant, "1", "1"], pivot: ["0", "0", "0"] },
      ],
    };
    let err: WorkBudgetError | undefined;
    try { evalTrace(direct, { workBudget: 50_000 }); } catch (e) { err = e as WorkBudgetError; }
    expect(err).toBeInstanceOf(WorkBudgetError);
    expect(err!.opKind).toBe("scale");
  });

  it("charges the parameter parse independent of mesh size — an empty mesh can't slip a giant parse", () => {
    // The parse of a giant literal happens once per op regardless of vertex count,
    // so the charge must not be × mesh cardinality. A cage with no faces welds to
    // (near-)empty geometry; pre-fix a giant scale on it charged ~0 and parsed the
    // 10^5-digit factor unmetered. The flat per-op parse charge closes it.
    // (reviewer risk — empty/face-less-mesh bypass.)
    const giant = "1" + "0".repeat(100_000);
    const direct: Trace = {
      version: 1,
      ops: [
        { op: "cage", points: [["0", "0", "0"]], faces: [] },
        { op: "scale", region: {}, factor: [giant, "1", "1"], pivot: ["0", "0", "0"] },
      ],
    };
    let err: WorkBudgetError | undefined;
    try { evalTrace(direct, { workBudget: 100 }); } catch (e) { err = e as WorkBudgetError; }
    expect(err).toBeInstanceOf(WorkBudgetError);
    expect(err!.opKind).toBe("scale");
  });

  it("a genuinely large but shallow-coordinate mesh is unaffected — no false trip", () => {
    // The whole point of the ÷32 gentleness: an ordinary big asset (small
    // integer / short-fraction coordinates) reads complexity ~1 and builds
    // freely. The exhaustive scan changes NOTHING for it.
    expect(() => evalTrace(new Recorder().box().subdivide(5).trace())).not.toThrow();
  });
});

describe("kernel trace: the recorder and the evaluator agree with the kernel", () => {
  it("box().subdivide(2) evaluates to the same exact mesh as subdivide(cube, 2)", () => {
    const viaTrace = evalTrace(new Recorder().box().subdivide(2).trace());
    const direct = subdivide(cube(), 2);
    expect(keys(viaTrace)).toEqual(keys(direct)); // exact coordinate identity
    expect(predictCensus(viaTrace)).toEqual(predictCensus(direct));
  });

  it("a mirrored, subdivided recipe matches the direct composition exactly", () => {
    const viaTrace = evalTrace(new Recorder().box().subdivide(1).mirror(0).trace());
    const direct = mirror(subdivide(cube(), 1), 0);
    expect(keys(viaTrace)).toEqual(keys(direct));
    const c = predictCensus(viaTrace);
    expect(c.min[0]).toBe(-c.max[0]); // symmetric to the last bit
  });

  it("evalTraceWithCensus hands back both projections of the one exact object", () => {
    const { mesh, census } = evalTraceWithCensus(new Recorder().box().subdivide(1).trace());
    // evalTraceWithCensus is the ADJUDICATION census, so it carries mass; match it.
    expect(census).toEqual(predictCensus(mesh, { mass: true }));
    expect([census.vertices, census.edges, census.faces]).toEqual([26, 48, 24]);
    expect(census.watertight).toBe(true);
  });

  it("carries only rational scalars — the IR has no float in it", () => {
    const trace = new Recorder().box("1/2").subdivide(1).trace();
    const cage = trace.ops[0] as { op: "cage"; points: string[][] };
    expect(cage.points[0]).toEqual(["-1/2", "-1/2", "-1/2"]);
    // Re-parses to the exact value on any machine.
    expect(Rational.parse("-1/2").eq(Rational.of(-1n, 2n))).toBe(true);
  });
});

describe("kernel trace: grid seeds a flat open patch", () => {
  it("grid(2,2,2) is 9 verts, 4 quads, an 8-edge boundary, flat at z=0", () => {
    const c = predictCensus(evalTrace(new Recorder().grid(2, 2, 2).trace()));
    expect([c.vertices, c.faces]).toEqual([9, 4]);
    expect(c.boundaryEdges).toBe(8);
    expect(c.watertight).toBe(false);
    expect(c.min).toEqual([-1, -1, 0]);
    expect(c.max).toEqual([1, 1, 0]);
  });

  it("grid is pure sugar over cage — one op, exact rational points", () => {
    const trace = new Recorder().grid(3, 2, "1/2").trace();
    expect(trace.ops).toHaveLength(1);
    expect(trace.ops[0]!.op).toBe("cage");
  });
});

describe("kernel trace: content hash is stable and sensitive", () => {
  it("the same recipe hashes identically; a changed one does not", () => {
    const a = new Recorder().box().subdivide(2).trace();
    const b = new Recorder().box().subdivide(2).trace();
    const c = new Recorder().box().subdivide(3).trace();
    expect(traceHash(a)).toBe(traceHash(b)); // unchanged recipe → cache hit
    expect(traceHash(a)).not.toBe(traceHash(c)); // changed recipe → miss
    expect(traceHash(a)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("canonicalization is key-order independent", () => {
    // The same op with its fields written in different orders is the same
    // bytes — a producer cannot perturb the cache key by field order.
    const t1: Trace = { version: 1, ops: [{ op: "subdivide", levels: 2 }] };
    const t2: Trace = { version: 1, ops: [{ levels: 2, op: "subdivide" } as never] };
    expect(canonicalize(t1)).toBe(canonicalize(t2));
    expect(traceHash(t1)).toBe(traceHash(t2));
  });
});

describe("kernel trace: move is an exact, topology-preserving deformation", () => {
  it("translates exactly the selected region, inclusive of the bound", () => {
    // Lift the top face (z = 1) of the unit box by 1: the four top corners go
    // to z = 2, the four bottom corners stay. Selection is exact, so the
    // vertices exactly on z = 1 are the ones that move.
    const m = evalTrace(new Recorder().box().move({ z: ["1", "1"] }, [0, 0, 1]).trace());
    const c = predictCensus(m);
    expect(c.max[2]).toBe(2);
    expect(c.min[2]).toBe(-1);
    expect(c.vertices).toBe(8); // topology untouched — a pure deformation
  });

  it("preserves topology through a later subdivide (counts, watertight)", () => {
    // A moved cage subdivides to the SAME counts as the unmoved one — the
    // deformation rode through the operator, the census is invariant, and the
    // predicted-census claim still adjudicates.
    const moved = predictCensus(
      evalTrace(new Recorder().box().move({ z: ["1", "1"] }, [0, 0, 3]).subdivide(1).trace()),
    );
    const plain = predictCensus(evalTrace(new Recorder().box().subdivide(1).trace()));
    expect([moved.vertices, moved.edges, moved.faces]).toEqual([
      plain.vertices,
      plain.edges,
      plain.faces,
    ]);
    expect(moved.watertight).toBe(true);
    expect(moved.genus).toBe(0);
  });

  it("an empty region moves the whole mesh (a translation)", () => {
    const m = evalTrace(new Recorder().box().move({}, ["1/2", 0, 0]).trace());
    const c = predictCensus(m);
    // Everything shifted +1/2 in x: bounds move, extents unchanged.
    expect(c.min[0]).toBe(-0.5);
    expect(c.max[0]).toBe(1.5);
  });

  it("is deterministic — a moved recipe hashes identically twice", () => {
    const r = () => new Recorder().box().move({ z: ["1", "1"] }, [0, "1/4", 2]).subdivide(1).trace();
    expect(traceHash(r())).toBe(traceHash(r()));
  });
});

describe("kernel trace: scale is an exact region deformation", () => {
  it("scales the whole mesh about a pivot, per axis", () => {
    const c = predictCensus(evalTrace(new Recorder().box().scale({}, [2, 1, 1], [0, 0, 0]).trace()));
    expect(c.min[0]).toBe(-2);
    expect(c.max[0]).toBe(2);
    expect(c.max[2]).toBe(1); // the y/z factors were 1 — unchanged
  });

  it("flares only a region and leaves the rest exact", () => {
    // Scale the top ring (z = 1) outward in x and y: a flared top, a square
    // base. Topology is untouched.
    const c = predictCensus(
      evalTrace(new Recorder().box().scale({ z: ["1", "1"] }, [2, 2, 1], [0, 0, 0]).trace()),
    );
    expect(c.max[0]).toBe(2); // top corners pushed to x = 2
    expect(c.min[2]).toBe(-1); // base untouched
    expect(c.vertices).toBe(8);
  });

  it("is deterministic", () => {
    const r = () => new Recorder().box().scale({}, ["3/2", 1, "1/2"], [0, 0, "-1"]).trace();
    expect(traceHash(r())).toBe(traceHash(r()));
  });
});

describe("kernel trace: extrude grows a closed, watertight bump", () => {
  it("extruding the top face of a box adds a boss with exact counts", () => {
    // Box (V8 E12 F6) with its +z face pulled up by 1: 4 new verts, the top
    // face plus 4 walls replace the one face. Euler stays 2 (still a genus-0
    // sphere), and watertight+orientable confirm the wall winding is correct.
    const m = evalTrace(new Recorder().box().extrude({ z: ["1", "1"] }, [0, 0, 1]).trace());
    const c = predictCensus(m);
    expect([c.vertices, c.edges, c.faces]).toEqual([12, 20, 10]);
    expect(c.euler).toBe(2);
    expect(c.watertight).toBe(true);
    expect(c.orientable).toBe(true);
    expect(c.genus).toBe(0);
    expect(c.max[2]).toBe(2); // the boss stands 1 above the box top
    expect(c.min[2]).toBe(-1); // base untouched
  });

  it("an extruded boss subdivides to a smooth closed surface", () => {
    const m = predictCensus(
      evalTrace(new Recorder().box().extrude({ z: ["1", "1"] }, [0, 0, 1]).subdivide(2).trace()),
    );
    expect(m.watertight).toBe(true);
    expect(m.genus).toBe(0);
  });

  it("a region matching no whole face is a no-op", () => {
    // No face has all four vertices at z = 0 (there is no such face), so
    // nothing extrudes and the box is unchanged.
    const m = predictCensus(evalTrace(new Recorder().box().extrude({ z: ["0", "0"] }, [0, 0, 1]).trace()));
    expect([m.vertices, m.faces]).toEqual([8, 6]);
  });

  it("insetting every box face adds panels and stays a closed solid", () => {
    // Each of the 6 faces becomes a shrunk inner face plus 4 ring quads: V =
    // 8 + 6·4 = 32, F = 6·5 = 30, and Euler stays 2 (still a genus-0 sphere).
    const c = predictCensus(evalTrace(new Recorder().box().inset({}, "1/2").trace()));
    expect([c.vertices, c.edges, c.faces]).toEqual([32, 60, 30]);
    expect(c.euler).toBe(2);
    expect(c.watertight).toBe(true);
    expect(c.orientable).toBe(true);
    expect(c.genus).toBe(0);
  });
});

describe("kernel trace: morph targets propagate through subdivision exactly", () => {
  const stretch = (d: string) =>
    new Recorder().box().shape("stretch").move({ z: ["1", "1"] }, [0, 0, d]).endShape().subdivide(2).trace();

  it("a morph target stays in topological lockstep with the base", () => {
    const { base, shapes } = evalTraceShapes(stretch("1"));
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.name).toBe("stretch");
    expect(shapes[0]!.mesh.verts.length).toBe(base.verts.length); // same vertex count
    expect(shapes[0]!.mesh.faces).toEqual(base.faces); // identical topology
    const moved = shapes[0]!.mesh.verts.some((v, i) => !v[2].eq(base.verts[i]![2]));
    expect(moved).toBe(true); // the stretch actually deformed geometry
  });

  it("triangulate() composes with morph targets, keeping every shape in lockstep", () => {
    // The documented order — author the morph, subdivide, then triangulate as
    // the final step for a provable volume. Ear-clipping reads vertex positions,
    // so re-running it per morph could pick a different diagonal; evalTraceShapes
    // instead applies the BASE's triangulation to every shape (they share vertex
    // indexing), so the base and each morph get byte-identical triangulated
    // topology with the same vertex count — the morph deltas survive it exactly.
    const trace = new Recorder()
      .box()
      .shape("stretch").move({ z: ["1", "1"] }, [0, 0, "1"]).endShape()
      .subdivide(2)
      .triangulate()
      .trace();
    const { base, shapes } = evalTraceShapes(trace);
    expect(base.faces.every((f) => f.length === 3)).toBe(true); // fully triangulated
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.mesh.verts.length).toBe(base.verts.length); // still in lockstep
    expect(shapes[0]!.mesh.faces).toEqual(base.faces); // identical (triangulated) topology
    const moved = shapes[0]!.mesh.verts.some((v, i) => !v[2].eq(base.verts[i]![2]));
    expect(moved).toBe(true); // the morph still deforms geometry
  });

  it("a cage delta scales linearly to the limit surface — S·Δ, exact", () => {
    // Doubling the authored cage delta doubles the propagated limit-surface
    // delta to the last bit. That linearity is what lets a blendshape be
    // authored as tens of numbers on the cage and land exactly on the
    // 98-vertex subdivided surface.
    const one = evalTraceShapes(stretch("1"));
    const two = evalTraceShapes(stretch("2"));
    const b = one.base.verts;
    for (let i = 0; i < b.length; i++) {
      for (let k = 0; k < 3; k++) {
        const d1 = one.shapes[0]!.mesh.verts[i]![k]!.sub(b[i]![k]!);
        const d2 = two.shapes[0]!.mesh.verts[i]![k]!.sub(two.base.verts[i]![k]!);
        expect(d2.eq(d1.mul(Rational.of(2)))).toBe(true);
      }
    }
  });

  it("rejects malformed shape brackets", () => {
    expect(() => evalTraceShapes(new Recorder().box().shape("a").shape("b").trace())).toThrow(/inside shape/);
    expect(() => evalTraceShapes(new Recorder().box().endShape().trace())).toThrow(/without an open shape/);
    expect(() => evalTraceShapes(new Recorder().box().shape("a").subdivide(1).trace())).toThrow(
      /only move\/scale/,
    );
    expect(() => evalTraceShapes(new Recorder().box().shape("a").move({}, [0, 0, 1]).trace())).toThrow(
      /never closed/,
    );
    expect(() =>
      evalTraceShapes(new Recorder().box().shape("a").endShape().shape("a").endShape().trace()),
    ).toThrow(/duplicate shape/);
  });

  it("evalTrace refuses shape ops — those need evalTraceShapes", () => {
    expect(() => evalTrace(new Recorder().box().shape("a").endShape().trace())).toThrow(/evalTraceShapes/);
  });

  it("forbids a geometry-dependent global op after a shape (the desync both red-teams found)", () => {
    // A deformed shape would select a different face/edge set than the base for
    // a region op, silently mismatching vertex counts. Only subdivide (which is
    // coordinate-independent) may run globally after a shape.
    const after = (add: (r: Recorder) => void) => {
      const r = new Recorder().box().shape("s").move({ z: ["1", "1"] }, [0, 0, 1]).endShape();
      add(r);
      return () => evalTraceShapes(r.trace());
    };
    expect(after((r) => r.extrude({ z: ["1", "1"] }, [0, 0, 1]))).toThrow(/cannot run globally/);
    expect(after((r) => r.inset({ z: ["1", "1"] }, "1/2"))).toThrow(/cannot run globally/);
    expect(after((r) => r.mirror(0))).toThrow(/cannot run globally/);
    expect(after((r) => r.crease({ z: ["1", "1"] }))).toThrow(/cannot run globally/);
    // subdivide after a shape is fine — it stays in lockstep.
    expect(after((r) => r.subdivide(1))).not.toThrow();
  });
});

describe("kernel trace: malformed recipes fail loudly", () => {
  it("a transform before any geometry is an error, not a guess", () => {
    expect(() => evalTrace({ version: 1, ops: [{ op: "subdivide", levels: 1 }] })).toThrow(
      /before any geometry/,
    );
  });

  it("an empty trace produces no geometry and says so", () => {
    expect(() => evalTrace({ version: 1, ops: [] })).toThrow(/no geometry/);
  });

  it("an unsupported version is refused", () => {
    expect(() => evalTrace({ version: 2 as never, ops: [] })).toThrow(/version/);
  });
});
