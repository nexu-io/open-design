import { Rational } from "./rational.js";
import type { KernelMesh, RVec3 } from "./mesh.js";

/**
 * Exact embedding test — does a closed mesh BOUND a solid, or merely IMMERSE?
 *
 * The `volume` claim reports the divergence-theorem SIGNED volume, which equals
 * the geometric solid volume ONLY when the surface is EMBEDDED (Jordan–Brouwer:
 * an embedded closed orientable surface has a well-defined bounded interior, and
 * the winding number is its indicator). A self-INTERSECTING closed surface — an
 * immersed sphere, a face folded through the shell — is combinatorially
 * identical to an embedded one (same watertightness, orientation, genus), so no
 * census invariant can tell them apart; the difference is purely geometric and
 * the signed volume double-counts the overlapped region. Embedding is therefore
 * the exact hypothesis the volume theorem needs, and this is the only place that
 * proves it. Every decision reduces to the SIGN of a rational determinant, so it
 * is exact and machine-independent — no float, no tolerance.
 *
 * The predicate is: every pair of the mesh's triangles meets in EXACTLY their
 * shared sub-simplex (a shared vertex, a shared edge, or nothing). Any point
 * they share BEYOND that is a self-intersection. The strict-interior orientation
 * tests below register only such improper meetings: a legitimate dihedral (two
 * triangles hinged on a shared edge) touches only on that edge — a boundary, not
 * an interior — so it is silent; a fold that makes them overlap in area is
 * caught by the coplanar test. The witness pair in a failure is the feature: it
 * names exactly which two faces cross.
 */

const ZERO = Rational.ZERO;
const sub = (a: RVec3, b: RVec3): RVec3 => [a[0].sub(b[0]), a[1].sub(b[1]), a[2].sub(b[2])];
const cross = (a: RVec3, b: RVec3): RVec3 => [
  a[1].mul(b[2]).sub(a[2].mul(b[1])),
  a[2].mul(b[0]).sub(a[0].mul(b[2])),
  a[0].mul(b[1]).sub(a[1].mul(b[0])),
];
const dot = (a: RVec3, b: RVec3): Rational => a[0].mul(b[0]).add(a[1].mul(b[1])).add(a[2].mul(b[2]));
const sgn = (r: Rational): -1 | 0 | 1 => {
  const c = r.cmp(ZERO);
  return c < 0 ? -1 : c > 0 ? 1 : 0;
};

/** orient3d: the SIGN of the signed volume of tetrahedron (a,b,c,d) — i.e. which
 *  side of the oriented plane (a,b,c) the point d lies on. 0 ⟺ d is coplanar. */
function orient3d(a: RVec3, b: RVec3, c: RVec3, d: RVec3): -1 | 0 | 1 {
  return sgn(dot(sub(d, a), cross(sub(b, a), sub(c, a))));
}

export type Tri = [RVec3, RVec3, RVec3];

/**
 * Does the OPEN segment (p,q) pierce the OPEN interior of triangle (a,b,c)?
 * Strict throughout: an endpoint on the plane, or a crossing on an edge or
 * vertex of the triangle, is a boundary touch and returns false — exactly what
 * lets legitimate shared vertices and edges pass without a false intersection.
 */
function segmentPiercesTriangleInterior(p: RVec3, q: RVec3, a: RVec3, b: RVec3, c: RVec3): boolean {
  const sp = orient3d(a, b, c, p);
  const sq = orient3d(a, b, c, q);
  // p and q must lie strictly on OPPOSITE sides of the triangle's plane.
  if (sp === 0 || sq === 0 || sp === sq) return false;
  // The line pq then crosses the plane once; the crossing is strictly inside the
  // triangle iff pq passes the same rotational side of all three edges.
  const o1 = orient3d(p, q, a, b);
  const o2 = orient3d(p, q, b, c);
  const o3 = orient3d(p, q, c, a);
  return o1 !== 0 && o1 === o2 && o2 === o3;
}

/** Are all four points coplanar? (Both triangles lie in one plane.) */
function coplanar(t1: Tri, t2: Tri): boolean {
  return (
    orient3d(t1[0], t1[1], t1[2], t2[0]) === 0 &&
    orient3d(t1[0], t1[1], t1[2], t2[1]) === 0 &&
    orient3d(t1[0], t1[1], t1[2], t2[2]) === 0
  );
}

/** 2D orientation of (a,b,c) after dropping axis `drop` — sign of the signed area. */
const orient2d = (a: RVec3, b: RVec3, c: RVec3, i: 0 | 1 | 2, j: 0 | 1 | 2): -1 | 0 | 1 =>
  sgn(b[i].sub(a[i]).mul(c[j].sub(a[j])).sub(b[j].sub(a[j]).mul(c[i].sub(a[i]))));

/**
 * Do two COPLANAR triangles overlap in AREA (not merely share a boundary)? This
 * is the fold case the interior-pierce test cannot see: two triangles flat in
 * one plane, their interiors intersecting. Projected onto the coordinate plane
 * the shared normal is most aligned with (an exact choice — the axis whose
 * normal component is nonzero), then a 2D separating-axis test: they are DISJOINT
 * iff some edge of one has the whole other triangle weakly on its far side.
 */
function coplanarTrianglesOverlap(t1: Tri, t2: Tri): boolean {
  const n = cross(sub(t1[1], t1[0]), sub(t1[2], t1[0]));
  // Drop the axis of the largest |normal| component so the projection is non-degenerate.
  const ax = n.map((v) => (v.cmp(ZERO) < 0 ? v.neg() : v)) as RVec3;
  const drop = ax[0].cmp(ax[1]) >= 0 ? (ax[0].cmp(ax[2]) >= 0 ? 0 : 2) : ax[1].cmp(ax[2]) >= 0 ? 1 : 2;
  const [i, j] = drop === 0 ? [1, 2] : drop === 1 ? [0, 2] : [0, 1];
  const ii = i as 0 | 1 | 2;
  const jj = j as 0 | 1 | 2;
  // A separating edge from triangle `ta` against `tb`: every vertex of tb is on
  // the OUTWARD side of the directed edge, relative to ta's own third vertex.
  const separatedBy = (tri: Tri, other: Tri): boolean => {
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!;
      const b = tri[(e + 1) % 3]!;
      const inner = orient2d(a, b, tri[(e + 2) % 3]!, ii, jj); // side the triangle is on
      if (inner === 0) continue; // degenerate edge, no information
      // The edge separates the INTERIORS iff no vertex of the other triangle is
      // STRICTLY on the inner side. A vertex on the edge's line (s === 0) is a
      // boundary touch — it does not put area on the inner side, so a triangle
      // that only touches this edge's line is still separated (two triangles
      // meeting at a shared vertex or edge do not overlap in area).
      let allOutside = true;
      for (const v of other) {
        if (orient2d(a, b, v, ii, jj) === inner) {
          allOutside = false; // a vertex is strictly inside this edge's half-plane
          break;
        }
      }
      if (allOutside) return true; // this edge separates them
    }
    return false;
  };
  // Overlap iff NEITHER triangle can separate the other by one of its edges.
  return !(separatedBy(t1, t2) || separatedBy(t2, t1));
}

/**
 * Do two triangles PROPERLY intersect — share a point outside their common
 * sub-simplex? Non-coplanar improper meetings are edges of one piercing the
 * interior of the other; coplanar ones are area overlaps.
 */
export function trianglesProperlyIntersect(t1: Tri, t2: Tri): boolean {
  const edges1: Array<[RVec3, RVec3]> = [
    [t1[0], t1[1]],
    [t1[1], t1[2]],
    [t1[2], t1[0]],
  ];
  const edges2: Array<[RVec3, RVec3]> = [
    [t2[0], t2[1]],
    [t2[1], t2[2]],
    [t2[2], t2[0]],
  ];
  for (const [p, q] of edges1) if (segmentPiercesTriangleInterior(p, q, t2[0], t2[1], t2[2])) return true;
  for (const [p, q] of edges2) if (segmentPiercesTriangleInterior(p, q, t1[0], t1[1], t1[2])) return true;
  if (coplanar(t1, t2)) return coplanarTrianglesOverlap(t1, t2);
  return false;
}

/** The result of the embedding test. `unchecked` reports a bounded search that
 *  hit its cap — never a silent skip (a bounded search names what it left). */
export type EmbedResult =
  | { kind: "embedded" }
  | { kind: "selfIntersects"; faceA: number; faceB: number }
  | { kind: "unchecked"; reason: string };

/** Beyond this triangle count the sweep is not run: the volume claim then reports
 *  its embedding UNCHECKED rather than either spend unbounded time or trust an
 *  unproven immersion. Sized far above any recipe a claim would carry. */
export const EMBED_FACE_CAP = 20_000;

/**
 * Prove the mesh embeds (bounds a solid), or find a witness pair of FACES that
 * does not. Each polygon is fanned into triangles the same way the volume does
 * (planar faces fan into coplanar, non-overlapping triangles, so fanning adds no
 * intersection of its own); a witness is reported by ORIGINAL face index. Only
 * reached once the volume is triangulation-independent, so faces are already
 * planar. Sweep-and-prune on x (compare only triangles whose x-ranges overlap,
 * AABB-reject the rest) keeps the real work near-linear on ordinary meshes while
 * every kept comparison is the exact predicate above.
 */
export function embeds(mesh: KernelMesh): EmbedResult {
  const V = mesh.verts;
  // Fan every face into triangles, remembering which face each came from.
  const items: Array<{ face: number; verts: [number, number, number]; lo: RVec3; hi: RVec3; tri: Tri }> = [];
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi]!;
    for (let k = 1; k + 1 < f.length; k++) {
      const idx: [number, number, number] = [f[0]!, f[k]!, f[k + 1]!];
      const a = V[idx[0]]!;
      const b = V[idx[1]]!;
      const c = V[idx[2]]!;
      items.push({
        face: fi,
        verts: idx,
        lo: [minR(a[0], b[0], c[0]), minR(a[1], b[1], c[1]), minR(a[2], b[2], c[2])],
        hi: [maxR(a[0], b[0], c[0]), maxR(a[1], b[1], c[1]), maxR(a[2], b[2], c[2])],
        tri: [a, b, c],
      });
    }
  }
  if (items.length > EMBED_FACE_CAP) {
    return { kind: "unchecked", reason: `the mesh has ${items.length} triangles, over the ${EMBED_FACE_CAP} embedding-test cap` };
  }
  // Sweep on x: process triangles left-to-right, keeping an active set whose
  // max-x has not yet passed the current triangle's min-x.
  const order = items.map((_, i) => i).sort((p, q) => items[p]!.lo[0].cmp(items[q]!.lo[0]));
  const active: number[] = [];
  for (const idx of order) {
    const bi = items[idx]!;
    for (let a = active.length - 1; a >= 0; a--) {
      if (items[active[a]!]!.hi[0].cmp(bi.lo[0]) < 0) active.splice(a, 1);
    }
    for (const other of active) {
      const bo = items[other]!;
      // A single polygon's own fan triangles tile it and legitimately share the
      // fan diagonal — and for a planar face the fan's signed area is the polygon
      // area regardless, so an intra-face overlap does not corrupt the volume.
      // Skip only THOSE; every other pair — including two DIFFERENT faces that
      // share an edge or vertex — is tested, because `trianglesProperlyIntersect`
      // already distinguishes a legitimate dihedral / flat quad-split (no proper
      // intersection) from a coplanar FOLD (overlap): the shared simplex is a
      // boundary the strict-interior predicate ignores, and a fold is caught by
      // the coplanar-overlap test. Skipping edge-adjacent pairs would miss folds.
      if (bi.face === bo.face) continue;
      if (aabbDisjoint(bi.lo, bi.hi, bo.lo, bo.hi)) continue;
      if (trianglesProperlyIntersect(bi.tri, bo.tri)) {
        return { kind: "selfIntersects", faceA: Math.min(bi.face, bo.face), faceB: Math.max(bi.face, bo.face) };
      }
    }
    active.push(idx);
  }
  return { kind: "embedded" };
}

const minR = (a: Rational, b: Rational, c: Rational): Rational => (a.cmp(b) <= 0 ? (a.cmp(c) <= 0 ? a : c) : b.cmp(c) <= 0 ? b : c);
const maxR = (a: Rational, b: Rational, c: Rational): Rational => (a.cmp(b) >= 0 ? (a.cmp(c) >= 0 ? a : c) : b.cmp(c) >= 0 ? b : c);
const aabbDisjoint = (lo1: RVec3, hi1: RVec3, lo2: RVec3, hi2: RVec3): boolean =>
  hi1[0].cmp(lo2[0]) < 0 || hi2[0].cmp(lo1[0]) < 0 ||
  hi1[1].cmp(lo2[1]) < 0 || hi2[1].cmp(lo1[1]) < 0 ||
  hi1[2].cmp(lo2[2]) < 0 || hi2[2].cmp(lo1[2]) < 0;
