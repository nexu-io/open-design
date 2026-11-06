// @vitest-environment jsdom
//
// The workbench's top-right credits pill, for a SUBSCRIBER whose wallet reads
// zero.
//
// On Go / Plus / Pro / Max the eligible models can use Coding Plan windows before the wallet. A subscriber therefore
// sits at $0.00 as a normal, healthy state — and the pill rendered it as a
// permanent alarm next to their avatar. The original ruling hid the money only
// for a subscribed plan whose balance was exactly zero.
//
// SUPERSEDED for the paid pill by the design (PR #8364,
// `docs/ui-previews/plan-panels/`, and its `electron-panel.png`): the paid
// capsule carries the plan WORDMARK ALONE at every balance. The money did not
// move — it reads in the card the capsule opens, with the currency named
// (「$10.00」), which is where a number belongs next to an allowance. The
// original ruling's goal (no permanent alarm beside the avatar) is strictly
// better served. Free Owners still see the upgrade prompt on the pill.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceBillingResponse, WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  billingResponse?: WorkspaceBillingResponse;
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
        billingResponse={props.billingResponse}
        balanceUsd={props.balanceUsd}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({}))) as typeof fetch;
});

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
async function creditsRow(): Promise<HTMLElement> {
  fireEvent.pointerEnter(screen.getByTestId('entry-top-right-credits'));
  return screen.findByTestId('entry-nav-credits-row');
}

describe('top-right credits pill', () => {
  it.each(['go', 'plus', 'pro', 'max'])(
    'hides the zero balance on the subscribed personal plan %s',
    async (tier) => {
      renderRail({
        context: context({ planId: tier } as Partial<WorkspaceCollabContext>),
        billing: billing({ membershipTier: tier }),
        balanceUsd: '0',
      });
      // The pill still names the plan (its wordmark — `go`'s is a text
      // placeholder until the asset lands) but carries no number.
      expect(creditsPill()).not.toBeNull();
      expect(creditsPill()?.textContent ?? '').not.toMatch(/\d/);
      expect(creditsPill()?.querySelector('svg')).not.toBeNull();
    },
  );

  it('hides a zero balance written as 0.00', () => {
    renderRail({ balanceUsd: '0.00' });
    expect(creditsPill()?.textContent?.trim()).toBe('');
  });

  it('keeps a funded balance in the CARD, with the pill still wordmark-only', async () => {
    renderRail({ balanceUsd: '120' });
    expect(creditsPill()?.textContent ?? '').not.toMatch(/\d/);
    expect((await creditsRow()).textContent).toContain('$120.00');
  });

  it('keeps an overdrawn balance visible in the card', async () => {
    renderRail({ balanceUsd: '-1.25' });
    expect(creditsPill()?.textContent ?? '').not.toMatch(/\d/);
    expect((await creditsRow()).textContent).toContain('-$1.25');
  });

  it.each(['team_basic', 'team_plus', 'team_max_yearly'])(
    'keeps zero wallet quiet on paid team plan %s with a separate wallet row',
    async (tier) => {
      // Paid team seats have Coding Plan pools; team_basic remains wallet-only.
      renderRail({
        context: context({ planId: tier } as Partial<WorkspaceCollabContext>),
        billing: billing({ membershipTier: tier }),
        balanceUsd: '0',
      });
      // The capsule is wordmark-only at every team tier now; the wallet row
      // under it is where the zero reads.
      expect(creditsPill()?.textContent ?? '').not.toMatch(/\d/);
      expect((await creditsRow()).textContent).toContain('$0.00');
    },
  );

  it('sells the upgrade on a free plan and keeps the zero in the card, where it explains the gate', async () => {
    renderRail({
      context: context({ planId: null, billingState: 'free' } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: '', subscriptionStatus: '' }),
      balanceUsd: '0',
    });
    // The free pill IS the upgrade CTA (per product): no balance on it.
    expect(creditsPill()?.textContent).toContain('升级');
    expect(creditsPill()?.textContent).not.toContain('0.00');
    expect((await creditsRow()).textContent).toContain('$0.00');
  });

  it.each(['admin', 'member'] as const)('shows shared Free quota without an upgrade prompt for %s', async (role) => {
    renderRail({
      context: context({
        workspaceType: 'team', role, planId: null, billingState: undefined,
        permissions: { canManageBilling: true },
      } as Partial<WorkspaceCollabContext>),
      billing: billing({ workspaceId: null, membershipTier: 'max' }),
      billingResponse: {
        summary: billing({ workspaceId: null, membershipTier: 'max' }),
        workspaceBalance: {
          workspaceId: 'ws-1', workspaceMemberId: 'wm-1', billingScopeVersion: 2,
          balanceUsd: '0', expiresAt: null, updatedAt: null,
        },
        workspaceSnapshot: {
          schemaVersion: 1, workspaceId: 'ws-1', workspaceMemberId: 'wm-1', billingScopeVersion: 2,
          billing: { billingState: 'free', planId: null },
          wallet: { balanceUsd: '0', expiresAt: null, updatedAt: null },
          revisions: { billing: 'free-ws-1', wallet: 'wallet-ws-1' },
        },
      },
      balanceUsd: '0',
    });
    expect(creditsPill()?.textContent).not.toContain('升级');
    expect(creditsPill()?.getAttribute('aria-label')).toBe('额度');
    expect(creditsPill()?.parentElement?.classList.contains('entry-top-right-account-pill--upgrade')).toBe(false);
    expect(creditsPill()?.querySelector('svg.plan-wordmark')?.getAttribute('viewBox')).toBe('0 0 107 49');
    const card = await creditsRow();
    expect(card.textContent).toContain('$0.00');
    expect(screen.queryByRole('button', { name: '升级' })).toBeNull();
  });

  it('keeps the pill and the zero balance while the plan is still unknown', async () => {
    // OPEND-4440: keep the capsule mounted while billing resolves, without
    // treating an unknown entitlement as Free. The wallet row is independent.
    renderRail({
      context: context({ planId: null, billingState: undefined } as Partial<WorkspaceCollabContext>),
      billing: null,
      balanceUsd: '0',
    });
    expect(creditsPill()).not.toBeNull();
    expect(creditsPill()?.getAttribute('aria-busy')).toBe('true');
    expect(creditsPill()?.textContent).not.toContain('升级');
    expect(creditsPill()?.querySelector('svg.plan-wordmark')).toBeNull();
    expect((await creditsRow()).textContent).toContain('$0.00');
  });
});
