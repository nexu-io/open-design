// @vitest-environment jsdom
//
// Acceptance: the account menu's billing card must not offer 「升级」 to a
// workspace that is already on the TOP plan tier there is.
//
// Product ruling (owner, from a real packaged client on Team Max):
// 「个人档位都是要显示可升级的, 最顶的就是团队 max」 — every PERSONAL tier still
// has somewhere to go (a personal Max user can still move onto a team plan, and
// vela #1146 deliberately routes their click to the Team upgrade dialog), and
// every team tier BELOW max can still change plan. `team_max` is the one tier
// with nothing above it, so it is the one tier that hides the affordance.
//
// The bug: this rail's gate was `billingUpgradeUrl && canManageBilling` — a
// destination check and a permission check, with no TIER check at all — so
// 团队版 Max owners were shown an 升级 button that could only ever reopen the
// plan they already hold.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;

const OWNER_PERMISSIONS = {
  canInviteMembers: true,
  canManageBilling: true,
  canViewWorkspaceSettings: true,
};

const MEMBER_PERMISSIONS = {
  canInviteMembers: false,
  canManageBilling: false,
  canViewWorkspaceSettings: true,
};

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
    permissions: OWNER_PERMISSIONS,
    workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-1',
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
    balanceUsd: '210',
    subscriptionStatus: 'active',
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
        balanceUsd="210"
      />
    </I18nProvider>,
  );
}

/** Open the account menu and scope queries to its billing card. */
function billingCard() {
  fireEvent.click(screen.getByTestId('entry-nav-account'));
  const el = document.querySelector('.entry-nav-rail__menu-credits');
  if (!el) throw new Error('billing card is not rendered');
  return within(el as HTMLElement);
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

describe('account menu billing card — 升级 at the top plan tier', () => {
  // (1) The reported bug. Nothing above team_max, so nothing to offer.
  it('hides 升级 for a team_max owner', () => {
    renderRail({
      context: context({ planId: 'team_max' } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_max' }),
    });

    const card = billingCard();
    // The card itself still renders, still labelled 团队版 — only the button goes.
    expect(card.getByText('团队版')).toBeTruthy();
    expect(card.queryByRole('button', { name: '升级' })).toBeNull();
  });

  // (2) Team tiers below max can still change plan.
  it.each(['team_basic', 'team_plus', 'team_pro'])(
    'keeps 升级 for a %s owner',
    (tier) => {
      renderRail({
        context: context({ planId: tier } as Partial<WorkspaceCollabContext>),
        billing: billing({ membershipTier: tier }),
      });

      expect(billingCard().getByRole('button', { name: '升级' })).toBeTruthy();
    },
  );

  // (3) The case a careless fix breaks: personal Max is NOT the top of the
  // ladder — that user can still move onto a team plan.
  it('keeps 升级 for a personal max owner', () => {
    renderRail({
      context: context({
        workspaceType: 'personal',
        planId: 'max',
      } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'max' }),
    });

    expect(billingCard().getByRole('button', { name: '升级' })).toBeTruthy();
  });

  // (4) Every other personal tier keeps it too.
  it.each(['free', 'plus', 'pro'])('keeps 升级 for a personal %s owner', (tier) => {
    renderRail({
      context: context({
        workspaceType: 'personal',
        billingState: tier === 'free' ? 'free' : 'active',
        planId: tier,
      } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: tier }),
    });

    expect(billingCard().getByRole('button', { name: '升级' })).toBeTruthy();
  });

  // (5) Existing behavior that must not regress: billing is owner-only, so a
  // member never sees the affordance even on an upgradeable tier.
  it('still hides 升级 for a team_pro member without canManageBilling', () => {
    renderRail({
      context: context({
        role: 'member',
        planId: 'team_pro',
        permissions: MEMBER_PERMISSIONS,
      } as unknown as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_pro' }),
    });

    expect(billingCard().queryByRole('button', { name: '升级' })).toBeNull();
  });
});
