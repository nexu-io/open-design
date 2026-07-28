import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';

/**
 * Whether a raw vela plan id is a TEAM plan.
 *
 * B namespaces plan ids by workspace kind and tier — `team_basic`, `team_plus`,
 * `team_pro`, `team_max` against `free` / `pro` / `plus` / `max` for personal.
 */
export function isTeamPlanTier(rawTier: string | null | undefined): boolean {
  const normalized = rawTier?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  return normalized === 'team' || normalized.startsWith('team_') || normalized.startsWith('team-');
}

/**
 * Whether the team-scoped surfaces (the 团队 tab on 扩展 and 设计体系) should be
 * offered.
 *
 * The gate is the PLAN, not the workspace kind: a personal workspace is still a
 * workspace and can still have members, so `workspaceType` is the wrong axis.
 * It hides only for the two cases that genuinely have no team to share into —
 * signed out of AMR, or on a personal/free plan that has not been upgraded to a
 * team one.
 *
 * `planId` on the context is the same raw id billing reports, so it stands in
 * while the billing summary is still loading or reports an empty tier.
 */
export function hasTeamPlan(
  context: WorkspaceCollabContext | null | undefined,
  billing: WorkspaceBillingSummary | null | undefined,
): boolean {
  if (!context) return false;
  return isTeamPlanTier(billing?.membershipTier) || isTeamPlanTier(context.planId);
}

/** The tier sources a surface may have in scope; pass whichever it holds. */
export interface PlanTierSources {
  /**
   * `GET /api/workspace/billing`, PROJECTED onto the workspace in scope by
   * `workspaceBillingSummaryForContext` (or `useWorkspaceBilling`).
   *
   * The raw `response.summary` is an ACCOUNT read — the contract pins its
   * `workspaceId` to null and the daemon answers every `?workspaceId=` with the
   * same unscoped read — so its `membershipTier` is NOT a workspace plan and
   * must not be passed here. It outranks the context hint below precisely
   * because a projected summary is the more specific workspace answer; handing
   * it an account tier inverts that and pins the plan to the account.
   */
  billing?: WorkspaceBillingSummary | null;
  /** `GET /api/workspace/context` — carries the same raw plan id as billing. */
  context?: WorkspaceCollabContext | null;
  /** vela's `account.plan` / `user.plan` login projection. ACCOUNT-scoped. */
  accountPlan?: string | null;
}

/**
 * The raw plan id that actually governs this client's entitlements.
 *
 * Three sources report a tier and they disagree by design. vela's login-status
 * projection is ACCOUNT-scoped, so a user whose entitlements are held by a TEAM
 * workspace reads `free` — or nothing at all — there. The workspace-projected
 * billing summary and the collab context both report the WORKSPACE plan id
 * (`team_plus`, …), so they win over it, in that order. Reading the account
 * projection as authoritative is what showed free-user surfaces to paid team
 * accounts.
 *
 * `sources.billing` must already be workspace-projected — see its field doc.
 *
 * Every step falls through on an EMPTY STRING, not only on null: B reports an
 * empty `membershipTier` for a workspace with no active subscription, and an
 * empty tier means "this source does not know", never "free". That is why the
 * chain is `||` and not `??`.
 *
 * Returns null when no source knows. Callers must treat null as UNKNOWN and
 * fail closed — never assume free — so a slow or failed billing read cannot
 * flash a free-tier surface at a paying user.
 */
export function resolvePlanTier(sources: PlanTierSources): string | null {
  return (
    sources.billing?.membershipTier?.trim()
    || sources.context?.planId?.trim()
    || sources.accountPlan?.trim()
    || null
  );
}

/**
 * The plan tier the credits card should LABEL, or null when no source knows.
 *
 * The label names a SUBSCRIPTION, so it must never be derived from the
 * workspace kind. Every workspace a user creates in B is `type: 'team'` — only
 * the auto-provisioned personal one is not — so `workspaceType === 'team'`
 * carries no information about whether anyone has paid. Reading it as one is
 * what labelled a brand-new, zero-credit workspace 团队版 (#146).
 *
 * B reports an unsubscribed workspace as `billingState: 'free'` with a null
 * `planId` and an empty `membershipTier`. That combination is a POSITIVE
 * "free", not an unknown, and it is what overrides the workspace-kind guess.
 *
 * Everything else stays null, meaning UNKNOWN — notably a non-owner member,
 * for whom B omits `billingState`/`planId` entirely, so the caller must keep
 * whatever hint it already had rather than downgrade a paying member's label.
 */
export function resolvePlanLabelTier(sources: PlanTierSources): string | null {
  const tier = resolvePlanTier(sources);
  if (tier) return tier;
  return sources.context?.billingState === 'free' ? 'free' : null;
}

/**
 * Whether free-tier surfaces (upgrade banners, plan gates, the free nameplate)
 * may be shown for a resolved plan id.
 *
 * True only for a tier that is KNOWN and genuinely free. Two cases must never
 * read as free: an unknown/empty tier, because billing may simply not have
 * answered yet; and every team-namespaced id, which is paid by construction —
 * that is exactly the case the account-scoped vela projection gets wrong.
 */
export function isFreePlanTier(tier: string | null | undefined): boolean {
  const normalized = tier?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  if (isTeamPlanTier(normalized)) return false;
  return normalized === 'free';
}
