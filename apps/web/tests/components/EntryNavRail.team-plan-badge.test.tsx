// @vitest-environment jsdom
//
// D4 quota popover: the supplied client design uses the scoped Free/Go/Plus/Pro/Max
// wordmark in both the entry pill and popover. The host's earlier team-family
// helper remains the fallback for an unrecognized legacy team plan.

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

const ALL_TIERS: PlanBadgeTier[] = ['free', 'go', 'plus', 'pro', 'max', 'team'];

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

/**
 * The wordmark on the account nameplate, inside the billing card.
 *
 * 320a36ac1 moved the account module into the floating top-right cluster and
 * reduced its trigger to a bare avatar circle; the account then moved to the
 * foot of the rail and the billing card to a hover panel under the top-right
 * credits pill — the nameplate (tier label + wordmark) now renders only
 * there, so this hovers the pill to read the popover's scoped tier.
 */
function nameplateTier() {
  fireEvent.pointerEnter(screen.getByTestId('entry-top-right-credits'));
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

describe('plan wordmark — the quota popover names the current workspace tier', () => {
  it.each([
    // B's report for a workspace nobody has paid for: a positive free
    // entitlement, no plan id, and an empty tier on the summary.
    {
      name: 'free (nothing paid for)',
      entitlement: { billingState: 'free', planId: null },
      membershipTier: '',
      expected: 'free',
    },
    {
      name: 'team_basic',
      entitlement: { billingState: 'active', planId: 'team_basic' },
      membershipTier: 'team_basic',
      expected: 'team',
    },
    {
      name: 'team_plus',
      entitlement: { billingState: 'active', planId: 'team_plus' },
      membershipTier: 'team_plus',
      expected: 'plus',
    },
    {
      name: 'team_go',
      entitlement: { billingState: 'active', planId: 'team_go' },
      membershipTier: 'team_go',
      expected: 'go',
    },
    {
      name: 'team_pro',
      entitlement: { billingState: 'active', planId: 'team_pro' },
      membershipTier: 'team_pro',
      expected: 'pro',
    },
    {
      name: 'team_max',
      entitlement: { billingState: 'active', planId: 'team_max' },
      membershipTier: 'team_max',
      expected: 'max',
    },
    // A billing-period suffix is still the same plan family.
    {
      name: 'team_max_yearly',
      entitlement: { billingState: 'active', planId: 'team_max_yearly' },
      membershipTier: 'team_max_yearly',
      expected: 'max',
    },
  ])('draws the $expected wordmark on $name', ({ entitlement, membershipTier, expected }) => {
    renderRail({
      context: context(entitlement as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier }),
    });

    expect(nameplateTier()).toBe(expected);
    expect(drawnTier(screen.getByTestId('entry-top-right-credits'))).toBe(expected === 'free' ? null : expected);
  });

  it('draws the paid tier wordmark for a team plan', () => {
    renderRail({
      context: context({ billingState: 'active', planId: 'team_pro' } as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_pro', subscriptionStatus: 'active' }),
    });

    expect(nameplateTier()).toBe('pro');
  });

  it('draws the paid tier for a personal workspace holding a team plan', () => {
    renderRail({
      context: context({
        workspaceType: 'personal',
        billingState: 'active',
        planId: 'team_plus',
      } as unknown as Partial<WorkspaceCollabContext>),
      billing: billing({ membershipTier: 'team_plus', subscriptionStatus: 'active' }),
    });

    expect(nameplateTier()).toBe('plus');
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

    expect(nameplateTier()).toBe(plan);
  });
});
describe('OPEND-4440 workspace plan loading', () => {
  it.each(['owner', 'member'] as const)('keeps an unknown %s workspace neutral until its Max plan arrives', role => {
    const unknown = context({ workspaceId: 'new-team', workspaceMemberId: 'new-member', role, planId: null });
    const view = renderRail({ context: unknown, billing: null });
    const pill = screen.getByTestId('entry-top-right-credits');
    expect(drawnTier(pill)).toBeNull();
    expect(pill.getAttribute('aria-busy')).toBe('true');
    fireEvent.pointerEnter(pill);
    expect(drawnTier(document.querySelector('.entry-nav-rail__menu-credits'))).toBeNull();
    expect(document.querySelector('.entry-nav-rail__menu-credits-plan')?.textContent).not.toContain('团队');
    view.rerender(<I18nProvider initial="zh-CN"><EntryNavRail view="home" onViewChange={() => {}} onNewProject={() => {}} open context={context({ ...unknown, planId: 'max' } as unknown as Partial<WorkspaceCollabContext>)} billing={billing({ membershipTier: 'max' })} balanceUsd="0" /></I18nProvider>);
    expect(drawnTier(screen.getByTestId('entry-top-right-credits'))).toBe('max');
    expect(screen.getByTestId('entry-top-right-credits').getAttribute('aria-busy')).not.toBe('true');
    expect(nameplateTier()).toBe('max');
  });
});
