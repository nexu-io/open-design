import { describe, expect, it } from "vitest";
import { Rational, rat } from "../src/kernel/rational.js";
import {
  KernelMesh,
  meshOf,
  mirror,
  predictCensus,
  RVec3,
  subdivide,
  subdivideCatmullClark,
} from "../src/kernel/mesh.js";
import { boundaryMatrices, homology, rankQ } from "../src/kernel/homology.js";

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
    // convex combination is that point. Any weight drift would move it.
    const p: [number, number, number] = [2, -3, 5];
    const degenerate = meshOf(
      Array.from({ length: 8 }, () => p),
      cube().faces,
    );
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
