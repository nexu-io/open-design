import { rat } from "./rational.js";
import { edgeKey, edgesOf, KernelMesh, orientationConsistent } from "./mesh.js";

/**
 * Exact homology of a mesh's cell complex — the topological truth Euler
 * characteristic only summarises.
 *
 * A mesh is a 2-complex: vertices (C0), edges (C1), faces (C2). Its boundary
 * operators ∂2: C2→C1 and ∂1: C1→C0 (oriented, integer ±1) satisfy ∂1∘∂2 = 0,
 * and the Betti numbers fall out of their ranks:
 *
 *     b0 = |V| − rank ∂1              (connected components)
 *     b1 = |E| − rank ∂1 − rank ∂2   (independent loops / handles)
 *     b2 = |F| − rank ∂2             (enclosed voids)
 *
 * This is what "watertight" MEANS, and it is a fact no floating-point scan
 * can counterfeit: a seam welded under a distance tolerance leaves a slit
 * that a float mesh reads as closed, while b1 counts the extra loop exactly.
 * Because the kernel welds by EXACT coordinate, its own topology is already
 * seam-free — so this module's job is to certify that the cheap Euler-based
 * verdict in `predictCensus` agrees with the real homology, and to report the
 * genus (handles) rigorously rather than inferring it from χ alone.
 *
 * Ranks are computed by exact Gaussian elimination over ℚ (the entries are
 * already integers), so there is no pivoting-tolerance and no rounding — the
 * rank is the true rank, and the same on every machine. The engine's exact
 * Smith-Normal-Form authority (scryer) certifies these ranks in the tests.
 */

export interface Homology {
  b0: number;
  b1: number;
  b2: number;
  /** The winding is globally consistent (orientable as wound). This is a REAL
   *  check on adjacent-face agreement — not ∂1∘∂2 = 0, which is the identity
   *  "boundary of a boundary is zero", true for every complex and so useless
   *  as an orientation test. */
  orientable: boolean;
  rankD1: number;
  rankD2: number;
}

/** Oriented boundary matrices. ∂1 rows are edges, cols verts; ∂2 rows faces,
 *  cols edges. Edge (a,b) is oriented a→b with a < b (the canonical key). */
export function boundaryMatrices(mesh: KernelMesh): {
  d1: number[][];
  d2: number[][];
  edgeOrder: Array<{ a: number; b: number }>;
} {
  const edges = edgesOf(mesh);
  const edgeOrder: Array<{ a: number; b: number }> = [];
  const edgeIndex = new Map<string, number>();
  for (const [key, e] of edges) {
    edgeIndex.set(key, edgeOrder.length);
    edgeOrder.push({ a: e.a, b: e.b });
  }
  const V = mesh.verts.length;
  const E = edgeOrder.length;

  // ∂1: edge a→b contributes −1 at a, +1 at b.
  const d1: number[][] = edgeOrder.map(({ a, b }) => {
    const row = new Array<number>(V).fill(0);
    row[a] = -1;
    row[b] = 1;
    return row;
  });

  // ∂2: each directed edge (u→v) of a face is +1 on edge(u,v) if u<v, else −1.
  const d2: number[][] = mesh.faces.map((f) => {
    const row = new Array<number>(E).fill(0);
    for (let k = 0; k < f.length; k++) {
      const u = f[k]!;
      const v = f[(k + 1) % f.length]!;
      row[edgeIndex.get(edgeKey(u, v))!] += u < v ? 1 : -1;
    }
    return row;
  });

  return { d1, d2, edgeOrder };
}

/** Exact rank over ℚ by Gaussian elimination in Rational (no tolerance). */
export function rankQ(matrix: number[][]): number {
  if (matrix.length === 0 || matrix[0]!.length === 0) return 0;
  const rows = matrix.map((r) => r.map((x) => rat(x)));
  const nRows = rows.length;
  const nCols = rows[0]!.length;
  let rank = 0;
  for (let col = 0; col < nCols && rank < nRows; col++) {
    // Find a pivot at or below `rank` in this column.
    let pivot = -1;
    for (let r = rank; r < nRows; r++) {
      if (!rows[r]![col]!.isZero()) {
        pivot = r;
        break;
      }
    }
    if (pivot === -1) continue;
    [rows[rank], rows[pivot]] = [rows[pivot]!, rows[rank]!];
    const pivRow = rows[rank]!;
    const pivVal = pivRow[col]!;
    for (let r = 0; r < nRows; r++) {
      if (r === rank) continue;
      const factor = rows[r]![col]!.div(pivVal);
      if (factor.isZero()) continue;
      for (let c = col; c < nCols; c++) {
        rows[r]![c] = rows[r]![c]!.sub(factor.mul(pivRow[c]!));
      }
    }
    rank++;
  }
  return rank;
}

export function homology(mesh: KernelMesh): Homology {
  const { d1, d2 } = boundaryMatrices(mesh);
  const rankD1 = rankQ(d1);
  const rankD2 = rankQ(d2);
  const V = mesh.verts.length;
  const E = d1.length;
  const F = mesh.faces.length;
  return {
    b0: V - rankD1,
    b1: E - rankD1 - rankD2,
    b2: F - rankD2,
    orientable: orientationConsistent(mesh),
    rankD1,
    rankD2,
  };
}
