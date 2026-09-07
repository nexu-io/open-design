// The O(n log n) exact monotone triangulator. Correctness here ships real
// geometry (the `triangulate` op), so it is validated to the strongest exact
// invariant fable named: the output triangles' signed areas SUM to the polygon's
// signed area — over ℚ, exactly — with exactly n−2 triangles, each strictly CCW.
// That single trio catches missed coverage, outside triangles (a missed merge
// diagonal), overlaps (double-counted area), degenerate/zero-area triangles, and
// wrong winding. Driven over hand-built adversarial polygons AND thousands of
// random simple polygons (varying n, with horizontal-collinear runs).

import { describe, expect, it } from "vitest";
import { Rational } from "../src/kernel/rational.js";
import { triangulateSimplePolygon, type P2 } from "../src/kernel/triangulate.js";
import { meshOf, triangulate } from "../src/kernel/mesh.js";
import { trianglesProperlyIntersect, type Tri } from "../src/kernel/embed.js";

const R = (n: number) => Rational.of(BigInt(n));
const TWO = R(2);

/** 2× signed area (shoelace), exact. CCW ⇒ positive. */
function areaX2(pts: Array<[Rational, Rational]>): Rational {
  let s = Rational.ZERO;
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = pts[k]!;
    const b = pts[(k + 1) % n]!;
    s = s.add(a[0].mul(b[1]).sub(b[0].mul(a[1])));
  }
  return s;
}
const triX2 = (a: [Rational, Rational], b: [Rational, Rational], c: [Rational, Rational]): Rational =>
  b[0].sub(a[0]).mul(c[1].sub(a[1])).sub(b[1].sub(a[1]).mul(c[0].sub(a[0])));

/** Build a CCW P2 ring from integer 2D coords (reversed if authored CW). */
function ring(coords: Array<[number, number]>): P2[] {
  const pts = coords.map(([x, y]) => [R(x), R(y)] as [Rational, Rational]);
  const cw = areaX2(pts).cmp(Rational.ZERO) < 0;
  const ordered = cw ? [...coords].reverse() : coords;
  return ordered.map(([x, y], k) => ({ x: R(x), y: R(y), i: k, k }));
}

/** The full correctness certificate for one polygon. */
function assertValid(poly: P2[], label: string): void {
  const n = poly.length;
  const P: Array<[Rational, Rational]> = poly.map((p) => [p.x, p.y]);
  const byI = new Map(poly.map((p) => [p.i, [p.x, p.y] as [Rational, Rational]]));
  const tris = triangulateSimplePolygon(poly);

  expect(tris.length, `${label}: triangle count`).toBe(n - 2);
  let sum = Rational.ZERO;
  for (const [a, b, c] of tris) {
    const ax2 = triX2(byI.get(a)!, byI.get(b)!, byI.get(c)!);
    expect(ax2.cmp(Rational.ZERO), `${label}: triangle [${a},${b},${c}] must be strictly CCW`).toBeGreaterThan(0);
    sum = sum.add(ax2);
  }
  // Σ signed triangle area == polygon signed area, EXACTLY.
  expect(sum.eq(areaX2(P)), `${label}: area coverage (got 2A=${sum.toString()} vs poly 2A=${areaX2(P).toString()})`).toBe(true);
}

describe("triangulateSimplePolygon — exact O(n log n) monotone triangulation", () => {
  it("triangulates convex polygons (triangle … decagon)", () => {
    for (let n = 3; n <= 10; n++) {
      const coords: Array<[number, number]> = [];
      // A convex polygon on a coarse circle with integer-ish points: use a regular
      // n-gon scaled so points are distinct integers via a simple lattice.
      for (let k = 0; k < n; k++) {
        // lattice convex: sort by angle around origin, radius 100.
        const ang = (2 * Math.PI * k) / n;
        coords.push([Math.round(100 * Math.cos(ang)), Math.round(100 * Math.sin(ang))]);
      }
      assertValid(ring(coords), `convex n=${n}`);
    }
  });

  it("triangulates the classic non-convex shapes (L, U, plus, comb)", () => {
    assertValid(ring([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]), "L-hex");
    assertValid(ring([[0, 0], [4, 0], [4, 3], [3, 3], [3, 1], [1, 1], [1, 3], [0, 3]]), "U");
    assertValid(ring([[1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1]]), "plus");
    // A downward comb — stacked SPLIT vertices (the merge/split stress fable named).
    assertValid(ring([[0, 10], [10, 10], [10, 0], [8, 0], [8, 6], [6, 6], [6, 0], [4, 0], [4, 6], [2, 6], [2, 0], [0, 0]]), "down-comb");
    // An upward comb — stacked MERGE vertices (the END-path merge diagonal).
    assertValid(ring([[0, 0], [10, 0], [10, 10], [8, 10], [8, 4], [6, 4], [6, 10], [4, 10], [4, 4], [2, 4], [2, 10], [0, 10]]), "up-comb");
    // A W/M zigzag — interleaved split AND merge, the exact pattern that hides a
    // missed merge-helper diagonal.
    assertValid(ring([[0, 0], [2, 5], [4, 1], [6, 5], [8, 1], [10, 5], [12, 0], [12, 8], [0, 8]]), "W-zigzag");
  });

  it("survives horizontal-collinear runs (equal-y spans stress the rotated order)", () => {
    assertValid(ring([[0, 0], [1, 0], [2, 0], [3, 0], [3, 2], [2, 2], [1, 2], [0, 2]]), "flat top+bottom");
    assertValid(ring([[0, 0], [4, 0], [4, 2], [3, 2], [3, 4], [1, 4], [1, 2], [0, 2]]), "T-shape flat runs");
    // reflex vertex exactly on a would-be diagonal (the ear-clip's closed-containment case)
    assertValid(ring([[0, 0], [2, 0], [2, 2], [1, 1], [0, 2]]), "reflex on diagonal");
  });

  it("stays valid across thousands of random simple (star-shaped) polygons", () => {
    // Seeded LCG — reproducible; tests may use pseudo-randomness (the kernel may
    // not, but this is a test). Star-shaped-around-centre keeps them simple while
    // spanning convex and deeply non-convex.
    let seed = 0x1234abcd;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000);
    let checked = 0;
    for (let trial = 0; trial < 3000; trial++) {
      const n = 4 + Math.floor(rnd() * 24); // 4..27 sides
      // One vertex per angular sector (jittered within it) at a random radius:
      // monotonic angles that SPAN the full circle, so the centre is enclosed and
      // the ring is a genuine simple star-shaped polygon (convex AND deeply
      // non-convex). A plain sorted-random-angle set can cluster in one sector,
      // leaving the centre outside — a self-crossing ring, not a valid input.
      const angs = Array.from({ length: n }, (_, k) => (k + rnd() * 0.9) * ((2 * Math.PI) / n));
      const coords = angs.map((a) => {
        const r = 20 + Math.floor(rnd() * 180);
        return [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))] as [number, number];
      });
      // Skip a degenerate draw (duplicate/collinear rounding collapsed a vertex);
      // those are the certificate's job, not this correctness sweep.
      const poly = ring(coords);
      const P: Array<[Rational, Rational]> = poly.map((p) => [p.x, p.y]);
      if (areaX2(P).cmp(Rational.ZERO) <= 0) continue; // collapsed to zero area
      // reject rings with a coincident consecutive point after rounding
      let ok = true;
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k]!;
        const b = poly[(k + 1) % poly.length]!;
        if (a.x.eq(b.x) && a.y.eq(b.y)) { ok = false; break; }
      }
      if (!ok) continue;
      assertValid(poly, `random#${trial} n=${n}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(2000); // the sweep really ran
  });

  it("stays exact at scale (large n exercises the treap sweep status)", () => {
    let seed = 0xcafe1234;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000);
    for (const n of [50, 137, 400, 1000]) {
      const coords = Array.from({ length: n }, (_, k) => {
        const a = (k + rnd() * 0.9) * ((2 * Math.PI) / n);
        const r = 100 + Math.floor(rnd() * 900);
        return [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))] as [number, number];
      });
      const poly = ring(coords);
      // reject a rounding-coincident consecutive pair
      let ok = true;
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k]!;
        const q = poly[(k + 1) % poly.length]!;
        if (p.x.eq(q.x) && p.y.eq(q.y)) { ok = false; break; }
      }
      if (!ok) continue;
      assertValid(poly, `large n=${n}`);
    }
  });

  it("the SHIPPED triangulate op (mesh.ts → triangulateFace) tiles a non-convex face", () => {
    // The path real geometry takes: meshOf → triangulate op → triangulateFace
    // (now the monotone sweep). An L-face (reflex at index 3) must become n−2=4
    // triangles that pairwise DON'T properly intersect — a valid, non-overlapping
    // tiling of the shipped mesh, not just of the helper.
    const L: Array<[number, number, number]> = [
      [0, 0, 0], [3, 0, 0], [3, 1, 0], [1, 1, 0], [1, 3, 0], [0, 3, 0],
    ];
    const tri = triangulate(meshOf(L, [[0, 1, 2, 3, 4, 5]]));
    expect(tri.faces.length).toBe(4);
    for (const f of tri.faces) expect(f.length).toBe(3);
    const T = (f: number[]): Tri => [tri.verts[f[0]!]!, tri.verts[f[1]!]!, tri.verts[f[2]!]!];
    for (let i = 0; i < tri.faces.length; i++) {
      for (let j = i + 1; j < tri.faces.length; j++) {
        expect(trianglesProperlyIntersect(T(tri.faces[i]!), T(tri.faces[j]!))).toBe(false);
      }
    }
  });

  it("degrades to a finite fan (never throws/loops) on a self-intersecting bowtie", () => {
    // Not a simple polygon; correctness is embeds()' job. We only require FINITE,
    // non-crashing output here.
    const bow: P2[] = [
      { x: R(0), y: R(0), i: 0, k: 0 },
      { x: R(2), y: R(2), i: 1, k: 1 },
      { x: R(2), y: R(0), i: 2, k: 2 },
      { x: R(0), y: R(2), i: 3, k: 3 },
    ];
    const tris = triangulateSimplePolygon(bow);
    expect(Array.isArray(tris)).toBe(true); // finite, no throw/hang
  });
});
