import { describe, expect, it } from "vitest";
import { rat } from "../src/kernel/rational.js";
import type { Rational } from "../src/kernel/rational.js";
import { meshOf, predictCensus } from "../src/kernel/mesh.js";
import type { KernelMesh } from "../src/kernel/mesh.js";
import { clip } from "../src/kernel/clip.js";

/**
 * Exact half-space clipping — the first CSG operator. Every fact is an exact
 * rational: a clipped box has a rational volume to the last bit, and the census
 * (watertight, genus, embedded) adjudicates that the cut capped a real solid.
 */

const box = (a: number, b: number, c: number): KernelMesh =>
  meshOf(
    [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]],
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
  );

const plane = (nx: number, ny: number, nz: number, d: Rational) => ({ normal: [rat(nx), rat(ny), rat(nz)] as [Rational, Rational, Rational], d });

describe("clip — exact half-space cut", () => {
  it("halves a unit box to an exact half-volume solid, still watertight", () => {
    // Keep z ≤ 1/2 of the unit cube → a 1×1×½ box, volume exactly 1/2.
    const half = clip(box(1, 1, 1), plane(0, 0, 1, rat(1, 2)));
    const c = predictCensus(half, { mass: true });
    expect(c.watertight).toBe(true);
    expect(c.genus).toBe(0);
    expect(c.mass!.volumeExact).toBe("1/2");
    expect(c.mass!.embed).toEqual({ kind: "embedded" });
  });

  it("chamfers a cube corner — the removed tetrahedron is exact (47/48)", () => {
    // Keep x+y+z ≤ 5/2 of the unit cube: the (1,1,1) corner tet with legs 1/2 is
    // removed. Its volume is (1/2)³/6 = 1/48, so the solid is 47/48, and the cut
    // leaves ONE new triangular facet — the chamfer.
    const chamfer = clip(box(1, 1, 1), plane(1, 1, 1, rat(5, 2)));
    const c = predictCensus(chamfer, { mass: true });
    expect(c.watertight).toBe(true);
    expect(c.genus).toBe(0);
    expect(c.mass!.volumeExact).toBe("47/48");
    expect(c.mass!.embed).toEqual({ kind: "embedded" });
  });

  it("a plane the solid does not reach keeps every part (volume unchanged)", () => {
    const whole = clip(box(1, 1, 1), plane(0, 0, 1, rat(2)));
    const c = predictCensus(whole, { mass: true });
    expect(c.watertight).toBe(true);
    expect(c.mass!.volumeExact).toBe("1");
  });

  it("a plane past the far side removes everything (empty result)", () => {
    const gone = clip(box(1, 1, 1), plane(0, 0, 1, rat(-1)));
    expect(gone.faces.length).toBe(0);
    expect(gone.verts.length).toBe(0);
  });

  it("two opposed clips carve an exact slab (a box minus both ends)", () => {
    // Keep 1/4 ≤ z ≤ 3/4: clip z ≤ 3/4, then −z ≤ −1/4. A 1×1×1/2 slab, vol 1/2.
    const top = clip(box(1, 1, 1), plane(0, 0, 1, rat(3, 4)));
    const slab = clip(top, plane(0, 0, -1, rat(-1, 4)));
    const c = predictCensus(slab, { mass: true });
    expect(c.watertight).toBe(true);
    expect(c.genus).toBe(0);
    expect(c.mass!.volumeExact).toBe("1/2");
    expect(c.mass!.embed).toEqual({ kind: "embedded" });
  });
});
