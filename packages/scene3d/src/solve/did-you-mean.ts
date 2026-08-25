/**
 * The nearest legal key to one the author actually typed.
 *
 * Every unknown-key gate in this compiler already refuses loudly and lists the
 * vocabulary — that is the rule that stops a typo shipping as a silent swallow.
 * But a list is a lookup the reader still has to perform, and the field reports
 * are unanimous about what that costs: a compile burned on `offste`, another on
 * `texelDensityMaxRatio` where `texelDensity.maxRatio` was meant. The vocabulary
 * was right there in the message both times. What was missing was the one word
 * out of it that matched.
 *
 * So this is a suggestion, never a decision: the gate still refuses, still lists
 * everything, and the author still types the fix. It only removes the scan.
 *
 * Deliberately conservative, in three ways:
 *   - The edit budget scales with the key's own length (1 for a short key, 2 for
 *     anything longer), so `id` is never "did you mean tip" — a two-edit guess at
 *     a three-letter word is noise wearing the costume of help.
 *   - A prefix relation counts, because the commonest real mistake is a
 *     truncation or an over-qualification (`cam` for `camera`), which Levenshtein
 *     scores as far as three unrelated words.
 *   - Ties break lexicographically, so the same typo always earns the same
 *     suggestion. A message that varies between runs is a message nobody trusts.
 */

/** How many single-character edits may separate a typo from its match. */
function editBudget(key: string): number {
  return key.length <= 4 ? 1 : 2;
}

/** The shortest length at which a prefix relation means anything. */
const MIN_PREFIX = 3;

/**
 * Levenshtein distance, capped: anything past `limit` is reported as
 * `limit + 1` rather than computed exactly, since the caller only ever asks
 * whether it is small.
 */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + cost);
      row.push(value);
      if (value < best) best = value;
    }
    // Every remaining row can only add to the minimum on this one, so a row
    // whose whole minimum already exceeds the budget can never come back.
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length]!;
}

/**
 * The legal key an unknown one most plausibly meant, or undefined when nothing
 * is close enough to be worth saying.
 */
export function nearestKey(key: string, known: Iterable<string>): string | undefined {
  const budget = editBudget(key);
  const lower = key.toLowerCase();
  const candidates = [...known].sort();
  let best: string | undefined;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    // An exact match is not an unknown key at all; the caller's gate would not
    // have fired. Guard anyway so a caller that passes the wrong set cannot be
    // told to write what it already wrote.
    if (candidate === key) return undefined;
    const candidateLower = candidate.toLowerCase();
    let score: number;
    if (candidateLower === lower) {
      // Pure case slip — the highest-confidence suggestion there is.
      score = 0;
    } else if (
      Math.min(candidate.length, key.length) >= MIN_PREFIX &&
      (candidateLower.startsWith(lower) || lower.startsWith(candidateLower))
    ) {
      // Ranked below a case slip and above any real edit, with the length gap
      // as the tiebreak so `camera` beats `camerasomethingelse` for `cam`.
      score = 0.5 + Math.abs(candidate.length - key.length) / 1000;
    } else {
      const d = distance(lower, candidateLower, budget);
      if (d > budget) continue;
      score = d;
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * The suggestion clause an unknown-key message carries, ready to splice in —
 * `did you mean "offset"? ` — or the empty string when nothing is close.
 *
 * Returned with its trailing space so a gate reads as one template with one
 * insertion point, rather than as a conditional sentence assembled by hand at
 * seven call sites that would each drift.
 */
export function didYouMean(key: string, known: Iterable<string>): string {
  const match = nearestKey(key, known);
  return match === undefined ? "" : `did you mean "${match}"? `;
}
