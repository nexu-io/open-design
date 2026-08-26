import { describe, expect, it } from "vitest";
import { Rational } from "../src/kernel/rational.js";
import { meshOf, mirror, predictCensus, subdivide, KernelMesh, RVec3 } from "../src/kernel/mesh.js";
import {
  canonicalize,
  evalTrace,
  evalTraceWithCensus,
  Recorder,
  Trace,
  traceHash,
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
    expect(census).toEqual(predictCensus(mesh));
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
