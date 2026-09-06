import type { AmrWalletSnapshot } from '@open-design/contracts';
import { fetchVelaLoginStatus } from '../providers/daemon';

function normalizeAmrPlan(plan: string | null | undefined): string | null {
  const normalized = plan?.trim().toLowerCase();
  return normalized || null;
}

/**
 * Is this account explicitly on the free tier — the one tier with nothing but
 * the wallet behind it?
 *
 * Note what this deliberately does NOT have: a `isPaidAmrPlan` counterpart.
 * There used to be one, matching exactly {plus, pro, max}, and it was the
 * filter that hid the low-balance reminder from free, `go`, and unreadable
 * tiers (OPEND-2600). Product overturned that on 2026-09-03 (T38: every tier
 * sees the reminder), and the predicate was removed rather than left lying
 * around under a name that invites the same filter back — a name that also
 * answered its own question wrongly, since `enterprise` is a paid plan it
 * called unpaid.
 *
 * The two are not complements and never were: an unreadable plan is neither
 * free nor paid. That asymmetry is the whole point of asking the FREE question
 * — `planMayFundRunOutsideWallet` is `!isFreeAmrPlan(...)`, so an unreadable
 * plan fails OPEN and is never hard-blocked (T39). Pinned in
 * `tests/runtime/amr-low-balance-plan.test.ts`.
 */
export function isFreeAmrPlan(plan: string | null | undefined): boolean {
  return normalizeAmrPlan(plan) === 'free';
}

export async function resolveAmrPlan(
  snapshot: AmrWalletSnapshot,
): Promise<string | null> {
  const status = await fetchVelaLoginStatus().catch(() => null);
  if (status?.loggedIn === true) {
    const accountPlan = normalizeAmrPlan(status.account?.plan);
    if (accountPlan) return accountPlan;

    const userPlan = normalizeAmrPlan(status.user?.plan);
    if (userPlan) return userPlan;
  }

  return normalizeAmrPlan(snapshot.user?.plan);
}
