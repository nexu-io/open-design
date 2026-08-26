/**
 * Exact rational arithmetic on BigInt — the kernel's number type.
 *
 * The deterministic geometry kernel (Catmull-Clark subdivision, structural
 * mirror, the predicted census) is built entirely on averaging with rational
 * weights: a face point is a mean (1/k), an edge point mixes quarters, a
 * vertex point weighs by 1/valence. Every one of those is a fraction with a
 * small denominator, so a mesh authored at rational coordinates stays exactly
 * rational through any number of subdivision levels — no floating-point drift,
 * and, because there is no transcendental step anywhere in the kernel, the
 * SAME bytes on every machine. The one rounding happens once, at emit, when
 * the exact vertex is handed to Blender as a float64 literal.
 *
 * This is deliberately small: +, −, ×, ÷, compare, and the two conversions
 * the kernel actually needs. It is not a general CAS. Values are always kept
 * in lowest terms with a positive denominator, so equality is `n===n && d===d`
 * and a Map keyed by `key()` deduplicates coincident points EXACTLY — which is
 * what makes the weld a permutation rather than a distance tolerance.
 */

const bgcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
};

export class Rational {
  /** Numerator; carries the sign. */
  readonly n: bigint;
  /** Denominator; always strictly positive. */
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  /** The canonical constructor: reduces to lowest terms, denominator > 0. */
  static of(n: bigint | number, d: bigint | number = 1n): Rational {
    let nn = typeof n === "bigint" ? n : BigInt(exactInt(n));
    let dd = typeof d === "bigint" ? d : BigInt(exactInt(d));
    if (dd === 0n) throw new Error("Rational: zero denominator");
    if (dd < 0n) {
      nn = -nn;
      dd = -dd;
    }
    const g = bgcd(nn, dd) || 1n;
    return new Rational(nn / g, dd / g);
  }

  /**
   * Parse the canonical `"n"` / `"n/d"` text a trace carries. Exact: the
   * scalars in an operator trace are rational strings precisely so the IR has
   * no float in it and re-parses to the same value on every machine.
   */
  static parse(s: string): Rational {
    const parts = s.split("/");
    if (parts.length === 1 && /^-?\d+$/.test(parts[0]!.trim())) {
      return Rational.of(BigInt(parts[0]!.trim()));
    }
    if (parts.length === 2 && /^-?\d+$/.test(parts[0]!.trim()) && /^-?\d+$/.test(parts[1]!.trim())) {
      return Rational.of(BigInt(parts[0]!.trim()), BigInt(parts[1]!.trim()));
    }
    throw new Error(`Rational.parse: '${s}' is not an integer or n/d rational`);
  }

  static readonly ZERO = Rational.of(0n);
  static readonly ONE = Rational.of(1n);

  add(o: Rational): Rational {
    return Rational.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Rational): Rational {
    return Rational.of(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Rational): Rational {
    return Rational.of(this.n * o.n, this.d * o.d);
  }
  div(o: Rational): Rational {
    if (o.n === 0n) throw new Error("Rational: division by zero");
    return Rational.of(this.n * o.d, this.d * o.n);
  }
  neg(): Rational {
    return new Rational(-this.n, this.d);
  }

  /** −1, 0, or 1. Exact: cross-multiplied BigInt, no float compare. */
  cmp(o: Rational): number {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  eq(o: Rational): boolean {
    return this.n === o.n && this.d === o.d;
  }

  isZero(): boolean {
    return this.n === 0n;
  }

  /** The one lossy step, taken only at the boundary (emit / reporting). */
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  /** A stable string identity for exact-equality Map keys. */
  key(): string {
    return `${this.n}/${this.d}`;
  }

  toString(): string {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }
}

/** Reject a non-integer or non-finite float where an integer is required —
 *  the kernel takes integer or Rational coordinates, never a stray float. */
function exactInt(v: number): number {
  if (!Number.isInteger(v)) {
    throw new Error(`Rational: ${v} is not an integer; build coordinates from Rational.of(n, d)`);
  }
  return v;
}

/** Convenience: a rational from an integer numerator over an integer denom. */
export const rat = (n: bigint | number, d: bigint | number = 1n): Rational => Rational.of(n, d);

/** Sum a list exactly (empty sum is zero). */
export function ratSum(values: readonly Rational[]): Rational {
  let acc = Rational.ZERO;
  for (const v of values) acc = acc.add(v);
  return acc;
}

/** Exact mean of a non-empty list — the kernel's most-used operation. */
export function ratMean(values: readonly Rational[]): Rational {
  if (values.length === 0) throw new Error("ratMean: empty");
  return ratSum(values).div(Rational.of(BigInt(values.length)));
}
