import { describe, expect, it } from 'vitest';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';

import {
  canUpgradeFromPlanTier,
  hasTeamPlan,
  isFreePlanTier,
  isTeamPlanTier,
  isTopPlanTier,
  resolvePlanLabelTier,
  resolvePlanTier,
} from '../src/collab/team-plan';

function context(planId: string | null, workspaceType: 'team' | 'personal' = 'personal') {
  return { workspaceId: 'ws', workspaceType, planId } as unknown as WorkspaceCollabContext;
}

function contextWithBillingState(
  planId: string | null,
  billingState: string,
  workspaceType: 'team' | 'personal' = 'team',
) {
  return { workspaceId: 'ws', workspaceType, planId, billingState } as unknown as WorkspaceCollabContext;
}

function billing(membershipTier: string) {
  return { membershipTier } as unknown as WorkspaceBillingSummary;
}

describe('isTeamPlanTier', () => {
  it('recognises B’s team-namespaced plan ids', () => {
    for (const id of ['team', 'team_basic', 'team_plus', 'team_pro', 'team_max', 'TEAM_PLUS']) {
      expect(isTeamPlanTier(id)).toBe(true);
    }
  });

  it('rejects personal tiers and empties', () => {
    for (const id of ['free', 'pro', 'plus', 'max', '', null, undefined]) {
      expect(isTeamPlanTier(id)).toBe(false);
    }
  });
});

describe('hasTeamPlan', () => {
  // The tab used to be gated on `workspaceContext.teamId`, which hid it from a
  // personal workspace — but a personal workspace is still a workspace and can
  // still have members. The plan is the axis that actually decides.
  it('offers team surfaces on a personal workspace that holds a team plan', () => {
    expect(hasTeamPlan(context('team_plus'), null)).toBe(true);
  });

  it('hides them when signed out', () => {
    expect(hasTeamPlan(null, billing('team_plus'))).toBe(false);
  });

  it('hides them on a personal or free plan', () => {
    expect(hasTeamPlan(context('free'), billing('free'))).toBe(false);
    expect(hasTeamPlan(context('pro'), billing('pro'))).toBe(false);
  });

  it('falls back to the context plan hint while billing is empty', () => {
    // Billing reports an empty tier for a workspace with no active subscription,
    // so the context's own id has to stand in rather than reading as "no team".
    expect(hasTeamPlan(context('team_max'), billing(''))).toBe(true);
  });

  it('prefers billing once it reports a team tier', () => {
    expect(hasTeamPlan(context(null), billing('team_pro'))).toBe(true);
  });
});

describe('resolvePlanTier', () => {
  it('prefers the workspace billing summary over every other source', () => {
    expect(
      resolvePlanTier({
        billing: billing('team_pro'),
        context: context('free'),
        accountPlan: 'free',
      }),
    ).toBe('team_pro');
  });

  // Acceptance #33/#40: vela's login projection is ACCOUNT-scoped, so a member
  // whose plan is held by the team workspace reads `free` there. Reading it as
  // authoritative is what showed the free chip and the free-user home upsell to
  // Team Plus / Team Pro accounts.
  it('lets the workspace plan id override the account-scoped vela projection', () => {
    expect(resolvePlanTier({ context: context('team_plus'), accountPlan: 'free' }))
      .toBe('team_plus');
  });

  it('falls through an EMPTY billing tier rather than treating it as an answer', () => {
    // B reports '' for a workspace with no active subscription — `||`, not `??`.
    expect(
      resolvePlanTier({
        billing: billing(''),
        context: context('team_max'),
        accountPlan: 'free',
      }),
    ).toBe('team_max');
    expect(resolvePlanTier({ billing: billing(''), accountPlan: 'pro' })).toBe('pro');
  });

  it('uses the account plan only when no workspace source knows', () => {
    expect(resolvePlanTier({ context: context(null), accountPlan: 'plus' })).toBe('plus');
    expect(resolvePlanTier({ accountPlan: ' max ' })).toBe('max');
  });

  it('returns null when nothing knows the tier', () => {
    expect(resolvePlanTier({})).toBeNull();
    expect(resolvePlanTier({ billing: billing(''), context: context(''), accountPlan: '' }))
      .toBeNull();
    expect(resolvePlanTier({ context: null, billing: null, accountPlan: null })).toBeNull();
  });
});

describe('resolvePlanLabelTier', () => {
  // Acceptance #146. B makes EVERY user-created workspace `type: 'team'`, so
  // the workspace kind cannot be the label's source; the entitlement is.
  it('reads B’s free entitlement as a positive free, not an unknown', () => {
    expect(
      resolvePlanLabelTier({
        billing: billing(''),
        context: contextWithBillingState(null, 'free'),
      }),
    ).toBe('free');
  });

  it('still prefers a real tier over the entitlement fallback', () => {
    expect(
      resolvePlanLabelTier({
        billing: billing('team_plus'),
        context: contextWithBillingState(null, 'free'),
      }),
    ).toBe('team_plus');
  });

  // B omits billingState/planId for non-owners, so nothing here can speak for
  // a paying member — the caller must keep whatever hint it already had rather
  // than being handed a wrong answer.
  it('returns null when B has reported no entitlement at all', () => {
    expect(
      resolvePlanLabelTier({
        billing: billing(''),
        context: contextWithBillingState(null, 'active'),
      }),
    ).toBeNull();
    expect(resolvePlanLabelTier({})).toBeNull();
  });
});

describe('isFreePlanTier', () => {
  it('is true only for a known, genuinely free tier', () => {
    expect(isFreePlanTier('free')).toBe(true);
    expect(isFreePlanTier(' FREE ')).toBe(true);
  });

  // The gate must fail CLOSED while billing is unresolved: an unknown tier is
  // not free, so a slow read never flashes an upsell at a paying user.
  it('treats an unknown or empty tier as not free', () => {
    for (const tier of ['', '   ', null, undefined]) {
      expect(isFreePlanTier(tier)).toBe(false);
    }
  });

  it('never reads a team-namespaced id as free', () => {
    for (const tier of ['team', 'team_basic', 'team_plus', 'team_pro', 'team_max', 'TEAM_PRO']) {
      expect(isFreePlanTier(tier)).toBe(false);
    }
  });

  it('rejects the personal paid tiers', () => {
    for (const tier of ['pro', 'plus', 'max']) {
      expect(isFreePlanTier(tier)).toBe(false);
    }
  });
});

// Product ruling (owner, from a real packaged client on Team Max):
// 「个人档位都是要显示可升级的, 最顶的就是团队 max」. Team and personal tiers are
// two ladders — personal `max` tops only the personal one and still has the
// whole team ladder above it.
describe('isTopPlanTier', () => {
  it('recognises the team ladder’s max, including a billing-period suffix', () => {
    for (const tier of ['team_max', 'TEAM_MAX', 'team-max', ' team_max ', 'team_max_yearly']) {
      expect(isTopPlanTier(tier)).toBe(true);
    }
  });

  it('never reads a PERSONAL max as the top tier', () => {
    for (const tier of ['max', 'MAX', ' max ']) {
      expect(isTopPlanTier(tier)).toBe(false);
    }
  });

  it('rejects team tiers below max', () => {
    for (const tier of ['team', 'team_basic', 'team_plus', 'team_pro']) {
      expect(isTopPlanTier(tier)).toBe(false);
    }
  });

  it('rejects an unknown or empty tier', () => {
    for (const tier of ['', '   ', null, undefined]) {
      expect(isTopPlanTier(tier)).toBe(false);
    }
  });
});

describe('canUpgradeFromPlanTier', () => {
  it('offers an upgrade for every tier that has one above it', () => {
    for (const tier of [
      'free',
      'plus',
      'pro',
      // The case a careless fix breaks: a personal Max user can still move onto
      // a team plan (vela #1146 routes their click to the Team upgrade dialog).
      'max',
      'team',
      'team_basic',
      'team_plus',
      'team_pro',
    ]) {
      expect(canUpgradeFromPlanTier(tier)).toBe(true);
    }
  });

  it('offers nothing at the top tier', () => {
    for (const tier of ['team_max', 'TEAM_MAX', 'team-max', 'team_max_yearly']) {
      expect(canUpgradeFromPlanTier(tier)).toBe(false);
    }
  });

  // Fails closed while billing is unresolved, so a slow read cannot flash a CTA.
  it('offers nothing for an unknown tier', () => {
    for (const tier of ['', '   ', null, undefined]) {
      expect(canUpgradeFromPlanTier(tier)).toBe(false);
    }
  });
});
