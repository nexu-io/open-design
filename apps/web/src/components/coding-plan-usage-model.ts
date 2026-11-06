// The pure reading of a Coding Plan preflight, kept out of the component so
// the numbers the panel draws can be pinned in a spec without rendering
// anything.

import type { WorkspaceBillingPreflight } from '@open-design/contracts';
import type { Dict } from '../i18n/types';

type CodingPlanWindow = WorkspaceBillingPreflight['codingPlan']['windows'][number];

const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;

/** A whole, non-negative credit count as the backend writes it (a decimal string). */
function creditCount(raw: string): bigint | null {
  return /^\d+$/.test(raw) ? BigInt(raw) : null;
}

/** The i18n key a period is named by, and the count that fills it. */
export interface CodingPlanPeriodLabel {
  key: Extract<
    keyof Dict,
    'billing.codingPlanPeriodHours' | 'billing.codingPlanPeriodDays'
  >;
  count: number;
}

/**
 * How a window's length is named: 「5 小时」 or 「7 天」.
 *
 * Derived from `durationSeconds` rather than matched against a table of known
 * policies, because the window set is the BACKEND'S to change — the design
 * pairs Go with 5 小时 + 7 天 today, and a new pool must name itself without a
 * client release.
 *
 * Null when the duration is not a whole number of either unit (90 minutes, 36
 * hours). The design ships copy for exactly two units, so an inexact duration
 * drops the period suffix rather than inventing 「1.5 天」 — the allowance name,
 * the share and the bar still read.
 */
export function codingPlanPeriodLabel(durationSeconds: number): CodingPlanPeriodLabel | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  if (durationSeconds % DAY_SECONDS === 0) {
    return { key: 'billing.codingPlanPeriodDays', count: durationSeconds / DAY_SECONDS };
  }
  if (durationSeconds < DAY_SECONDS && durationSeconds % HOUR_SECONDS === 0) {
    return { key: 'billing.codingPlanPeriodHours', count: durationSeconds / HOUR_SECONDS };
  }
  return null;
}

export interface CodingPlanQuotaView {
  policyId: string;
  durationSeconds: number;
  /** Share of the pool STILL AVAILABLE, a whole percent clamped to 0–100. */
  remainingPercent: number;
  /** What names this window's period, or null when no exact unit fits. */
  periodLabel: CodingPlanPeriodLabel | null;
}

/**
 * Every window the panel draws, shortest period first.
 *
 * ONE BLOCK PER BACKEND WINDOW — the client no longer picks a single pool. The
 * v2 design draws Go with two blocks (5 小时 over 7 天) and Plus/Pro/Max with
 * one (7 天), and that difference is not a client rule: it is what each plan's
 * preflight returns. Hard-coding "the 7-day one" made every other enforced
 * pool invisible, which is how a Go subscriber could be stopped by a 5-hour
 * limit the panel never mentioned.
 *
 * A window whose numbers are not a readable share (an unparseable count, a zero
 * limit) is dropped on its own rather than taking the panel down with it: a
 * readable 5-hour pool still draws beside a broken 7-day one. An empty result
 * means the card falls back to its wallet row alone.
 */
export function codingPlanQuotaView(
  windows: readonly CodingPlanWindow[],
): CodingPlanQuotaView[] {
  return windows
    .map((entry): CodingPlanQuotaView | null => {
      const used = creditCount(entry.usedCredits);
      const limit = creditCount(entry.limitCredits);
      if (used === null || limit === null || limit === 0n) return null;
      // Through BigInt: a plan pool is far past Number.MAX_SAFE_INTEGER, so the
      // ratio has to be taken before it ever becomes a float.
      const basisPoints = Number((used * 10_000n) / limit);
      const usedPercent = Math.min(100, Math.max(0, Math.round(basisPoints / 100)));
      return {
        policyId: entry.policyId,
        durationSeconds: entry.durationSeconds,
        // Taken from the rounded spent share rather than from `remainingCredits`
        // so the number the row prints and the width the bar draws can never
        // disagree by a rounding step.
        remainingPercent: 100 - usedPercent,
        periodLabel: codingPlanPeriodLabel(entry.durationSeconds),
      };
    })
    .filter((view): view is CodingPlanQuotaView => view !== null)
    .sort((left, right) => left.durationSeconds - right.durationSeconds);
}
