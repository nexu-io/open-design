// @vitest-environment jsdom
//
// Switching workspaces must move the PLAN nameplate, not just the money.
//
// Reported shape: a workspace Vela Web shows as 免费 (订阅状态:免费, 升级团队套餐
// CTA, US$0.00) rendered as 专业版 Plus in the client's account menu — while the
// 额度 row in that same card correctly read $0.00. "为啥额度是对的?" is the whole
// diagnosis: money and plan travel different paths, and only money is partitioned
// by workspace.
//
// `GET /api/workspace/billing` answers with THREE independently scoped things
// (packages/contracts/src/api/collab.ts):
//   • `summary`      — the caller's VELA ACCOUNT billing (`workspaceId: null`
//                      by contract; the daemon reads it with one unscoped
//                      `fetchBilling()` regardless of `?workspaceId=`), so it
//                      is byte-identical for every workspace of one account.
//   • `workspaceBalance` / `workspaceSnapshot` — one backend-proven projection
//                      for the exact workspace + member.
//
// So an account holding a personal Plus subscription reports
// `summary.membershipTier === 'plus'` while standing in a brand-new, unpaid team
// workspace. Any surface that reads the plan off `summary` shows Plus there
// forever — the value cannot change when the workspace changes, because it was
// never about the workspace.
//
// This test drives the real wiring (EntryShell → EntryNavRail) across a
// workspace switch and asserts both halves of the card agree on the workspace
// they are describing.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceBillingResponse,
  type WorkspaceBillingSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { RAIL_OPEN_STORAGE_KEY } from '../../src/components/entryRailBridge';
import {
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A team workspace as B reports it on `GET /api/workspace/context`. `owner` so
 * B fills in the per-workspace entitlement fields (`billingState` / `planId`);
 * it omits them for non-owners.
 */
function teamContext(
  workspaceId: string,
  entitlement: { billingState: 'active' | 'free'; planId: string | null },
): WorkspaceCollabContext {
  const role = 'owner' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId: `member-${workspaceId}`,
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: entitlement.billingState,
    planId: entitlement.planId,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    teamName: workspaceId,
    displayName: 'Plus Account',
  };
}

/**
 * The account-scoped half of the billing response. Identical for every
 * workspace — that is the point. This account pays for a PERSONAL Plus.
 */
const ACCOUNT_PLUS_SUMMARY: WorkspaceBillingSummary = {
  workspaceId: null,
  membershipTier: 'plus',
  totalAvailableCredits: 4_200_000,
  subscriptionCredits: 4_200_000,
  rechargeCredits: 0,
  balanceUsd: '42.00',
  subscriptionStatus: 'active',
  availableActions: ['billing_portal'],
  workspaceBalance: null,
};

function billingResponse(
  workspaceId: string,
  workspacePlan: { billingState: 'active' | 'free'; planId: string | null },
  walletUsd: string,
): WorkspaceBillingResponse {
  const workspaceMemberId = `member-${workspaceId}`;
  return {
    summary: { ...ACCOUNT_PLUS_SUMMARY },
    workspaceBalance: {
      workspaceId,
      workspaceMemberId,
      balanceUsd: walletUsd,
      billingScopeVersion: 2,
      expiresAt: null,
      updatedAt: '2026-07-28T14:30:00.000Z',
    },
    workspaceSnapshot: {
      schemaVersion: 1,
      workspaceId,
      workspaceMemberId,
      billingScopeVersion: 2,
      billing: workspacePlan,
      wallet: {
        balanceUsd: walletUsd,
        expiresAt: null,
        updatedAt: '2026-07-28T14:30:00.000Z',
      },
      revisions: { billing: `b-${workspaceId}`, wallet: `w-${workspaceId}` },
    },
  };
}

function agent(): AgentInfo {
  return {
    id: 'amr',
    name: 'Open Design AMR',
    bin: 'amr',
    available: true,
    models: [{ id: 'glm-5', label: 'GLM 5' }],
  };
}

function config(): AppConfig {
  return {
    mode: 'daemon',
    agentId: 'amr',
    agentModels: { amr: { model: 'glm-5' } },
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    skillId: null,
    designSystemId: null,
    theme: 'system',
  };
}

/**
 * Scope queries to the open account menu's billing card. A pure read — the
 * menu is opened once, by hand, and `useDismissOnOutsideInteraction` only
 * closes it on a pointerdown outside or Escape, so it survives the switch.
 */
function billingCard() {
  const el = document.querySelector('.entry-nav-rail__menu-credits');
  if (!el) throw new Error('billing card is not rendered');
  return within(el as HTMLElement);
}

/**
 * The tier the nameplate badge is drawing. `PlanWordmark` is decorative
 * (`aria-hidden`), so the viewBox width is what distinguishes the wordmarks:
 * free 107, pro 108, plus 114, team 136.
 */
const BADGE_VIEWBOX_WIDTH: Record<string, string> = {
  free: '0 0 107 49',
  pro: '0 0 108 49',
  plus: '0 0 114 49',
  team: '0 0 136 49',
};

function accountRowBadgeViewBox(): string | null {
  const badge = document
    .querySelector('.entry-nav-rail__account-trigger')
    ?.querySelector('svg.plan-wordmark');
  return badge?.getAttribute('viewBox') ?? null;
}

/** A: a team workspace that really holds a Team Plus subscription. */
const PAID_TEAM = teamContext('workspace-paid', {
  billingState: 'active',
  planId: 'team_plus',
});
/**
 * B: the reported workspace — brand new, nothing paid for. B reports an
 * unsubscribed workspace as `billingState: 'free'` with a null planId.
 */
const FREE_TEAM = teamContext('workspace-free', {
  billingState: 'free',
  planId: null,
});

interface Harness {
  /** Point `/api/workspace/context` at another workspace, then re-read. */
  switchTo: (context: WorkspaceCollabContext) => Promise<void>;
  /** The open account menu's billing card. */
  card: () => ReturnType<typeof within>;
}

/**
 * Mount the real home shell against a two-workspace account and open the
 * account menu. The menu stays open for the rest of the case:
 * `useDismissOnOutsideInteraction` closes it only on a pointerdown outside or
 * Escape, neither of which a workspace switch produces.
 */
async function mountHomeShell(initial: WorkspaceCollabContext): Promise<Harness> {
  let currentContext = initial;
  let contextReads = 0;
  const billingReads: string[] = [];

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/workspace/directory')) {
      const otherContext =
        currentContext.workspaceId === PAID_TEAM.workspaceId ? FREE_TEAM : PAID_TEAM;
      return jsonResponse(workspaceDirectoryFixture([currentContext, otherContext]));
    }
    if (url.endsWith('/api/workspace/context')) {
      contextReads += 1;
      return jsonResponse({ context: currentContext });
    }
    if (url.includes('/api/workspace/billing?')) {
      const workspaceId =
        new URL(url, 'http://open-design.test').searchParams.get('workspaceId') ?? '';
      billingReads.push(workspaceId);
      if (workspaceId === PAID_TEAM.workspaceId) {
        return jsonResponse(
          billingResponse(workspaceId, { billingState: 'active', planId: 'team_plus' }, '12.34'),
        );
      }
      if (workspaceId === FREE_TEAM.workspaceId) {
        return jsonResponse(
          billingResponse(workspaceId, { billingState: 'free', planId: null }, '0'),
        );
      }
      throw new Error(`unexpected billing scope ${url}`);
    }
    if (url.endsWith('/api/workspace/projects/team')) return jsonResponse({ projects: [] });
    if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
    if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
    if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
    if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
    return jsonResponse({});
  }) as typeof fetch;

  render(
    <I18nProvider initial="zh-CN">
      <EntryShell
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        projects={[]}
        templates={[]}
        promptTemplates={[]}
        defaultDesignSystemId={null}
        connectors={[]}
        connectorsLoading={false}
        config={config()}
        agents={[agent()]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onConfigPersist={vi.fn()}
        onRefreshAgents={vi.fn(() => [agent()])}
        onCreateProject={vi.fn(async () => true)}
        onCreatePluginShareProject={vi.fn()}
        onImportClaudeDesign={vi.fn()}
        onOpenProject={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDeleteProject={vi.fn()}
        onRenameProject={vi.fn()}
        onChangeDefaultDesignSystem={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onOpenSettings={vi.fn()}
        onCompleteOnboarding={vi.fn()}
      />
    </I18nProvider>,
  );

  await waitFor(() => expect(contextReads).toBeGreaterThan(0));
  await waitFor(() => expect(billingReads).toContain(initial.workspaceId));
  fireEvent.click(await screen.findByTestId('entry-nav-account'));
  await waitFor(() => expect(billingCard()).toBeTruthy());

  return {
    card: billingCard,
    switchTo: async (next) => {
      currentContext = next;
      act(() => notifyWorkspaceContextRefresh({ context: next }));
      await waitFor(() => expect(billingReads).toContain(next.workspaceId));
    },
  };
}

describe('account menu plan nameplate follows the selected workspace', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, 'true');
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
    resetWorkspaceDirectoryCache();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    window.localStorage.clear();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
    resetWorkspaceDirectoryCache();
    vi.restoreAllMocks();
  });

  // The A side of the report: the nameplate answers a WORKSPACE question, so a
  // personal Plus subscription must not name a team workspace's plan. The label
  // names the plan FAMILY (团队版) and, per the later product ruling, so does the
  // badge — a team subscription draws the `team` wordmark at every tier. The
  // account here pays for a personal PLUS, so the PLUS wordmark is exactly the
  // regression this asserts against.
  it('names the workspace subscription, not the account subscription', async () => {
    const home = await mountHomeShell(PAID_TEAM);

    await waitFor(() => expect(home.card().getByText('$12.34')).toBeTruthy());
    const card = home.card();
    expect(card.queryByText('专业版')).toBeNull();
    expect(card.getByText('团队版')).toBeTruthy();
    expect(accountRowBadgeViewBox()).toBe(BADGE_VIEWBOX_WIDTH.team);
  });

  // The B side: the exact reported sequence. Switching away from a paid
  // workspace must move the nameplate, not only the wallet.
  it('moves both the wallet and the nameplate when the workspace switches', async () => {
    const home = await mountHomeShell(PAID_TEAM);
    await waitFor(() => expect(home.card().getByText('$12.34')).toBeTruthy());

    await home.switchTo(FREE_TEAM);

    // The money half already follows the switch — that is the half the reporter
    // saw working ("但是额度是对的").
    await waitFor(() => expect(home.card().getByText('$0.00')).toBeTruthy());

    // The plan half must follow it too. Before the fix this still read
    // 专业版 + the PLUS wordmark, because it came from the account summary
    // that cannot change when the workspace does.
    //
    // The LABEL is what carries the switch: it is a subscription question, and
    // this workspace has no subscription (免费). The badge names the plan FAMILY,
    // which both workspaces share, so it stays on `team` across the switch —
    // still a live guard on this bug, since the account's own tier is a personal
    // PLUS and reverting the projection would put that wordmark back here.
    const card = home.card();
    expect(card.queryByText('专业版')).toBeNull();
    expect(card.queryByText('团队版')).toBeNull();
    expect(card.getByText('免费')).toBeTruthy();
    expect(accountRowBadgeViewBox()).toBe(BADGE_VIEWBOX_WIDTH.team);
  });
});
