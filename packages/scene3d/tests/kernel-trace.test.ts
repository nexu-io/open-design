import { describe, expect, it } from "vitest";
import { Rational } from "../src/kernel/rational.js";
import { meshOf, mirror, predictCensus, subdivide, KernelMesh, RVec3 } from "../src/kernel/mesh.js";
import {
  canonicalize,
  evalTrace,
  evalTraceShapes,
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
    // the final step for a provable volume. triangulate is a pure fan of the
    // face list (positions untouched), so the base and every shape get the SAME
    // triangulated topology with the SAME vertex count: the morph survives it.
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
