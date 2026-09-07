/**
 * Exact O(n log n) triangulation of ONE simple polygon (no holes) over ℚ.
 *
 * This replaces the ear-clip's O(n²)/O(n³) corner with the classic two-phase
 * monotone triangulation (Lee–Preparata): a top-down sweep splits the polygon
 * into y-monotone pieces by inserting diagonals at split/merge vertices, then
 * each piece is triangulated by an O(n) stack pass. Every decision is the sign
 * of a rational determinant — no floats, no sqrt, no trig, no epsilon.
 *
 * Determinism: the sweep status is a treap with priorities derived from a fixed
 * hash of the edge (NEVER Math.random, which is banned in this kernel), and the
 * predecessor query it answers is a pure function of the geometry — so the
 * output triangles are identical across compiles.
 *
 * Contract (same as the ear-clip it replaces): the caller has ALREADY projected
 * to 2D so the polygon reads CCW; this returns a list of triangles as index
 * triples into the ORIGINAL vertex numbering, wound CCW in that projection. It
 * is only ever a PROPOSAL — `embeds()` adjudicates the actual output triangles —
 * so it must be CORRECT for valid simple CCW polygons and merely FINITE (never
 * crash or loop) on malformed input, degrading to a fan the certificate rejects.
 */
import { Rational } from "./rational.js";

const ZERO = Rational.ZERO;

/** A projected 2D vertex. `i` is the ORIGINAL vertex index carried through to
 *  the output triangles; `k` is this vertex's position in the CCW ring. */
export interface P2 {
  x: Rational;
  y: Rational;
  i: number;
  k: number;
}

/** Sweep order: higher y first; ties broken by smaller x, then ring position —
 *  the "infinitesimally rotated sweep line" that removes every horizontal-edge
 *  special case (de Berg §3.2). A total strict order. */
function cmpVert(a: P2, b: P2): number {
  const cy = b.y.cmp(a.y);
  if (cy !== 0) return cy;
  const cx = a.x.cmp(b.x);
  if (cx !== 0) return cx;
  return a.k - b.k;
}
/** `a` is above `b` in the sweep. */
const above = (a: P2, b: P2): boolean => cmpVert(a, b) < 0;

/** Sign of (a→b) × (a→c): +1 left turn (CCW/convex), 0 collinear, −1 right. */
function turnSign(a: P2, b: P2, c: P2): number {
  return b.x.sub(a.x).mul(c.y.sub(a.y)).sub(b.y.sub(a.y).mul(c.x.sub(a.x))).cmp(ZERO);
}

type VType = "start" | "end" | "split" | "merge" | "regular";

/** An active edge in the sweep status: the polygon edge whose upper endpoint is
 *  ring vertex `k` and lower endpoint is ring vertex `k+1` (mod n), oriented by
 *  the sweep. `helper`/`helperMerge` are the running helper vertex and whether
 *  it was a merge vertex (the lazy diagonal trigger). */
interface Edge {
  k: number; // ring index of the edge (edge from poly[k] to poly[k+1])
  u: P2; // upper endpoint under cmpVert
  l: P2; // lower endpoint under cmpVert
  helper: P2;
  helperMerge: boolean;
}

/** Sign of (edge's x at the sweep height of `p`) − p.x, division-free.
 *  With d = u.y − l.y ≥ 0, the edge's x at y = p.y is
 *    x_e = u.x + (u.y − p.y)·(l.x − u.x)/d,
 *  so sign(x_e − p.x) = sign( (u.x − p.x)·d + (u.y − p.y)·(l.x − u.x) )  [d ≥ 0].
 *  +1 ⇒ edge lies to the RIGHT of p; −1 ⇒ to the LEFT. */
function edgeVsPoint(e: Edge, p: P2): number {
  const d = e.u.y.sub(e.l.y); // ≥ 0
  return e.u.x
    .sub(p.x)
    .mul(d)
    .add(e.u.y.sub(p.y).mul(e.l.x.sub(e.u.x)))
    .cmp(ZERO);
}

/* ------------------------------------------------------------------ */
/* Treap sweep-status: insert(edge@point), delete(edge), leftOf(point).  */
/* Ordered by edgeVsPoint; balanced by fixed-hash priorities (no RNG).    */
/* Edges of a SIMPLE polygon never cross, so an order fixed at insertion   */
/* time stays valid until deletion — no edge-vs-edge re-comparison ever.   */
/* ------------------------------------------------------------------ */
interface TNode {
  edge: Edge;
  prio: number;
  left: TNode | null;
  right: TNode | null;
  parent: TNode | null;
}

/** SplitMix32 — a deterministic, well-mixed priority from the edge id, so the
 *  treap is balanced without any randomness (identical every compile). */
function prioOf(k: number): number {
  let z = (k + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

class Status {
  private root: TNode | null = null;
  private readonly nodes = new Map<number, TNode>();

  private rotateUp(x: TNode): void {
    const p = x.parent!;
    const g = p.parent;
    if (p.left === x) {
      p.left = x.right;
      if (x.right) x.right.parent = p;
      x.right = p;
    } else {
      p.right = x.left;
      if (x.left) x.left.parent = p;
      x.left = p;
    }
    p.parent = x;
    x.parent = g;
    if (g) {
      if (g.left === p) g.left = x;
      else g.right = x;
    } else {
      this.root = x;
    }
  }

  /** Insert `e` whose UPPER endpoint is the current event vertex `p`. */
  insert(e: Edge, p: P2): void {
    const node: TNode = { edge: e, prio: prioOf(e.k), left: null, right: null, parent: null };
    this.nodes.set(e.k, node);
    if (!this.root) {
      this.root = node;
      return;
    }
    let cur: TNode = this.root;
    for (;;) {
      // node's edge sits to the LEFT of cur.edge when cur.edge is to the right
      // of p (edgeVsPoint > 0): then descend left, else right.
      const goLeft = edgeVsPoint(cur.edge, p) > 0;
      const child = goLeft ? cur.left : cur.right;
      if (!child) {
        if (goLeft) cur.left = node;
        else cur.right = node;
        node.parent = cur;
        break;
      }
      cur = child;
    }
    while (node.parent && node.parent.prio > node.prio) this.rotateUp(node);
  }

  /** The edge immediately to the LEFT of point `p` (largest edge with
   *  edgeVsPoint < 0), or null if none. */
  leftOf(p: P2): Edge | null {
    let cur = this.root;
    let best: Edge | null = null;
    while (cur) {
      if (edgeVsPoint(cur.edge, p) < 0) {
        best = cur.edge; // this edge is left of p — go right for a closer one
        cur = cur.right;
      } else {
        cur = cur.left;
      }
    }
    return best;
  }

  delete(k: number): void {
    const node = this.nodes.get(k);
    if (!node) return;
    this.nodes.delete(k);
    // Rotate `node` down to a leaf (choosing the smaller-priority child so the
    // heap order is restored), then unlink it.
    for (;;) {
      const L = node.left;
      const R = node.right;
      if (!L && !R) break;
      if (!R || (L && L.prio < R.prio)) this.rotateUp(L!);
      else this.rotateUp(R!);
    }
    const p = node.parent;
    if (p) {
      if (p.left === node) p.left = null;
      else p.right = null;
    } else {
      this.root = null;
    }
    node.parent = null;
  }

  edgeAt(k: number): Edge | undefined {
    return this.nodes.get(k)?.edge;
  }
}

/* ------------------------------------------------------------------ */
/* Phase 1 — make monotone: collect diagonals (pairs of ring indices).    */
/* ------------------------------------------------------------------ */
function classify(poly: P2[], k: number): VType {
  const n = poly.length;
  const v = poly[k]!;
  const prev = poly[(k - 1 + n) % n]!;
  const next = poly[(k + 1) % n]!;
  const bothBelow = above(v, prev) && above(v, next); // local top
  const bothAbove = above(prev, v) && above(next, v); // local bottom
  const t = turnSign(prev, v, next); // >0 convex (interior angle < π) for CCW
  if (bothBelow) return t >= 0 ? "start" : "split"; // collinear ⇒ convex, never split
  if (bothAbove) return t >= 0 ? "end" : "merge";
  return "regular";
}

function makeMonotoneDiagonals(poly: P2[]): Array<[number, number]> {
  const n = poly.length;
  const diagonals: Array<[number, number]> = [];
  const status = new Status();
  const type: VType[] = poly.map((_, k) => classify(poly, k));

  const mkEdge = (k: number): Edge => {
    const a = poly[k]!;
    const b = poly[(k + 1) % n]!;
    const [u, l] = above(a, b) ? [a, b] : [b, a];
    return { k, u, l, helper: a, helperMerge: false };
  };
  const setHelper = (e: Edge, v: P2, isMerge: boolean): void => {
    e.helper = v;
    e.helperMerge = isMerge;
  };
  const addDiag = (a: P2, b: P2): void => {
    if (a.k !== b.k) diagonals.push([a.k, b.k]);
  };

  // Process vertices top → bottom.
  const order = poly.map((_, k) => k).sort((p, q) => cmpVert(poly[p]!, poly[q]!));
  for (const k of order) {
    const v = poly[k]!;
    const ePrevIdx = (k - 1 + n) % n; // edge ending AT v (from v_{k-1} to v_k)
    const eNextIdx = k; // edge starting AT v (from v_k to v_{k+1})
    switch (type[k]) {
      case "start": {
        status.insert(mkEdge(eNextIdx), v);
        break;
      }
      case "end": {
        const e = status.edgeAt(ePrevIdx);
        if (e && e.helperMerge) addDiag(v, e.helper);
        status.delete(ePrevIdx);
        break;
      }
      case "split": {
        const eLeft = status.leftOf(v);
        if (eLeft) {
          addDiag(v, eLeft.helper);
          setHelper(eLeft, v, false);
        }
        status.insert(mkEdge(eNextIdx), v);
        break;
      }
      case "merge": {
        const ePrev = status.edgeAt(ePrevIdx);
        if (ePrev && ePrev.helperMerge) addDiag(v, ePrev.helper);
        status.delete(ePrevIdx);
        const eLeft = status.leftOf(v);
        if (eLeft) {
          if (eLeft.helperMerge) addDiag(v, eLeft.helper);
          setHelper(eLeft, v, true);
        }
        break;
      }
      case "regular": {
        // Interior to the right ⇔ the boundary descends through v in ring order
        // (prev above v) — v is on the LEFT chain. CCW guarantees exactly one
        // neighbour above.
        const interiorRight = above(poly[ePrevIdx]!, v);
        if (interiorRight) {
          const ePrev = status.edgeAt(ePrevIdx);
          if (ePrev && ePrev.helperMerge) addDiag(v, ePrev.helper);
          status.delete(ePrevIdx);
          status.insert(mkEdge(eNextIdx), v);
        } else {
          const eLeft = status.leftOf(v);
          if (eLeft) {
            if (eLeft.helperMerge) addDiag(v, eLeft.helper);
            setHelper(eLeft, v, false);
          }
        }
        break;
      }
    }
  }
  return diagonals;
}

/* ------------------------------------------------------------------ */
/* Face extraction — split the ring along diagonals into monotone faces   */
/* via a CCW adjacency walk (fable's DCEL-lite). Each directed half-edge   */
/* belongs to exactly one face; a walk that revisits one is a malformed    */
/* input — abort to the fan fallback.                                      */
/* ------------------------------------------------------------------ */
function extractFaces(poly: P2[], diagonals: Array<[number, number]>): number[][] | null {
  const n = poly.length;
  // Adjacency: ring neighbours + diagonal partners, per ring index.
  const adj: number[][] = poly.map((_, k) => [(k + 1) % n, (k - 1 + n) % n]);
  for (const [a, b] of diagonals) {
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  // Sort each vertex's neighbours by CCW angle around it, so the face walk can
  // pick the next edge deterministically. A STRICT TOTAL ORDER — exact half-plane,
  // then turn, then (for two neighbours on the SAME ray, which collinear runs and
  // an edge-aligned diagonal can produce) squared distance and finally ring index.
  // A comparator that returned "not-less" both ways on a tie would corrupt
  // Array.sort and make the face walk implementation-dependent.
  const half = (c: P2, p: P2): number =>
    p.y.sub(c.y).cmp(ZERO) < 0 || (p.y.eq(c.y) && p.x.sub(c.x).cmp(ZERO) >= 0) ? 0 : 1;
  const dist2 = (c: P2, p: P2): Rational => {
    const dx = p.x.sub(c.x);
    const dy = p.y.sub(c.y);
    return dx.mul(dx).add(dy.mul(dy));
  };
  for (let k = 0; k < n; k++) {
    const c = poly[k]!;
    adj[k]!.sort((a, b) => {
      const pa = poly[a]!;
      const pb = poly[b]!;
      const ha = half(c, pa);
      const hb = half(c, pb);
      if (ha !== hb) return ha - hb;
      const t = turnSign(c, pa, pb);
      if (t !== 0) return t > 0 ? -1 : 1; // pa is CCW-before pb
      const dc = dist2(c, pa).cmp(dist2(c, pb)); // same ray: nearer first
      return dc !== 0 ? dc : a - b; // then ring index — a stable tie-break
    });
  }
  // Walk faces: from each unused directed edge (from → to), the next edge leaves
  // `to` toward the neighbour just CLOCKWISE of the reverse direction (to → from)
  // — the standard next-face rule. Mark directed edges used.
  const used = new Set<number>();
  const key = (a: number, b: number): number => a * n + b;
  const faces: number[][] = [];
  for (let s = 0; s < n; s++) {
    for (const t0 of adj[s]!) {
      if (used.has(key(s, t0))) continue;
      const face: number[] = [];
      let from = s;
      let to = t0;
      let guard = 4 * (n + diagonals.length) + 8;
      for (;;) {
        if (used.has(key(from, to))) return null; // revisit ⇒ malformed
        used.add(key(from, to));
        face.push(from);
        // At `to`, incoming direction is to→from; the next boundary edge is the
        // neighbour immediately CLOCKWISE from `from` in to's CCW order.
        const nbrs = adj[to]!;
        const idx = nbrs.indexOf(from);
        const nextTo = nbrs[(idx - 1 + nbrs.length) % nbrs.length]!;
        from = to;
        to = nextTo;
        if (from === s && to === t0) break;
        if (guard-- <= 0) return null;
      }
      // Keep only INTERIOR faces. The walk enumerates every face of the planar
      // subdivision, including the single EXTERIOR face (the outer boundary,
      // traced clockwise ⇒ negative signed area); triangulating that would ship
      // garbage. Interior faces of a CCW polygon are CCW ⇒ positive area.
      if (face.length >= 3 && faceArea2(poly, face).cmp(ZERO) > 0) faces.push(face);
    }
  }
  return faces;
}

/** 2× signed area of a face given as ring indices into `poly`. */
function faceArea2(poly: P2[], face: number[]): Rational {
  let s = ZERO;
  for (let j = 0; j < face.length; j++) {
    const a = poly[face[j]!]!;
    const b = poly[face[(j + 1) % face.length]!]!;
    s = s.add(a.x.mul(b.y).sub(b.x.mul(a.y)));
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Phase 2 — triangulate one y-monotone face (O(n) stack pass).           */
/* ------------------------------------------------------------------ */
function triangulateMonotone(poly: P2[], face: number[], out: number[][]): void {
  const m = face.length;
  if (m < 3) return;
  const V = face.map((k) => poly[k]!);
  // Order the face's vertices top→bottom; tag each with its chain (left/right).
  const idx = V.map((_, j) => j).sort((a, b) => cmpVert(V[a]!, V[b]!));
  const top = idx[0]!;
  const bot = idx[m - 1]!;
  // Walking the ring forward from top to bot is one chain; the rest is the other.
  const chain = new Array<number>(m); // 0 = left chain, 1 = right chain
  chain[top] = 0;
  chain[bot] = 0;
  for (let j = (top + 1) % m; j !== bot; j = (j + 1) % m) chain[j] = 0; // forward = left
  for (let j = (bot + 1) % m; j !== top; j = (j + 1) % m) chain[j] = 1; // backward = right

  const emit = (a: number, b: number, c: number): void => {
    // Normalise winding by signed area — CCW in the projection — so the whole
    // per-branch winding analysis collapses to one check (fable). Drop exact
    // zero-area triangles; `embeds()` would only flag them anyway.
    const t = turnSign(V[a]!, V[b]!, V[c]!);
    if (t === 0) return;
    if (t > 0) out.push([V[a]!.i, V[b]!.i, V[c]!.i]);
    else out.push([V[a]!.i, V[c]!.i, V[b]!.i]);
  };

  const stack: number[] = [idx[0]!, idx[1]!];
  for (let s = 2; s < m - 1; s++) {
    const v = idx[s]!;
    const topOfStack = stack[stack.length - 1]!;
    if (chain[v] !== chain[topOfStack]) {
      // Opposite chain: connect v to every vertex on the stack.
      while (stack.length > 1) {
        const a = stack.pop()!;
        emit(v, a, stack[stack.length - 1]!);
      }
      stack.pop();
      stack.push(idx[s - 1]!, v);
    } else {
      // Same chain: pop while the diagonal v→(next-down) stays inside. The
      // convexity sign flips per chain (left: pop on left turns, right: right).
      let a = stack.pop()!;
      while (stack.length > 0) {
        const b = stack[stack.length - 1]!;
        const t = turnSign(V[b]!, V[a]!, V[v]!);
        const inside = chain[v] === 0 ? t > 0 : t < 0;
        if (!inside) break;
        emit(b, a, v);
        a = stack.pop()!;
      }
      stack.push(a, v);
    }
  }
  const last = idx[m - 1]!;
  while (stack.length > 1) {
    const a = stack.pop()!;
    emit(last, a, stack[stack.length - 1]!);
  }
}

/** A degenerate finite fallback: a fan from vertex 0. Never TRUSTED (embeds()
 *  adjudicates); it only guarantees a finite, non-crashing output. */
function fan(poly: P2[]): number[][] {
  const out: number[][] = [];
  for (let k = 1; k + 1 < poly.length; k++) out.push([poly[0]!.i, poly[k]!.i, poly[k + 1]!.i]);
  return out;
}

/**
 * Triangulate one CCW-projected simple polygon into CCW index triples. The
 * `poly` vertices carry their original 3D index in `.i`. O(n log n).
 */
export function triangulateSimplePolygon(poly: P2[]): number[][] {
  const n = poly.length;
  if (n < 3) return [];
  if (n === 3) return [[poly[0]!.i, poly[1]!.i, poly[2]!.i]];
  try {
    const diagonals = makeMonotoneDiagonals(poly);
    const faces = extractFaces(poly, diagonals);
    if (!faces) return fan(poly);
    const out: number[][] = [];
    for (const face of faces) triangulateMonotone(poly, face, out);
    // A correct triangulation of a simple polygon is exactly n − 2 triangles.
    // Any other count means the input was not a valid simple polygon (or a
    // degeneracy slipped through); fall back to a finite fan the certificate
    // will judge, rather than ship a silently-wrong tiling.
    if (out.length !== n - 2) return fan(poly);
    return out;
  } catch {
    return fan(poly);
  }
}
