import type { AmrWalletSnapshot } from '@open-design/contracts';
import { fetchVelaLoginStatus } from '../providers/daemon';

export async function resolveAmrLowBalancePlan(
  snapshot: AmrWalletSnapshot,
): Promise<string | null> {
  const snapshotPlan = snapshot.user?.plan?.trim();
  if (snapshotPlan) return snapshotPlan;

  const status = await fetchVelaLoginStatus().catch(() => null);
  if (status?.loggedIn !== true) return null;

  const accountPlan = status.account?.plan?.trim();
  if (accountPlan) return accountPlan;

  return status.user?.plan?.trim() || null;
}
