import { describe, expect, it } from "vitest";
import { rat } from "../src/kernel/rational.js";
import type { Rational } from "../src/kernel/rational.js";
import { meshOf, triangulate } from "../src/kernel/mesh.js";
import type { KernelMesh } from "../src/kernel/mesh.js";
import { embeds, trianglesProperlyIntersect, type Tri } from "../src/kernel/embed.js";

/**
 * The exact embedding certificate — does a mesh BOUND a solid (so its signed
 * volume IS the solid volume), or self-intersect (an immersion whose signed
 * volume double-counts)? Every decision is the sign of a rational determinant.
 */

const v = (x: number, y: number, z: number): [Rational, Rational, Rational] => [rat(x), rat(y), rat(z)];
const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]): Tri =>
  [v(...a), v(...b), v(...c)];

describe("trianglesProperlyIntersect — the exact pairwise predicate", () => {
  it("two far-apart triangles do not intersect", () => {
    expect(trianglesProperlyIntersect(tri([0, 0, 0], [1, 0, 0], [0, 1, 0]), tri([10, 10, 10], [11, 10, 10], [10, 11, 10]))).toBe(false);
  });

  it("an edge of one PIERCING the interior of the other is a proper intersection", () => {
    // T1 lies in z=0; T2 is vertical and its edge stabs through T1's interior at (1,1,0).
    const t1 = tri([0, 0, 0], [4, 0, 0], [0, 4, 0]);
    const t2 = tri([1, 1, -1], [1, 1, 1], [3, 1, 0]);
    expect(trianglesProperlyIntersect(t1, t2)).toBe(true);
  });

  it("a hinged DIHEDRAL (shared edge, different planes) does NOT intersect", () => {
    // Both contain the x-axis edge (0,0,0)-(4,0,0) but fold into different planes.
    const t1 = tri([0, 0, 0], [4, 0, 0], [0, 0, 4]); // y = 0
    const t2 = tri([0, 0, 0], [4, 0, 0], [0, 4, 0]); // z = 0
    expect(trianglesProperlyIntersect(t1, t2)).toBe(false);
  });

  it("a COPLANAR fold (one triangle inside the other) overlaps", () => {
    const t1 = tri([0, 0, 0], [4, 0, 0], [0, 4, 0]);
    const t2 = tri([1, 1, 0], [3, 1, 0], [1, 3, 0]); // inside t1, same plane
    expect(trianglesProperlyIntersect(t1, t2)).toBe(true);
  });

  it("a coplanar flat SPLIT (shared edge, opposite sides) does NOT overlap", () => {
    // The two halves of a square meeting on the diagonal — a legitimate quad fan.
    const t1 = tri([0, 0, 0], [4, 0, 0], [0, 4, 0]);
    const t2 = tri([4, 0, 0], [4, 4, 0], [0, 4, 0]);
    expect(trianglesProperlyIntersect(t1, t2)).toBe(false);
  });

  it("coplanar triangles sharing only a VERTEX, extending apart, do not overlap", () => {
    const t1 = tri([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    const t2 = tri([0, 0, 0], [-1, 0, 0], [0, -1, 0]);
    expect(trianglesProperlyIntersect(t1, t2)).toBe(false);
  });

  it("catches a CONCAVE-FAN fold: two coplanar triangles sharing an edge, SAME side", () => {
    // The fan of a concave quad from a reflex vertex: (0,1,2) and (0,2,3) share
    // the diagonal 0-2, are coplanar, and both third vertices fall on the same
    // side of it, so the triangles overlap in area — a self-intersection an
    // edge-adjacency skip would have missed.
    const a = tri([5, 5, 0], [0, 0, 0], [10, 0, 0]); // 0,1,2
    const b = tri([5, 5, 0], [10, 0, 0], [5, 2, 0]); // 0,2,3 — third vertex on the SAME side of 0-2
    expect(trianglesProperlyIntersect(a, b)).toBe(true);
  });
});

describe("embeds — the whole-mesh sweep", () => {
  const box = (a: number, b: number, c: number): KernelMesh =>
    meshOf(
      [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
    );

  it("a box embeds (bounds a solid) — quads fanned internally", () => {
    expect(embeds(box(1, 2, 3))).toEqual({ kind: "embedded" }); // planar quads
    expect(embeds(triangulate(box(1, 2, 3)))).toEqual({ kind: "embedded" }); // already triangles
  });

  it("the triangulated perturbed cube (a real recipe shape) embeds", () => {
    const perturbed = meshOf(
      [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 2], [0, 1, 1]],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
    );
    expect(embeds(triangulate(perturbed))).toEqual({ kind: "embedded" });
  });

  it("finds and NAMES a self-intersecting pair (two crossing triangles)", () => {
    // A face soup where face 1 stabs through face 0 — an immersion witness.
    const soup: KernelMesh = {
      verts: [v(0, 0, 0), v(4, 0, 0), v(0, 4, 0), v(1, 1, -1), v(1, 1, 1), v(3, 1, 0)],
      faces: [[0, 1, 2], [3, 4, 5]],
      vertId: ["a", "b", "c", "d", "e", "f"],
    };
    const r = embeds(soup);
    expect(r.kind).toBe("selfIntersects");
    if (r.kind === "selfIntersects") {
      expect(r.faceA).toBe(0);
      expect(r.faceB).toBe(1);
    }
  });

  it("catches a real CLOSED-MANIFOLD immersion (a cube vertex poked through the shell)", () => {
    // Topologically a cube — watertight, genus 0, orientable — but vertex 6 is
    // moved BELOW the mesh, so the faces carrying it dip through the bottom face.
    // Connectivity checks all pass; only the exact geometric test sees the
    // self-intersection.
    const immersed = meshOf(
      [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0), v(0, 0, 1), v(1, 0, 1), [rat(1, 2), rat(1, 2), rat(-1, 2)], v(0, 1, 1)],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
    );
    expect(embeds(immersed).kind).toBe("selfIntersects");
  });

  it("reports UNCHECKED (never a silent skip) when the mesh is over the face cap", () => {
    // A degenerate 'mesh' of many faces over few verts: the sweep would exceed
    // its cap, so the embedding is honestly unchecked rather than half-searched.
    const faces = Array.from({ length: 30_000 }, () => [0, 1, 2]);
    const huge: KernelMesh = { verts: [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)], faces, vertId: ["a", "b", "c"] };
    const r = embeds(huge);
    expect(r.kind).toBe("unchecked");
    if (r.kind === "unchecked") expect(r.reason).toContain("cap");
  });
});
