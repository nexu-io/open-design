import { Rational, rat, ratMean } from "./rational.js";

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
    for (const i of f) {
      if (!Number.isInteger(i) || i < 0 || i >= points.length) {
        throw new Error(`meshOf: face ${fi} references vertex index ${i}, outside 0..${points.length - 1}`);
      }
    }
    b.face(f.map((i) => remap[i]!));
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
  /** Closed and manifold: no boundary, no non-manifold edge. */
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
}

/**
 * Everything the census will measure in Blender, predicted from the kernel
 * mesh EXACTLY — the debut consumer of the operator. A claim adjudicated
 * against the built census (S3D-E-701) then judges the kernel the same way
 * it judges any author: the prediction is not trusted, it is measured.
 */
export function predictCensus(mesh: KernelMesh): PredictedCensus {
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
  const watertight = boundaryEdges === 0 && nonManifoldEdges === 0;
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
  return {
    vertices: V,
    edges: E,
    faces: F,
    triangles,
    euler,
    boundaryEdges,
    nonManifoldEdges,
    watertight,
    components,
    orientable,
    genus,
    min,
    max,
  };
}
