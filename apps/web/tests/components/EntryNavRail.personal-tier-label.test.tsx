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

function personalContext(planId: string): WorkspaceCollabContext {
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

function renderRail(tier: string, locale: 'en' | 'zh-CN' = 'en') {
  return render(
    <I18nProvider initial={locale}>
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={personalContext(tier)}
        billing={billing(tier)}
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
    text: head.textContent?.trim() ?? '',
    wordmarkWidth: head.querySelector('.plan-wordmark')?.getAttribute('viewBox') ?? null,
  };
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

describe('billing card plan label on the personal ladder (OPEND-3119)', () => {
  it('names a Max subscription Max, never Pro', () => {
    renderRail('max');
    const head = planHead();
    expect(head.text).not.toMatch(/pro/i);
    expect(head.text).toBe('Max');
    // The wordmark beside it is the max glyph (114-wide viewBox), so label and
    // badge agree.
    expect(head.wordmarkWidth).toBe('0 0 114 49');
  });

  it('names a Plus subscription Plus, never Pro', () => {
    renderRail('plus');
    const head = planHead();
    expect(head.text).not.toMatch(/pro/i);
    expect(head.text).toBe('Plus');
  });

  it('keeps the Pro label for a Pro subscription', () => {
    renderRail('pro');
    expect(planHead().text).toBe('Pro');
  });

  it('does not fall back to 专业版 for Max in zh-CN', () => {
    renderRail('max', 'zh-CN');
    const head = planHead();
    expect(head.text).not.toContain('专业版');
    expect(head.text).toBe('Max');
  });
});
