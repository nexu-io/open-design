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

/** Hover the top-right credits pill and scope queries to the billing card
 *  that hangs under it. The card used to live inside the account menu; it now
 *  hangs off the pill it describes (per product), so this is the gesture that
 *  puts it on screen. */
function billingCard() {
  fireEvent.pointerEnter(screen.getByTestId('entry-top-right-credits'));
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

  // Design (PR #8364): the top tier's head button says 管理, not 升级, and
  // lands on the console dashboard (ruling 2026-09-23).
  it('offers 管理 instead, pointed at the console dashboard', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderRail({
      context: context({ planId: 'team_max' } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_max' }),
    });

    fireEvent.click(billingCard().getByRole('button', { name: '管理' }));

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('/dashboard'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(open.mock.calls[0]?.[0]).not.toContain('billing=');
  });

  // An unresolved tier also fails the upgrade gate. It must not flash 管理 on
  // the way to 升级.
  it('shows neither button while the tier is still unknown', () => {
    renderRail({
      context: context({ billingState: 'active', planId: null }),
      billing: null,
    });

    const card = billingCard();
    expect(card.queryByRole('button', { name: '管理' })).toBeNull();
    expect(card.queryByRole('button', { name: '升级' })).toBeNull();
  });

  it('still hides 管理 from a team_max member without canManageBilling', () => {
    renderRail({
      context: context({
        role: 'member',
        planId: 'team_max',
        permissions: MEMBER_PERMISSIONS,
      } as unknown as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_max' }),
    });

    expect(billingCard().queryByRole('button', { name: '管理' })).toBeNull();
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

  // (3) Design PR #8364 (ruling 2026-09-23, 「按设计稿」): personal Max shows
  // 管理 too, pointed at the console dashboard, even though the team ladder
  // still sits above it.
  it('offers 管理, not 升级, for a personal max owner', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderRail({
      context: context({
        workspaceType: 'personal',
        planId: 'max',
      } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'max' }),
    });

    expect(billingCard().queryByRole('button', { name: '升级' })).toBeNull();
    fireEvent.click(billingCard().getByRole('button', { name: '管理' }));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('/dashboard'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(open.mock.calls[0]?.[0]).not.toContain('billing=');
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
