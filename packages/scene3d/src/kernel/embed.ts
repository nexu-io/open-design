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
 * The predicate catches every POSITIVE-MEASURE self-intersection: a triangle
 * edge piercing another's interior (transversal crossing), and two coplanar
 * triangles overlapping in area (a fold). It deliberately does NOT flag
 * measure-zero touches — a shared vertex or edge, an edge endpoint grazing
 * another face, a pierce landing exactly on an edge — because a self-TOUCH of
 * zero area does not change the enclosed volume (signed still equals solid), so
 * it is not a defect for the certificate. A legitimate dihedral (two triangles
 * hinged on a shared edge) touches only on that edge — a boundary, not an
 * interior — so it is silent; a fold that overlaps in area is caught by the
 * coplanar test. The witness pair in a failure names exactly which two faces
 * cross. Every decision is the sign of a rational determinant — no float.
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

/** A triangle with zero area — coincident or collinear vertices, so its normal
 *  (the cross product of two edges) vanishes. It has no interior and no plane. */
function isDegenerate(t: Tri): boolean {
  const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
  return n[0].cmp(ZERO) === 0 && n[1].cmp(ZERO) === 0 && n[2].cmp(ZERO) === 0;
}

/**
 * Where triangle `t` crosses a plane (given each vertex's signed distance `d`
 * and its sign `s`), reported as a CLOSED interval [lo, hi] of the parameter
 * `proj` along the planes' intersection line — or null if it does not span the
 * line. The interval's endpoints are the on-plane vertices (s === 0) and the
 * crossings of each strictly-opposite-sign edge (linear-interpolated exactly:
 * the fraction dᵢ/(dᵢ−dⱼ) along edge i→j, where the denominator is nonzero
 * precisely because the endpoints straddle the plane).
 */
function planeCrossInterval(
  t: Tri,
  d: [Rational, Rational, Rational],
  s: [number, number, number],
  proj: (p: RVec3) => Rational,
): [Rational, Rational] | null {
  const params: Rational[] = [];
  for (let i = 0; i < 3; i++) if (s[i] === 0) params.push(proj(t[i]!));
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if (s[i]! * s[j]! < 0) {
      const pi = proj(t[i]!);
      const pj = proj(t[j]!);
      const w = d[i]!.div(d[i]!.sub(d[j]!)); // fraction of edge i→j at the plane
      params.push(pi.add(pj.sub(pi).mul(w)));
    }
  }
  if (params.length < 2) return null; // a single-point touch spans no interval
  let lo = params[0]!;
  let hi = params[0]!;
  for (const p of params) {
    if (p.cmp(lo) < 0) lo = p;
    if (p.cmp(hi) > 0) hi = p;
  }
  return [lo, hi];
}

/**
 * Do two NON-COPLANAR triangles overlap in area? They do iff each strictly
 * STRADDLES the other's plane (a vertex on each side — a tangential touch along
 * an edge or at a vertex has all of the other triangle weakly on one side and is
 * measure-zero, so it is not a crossing) AND their crossing segments on the
 * planes' intersection line overlap with positive length. This is the complete
 * Möller interval test — it catches transversal crossings the edge-pierces-
 * interior shortcut misses when both triangles cross the line over the SAME
 * interval (every crossing landing on an edge, none in a face interior).
 */
function nonCoplanarTrianglesOverlap(t1: Tri, t2: Tri, n1: RVec3, n2: RVec3): boolean {
  const d2 = t2.map((p) => dot(sub(p, t1[0]), n1)) as [Rational, Rational, Rational];
  const s2 = d2.map(sgn) as [number, number, number];
  if (!(Math.min(...s2) < 0 && Math.max(...s2) > 0)) return false; // t2 not strictly both sides of t1
  const d1 = t1.map((p) => dot(sub(p, t2[0]), n2)) as [Rational, Rational, Rational];
  const s1 = d1.map(sgn) as [number, number, number];
  if (!(Math.min(...s1) < 0 && Math.max(...s1) > 0)) return false; // t1 not strictly both sides of t2
  const D = cross(n1, n2); // direction of the planes' intersection line
  const proj = (p: RVec3): Rational => dot(p, D);
  const i1 = planeCrossInterval(t1, d1, s1, proj);
  const i2 = planeCrossInterval(t2, d2, s2, proj);
  if (!i1 || !i2) return false;
  const lo = i1[0].cmp(i2[0]) >= 0 ? i1[0] : i2[0];
  const hi = i1[1].cmp(i2[1]) <= 0 ? i1[1] : i2[1];
  return lo.cmp(hi) < 0; // the crossing intervals overlap in positive length
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
 * Do two triangles PROPERLY intersect — overlap in positive AREA, not merely
 * share a boundary point? Coplanar meetings are area overlaps (the SAT test);
 * non-coplanar ones are transversal crossings (the complete interval test). A
 * shared vertex or edge, or one triangle grazing the other's plane, is a
 * measure-zero touch that leaves the enclosed volume unchanged — never reported.
 */
export function trianglesProperlyIntersect(t1: Tri, t2: Tri): boolean {
  // A DEGENERATE (zero-area) triangle — two coincident vertices or three
  // collinear ones — has no interior and no well-defined plane, so it cannot
  // properly (positive-measure) intersect anything, and both tests below need a
  // nonzero normal. Reachable when float32 quantization welds two near-coincident
  // verts, so it must be guarded here, not assumed away: not a crossing.
  if (isDegenerate(t1) || isDegenerate(t2)) return false;
  if (coplanar(t1, t2)) return coplanarTrianglesOverlap(t1, t2);
  const n1 = cross(sub(t1[1], t1[0]), sub(t1[2], t1[0]));
  const n2 = cross(sub(t2[1], t2[0]), sub(t2[2], t2[0]));
  return nonCoplanarTrianglesOverlap(t1, t2, n1, n2);
}

/**
 * Exact ear-clipping of ONE face (a simple polygon, possibly non-planar and
 * NON-CONVEX) into triangles — every decision the sign of a rational
 * determinant. A fan from one vertex only tiles a STAR-shaped polygon; an L- or
 * U-shaped cap has no such vertex, so its fan overlaps in-plane (a real
 * self-intersection). Ear-clipping produces a VALID, non-overlapping
 * triangulation of any simple polygon, so its triangles tile the face — they
 * share edges, never area. The face is projected onto the coordinate plane its
 * Newell normal is most aligned with, oriented CCW so a left turn marks a convex
 * ear tip; a tip whose CLOSED triangle contains no other vertex is clipped.
 *
 * The projection is exact and simple for every planar face and every mildly
 * non-planar one (the overwhelming majority). It is NOT the authority on
 * correctness: a pathologically-folded non-planar face can project to a
 * self-crossing polygon, and a bow-tie or fully-collinear ring (which `meshOf`
 * does not reject) finds no ear and falls back to a fan of the remainder. Such a
 * triangulation is never TRUSTED — it is only ever a PROPOSAL. Soundness rests
 * on `embeds()`, which adjudicates the SHIPPED triangles themselves: it tests a
 * face's own triangles against each other (same-face pairs are not skipped) and
 * flags a zero-area triangle, so an invalid triangulation surfaces as a
 * self-intersection or an `unchecked` verdict — never a silently-certified
 * volume. Whatever the projection does, the certificate reports the volume of
 * the actual embedded surface or refuses to report one.
 */
export function triangulateFace(face: readonly number[], verts: readonly RVec3[]): number[][] {
  const n = face.length;
  if (n < 3) return [];
  if (n === 3) return [[face[0]!, face[1]!, face[2]!]];
  // The ear-clip is the choke point for its own cost, so the per-face ceiling is
  // enforced HERE — not only in meshOf — and holds for any caller, however the
  // mesh was assembled (a directly-built KernelMesh, a future front-end). meshOf
  // rejects such a face earlier with a friendlier message; this is the backstop.
  if (n > MAX_FACE_SIDES) {
    throw new Error(`kernel: ear-clipping a ${n}-sided face is over the ${MAX_FACE_SIDES} per-face ceiling`);
  }
  // Newell's normal — exact, and correct even when the polygon is non-planar.
  let nx = ZERO;
  let ny = ZERO;
  let nz = ZERO;
  for (let k = 0; k < n; k++) {
    const a = verts[face[k]!]!;
    const b = verts[face[(k + 1) % n]!]!;
    nx = nx.add(a[1].sub(b[1]).mul(a[2].add(b[2])));
    ny = ny.add(a[2].sub(b[2]).mul(a[0].add(b[0])));
    nz = nz.add(a[0].sub(b[0]).mul(a[1].add(b[1])));
  }
  const abs = (r: Rational): Rational => (r.cmp(ZERO) < 0 ? r.neg() : r);
  const anx = abs(nx);
  const anyv = abs(ny);
  const anz = abs(nz);
  const drop = anx.cmp(anyv) >= 0 ? (anx.cmp(anz) >= 0 ? 0 : 2) : anyv.cmp(anz) >= 0 ? 1 : 2;
  // The ORIENTATION-PRESERVING projection for each dropped axis: (Y,Z) for X,
  // (Z,X) for Y, (X,Y) for Z — each chosen so its 2D cross product is the
  // POSITIVE dropped axis (Y×Z=+X, Z×X=+Y, X×Y=+Z). Using (X,Z) for the Y drop
  // would be left-handed (X×Z=−Y) and read every CCW polygon as clockwise.
  const [ci, cj] = drop === 0 ? [1, 2] : drop === 1 ? [2, 0] : [0, 1];
  // A negative dropped-normal component makes the (ci,cj) projection read
  // clockwise; swap the axes so the polygon reads CCW and convex ⇒ positive turn.
  const flip = (drop === 0 ? nx : drop === 1 ? ny : nz).cmp(ZERO) < 0;
  const px = flip ? cj : ci;
  const py = flip ? ci : cj;
  const at = (vi: number): [Rational, Rational] => [verts[vi]![px]!, verts[vi]![py]!];
  const turn = (a: [Rational, Rational], b: [Rational, Rational], c: [Rational, Rational]): number =>
    b[0].sub(a[0]).mul(c[1].sub(a[1])).sub(b[1].sub(a[1]).mul(c[0].sub(a[0]))).cmp(ZERO);
  // CLOSED containment — inside OR on the boundary of the CCW triangle. A vertex
  // lying exactly on a candidate ear's edge (a reflex tip on the ear's diagonal,
  // a boundary-collinear vertex) must INVALIDATE that ear: clipping it anyway
  // would run the new diagonal through that vertex and overlap the triangle that
  // later consumes it. Strict-interior containment misses that touch; `>= 0`
  // rejects the ear, and the two-ears theorem guarantees another ear remains.
  const insideT = (pt: [Rational, Rational], a: [Rational, Rational], b: [Rational, Rational], c: [Rational, Rational]): boolean =>
    turn(a, b, pt) >= 0 && turn(b, c, pt) >= 0 && turn(c, a, pt) >= 0;
  const poly = [...face];
  const tris: number[][] = [];
  let guard = n * n + 8;
  while (poly.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < poly.length; k++) {
      const m = poly.length;
      const ip = poly[(k - 1 + m) % m]!;
      const ic = poly[k]!;
      const iN = poly[(k + 1) % m]!;
      const A = at(ip);
      const B = at(ic);
      const C = at(iN);
      if (turn(A, B, C) <= 0) continue; // reflex or straight — not a convex ear tip
      let empty = true;
      for (const other of poly) {
        if (other === ip || other === ic || other === iN) continue;
        if (insideT(at(other), A, B, C)) {
          empty = false;
          break;
        }
      }
      if (!empty) continue;
      tris.push([ip, ic, iN]);
      poly.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // no ear found — malformed polygon; fan the remainder (embeds() backstops it)
  }
  if (poly.length === 3) tris.push([poly[0]!, poly[1]!, poly[2]!]);
  else for (let k = 1; k + 1 < poly.length; k++) tris.push([poly[0]!, poly[k]!, poly[k + 1]!]);
  return tris;
}

/**
 * The most sides ONE face may have. Exact ear-clipping (`triangulateFace`) of an
 * n-gon costs up to ~O(n²) rational-arithmetic work, so an unbounded single face
 * would let one hand-authored `cage` polygon stall the compiler even though the
 * total FACE count stays under its ceiling. Far above any real hand-authored
 * face (a high-resolution profile is tens of sides); a 512-gon is already
 * absurd, and the round primitives that legitimately want hundreds of sides are
 * emitted by the shape backend, not caged here. Lives beside the ear-clip it
 * bounds; meshOf imports it to reject an over-cap face at authoring time.
 */
export const MAX_FACE_SIDES = 512;

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
 * Beyond this many triangle-PAIR comparisons the sweep stops and reports the
 * embedding UNCHECKED. Sweep-and-prune is near-linear when triangles spread along
 * x, but a within-cap mesh whose AABBs all share an x-range degrades to O(n²)
 * exact-determinant comparisons; this budget bounds that long tail to a few
 * seconds of rational arithmetic instead of letting it stall the compiler. Far
 * above any real mesh's pair count (each triangle meets a handful of neighbours).
 */
export const EMBED_PAIR_CAP = 4_000_000;

/**
 * The first STRUCTURAL defect in a mesh's face list — a face with fewer than
 * three vertices, or one referencing a vertex index outside `0..verts.length−1`
 * — as a human reason, or null when every face is well-formed. This is the
 * arity-and-index floor BELOW geometry: meshOf enforces it (plus welding and the
 * side cap) for authored meshes, and the two ear-clip consumers share it so a
 * directly-assembled KernelMesh is handled the same way at both — the query
 * (`embeds`) degrades to `unchecked`, the operator (`triangulate`) throws —
 * instead of one crashing while the other silently drops the face.
 */
export function firstMalformedFace(mesh: KernelMesh): string | null {
  const nv = mesh.verts.length;
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const f = mesh.faces[fi]!;
    if (f.length < 3) return `face ${fi} has ${f.length} vertices — a face needs at least 3`;
    const seen = new Set<number>();
    for (const i of f) {
      if (!Number.isInteger(i) || i < 0 || i >= nv) return `face ${fi} references vertex ${i}, outside 0..${nv - 1}`;
      // A repeated index collapses an edge to zero length — the same defect meshOf
      // rejects after welding; caught here so a directly-assembled face is refused
      // structurally, before the ear-clip could emit a zero-area triangle.
      if (seen.has(i)) return `face ${fi} repeats vertex ${i} — a face's vertices must be distinct`;
      seen.add(i);
    }
  }
  return null;
}

/**
 * Prove the mesh embeds (bounds a solid), or find a witness pair of FACES that
 * does not. Each polygon is triangulated by the SAME exact ear-clipping the
 * `triangulate` operator ships (`triangulateFace`), so a face's triangles tile
 * it — they share edges, never area — for convex and non-convex faces alike; a
 * witness is reported by ORIGINAL face index. Sweep-and-prune on x (compare only
 * triangles whose x-ranges overlap, AABB-reject the rest) keeps the real work
 * near-linear on ordinary meshes while every kept comparison is the exact
 * predicate above.
 *
 * Same-face pairs are TESTED, not skipped: a valid ear-clip tiling never
 * properly self-intersects (adjacent triangles meet on a shared edge, a boundary
 * the strict-interior predicate ignores), so testing them costs a valid mesh
 * nothing — but a MALFORMED face (a bow-tie ring `meshOf` accepts, whose fallback
 * fan overlaps) then surfaces as a witness instead of hiding behind the skip.
 */
export function embeds(mesh: KernelMesh): EmbedResult {
  const V = mesh.verts;
  // embeds is TOTAL over any KernelMesh: a structurally malformed mesh (a short
  // face, or an out-of-range index — reachable only outside meshOf) is UNCHECKED,
  // never a thrown TypeError from dereferencing a missing vertex and never a
  // silent embed of a mesh with a hole.
  const malformed = firstMalformedFace(mesh);
  if (malformed) return { kind: "unchecked", reason: `${malformed} — a malformed mesh, uncertified` };
  // Bound the work BEFORE ear-clipping: a valid triangulation of the mesh is
  // exactly Σ(sides − 2) triangles, so this is the same threshold `items.length`
  // would hit — checked up front so an over-cap mesh never pays the ear-clip.
  let projected = 0;
  let maxSides = 0;
  for (const f of mesh.faces) {
    projected += f.length - 2;
    if (f.length > maxSides) maxSides = f.length;
  }
  if (projected > EMBED_FACE_CAP) {
    return { kind: "unchecked", reason: `the mesh has ${projected} triangles, over the ${EMBED_FACE_CAP} embedding-test cap` };
  }
  // A single face over the ear-clip ceiling would cost unbounded work; degrade to
  // unchecked here rather than let triangulateFace throw from inside the sweep.
  if (maxSides > MAX_FACE_SIDES) {
    return { kind: "unchecked", reason: `a face has ${maxSides} sides, over the ${MAX_FACE_SIDES} per-face ear-clip ceiling` };
  }
  // Ear-clip every face into a valid triangle tiling, remembering the source face.
  const items: Array<{ face: number; lo: RVec3; hi: RVec3; tri: Tri }> = [];
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    for (const idx of triangulateFace(mesh.faces[fi]!, V)) {
      const t: Tri = [V[idx[0]!]!, V[idx[1]!]!, V[idx[2]!]!];
      // A DEGENERATE (zero-area) shipped triangle means the face collapsed — a
      // pair of verts welded by float32 quantization, or a collinear ring. The
      // surface is then SINGULAR, so the embedded-solid hypothesis the volume
      // theorem rests on cannot be certified: report it, never silently embed.
      if (isDegenerate(t)) {
        return { kind: "unchecked", reason: `face ${fi} has a zero-area (collapsed) triangle in the shipped mesh, so its embedding is uncertified` };
      }
      const [a, b, c] = t;
      items.push({
        face: fi,
        lo: [minR(a[0], b[0], c[0]), minR(a[1], b[1], c[1]), minR(a[2], b[2], c[2])],
        hi: [maxR(a[0], b[0], c[0]), maxR(a[1], b[1], c[1]), maxR(a[2], b[2], c[2])],
        tri: t,
      });
    }
  }
  // Sweep on x: process triangles left-to-right, keeping an active set whose
  // max-x has not yet passed the current triangle's min-x.
  const order = items.map((_, i) => i).sort((p, q) => items[p]!.lo[0].cmp(items[q]!.lo[0]));
  const active: number[] = [];
  let comparisons = 0;
  for (const idx of order) {
    const bi = items[idx]!;
    for (let a = active.length - 1; a >= 0; a--) {
      if (items[active[a]!]!.hi[0].cmp(bi.lo[0]) < 0) active.splice(a, 1);
    }
    for (const other of active) {
      // Bound the exact-determinant work: a dense (all-AABBs-overlap) mesh would
      // otherwise run O(n²) comparisons. Names what it left rather than stalling.
      if (++comparisons > EMBED_PAIR_CAP) {
        return { kind: "unchecked", reason: `the embedding sweep passed ${EMBED_PAIR_CAP} triangle-pair comparisons (a dense mesh), so its embedding is unchecked` };
      }
      const bo = items[other]!;
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
