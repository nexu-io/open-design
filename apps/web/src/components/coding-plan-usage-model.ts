// The pure reading of a Coding Plan preflight, kept out of the component so
// the one number the panel draws can be pinned in a spec without rendering
// anything.

import type { WorkspaceBillingPreflight } from '@open-design/contracts';

type CodingPlanWindow = WorkspaceBillingPreflight['codingPlan']['windows'][number];

/**
 * The window the product surface is about.
 *
 * The daemon still ships every window the backend enforces (5 hours, 7 days,
 * 30 days), but the panel names exactly one allowance — 「7天额度免费用」 — so
 * the 7-day pool is the one it may draw. The others are enforcement detail the
 * design deliberately does not surface.
 */
export const CODING_PLAN_WEEK_SECONDS = 604_800;

/** A whole, non-negative credit count as the backend writes it (a decimal string). */
function creditCount(raw: string): bigint | null {
  return /^\d+$/.test(raw) ? BigInt(raw) : null;
}

/**
 * The window the panel draws: the 7-day one when the server sent it, the
 * LONGEST one otherwise.
 *
 * The fallback exists because the window set is the backend's to change. If a
 * future policy drops the 7-day pool, the longest remaining window is the
 * closest honest stand-in for an allowance measured in days — the alternative
 * is drawing a 5-hour pool under a label that says 7 days.
 */
function quotaWindow(windows: readonly CodingPlanWindow[]): CodingPlanWindow | null {
  if (windows.length === 0) return null;
  const week = windows.find((entry) => entry.durationSeconds === CODING_PLAN_WEEK_SECONDS);
  if (week) return week;
  return windows.reduce((longest, entry) =>
    entry.durationSeconds > longest.durationSeconds ? entry : longest,
  );
}

export interface CodingPlanQuotaView {
  policyId: string;
  durationSeconds: number;
  /** Share of the pool ALREADY SPENT, a whole percent clamped to 0–100. */
  usedPercent: number;
}

/**
 * What the quota row draws, or null when there is nothing drawable.
 *
 * Null covers both "the server sent no windows" and "the chosen window's
 * numbers are not a readable share" (an unparseable count, a zero limit). The
 * design defines a normal state and a loading state and nothing else, so an
 * unreadable share is an ABSENCE — the card falls back to its wallet row —
 * rather than a bar drawn at a guessed zero.
 */
export function codingPlanQuotaView(
  windows: readonly CodingPlanWindow[],
): CodingPlanQuotaView | null {
  const entry = quotaWindow(windows);
  if (!entry) return null;
  const used = creditCount(entry.usedCredits);
  const limit = creditCount(entry.limitCredits);
  if (used === null || limit === null || limit === 0n) return null;
  // Through BigInt: a plan pool is far past Number.MAX_SAFE_INTEGER, so the
  // ratio has to be taken before it ever becomes a float.
  const basisPoints = Number((used * 10_000n) / limit);
  return {
    policyId: entry.policyId,
    durationSeconds: entry.durationSeconds,
    usedPercent: Math.min(100, Math.max(0, Math.round(basisPoints / 100))),
  };
}
