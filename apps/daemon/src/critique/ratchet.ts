/**
 * M-phase rollout ratchet (Phase 16).
 *
 * Phase 15 shipped the rollout resolver. Phase 12 shipped the
 * observability surface that lets us measure conformance. This module
 * is the bridge: it takes a window of daily conformance numbers and
 * answers "given the current rollout phase, should we promote, hold,
 * or demote?". The answer is a recommendation, not an action. An
 * operator-driven follow-up wires the actual `OD_CRITIQUE_ROLLOUT_PHASE`
 * flip into a deploy pipeline; this module's job is to make the
 * recommendation explicit and auditable so the operator does not have
 * to read a Grafana panel to know what to do.
 *
 * The function is pure: it takes data in and returns a decision out,
 * with no I/O. That lets the same evaluator drive both the nightly
 * recommendation log line and the `GET /api/critique/conformance`
 * endpoint, and lets vitest pin every cell of the decision matrix
 * without standing up a daemon.
 *
 * Spec source: `specs/current/critique-theater.md` § Rollout, which
 * states the M3 threshold as "14 consecutive days at >= 90% adapter
 * conformance across the fleet". The clean-parse threshold (>= 95%
 * runs free of parser_warning) is a sibling gate; both must hold.
 */

import type { RolloutPhase } from './rollout.js';

/**
 * One day of conformance numbers for one adapter. The nightly cron
 * collapses every (adapter, brief-template) run into one of these
 * rows; the evaluator aggregates across adapters per day.
 */
export interface ConformanceDay {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** Adapter id (matches `agentId` in the spawn handler). */
  adapter: string;
  /** Fraction of runs that hit the `shipped` terminal status, 0..1. */
  shippedRate: number;
  /** Fraction of runs with zero parser_warning events, 0..1. */
  cleanParseRate: number;
  /** Total runs the day's two rates were computed from. */
  totalRuns: number;
}

export type RatchetDecision =
  | {
      kind: 'hold';
      current: RolloutPhase;
      /** Human-readable reason the rollout is holding at `current`. */
      reason: string;
      /** Days in the rolling window that passed every threshold. */
      passingDays: number;
      /** Days in the rolling window that have at least one row. */
      observedDays: number;
    }
  | {
      kind: 'promote';
      from: RolloutPhase;
      to: RolloutPhase;
      /** Days in the rolling window that passed every threshold. */
      evidenceDays: number;
    }
  | {
      kind: 'demote';
      from: RolloutPhase;
      to: RolloutPhase;
      /** Human-readable reason the rollout is being walked back. */
      reason: string;
    };

export interface EvaluateRolloutParams {
  current: RolloutPhase;
  /** Rolling window of daily conformance rows. Order does not matter. */
  history: ConformanceDay[];
  /** Window size in days; defaults to 14 (the spec value). */
  windowDays?: number;
  /** Minimum shipped-rate per day; defaults to 0.90 (the spec value). */
  shippedThreshold?: number;
  /** Minimum clean-parse-rate per day; defaults to 0.95 (the spec value). */
  cleanParseThreshold?: number;
  /**
   * Optional clock for deterministic tests. Production callers omit;
   * tests pass `() => new Date('2026-05-13T00:00:00Z')` or similar so
   * the "today" anchor is fixed.
   */
  now?: () => Date;
}

const PHASE_ORDER: readonly RolloutPhase[] = ['M0', 'M1', 'M2', 'M3'] as const;

function nextPhase(p: RolloutPhase): RolloutPhase | null {
  const i = PHASE_ORDER.indexOf(p);
  return i >= 0 && i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] ?? null : null;
}

function prevPhase(p: RolloutPhase): RolloutPhase | null {
  const i = PHASE_ORDER.indexOf(p);
  return i > 0 ? PHASE_ORDER[i - 1] ?? null : null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the set of date strings in the `windowDays` ending today
 * (inclusive). Pure, no Date side effects on the input.
 */
function rollingWindowDates(now: Date, windowDays: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(isoDay(d));
  }
  return out;
}

/**
 * Evaluate the rollout. Returns one of three decisions:
 *
 *   * `promote`: every day in the rolling window had at least one row
 *     and every per-day fleet aggregate cleared both thresholds.
 *   * `demote`: at least one day in the rolling window had a fleet
 *     shipped-rate below the demote-floor (half of `shippedThreshold`).
 *     The demote-floor is intentionally lower than the promote threshold
 *     so a single noisy day at, say, 0.88 does not bounce the rollout
 *     back; the demote signal is for sustained breakage.
 *   * `hold`: anything else (data gaps, near-misses, or M3 with no
 *     headroom).
 *
 * The function is total: it always returns a decision; M0 cannot demote
 * (already at the floor) and M3 cannot promote (already at the ceiling).
 * Both of those collapse to `hold` with a reason-string that explains
 * why.
 */
export function evaluateRollout(params: EvaluateRolloutParams): RatchetDecision {
  const rawWindow = params.windowDays ?? 14;
  const rawShipped = params.shippedThreshold ?? 0.90;
  const rawClean = params.cleanParseThreshold ?? 0.95;

  // Codex + lefarcen P1 on PR #1499: defend at the evaluator entry so a
  // malformed query string (`?windowDays=0`) or a buggy caller cannot
  // produce a zero-evidence promotion. A non-positive window would make
  // `passingDays >= windowDays` trivially true at 0 >= 0, and a
  // threshold outside [0, 1] would either reject every legitimate day
  // (> 1) or accept nonsense (< 0). Hold with a clear reason in either
  // case instead.
  if (!Number.isFinite(rawWindow) || rawWindow <= 0) {
    return {
      kind: 'hold',
      current: params.current,
      reason: `invalid windowDays: ${rawWindow}`,
      passingDays: 0,
      observedDays: 0,
    };
  }
  if (!Number.isFinite(rawShipped) || rawShipped < 0 || rawShipped > 1) {
    return {
      kind: 'hold',
      current: params.current,
      reason: `invalid shippedThreshold: ${rawShipped}`,
      passingDays: 0,
      observedDays: 0,
    };
  }
  if (!Number.isFinite(rawClean) || rawClean < 0 || rawClean > 1) {
    return {
      kind: 'hold',
      current: params.current,
      reason: `invalid cleanParseThreshold: ${rawClean}`,
      passingDays: 0,
      observedDays: 0,
    };
  }

  const windowDays = Math.floor(rawWindow);
  const shippedThreshold = rawShipped;
  const cleanParseThreshold = rawClean;
  const now = (params.now ?? (() => new Date()))();
  const windowDates = new Set(rollingWindowDates(now, windowDays));

  // Aggregate per-day across adapters. Each adapter's row contributes
  // its `totalRuns` weight to both numerator and denominator so the
  // fleet aggregate is a weighted mean, not a simple mean of rates.
  type DayAgg = { runs: number; shipped: number; clean: number };
  const byDay = new Map<string, DayAgg>();
  for (const row of params.history) {
    if (!windowDates.has(row.date)) continue;
    if (!Number.isFinite(row.totalRuns) || row.totalRuns <= 0) continue;
    if (!Number.isFinite(row.shippedRate) || row.shippedRate < 0 || row.shippedRate > 1) continue;
    if (!Number.isFinite(row.cleanParseRate) || row.cleanParseRate < 0 || row.cleanParseRate > 1) continue;
    const agg = byDay.get(row.date) ?? { runs: 0, shipped: 0, clean: 0 };
    agg.runs += row.totalRuns;
    agg.shipped += row.shippedRate * row.totalRuns;
    agg.clean += row.cleanParseRate * row.totalRuns;
    byDay.set(row.date, agg);
  }

  // Walk the window day by day. Count passing days (both thresholds
  // met) and observed days (any row at all). A day with no rows is
  // not a failure; it is missing data, which collapses to `hold`.
  let passingDays = 0;
  let demoteDay: string | null = null;
  const demoteFloor = shippedThreshold / 2;
  for (const date of windowDates) {
    const agg = byDay.get(date);
    if (agg === undefined) continue;
    const shippedRate = agg.shipped / agg.runs;
    const cleanRate = agg.clean / agg.runs;
    if (shippedRate >= shippedThreshold && cleanRate >= cleanParseThreshold) {
      passingDays += 1;
    }
    if (shippedRate < demoteFloor && demoteDay === null) {
      demoteDay = date;
    }
  }
  const observedDays = byDay.size;

  if (demoteDay !== null) {
    const to = prevPhase(params.current);
    if (to !== null) {
      return {
        kind: 'demote',
        from: params.current,
        to,
        reason: `fleet shipped-rate fell below ${(demoteFloor * 100).toFixed(0)}% on ${demoteDay}`,
      };
    }
    return {
      kind: 'hold',
      current: params.current,
      reason: `would demote (shipped-rate floor breach on ${demoteDay}) but already at M0`,
      passingDays,
      observedDays,
    };
  }

  if (passingDays >= windowDays) {
    const to = nextPhase(params.current);
    if (to !== null) {
      return {
        kind: 'promote',
        from: params.current,
        to,
        evidenceDays: passingDays,
      };
    }
    return {
      kind: 'hold',
      current: params.current,
      reason: `would promote (${passingDays} consecutive passing days) but already at M3`,
      passingDays,
      observedDays,
    };
  }

  return {
    kind: 'hold',
    current: params.current,
    reason:
      observedDays < windowDays
        ? `insufficient data: ${observedDays} / ${windowDays} days observed`
        : `near-miss: ${passingDays} / ${windowDays} days cleared the ${(shippedThreshold * 100).toFixed(0)}% / ${(cleanParseThreshold * 100).toFixed(0)}% thresholds`,
    passingDays,
    observedDays,
  };
}
