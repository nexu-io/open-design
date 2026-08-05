// @vitest-environment jsdom
//
// Acceptance: the Settings → 本机 CLI → Open Design card must not offer 「升级」
// to a workspace that is already on the TOP plan tier there is.
//
// Product ruling (owner, from a real packaged client on Team Max):
// 「个人档位都是要显示可升级的, 最顶的就是团队 max」 — `team_max` is the one tier
// with nothing above it. Every personal tier (personal `max` included: that user
// can still move onto a team plan, and vela #1146 deliberately routes their
// click to the Team upgrade dialog) and every team tier below max keep the
// affordance.
//
// The bug: this card judged the tier from `amrCardStatus.account.plan` — vela's
// ACCOUNT-scoped login projection, which reports `free` for a user whose
// entitlement is held by a team workspace. So a 团队版 Max owner was measured as
// "free" and shown 升级, while the badge right next to it correctly read Max off
// the workspace-resolved tier. Both must read the SAME resolved tier.

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

const MEMBER_PERMISSIONS = {
  ...OWNER_PERMISSIONS,
  canManageMembers: false,
  canManageBilling: false,
  canInviteMembers: false,
  canManageAutoRecharge: false,
  canManageSharedResources: false,
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
 * is the WORKSPACE plan — the two disagree by design for a team member, which
 * is exactly the axis this bug sat on.
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
          user: { id: 'u1', email: '935902669@qq.com' },
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
  // Both identity reads must land before the gate is meaningful: the card is
  // deliberately fail-closed while the tier is unknown.
  await waitFor(() => {
    expect(screen.getByTestId('settings-agent-card-amr')).toBeTruthy();
    expect(screen.getByText('935902669@qq.com')).toBeTruthy();
  });
}

function upgradePill(): HTMLElement | null {
  return screen.queryByTestId('settings-agent-card-amr-upgrade');
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Settings CLI card — 升级 at the top plan tier', () => {
  // (1) The reported bug. The account projection says `free` for this user;
  // the workspace they are actually in is on team_max.
  it('hides 升级 for a team_max owner', async () => {
    await renderCliTab({
      context: workspaceContext({ planId: 'team_max' } as Partial<WorkspaceCollabContext>),
      accountPlan: 'free',
    });

    expect(upgradePill()).toBeNull();
  });

  // (2) Team tiers below max can still change plan.
  it.each(['team_basic', 'team_plus', 'team_pro'])(
    'keeps 升级 for a %s owner',
    async (tier) => {
      await renderCliTab({
        context: workspaceContext({ planId: tier } as Partial<WorkspaceCollabContext>),
        accountPlan: 'free',
      });

      expect(upgradePill()).toBeTruthy();
    },
  );

  // (3) The case a careless fix breaks: personal Max is NOT the top of the
  // ladder — that user can still move onto a team plan.
  it('keeps 升级 for a personal max owner', async () => {
    await renderCliTab({
      context: workspaceContext({
        workspaceType: 'personal',
        teamId: undefined,
        teamName: undefined,
        planId: null,
      } as unknown as Partial<WorkspaceCollabContext>),
      accountPlan: 'max',
    });

    expect(upgradePill()).toBeTruthy();
  });

  // (4) Every other personal tier keeps it too.
  it.each(['free', 'plus', 'pro'])('keeps 升级 for a personal %s owner', async (tier) => {
    await renderCliTab({
      context: workspaceContext({
        workspaceType: 'personal',
        teamId: undefined,
        teamName: undefined,
        planId: null,
      } as unknown as Partial<WorkspaceCollabContext>),
      accountPlan: tier,
    });

    expect(upgradePill()).toBeTruthy();
  });

  // (5) Existing behavior that must not regress (recvqfYKutwWlQ): billing is
  // owner-only, so a member never sees the affordance even on an upgradeable
  // tier.
  it('still hides 升级 for a team_pro member without canManageBilling', async () => {
    await renderCliTab({
      context: workspaceContext({
        role: 'member',
        planId: 'team_pro',
        permissions: MEMBER_PERMISSIONS,
      } as unknown as Partial<WorkspaceCollabContext>),
      accountPlan: 'free',
    });

    expect(upgradePill()).toBeNull();
  });
});
