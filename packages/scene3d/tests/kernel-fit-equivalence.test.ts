import { describe, expect, it } from "vitest";
import { fitKernelMesh, fitToBox, toEmitMesh, meshOf } from "../src/kernel/mesh.js";
import type { KernelMesh, RVec3 } from "../src/kernel/mesh.js";
import { ratFromFloat, rat } from "../src/kernel/rational.js";

// Exact rational point from float components (meshOf's number path is
// integer-only; fractional and sub-nanometre extents must arrive as ℚ).
const p = (x: number, y: number, z: number): RVec3 => [ratFromFloat(x), ratFromFloat(y), ratFromFloat(z)];

/**
 * `fitKernelMesh` is documented as the EXACT rational twin of `fitToBox`: a
 * recipe part and a file/script part must land in their declared box the SAME
 * way. The two share one contract but two implementations (ℚ vs float64), and
 * the seam that bites is the degenerate regime — a flat, sub-nanometre, or
 * point-like extent, where `fitToBox`'s 1e-9 division floor decides the scale.
 *
 * This pins equivalence across exactly that regime. Path A fits in ℚ then
 * rounds once (`toEmitMesh`); path B rounds first then fits in float; the two
 * float results must agree to within float noise for EVERY case — otherwise the
 * authoring surface silently changes the placement, which the fit contract
 * forbids.
 */

// A box whose extent on each axis is set explicitly, so a test can make an axis
// thin at will. Every extent here is strictly positive, so the eight corners are
// distinct and nothing welds — the fit reads the true extents.
function boxOf(ex: number, ey: number, ez: number): KernelMesh {
  return meshOf(
    [p(0, 0, 0), p(ex, 0, 0), p(ex, ey, 0), p(0, ey, 0), p(0, 0, ez), p(ex, 0, ez), p(ex, ey, ez), p(0, ey, ez)],
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
  );
}

// A genuinely FLAT panel: one quad of four distinct verts at z=0. Built as a
// single face (not a zero-height box) so the flat case has no coincident
// vertices and no degenerate faces — the z-extent is a clean zero.
function quad(ex: number, ey: number): KernelMesh {
  return meshOf([p(0, 0, 0), p(ex, 0, 0), p(ex, ey, 0), p(0, ey, 0)], [[0, 1, 2, 3]]);
}

// The minimal ZERO-extent input: a single vertex, no faces. Built as a literal
// (meshOf needs a face, and any face on one point would be degenerate) so the
// fit's all-axes-zero fallback is exercised by the cleanest possible mesh.
function singleVertex(x: number, y: number, z: number): KernelMesh {
  return { verts: [p(x, y, z)], faces: [], vertId: ["v0"] };
}

// Path A: fit in ℚ, then the single rounding. Path B: round, then fit in float.
function fitExact(base: KernelMesh, size: [number, number, number]) {
  const r = fitKernelMesh(base, [], [ratFromFloat(size[0]), ratFromFloat(size[1]), ratFromFloat(size[2])]);
  return toEmitMesh(r.base).verts;
}
function fitFloat(base: KernelMesh, size: [number, number, number]) {
  return fitToBox(toEmitMesh(base), [], size).base.verts;
}

function maxAbsDiff(a: Array<[number, number, number]>, b: Array<[number, number, number]>): number {
  expect(a.length).toBe(b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a[i]![k]! - b[i]![k]!));
  return m;
}

describe("fitKernelMesh ≡ fitToBox (exact twin, every regime)", () => {
  const cases: Array<{ name: string; base: KernelMesh; size: [number, number, number] }> = [
    { name: "ordinary box", base: boxOf(1, 1, 1), size: [2, 3, 4] },
    { name: "non-cubic extent", base: boxOf(0.4, 2.5, 0.7), size: [1, 1, 1] },
    { name: "thin z axis (1e-6)", base: boxOf(1, 1, 1e-6), size: [2, 2, 2] },
    { name: "sub-nanometre z axis (1e-11)", base: boxOf(1, 1, 1e-11), size: [2, 2, 2] },
    { name: "flat panel (z extent 0)", base: quad(1, 1), size: [2, 2, 0.5] },
    { name: "all axes sub-nanometre", base: boxOf(1e-11, 2e-11, 3e-11), size: [2, 3, 4] },
  ];

  for (const c of cases) {
    it(`agrees to float noise: ${c.name}`, () => {
      const a = fitExact(c.base, c.size);
      const b = fitFloat(c.base, c.size);
      expect(maxAbsDiff(a, b)).toBeLessThan(1e-9);
    });
  }

  it("beyond float64's grid, the exact fit stays correct while the float path collapses", () => {
    // The boundary the equivalence intentionally does NOT cross: two x-coords one
    // integer apart at 2^53, where float64's step is 2 — both round to the SAME
    // float. `fitKernelMesh` reads the exact extent (1) and preserves it; the
    // float path reads a collapsed extent (0) and flattens the axis. This proves
    // the exact fit is the AUTHORITY (correct past the float grid), not that the
    // two must agree there — they provably cannot.
    const BIG = 9007199254740992n; // 2^53
    const x0 = rat(BIG);
    const x1 = rat(BIG + 1n); // 2^53+1, NOT expressible as a JS number
    const base = meshOf(
      [[x0, rat(0), rat(0)], [x1, rat(0), rat(0)], [x1, rat(1), rat(0)], [x0, rat(1), rat(0)],
       [x0, rat(0), rat(1)], [x1, rat(0), rat(1)], [x1, rat(1), rat(1)], [x0, rat(1), rat(1)]],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
    );
    const xExtent = (vs: Array<[number, number, number]>) =>
      Math.max(...vs.map((v) => v[0])) - Math.min(...vs.map((v) => v[0]));
    // Fit into a box 4 wide on x: the exact fit keeps the unit x-extent (s=1),
    // the float fit collapses it to zero because its two x-coords are one float.
    const exact = toEmitMesh(fitKernelMesh(base, [], [rat(4), rat(1), rat(1)]).base).verts;
    const float = fitToBox(toEmitMesh(base), [], [4, 1, 1]).base.verts;
    expect(xExtent(exact)).toBeCloseTo(1, 6); // extent preserved by the exact fit
    expect(xExtent(float)).toBe(0); // collapsed by the float round — the degraded path
  });

  it("centres a degenerate point at the box floor (not left at authored coords)", () => {
    // A single vertex (zero extent everywhere); both paths must place it at
    // [0,0,−size_z/2], the box-floor centre — the case the old ℚ path skipped.
    const pt = singleVertex(5, 5, 5);
    const a = fitExact(pt, [2, 3, 4]);
    expect(a).toHaveLength(1);
    expect(a[0]![0]).toBeCloseTo(0, 9);
    expect(a[0]![1]).toBeCloseTo(0, 9);
    expect(a[0]![2]).toBeCloseTo(-2, 9); // −size_z/2
    expect(maxAbsDiff(a, fitFloat(pt, [2, 3, 4]))).toBeLessThan(1e-9);
  });
});
