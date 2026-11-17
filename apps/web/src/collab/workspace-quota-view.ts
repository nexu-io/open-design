import type { WorkspaceBillingResponse, WorkspaceCollabContext } from '@open-design/contracts';
import { workspaceBillingBalanceUsd, workspaceBillingSnapshotForContext, workspaceBillingRuntimeProjectionIsUsable } from './useWorkspaceContext';

export type WorkspaceQuotaTier = 'free' | 'go' | 'plus' | 'pro' | 'max';

/** Presentation values, not a new daemon/CLI wire contract. */
export interface WorkspaceQuotaView {
  tier: WorkspaceQuotaTier | null;
  planKnown: boolean;
  /** Only a fresh, exact-principal preflight may opt into the shared UI. */
  sharedBilling?: boolean;
  loading: boolean;
  balanceUsd: string | null;
  /** Only a server status may populate this; never dates. */
  planStatus: string | null;
  windows: ReadonlyArray<{
    durationSeconds: number;
    remainingPercent: number;
    /** Proven server zero, distinct from a positive balance rounded to 0%. */
    exhausted?: true;
    resetsAt: string | null;
  }> | null;
  breakdown: string | null;
  modelRestriction: string | null;
}

const DESIGN_PLAN_WINDOWS_FIELD = 'designPlanWindows';

type WorkspaceQuotaWindow = NonNullable<WorkspaceQuotaView['windows']>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Map the additive server field only when every window is well-formed. */
export function workspaceDesignPlanWindows(snapshot: unknown): WorkspaceQuotaView['windows'] {
  if (!isRecord(snapshot)) return null;
  const rawWindows = snapshot[DESIGN_PLAN_WINDOWS_FIELD];
  if (!Array.isArray(rawWindows) || rawWindows.length === 0) return null;

  const seenKinds = new Set<string>();
  const windows: WorkspaceQuotaWindow[] = [];
  for (const rawWindow of rawWindows) {
    if (!isRecord(rawWindow)) return null;
    const { kind, remainingCredits, limitCredits, resetsAt } = rawWindow;
    const windowStart = rawWindow.windowStart;
    if (
      (kind !== '5h' && kind !== '7d')
      || seenKinds.has(kind)
      || typeof remainingCredits !== 'string'
      || !/^(0|[1-9]\d*)$/.test(remainingCredits)
      || typeof limitCredits !== 'string'
      || !/^(0|[1-9]\d*)$/.test(limitCredits)
      || limitCredits === '0'
      || (resetsAt !== null && typeof resetsAt !== 'string')
      || (windowStart !== null && typeof windowStart !== 'string')
    ) {
      return null;
    }

    const remaining = BigInt(remainingCredits);
    const limit = BigInt(limitCredits);
    if (remaining > limit) return null;
    seenKinds.add(kind);

    // Round the remaining ratio itself, matching the approved display rule.
    // BigInt keeps the .5 tie exact even for credits above Number.MAX_SAFE_INTEGER.
    const remainingPercent = Number((remaining * 100n + limit / 2n) / limit);
    windows.push({
      durationSeconds: kind === '5h' ? 18_000 : 604_800,
      remainingPercent,
      ...(remaining === 0n ? { exhausted: true as const } : {}),
      resetsAt: typeof resetsAt === 'string' && resetsAt ? resetsAt : null,
    });
  }

  return windows.sort((left, right) => left.durationSeconds - right.durationSeconds);
}

export function workspaceQuotaTier(raw: string | null | undefined): WorkspaceQuotaTier | null {
  const parts = raw?.trim().toLowerCase().split(/[_-]+/) ?? [];
  return (['free', 'go', 'plus', 'pro', 'max'] as const).find(tier => parts.includes(tier)) ?? null;
}

export function workspaceQuotaView({ context, response, tier, balanceUsd }: {
  context: WorkspaceCollabContext | null;
  response?: WorkspaceBillingResponse | null;
  tier: string | null;
  /** Existing host's explicitly workspace-scoped money, for callers without a raw response. */
  balanceUsd?: string | null;
}): WorkspaceQuotaView {
  // A raw response must prove this workspace AND member.
  // Never fall through to the host's older amount after a scoped read rejects it.
  const balance = context?.workspaceId && context.workspaceMemberId
    ? response !== undefined
      ? workspaceBillingBalanceUsd(response, context)
      : balanceUsd ?? null
    : null;
  // The host's account advisory tier must not rename
  // this workspace. Prefer the proven v1 snapshot, then its current context.
  // Retain the host's scoped tier hint while the raw read is still pending.
  const snapshot = workspaceBillingSnapshotForContext(response, context);
  const snapshotTier = snapshot?.billing.planId?.trim()
    || (snapshot?.billing.billingState === 'free' ? 'free' : null);
  const scopedTier = snapshotTier || context?.planId?.trim()
    || (context?.billingState === 'free' ? 'free' : null)
    || (response == null ? tier : null);
  // Snapshot scope/version and the global rollout switch do not prove migration.
  // The existing preflight producer excludes legacy Teams before returning shared.
  const preflight = response?.preflight;
  const mode = preflight && typeof preflight === 'object' ? Reflect.get(preflight, 'billingMode') : null;
  const preflightAge = preflight ? Date.now() - Date.parse(preflight.generatedAt) : Number.NaN;
  const runtime = response?.workspaceRuntime;
  const runtimeUsable = !runtime || (runtime.workspaceId === context?.workspaceId
    && runtime.workspaceMemberId === context?.workspaceMemberId
    && workspaceBillingRuntimeProjectionIsUsable(runtime));
  const sharedBilling = runtimeUsable && mode === 'shared'
    && preflight?.schemaVersion === 1
    && preflight.workspaceId === context?.workspaceId
    && preflight.workspaceMemberId === context?.workspaceMemberId
    && Number.isFinite(preflightAge) && Math.abs(preflightAge) < 60_000;
  return {
    tier: workspaceQuotaTier(scopedTier),
    sharedBilling,
    planKnown: Boolean(scopedTier?.trim()),
    // A settled scoped read may legitimately omit wallet/quota data. Render
    // unavailable placeholders then; only an unresolved read uses the skeleton.
    loading: response == null && balance == null,
    balanceUsd: balance,
    // Account summary / personal Coding Plan are not substitutes for workspace data.
    planStatus: null,
    windows: workspaceDesignPlanWindows(snapshot),
    breakdown: null,
    modelRestriction: null,
  };
}
