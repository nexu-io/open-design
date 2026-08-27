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
  // Directed on-plane cut edges from straddling faces, in the face's own winding.
  const cutEdges: Array<[number, number]> = [];

  for (const face of mesh.faces) {
    const n = face.length;
    let anyOut = false;
    let anyIn = false;
    for (const vi of face) {
      if (side[vi]! > 0) anyOut = true;
      else if (side[vi]! < 0) anyIn = true;
    }
    if (!anyOut) {
      // Nothing outside — keep the face verbatim (a grazing on-plane edge here is
      // an interior edge of the kept solid, not a cut boundary, so record none).
      faces.push(face.map((vi) => intern(mesh.verts[vi]!)));
      continue;
    }
    if (!anyIn) continue; // entirely outside — dropped

    // Straddling: Sutherland–Hodgman clip, emitting the inside endpoint of each
    // edge and every strict crossing, tracking which output verts lie on-plane.
    const outIdx: number[] = [];
    const onPlane: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const a = face[i]!;
      const b = face[(i + 1) % n]!;
      const sa = side[a]!;
      const sb = side[b]!;
      if (sa <= 0) {
        outIdx.push(intern(mesh.verts[a]!));
        onPlane.push(sa === 0);
      }
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
        outIdx.push(intern(crossingPoint(mesh.verts[a]!, mesh.verts[b]!, f[a]!, f[b]!)));
        onPlane.push(true);
      }
    }
    if (outIdx.length < 3) continue; // clipped to a sliver on the plane — no area
    faces.push(outIdx);
    // The on-plane boundary of this clipped face: consecutive on-plane output
    // verts. For a convex face that is exactly one edge (the two crossings).
    const m = outIdx.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      if (onPlane[i] && onPlane[j] && outIdx[i] !== outIdx[j]) cutEdges.push([outIdx[i]!, outIdx[j]!]);
    }
  }

  capCut(cutEdges, pts, normal, faces, onEarClip);

  if (faces.length === 0) return { verts: [], faces: [], vertId: [] };
  return meshOf(pts, faces);
}

/**
 * Assemble directed cut edges into closed loops and triangulate each into a cap.
 * Loops are followed head→tail; a component that fails to close (an open chain
 * from a degenerate cut) is skipped rather than guessed — the embedding
 * certificate then reports the result as not bounding a solid, the honest
 * outcome. Each loop is wound so its cap faces OUT of the kept solid: if the
 * loop's Newell normal opposes the plane normal it is reversed before clipping,
 * so the cap's normal is +plane-normal (away from the `normal·x ≤ d` interior).
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
