import { describe, expect, it } from "vitest";
import { Rational } from "../src/kernel/rational.js";
import { KernelMesh, RVec3, subdivideCatmullClark } from "../src/kernel/mesh.js";
import { rankQ } from "../src/kernel/homology.js";

/**
 * The subdivision is CONTRACTIVE — proved, not hoped.
 *
 * Catmull-Clark converges to a smooth limit surface only if the local
 * subdivision matrix at every vertex has a simple dominant eigenvalue 1 and
 * everything else strictly below 1: a subdominant of exactly 1 would be
 * geometry that CREEPS a fixed amount per level (invisible at level 2, wrong
 * at level 6), and no floating-point eigensolver can tell 1 from 1−ε. So the
 * matrix is extracted from the KERNEL itself (the unit-vector trick on a
 * valence-n wheel — no hand-derived weights to get wrong) in exact rationals,
 * and its spectrum is settled exactly:
 *
 *  - The matrix is non-negative, has a positive diagonal, and every row sums
 *    to the common denominator. A non-negative, positive-diagonal, irreducible
 *    matrix is PRIMITIVE, so by Perron-Frobenius its spectral radius equals the
 *    row sum, is a SIMPLE eigenvalue, and STRICTLY dominates every other
 *    eigenvalue (real or complex). That radius is the row sum, i.e. S = 1 — the
 *    dominant eigenvalue is exactly 1, simple, strictly dominant.
 *  - The engine's exact eigensolver (scryer) then names the subdominant:
 *    valence 3 -> (9+√17)/32 ≈ 0.410, valence 4 -> exactly 1/2, valence 5
 *    -> ≈ 0.550. All < 1. For valence 4 (rational spectrum) the exact
 *    subdominant 1/2 is re-proved here in TS: 32 = (1/2)·64 is a genuine
 *    eigenvalue because M − 32I is rank-deficient.
 *
 * "Dominant simple" is proved in TS as rank(M − denom·I) = m − 1.
 */

/** The exact (2n+1)×(2n+1) local subdivision matrix, extracted from the kernel,
 *  cleared to integers over a common denominator. */
function subdivisionMatrix(n: number): { M: number[][]; denom: bigint } {
  const faces: number[][] = [];
  for (let i = 0; i < n; i++) faces.push([0, 1 + i, 1 + n + i, 1 + ((i + 1) % n)]);
  const ids = [
    "c_V",
    ...Array.from({ length: n }, (_, i) => `c_e${i}`),
    ...Array.from({ length: n }, (_, i) => `c_d${i}`),
  ];
  const m = 2 * n + 1;
  const targetIds = ["c_V"];
  for (let i = 0; i < n; i++) targetIds.push(`e(c_V|c_e${i})`);
  for (let i = 0; i < n; i++) {
    const fi = ["c_V", `c_e${i}`, `c_d${i}`, `c_e${(i + 1) % n}`].sort();
    targetIds.push(`f(${fi.join("|")})`);
  }
  const rows: Rational[][] = targetIds.map(() => Array<Rational>(m).fill(Rational.ZERO));
  for (let j = 0; j < m; j++) {
    const verts: RVec3[] = ids.map((_, k) =>
      k === j
        ? [Rational.ONE, Rational.ZERO, Rational.ZERO]
        : [Rational.ZERO, Rational.ZERO, Rational.ZERO],
    );
    const mesh: KernelMesh = { verts, faces: faces.map((f) => [...f]), vertId: [...ids] };
    const sub = subdivideCatmullClark(mesh);
    const byId = new Map(sub.vertId.map((id, idx) => [id, sub.verts[idx]![0]!]));
    targetIds.forEach((tid, ti) => {
      rows[ti]![j] = byId.get(tid) ?? Rational.ZERO;
    });
  }
  let denom = 1n;
  const g = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
  for (const row of rows) for (const v of row) denom = (denom / g(denom, v.d)) * v.d;
  const M = rows.map((row) => row.map((v) => Number((v.n * denom) / v.d)));
  return { M, denom };
}

const shifted = (M: number[][], k: number): number[][] =>
  M.map((row, i) => row.map((x, j) => (i === j ? x - k : x)));

describe("kernel: Catmull-Clark is provably contractive (spectrum)", () => {
  for (const n of [3, 4, 5]) {
    it(`valence ${n}: dominant eigenvalue is exactly 1, simple, strictly dominant`, () => {
      const { M, denom } = subdivisionMatrix(n);
      const m = 2 * n + 1;
      const d = Number(denom);
      // Non-negative with a positive diagonal.
      for (let i = 0; i < m; i++) {
        expect(M[i]![i]!, `M[${i}][${i}] > 0`).toBeGreaterThan(0);
        for (let j = 0; j < m; j++) expect(M[i]![j]!).toBeGreaterThanOrEqual(0);
      }
      // Every row sums to the denominator ⇒ S row-sums = 1 ⇒ the all-ones
      // vector is an eigenvector with eigenvalue denom (S = 1).
      for (const row of M) expect(row.reduce((a, b) => a + b, 0)).toBe(d);
      // Perron-Frobenius on a primitive matrix: denom is SIMPLE (nullity of
      // M − denom·I is exactly 1) and, by primitivity (non-negative, positive
      // diagonal, irreducible), strictly dominates every other eigenvalue.
      expect(rankQ(shifted(M, d)), "dominant simple").toBe(m - 1);
    });
  }

  it("valence 4: the subdominant eigenvalue is exactly 1/2 (rational spectrum)", () => {
    const { M, denom } = subdivisionMatrix(4);
    expect(Number(denom)).toBe(64);
    // 32 = (1/2)·64 is a genuine eigenvalue: M − 32I is rank-deficient.
    expect(rankQ(shifted(M, 32))).toBeLessThan(9);
    // and nothing sits strictly between the subdominant 32 and the dominant 64
    // (the whole spectrum is {4,8,16,32,64}, so no integer 33..63 is one).
    for (const k of [33, 40, 48, 56, 63]) expect(rankQ(shifted(M, k))).toBe(9);
  });
});
