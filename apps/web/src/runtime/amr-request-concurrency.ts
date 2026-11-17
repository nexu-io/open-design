import type { WorkspaceRequestConcurrencyHint, WorkspaceRequestConcurrencyResponse } from '@open-design/contracts';
import type { AmrBalanceGateScope } from './amr-balance-gate';

/** Advisory only: no cache, reservation, release, root-task count or auto retry.
 * A missing/failed read is unknown; the actual model request still goes through
 * Link's atomic admission. This cannot guarantee an available slot stays free. */
export async function readAmrRequestConcurrency(
  scope: AmrBalanceGateScope | undefined,
): Promise<WorkspaceRequestConcurrencyHint | null> {
  if (!scope) return null;
  try {
    const query = new URLSearchParams({ workspaceId: scope.workspaceId });
    const response = await fetch(`/api/workspace/billing/request-concurrency?${query}`, {
      cache: 'no-store', signal: AbortSignal.timeout(450),
    });
    if (!response.ok) return null;
    const { requestConcurrencyHint: hint } = await response.json() as WorkspaceRequestConcurrencyResponse;
    if (!hint || hint.workspaceId !== scope.workspaceId || hint.workspaceMemberId !== scope.workspaceMemberId) return null;
    const age = Date.now() - Date.parse(hint.observedAt);
    if (!Number.isFinite(age) || age < -5_000 || age > 5_000) return null;
    if (hint.status === 'unknown') return hint.running === undefined && hint.limit === undefined ? hint : null;
    if ((hint.status !== 'available' && hint.status !== 'full')
      || !Number.isSafeInteger(hint.running) || hint.running < 0
      || !Number.isSafeInteger(hint.limit) || hint.limit < 1
      || (hint.status === 'full') !== (hint.running >= hint.limit)) return null;
    return hint;
  } catch {
    return null;
  }
}
