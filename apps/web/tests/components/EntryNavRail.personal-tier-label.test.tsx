// @vitest-environment jsdom
//
// OPEND-3119: a Max account's billing card read 「Pro Max」. `formatBillingTier`
// folded the whole personal ladder (plus / pro / max) into one 专业版 / Pro
// family label, and the card pairs that label with the tier's own wordmark —
// so every non-pro personal tier printed a label that contradicted the badge
// beside it, and the top-right pill (wordmark only) said something else again.
//
// The label beside a wordmark must name the SAME tier the wordmark draws.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;

function personalContext(planId: string | null): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-personal',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    workspaceName: "Leon Wang's workspace",
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId,
    permissions: { canInviteMembers: true, canManageBilling: true, canViewWorkspaceSettings: true },
  } as unknown as WorkspaceCollabContext;
}

function billing(membershipTier: string): WorkspaceBillingSummary {
  return {
    workspaceId: 'ws-personal',
    membershipTier,
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: '247.51',
    subscriptionStatus: 'active',
    availableActions: [],
    workspaceBalance: null,
  } as unknown as WorkspaceBillingSummary;
}

function renderRail(tier: string, locale: 'en' | 'zh-CN' = 'en', contextPlanId: string | null = tier) {
  return render(
    <I18nProvider initial={locale}>
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={personalContext(contextPlanId)}
        billing={billing(tier)}
        billingResponse={null}
        balanceUsd="247.51"
      />
    </I18nProvider>,
  );
}

/** Hover the top-right pill so the billing card hangs under it, then return
 *  the card's plan head — label text plus the wordmark it draws. */
function planHead() {
  fireEvent.pointerEnter(screen.getByTestId('entry-top-right-credits'));
  const head = document.querySelector('.entry-nav-rail__menu-credits-plan');
  if (!head) throw new Error('billing card plan head is not rendered');
  return {
    el: head,
    text: head.textContent?.trim() ?? '',
    wordmarkWidth: head.querySelector('.plan-wordmark')?.getAttribute('viewBox') ?? null,
    wordmarkHeight: head.querySelector('.plan-wordmark')?.getAttribute('height') ?? null,
  };
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

describe('personal billing card uses only its plan wordmark', () => {
  it.each(['free', 'go', 'plus', 'pro', 'max'])('omits the redundant %s tier name', (tier) => {
    renderRail(tier, 'zh-CN');
    const head = planHead();
    expect(head.text).toBe('');
    expect(head.el.getAttribute('aria-label')).toBe(tier);
    expect(head.wordmarkHeight).toBe('20');
  });
});

// The real workspace directory can omit planId while billing already identifies
// the paid tier. Skeletons must agree with the wordmark in that state.
describe('personal card loading with directory-only workspace context', () => {
  it.each([
    ['free', 0],
    ['go', 2],
    ['plus', 1],
    ['pro', 1],
    ['max', 1],
  ] as const)('keeps the %s skeleton aligned with its billing tier', (tier, blocks) => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));
    renderRail(tier, 'zh-CN', null);
    expect(planHead().el.getAttribute('aria-label')).toBe(tier);
    expect(screen.queryAllByTestId('coding-plan-skeleton-block')).toHaveLength(blocks);
    expect(screen.getByTestId('coding-plan-wallet-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('entry-nav-credits-row')).toBeNull();
  });
});
