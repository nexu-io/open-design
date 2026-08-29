import { describe, expect, it } from "vitest";
import { rat } from "../src/kernel/rational.js";
import type { Rational } from "../src/kernel/rational.js";
import { meshOf, predictCensus } from "../src/kernel/mesh.js";
import type { KernelMesh } from "../src/kernel/mesh.js";
import { clip } from "../src/kernel/clip.js";
import { Recorder, evalTrace } from "../src/kernel/trace.js";

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

  it("round-trips through the recipe recorder and evaluator", () => {
    // box(1) is [-1,1]³ (volume 8); clip z ≤ 1/2 keeps a 2×2×(3/2) box, volume 6.
    const mesh = evalTrace(new Recorder().box(1).clip([0, 0, 1], "1/2").trace());
    const c = predictCensus(mesh, { mass: true });
    expect(c.watertight).toBe(true);
    expect(c.genus).toBe(0);
    expect(c.mass!.volumeExact).toBe("6");
    expect(c.mass!.embed).toEqual({ kind: "embedded" });
  });

  it("the evaluator refuses a degenerate (zero) plane normal", () => {
    expect(() => evalTrace(new Recorder().box(1).clip([0, 0, 0], "1/2").trace())).toThrow(/non-zero normal/);
  });

  it("the evaluator names a malformed clip payload (direct trace, bypassing parse validation)", () => {
    // A directly-constructed trace (a test, a future front-end) with a bad clip
    // op gets a NAMED error, never an opaque `undefined.split` out of the parser.
    const boxOps = new Recorder().box(1).trace().ops;
    const withBadClip = (clipOp: unknown) => ({ version: 1 as const, ops: [...boxOps, clipOp as never] });
    expect(() => evalTrace(withBadClip({ op: "clip", d: "1/2" }))).toThrow(/rational strings/); // no normal
    expect(() => evalTrace(withBadClip({ op: "clip", normal: [1, 2, 3], d: "1/2" }))).toThrow(/rational strings/); // numeric components
    expect(() => evalTrace(withBadClip({ op: "clip", normal: ["0", "0", "1"] }))).toThrow(/rational strings/); // no d
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

describe("clip — cut plane coincident with existing geometry", () => {
  it("caps a diagonal cut that passes exactly through the box's vertices", () => {
    /*
     * The plane x+z=1 passes exactly through v1=(1,0,0), v2=(1,1,0),
     * v4=(0,0,1), v7=(0,1,1). The cap is the quad through those four vertices.
     * The old per-face cut-edge collection missed the two on-plane edges whose
     * OTHER face was dropped or kept verbatim, so it produced only two of the
     * four boundary edges and emitted NO cap — an open, non-watertight solid.
     * The residual (unmatched half-edge) boundary sees all four.
     */
    const cut = clip(box(1, 1, 1), plane(1, 0, 1, rat(1)));
    const c = predictCensus(cut, { mass: true });
    expect(c.watertight, "a cut through existing vertices must still cap").toBe(true);
    expect(c.genus).toBe(0);
    // Keep x+z ≤ 1 of the unit cube. The removed region is the corner prism
    // above the plane; the kept volume is exact.
    expect(c.mass!.embed).toEqual({ kind: "embedded" });
    expect(c.mass!.volumeExact).toBe("1/2");
  });

  it("keeps a coplanar face that faces the kept side, and does not double-cap it", () => {
    // Plane z=0 (the box's own bottom face), keeping z ≤ 0. The bottom face is
    // coplanar and faces the kept (below) side... actually its outward normal is
    // -z, and we keep z ≤ 0 (below), so the interior is above it — it faces the
    // REMOVED side and must DROP, leaving no solid.
    const slab = clip(box(1, 1, 1), plane(0, 0, 1, rat(0)));
    // Everything is on or above z=0, so keeping z ≤ 0 removes the volume: an
    // empty or degenerate result, never a doubled zero-thickness cap.
    expect(slab.faces.length).toBe(0);
  });

  it("returns the solid unchanged when the plane grazes a single vertex", () => {
    // Plane x+y+z ≤ 3 touches only the far corner (1,1,1) of the unit cube.
    // Nothing is removed; the result is the input, still watertight, no cap.
    const grazed = clip(box(1, 1, 1), plane(1, 1, 1, rat(3)));
    const c = predictCensus(grazed, { mass: true });
    expect(c.watertight).toBe(true);
    expect(c.mass!.volumeExact).toBe("1");
  });
});
