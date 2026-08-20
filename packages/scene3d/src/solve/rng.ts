/**
 * Path-addressed deterministic randomness — Kiln's determinism substrate,
 * adopted whole (see KILN.md).
 *
 * The conventional `seed + draw counter` scheme couples every generator to
 * every other generator's call count: insert one extra draw anywhere and
 * every subsequent placement in the scene changes. That is exactly the
 * property a compiler cannot have — adding a bench must not reshuffle the
 * rocks.
 *
 * Here a stream's state is derived from the HASH OF A HIERARCHICAL PATH,
 * so `new Rng(seed).at("scatter/prp_rock")` produces the same sequence no
 * matter what else exists in the scene or how much anything else drew.
 * Verified by the known-answer and insertion-stability tests in
 * spec.test.ts — Kiln's rule that any metric used as evidence needs a
 * known-answer test applies to a randomness source doubly.
 *
 * All arithmetic is 64-bit integer via BigInt (FNV-1a for the path hash,
 * SplitMix64 for the stream), so sequences are bit-identical across
 * platforms and JS engines — float math never touches the state.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** Separator between path segments in the hash — cannot appear in a path. */
const SEP = "\u0000";

function fnv1a64(text: string, state = FNV_OFFSET): bigint {
  let hash = state;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash;
}

export class Rng {
  private state: bigint;
  private root: bigint;

  constructor(seed: number | string, path = "") {
    const seedHash = fnv1a64(typeof seed === "number" ? `n:${seed}` : `s:${seed}`);
    this.root = path === "" ? seedHash : fnv1a64(SEP + path, seedHash);
    this.state = this.root;
  }

  /**
   * Derive an independent child stream. Streams are addressed, never
   * split-off: the child depends only on (seed, this path, child path),
   * not on how much this stream has drawn.
   */
  at(path: string): Rng {
    const child = new Rng(0);
    child.root = fnv1a64(SEP + path, this.root);
    child.state = child.root;
    return child;
  }

  /** SplitMix64 step → uniform in [0, 1) with 53 bits of entropy. */
  next(): number {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    z = z ^ (z >> 31n);
    return Number(z >> 11n) / 2 ** 53;
  }

  /** Uniform in [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}
