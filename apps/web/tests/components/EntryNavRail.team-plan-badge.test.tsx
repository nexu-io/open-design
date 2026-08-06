// @vitest-environment jsdom
//
// Acceptance: which plan wordmark a TEAM workspace draws on the rail's account
// row (bottom-left) and on its twin inside the account menu's billing card.
//
// Reported (owner, from a real client standing in a team workspace):
// 「团队版的订阅，这里应该都显示 team 的标识」 …… 「产品期望团队从 free 到 max，
// 徽标都显示 team 的那个，个人的还是维持现状不要动」
//
// So the badge names the plan FAMILY, not the tier inside it: every tier of a
// team subscription draws the one `team` wordmark, and the personal ladder is
// untouched. It got this wrong from both ends:
//
//   • PAID team tiers — `planBadgeTierForLabel` asked `plus` / `pro` / `max`
//     BEFORE `team`, and B's team ids EMBED the personal tier word
//     (`team_plus`, `team_max`), so `team_plus` matched `plus` and the `team`
//     branch was reachable only from a bare `team` id.
//   • the FREE team tier — B reports an unsubscribed workspace as
//     `billingState: 'free'` with a null `planId` and an EMPTY `membershipTier`,
//     an id indistinguishable from a personal free account, so no id can name
//     it and only the workspace kind can.
//
// The plan LABEL beside the badge is deliberately NOT part of this. The label
// answers a subscription question, and every user-created workspace in B is
// team-typed, so labelling one 团队版 off the workspace kind is #146 (covered by
// `EntryNavRail.billing-card.test.tsx`). 免费 paired with the `team` wordmark is
// the intended reading: the family is team, the subscription is not paid.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { PlanWordmark, type PlanBadgeTier } from '../../src/components/PlanWordmark';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;

function context(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    teamName: 'OD Feature Team',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    permissions: { canInviteMembers: true, canViewWorkspaceSettings: true },
    ...overrides,
  } as unknown as WorkspaceCollabContext;
}

function billing(overrides: Partial<WorkspaceBillingSummary> = {}): WorkspaceBillingSummary {
  return {
    workspaceId: 'ws-1',
    membershipTier: '',
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: '0',
    subscriptionStatus: '',
    availableActions: [],
    ...overrides,
  } as WorkspaceBillingSummary;
}

function renderRail(props: {
  context: WorkspaceCollabContext;
  billing: WorkspaceBillingSummary | null;
}) {
  return render(
    <I18nProvider initial="zh-CN">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={props.context}
        billing={props.billing}
        balanceUsd="0"
      />
    </I18nProvider>,
  );
}

const ALL_TIERS: PlanBadgeTier[] = ['free', 'plus', 'pro', 'max', 'team'];

/**
 * Read back WHICH wordmark a slot is drawing.
 *
 * `PlanWordmark` is decorative (`aria-hidden`) and the viewBox is not a unique
 * key — plus and max are both 114 wide — so the artwork itself is the only
 * discriminator. The fingerprints are taken FROM the component, never
 * hard-coded, so redrawing a glyph cannot silently invalidate this test.
 */
function wordmarkFingerprint(svg: Element): string {
  return Array.from(svg.querySelectorAll('path'))
    .map((path) => path.getAttribute('d') ?? '')
    .join('|');
}

let fingerprintIndex: Map<string, PlanBadgeTier> | null = null;

function tierByFingerprint(): Map<string, PlanBadgeTier> {
  if (fingerprintIndex) return fingerprintIndex;
  const index = new Map<string, PlanBadgeTier>();
  for (const tier of ALL_TIERS) {
    const container = document.createElement('div');
    const view = render(<PlanWordmark tier={tier} />, { container });
    const svg = container.querySelector('svg.plan-wordmark');
    if (!svg) throw new Error(`PlanWordmark rendered no svg for ${tier}`);
    index.set(wordmarkFingerprint(svg), tier);
    view.unmount();
  }
  fingerprintIndex = index;
  return index;
}

function drawnTier(slot: Element | null | undefined): PlanBadgeTier | 'unrecognized' | null {
  const svg = slot?.querySelector('svg.plan-wordmark');
  if (!svg) return null;
  return tierByFingerprint().get(wordmarkFingerprint(svg)) ?? 'unrecognized';
}

/** The wordmark on the always-visible account row, in place of the chevron. */
function accountRowTier() {
  return drawnTier(document.querySelector('.entry-nav-rail__account-trigger'));
}

/** Its twin inside the account menu's billing card. Opens the menu. */
function billingCardTier() {
  fireEvent.click(screen.getByTestId('entry-nav-account'));
  return drawnTier(document.querySelector('.entry-nav-rail__menu-credits'));
}

beforeEach(() => {
  resetWorkspaceDirectoryCache();
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify({}), { status: 200 }),
  ) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceDirectoryCache();
  vi.restoreAllMocks();
});

describe('plan wordmark — a team workspace draws `team` at every tier', () => {
  it.each([
    // B's report for a workspace nobody has paid for: a positive free
    // entitlement, no plan id, and an empty tier on the summary.
    {
      name: 'free (nothing paid for)',
      entitlement: { billingState: 'free', planId: null },
      membershipTier: '',
    },
    {
      name: 'team_basic',
      entitlement: { billingState: 'active', planId: 'team_basic' },
      membershipTier: 'team_basic',
    },
    {
      name: 'team_plus',
      entitlement: { billingState: 'active', planId: 'team_plus' },
      membershipTier: 'team_plus',
    },
    {
      name: 'team_pro',
      entitlement: { billingState: 'active', planId: 'team_pro' },
      membershipTier: 'team_pro',
    },
    {
      name: 'team_max',
      entitlement: { billingState: 'active', planId: 'team_max' },
      membershipTier: 'team_max',
    },
    // A billing-period suffix is still the same plan family.
    {
      name: 'team_max_yearly',
      entitlement: { billingState: 'active', planId: 'team_max_yearly' },
      membershipTier: 'team_max_yearly',
    },
  ])('draws the team wordmark on $name', ({ entitlement, membershipTier }) => {
    renderRail({
      context: context(entitlement as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier }),
    });

    expect(accountRowTier()).toBe('team');
  });

  it('draws the same wordmark on the account row and in the billing card', () => {
    renderRail({
      context: context({ billingState: 'active', planId: 'team_pro' } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_pro', subscriptionStatus: 'active' }),
    });

    expect(accountRowTier()).toBe('team');
    expect(billingCardTier()).toBe('team');
  });

  // A personal workspace CAN hold a team-namespaced plan — membership is per
  // workspace, and `workspaceBillingSummaryForContext` deliberately passes a
  // team tier through on the personal side so `hasTeamPlan` still offers the
  // team surfaces there. The badge names the SUBSCRIPTION family, and that
  // subscription is a team one, so it draws `team` too. This is the only case
  // outside a team workspace whose glyph moves.
  it('draws the team wordmark for a personal workspace holding a team plan', () => {
    renderRail({
      context: context({
        workspaceType: 'personal',
        billingState: 'active',
        planId: 'team_plus',
      } as unknown as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_plus', subscriptionStatus: 'active' }),
    });

    expect(accountRowTier()).toBe('team');
  });
});

describe('plan wordmark — the personal ladder is untouched', () => {
  // 「个人的还是维持现状不要动」. Each personal tier keeps the glyph it draws
  // today; a fix that reached for the workspace kind alone, or that matched
  // `team` too loosely, would show up here.
  it.each([
    { plan: 'free', entitlement: { billingState: 'free', planId: null } },
    { plan: 'plus', entitlement: { billingState: 'active', planId: 'plus' } },
    { plan: 'pro', entitlement: { billingState: 'active', planId: 'pro' } },
    { plan: 'max', entitlement: { billingState: 'active', planId: 'max' } },
  ])('keeps the $plan wordmark for a personal $plan workspace', ({ plan, entitlement }) => {
    renderRail({
      context: context({
        workspaceType: 'personal',
        ...entitlement,
      } as unknown as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: plan, subscriptionStatus: entitlement.billingState }),
    });

    expect(accountRowTier()).toBe(plan);
  });
});
