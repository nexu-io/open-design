// @vitest-environment jsdom
//
// Acceptance #146 / #112 — the account menu's billing card.
//
// #146: a workspace the user had just created, with nothing paid for, showed
// 团队版. The label was derived from `workspaceType === 'team'`, but EVERY
// user-created workspace in B is team-typed (only the auto-provisioned personal
// one is not), so the workspace kind says nothing about whether a subscription
// exists. B reports an unsubscribed workspace as `billingState: 'free'` with a
// null planId and an EMPTY membershipTier — the label has to follow that.
//
// #112 (superseded 2026-07-22): a 附加积分 (bonus/top-up credits) row used to
// live here. Product ruling: we have no such concept to show the user — 积分
// is the one number that matters — so the row was removed outright rather
// than fixed to show a real value.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;

function context(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-new',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    teamName: 'Untitled Workspace',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    // B's entitlement for a workspace nobody has paid for.
    billingState: 'free',
    planId: null,
    permissions: { canInviteMembers: true, canViewWorkspaceSettings: true },
    ...overrides,
  } as unknown as WorkspaceCollabContext;
}

function billing(overrides: Partial<WorkspaceBillingSummary> = {}): WorkspaceBillingSummary {
  return {
    workspaceId: 'ws-new',
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
  balanceUsd?: string | null;
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
        balanceUsd={props.balanceUsd}
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
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceDirectoryCache();
  vi.restoreAllMocks();
});

describe('account menu billing card — plan label (#146)', () => {
  it('does NOT label an unsubscribed team-typed workspace as 团队版', () => {
    renderRail({ context: context(), billing: billing() });

    const card = billingCard();
    expect(card.queryByText('团队版')).toBeNull();
    // `entry.billingTierFree` reads 免费 in zh-CN.
    expect(card.getByText('免费')).toBeTruthy();
  });

  it('labels a workspace that really holds a team subscription as 团队版', () => {
    renderRail({
      context: context({ billingState: 'active', planId: 'team_plus' } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_plus', subscriptionStatus: 'active' }),
    });

    expect(billingCard().getByText('团队版')).toBeTruthy();
  });

  // The label is a plan question, so an unknown tier must not be answered from
  // the workspace kind either way — but a paid MEMBER is a case B does not yet
  // report a per-workspace plan for (it sends planId only to owners), so the
  // legacy workspace-type hint is all that is left there. Guard that the
  // POSITIVE free entitlement is what flips the label, not the member case.
  it('keeps the legacy team hint when B has not reported any entitlement', () => {
    renderRail({
      context: context({ role: 'member', billingState: 'active', planId: null } as Partial<WorkspaceCollabContext>),
      billing: billing(),
    });

    expect(billingCard().getByText('团队版')).toBeTruthy();
  });
});

describe('account menu billing card — workspace-aware upgrade routing', () => {
  it.each([
    {
      name: 'personal owner',
      context: {
        workspaceType: 'personal',
        billingState: 'free',
        planId: null,
      } satisfies Partial<WorkspaceCollabContext>,
      billing: { membershipTier: '', subscriptionStatus: '' } satisfies Partial<WorkspaceBillingSummary>,
    },
    {
      name: 'free team owner',
      context: {
        workspaceType: 'team',
        billingState: 'free',
        planId: null,
      } satisfies Partial<WorkspaceCollabContext>,
      billing: { membershipTier: '', subscriptionStatus: '' } satisfies Partial<WorkspaceBillingSummary>,
    },
    {
      name: 'paid team owner',
      context: {
        workspaceType: 'team',
        billingState: 'active',
        planId: 'team_plus',
      } satisfies Partial<WorkspaceCollabContext>,
      billing: {
        membershipTier: 'team_plus',
        subscriptionStatus: 'active',
      } satisfies Partial<WorkspaceBillingSummary>,
    },
  ])(
    'routes a $name to public Pricing',
    ({ context: contextOverrides, billing: billingOverrides }) => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
      renderRail({
        context: context({
          ...contextOverrides,
          permissions: {
            canInviteMembers: true,
            canManageBilling: true,
            canViewWorkspaceSettings: true,
          },
          workspaceSettingsUrl:
            'https://web.example.com/console/settings?workspaceId=ws-new',
        } as Partial<WorkspaceCollabContext>),
        billing: billing(billingOverrides),
      });

      fireEvent.click(billingCard().getByRole('button', { name: '升级' }));

      expect(openSpy).toHaveBeenCalledTimes(1);
      const target = new URL(String(openSpy.mock.calls[0]![0]));
      expect(`${target.origin}${target.pathname}`).toBe('https://open-design.ai/pricing/');
      expect(target.searchParams.get('billing')).toBeNull();
    },
  );

  it.each(['admin', 'member'] as const)(
    'hides the upgrade action for a %s without billing permission',
    (role) => {
      renderRail({
        context: context({
          role,
          permissions: {
            canInviteMembers: true,
            canManageBilling: false,
            canViewWorkspaceSettings: true,
          },
          workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-new',
        } as Partial<WorkspaceCollabContext>),
        billing: billing(),
      });

      expect(billingCard().queryByRole('button', { name: '升级' })).toBeNull();
    },
  );
});

describe('account menu billing card — 积分 row opens the web console (#62)', () => {
  // Product ruling: clicking 积分 must jump straight to B's console for the
  // usage detail — there is NO intermediate credits popover in the client
  // (the reference #5517 has no such panel either). The destination is the
  // console dashboard: the wallet page is no longer part of B's information
  // architecture (balance/top-up were rehomed onto the dashboard, vela #1055).
  it('opens the console dashboard URL in a new tab instead of an in-client panel', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderRail({
      context: context({
        workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-new',
      } as Partial<WorkspaceCollabContext>),
      billing: billing({ totalAvailableCredits: 100_000 }),
    });

    const card = billingCard();
    fireEvent.click(card.getByTestId('entry-nav-credits-row'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0]!;
    // teamConsoleUrl(base, 'billing') → the console's /dashboard page, keeping
    // the ?workspaceId deep-link param.
    expect(String(url)).toContain('/console/dashboard');
    expect(String(url)).toContain('workspaceId=ws-new');
    expect(target).toBe('_blank');
    // No intermediate panel appears.
    expect(document.querySelector('.credits-panel')).toBeNull();
  });
});

describe('account menu billing card — no 附加积分 row (#112 superseded)', () => {
  it('never renders a bonus/top-up credits row, however the console splits its balance', () => {
    renderRail({
      context: context({ billingState: 'active', planId: 'team_plus' } as Partial<WorkspaceCollabContext>),
      billing: billing({
        membershipTier: 'team_plus',
        totalAvailableCredits: 1_386_294,
        subscriptionCredits: 1_000_000,
        rechargeCredits: 386_294,
      }),
    });

    expect(billingCard().queryByText('附加积分')).toBeNull();
  });
});

describe('account menu billing card — scoped USD balance (recvqgaMLxEdZX)', () => {
  it('shows the explicit workspace USD balance instead of raw credits', () => {
    renderRail({
      context: context(),
      billing: billing({ totalAvailableCredits: 999_330 }),
      balanceUsd: '9.9933',
    });

    const card = billingCard();
    expect(card.getByText('额度')).toBeTruthy();
    expect(card.getByText('$9.99')).toBeTruthy();
    expect(card.queryByText('999,330')).toBeNull();
    expect(card.queryByText('余额')).toBeNull();
    expect(card.queryByText(/积分/)).toBeNull();
  });

  it('keeps a proven zero visible as $0.00', () => {
    renderRail({
      context: context(),
      billing: billing({ totalAvailableCredits: 600_000 }),
      balanceUsd: '0',
    });

    expect(billingCard().getByText('$0.00')).toBeTruthy();
  });
});
