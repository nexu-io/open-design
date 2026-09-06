import { Rational } from "./rational.js";
import type { KernelMesh, RVec3 } from "./mesh.js";
import { meshOf } from "./mesh.js";
import { triangulateFace } from "./embed.js";

/**
 * Exact half-space clipping — the first constructive-solid operator.
 *
 * A plane splits space into two half-spaces; clipping keeps the part of a solid
 * on the `normal·x ≤ d` side and CAPS the cut so the result is still a closed
 * solid. Every decision is exact rational arithmetic: a vertex's side is the
 * sign of `normal·v − d`, and an edge that straddles the plane is split at the
 * fraction `fₐ/(fₐ−f_b)` along it — a rational point that lands EXACTLY on the
 * plane. That exactness is what makes the cap watertight without any weld
 * tolerance: two faces sharing an edge compute the SAME crossing from the same
 * two endpoints, so `meshOf`'s coordinate weld fuses them with no gap.
 *
 * This is the atom the richer booleans compose from: intersecting a solid with a
 * convex tool (a box hole, a wedge notch) is a sequence of half-space clips, and
 * a bevel is a clip across a corner. Whatever a clip produces, the embedding
 * certificate (`embeds`) still adjudicates whether it bounds a solid — the
 * operator proposes, the census proves.
 */

/** The kept half-space `{ x : normal·x ≤ d }`. `normal` need not be unit — only
 *  its direction and the sign of `normal·x − d` matter, both exact. */
export interface Plane {
  normal: RVec3;
  d: Rational;
}

const ZERO = Rational.ZERO;
const dot = (a: RVec3, b: RVec3): Rational => a[0].mul(b[0]).add(a[1].mul(b[1])).add(a[2].mul(b[2]));

/** The exact point where segment (a,b) meets the plane, from the signed plane
 *  distances fa, fb of its endpoints (strictly opposite sign ⇒ fa−fb ≠ 0). */
function crossingPoint(a: RVec3, b: RVec3, fa: Rational, fb: Rational): RVec3 {
  const t = fa.div(fa.sub(fb)); // fraction from a toward b at which normal·x = d
  return [
    a[0].add(b[0].sub(a[0]).mul(t)),
    a[1].add(b[1].sub(a[1]).mul(t)),
    a[2].add(b[2].sub(a[2]).mul(t)),
  ];
}

/** A stable exact key for an RVec3 — its three reduced rationals — so coincident
 *  crossing points (computed identically from a shared edge) pool to one index. */
const keyOf = (v: RVec3): string => `${v[0].toString()}|${v[1].toString()}|${v[2].toString()}`;

/**
 * Clip `mesh` to the half-space `normal·x ≤ d`, capping the cut so the result is
 * a closed solid. Faces entirely inside pass through; faces entirely outside are
 * dropped; straddling faces are cut (Sutherland–Hodgman with exact crossings),
 * and their on-plane edges are assembled into loops and triangulated into a cap
 * wound to face OUT of the kept solid. A mesh that does not reach the plane comes
 * back unchanged; a mesh entirely outside comes back empty.
 */
export function clip(mesh: KernelMesh, plane: Plane, onEarClip?: (loopLength: number) => void): KernelMesh {
  const { normal, d } = plane;
  // Signed plane distance of every vertex, once: f = normal·v − d. Sign is side:
  // <0 strictly inside (kept), 0 on the plane, >0 outside (removed).
  const f = mesh.verts.map((v) => dot(normal, v).sub(d));
  const side = f.map((r) => r.cmp(ZERO));

  // Accumulate kept geometry as pooled points + index faces, welded once at the
  // end. A crossing shared by two faces has one identical key ⇒ one vertex.
  const pts: RVec3[] = [];
  const pool = new Map<string, number>();
  const intern = (v: RVec3): number => {
    const k = keyOf(v);
    const hit = pool.get(k);
    if (hit !== undefined) return hit;
    const id = pts.length;
    pool.set(k, id);
    pts.push(v);
    return id;
  };
  const faces: number[][] = [];

  for (const face of mesh.faces) {
    const n = face.length;
    let anyOut = false;
    let anyIn = false;
    for (const vi of face) {
      if (side[vi]! > 0) anyOut = true;
      else if (side[vi]! < 0) anyIn = true;
    }
    if (!anyOut && !anyIn) {
      // COPLANAR: every vertex on the plane. Its normal is ±plane-normal. Keep
      // it only when it faces the KEPT side (it IS the cap there); a coplanar
      // face on the removed side (a box clipped by its own bottom-face plane,
      // keeping the outside) drops, so a zero-thickness slab is not returned as
      // a solid. Interior edges of a kept coplanar face cancel against its kept
      // neighbours in the residual pass below, so it is never double-capped.
      const emitted = face.map((vi) => intern(mesh.verts[vi]!));
      if (newellDotNormal(emitted, pts, normal).cmp(ZERO) > 0) faces.push(emitted);
      continue;
    }
    if (!anyOut) {
      faces.push(face.map((vi) => intern(mesh.verts[vi]!)));
      continue;
    }
    if (!anyIn) continue; // entirely outside — dropped

    // Straddling: Sutherland–Hodgman clip. Emit the inside endpoint of each edge
    // and every STRICT crossing (t ∈ (0,1), so a crossing never coincides with an
    // existing vertex).
    const outIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = face[i]!;
      const b = face[(i + 1) % n]!;
      const sa = side[a]!;
      const sb = side[b]!;
      if (sa <= 0) outIdx.push(intern(mesh.verts[a]!));
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
        outIdx.push(intern(crossingPoint(mesh.verts[a]!, mesh.verts[b]!, f[a]!, f[b]!)));
      }
    }
    if (outIdx.length >= 3) faces.push(outIdx);
  }

  /*
   * The cap boundary is the set of UNMATCHED half-edges of the emitted faces.
   *
   * On a closed oriented 2-manifold every undirected edge is traversed by
   * exactly two faces in opposite directions. After emitting the kept, clipped
   * and coplanar-kept faces, cancel every directed edge against its reverse
   * twin; the residue is the boundary of the kept surface, and for a closed
   * input it lies entirely on the plane. This is why classifying cut edges
   * per-face was wrong: an on-plane edge whose OTHER face was dropped (the
   * removed side) never got recorded, so the cap could not close — the residual
   * pass sees the missing twin and keeps it. An on-plane edge between two KEPT
   * faces cancels, so it is correctly not a cap edge.
   */
  const openEdges = new Map<string, [number, number]>();
  const edgeKey = (a: number, b: number): string => `${a},${b}`;
  for (const face of faces) {
    const m = face.length;
    for (let i = 0; i < m; i++) {
      const a = face[i]!;
      const b = face[(i + 1) % m]!;
      if (a === b) continue;
      const twin = edgeKey(b, a);
      if (openEdges.has(twin)) openEdges.delete(twin);
      else openEdges.set(edgeKey(a, b), [a, b]);
    }
  }

  // A cap face traverses each boundary half-edge in the direction the missing
  // twin would have — the REVERSAL of the residual — so the cap's normal is
  // +plane-normal (it faces the removed half-space) and the whole mesh closes.
  // Sorted by (tail, head) so loop assembly is deterministic regardless of the
  // Map's insertion order.
  const capEdges: Array<[number, number]> = [...openEdges.values()]
    .map(([a, b]) => [b, a] as [number, number])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);

  // Every residual endpoint must be ON the plane for a closed input. An
  // off-plane endpoint means the input was already open along that edge — the
  // check never proceeds as if it were closed. `d` in scope is the plane offset.
  for (const [a, b] of capEdges) {
    for (const id of [a, b]) {
      if (dot(normal, pts[id]!).sub(d).cmp(ZERO) !== 0) {
        // Open input: leave the mesh as clipped without a cap. meshOf/the
        // embedding certificate then reports it as not bounding a solid — the
        // honest outcome, never a guessed cap over a hole.
        if (faces.length === 0) return { verts: [], faces: [], vertId: [] };
        return meshOf(pts, faces);
      }
    }
  }

  capCut(capEdges, pts, normal, faces, onEarClip);

  if (faces.length === 0) return { verts: [], faces: [], vertId: [] };
  return meshOf(pts, faces);
}

/**
 * Assemble the cap-boundary edges into closed loops and triangulate each into a
 * cap. The edges arrive already oriented (reversed residuals), so a loop winds
 * with +plane-normal by construction; the Newell check below is a safety net
 * that only flips a loop wound against it. A component that fails to close is
 * skipped rather than guessed — the embedding certificate then reports the
 * result as not bounding a solid, the honest outcome.
 */
function capCut(
  cutEdges: Array<[number, number]>,
  pts: RVec3[],
  normal: RVec3,
  faces: number[][],
  onEarClip?: (loopLength: number) => void,
): void {
  if (cutEdges.length === 0) return;
  const byTail = new Map<number, number[]>();
  cutEdges.forEach(([tail], ei) => {
    const arr = byTail.get(tail);
    if (arr) arr.push(ei);
    else byTail.set(tail, [ei]);
  });
  const used = new Array<boolean>(cutEdges.length).fill(false);

  for (let start = 0; start < cutEdges.length; start++) {
    if (used[start]) continue;
    const loop: number[] = [];
    const startTail = cutEdges[start]![0];
    let ei: number | undefined = start;
    let closed = false;
    for (let step = 0; step <= cutEdges.length; step++) {
      if (ei === undefined || used[ei]) break;
      const cur: number = ei;
      used[cur] = true;
      const edge: [number, number] = cutEdges[cur]!;
      const head: number = edge[1];
      loop.push(edge[0]);
      if (head === startTail) {
        closed = true;
        break;
      }
      const next: number[] = byTail.get(head) ?? [];
      ei = next.find((c) => !used[c]);
    }
    if (!closed || loop.length < 3) continue;
    if (newellDotNormal(loop, pts, normal).cmp(ZERO) < 0) loop.reverse();
    // Report the loop length so the caller can charge the ear-clip's ~O(L²) cost
    // (a grazing cut can produce a large cross-section loop); triangulating it is
    // the one super-linear step inside clip.
    onEarClip?.(loop.length);
    for (const t of triangulateFace(loop, pts)) faces.push(t);
  }
}

/** The dot of a polygon loop's Newell normal with `normal` — its sign says
 *  whether the loop is wound with (+) or against (−) the plane normal. */
function newellDotNormal(loop: number[], pts: RVec3[], normal: RVec3): Rational {
  const n = loop.length;
  let nx = ZERO;
  let ny = ZERO;
  let nz = ZERO;
  for (let k = 0; k < n; k++) {
    const a = pts[loop[k]!]!;
    const b = pts[loop[(k + 1) % n]!]!;
    nx = nx.add(a[1].sub(b[1]).mul(a[2].add(b[2])));
    ny = ny.add(a[2].sub(b[2]).mul(a[0].add(b[0])));
    nz = nz.add(a[0].sub(b[0]).mul(a[1].add(b[1])));
  }
  return nx.mul(normal[0]).add(ny.mul(normal[1])).add(nz.mul(normal[2]));
}
