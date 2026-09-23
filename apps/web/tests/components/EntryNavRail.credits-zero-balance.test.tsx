// @vitest-environment jsdom
//
// The workbench's top-right credits pill, for a SUBSCRIBER whose wallet reads
// zero.
//
// On Go / Plus / Pro / Max the popular models the user actually works with are
// unlimited, so the wallet only meters flagship calls. A subscriber therefore
// sits at $0.00 as a normal, healthy state — and the pill rendered it as a
// permanent alarm next to their avatar. Product ruling: hide the money for a
// subscribed plan whose balance is exactly zero. The pill itself stays (it
// leads with the plan wordmark and is the only way to the billing card under
// it); only the number goes. Free plans sell the upgrade on the pill instead
// and keep the zero in the card (it is the number that explains why hosted
// models are unavailable), and an overdrawn wallet keeps it on every plan.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

/** The balance row inside the billing card that hangs under the pill. */
function creditsRow(): HTMLElement {
  fireEvent.pointerEnter(screen.getByTestId('entry-top-right-credits'));
  return screen.getByTestId('entry-nav-credits-row');
}

describe('top-right credits pill', () => {
  it.each(['go', 'plus', 'pro', 'max'])(
    'hides the zero balance on the subscribed personal plan %s',
    (tier) => {
      renderRail({
        context: context({ planId: tier } as Partial<WorkspaceCollabContext>),
        billing: billing({ membershipTier: tier }),
        balanceUsd: '0',
      });
      // The pill still names the plan (wordmark, or the charge glyph for a
      // tier with no wordmark such as `go`) but carries no number.
      expect(creditsPill()).not.toBeNull();
      expect(creditsPill()?.textContent?.trim()).toBe('');
      expect(creditsPill()?.querySelector('svg')).not.toBeNull();
    },
  );

  it('hides a zero balance written as 0.00', () => {
    renderRail({ balanceUsd: '0.00' });
    expect(creditsPill()?.textContent?.trim()).toBe('');
  });

  it('keeps the balance when a subscriber still has money', () => {
    // Bare amount on the pill: the wordmark beside it names the plan, and the
    // dollar sign only appears on the card's balance row.
    renderRail({ balanceUsd: '120' });
    expect(creditsPill()?.textContent).toContain('120.00');
    expect(creditsRow().textContent).toContain('$120.00');
  });

  it('keeps an overdrawn balance visible on a subscribed plan', () => {
    renderRail({ balanceUsd: '-1.25' });
    expect(creditsPill()?.textContent).toContain('-1.25');
    expect(creditsRow().textContent).toContain('-$1.25');
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
      expect(creditsPill()?.textContent).toContain('0.00');
      expect(creditsRow().textContent).toContain('$0.00');
    },
  );

  it('sells the upgrade on a free plan and keeps the zero in the card, where it explains the gate', () => {
    renderRail({
      context: context({ planId: null, billingState: 'free' } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: '', subscriptionStatus: '' }),
      balanceUsd: '0',
    });
    // The free pill IS the upgrade CTA (per product): no balance on it.
    expect(creditsPill()?.textContent).toContain('升级');
    expect(creditsPill()?.textContent).not.toContain('0.00');
    expect(creditsRow().textContent).toContain('$0.00');
  });

  it('keeps the pill and the zero balance while the plan is still unknown', () => {
    // Billing has not answered yet: hiding the pill on an unresolved plan
    // would make it flicker in and out as the read lands. With no plan at all
    // the display label resolves free — the state a local dev workspace sits
    // in — so the pill sells the upgrade and the card keeps the zero.
    renderRail({
      context: context({ planId: null, billingState: undefined } as Partial<WorkspaceCollabContext>),
      billing: null,
      balanceUsd: '0',
    });
    expect(creditsPill()?.textContent).toContain('升级');
    expect(creditsRow().textContent).toContain('$0.00');
  });
});
