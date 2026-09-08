import type { AmrWalletSnapshot } from '@open-design/contracts';
import { fetchVelaLoginStatus } from '../providers/daemon';

function normalizeAmrPlan(plan: string | null | undefined): string | null {
  const normalized = plan?.trim().toLowerCase();
  return normalized || null;
}

/*
 * Two tier predicates used to live here, and both are gone in the order their
 * premises were overturned:
 *
 *   `isPaidAmrPlan` — matched exactly {plus, pro, max} and hid the low-balance
 *     reminder from free, `go`, and unreadable tiers (OPEND-2600). Removed when
 *     product ruled every tier sees the reminder (T38, 2026-09-03). It also
 *     answered its own question wrongly: `enterprise` is a paid plan it called
 *     unpaid.
 *
 *   `isFreeAmrPlan` — matched the literal `'free'` and was the whole of
 *     `planMayFundRunOutsideWallet` (`!isFreeAmrPlan(...)`), the balance gate's
 *     hard-block stand-down. Removed when product ruled the out-of-credits
 *     matrix governs Personal workspaces too (T55, 2026-09-06): a readable paid
 *     tier is no longer a reason to let an empty wallet through, so "is it free"
 *     stopped being a question anything asked. Its exact-match narrowness was
 *     the reported bug — `basic` counted as "not free" and sailed through.
 *
 * What survives both rulings is the asymmetry itself, and it now lives in
 * `amr-balance-gate.ts` as `amrPlanTierUnreadable`: free and paid are not
 * complements, an unreadable tier is neither, and only the unreadable case may
 * fail open. Do not reintroduce a tier predicate here to serve one call site.
 */

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
