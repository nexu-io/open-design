// Pre-run balance gate for the Open Design Cloud agent. Two tiers:
//
//   HARD  — the run cannot possibly succeed: the account is signed out, or the
//           wallet balance is definitively <= $0. The send is blocked and the
//           subscription dialog is the only way forward (plus dismiss).
//   SOFT  — the run can start but may die mid-flight: balance is at or below
//           the low-balance warning line. The user is warned once per send and
//           may proceed anyway, top up first, or opt out of future warnings.
//
// Account-scoped reads fail open when unavailable. An explicitly team-scoped
// project fails closed when its exact workspace/member epoch cannot be proven:
// falling back to the account wallet would make the preflight disagree with
// the final daemon spawn authority.

import type {
  AmrWalletSnapshot,
  WorkspaceCollabContext,
  WorkspaceBillingResponse,
} from '@open-design/contracts';
import { fetchAmrWalletSnapshot } from '../providers/daemon';

/**
 * Hard-block line (USD): at or below this the wallet cannot fund any part of
 * a run, so starting one only manufactures a mid-run
 * AMR_INSUFFICIENT_BALANCE failure.
 */
export const AMR_HARD_BLOCK_BALANCE_USD = 0;

/**
 * Soft-warning line (USD): at or below this a run may start but is likely to
 * exhaust the wallet before finishing. Tune from data: the starting-balance
 * distribution of AMR_INSUFFICIENT_BALANCE failures tells you where this
 * line should actually sit.
 */
export const AMR_LOW_BALANCE_WARN_USD = 2;

const LOW_BALANCE_WARN_OPTOUT_KEY = 'open-design:amr-low-balance-warn-optout:v1';

export type AmrBalanceGateResult =
  | { kind: 'allow' }
  | { kind: 'unavailable' }
  | { kind: 'hard'; reason: 'insufficient'; snapshot: AmrWalletSnapshot }
  | { kind: 'hard'; reason: 'signed_out'; snapshot: AmrWalletSnapshot }
  | { kind: 'soft'; snapshot: AmrWalletSnapshot };

export const HOME_AMR_BALANCE_RETRY_DELAYS_MS = [400, 1_200] as const;

/**
 * Home has no project queue to hold a send while a cold Workspace billing
 * projection catches up. Give that transient state a small, bounded recovery
 * window before returning control to the composer. Only `unavailable` is
 * retried; definitive allow/soft/hard decisions are never delayed.
 */
export async function retryUnavailableAmrBalanceGate(
  check: () => Promise<AmrBalanceGateResult>,
): Promise<AmrBalanceGateResult> {
  let result = await check();
  for (const delayMs of HOME_AMR_BALANCE_RETRY_DELAYS_MS) {
    if (result.kind !== 'unavailable') return result;
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    });
    result = await check();
  }
  return result;
}

export interface AmrBalanceGateScope {
  workspaceType: 'personal' | 'team';
  workspaceId: string;
  workspaceMemberId: string;
}

export function isAmrBalanceGateScope(value: unknown): value is AmrBalanceGateScope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.workspaceType === 'personal' || candidate.workspaceType === 'team') &&
    typeof candidate.workspaceId === 'string' &&
    candidate.workspaceId.trim().length > 0 &&
    typeof candidate.workspaceMemberId === 'string' &&
    candidate.workspaceMemberId.trim().length > 0
  );
}

/**
 * Capture the exact workspace/member authority that an AMR preflight checked.
 * A successful preflight may only be reused while this witness still matches.
 */
export function amrBalanceGateScopeForWorkspaceContext(
  context:
    | Pick<
        WorkspaceCollabContext,
        'workspaceType' | 'workspaceId' | 'workspaceMemberId'
      >
    | null
    | undefined,
): AmrBalanceGateScope | undefined {
  if (!context) return undefined;
  const workspaceId = context.workspaceId.trim();
  const workspaceMemberId = context.workspaceMemberId.trim();
  if (!workspaceId || !workspaceMemberId) return undefined;
  return {
    workspaceType: context.workspaceType,
    workspaceId,
    workspaceMemberId,
  };
}

export function amrBalanceGateScopesMatch(
  checked: AmrBalanceGateScope | undefined,
  current: AmrBalanceGateScope | undefined,
): boolean {
  if (!checked || !current) return false;
  return (
    checked.workspaceType === current.workspaceType &&
    checked.workspaceId === current.workspaceId &&
    checked.workspaceMemberId === current.workspaceMemberId
  );
}

/** Parse a definitive balance from a snapshot; null when the answer is
 * indefinite (missing/unavailable/unparseable — those must fail open). */
export function amrWalletBalanceUsd(
  snapshot: AmrWalletSnapshot | null | undefined,
): number | null {
  if (!snapshot || snapshot.status !== 'available') return null;
  // Trim before the emptiness check: Number(' ') is 0, so an untrimmed
  // whitespace-only balance would read as a definitive $0 and block instead
  // of failing open like every other unparseable answer.
  const raw = snapshot.balanceUsd?.trim();
  if (raw == null || raw === '') return null;
  const balance = Number(raw);
  return Number.isFinite(balance) ? balance : null;
}

/** Whether a snapshot definitively shows a hard-block balance (<= $0). */
export function amrWalletBalanceInsufficient(
  snapshot: AmrWalletSnapshot | null | undefined,
): boolean {
  const balance = amrWalletBalanceUsd(snapshot);
  return balance != null && balance <= AMR_HARD_BLOCK_BALANCE_USD;
}

/** Whether the user opted out of the low-balance soft warning ("don't remind
 * me again"). Hard blocks are never subject to this opt-out. */
export function isAmrLowBalanceWarnOptedOut(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LOW_BALANCE_WARN_OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAmrLowBalanceWarnOptedOut(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOW_BALANCE_WARN_OPTOUT_KEY, '1');
  } catch {
    // Persistence failure just means the warning shows again next time.
  }
}

/**
 * Decide whether an Open Design Cloud run may start. Fast path first: the
 * daemon-cached snapshot answers without an upstream roundtrip, so healthy
 * balances start with no added latency. Only a hard-block answer is confirmed
 * against the live wallet (refresh=1) — the cache may predate a recharge or
 * subscription, and a just-topped-up user must never be hard-blocked. The
 * soft tier trusts the cache (its cost is one dismissible reminder, and the
 * daemon cache is at most a few seconds old).
 */
async function fetchTeamWorkspaceWalletSnapshot(
  scope: AmrBalanceGateScope,
  accountSnapshot: AmrWalletSnapshot | null,
): Promise<AmrWalletSnapshot | null> {
  const workspaceId = scope.workspaceId.trim();
  const workspaceMemberId = scope.workspaceMemberId.trim();
  if (!workspaceId || !workspaceMemberId) return null;
  const response = await fetch(
    `/api/workspace/billing?scope=workspace&workspaceId=${encodeURIComponent(workspaceId)}&freshness=authoritative`,
    { cache: 'no-store' },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as WorkspaceBillingResponse;
  const runtime = body.workspaceRuntime;
  const authoritativeRead = body.authoritativeWorkspaceRead;
  const hardExpiresAt = runtime?.hardExpiresAt
    ? Date.parse(runtime.hardExpiresAt)
    : Number.NaN;
  if (
    (
      !runtime ||
      !authoritativeRead ||
      runtime.workspaceId !== workspaceId ||
      runtime.workspaceMemberId !== workspaceMemberId ||
      runtime.status !== 'fresh' ||
      !runtime.observedAt ||
      !Number.isFinite(hardExpiresAt) ||
      hardExpiresAt <= Date.now() ||
      authoritativeRead.workspaceId !== workspaceId ||
      authoritativeRead.workspaceMemberId !== workspaceMemberId ||
      authoritativeRead.observedAt !== runtime.observedAt
    )
  ) {
    return null;
  }
  const workspaceBalance = body.workspaceBalance;
  if (
    !workspaceBalance ||
    workspaceBalance.billingScopeVersion !== 2 ||
    workspaceBalance.workspaceId !== workspaceId ||
    workspaceBalance.workspaceMemberId !== workspaceMemberId
  ) {
    return null;
  }
  return {
    status: 'available',
    profile: accountSnapshot?.profile ?? 'default',
    user: accountSnapshot?.user ?? null,
    balanceUsd: workspaceBalance.balanceUsd,
    updatedAt: workspaceBalance.updatedAt,
    fetchedAt: new Date().toISOString(),
    stale: false,
    source: 'vela_api',
  };
}

async function checkTeamWorkspaceBalanceGate(
  scope: AmrBalanceGateScope,
): Promise<AmrBalanceGateResult> {
  // The URL carries the selected workspace identity. The daemon authorizes
  // that exact directory membership and returns a v2 identity-stamped wallet.
  // Start it alongside the cached account snapshot: the latter preserves the
  // existing signed-out confirmation and profile-aware recovery links, but no
  // longer sits in front of the authoritative Workspace read.
  let [accountSnapshot, workspaceSnapshot] = await Promise.all([
    fetchAmrWalletSnapshot().catch(() => null),
    fetchTeamWorkspaceWalletSnapshot(scope, null).catch(() => null),
  ]);
  if (accountSnapshot?.status === 'signed_out') {
    const freshAccount = await fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
    if (freshAccount?.status === 'signed_out') {
      return {
        kind: 'hard',
        reason: 'signed_out',
        snapshot: freshAccount,
      };
    }
    accountSnapshot = freshAccount;
  }
  if (workspaceSnapshot && accountSnapshot) {
    workspaceSnapshot = {
      ...workspaceSnapshot,
      profile: accountSnapshot.profile,
      user: accountSnapshot.user,
    };
  }
  const balance = amrWalletBalanceUsd(workspaceSnapshot);
  if (balance == null) return { kind: 'unavailable' };
  if (balance <= AMR_HARD_BLOCK_BALANCE_USD) {
    return {
      kind: 'hard',
      reason: 'insufficient',
      snapshot: workspaceSnapshot!,
    };
  }
  if (balance <= AMR_LOW_BALANCE_WARN_USD && !isAmrLowBalanceWarnOptedOut()) {
    return { kind: 'soft', snapshot: workspaceSnapshot! };
  }
  return { kind: 'allow' };
}

export async function checkAmrBalanceGate(
  scope?: AmrBalanceGateScope,
): Promise<AmrBalanceGateResult> {
  try {
    if (scope?.workspaceType === 'team') {
      return await checkTeamWorkspaceBalanceGate(scope);
    }
    const cached = await fetchAmrWalletSnapshot().catch(() => null);
    const cachedBalance = amrWalletBalanceUsd(cached);
    const cachedHardCandidate =
      cached?.status === 'signed_out' ||
      (cachedBalance != null && cachedBalance <= AMR_HARD_BLOCK_BALANCE_USD);
    if (!cachedHardCandidate) {
      if (cachedBalance == null) return { kind: 'allow' };
      if (cachedBalance > AMR_LOW_BALANCE_WARN_USD || isAmrLowBalanceWarnOptedOut()) {
        return { kind: 'allow' };
      }
      // cached is non-null here: a definitive balance implies a snapshot.
      return { kind: 'soft', snapshot: cached! };
    }
    // Hard-block candidate (signed out or empty): confirm against the live
    // wallet before blocking — the cache may predate a sign-in or recharge.
    const fresh = await fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
    if (fresh == null) return { kind: 'allow' };
    // Signed-out is decided from the LOCAL profile read, so it is definitive
    // even though the snapshot carries an explanatory `signed_out` error —
    // check it before the stale/error guard below.
    if (fresh.status === 'signed_out') {
      return { kind: 'hard', reason: 'signed_out', snapshot: fresh };
    }
    // A failed refresh hands back the PREVIOUS cached snapshot flagged
    // `stale: true` (plus an upstream/network `error`). That is not a fresh
    // definitive answer, so it must not confirm a hard block — a user who
    // just topped up while the wallet endpoint hiccuped would be stranded.
    if (fresh.stale || fresh.error != null) return { kind: 'allow' };
    const freshBalance = amrWalletBalanceUsd(fresh);
    if (freshBalance == null) return { kind: 'allow' };
    if (freshBalance <= AMR_HARD_BLOCK_BALANCE_USD) {
      return { kind: 'hard', reason: 'insufficient', snapshot: fresh };
    }
    if (freshBalance <= AMR_LOW_BALANCE_WARN_USD && !isAmrLowBalanceWarnOptedOut()) {
      return { kind: 'soft', snapshot: fresh };
    }
    return { kind: 'allow' };
  } catch {
    // Account checks retain the legacy fail-open behavior. Team projects must
    // prove the exact member-scoped wallet before proceeding.
    return scope?.workspaceType === 'team'
      ? { kind: 'unavailable' }
      : { kind: 'allow' };
  }
}
