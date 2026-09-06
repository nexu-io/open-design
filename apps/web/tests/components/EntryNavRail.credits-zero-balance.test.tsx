// @vitest-environment jsdom
//
// The workbench's top-right credits pill, for a SUBSCRIBER whose wallet reads
// zero.
//
// On Go / Plus / Pro / Max the popular models the user actually works with are
// unlimited, but the wallet still meters flagship calls — so a subscriber at
// exactly $0.00 can be in two different states the overview cannot tell apart:
// a healthy wallet untouched by in-plan models, or a wallet exhausted by
// flagship calls, which the pre-run balance gate hard-blocks (#7561). Because
// the pill cannot distinguish them, it must not present the zero as a healthy
// "unlimited" state by hiding it: the money stays on screen for every plan, and
// "unlimited" is claimed only by the per-model badge backed by Vela's model
// list. An overdrawn wallet keeps rendering its negative amount on every plan.

import { cleanup, render, screen } from '@testing-library/react';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;

function context(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    teamName: 'Huihua Zhang',
    displayName: 'Huihua Zhang',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'pro',
    permissions: { canInviteMembers: true, canViewWorkspaceSettings: true },
    ...overrides,
  } as unknown as WorkspaceCollabContext;
}

function billing(overrides: Partial<WorkspaceBillingSummary> = {}): WorkspaceBillingSummary {
  return {
    workspaceId: 'ws-1',
    membershipTier: 'pro',
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: '0',
    subscriptionStatus: 'active',
    availableActions: [],
    ...overrides,
  } as WorkspaceBillingSummary;
}

function renderRail(props: {
  context?: WorkspaceCollabContext;
  billing?: WorkspaceBillingSummary | null;
  balanceUsd?: string | null;
}) {
  return render(
    <I18nProvider initial="zh-CN">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={props.context ?? context()}
        billing={props.billing === undefined ? billing() : props.billing}
        balanceUsd={props.balanceUsd}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetWorkspaceDirectoryCache();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function creditsPill(): HTMLElement | null {
  return screen.queryByTestId('entry-top-right-credits');
}

describe('top-right credits pill', () => {
  it.each(['go', 'plus', 'pro', 'max'])(
    'keeps the exhausted $0.00 wallet visible on the subscribed personal plan %s',
    (tier) => {
      // #7561: at $0.00 the composer hard-blocks metered models with
      // "Insufficient credits", so the pill hiding the same wallet read as
      // "Unlimited usage" to users who had just been blocked. The pill shows
      // the wallet the composer enforces.
      renderRail({
        context: context({ planId: tier } as Partial<WorkspaceCollabContext>),
        billing: billing({ membershipTier: tier }),
        balanceUsd: '0',
      });
      expect(creditsPill()?.textContent).toContain('$0.00');
    },
  );

  it('keeps a zero balance written as 0.00 visible', () => {
    renderRail({ balanceUsd: '0.00' });
    expect(creditsPill()?.textContent).toContain('$0.00');
  });

  it('keeps the balance when a subscriber still has money', () => {
    renderRail({ balanceUsd: '120' });
    expect(creditsPill()?.textContent).toContain('$120.00');
  });

  it('keeps an overdrawn balance visible on a subscribed plan', () => {
    renderRail({ balanceUsd: '-1.25' });
    expect(creditsPill()?.textContent).toContain('-$1.25');
  });

  it.each(['team_basic', 'team_plus', 'team_max_yearly'])(
    'keeps the zero balance on the team plan %s, which really is out of credits',
    (tier) => {
      // A Team workspace has no unlimited set to fall back on: vela records
      // in-plan usage through the `coding_plan` billing mode, which its schema
      // constrains to personal tiers, so a Team zero is an empty wallet and
      // hiding it would hide the reason members get blocked.
      renderRail({
        context: context({ planId: tier } as Partial<WorkspaceCollabContext>),
        billing: billing({ membershipTier: tier }),
        balanceUsd: '0',
      });
      expect(creditsPill()?.textContent).toContain('$0.00');
    },
  );

  it('keeps the zero balance for a free plan, where it explains the gate', () => {
    renderRail({
      context: context({ planId: null, billingState: 'free' } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: '', subscriptionStatus: '' }),
      balanceUsd: '0',
    });
    expect(creditsPill()?.textContent).toContain('$0.00');
  });

  it('keeps the zero balance while the plan is still unknown', () => {
    // Billing has not answered yet: hiding money on an unresolved plan would
    // make the pill flicker in and out as the read lands.
    renderRail({
      context: context({ planId: null, billingState: undefined } as Partial<WorkspaceCollabContext>),
      billing: null,
      balanceUsd: '0',
    });
    expect(creditsPill()?.textContent).toContain('$0.00');
  });
});
