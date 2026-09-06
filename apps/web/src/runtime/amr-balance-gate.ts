// Pre-run balance gate for the OpenDesign Cloud agent. Two tiers:
//
//   HARD  — the run cannot possibly succeed: the account is signed out, or the
//           wallet balance is definitively <= $0. The send is blocked and the
//           subscription dialog is the only way forward (plus dismiss).
//   SOFT  — the run can start but may die mid-flight: balance is at or below
//           the low-balance warning line. The user is warned once per send and
//           may proceed anyway or top up first.
//
// The soft tier has no permanent mute. It used to: a "don't ask again"
// checkbox on Home's low-balance dialog wrote a localStorage bit that this
// gate also read, so opting out on Home silently disabled the project page's
// upgrade card forever — a surface the user never agreed to silence. Removed
// 2026-09-04; the warning is a function of the balance alone.
//
// Legacy account-scoped reads fail open when unavailable. Every explicitly
// workspace-scoped run fails closed when its exact member epoch cannot be proven:
// falling back to the account wallet would make the preflight disagree with
// the final daemon spawn authority.

import type {
  AmrWalletSnapshot,
  WorkspaceCollabContext,
  WorkspaceBillingResponse,
} from '@open-design/contracts';
import { fetchAmrWalletSnapshot } from '../providers/daemon';
import { resolveAmrPlan } from './amr-low-balance-plan';

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
 *
 * DELIBERATE DEVIATION from the delivered design — do not "fix" it. The draft
 * (`docs/design/chat-panel-next.html` @ 729fa43ce7, component 18 · 升级) writes
 * this tier as 「额度不足 · < 5 美金」. Product ruled 2026-09-06 to keep $2 and
 * ignore the draft's $5. Recorded as T52 in
 * `specs/current/chat-panel-decisions-sheet.md`; the hard line below is NOT a
 * deviation (the draft's second tier is 「额度耗尽 · = 0 美金」).
 */
export const AMR_LOW_BALANCE_WARN_USD = 2;

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

/**
 * Whether this run's plan tier is UNKNOWABLE from the client.
 *
 * This is the one surviving reason the hard block stands down, and it is a
 * statement about our own read, not about the user: we could not resolve a tier
 * at all, so we have no basis for a definitive block and Vela decides at
 * admission instead (product 2026-09-06, 「放,具体由远程兜底」). It is the
 * half of `cf00c80bd1` that outlived the ruling below.
 *
 * What used to live here — and is now GONE — was the other half: `!isFreeAmrPlan`,
 * "any tier other than the literal string `free` may fund this run outside the
 * wallet". Two things were wrong with it at once. Narrowly, `isFreeAmrPlan`
 * matches `'free'` exactly, so `basic` counted as "not free" and a Basic
 * subscriber at $0 was treated like an unlimited Max one. Broadly, the premise
 * itself was overturned: product ruled 2026-09-06 that the out-of-credits matrix
 * governs Personal workspaces too (product doc 四、升级情况 lists Free / Basic /
 * Plus / Pro AND Max as tiers that see the blocked treatment at $0), so a
 * readable paid tier is no longer a reason to let an empty wallet through.
 * Recorded as T55 in `specs/current/chat-panel-decisions-sheet.md`.
 *
 * The asymmetry that made the old predicate ask the FREE question is why this
 * one asks about readability instead: "free" and "paid" are not complements, and
 * an unreadable tier is neither. Only the unreadable case may fail open.
 */
async function amrPlanTierUnreadable(
  snapshot: AmrWalletSnapshot,
): Promise<boolean> {
  return (await resolveAmrPlan(snapshot)) == null;
}

/**
 * Whether the HARD tier — and ONLY the hard tier — must stand down for this
 * run, because something other than the wallet may fund it.
 *
 * Scope note (OPEND-2600). This question used to be asked ahead of BOTH tiers
 * and answered with a whole-gate `allow`, which deleted the soft reminder for
 * every subscriber between $0 and the warning line: the reported Pro account at
 * $1.79 got no card at all. Standing down is only ever about NOT BLOCKING; a
 * plan says nothing about whether a nearly-empty wallet is worth mentioning.
 * Product ruling 2026-09-03: warn at every tier, block at none that a plan may
 * still fund. So this now guards the hard branch alone and the soft branch is
 * reached either way.
 *
 * Latency note (red line, same ruling). The plan read is a network roundtrip,
 * and the soft tier must not add one to the send path. Call this ONLY once the
 * balance is already at or below the hard-block line — the one case that was
 * always going to block, and is therefore already allowed to wait.
 *
 * Scope note 2 (T55, product 2026-09-06). The only surviving reason to stand
 * down is that the tier could not be read at all — see
 * {@link amrPlanTierUnreadable}. A readable paid tier no longer stands down,
 * because the out-of-credits matrix governs Personal workspaces too.
 */
async function hardBlockMustStandDown(
  snapshot: AmrWalletSnapshot,
  modelId: string | null | undefined,
): Promise<boolean> {
  if (!modelId?.trim()) return false;
  return amrPlanTierUnreadable(snapshot);
}

/**
 * Decide whether an OpenDesign Cloud run may start. Fast path first: the
 * daemon-cached snapshot answers without an upstream roundtrip, so healthy
 * balances start with no added latency. Only a hard-block answer is confirmed
 * against the live wallet (refresh=1) — the cache may predate a recharge or
 * subscription, and a just-topped-up user must never be hard-blocked. The
 * soft tier trusts the cache (its cost is one dismissible reminder, and the
 * daemon cache is at most a few seconds old).
 */
async function fetchWorkspaceWalletSnapshot(
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
  modelId?: string | null,
): Promise<AmrBalanceGateResult> {
  // The URL carries the selected workspace identity. The daemon authorizes
  // that exact directory membership and returns a v2 identity-stamped wallet.
  // Start it alongside the cached account snapshot: the latter preserves the
  // existing signed-out confirmation and profile-aware recovery links, but no
  // longer sits in front of the authoritative Workspace read.
  let [accountSnapshot, workspaceSnapshot] = await Promise.all([
    fetchAmrWalletSnapshot().catch(() => null),
    fetchWorkspaceWalletSnapshot(scope, null).catch(() => null),
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
    // The out-of-credits matrix governs Personal workspaces too (T55), so a
    // readable tier — free or paid — blocks here just like a team's does. The
    // Personal branch survives for the one case that still fails open: a tier
    // we could not read at all, where Vela decides at admission. Team wallets
    // never stand down even then: a member's personal plan does not fund their
    // team's runs, and the account tier is not the team's tier to begin with.
    const standsDown =
      scope.workspaceType === 'personal'
      && (await hardBlockMustStandDown(workspaceSnapshot!, modelId));
    if (!standsDown) {
      return {
        kind: 'hard',
        reason: 'insufficient',
        snapshot: workspaceSnapshot!,
      };
    }
    // Fall through: not blocked, but an empty wallet is still worth saying.
  }
  if (balance <= AMR_LOW_BALANCE_WARN_USD) {
    return { kind: 'soft', snapshot: workspaceSnapshot! };
  }
  return { kind: 'allow' };
}

export async function checkAmrBalanceGate(
  scope?: AmrBalanceGateScope,
  modelId?: string | null,
): Promise<AmrBalanceGateResult> {
  try {
    if (scope) {
      return await checkWorkspaceBalanceGate(scope, modelId);
    }
    const cached = await fetchAmrWalletSnapshot().catch(() => null);
    const cachedBalance = amrWalletBalanceUsd(cached);
    const cachedHardCandidate =
      cached?.status === 'signed_out' ||
      (cachedBalance != null && cachedBalance <= AMR_HARD_BLOCK_BALANCE_USD);
    if (!cachedHardCandidate) {
      if (cachedBalance == null) return { kind: 'allow' };
      if (cachedBalance > AMR_LOW_BALANCE_WARN_USD) return { kind: 'allow' };
      // Above the hard line, so nothing here can block — and a plan never
      // silences the reminder (OPEND-2600). Skipping the plan read also keeps
      // the soft tier off the network, which is the latency red line.
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
    if (
      freshBalance <= AMR_HARD_BLOCK_BALANCE_USD
      && !(await hardBlockMustStandDown(fresh, modelId))
    ) {
      return { kind: 'hard', reason: 'insufficient', snapshot: fresh };
    }
    if (freshBalance <= AMR_LOW_BALANCE_WARN_USD) {
      return { kind: 'soft', snapshot: fresh };
    }
    return { kind: 'allow' };
  } catch {
    // Unscoped legacy checks retain fail-open behavior. Every explicit
    // workspace, personal or team, must prove its exact member-scoped wallet.
    return scope
      ? { kind: 'unavailable' }
      : { kind: 'allow' };
  }
}
