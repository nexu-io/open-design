// The pure reading of a Coding Plan preflight, kept out of the component so
// the numbers and the reset countdown can be pinned in a spec (fixed clock,
// fixed timezone) without rendering anything.

import type { WorkspaceBillingPreflight } from '@open-design/contracts';
import { formatVelaBalanceUsd } from '../providers/daemon';

type CodingPlanWindow = WorkspaceBillingPreflight['codingPlan']['windows'][number];

/**
 * Fallback credits per US dollar.
 *
 * The live rate is the backend's: Vela computes it and ships it as
 * `creditsPerUsd` on `vela billing summary --format json`, the daemon passes it
 * through on `WorkspaceBillingSummary`, and every function here takes it as an
 * argument. This constant is only what an older CLI / backend that reports no
 * rate falls back to, so the panel still prints money instead of nothing. It is
 * NOT a second source of truth — never prefer it over a rate the server sent.
 */
export const CODING_PLAN_CREDITS_PER_USD = 10_000;

/**
 * The rate to divide by: the server's when it sent a usable one, the documented
 * fallback otherwise. Usable means a finite number of at least one credit per
 * dollar. Anything else — absent, zero, negative, unparseable, or a fraction of
 * a credit — is not a rate the panel can honour: the division runs in BigInt, so
 * a sub-1 rate rounds to zero and throws rather than printing anything.
 */
function resolveCreditsPerUsd(creditsPerUsd?: number | null): bigint {
  return typeof creditsPerUsd === 'number' &&
    Number.isFinite(creditsPerUsd) &&
    creditsPerUsd >= 1
    ? BigInt(Math.round(creditsPerUsd))
    : BigInt(CODING_PLAN_CREDITS_PER_USD);
}

const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** A whole, non-negative credit count as B writes it (a decimal string). */
function creditCount(raw: string): bigint | null {
  return /^\d+$/.test(raw) ? BigInt(raw) : null;
}

/**
 * How a window names itself. The three shipped policies (5 hours / 7 days /
 * 30 days) are just the cases where this lands on a round number — a policy
 * the backend adds later still names itself instead of printing raw seconds.
 */
export function codingPlanWindowDuration(
  durationSeconds: number,
): { unit: 'hour' | 'day'; count: number } {
  if (durationSeconds % SECONDS_PER_DAY === 0) {
    return { unit: 'day', count: durationSeconds / SECONDS_PER_DAY };
  }
  return {
    unit: 'hour',
    count: Math.round((durationSeconds / SECONDS_PER_HOUR) * 10) / 10,
  };
}

/**
 * Credits → dollars at the server's rate. Null when the server value is not a
 * credit count. `creditsPerUsd` is the rate from `WorkspaceBillingSummary`;
 * omitting it falls back to `CODING_PLAN_CREDITS_PER_USD`.
 */
export function codingPlanCreditsToUsd(
  raw: string,
  creditsPerUsd?: number | null,
): number | null {
  const credits = creditCount(raw);
  if (credits === null) return null;
  // Cents through BigInt: a plan pool is far past Number.MAX_SAFE_INTEGER.
  return Number((credits * 100n) / resolveCreditsPerUsd(creditsPerUsd)) / 100;
}

export interface CodingPlanWindowView {
  policyId: string;
  durationSeconds: number;
  /** Share of the pool ALREADY SPENT, clamped to 0–100. Null when unreadable. */
  usedPercent: number | null;
  /** What is left, as money (e.g. `$75.00`). Null when unreadable. */
  remainingUsd: string | null;
  /** The pool is empty. Presentation only — no guidance is owned here. */
  exhausted: boolean;
  /** Never used and not anchored: nothing is counting down yet. */
  notStarted: boolean;
  resetsAt: string | null;
}

/**
 * One view per window the server sent — never a sum, never a synthesized
 * window — ordered shortest-first so the tightest limit reads first.
 */
export function codingPlanWindowViews(
  windows: readonly CodingPlanWindow[],
  creditsPerUsd?: number | null,
): CodingPlanWindowView[] {
  return [...windows]
    .sort((a, b) => a.durationSeconds - b.durationSeconds)
    .map((entry) => {
      const used = creditCount(entry.usedCredits);
      const limit = creditCount(entry.limitCredits);
      const remaining = creditCount(entry.remainingCredits);
      const usedPercent =
        used === null || limit === null || limit === 0n
          ? null
          : Math.min(100, Math.max(0, Number((used * 10_000n) / limit) / 100));
      const remainingUsd = codingPlanCreditsToUsd(entry.remainingCredits, creditsPerUsd);
      return {
        policyId: entry.policyId,
        durationSeconds: entry.durationSeconds,
        usedPercent,
        remainingUsd: remainingUsd === null ? null : formatVelaBalanceUsd(String(remainingUsd)),
        exhausted:
          remaining === 0n || (used !== null && limit !== null && limit > 0n && used >= limit),
        notStarted: entry.resetsAt === null && used === 0n,
        resetsAt: entry.resetsAt,
      };
    });
}

/**
 * Time left before the window resets, split into days, hours and minutes. The
 * caller renders the coarsest unit that is non-zero: days (with hours), hours
 * alone inside a day, minutes alone inside the last hour.
 *
 * The minute band is the point of the split. The final hour is when waiting
 * for the reset is an actual choice, so it is the hour the countdown is worth
 * the most — dropping to the bare instant there hands the subtraction back to
 * the reader at exactly the wrong moment.
 *
 * Null only once nothing whole is left to name: under a minute, or the instant
 * has already passed. That is the one case where the caller genuinely has to
 * fall back to the instant rather than render a hollow 「0 分钟后重置」.
 */
export function codingPlanResetCountdown(
  resetsAt: string,
  now: number,
): { days: number; hours: number; minutes: number } | null {
  const remainingMs = Date.parse(resetsAt) - now;
  if (!Number.isFinite(remainingMs) || remainingMs < MS_PER_MINUTE) return null;
  return {
    days: Math.floor(remainingMs / MS_PER_DAY),
    hours: Math.floor((remainingMs % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((remainingMs % MS_PER_HOUR) / MS_PER_MINUTE),
  };
}

/**
 * `resetsAt` is a UTC instant; the user reads their own wall clock, so it is
 * rendered through `Intl` in the viewer's zone. `timeZone` exists for specs
 * that must not depend on the machine running them.
 */
export function formatCodingPlanResetAt(
  resetsAt: string,
  locale: string,
  timeZone?: string,
): string | null {
  const instant = Date.parse(resetsAt);
  if (!Number.isFinite(instant)) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(instant);
  } catch {
    return null;
  }
}
