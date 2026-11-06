import type { AmrWalletSnapshot, WorkspaceBillingPreflight, WorkspaceBillingPreflightResponse } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration } from '../collab/workspace-identity';
import type { AmrBalanceGateScope } from './amr-balance-gate';

type FundingFeedback = 'available' | 'insufficient' | 'unknown';
interface FundingEvidence { kind: FundingFeedback; preflight: WorkspaceBillingPreflight | null }
const pending = new Map<string, { generation: number; promise: Promise<FundingEvidence> }>();
let positive: { key: string; expiresAt: number; preflight: WorkspaceBillingPreflight } | null = null;
const homeBlocks = new Map<string, AmrWalletSnapshot>();
const recentHomeInsufficiency = new Map<string, { preflight: WorkspaceBillingPreflight; observedAt: number }>();
const presentedHomeInsufficiency = new Set<string>();
let blockAccountGeneration = currentWorkspaceAccountGeneration();
let cacheGeneration = 0;

/** Distinguish a superseded send-time read from an ordinary unavailable read. */
export function currentAmrFundingFeedbackGeneration(): number {
  return cacheGeneration;
}

function fundingKey(scope: AmrBalanceGateScope, modelId: string | null): string {
  const accountGeneration = currentWorkspaceAccountGeneration();
  if (blockAccountGeneration !== accountGeneration) {
    homeBlocks.clear();
    recentHomeInsufficiency.clear();
    presentedHomeInsufficiency.clear();
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

/** Only a very recent, exact-principal server verdict may paint the Home
 * block before the send-time read finishes. It never authorizes a send. */
export function recentHomeAmrFundingInsufficiency(
  scope: AmrBalanceGateScope | undefined,
  modelId: string | null,
): WorkspaceBillingPreflight | null {
  if (!scope) return null;
  const key = fundingKey(scope, modelId);
  const recent = recentHomeInsufficiency.get(key);
  if (!recent || positive?.key === key && positive.expiresAt > Date.now()) return null;
  const age = Date.now() - Date.parse(recent.preflight.generatedAt);
  return Date.now() - recent.observedAt <= 5_000 && Number.isFinite(age) && age >= -5_000 && age <= 5_000
    ? recent.preflight : null;
}

/** A remembered negative may accelerate only the first dialog of this
 * insufficient-funding episode. Subsequent explicit sends wait for their own
 * fresh proof, even if the old negative is still within its five-second TTL. */
export function takeHomeAmrFundingFastBlock(
  scope: AmrBalanceGateScope | undefined,
  modelId: string | null,
): { snapshot: AmrWalletSnapshot; preflight: WorkspaceBillingPreflight } | null {
  if (!scope) return null;
  const key = fundingKey(scope, modelId);
  if (presentedHomeInsufficiency.has(key)) return null;
  const preflight = recentHomeAmrFundingInsufficiency(scope, modelId);
  const snapshot = preflight ? cachedHomeAmrFundingBlock(scope, modelId) : null;
  if (!preflight || !snapshot) return null;
  presentedHomeInsufficiency.add(key);
  return { snapshot, preflight };
}

export function noteHomeAmrFundingBlockPresented(
  scope: AmrBalanceGateScope | undefined,
  modelId: string | null,
): void {
  if (scope) presentedHomeInsufficiency.add(fundingKey(scope, modelId));
}

/** Retire a negative episode after this exact member/model has fresh funds.
 * Do not create a reusable positive for the subsequent Project send. */
export function retireHomeAmrFundingBlock(
  scope: AmrBalanceGateScope,
  modelId: string | null,
  preflight: WorkspaceBillingPreflight,
): boolean {
  const age = Date.now() - Date.parse(preflight.generatedAt);
  if (preflight.schemaVersion !== 1 || preflight.workspaceId !== scope.workspaceId
    || preflight.workspaceMemberId !== scope.workspaceMemberId || preflight.modelId !== modelId
    || preflight.fundingCheck !== 'available' || !Number.isFinite(age) || age < -5_000 || age > 30_000) return false;
  const key = fundingKey(scope, modelId);
  homeBlocks.delete(key);
  recentHomeInsufficiency.delete(key);
  presentedHomeInsufficiency.delete(key);
  return true;
}

/** A validated send-time recovery retires the old Home block. This is only a
 * display cache update; the send still follows its own fresh proof and Link. */
export function confirmHomeAmrFundingAvailable(
  scope: AmrBalanceGateScope,
  modelId: string | null,
  preflight: WorkspaceBillingPreflight,
): void {
  if (!retireHomeAmrFundingBlock(scope, modelId, preflight)) return;
  const key = fundingKey(scope, modelId);
  positive = { key, expiresAt: Date.now() + 5_000, preflight };
}

/** Invalidate reusable positives and in-flight reads, never a confirmed block. */
export function invalidateAmrFundingFeedback(): void {
  cacheGeneration++;
  positive = null;
  recentHomeInsufficiency.clear();
}

/** Cacheable/recovery observations remain fenced by billing invalidation;
 * an older response must not restore a retired Home block or reusable hint. */
export function readFreshAmrFundingEvidence(
  scope: AmrBalanceGateScope,
  modelId: string | null,
  isCurrent: () => boolean = () => true,
): Promise<FundingEvidence> {
  const requestGeneration = cacheGeneration;
  return readAmrFundingObservation(scope, modelId, () =>
    isCurrent() && requestGeneration === cacheGeneration);
}

/** Each explicit Send makes its own no-store HTTP request for the current
 * account/member/model, without reusing client display positives. Display-cache
 * refreshes cannot supersede it. The caller fences route/draft changes; Link
 * still owns final admission. */
export function readSendTimeAmrFundingEvidence(
  scope: AmrBalanceGateScope,
  modelId: string | null,
  isCurrent: () => boolean = () => true,
): Promise<FundingEvidence> {
  return readAmrFundingObservation(scope, modelId, isCurrent);
}

async function readAmrFundingObservation(
  scope: AmrBalanceGateScope,
  modelId: string | null,
  isCurrent: () => boolean,
): Promise<FundingEvidence> {
  const unknown = { kind: 'unknown' as const, preflight: null };
  if (!isCurrent()) return unknown;
  const generation = currentWorkspaceAccountGeneration();
  try {
    const query = new URLSearchParams({ workspaceId: scope.workspaceId });
    if (modelId) query.set('modelId', modelId);
    const response = await fetch(`/api/workspace/billing/preflight?${query}`, {
      cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return unknown;
    const { preflight } = await response.json() as WorkspaceBillingPreflightResponse;
    const age = Date.now() - Date.parse(preflight?.generatedAt);
    if (!isCurrent() || generation !== currentWorkspaceAccountGeneration()
      || !preflight
      || preflight.schemaVersion !== 1 || preflight.workspaceId !== scope.workspaceId
      || preflight.workspaceMemberId !== scope.workspaceMemberId || preflight.modelId !== modelId
      || !Number.isFinite(age) || age < -5_000 || age > 30_000) return unknown;
    if (preflight.fundingCheck === 'available' || preflight.fundingCheck === 'insufficient') {
      return { kind: preflight.fundingCheck, preflight };
    }
    return unknown;
  } catch {
    return unknown;
  }
}

/** Project sends always re-read negative evidence. Home retains the block
 * while confirming it; only a fresh available response removes that block. */
export function checkAmrFundingEvidence(
  scope: AmrBalanceGateScope | undefined,
  modelId: string | null,
  isCurrent: () => boolean = () => true,
): Promise<FundingEvidence> {
  const unknown: FundingEvidence = { kind: 'unknown', preflight: null };
  if (!scope || !isCurrent()) return Promise.resolve(unknown);
  const generation = currentWorkspaceAccountGeneration();
  const key = fundingKey(scope, modelId);
  if (positive?.key === key && positive.expiresAt > Date.now()) return Promise.resolve({ kind: 'available', preflight: positive.preflight });
  const requestGeneration = cacheGeneration;
  const existing = pending.get(key);
  if (existing) {
    if (existing.generation === requestGeneration) return existing.promise;
    // A newer billing publication supersedes this read. Wait for it to settle
    // before checking again; all queued callers then share the latest read.
    return existing.promise.then(() => generation === currentWorkspaceAccountGeneration()
      ? checkAmrFundingEvidence(scope, modelId, isCurrent) : unknown);
  }
  const request = (async (): Promise<FundingEvidence> => {
    try {
      const evidence = await readFreshAmrFundingEvidence(scope, modelId, () =>
        isCurrent() && generation === currentWorkspaceAccountGeneration() && requestGeneration === cacheGeneration);
      const preflight = evidence.preflight;
      if (!preflight) return unknown;
      if (preflight.fundingCheck === 'available') {
        homeBlocks.delete(key);
        recentHomeInsufficiency.delete(key);
        presentedHomeInsufficiency.delete(key);
        positive = { key, expiresAt: Date.now() + 5_000, preflight };
        return evidence;
      }
      if (preflight.fundingCheck === 'insufficient') {
        const balance = preflight.balanceUsd?.trim();
        if (balance && Number.isFinite(Number(balance)) && Number(balance) <= 0) {
          recentHomeInsufficiency.set(key, { preflight, observedAt: Date.now() });
          homeBlocks.set(key, {
            status: 'available', profile: 'default', user: null, balanceUsd: balance,
            updatedAt: preflight.generatedAt, fetchedAt: new Date().toISOString(),
            stale: false, source: 'daemon_cache',
          });
        }
        return evidence;
      }
      return unknown;
    } catch {
      return unknown;
    }
  })();
  pending.set(key, { generation: requestGeneration, promise: request });
  void request.finally(() => pending.delete(key));
  return request;
}

/** Legacy verdict callers share the exact request/cache with display consumers. */
export function checkAmrFundingFeedback(
  scope: AmrBalanceGateScope | undefined,
  modelId: string | null,
  isCurrent: () => boolean = () => true,
): Promise<FundingFeedback> {
  return checkAmrFundingEvidence(scope, modelId, isCurrent).then((evidence) => evidence.kind);
}
