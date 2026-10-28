import type { AmrWalletSnapshot, WorkspaceBillingPreflightResponse } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration } from '../collab/workspace-identity';
import type { AmrBalanceGateScope } from './amr-balance-gate';

type FundingFeedback = 'available' | 'insufficient' | 'unknown';
const pending = new Map<string, { generation: number; promise: Promise<FundingFeedback> }>();
let positive: { key: string; expiresAt: number } | null = null;
const homeBlocks = new Map<string, AmrWalletSnapshot>();
let blockAccountGeneration = currentWorkspaceAccountGeneration();
let cacheGeneration = 0;

function fundingKey(scope: AmrBalanceGateScope, modelId: string | null): string {
  const accountGeneration = currentWorkspaceAccountGeneration();
  if (blockAccountGeneration !== accountGeneration) {
    homeBlocks.clear();
    blockAccountGeneration = accountGeneration;
  }
  return JSON.stringify([accountGeneration, scope.workspaceType, scope.workspaceId, scope.workspaceMemberId, modelId]);
}

/** A confirmed insufficiency holds Home until the same principal/model is
 * confirmed available. Expiry, billing invalidation and failed reads are not
 * evidence of funding. A recent positive also overrides the display projection. */
export function cachedHomeAmrFundingBlock(
  scope: AmrBalanceGateScope | undefined,
  modelId: string | null,
  memorySnapshot: AmrWalletSnapshot | null = null,
): AmrWalletSnapshot | null {
  if (!scope) return null;
  const key = fundingKey(scope, modelId);
  if (positive?.key === key && positive.expiresAt > Date.now()) return null;
  return homeBlocks.get(key) ?? memorySnapshot;
}

/** Invalidate reusable positives and in-flight reads, never a confirmed block. */
export function invalidateAmrFundingFeedback(): void {
  cacheGeneration++;
  positive = null;
}

/** Project sends always re-read negative evidence. Home retains the block
 * while confirming it; only a fresh available response removes that block. */
export function checkAmrFundingFeedback(
  scope: AmrBalanceGateScope | undefined,
  modelId: string | null,
  isCurrent: () => boolean = () => true,
): Promise<FundingFeedback> {
  if (!scope || !isCurrent()) return Promise.resolve('unknown');
  const generation = currentWorkspaceAccountGeneration();
  const key = fundingKey(scope, modelId);
  if (positive?.key === key && positive.expiresAt > Date.now()) return Promise.resolve('available');
  const requestGeneration = cacheGeneration;
  const existing = pending.get(key);
  if (existing) {
    if (existing.generation === requestGeneration) return existing.promise;
    // A newer billing publication supersedes this read. Wait for it to settle
    // before checking again; all queued callers then share the latest read.
    return existing.promise.then(() => generation === currentWorkspaceAccountGeneration()
      ? checkAmrFundingFeedback(scope, modelId, isCurrent) : 'unknown');
  }
  const request = (async (): Promise<FundingFeedback> => {
    try {
      const query = new URLSearchParams({ workspaceId: scope.workspaceId });
      if (modelId) query.set('modelId', modelId);
      const response = await fetch(`/api/workspace/billing/preflight?${query}`, {
        cache: 'no-store', signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return 'unknown';
      const { preflight } = await response.json() as WorkspaceBillingPreflightResponse;
      const age = Date.now() - Date.parse(preflight?.generatedAt);
      if (!isCurrent() || generation !== currentWorkspaceAccountGeneration() || requestGeneration !== cacheGeneration || !preflight ||
        preflight.schemaVersion !== 1 || preflight.workspaceId !== scope.workspaceId ||
        preflight.workspaceMemberId !== scope.workspaceMemberId || preflight.modelId !== modelId ||
        !Number.isFinite(age) || age < -5_000 || age > 30_000) return 'unknown';
      if (preflight.fundingCheck === 'available') {
        homeBlocks.delete(key);
        positive = { key, expiresAt: Date.now() + 5_000 };
        return 'available';
      }
      if (preflight.fundingCheck === 'insufficient') {
        const balance = preflight.balanceUsd?.trim();
        if (balance && Number.isFinite(Number(balance)) && Number(balance) <= 0) {
          homeBlocks.set(key, {
            status: 'available', profile: 'default', user: null, balanceUsd: balance,
            updatedAt: preflight.generatedAt, fetchedAt: new Date().toISOString(),
            stale: false, source: 'daemon_cache',
          });
        }
        return 'insufficient';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  })();
  pending.set(key, { generation: requestGeneration, promise: request });
  void request.finally(() => pending.delete(key));
  return request;
}
