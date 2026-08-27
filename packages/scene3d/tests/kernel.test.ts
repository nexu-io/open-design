import { describe, expect, it } from "vitest";
import { Rational, rat } from "../src/kernel/rational.js";
import {
  edgeKey,
  KernelMesh,
  meshOf,
  mirror,
  predictCensus,
  RVec3,
  subdivide,
  subdivideCatmullClark,
} from "../src/kernel/mesh.js";
import { boundaryMatrices, homology, rankQ } from "../src/kernel/homology.js";
import { evalTrace, Recorder, traceHash } from "../src/kernel/trace.js";

/**
 * The deterministic geometry kernel, proved on exact known answers.
 *
 * Catmull-Clark is a rational averaging operator, so every fact here is an
 * INTEGER or an exact fraction — there is no `toBeCloseTo` in this file, and
 * that is the point: the kernel is verified to the last bit, the way the
 * census will later adjudicate it against Blender.
 */

/** The unit cube: 8 corners at ±1, six outward-wound quads. */
function cube(): KernelMesh {
  return meshOf(
    [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ],
    [
      [0, 3, 2, 1], // z-
      [4, 5, 6, 7], // z+
      [0, 1, 5, 4], // y-
      [3, 7, 6, 2], // y+
      [0, 4, 7, 3], // x-
      [1, 2, 6, 5], // x+
    ],
  );
}

const keyOf = (v: RVec3): string => `${v[0].key()},${v[1].key()},${v[2].key()}`;
const sortedKeys = (m: KernelMesh): string[] => m.verts.map(keyOf).sort();

describe("kernel: Catmull-Clark exact census", () => {
  it("the cube's census is exact at each level (V+E+F, χ=2, watertight)", () => {
    const c0 = predictCensus(cube());
    expect([c0.vertices, c0.edges, c0.faces]).toEqual([8, 12, 6]);
    expect(c0.euler).toBe(2);
    expect(c0.watertight).toBe(true);
    expect(c0.genus).toBe(0);
    expect(c0.nonManifoldEdges).toBe(0);

    // One step: V' = V+E+F = 26, F' = Σ sides = 24, χ preserved ⇒ E' = 48.
    const c1 = predictCensus(subdivide(cube(), 1));
    expect([c1.vertices, c1.edges, c1.faces]).toEqual([26, 48, 24]);
    expect(c1.euler).toBe(2);
    expect(c1.watertight).toBe(true);
    expect(c1.genus).toBe(0);
    // All-quad output ⇒ triangles = 2·faces.
    expect(c1.triangles).toBe(48);

    // Two steps: F=96, V=26+48+24=98, χ=2 ⇒ E=192.
    const c2 = predictCensus(subdivide(cube(), 2));
    expect([c2.vertices, c2.edges, c2.faces]).toEqual([98, 192, 96]);
    expect(c2.euler).toBe(2);
    expect(c2.watertight).toBe(true);
    expect(c2.triangles).toBe(192);
  });

  it("stays inside the cage hull: every subdivided vertex is within [-1,1]", () => {
    // A convex-combination operator can never leave the convex hull of the
    // cage — a property the box-fit downstream relies on.
    const c = predictCensus(subdivide(cube(), 3));
    for (let i = 0; i < 3; i++) {
      expect(c.min[i]).toBeGreaterThanOrEqual(-1);
      expect(c.max[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe("kernel: partition of unity (rows sum to exactly 1)", () => {
  it("subdivision commutes EXACTLY with an affine scale+translate", () => {
    // The defining property of a stochastic operator: S(A·x + t) = A·S(x) + t.
    // Because every CC weight sums to 1 in exact rationals, this holds to the
    // last bit — which is also the theorem that fit-then-subdivide equals
    // subdivide-then-fit, so the box-fit can run on either side.
    const s: RVec3 = [rat(3, 2), rat(7, 5), rat(-2)];
    const t: RVec3 = [rat(5), rat(-11, 3), rat(4, 7)];
    const affine = (m: KernelMesh): KernelMesh =>
      meshOf(
        m.verts.map((v) => [
          v[0].mul(s[0]).add(t[0]),
          v[1].mul(s[1]).add(t[1]),
          v[2].mul(s[2]).add(t[2]),
        ] as RVec3),
        m.faces,
      );

    const lhs = subdivideCatmullClark(affine(cube())); // S(A·x + t)
    const rhs = affine(subdivideCatmullClark(cube())); // A·S(x) + t
    expect(sortedKeys(lhs)).toEqual(sortedKeys(rhs));
  });

  it("a constant cage subdivides to that constant (weights sum to one)", () => {
    // Degenerate but decisive: if every corner sits at the same point, every
    // convex combination is that point. Any weight drift would move it. meshOf
    // (rightly) refuses an all-coincident cage now, so assemble the KernelMesh
    // directly — this test exercises the subdivision weights, not authoring.
    const degenerate: KernelMesh = {
      verts: Array.from({ length: 8 }, () => [rat(2), rat(-3), rat(5)] as RVec3),
      faces: cube().faces,
      vertId: Array.from({ length: 8 }, (_, i) => `c${i}`),
    };
    const out = subdivideCatmullClark(degenerate);
    for (const v of out.verts) {
      expect(v[0].eq(rat(2))).toBe(true);
      expect(v[1].eq(rat(-3))).toBe(true);
      expect(v[2].eq(rat(5))).toBe(true);
    }
  });
});

describe("kernel: the weld is an exact permutation, not a tolerance", () => {
  it("collapses coincident input vertices to one index", () => {
    // Two faces listing the same corner coordinates must share it.
    const m = meshOf(
      [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [1, 0, 0]],
      [[0, 1, 2, 3]],
    );
    // The duplicate (index 4 == index 1 coordinate) is welded away.
    expect(m.verts.length).toBe(4);
  });

  it("mirror shares the on-plane seam and never doubles it", () => {
    // A unit quad with two corners ON x=0: the mirror reflects the two off-
    // plane corners and REUSES the two on-plane ones — 6 vertices, not 8.
    const quad = meshOf(
      [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
      [[0, 1, 2, 3]],
    );
    const m = mirror(quad, 0);
    expect(m.verts.length).toBe(6); // 4 + 2 reflected, 2 shared
    expect(m.faces.length).toBe(2);
    // The mirror image (-1,0,0) and (-1,1,0) are present exactly.
    const keys = new Set(m.verts.map(keyOf));
    expect(keys.has(keyOf([rat(-1), rat(0), rat(0)]))).toBe(true);
    expect(keys.has(keyOf([rat(-1), rat(1), rat(0)]))).toBe(true);
  });

  it("mirror yields an exactly symmetric coordinate set", () => {
    // Every vertex has its exact reflection; the bounds are symmetric about
    // the plane to the last bit — mirror error is 0, not 'under 1e-9'.
    const m = mirror(subdivide(cube(), 1), 0);
    const keys = new Set(m.verts.map(keyOf));
    for (const v of m.verts) {
      const reflected: RVec3 = [v[0].neg(), v[1], v[2]];
      expect(keys.has(keyOf(reflected))).toBe(true);
    }
    const c = predictCensus(m);
    expect(c.min[0]).toBe(-c.max[0]);
  });
});

/** A 3×3 periodic quad grid — the minimal closed genus-1 torus. Coordinates
 *  are distinct integers (homology is combinatorial); wraparound faces close
 *  it into a torus with χ = 0. */
function torus3x3(): KernelMesh {
  const id = (i: number, j: number): number => (i % 3) * 3 + (j % 3);
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pts.push([i, j, 0]);
  const faces: number[][] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) faces.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
  return meshOf(pts, faces);
}

describe("kernel: exact homology certifies watertightness and genus", () => {
  it("the cube is a sphere: (b0,b1,b2) = (1,0,1), ∂∂ = 0", () => {
    const h = homology(cube());
    expect(h.orientable).toBe(true); // orientation is consistent
    expect([h.b0, h.b1, h.b2]).toEqual([1, 0, 1]);
    // These ranks are certified independently by the engine's exact
    // Smith-Normal-Form authority: rank ∂1 = 7, rank ∂2 = 5, and the SNF of
    // ∂2 over ℤ is (1,1,1,1,1) — every invariant factor 1, so the homology is
    // TORSION-FREE (the surface is orientable, no ℤ/n handle). A floating
    // rank cannot make that last distinction; the exact integer SNF can.
    expect([h.rankD1, h.rankD2]).toEqual([7, 5]);
    // The homology agrees with the cheap Euler verdict: closed, no handles.
    const c = predictCensus(cube());
    expect(c.watertight).toBe(true);
    expect(c.genus).toBe(h.b1 / 2);
  });

  it("a 3×3 torus has genus 1: b1 = 2, and the census agrees", () => {
    const t = torus3x3();
    const h = homology(t);
    expect(h.orientable).toBe(true);
    expect([h.b0, h.b1, h.b2]).toEqual([1, 2, 1]);
    const c = predictCensus(t);
    expect(c.watertight).toBe(true);
    expect(c.euler).toBe(0);
    // Genus from Euler equals genus from homology — the cheap and the rigorous
    // verdicts cannot disagree without exposing a topology bug.
    expect(c.genus).toBe(1);
    expect(c.genus).toBe(h.b1 / 2);
  });

  it("a subdivided cube stays a sphere (subdivision preserves topology)", () => {
    const h = homology(subdivide(cube(), 2));
    expect([h.b0, h.b1, h.b2]).toEqual([1, 0, 1]);
  });

  it("rankQ is exact: an integer matrix's rank has no pivoting tolerance", () => {
    // A rank-2 matrix whose rows are exact rational combinations — a float
    // solver with a bad tolerance could call this rank 3.
    expect(rankQ([[2, 4, 6], [1, 2, 3], [0, 1, 1]])).toBe(2);
    expect(rankQ([[1, 0], [0, 1], [1, 1]])).toBe(2);
    // The cube's ∂1 is the incidence the homology reads: 12 edges, rank 7.
    expect(rankQ(boundaryMatrices(cube()).d1)).toBe(7);
  });
});

/** A closed tetrahedron, consistently wound outward. */
function tetra(faces?: number[][]): KernelMesh {
  return meshOf(
    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
    faces ?? [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
  );
}

describe("kernel: orientation, connectivity and index guards (red-team)", () => {
  it("detects an inconsistent winding — the tautological check could not", () => {
    // A consistently wound tetra is orientable; reversing ONE face makes a
    // shared edge run the same direction in both faces, which the real check
    // catches. (The old ∂1∘∂2=0 test read `true` for both — it was an
    // identity, not an orientation test.)
    expect(homology(tetra()).orientable).toBe(true);
    const reversed = tetra([[2, 1, 0], [0, 3, 1], [0, 2, 3], [1, 3, 2]]);
    expect(homology(reversed).orientable).toBe(false);
    expect(predictCensus(reversed).orientable).toBe(false);
  });

  it("does not report a genus for a disconnected mesh", () => {
    // Two disjoint closed tetrahedra: watertight, but (2−χ)/2 = −1 is
    // nonsense across two components, so genus is null and components is 2.
    const two = meshOf(
      [
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
        [10, 0, 0], [11, 0, 0], [10, 1, 0], [10, 0, 1],
      ],
      [
        [0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2],
        [4, 5, 6], [4, 7, 5], [4, 6, 7], [5, 7, 6],
      ],
    );
    const c = predictCensus(two);
    expect(c.watertight).toBe(true);
    expect(c.components).toBe(2);
    expect(c.genus).toBeNull();
    // A single tetra still reports genus 0.
    expect(predictCensus(tetra()).genus).toBe(0);
    expect(predictCensus(tetra()).components).toBe(1);
  });

  it("refuses an out-of-range or negative face index rather than corrupting the mesh", () => {
    expect(() => meshOf([[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 1, 7]])).toThrow(/index 7/);
    expect(() => meshOf([[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 1, -1]])).toThrow(/index -1/);
    expect(() => meshOf([[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 1]])).toThrow(/at least 3/);
  });

  it("accepts a many-sided face — no per-face side cap (infinitely scalable)", () => {
    // A 600-sided ring is a legitimate profile, not a runaway; meshOf builds it.
    const pts = Array.from({ length: 600 }, (_, i) => [i, i * i, 0] as [number, number, number]);
    const face = Array.from({ length: 600 }, (_, i) => i);
    expect(() => meshOf(pts, [face])).not.toThrow();
  });

  it("refuses a face whose vertices WELD to one (coincident points collapse an edge)", () => {
    // Indices 0 and 1 are distinct but share a coordinate, so welding maps the
    // face to [0, 0, 1] — a zero-area face. The distinctness gate runs AFTER the
    // weld, so this is caught at authoring, not left for a downstream check.
    expect(() => meshOf([[0, 0, 0], [0, 0, 0], [1, 0, 0]], [[0, 1, 2]])).toThrow(/collapse to one/);
    // A literal repeated index is still refused by the same gate.
    expect(() => meshOf([[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 1, 1]])).toThrow(/collapse to one/);
  });
});

describe("kernel: creases keep chosen edges sharp under subdivision", () => {
  const census = (recipe: (r: Recorder) => Recorder) =>
    predictCensus(evalTrace(recipe(new Recorder().box()).trace()));

  it("a fully-creased box stays an EXACT cube — every edge sharp, no rounding", () => {
    // crease({}) marks every edge; all eight corners then have three sharp
    // edges (the corner rule), so they stay put and the box does not shrink.
    const creased = census((r) => r.crease({}).subdivide(2));
    expect(creased.max).toEqual([1, 1, 1]);
    expect(creased.min).toEqual([-1, -1, -1]);
    expect(creased.watertight).toBe(true);
    // The smooth box, by contrast, rounds inward off the corners.
    const smooth = census((r) => r.subdivide(2));
    expect(smooth.max[0]).toBeLessThan(1);
    expect(smooth.max[0]).toBeGreaterThan(0);
  });

  it("creasing only the base edges keeps a flat sharp bottom while the top rounds", () => {
    const m = census((r) => r.crease({ z: ["-1", "-1"] }).subdivide(2));
    expect(m.min[2]).toBe(-1); // the base stayed crisp at z = -1
    expect(m.max[2]).toBeLessThan(1); // the free top rounded inward
    expect(m.watertight).toBe(true);
  });

  it("crease is topology-preserving — same counts as the smooth subdivision", () => {
    // Only the rules that place points change, never how many there are, so
    // the predicted census (and its claim) is unaffected.
    const creased = census((r) => r.crease({}).subdivide(1));
    const smooth = census((r) => r.subdivide(1));
    expect([creased.vertices, creased.edges, creased.faces]).toEqual([
      smooth.vertices,
      smooth.edges,
      smooth.faces,
    ]);
  });

  it("a creased recipe is deterministic", () => {
    const r = () => new Recorder().box().crease({ z: ["-1", "-1"] }).subdivide(2).trace();
    expect(traceHash(r())).toBe(traceHash(r()));
  });

  it("mirror carries a crease to the reflected copy", () => {
    // A quad with its far edge (verts 1-2) creased, mirrored across x = 0: the
    // result keeps that crease on BOTH copies — the edge and its reflection.
    const quad = meshOf([[1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0]], [[0, 1, 2, 3]]);
    const withCrease: KernelMesh = { ...quad, creases: new Set([edgeKey(1, 2)]) };
    const m = mirror(withCrease, 0);
    expect(m.creases?.size).toBe(2);
    // The subdivide runs over the carried creases without error and is closed
    // as a doubled shell only where topology allows; the point is the crease
    // set survived the reflect+weld.
    expect(() => subdivideCatmullClark(m)).not.toThrow();
  });
});

describe("kernel: soundness fixes (red-team)", () => {
  it("a pinch/bowtie vertex is NOT called watertight (mirror with an apex on the plane)", () => {
    // A valid square pyramid whose apex sits exactly on x=0; mirroring welds
    // the apex to itself, making two shells meet at one point — edge-manifold
    // but not a 2-manifold. The edge-only check used to call it watertight
    // with genus -0.5.
    const pyramid = meshOf(
      [[1, -1, 0], [2, -1, 0], [2, 1, 0], [1, 1, 0], [0, 0, 1]],
      [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
    );
    expect(predictCensus(pyramid).watertight).toBe(true); // the base is a valid solid
    const c = predictCensus(mirror(pyramid, 0));
    expect(c.nonManifoldVertices).toBeGreaterThan(0);
    expect(c.watertight).toBe(false); // the pinch is caught
    expect(c.genus).toBeNull(); // no fractional/negative genus
  });

  it("subdivision does not crash on an orphan vertex", () => {
    // A point unreferenced by any face is legitimate (predictCensus counts it);
    // the vertex-point rule used to call ratMean on an empty set and throw.
    const m = meshOf([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [5, 5, 5]], [[0, 1, 2, 3]]);
    expect(() => subdivideCatmullClark(m)).not.toThrow();
    expect(predictCensus(subdivideCatmullClark(m)).components).toBe(2); // orphan survives as its own component
  });

  it("meshOf refuses a face with a repeated vertex index", () => {
    expect(() => meshOf([[0, 0, 0], [1, 0, 0], [1, 1, 0]], [[0, 0, 1]])).toThrow(/collapse to one/);
  });

  it("subdivides to a deep level with no arbitrary cap (infinitely scalable)", () => {
    // No `levels`/face ceiling: subdivide runs however deep the author asks. A
    // level-5 cube (~6k faces) is a legitimately smooth surface, not a runaway.
    const box = () =>
      meshOf(
        [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
        [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
      );
    const deep = subdivide(box(), 5);
    expect(deep.faces.length).toBe(6 * 4 ** 5); // every level all-quads, no refusal
  });
});

describe("kernel: boundaries are handled, not ignored", () => {
  it("an open grid stays open and refines its boundary as a B-spline", () => {
    // A single quad is an open patch: four boundary edges, not watertight.
    const patch = meshOf([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 1, 2, 3]]);
    const c0 = predictCensus(patch);
    expect(c0.boundaryEdges).toBe(4);
    expect(c0.watertight).toBe(false);
    expect(c0.genus).toBe(null);

    // One step: the single quad becomes 4 quads; the boundary doubles to 8
    // edges, still exactly the open border (no interior edge leaks out).
    const c1 = predictCensus(subdivideCatmullClark(patch));
    expect(c1.faces).toBe(4);
    expect(c1.boundaryEdges).toBe(8);
    expect(c1.watertight).toBe(false);
  });
});
