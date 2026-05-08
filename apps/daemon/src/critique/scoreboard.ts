import type { CritiqueConfig, PanelEvent, PanelistRole, RoundDecision } from '@open-design/contracts/critique';

/**
 * Per-round scores indexed by panelist role. Absent roles are undefined.
 * @see specs/current/critique-theater.md § Composite score formula
 */
export type RoleScores = Partial<Record<PanelistRole, number>>;

/**
 * Accumulated state for a single round's scoring pass.
 * @see specs/current/critique-theater.md § Composite score formula
 */
export interface RoundState {
  n: number;
  scores: RoleScores;
  mustFix: number;
  composite: number;
}

/**
 * Computes the weighted composite score for a set of panelist scores.
 * Absent roles are excluded; weights redistribute proportionally over
 * present roles only. Returns 0 when no role has a score.
 *
 * @see specs/current/critique-theater.md § Composite score formula
 */
export function computeComposite(
  scores: RoleScores,
  weights: CritiqueConfig['weights'],
): number {
  const roles = Object.keys(scores) as PanelistRole[];
  const present = roles.filter((r) => scores[r] !== undefined);
  if (present.length === 0) return 0;

  const totalWeight = present.reduce((s, r) => s + weights[r], 0);
  if (totalWeight < 1e-9) return 0;

  return present.reduce((s, r) => {
    const score = scores[r];
    if (score === undefined) return s;
    return s + (weights[r] / totalWeight) * score;
  }, 0);
}

/**
 * Applies the convergence rule: returns 'ship' when composite >= threshold
 * (with float epsilon 1e-9) AND mustFix === 0; otherwise 'continue'.
 *
 * @see specs/current/critique-theater.md § Convergence rule
 */
export function decideRound(
  composite: number,
  mustFix: number,
  cfg: CritiqueConfig,
): RoundDecision {
  if (composite >= cfg.scoreThreshold - 1e-9 && mustFix === 0) {
    return 'ship';
  }
  return 'continue';
}

/**
 * Selects the best round according to fallbackPolicy when no <SHIP> arrived.
 * Returns the elected RoundState or null when the list is empty or policy
 * is 'fail'.
 *
 * @see specs/current/critique-theater.md § Failure modes (recovery)
 */
export function selectFallbackRound(
  rounds: RoundState[],
  policy: CritiqueConfig['fallbackPolicy'],
): RoundState | null {
  if (rounds.length === 0) return null;
  if (policy === 'fail') return null;
  if (policy === 'ship_last') {
    const last = rounds[rounds.length - 1];
    return last ?? null;
  }
  // ship_best: highest composite; tie-break by highest round number
  let best: RoundState | null = null;
  for (const r of rounds) {
    if (
      best === null ||
      r.composite > best.composite + 1e-9 ||
      (Math.abs(r.composite - best.composite) < 1e-9 && r.n > best.n)
    ) {
      best = r;
    }
  }
  return best;
}
