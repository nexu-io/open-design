import { Rational, rat, ratMean, ratFromFloat } from "./rational.js";
import { massProperties } from "./mass.js";
import { embeds, triangulateFace, firstMalformedFace, MAX_FACE_SIDES, type EmbedResult } from "./embed.js";

/**
 * The deterministic geometry kernel: exact meshes and the operators over them.
 *
 * A KernelMesh is vertices at EXACT RATIONAL coordinates plus polygon faces.
 * Two things follow from "exact", and they are the whole point:
 *
 *  1. The weld is an integer PERMUTATION, not a distance tolerance. Vertices
 *     are deduplicated by their exact coordinate key, so two points that
 *     should coincide either ARE the same index or provably are not — there
 *     is no epsilon in which a seam can hide (the failure a float mesh scan
 *     calls "closed" while a slit is still open). That is what lets the
 *     predicted census assert watertightness before Blender ever runs.
 *  2. Catmull-Clark subdivision is a rational averaging operator, so a cage
 *     authored at rational coordinates stays exactly rational through any
 *     number of levels — the same bytes on every machine, because nothing in
 *     the kernel is transcendental. The one rounding is at emit, once.
 *
 * Every vertex also carries a provenance id — a path describing how it was
 * derived (`f(...)`, `e(...)`, a seed name) — so a named vertex set survives
 * a procedural edit and a morph can be keyed by identity rather than index.
 * The census and the geometry never read it; it is the ledger.
 */

export type RVec3 = [Rational, Rational, Rational];

/**
 * Loud ceiling on kernel mesh size — the backstop `MAX_REPEAT_COUNT` is for the
 * solver. Catmull-Clark quadruples faces per level, so an unbounded
 * `subdivide` is the one runaway multiplier that can hang the compiler's main
 * thread and OOM it: it is O(1) to record but exponential to evaluate. The
 * guard fires on the PROJECTED size before allocating, so an absurd recipe
 * refuses loudly instead of running the machine out of memory. Far above any
 * real recipe (a level-4 box is 1,536 faces); a single part at this ceiling is
 * already the whole scene's triangle budget.
 */
export const MAX_KERNEL_FACES = 100_000;

export function rvec(x: readonly [number, number, number] | RVec3): RVec3 {
  if (x[0] instanceof Rational) return [x[0], x[1] as Rational, x[2] as Rational];
  return [rat(x[0]), rat(x[1] as number), rat(x[2] as number)];
}

const addV = (a: RVec3, b: RVec3): RVec3 => [a[0].add(b[0]), a[1].add(b[1]), a[2].add(b[2])];
const meanV = (vs: readonly RVec3[]): RVec3 => [
  ratMean(vs.map((v) => v[0])),
  ratMean(vs.map((v) => v[1])),
  ratMean(vs.map((v) => v[2])),
];
const scaleV = (v: RVec3, s: Rational): RVec3 => [v[0].mul(s), v[1].mul(s), v[2].mul(s)];
/** Exact coordinate identity — the weld key. */
const keyV = (v: RVec3): string => `${v[0].key()},${v[1].key()},${v[2].key()}`;

export interface KernelMesh {
  verts: RVec3[];
  /** Each face is an ordered ring of vertex indices (consistent winding). */
  faces: number[][];
  /** Provenance path per vertex — the operator ledger (never read by census). */
  vertId: string[];
  /**
   * Edges marked infinitely SHARP (by `edgeKey`), if any. Catmull-Clark keeps
   * a creased edge crisp — its edge point is the midpoint and its endpoints
   * follow the crease/corner rules — so a subdivided box can keep a flat base
   * or hard corners instead of rounding everywhere. Creases propagate to
   * child edges through subdivision. Absent = fully smooth.
   */
  creases?: ReadonlySet<string>;
}

/**
 * Builds a mesh while welding coincident vertices by EXACT coordinate. The
 * first provenance id to reach a coordinate wins, deterministically, so the
 * ledger is stable regardless of the order faces are added.
 */
export class MeshBuilder {
  private readonly index = new Map<string, number>();
  readonly verts: RVec3[] = [];
  readonly vertId: string[] = [];
  readonly faces: number[][] = [];

  vertex(v: RVec3, id: string): number {
    const k = keyV(v);
    const existing = this.index.get(k);
    if (existing !== undefined) return existing;
    const i = this.verts.length;
    this.verts.push(v);
    this.vertId.push(id);
    this.index.set(k, i);
    return i;
  }

  face(indices: number[]): void {
    this.faces.push(indices);
  }

  build(): KernelMesh {
    return { verts: this.verts, faces: this.faces, vertId: this.vertId };
  }
}

/** Author a mesh from integer/rational coordinates, welding duplicates. */
export function meshOf(
  points: ReadonlyArray<readonly [number, number, number] | RVec3>,
  faces: ReadonlyArray<readonly number[]>,
  ids?: ReadonlyArray<string>,
): KernelMesh {
  const b = new MeshBuilder();
  // Remap through the welding builder so equal coordinates collapse to one
  // index even if the caller listed them twice.
  const remap = points.map((p, i) => b.vertex(rvec(p), ids?.[i] ?? `v${i}`));
  // Validate here — the single choke point every producer flows through
  // (evalTrace's `cage` calls meshOf), so a hand-assembled trace or a future
  // front-end cannot slip an out-of-range or negative face index past into a
  // silently corrupt mesh (`remap[i]` would be undefined and land in a face).
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi]!;
    if (f.length < 3) {
      throw new Error(`meshOf: face ${fi} has ${f.length} vertices — a face needs at least 3`);
    }
    if (f.length > MAX_FACE_SIDES) {
      throw new Error(
        `meshOf: face ${fi} has ${f.length} sides, over the ${MAX_FACE_SIDES} per-face ceiling — split it, or build the profile from the shape primitives`,
      );
    }
    for (const i of f) {
      if (!Number.isInteger(i) || i < 0 || i >= points.length) {
        throw new Error(`meshOf: face ${fi} references vertex index ${i}, outside 0..${points.length - 1}`);
      }
    }
    // A repeated vertex in one face collapses two of its edges onto one key and
    // corrupts the edge/boundary count — a degenerate face. Checked AFTER welding
    // (remap), so two DISTINCT input points at the SAME coordinate — which
    // collapse to one vertex and would leave a zero-length edge — are caught here
    // too, not only a literal repeated index.
    const remapped = f.map((i) => remap[i]!);
    if (new Set(remapped).size !== remapped.length) {
      throw new Error(
        `meshOf: face ${fi} has vertices that collapse to one (a repeated index, or two coincident points) — a face's vertices must be distinct`,
      );
    }
    b.face(remapped);
  }
  if (b.faces.length > MAX_KERNEL_FACES) {
    throw new Error(`kernel: a cage of ${b.faces.length} faces is over the ${MAX_KERNEL_FACES} ceiling`);
  }
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Topology                                                            */
/* ------------------------------------------------------------------ */

interface EdgeRec {
  a: number;
  b: number;
  faces: number[];
}

/** The one undirected-edge key. Exported so every consumer (topology,
 *  subdivision, the boundary operators in homology.ts) keys edges the same
 *  way — a reimplemented separator is exactly how they last drifted. */
export const edgeKey = (a: number, b: number): string => (a < b ? `${a} ${b}` : `${b} ${a}`);

/** Undirected edges with their incident faces (1 = boundary, 2 = interior). */
export function edgesOf(mesh: KernelMesh): Map<string, EdgeRec> {
  const edges = new Map<string, EdgeRec>();
  mesh.faces.forEach((f, fi) => {
    for (let k = 0; k < f.length; k++) {
      const a = f[k]!;
      const b = f[(k + 1) % f.length]!;
      const key = edgeKey(a, b);
      let e = edges.get(key);
      if (!e) {
        e = { a: Math.min(a, b), b: Math.max(a, b), faces: [] };
        edges.set(key, e);
      }
      e.faces.push(fi);
    }
  });
  return edges;
}

/**
 * Is the mesh's winding globally consistent (orientable as wound)?
 *
 * A consistently oriented surface traverses every interior edge in OPPOSITE
 * directions across its two faces, so the two signed traversals cancel; a
 * reversed face or a non-orientable seam (a Möbius closing) makes some edge
 * carry the SAME direction twice. Summing the per-face signed traversals per
 * undirected edge, an interior edge is consistent iff that sum is zero.
 *
 * This replaces a check that summed ∂1∘∂2 — which is the identity "the
 * boundary of a boundary is zero", true for ANY cell complex regardless of
 * orientation, so it could never fail and detected nothing.
 */
export function orientationConsistent(mesh: KernelMesh): boolean {
  const dir = new Map<string, number>();
  for (const f of mesh.faces) {
    for (let k = 0; k < f.length; k++) {
      const u = f[k]!;
      const v = f[(k + 1) % f.length]!;
      const key = edgeKey(u, v);
      dir.set(key, (dir.get(key) ?? 0) + (u < v ? 1 : -1));
    }
  }
  for (const e of edgesOf(mesh).values()) {
    // Only manifold interior edges carry an orientation constraint; boundary
    // (1 face) and non-manifold (3+) edges are judged by other rules.
    if (e.faces.length === 2 && dir.get(edgeKey(e.a, e.b)) !== 0) return false;
  }
  return true;
}

/**
 * Vertices where the incident faces do NOT form a single fan — a pinch/bowtie:
 * two otherwise-closed shells meeting at one shared point. Every edge there is
 * still 2-face (edge-manifold), so an edge-only test misses it, yet it is not a
 * valid 2-manifold. The test is the vertex LINK: each incident face contributes
 * the edge between the vertex's two neighbours in that face; a manifold vertex's
 * link is a single connected path or cycle, a pinch's link is two or more
 * disjoint components. Reachable through `mirror` when a vertex sits on the
 * plane (an apex/pole on the seam), so it must be caught before `watertight` is
 * asserted.
 */
export function countNonManifoldVertices(mesh: KernelMesh): number {
  const vertFaces: number[][] = mesh.verts.map(() => []);
  mesh.faces.forEach((f, fi) => f.forEach((v) => vertFaces[v]!.push(fi)));
  let count = 0;
  for (let v = 0; v < mesh.verts.length; v++) {
    const faces = vertFaces[v]!;
    if (faces.length < 2) continue; // orphan or a single-face corner: no pinch
    const adj = new Map<number, number[]>();
    const nodes = new Set<number>();
    for (const fi of faces) {
      const f = mesh.faces[fi]!;
      const k = f.length;
      const pos = f.indexOf(v);
      const a = f[(pos - 1 + k) % k]!;
      const b = f[(pos + 1) % k]!;
      nodes.add(a);
      nodes.add(b);
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    }
    // Count connected components of the link graph.
    const seen = new Set<number>();
    let comps = 0;
    for (const n of nodes) {
      if (seen.has(n)) continue;
      comps++;
      const stack = [n];
      seen.add(n);
      while (stack.length) {
        const u = stack.pop()!;
        for (const w of adj.get(u) ?? []) if (!seen.has(w)) { seen.add(w); stack.push(w); }
      }
    }
    if (comps > 1) count++;
  }
  return count;
}

/** Connected components over the edge graph (union-find). A vertex in no face
 *  is its own component, so an isolated stray point is counted honestly. */
export function componentCount(mesh: KernelMesh): number {
  const parent = mesh.verts.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[x] !== r) {
      const next = parent[x]!;
      parent[x] = r;
      x = next;
    }
    return r;
  };
  for (const f of mesh.faces) {
    for (let k = 0; k < f.length; k++) {
      const a = find(f[k]!);
      const b = find(f[(k + 1) % f.length]!);
      if (a !== b) parent[a] = b;
    }
  }
  const roots = new Set<number>();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));
  return roots.size;
}

/* ------------------------------------------------------------------ */
/* Catmull-Clark subdivision — the exact rational operator            */
/* ------------------------------------------------------------------ */

const R_1_8 = rat(1, 8);
const R_6 = rat(6);

/**
 * One Catmull-Clark refinement step, in exact rationals.
 *
 * Standard scheme, every rule a convex combination with a small rational
 * weight (so the result is exact and every vertex point stays inside the
 * cage's hull):
 *
 *  - face point  = centroid of the face's vertices;
 *  - edge point  = mean(endpoints, the two adjacent face points) for an
 *    interior edge; midpoint of the endpoints for a boundary edge (so the
 *    boundary refines as a cubic B-spline, independent of the interior);
 *  - vertex point (interior, valence n) = (F + 2R + (n−3)P) / n, with F the
 *    mean of adjacent face points and R the mean of adjacent edge MIDPOINTS;
 *  - vertex point (boundary) = (6P + prev + next) / 8, its two boundary
 *    neighbours only.
 *
 * Every input face of k sides becomes k quads, so the output is all-quads
 * regardless of the input — which is exactly what keeps the emitted geometry
 * ngon-free by construction, like the language's own primitives.
 */
export function subdivideCatmullClark(mesh: KernelMesh): KernelMesh {
  const { verts, faces, vertId } = mesh;
  // Refuse a runaway BEFORE allocating: each face of k sides becomes k quads,
  // so the output face count is exactly the sum of sides.
  const projected = faces.reduce((a, f) => a + f.length, 0);
  if (projected > MAX_KERNEL_FACES) {
    throw new Error(
      `kernel: subdivision would produce ${projected} faces, over the ${MAX_KERNEL_FACES} ceiling — reduce the subdivide levels`,
    );
  }
  const creases = mesh.creases ?? EMPTY_CREASES;
  const edges = edgesOf(mesh);
  // An edge is SHARP when it is a boundary (one face) or an authored crease:
  // both keep the edge crisp (its point is the midpoint, its endpoints follow
  // the crease rule). One predicate, so boundary and crease behave identically.
  const isSharp = (key: string): boolean => edges.get(key)!.faces.length === 1 || creases.has(key);

  // Face points.
  const facePoint = faces.map((f) => meanV(f.map((i) => verts[i]!)));
  const faceId = faces.map((f) => `f(${f.map((i) => vertId[i]).sort().join("|")})`);

  // Edge points + edge midpoints (the latter feed the vertex rule).
  const edgePoint = new Map<string, RVec3>();
  const edgeMid = new Map<string, RVec3>();
  for (const [key, e] of edges) {
    const p1 = verts[e.a]!;
    const p2 = verts[e.b]!;
    const mid = meanV([p1, p2]);
    edgeMid.set(key, mid);
    edgePoint.set(
      key,
      e.faces.length === 2 && !creases.has(key)
        ? meanV([p1, p2, facePoint[e.faces[0]!]!, facePoint[e.faces[1]!]!])
        : mid, // boundary or crease → the sharp midpoint
    );
  }

  // Per-vertex adjacency.
  const vertFaces: number[][] = verts.map(() => []);
  faces.forEach((f, fi) => f.forEach((v) => vertFaces[v]!.push(fi)));
  const vertEdges: string[][] = verts.map(() => []);
  for (const [key, e] of edges) {
    vertEdges[e.a]!.push(key);
    vertEdges[e.b]!.push(key);
  }

  // Vertex points.
  const vertexPoint = verts.map((P, vi): RVec3 => {
    const incident = vertEdges[vi]!;
    // An orphan vertex (no incident edges/faces) has no rule to average — it
    // simply carries through. predictCensus counts orphans as legitimate, so
    // subdivision must not crash on one.
    if (incident.length === 0) return P;
    const sharp = incident.filter(isSharp);
    // Three or more sharp edges pin a CORNER: it stays exactly where it is,
    // which is what gives a fully-creased box its hard corners.
    if (sharp.length >= 3) return P;
    // Exactly two: a crease/boundary vertex runs as a cubic B-spline along the
    // sharp edges, independent of the smooth interior — (6P + n1 + n2) / 8.
    if (sharp.length === 2) {
      const neighbours = sharp.map((k) => {
        const e = edges.get(k)!;
        return verts[e.a === vi ? e.b : e.a]!;
      });
      const sumN = addV(neighbours[0]!, neighbours[1]!);
      return scaleV(addV(scaleV(P, R_6), sumN), R_1_8);
    }
    // Zero sharp edges (interior) or one (a dart): the smooth rule.
    const n = incident.length; // valence = interior edge count = face count
    const F = meanV(vertFaces[vi]!.map((fi) => facePoint[fi]!));
    const R = meanV(incident.map((k) => edgeMid.get(k)!));
    const nR = rat(n);
    // (F + 2R + (n-3)P) / n
    const num = addV(addV(F, scaleV(R, rat(2))), scaleV(P, rat(n - 3)));
    return scaleV(num, Rational.ONE.div(nR));
  });

  // Assign indices DIRECTLY, without welding. Subdivision is topology-
  // refining, so V' = V + F + E must hold exactly: the vertex, face and edge
  // points are distinct by construction, and welding by coordinate would only
  // MERGE points that a prior deformation had coincided — tearing the surface
  // instead of refining it. Geometric degeneracy is the census's concern
  // (zero-area faces); the operator keeps the topology exact.
  const newVerts: RVec3[] = [];
  const newIds: string[] = [];
  const push = (v: RVec3, id: string): number => {
    newVerts.push(v);
    newIds.push(id);
    return newVerts.length - 1;
  };
  const vpIdx = vertexPoint.map((v, i) => push(v, vertId[i]!));
  const fpIdx = facePoint.map((v, i) => push(v, faceId[i]!));
  const epIdx = new Map<string, number>();
  for (const [key, e] of edges) {
    epIdx.set(key, push(edgePoint.get(key)!, `e(${vertId[e.a]}|${vertId[e.b]})`));
  }

  const newFaces: number[][] = [];
  faces.forEach((f, fi) => {
    const k = f.length;
    for (let i = 0; i < k; i++) {
      const vPrev = f[(i - 1 + k) % k]!;
      const v = f[i]!;
      const vNext = f[(i + 1) % k]!;
      newFaces.push([
        vpIdx[v]!,
        epIdx.get(edgeKey(v, vNext))!,
        fpIdx[fi]!,
        epIdx.get(edgeKey(vPrev, v))!,
      ]);
    }
  });
  const out: KernelMesh = { verts: newVerts, faces: newFaces, vertId: newIds };
  // Propagate creases: a sharp edge (a,b) splits at its edge point into two
  // child edges, both sharp. Boundary sharpness needs no propagation — it is
  // rediscovered from the new face counts — so only authored creases carry.
  if (creases.size > 0) {
    const childCreases = new Set<string>();
    for (const key of creases) {
      const e = edges.get(key)!;
      const ep = epIdx.get(key)!;
      childCreases.add(edgeKey(vpIdx[e.a]!, ep));
      childCreases.add(edgeKey(vpIdx[e.b]!, ep));
    }
    return { ...out, creases: childCreases };
  }
  return out;
}

const EMPTY_CREASES: ReadonlySet<string> = new Set<string>();

/** Apply `levels` Catmull-Clark steps. */
export function subdivide(mesh: KernelMesh, levels: number): KernelMesh {
  let m = mesh;
  for (let i = 0; i < levels; i++) m = subdivideCatmullClark(m);
  return m;
}

/**
 * Triangulate every face by EXACT EAR-CLIPPING (`triangulateFace`), fixing ONE
 * valid triangulation into the geometry itself.
 *
 * This is the author's opt-in escape from a triangulation-DEPENDENT volume. A
 * mesh of non-planar quads bounds a RANGE of volumes — one per triangulation,
 * the `volumeAmbiguity` band — so its `volume` claim cannot be a theorem about
 * the shipped asset (glTF/USD re-triangulate and may pick the other diagonal).
 * Triangulating collapses that band to a point: every face becomes a triangle, a
 * triangle is planar, so `volumeAmbiguity` is exactly 0 and the volume is a
 * property of the deliverable AND every re-triangulation of it. For a PLANAR
 * face the volume is unchanged whichever way it splits; for a non-planar face
 * the ear-clip commits to one specific value WITHIN the former band (it need not
 * equal the mass integral's own first-vertex fan diagonal). Topology-only —
 * vertices and their provenance are untouched, and a valid triangulation keeps a
 * closed manifold closed (each original edge still borders two faces; each new
 * diagonal borders the two triangles that share it), so watertightness and genus
 * are invariant; only the face list changes. The trade is quad editability,
 * which is why the AUTHOR reaches for it and the compiler never applies it to
 * rescue a claim.
 *
 * Ear-clipping — NOT a fan from the first vertex, which self-intersects on a
 * concave face (its diagonal leaves the polygon) and would make the shipped
 * surface immerse — yields a valid, non-overlapping triangulation of ANY simple
 * polygon: convex Catmull-Clark quads and a hand-authored concave `cage()` cap
 * alike, so the shipped triangles embed. E-703 confirms the volume against Blender.
 *
 * A STRUCTURALLY malformed mesh (a short face, a repeated or out-of-range index)
 * is refused up front — a topology operator must not silently drop or corrupt a
 * face. "Valid triangulation" is COMBINATORIAL: a geometrically-degenerate input
 * face (collinear vertices — a measurement meshOf's structural gate does not
 * make) yields degenerate triangles, which the embedding certificate reports as
 * uncertified downstream rather than this operator judging geometry itself.
 */
export function triangulate(mesh: KernelMesh): KernelMesh {
  // Reject a structurally malformed mesh rather than SILENTLY drop its bad faces
  // (a sub-3-vertex face ear-clips to nothing): a mesh operator must not quietly
  // change topology. Unreachable through the recipe path (every mesh flows through
  // meshOf), this guards a directly-assembled KernelMesh.
  const malformed = firstMalformedFace(mesh);
  if (malformed) throw new Error(`kernel: triangulate on a malformed mesh — ${malformed}`);
  // The same face-count backstop meshOf and subdivide enforce: an n-gon becomes
  // n-2 triangles, so triangulating near the ceiling would otherwise slip a mesh
  // of up to ~2× MAX_KERNEL_FACES past every downstream cost guard.
  const projected = mesh.faces.reduce((n, f) => n + Math.max(f.length - 2, 0), 0);
  if (projected > MAX_KERNEL_FACES) {
    throw new Error(
      `kernel: triangulation would produce ${projected} faces, over the ${MAX_KERNEL_FACES} ceiling — triangulate a coarser mesh, or subdivide less before it`,
    );
  }
  const faces: number[][] = [];
  for (const f of mesh.faces) for (const t of triangulateFace(f, mesh.verts)) faces.push(t);
  return {
    verts: [...mesh.verts],
    faces,
    vertId: [...mesh.vertId],
    // Original edges survive (each is an edge of some ear-clipped triangle), so
    // a crease on one is still a crease; the new diagonals are simply uncreased.
    ...(mesh.creases ? { creases: mesh.creases } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Structural mirror — bilateral symmetry as a permutation            */
/* ------------------------------------------------------------------ */

/**
 * Reflect a mesh across the plane `axis = 0` and weld it to the original.
 *
 * Because the weld is exact, a vertex lying ON the plane maps to ITSELF (its
 * reflected coordinate is identical), so the seam is shared, not doubled —
 * an integer permutation, not a distance merge. The reflected copy's faces
 * are wound in reverse so the doubled shell keeps a consistent outward
 * orientation. The result is bilaterally symmetric to the last bit by
 * construction: mirror error is exactly zero, not "under 1e-9".
 */
export function mirror(mesh: KernelMesh, axis: 0 | 1 | 2): KernelMesh {
  const b = new MeshBuilder();
  const orig = mesh.verts.map((v, i) => b.vertex(v, mesh.vertId[i]!));
  const reflect = (v: RVec3): RVec3 => {
    const out: RVec3 = [v[0], v[1], v[2]];
    out[axis] = v[axis].neg();
    return out;
  };
  const mirrored = mesh.verts.map((v, i) => b.vertex(reflect(v), `mirror(${mesh.vertId[i]})`));
  for (const f of mesh.faces) {
    b.face(f.map((i) => orig[i]!));
    // Reversed winding on the reflected copy keeps normals outward.
    b.face([...f].reverse().map((i) => mirrored[i]!));
  }
  const out = b.build();
  // A creased edge stays creased on BOTH copies — the original and its
  // reflection — so a mirror of a hard-edged half keeps its hard edges.
  if (mesh.creases && mesh.creases.size > 0) {
    const edges = edgesOf(mesh);
    const carried = new Set<string>();
    for (const key of mesh.creases) {
      const e = edges.get(key)!;
      carried.add(edgeKey(orig[e.a]!, orig[e.b]!));
      carried.add(edgeKey(mirrored[e.a]!, mirrored[e.b]!));
    }
    return { ...out, creases: carried };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Emit boundary — the ONE place a rational becomes a float            */
/* ------------------------------------------------------------------ */

export interface EmitMesh {
  verts: Array<[number, number, number]>;
  faces: number[][];
}

/**
 * Convert an exact mesh to float64 vertices for Blender's `from_pydata`.
 *
 * This is the single rounding in the whole kernel path: every operator ran in
 * exact rationals, and only here — at the boundary to Blender — does a
 * coordinate become a float, once, under one rule. Because the topology is
 * integer (face index lists), it crosses untouched, which is what lets the
 * predicted census (counts, watertightness, genus) be adjudicated as an exact
 * equality against the build.
 */
export function toEmitMesh(mesh: KernelMesh): EmitMesh {
  return {
    verts: mesh.verts.map((v) => [v[0].toNumber(), v[1].toNumber(), v[2].toNumber()]),
    faces: mesh.faces.map((f) => [...f]),
  };
}

/**
 * Fit a base mesh (and every morph target that shares its vertex order) INTO a
 * declared box: uniform scale to the largest that fits, centred on x/y, resting
 * on the box bottom, origin at the box centre — the same envelope `file:` and
 * `script:` parts get. Done in TS rather than Blender precisely because Blender
 * refuses `transform_apply` on a mesh with shape keys; the ONE transform is
 * derived from the BASE and applied to the base and every shape identically, so
 * a blendshape stays a blendshape. The result is local geometry the emitter
 * drops at the part's solved centre.
 */
export function fitToBox(
  base: EmitMesh,
  shapes: Array<{ name: string; mesh: EmitMesh }>,
  size: readonly [number, number, number],
): { base: EmitMesh; shapes: Array<{ name: string; verts: Array<[number, number, number]> }> } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const v of base.verts) {
    for (let i = 0; i < 3; i++) {
      if (v[i]! < min[i]!) min[i] = v[i]!;
      if (v[i]! > max[i]!) max[i] = v[i]!;
    }
  }
  // The floor only guards the DIVISION (a degenerate axis must not divide by
  // zero); it never binds `s` because a near-zero extent gives a huge ratio.
  const dim = [0, 1, 2].map((i) => Math.max(max[i]! - min[i]!, 1e-9));
  const s = Math.min(size[0] / dim[0]!, size[1] / dim[1]!, size[2] / dim[2]!);
  const c = [0, 1, 2].map((i) => (min[i]! + max[i]!) / 2);
  // Bottom-rest on z uses the REAL extent (not the floored one), so a flat
  // panel lands exactly at −size_z/2 rather than a 1e-9·s epsilon above it.
  const dz = -size[2] / 2 + ((max[2]! - min[2]!) * s) / 2;
  const xf = (v: readonly number[]): [number, number, number] => [
    (v[0]! - c[0]!) * s,
    (v[1]! - c[1]!) * s,
    (v[2]! - c[2]!) * s + dz,
  ];
  return {
    base: { verts: base.verts.map(xf), faces: base.faces.map((f) => [...f]) },
    shapes: shapes.map((sh) => ({ name: sh.name, verts: sh.mesh.verts.map(xf) })),
  };
}

/**
 * The EXACT rational twin of {@link fitToBox}, over ℚ — the box-fit done once,
 * before the single rounding at emit.
 *
 * `fitToBox` runs on emitted floats; but the fit scale `s = min size/extent`
 * and the centre/rest offsets are all RATIONAL, so the whole affine is exact.
 * Doing it in ℚ (then `toEmitMesh` once) means the geometry the census/mass
 * reason about IS the geometry that ships — the volume certificate is about
 * what the user receives, not a pre-fit design — and the kernel's own
 * "one rounding at the boundary" invariant is kept. The SAME transform applies
 * to every morph shape, exactly as the float path does.
 *
 * It carries `fitToBox`'s OWN 1e-9 extent floor faithfully into ℚ — the same
 * `max(extent, 1e-9)` guard on the DIVISION, the same raw extent for the z-rest.
 * Where the two can differ is the INPUT, not the formula: `fitKernelMesh` reads
 * the exact rational extent, `fitToBox` reads it after `toEmitMesh` has rounded
 * the coordinates to float64. Wherever float64 represents those coordinates
 * faithfully — the whole bounded domain a recipe actually produces — the two
 * agree to float noise (the equivalence tests pin this from ordinary down to
 * sub-nanometre extents). Beyond it, where distinct coordinates share a float
 * (e.g. 2^53 and 2^53+1), `fitToBox` reads a collapsed extent and mis-scales,
 * while `fitKernelMesh` keeps the true extent and stays correct — it is the
 * EXACT fit, of which `fitToBox` is the float approximation, not the authority.
 * The recipe path uses THIS function, so recipe geometry always gets the exact
 * placement; a same-input divergence would be float64 losing precision, never
 * the rational fit being wrong.
 */
const FIT_FLOOR = rat(1, 1_000_000_000); // fitToBox's 1e-9 division guard, exact in ℚ
export function fitKernelMesh(
  base: KernelMesh,
  shapes: ReadonlyArray<{ name: string; mesh: KernelMesh }>,
  size: readonly [Rational, Rational, Rational],
): { base: KernelMesh; shapes: Array<{ name: string; mesh: KernelMesh }> } {
  if (base.verts.length === 0) return { base, shapes: shapes.map((s) => ({ name: s.name, mesh: s.mesh })) };
  const min: RVec3 = [base.verts[0]![0], base.verts[0]![1], base.verts[0]![2]];
  const max: RVec3 = [base.verts[0]![0], base.verts[0]![1], base.verts[0]![2]];
  for (const v of base.verts) {
    for (let i = 0; i < 3; i++) {
      if (v[i]!.cmp(min[i]!) < 0) min[i] = v[i]!;
      if (v[i]!.cmp(max[i]!) > 0) max[i] = v[i]!;
    }
  }
  const extent: RVec3 = [max[0].sub(min[0]), max[1].sub(min[1]), max[2].sub(min[2])];
  // The floor only guards the DIVISION (a degenerate axis must not divide by
  // zero); it never binds `s`, because a near-zero extent gives a huge ratio the
  // `min` discards — exactly the float path's reasoning. With the floor applied
  // to every axis, `s` is always defined, so there is no degenerate special case.
  const two = rat(2);
  let s: Rational | null = null;
  for (let i = 0; i < 3; i++) {
    const floored = extent[i]!.cmp(FIT_FLOOR) > 0 ? extent[i]! : FIT_FLOOR;
    const ratio = size[i]!.div(floored);
    if (s === null || ratio.cmp(s) < 0) s = ratio;
  }
  const c: RVec3 = [min[0].add(max[0]).div(two), min[1].add(max[1]).div(two), min[2].add(max[2]).div(two)];
  // Bottom-rest on z uses the REAL extent (not the floored one), so a flat panel
  // lands exactly at −size_z/2 rather than a 1e-9·s epsilon above it.
  const dz = size[2]!.div(two).neg().add(extent[2]!.mul(s!).div(two));
  const scale = s!;
  const xf = (v: RVec3): RVec3 => [v[0].sub(c[0]).mul(scale), v[1].sub(c[1]).mul(scale), v[2].sub(c[2]).mul(scale).add(dz)];
  const remap = (m: KernelMesh): KernelMesh => ({
    verts: m.verts.map(xf),
    faces: m.faces.map((f) => [...f]),
    vertId: [...m.vertId],
    ...(m.creases ? { creases: m.creases } : {}),
  });
  return { base: remap(base), shapes: shapes.map((sh) => ({ name: sh.name, mesh: remap(sh.mesh) })) };
}

/* ------------------------------------------------------------------ */
/* Extrude — grow geometry from a face region                          */
/* ------------------------------------------------------------------ */

/**
 * Extrude the faces whose EVERY vertex satisfies `inRegion`, offsetting the
 * new top by an exact rational vector and walling the region's boundary.
 *
 * The offset is a plain vector, not a distance along the face normal — a unit
 * normal needs a square root, which would break the kernel's exactness. The
 * author picks the direction and magnitude as a rational triple (extruding a
 * z-face by [0,0,1] is the normal case, exactly). Winding is chosen so the
 * result stays a consistently oriented, closed manifold for a well-formed
 * region: each boundary edge's wall traverses the base edge opposite to its
 * unselected neighbour, and the top faces keep the selected winding. Base
 * vertices left unreferenced (the interior of a multi-face region) are
 * compacted away, so no orphan verts survive.
 */
export function extrude(
  mesh: KernelMesh,
  inRegion: (v: RVec3) => boolean,
  offset: RVec3,
): KernelMesh {
  const selected: number[] = [];
  mesh.faces.forEach((f, fi) => {
    if (f.every((i) => inRegion(mesh.verts[i]!))) selected.push(fi);
  });
  if (selected.length === 0) return mesh;
  const selSet = new Set(selected);

  // Duplicate every vertex the selected faces use, offset by the vector.
  const selVerts: number[] = [];
  const seen = new Set<number>();
  for (const fi of selected) for (const v of mesh.faces[fi]!) if (!seen.has(v)) { seen.add(v); selVerts.push(v); }
  const verts: RVec3[] = [...mesh.verts];
  const vertId: string[] = [...mesh.vertId];
  const dup = new Map<number, number>();
  for (const v of selVerts) {
    const p = mesh.verts[v]!;
    dup.set(v, verts.length);
    verts.push([p[0].add(offset[0]), p[1].add(offset[1]), p[2].add(offset[2])]);
    vertId.push(`extrude(${mesh.vertId[v]})`);
  }

  // How many SELECTED faces each edge borders — 1 means it is on the region's
  // boundary and needs a wall.
  const selCount = new Map<string, number>();
  for (const fi of selected) {
    const f = mesh.faces[fi]!;
    for (let k = 0; k < f.length; k++) {
      const key = edgeKey(f[k]!, f[(k + 1) % f.length]!);
      selCount.set(key, (selCount.get(key) ?? 0) + 1);
    }
  }

  const faces: number[][] = [];
  mesh.faces.forEach((f, fi) => {
    if (!selSet.has(fi)) faces.push([...f]); // untouched faces
  });
  for (const fi of selected) faces.push(mesh.faces[fi]!.map((v) => dup.get(v)!)); // raised tops
  for (const fi of selected) {
    const f = mesh.faces[fi]!;
    for (let k = 0; k < f.length; k++) {
      const a = f[k]!;
      const b = f[(k + 1) % f.length]!;
      if (selCount.get(edgeKey(a, b)) === 1) {
        // Wall: base edge a->b (opposite the unselected neighbour), up and over.
        faces.push([a, b, dup.get(b)!, dup.get(a)!]);
      }
    }
  }

  // Creases are dropped: extrude changes topology, so the old edge-key crease
  // set is no longer well-defined (and was previously kept-or-dropped
  // inconsistently depending on whether compaction ran). Re-crease afterward.
  return compact({ verts, faces, vertId });
}

/**
 * Inset each selected face (every vertex in `inRegion`) by `factor`: a smaller
 * inner copy of the face, ringed by quads back to the original border. The
 * complement of extrude — a panel, a frame, a recessed detail. `factor` in
 * (0,1) shrinks toward the face centroid; > 1 grows an outset. Exact: the
 * centroid is a rational mean and each inner vertex is `c + factor·(v − c)`.
 * Per-face, so adjacent selected faces share their border vertices and the
 * result stays a consistently oriented closed manifold for a well-formed
 * region (the ring quads traverse each border edge opposite its neighbour).
 */
export function inset(mesh: KernelMesh, inRegion: (v: RVec3) => boolean, factor: Rational): KernelMesh {
  const selected: number[] = [];
  mesh.faces.forEach((f, fi) => {
    if (f.every((i) => inRegion(mesh.verts[i]!))) selected.push(fi);
  });
  if (selected.length === 0) return mesh;
  const selSet = new Set(selected);

  const verts: RVec3[] = [...mesh.verts];
  const vertId: string[] = [...mesh.vertId];
  const faces: number[][] = [];
  mesh.faces.forEach((f, fi) => {
    if (!selSet.has(fi)) faces.push([...f]);
  });
  for (const fi of selected) {
    const f = mesh.faces[fi]!;
    const c = meanV(f.map((i) => mesh.verts[i]!));
    const inner = f.map((i) => {
      const p = mesh.verts[i]!;
      const np: RVec3 = [
        c[0].add(factor.mul(p[0].sub(c[0]))),
        c[1].add(factor.mul(p[1].sub(c[1]))),
        c[2].add(factor.mul(p[2].sub(c[2]))),
      ];
      const idx = verts.length;
      verts.push(np);
      vertId.push(`inset(${mesh.vertId[i]})`);
      return idx;
    });
    faces.push([...inner]); // the shrunk inner face
    for (let k = 0; k < f.length; k++) {
      // ring quad: border edge a->b, up to the inner ring, back.
      faces.push([f[k]!, f[(k + 1) % f.length]!, inner[(k + 1) % f.length]!, inner[k]!]);
    }
  }
  return { verts, faces, vertId };
}

/** Drop vertices no face references and renumber, so an extrude (or any op
 *  that can strand a vertex) never leaves an orphan behind. Creases are
 *  dropped: their edge keys are indices into the pre-compaction mesh, and
 *  extrude is not a crease-preserving operation. */
function compact(mesh: KernelMesh): KernelMesh {
  const used = new Set<number>();
  for (const f of mesh.faces) for (const v of f) used.add(v);
  if (used.size === mesh.verts.length) return mesh; // nothing stranded
  const remap = new Map<number, number>();
  const verts: RVec3[] = [];
  const vertId: string[] = [];
  mesh.verts.forEach((v, i) => {
    if (used.has(i)) {
      remap.set(i, verts.length);
      verts.push(v);
      vertId.push(mesh.vertId[i]!);
    }
  });
  return { verts, faces: mesh.faces.map((f) => f.map((i) => remap.get(i)!)), vertId };
}

/* ------------------------------------------------------------------ */
/* The predicted census — exact facts, no Blender                     */
/* ------------------------------------------------------------------ */

export interface PredictedCensus {
  vertices: number;
  edges: number;
  faces: number;
  /** Fan triangulation count: Σ (sides − 2). */
  triangles: number;
  /** Euler characteristic V − E + F. */
  euler: number;
  /** Edges touched by exactly one face. */
  boundaryEdges: number;
  /** Edges touched by three or more faces — a non-manifold defect. */
  nonManifoldEdges: number;
  /** Vertices whose incident faces do NOT form a single fan (a pinch/bowtie
   *  where two shells meet at one point) — edge-manifold but not a 2-manifold. */
  nonManifoldVertices: number;
  /** Closed and manifold: no boundary, no non-manifold edge OR vertex. */
  watertight: boolean;
  /** Connected components over the edge graph. */
  components: number;
  /** Globally consistent winding (orientable as wound). */
  orientable: boolean;
  /** Genus (2 − χ)/2 — ONLY for a single closed orientable surface, else
   *  null. Handles = holes. Gated because the formula is meaningless for a
   *  disconnected or non-orientable complex. */
  genus: number | null;
  /** Exact axis-aligned bounds, reported as float64 at the boundary. */
  min: [number, number, number];
  max: [number, number, number];
  /** Exact mass properties (unit density) of THIS polygonal mesh under the
   *  kernel's own fan triangulation (the same triangulation the `triangles`
   *  count uses) — the physics certificate. Present only for a single closed
   *  ORIENTABLE solid (genus's domain), where one global winding sign is
   *  correct; null otherwise. `volumeExact`/`volumeAmbiguityExact` are exact
   *  rationals; the rest are float64 at the boundary. `symmetryAxis` is the
   *  EXACT verdict (a repeated principal moment: the char cubic's discriminant
   *  is zero). `volumeAmbiguity` bounds how far any consumer's triangulation of
   *  the shipped mesh can move the volume (zero iff every face is planar);
   *  `conditioning` is the scale for the float error bound a Blender-measured
   *  fan volume is adjudicated within. */
  mass: {
    volume: number;
    volumeExact: string;
    centroid: [number, number, number];
    symmetryAxis: boolean;
    volumeAmbiguity: number;
    volumeAmbiguityExact: string;
    conditioning: number;
    /** Whether the surface EMBEDS (bounds a solid) or self-intersects — the exact
     *  hypothesis under which the signed volume equals the solid volume. The
     *  `volume` claim requires `embedded`; a self-intersecting immersion double-
     *  counts and is refused with the witness face pair. */
    embed: EmbedResult;
  } | null;
}

/**
 * The mesh with each coordinate rounded to the float32 value Blender stores —
 * the EXACT shipped geometry. `toEmitMesh` lowers ℚ→float64 for `from_pydata`,
 * and Blender keeps mesh coordinates as float32; `Math.fround` reproduces that
 * IEEE-754 round-to-nearest-even bit-for-bit, and every float32 is a dyadic
 * rational, so lifting back through `ratFromFloat` is exact and lossless. Faces
 * and provenance are untouched (topology does not round). Used to prove the
 * SHIPPED surface embeds, not merely the ℚ design.
 */
function quantizeToShippedFloat32(mesh: KernelMesh): KernelMesh {
  const q = (c: Rational): Rational => ratFromFloat(Math.fround(c.toNumber()));
  return {
    verts: mesh.verts.map((v) => [q(v[0]), q(v[1]), q(v[2])] as RVec3),
    faces: mesh.faces,
    vertId: mesh.vertId,
    ...(mesh.creases ? { creases: mesh.creases } : {}),
  };
}

/**
 * Everything the census will measure in Blender, predicted from the kernel
 * mesh EXACTLY — the debut consumer of the operator. A claim adjudicated
 * against the built census (S3D-E-701) then judges the kernel the same way
 * it judges any author: the prediction is not trusted, it is measured.
 *
 * `opts.mass` gates the EXACT mass properties (volume, centroid, symmetry, the
 * conditioning that scales E-703's bound). That path integrates over every face
 * in ℚ — an order more work than the topology counts — and its only readers are
 * the volume claim (E-701) and the build self-check (E-703), which run only in
 * the pipeline against a real build. So it is computed on demand, keyed on a
 * caller that will actually adjudicate it: topology-only consumers (the fuzz
 * property suite predicts a census purely to assert genus preservation) do not
 * pay for an integral nobody reads. This is the cost gate the doctrine allows —
 * on a value that proves a reader exists — not a mode that hides a fact.
 */
export function predictCensus(mesh: KernelMesh, opts: { mass?: boolean } = {}): PredictedCensus {
  const edges = edgesOf(mesh);
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const e of edges.values()) {
    if (e.faces.length === 1) boundaryEdges++;
    else if (e.faces.length >= 3) nonManifoldEdges++;
  }
  const V = mesh.verts.length;
  const E = edges.size;
  const F = mesh.faces.length;
  const triangles = mesh.faces.reduce((acc, f) => acc + (f.length - 2), 0);
  const euler = V - E + F;
  const nonManifoldVertices = countNonManifoldVertices(mesh);
  // Watertight = closed AND a true 2-manifold: no open boundary, no edge with
  // 3+ faces, and no pinch vertex where two shells meet at a point.
  const watertight = boundaryEdges === 0 && nonManifoldEdges === 0 && nonManifoldVertices === 0;
  const components = componentCount(mesh);
  const orientable = orientationConsistent(mesh);
  // Genus is well-defined only for a SINGLE closed ORIENTABLE surface. Two
  // disjoint spheres have χ = 4, so (2−χ)/2 = −1 (nonsense); a non-orientable
  // closed complex can give a half-integer. Report null outside that domain
  // rather than a misleading number.
  const genus = watertight && components === 1 && orientable ? (2 - euler) / 2 : null;

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const v of mesh.verts) {
    for (let i = 0; i < 3; i++) {
      const c = v[i]!.toNumber();
      if (c < min[i]!) min[i] = c;
      if (c > max[i]!) max[i] = c;
    }
  }
  // Mass properties are the exact integral of a SOLID, well-defined only for a
  // SINGLE closed ORIENTABLE surface — the same domain as genus. The one global
  // winding sign massProperties normalises is correct exactly there; two
  // oppositely-wound closed components are each watertight yet would net to the
  // signed DIFFERENCE of their volumes, so they are (honestly) left null.
  const singleClosedOrientable = watertight && components === 1 && orientable;
  // EVERY geometric certificate fact — volume, the triangulation-ambiguity band,
  // and embedding — is measured on the FLOAT32-QUANTIZED mesh, the exact
  // coordinates Blender stores (`ℚ(fround(emit))`), NOT the ℚ design. Float
  // rounding is a DETERMINISTIC function (`Math.fround` is IEEE-754 round-to-
  // nearest-even, and every float32 is a dyadic rational), so the shipped
  // geometry is known exactly, and the theorem is about what SHIPS with no
  // precision caveat: a rounding that makes a planar rational quad non-planar,
  // moves the volume, or crosses two faces is caught here. Topology (watertight,
  // genus) is quantization-invariant, so it stays on the design mesh above.
  const shipped = opts.mass && singleClosedOrientable ? quantizeToShippedFloat32(mesh) : null;
  const mp = shipped ? massProperties(shipped) : null;
  const mass = mp
    ? {
        volume: mp.volume.toNumber(),
        volumeExact: mp.volume.toString(),
        centroid: [mp.centroid[0].toNumber(), mp.centroid[1].toNumber(), mp.centroid[2].toNumber()] as [number, number, number],
        symmetryAxis: mp.symmetryAxis,
        volumeAmbiguity: mp.volumeAmbiguity.toNumber(),
        volumeAmbiguityExact: mp.volumeAmbiguity.toString(),
        conditioning: mp.conditioning.toNumber(),
        embed: embeds(shipped!), // non-null wherever mp is (massProperties ran on it)
      }
    : null;
  return {
    vertices: V,
    edges: E,
    faces: F,
    triangles,
    euler,
    boundaryEdges,
    nonManifoldEdges,
    nonManifoldVertices,
    watertight,
    components,
    orientable,
    genus,
    min,
    max,
    mass,
  };
}
