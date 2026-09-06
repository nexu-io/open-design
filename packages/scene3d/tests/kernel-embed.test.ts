import { describe, expect, it } from "vitest";
import { rat } from "../src/kernel/rational.js";
import type { Rational } from "../src/kernel/rational.js";
import { meshOf, triangulate } from "../src/kernel/mesh.js";
import type { KernelMesh, RVec3 } from "../src/kernel/mesh.js";
import { embeds, triangulateFace, trianglesProperlyIntersect, type Tri } from "../src/kernel/embed.js";

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

  it("ear-clips a CONCAVE (L-shaped) face into a VALID triangulation — in EVERY plane", () => {
    // An L-hexagon (reflex at index 3) laid in each coordinate plane, so the
    // Newell normal's dominant axis is x, y, then z in turn — exercising all
    // three projection cases. A fan from a reflex-adjacent vertex would cross
    // outside the polygon; ear-clipping must not, so the triangulated faces must
    // pairwise NOT properly intersect regardless of orientation. (A wrong-handed
    // projection would silently fall back to that self-intersecting fan.)
    const l2 = [
      [0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3],
    ] as const;
    const planes: Array<(u: number, w: number) => RVec3> = [
      (u, w) => v(u, w, 0), // XY  → normal ‖ z
      (u, w) => v(u, 0, w), // XZ  → normal ‖ y (the drop-Y case Manifold caught)
      (u, w) => v(0, u, w), // YZ  → normal ‖ x
    ];
    for (const place of planes) {
      const pts: RVec3[] = l2.map(([u, w]) => place(u, w));
      const tris = triangulateFace([0, 1, 2, 3, 4, 5], pts);
      expect(tris.length).toBe(4); // n − 2, a real ear-clip (not a dropped face)
      const T = (t: number[]): Tri => [pts[t[0]!]!, pts[t[1]!]!, pts[t[2]!]!];
      for (let i = 0; i < tris.length; i++) {
        for (let j = i + 1; j < tris.length; j++) {
          expect(trianglesProperlyIntersect(T(tris[i]!), T(tris[j]!))).toBe(false);
        }
      }
    }
  });

  it("catches a TRANSVERSAL criss-cross whose crossings all land on edges (edge-pierce test misses it)", () => {
    // Two triangles in perpendicular planes (z=0 and y=0) crossing through the
    // origin. Each crosses the other's plane over the SAME x-interval [−1.5,1.5],
    // and every crossing point sits on an EDGE of the other triangle — never in a
    // face interior — so an edge-pierces-interior test reports nothing. But the
    // open chord is interior to BOTH triangles: a real transversal self-crossing.
    const t1 = tri([-2, -1, 0], [2, -1, 0], [0, 3, 0]); // z = 0
    const t2 = tri([-2, 0, -1], [2, 0, -1], [0, 0, 3]); // y = 0
    expect(trianglesProperlyIntersect(t1, t2)).toBe(true);
  });

  it("a shared-edge DIHEDRAL with both hinge verts on the plane is NOT a crossing", () => {
    // The straddle guard must not fire on the boundary touch: t2's hinge verts lie
    // ON t1's plane (sign 0) and its apex is strictly on one side — never both.
    const t1 = tri([0, 0, 0], [4, 0, 0], [0, 0, 4]); // y = 0
    const t2 = tri([0, 0, 0], [4, 0, 0], [0, 4, 0]); // z = 0, hinged on the x-axis
    expect(trianglesProperlyIntersect(t1, t2)).toBe(false);
  });

  it("ear-clips a ring with a vertex ON a candidate ear's edge into a valid triangulation", () => {
    // A CCW ring whose reflex vertex (1,1) lies exactly on the line x+y=2 — the
    // diagonal of the ears at (0,0) and (2,0). A strict-interior emptiness test
    // would clip those ears anyway and overlap; closed containment must reject
    // them and pick ears that fan cleanly around (1,1).
    const pts: RVec3[] = [v(0, 0, 0), v(2, 0, 0), v(2, 2, 0), v(1, 1, 0), v(0, 2, 0)];
    const tris = triangulateFace([0, 1, 2, 3, 4], pts);
    expect(tris.length).toBe(3); // n − 2
    const T = (t: number[]): Tri => [pts[t[0]!]!, pts[t[1]!]!, pts[t[2]!]!];
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        expect(trianglesProperlyIntersect(T(tris[i]!), T(tris[j]!))).toBe(false);
      }
    }
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

  it("catches a MALFORMED (bow-tie) face's self-overlap — same-face pairs are not skipped", () => {
    // A self-crossing quad ring meshOf accepts (four distinct verts, no repeat):
    // edges 0-1 and 2-3 cross. Its triangulation cannot be valid, so its own
    // triangles overlap. Because embeds() tests a face against ITSELF, that
    // overlap surfaces as a witness (both indices the same face) instead of
    // hiding behind a same-face skip.
    const bowtie: KernelMesh = {
      verts: [v(0, 0, 0), v(1, 1, 0), v(1, 0, 0), v(0, 1, 0)],
      faces: [[0, 1, 2, 3]],
      vertId: ["a", "b", "c", "d"],
    };
    const r = embeds(bowtie);
    expect(r.kind).toBe("selfIntersects");
    if (r.kind === "selfIntersects") expect(r.faceA).toBe(0);
  });

  it("reports UNCHECKED (never a silent embed) when a shipped face has collapsed to zero area", () => {
    // A face whose three vertices are collinear (as float32 quantization can weld
    // a face flat) is singular — it has no interior, so the embedded-solid
    // hypothesis can't be certified. embeds() must say so, not skip it and embed.
    const singular: KernelMesh = {
      verts: [v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(0, 1, 0)],
      faces: [[0, 1, 2], [0, 2, 3]],
      vertId: ["a", "b", "c", "d"],
    };
    const r = embeds(singular);
    expect(r.kind).toBe("unchecked");
    if (r.kind === "unchecked") expect(r.reason).toContain("collapsed");
  });

  it("ear-clips a large simple polygon without a size cap (infinitely scalable)", () => {
    // No per-face ceiling: a 700-sided convex polygon triangulates into 698
    // triangles and embeds as a valid tiling. Large faces are allowed, not
    // refused — the work meter, not a face-count cap, is the runaway guard.
    const n = 700;
    const verts = Array.from({ length: n }, (_, i) => {
      // A regular-ish convex ring on integer-ish coordinates (exact rationals).
      const a = (2 * Math.PI * i) / n;
      return v(Math.round(1000 * Math.cos(a)), Math.round(1000 * Math.sin(a)), 0);
    });
    const face = Array.from({ length: n }, (_, i) => i);
    const tris = triangulateFace(face, verts);
    expect(tris.length).toBe(n - 2);
  });

  it("is TOTAL: an out-of-range face index yields UNCHECKED, never a thrown TypeError", () => {
    // A directly-assembled mesh (bypassing meshOf) whose face names a vertex that
    // does not exist. embeds() must return a controlled verdict, not crash on a
    // missing vertex.
    const bad: KernelMesh = { verts: [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)], faces: [[0, 1, 99]], vertId: ["a", "b", "c"] };
    const r = embeds(bad);
    expect(r.kind).toBe("unchecked");
    if (r.kind === "unchecked") expect(r.reason).toContain("outside");
  });

  it("triangulate() REJECTS a malformed mesh rather than silently dropping the face", () => {
    const shortFace: KernelMesh = { verts: [v(0, 0, 0), v(1, 0, 0)], faces: [[0, 1]], vertId: ["a", "b"] };
    expect(() => triangulate(shortFace)).toThrow(/malformed mesh/);
    const badIndex: KernelMesh = { verts: [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)], faces: [[0, 1, 5]], vertId: ["a", "b", "c"] };
    expect(() => triangulate(badIndex)).toThrow(/malformed mesh/);
    // A repeated index (would ear-clip to a zero-area triangle) is structural — refused.
    const repeat: KernelMesh = { verts: [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)], faces: [[0, 1, 1, 2]], vertId: ["a", "b", "c"] };
    expect(() => triangulate(repeat)).toThrow(/malformed mesh/);
    expect(embeds(repeat).kind).toBe("unchecked"); // and embeds degrades, never throws
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
