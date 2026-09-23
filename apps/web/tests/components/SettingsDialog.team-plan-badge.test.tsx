// @vitest-environment jsdom
//
// Acceptance: the plan pill on Settings → 本机 CLI → OpenDesign must name the
// same plan FAMILY as the rail's account-row wordmark.
//
// Product ruling (owner): 「团队版的订阅，这里应该都显示 team 的标识」 …… 「产品
// 期望团队从 free 到 max，徽标都显示 team 的那个，个人的还是维持现状不要动」.
//
// This card derives its pill from the same `PlanWordmark` helper the rail uses,
// so it carried the identical defect: `team_plus` matched the `plus` branch
// first (B's team ids embed the personal tier word), and a free team workspace
// resolves to a bare `free` that no id can distinguish from a personal free
// account. The owner has been explicit that the two surfaces move together —
// 「设置中的这里应该一样的逻辑」 — so both are covered, in the same shape.
//
// See `EntryNavRail.team-plan-badge.test.tsx` for the rail half.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchCodexPets: vi.fn(async () => []),
    syncCommunityPets: vi.fn(async () => []),
    fetchSkills: vi.fn(async () => []),
    fetchDesignSystems: vi.fn(async () => []),
    fetchDesignTemplates: vi.fn(async () => []),
    fetchConnectors: vi.fn(async () => []),
    fetchLatestGithubReleaseInfo: vi.fn(async () => null),
    openExternalUrl: vi.fn(),
  };
});

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: vi.fn(),
    setConsent: () => undefined,
    setIdentity: () => undefined,
    setConfigureGlobals: () => undefined,
    anonymousId: 'test-anonymous',
    sessionId: 'test-session',
    newRequestId: () => 'test-request',
  }),
}));

const originalFetch = globalThis.fetch;

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'amr',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR (vela)',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [{ id: 'default', label: 'Default' }],
  supportsCustomModel: false,
};

const OWNER_PERMISSIONS = {
  canManageMembers: true,
  canManageBilling: true,
  canInviteMembers: true,
  canManageAutoRecharge: true,
  canShareProjects: true,
  canWriteSyncedFiles: true,
  canViewWorkspaceSettings: true,
  canManageSharedResources: true,
};

function workspaceContext(
  overrides: Partial<WorkspaceCollabContext> = {},
): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    teamId: 'team-1',
    teamName: 'OD Feature Team',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'workspace_managed',
    seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false },
    permissions: OWNER_PERMISSIONS,
    workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-1',
    ...overrides,
  } as unknown as WorkspaceCollabContext;
}

/**
 * Stand the CLI tab up for one identity shape.
 *
 * `accountPlan` is vela's ACCOUNT-scoped login projection and `context.planId`
 * is the WORKSPACE plan; they disagree by design for a team member, so a team
 * case deliberately leaves the account projection on `free`.
 */
async function renderCliTab(options: {
  context: WorkspaceCollabContext;
  accountPlan: string;
}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.startsWith('/api/workspace/directory')) {
      return new Response(
        JSON.stringify(workspaceDirectoryFixture([options.context])),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith('/api/workspace/context')) {
      return new Response(JSON.stringify({ context: options.context }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('/api/workspace/billing')) {
      // Account metadata outage / not yet reported: the resolved tier then comes
      // from the workspace context, which carries the same raw plan id.
      return new Response(JSON.stringify({ summary: null, workspaces: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.startsWith('/api/integrations/vela/status')) {
      return new Response(
        JSON.stringify({
          loggedIn: true,
          profile: 'default',
          user: { id: 'u1', email: 'owner@example.com' },
          account: { plan: options.accountPlan, balanceUsd: '210.0000' },
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  render(
    <I18nProvider initial="en">
      <SettingsDialog
        initial={baseConfig}
        agents={[amrAgent]}
        daemonLive
        appVersionInfo={null}
        initialSection="execution"
        onPersist={vi.fn()}
        onSilentUpdatePreferenceChange={async () => undefined}
        onPersistComposioKey={vi.fn()}
        onClose={vi.fn()}
        onRefreshAgents={vi.fn()}
      />
    </I18nProvider>,
  );

  fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
  // Both identity reads must land before the pill is meaningful.
  await waitFor(() => {
    expect(screen.getByTestId('settings-agent-card-amr')).toBeTruthy();
    expect(screen.getByText('owner@example.com')).toBeTruthy();
  });
}

/** The plan pill's text. Rendered lowercase; CSS capitalizes it. */
async function planPill(): Promise<string> {
  const el = await waitFor(() => {
    const found = document.querySelector('.agent-card-plan-badge');
    if (!found) throw new Error('plan pill is not rendered');
    return found;
  });
  return el.textContent?.trim() ?? '';
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Settings CLI card — a team workspace reads `team` at every tier', () => {
  it.each([
    // B's report for a workspace nobody has paid for: no plan id at all, so the
    // account projection's `free` is the only tier in scope.
    { name: 'free (nothing paid for)', planId: null, accountPlan: 'free' },
    { name: 'team_basic', planId: 'team_basic', accountPlan: 'free' },
    { name: 'team_plus', planId: 'team_plus', accountPlan: 'free' },
    { name: 'team_pro', planId: 'team_pro', accountPlan: 'free' },
    { name: 'team_max', planId: 'team_max', accountPlan: 'free' },
    { name: 'team_max_yearly', planId: 'team_max_yearly', accountPlan: 'free' },
  ])('reads team on $name', async ({ planId, accountPlan }) => {
    await renderCliTab({
      context: workspaceContext({
        billingState: planId ? 'active' : 'free',
        planId,
      } as unknown as Partial<WorkspaceCollabContext>),
      accountPlan,
    });

    expect(await planPill()).toBe('team');
  });
});

describe('Settings CLI card — the personal ladder is untouched', () => {
  it.each(['free', 'plus', 'pro', 'max'])(
    'keeps %s for a personal workspace on that plan',
    async (plan) => {
      await renderCliTab({
        context: workspaceContext({
          workspaceType: 'personal',
          teamId: undefined,
          teamName: undefined,
          billingState: plan === 'free' ? 'free' : 'active',
          planId: null,
        } as unknown as Partial<WorkspaceCollabContext>),
        accountPlan: plan,
      });

      expect(await planPill()).toBe(plan);
    },
  );
});
