import type {
  AmrWalletSnapshot,
  WorkspaceCollabContext,
  WorkspaceBillingResponse,
  WorkspaceBillingPreflight,
} from '@open-design/contracts';
import { fetchAmrWalletSnapshot } from '../providers/daemon';

// Wallet balance is display data, not proof that a run cannot be funded.
// Coding Plan, free models and automatic recharge are decided by Link.
export const AMR_HARD_BLOCK_BALANCE_USD = 0;
export type AmrBalanceGateResult =
  | { kind: 'allow' }
  | { kind: 'unavailable' }
  | { kind: 'hard'; reason: 'insufficient' | 'signed_out'; snapshot: AmrWalletSnapshot }
  | { kind: 'empty_not_blocked'; snapshot: AmrWalletSnapshot };

export const HOME_AMR_BALANCE_RETRY_DELAYS_MS = [400, 1_200] as const;

/** A cached wallet alone cannot prove that a task is unfunded. */
export function amrBalanceGateFromMemory(
  _balanceUsd: string | null | undefined,
  _options: { profile?: string | null; updatedAt?: string | null } = {},
): null {
  return null;
}

/**
 * Home has no project queue to hold a send while a cold Workspace billing
 * projection catches up. Give that transient state a small, bounded recovery
 * window before returning control to the composer. Only `unavailable` is
 * retried; every definitive decision is delivered immediately.
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
    | Pick<WorkspaceCollabContext, 'workspaceType' | 'workspaceId' | 'workspaceMemberId'>
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
export function amrWalletBalanceUsd(snapshot: AmrWalletSnapshot | null | undefined): number | null {
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

async function fetchWorkspaceWalletSnapshot(
  scope: AmrBalanceGateScope,
  accountSnapshot: AmrWalletSnapshot | null,
  options: { modelId?: string | null; includePreflight?: boolean } = {},
): Promise<(AmrWalletSnapshot & { preflight: WorkspaceBillingPreflight | null }) | null> {
  const workspaceId = scope.workspaceId.trim();
  const workspaceMemberId = scope.workspaceMemberId.trim();
  if (!workspaceId || !workspaceMemberId) return null;
  const includePreflight = options.includePreflight === true;
  const modelId = includePreflight ? options.modelId?.trim() : undefined;
  const response = await fetch(
    `/api/workspace/billing?scope=workspace&workspaceId=${encodeURIComponent(workspaceId)}&freshness=authoritative${includePreflight ? '&includePreflight=1' : ''}${modelId ? `&modelId=${encodeURIComponent(modelId)}` : ''}`,
    { cache: 'no-store' },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as WorkspaceBillingResponse;
  const runtime = body.workspaceRuntime;
  const authoritativeRead = body.authoritativeWorkspaceRead;
  const hardExpiresAt = runtime?.hardExpiresAt ? Date.parse(runtime.hardExpiresAt) : Number.NaN;
  if (
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
    preflight:
      body.preflight?.workspaceId === workspaceId &&
      body.preflight.workspaceMemberId === workspaceMemberId &&
      body.preflight.modelId === (modelId || null) &&
      Math.abs(Date.now() - Date.parse(body.preflight.generatedAt)) < 60_000
        ? body.preflight
        : null,
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

/**
 * The wallet whose balance a post-failure surface is allowed to NAME for a run
 * in `scope` — the upgrade card's 剩余额度.
 *
 * The number is not decoration. It picks the card's tier (orange "running low"
 * vs red "out"), the sentence beside it, and whether the reader believes the
 * next run can start at all. So it has to be the money the run was actually
 * spending, which for a workspace-scoped run is the WORKSPACE wallet.
 *
 * `/api/integrations/vela/wallet` cannot answer that question: it is the
 * signed-in ACCOUNT's wallet and takes no workspace parameter, so on a team
 * project it reports the reader's personal balance. A team wallet at $0 next to
 * a personal $12.50 does not merely print the wrong digits — it paints the card
 * orange and says 「余额可能撑不完下一个任务」 for a run that cannot start, and
 * points at money that could never have funded it.
 *
 * Same read, and the same refusal to fall back, as the send gate: an explicitly
 * scoped run whose exact member epoch cannot be proven returns null rather than
 * substituting account money. Null means NOBODY can name this number, and the
 * caller must hand the story back to the error card instead of printing the
 * account's.
 *
 * No scope at all is the legacy/account case — an unbound historical project
 * spends the account wallet, so there the account read IS the answer.
 */
export async function fetchAmrBalanceCardWalletSnapshot(
  scope?: AmrBalanceGateScope,
): Promise<AmrWalletSnapshot | null> {
  if (!scope) {
    // `refresh` forces one upstream read: the failure event carries no balance,
    // and a cache that predates the run's own spending would under-report it.
    return fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
  }
  // The account read rides along only for `profile` / `user` — the metadata the
  // recovery link's profile fallback needs. It is never consulted for money.
  const [accountSnapshot, workspaceSnapshot] = await Promise.all([
    fetchAmrWalletSnapshot().catch(() => null),
    fetchWorkspaceWalletSnapshot(scope, null).catch(() => null),
  ]);
  if (!workspaceSnapshot) return null;
  if (!accountSnapshot) return workspaceSnapshot;
  return {
    ...workspaceSnapshot,
    profile: accountSnapshot.profile,
    user: accountSnapshot.user,
  };
}

async function checkWorkspaceBalanceGate(
  scope: AmrBalanceGateScope,
): Promise<AmrBalanceGateResult> {
  const [accountSnapshot, workspaceSnapshot] = await Promise.all([
    fetchAmrWalletSnapshot().catch(() => null),
    fetchWorkspaceWalletSnapshot(scope, null).catch(() => null),
  ]);
  if (accountSnapshot?.status === 'signed_out') {
    const fresh = await fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
    if (fresh?.status === 'signed_out')
      return { kind: 'hard', reason: 'signed_out', snapshot: fresh };
  }
  // Preserve exact-member authority. Older CLI responses have no preflight;
  // lack of quota evidence must never become a wallet-only hard block.
  if (!workspaceSnapshot) return { kind: 'unavailable' };
  return { kind: 'allow' };
}

export async function checkAmrBalanceGate(
  scope?: AmrBalanceGateScope,
  _modelId?: string | null,
): Promise<AmrBalanceGateResult> {
  try {
    if (scope) return await checkWorkspaceBalanceGate(scope);
    const cached = await fetchAmrWalletSnapshot().catch(() => null);
    if (cached?.status === 'signed_out') {
      const fresh = await fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
      if (fresh?.status === 'signed_out')
        return { kind: 'hard', reason: 'signed_out', snapshot: fresh };
    }
    // An unscoped legacy account cannot prove which pool will fund the run.
    return { kind: 'allow' };
  } catch {
    return scope ? { kind: 'unavailable' } : { kind: 'allow' };
  }
}

/** Recovery needs positive evidence, unlike the advisory send gate. */
export async function hasAmrFundingRecovered(
  scope?: AmrBalanceGateScope,
  modelId?: string | null,
): Promise<boolean> {
  if (!scope) {
    const snapshot = await fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
    return Boolean(
      snapshot && !snapshot.stale && !snapshot.error && (amrWalletBalanceUsd(snapshot) ?? 0) > 0,
    );
  }
  const snapshot = await fetchWorkspaceWalletSnapshot(scope, null, {
    modelId,
    includePreflight: true,
  }).catch(() => null);
  if (!snapshot) return false;
  if (snapshot.preflight) {
    const { funding, modelCovered, codingPlan } = snapshot.preflight;
    return funding === 'wallet' || Boolean(
      funding === 'coding_plan' && modelCovered === true && codingPlan?.eligible &&
      codingPlan.windows?.length > 0 && codingPlan.windows.every((window) =>
        /^\d+$/.test(window.remainingCredits) && BigInt(window.remainingCredits) > 0n),
    );
  }
  return (amrWalletBalanceUsd(snapshot) ?? 0) > 0;
}
