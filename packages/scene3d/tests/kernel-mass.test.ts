import { describe, expect, it } from "vitest";
import { meshOf, predictCensus } from "../src/kernel/mesh.js";
import type { KernelMesh } from "../src/kernel/mesh.js";
import { massProperties } from "../src/kernel/mass.js";
import { rat, Rational } from "../src/kernel/rational.js";

/**
 * Exact mass properties — volume, centroid and inertia tensor over ℚ, plus the
 * mass→symmetry bridge (a repeated principal moment, detected by the char
 * cubic's discriminant vanishing, is an axis of rotational mass symmetry).
 *
 * The expectations are the analytic closed forms for an axis-aligned box of
 * side (a,b,c), unit density: mass abc, centroid at the centre, and centroidal
 * moments I = m·(sum of the OTHER two sides²)/12. Every value is a fraction the
 * kernel must reproduce exactly.
 */

/** An axis-aligned box [0,a]×[0,b]×[0,c], outward-wound (cube's face pattern). */
function box(a: number, b: number, c: number, ox = 0, oy = 0, oz = 0): KernelMesh {
  const p = (x: number, y: number, z: number): [number, number, number] => [x + ox, y + oy, z + oz];
  return meshOf(
    [p(0, 0, 0), p(a, 0, 0), p(a, b, 0), p(0, b, 0), p(0, 0, c), p(a, 0, c), p(a, b, c), p(0, b, c)],
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
  );
}

const eq = (r: Rational, n: number, d = 1) => expect(r.eq(rat(n, d)), `${r.toString()} == ${n}/${d}`).toBe(true);
const diag = (m: { inertia: [any, any, any] }) => [m.inertia[0][0], m.inertia[1][1], m.inertia[2][2]];
const offDiagAllZero = (mp: { inertia: [any, any, any] }) =>
  [mp.inertia[0][1], mp.inertia[0][2], mp.inertia[1][0], mp.inertia[1][2], mp.inertia[2][0], mp.inertia[2][1]]
    .every((r: Rational) => r.isZero());

describe("kernel: exact mass properties", () => {
  it("the unit cube [0,1]^3: volume 1, centroid (1/2,1/2,1/2), inertia diag(1/6)", () => {
    const mp = massProperties(box(1, 1, 1))!;
    eq(mp.volume, 1);
    eq(mp.centroid[0], 1, 2); eq(mp.centroid[1], 1, 2); eq(mp.centroid[2], 1, 2);
    for (const d of diag(mp)) eq(d, 1, 6);
    expect(offDiagAllZero(mp)).toBe(true);
    // Triple-equal principal moment => spherical top: an axis of symmetry.
    expect(mp.symmetryAxis).toBe(true);
    expect(mp.discriminant.isZero()).toBe(true);
  });

  it("the [-1,1]^3 cube (side 2, mass 8): inertia diag(16/3), centroid at origin", () => {
    const m = meshOf(
      [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
    );
    const mp = massProperties(m)!;
    eq(mp.volume, 8);
    for (const c of mp.centroid) expect(c.isZero()).toBe(true);
    for (const d of diag(mp)) eq(d, 16, 3);
    expect(mp.symmetryAxis).toBe(true);
  });

  it("a 2x1x1 box has a symmetry AXIS: two equal moments (1/3, 5/6, 5/6)", () => {
    const mp = massProperties(box(2, 1, 1))!;
    eq(mp.volume, 2);
    eq(mp.centroid[0], 1); eq(mp.centroid[1], 1, 2); eq(mp.centroid[2], 1, 2);
    // Ixx = m(1+1)/12 = 1/3 ; Iyy = Izz = m(4+1)/12 = 5/6.
    eq(mp.inertia[0][0], 1, 3);
    eq(mp.inertia[1][1], 5, 6);
    eq(mp.inertia[2][2], 5, 6);
    expect(offDiagAllZero(mp)).toBe(true);
    expect(mp.symmetryAxis).toBe(true); // 5/6 is a repeated principal moment
    expect(mp.discriminant.isZero()).toBe(true);
  });

  it("a 3x2x1 box has NO symmetry axis: three distinct moments (5/2, 5, 13/2)", () => {
    const mp = massProperties(box(3, 2, 1))!;
    eq(mp.volume, 6);
    // Ixx = m(4+1)/12 = 5/2 ; Iyy = m(9+1)/12 = 5 ; Izz = m(9+4)/12 = 13/2.
    eq(mp.inertia[0][0], 5, 2);
    eq(mp.inertia[1][1], 5);
    eq(mp.inertia[2][2], 13, 2);
    expect(mp.symmetryAxis).toBe(false); // all principal moments distinct
    expect(mp.discriminant.isZero()).toBe(false);
  });

  it("the centroidal tensor is TRANSLATION-INVARIANT (parallel axis is exact)", () => {
    const at0 = massProperties(box(3, 2, 1))!;
    const moved = massProperties(box(3, 2, 1, 100, -50, 7))!;
    // Centroid tracks the translation exactly: 100 + 3/2 = 203/2.
    eq(moved.centroid[0], 203, 2);
    // ...but the centroidal inertia is identical (frame-independent mass fact).
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      expect(moved.inertia[i][j].eq(at0.inertia[i][j])).toBe(true);
    }
    expect(moved.charPoly.every((c, k) => c.eq(at0.charPoly[k]!))).toBe(true);
  });

  it("returns null for a mesh that encloses no volume (open/degenerate)", () => {
    const openQuad = meshOf([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 1, 2, 3]]);
    expect(massProperties(openQuad)).toBe(null);
  });

  it("volumeAmbiguity is ZERO for a planar-faced solid — its volume is triangulation-universal", () => {
    for (const mp of [massProperties(box(1, 1, 1))!, massProperties(box(2, 3, 5))!]) {
      expect(mp.volumeAmbiguity.isZero()).toBe(true);
    }
  });

  it("volumeAmbiguity is the exact corner-tet twist of a NON-planar quad (1/6)", () => {
    // A cube with one corner lifted to (1,1,2): exactly one non-planar quad.
    // Its fan volume is 4/3; the OTHER diagonal (which Blender picks) gives 7/6;
    // the gap is the corner tet |V_tet| = 1/6 — EXACTLY volumeAmbiguity. So a
    // consumer's re-triangulation lands within 4/3 ± 1/6, and the certificate
    // says so exactly. (Both numbers were confirmed against Blender calc_volume.)
    const perturbed = meshOf(
      [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 2], [0, 1, 1]],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
    );
    const mp = massProperties(perturbed)!;
    eq(mp.volume, 4, 3);
    eq(mp.volumeAmbiguity, 1, 6);
    expect(mp.conditioning.cmp(rat(0)) > 0).toBe(true); // a positive error scale
  });

  it("predictCensus reports NO mass for a multi-component mesh — one sign cannot net two volumes", () => {
    // Two disjoint cubes: each is watertight and internally orientable, but a
    // single global winding sign would give the signed DIFFERENCE, not the
    // total. Mass is well-defined only for a single closed orientable solid,
    // exactly the domain genus is gated to, so it is honestly null here.
    const b = (o: number): [number, number, number][] =>
      [[o, 0, 0], [o + 1, 0, 0], [o + 1, 1, 0], [o, 1, 0], [o, 0, 1], [o + 1, 0, 1], [o + 1, 1, 1], [o, 1, 1]];
    const f = (n: number) => [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]].map((face) => face.map((v) => v + n));
    const two = meshOf([...b(0), ...b(10)], [...f(0), ...f(8)]);
    const c = predictCensus(two, { mass: true });
    expect(c.components).toBe(2);
    expect(c.watertight).toBe(true); // topologically closed...
    expect(c.mass).toBe(null); // ...but not a single solid, so no mass (even with mass requested)
    // A single cube still gets its certificate.
    expect(predictCensus(box(1, 1, 1), { mass: true }).mass?.volumeExact).toBe("1");
  });

  it("returns null (never a non-finite value) for a zero-volume or face-less mesh", () => {
    // The topology gate (watertight, one component, orientable) can admit a
    // degenerate solid: a face-less point cloud, or a closed shell that encloses
    // no volume. The centroid/inertia divide by the volume, so massProperties
    // MUST refuse these before dividing — it returns null on a zero signed
    // volume, so no NaN or Infinity can ever reach a consumer.
    const faceless: KernelMesh = { verts: [[rat(0), rat(0), rat(0)]], faces: [], vertId: ["v0"] };
    expect(massProperties(faceless)).toBe(null);
    // A "flat bag": two triangles over the same three points, opposite winding —
    // a closed orientable 2-manifold that encloses exactly zero volume.
    const flatBag = meshOf([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 1, 2], [0, 2, 1]]);
    expect(massProperties(flatBag)).toBe(null);
    // And through predictCensus: the topology reads closed, but mass is null —
    // not a struct full of NaNs.
    const c = predictCensus(flatBag, { mass: true });
    expect(c.watertight).toBe(true);
    expect(c.components).toBe(1);
    expect(c.mass).toBe(null);
  });
});
