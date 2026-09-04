// @vitest-environment jsdom

/**
 * Regression coverage for 飞书 "Team plus 还有余额被识别成 free，弹窗要求升级套餐"
 * (P0). `resolvePlanTier` (collab/team-plan.ts) is DESIGNED so the workspace
 * billing summary's `membershipTier` outranks vela's account-scoped
 * `account.plan` — a team member's vela login projection reads `free` even
 * when their team holds a paid plan, by design (see team-plan.ts's docblock).
 * But App.tsx's `resolvedAmrPlan` call never wired in `useWorkspaceBilling()`,
 * so `billing` was always undefined and the chain fell straight through to
 * the misleading account-scoped `free`, flashing the free-tier upgrade modal
 * (AmrArtifactUpgradeGate) at a paying Team Plus member.
 */

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { Route } from '../../src/router';
import type { AppConfig, Project } from '../../src/types';
import { loadConfig, mergeDaemonConfig, fetchDaemonConfig } from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { fetchAmrModels, fetchVelaLoginStatus } from '../../src/providers/daemon';
import { listProjects, listTemplates } from '../../src/state/projects';
import {
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

const homeRouteMock = { kind: 'home' as const, view: 'home' as const };
const useRouteMock = vi.fn<() => Route>(() => homeRouteMock);
const useProjectRouteWorkspaceContextMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/router')>();
  return {
    ...actual,
    navigate: vi.fn(),
    useRoute: () => useRouteMock(),
  };
});

vi.mock('../../src/collab/useProjectRouteWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/collab/useProjectRouteWorkspaceContext')
  >();
  return {
    ...actual,
    useProjectRouteWorkspaceContext: useProjectRouteWorkspaceContextMock,
  };
});

vi.mock('../../src/components/EntryView', () => ({
  EntryView: () => <div>Entry view</div>,
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: () => <div>Project view</div>,
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

// Capture exactly what App.tsx resolves as this surface's plan gate, without
// pulling in AmrArtifactUpgradeGate's own dialog/session-key machinery — that
// machinery is not what this regression is about.
const capturedPlanCalls: Array<{ plan: string | null; planResolved: boolean }> = [];
vi.mock('../../src/components/AmrArtifactUpgradeGate', () => ({
  AmrArtifactUpgradeGate: ({
    plan,
    planResolved,
  }: {
    plan: string | null;
    planResolved: boolean;
  }) => {
    capturedPlanCalls.push({ plan, planResolved });
    return <div data-testid="amr-plan-gate" data-plan={plan ?? 'null'} data-plan-resolved={String(planResolved)} />;
  },
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgentsStream: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

vi.mock('../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/daemon')>(
    '../../src/providers/daemon',
  );
  return {
    ...actual,
    fetchAmrModels: vi.fn(),
    fetchVelaLoginStatus: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    fetchMediaProvidersFromDaemon: vi.fn().mockResolvedValue({ status: 'ok', providers: null }),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
    syncMediaProvidersToDaemon: vi.fn().mockResolvedValue(undefined),
  };
});

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgentsStream = vi.mocked(fetchAgentsStream);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedFetchAmrModels = vi.mocked(fetchAmrModels);
const mockedFetchVelaLoginStatus = vi.mocked(fetchVelaLoginStatus);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedMergeDaemonConfig = vi.mocked(mergeDaemonConfig);
const mockedFetchDaemonConfig = vi.mocked(fetchDaemonConfig);

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
};

const project: Project = {
  id: 'project-team',
  name: 'Team project',
  skillId: null,
  designSystemId: null,
  customInstructions: '',
  createdAt: 1,
  updatedAt: 1,
  workspaceId: 'ws-project-team',
};

const ambientFreeContext = {
  workspaceId: 'ws-personal-free',
  workspaceType: 'personal',
  workspaceMemberId: 'member-personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'free',
  planId: null,
} as const;

const projectTeamContext = {
  workspaceId: 'ws-project-team',
  workspaceType: 'team',
  workspaceMemberId: 'member-team',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
} as const;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('App AMR plan-tier gate', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    capturedPlanCalls.length = 0;
    useRouteMock.mockReturnValue(homeRouteMock);
    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: null,
      loading: false,
      retry: vi.fn(),
    });
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedFetchDaemonConfig.mockResolvedValue({});
    mockedFetchAmrModels.mockResolvedValue({ source: 'preset', refreshing: false, models: [] });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
  });

  it('does not gate a Team Plus member behind the free-tier upsell just because vela account.plan reads free', async () => {
    // vela's ACCOUNT-scoped login projection: a team member reads `free` here
    // even though their team holds a paid plan (team-plan.ts's own docblock).
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      loginInFlight: false,
      profile: 'prod',
      user: { id: 'member-1', email: 'member@example.com' },
      configPath: '/tmp/amr-config.json',
      account: { plan: 'free' },
    });

    const workspaceContext = {
      workspaceId: 'ws-team',
      workspaceType: 'team' as const,
      workspaceMemberId: 'member-team',
      role: 'member' as const,
      memberStatus: 'active' as const,
      lifecycleState: 'active' as const,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([workspaceContext]));
      }
      if (url.includes('/api/workspace/billing?')) {
        return jsonResponse({
          summary: {
            workspaceId: null,
            membershipTier: 'free',
            balanceUsd: '0',
            workspaceBalance: null,
          },
          workspaceBalance: {
            workspaceId: 'ws-team',
            workspaceMemberId: 'member-team',
            balanceUsd: '12.34',
            billingScopeVersion: 2,
            expiresAt: null,
            updatedAt: null,
          },
          workspaceSnapshot: {
            schemaVersion: 1,
            workspaceId: 'ws-team',
            workspaceMemberId: 'member-team',
            billingScopeVersion: 2,
            billing: { billingState: 'active', planId: 'team_plus' },
            wallet: { balanceUsd: '12.34', expiresAt: null, updatedAt: null },
            revisions: { billing: 'billing-1', wallet: 'wallet-1' },
          },
        });
      }
      if (url.endsWith('/api/workspace/context')) {
        // A non-owner member: B omits planId here (the documented gap
        // resolvePlanTier's precedence chain exists to route around).
        return jsonResponse({
          context: workspaceContext,
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(capturedPlanCalls.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      const last = capturedPlanCalls.at(-1);
      expect(last?.plan).toBe('team_plus');
    });
    expect(capturedPlanCalls.some((call) => call.plan === 'free')).toBe(false);
  });

  it('uses the active project Team plan instead of the ambient personal Free plan', async () => {
    useRouteMock.mockReturnValue({
      kind: 'project',
      projectId: project.id,
      conversationId: 'conversation-1',
      fileName: null,
    });
    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: projectTeamContext,
      loading: false,
      retry: vi.fn(),
    });
    mockedListProjects.mockResolvedValue([project]);
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      loginInFlight: false,
      profile: 'prod',
      user: { id: 'member-1', email: 'member@example.com' },
      configPath: '/tmp/amr-config.json',
      account: { plan: 'free' },
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([
          ambientFreeContext,
          projectTeamContext,
        ]));
      }
      if (url.includes('/api/workspace/billing?')) {
        const workspaceId = new URL(url, 'http://open-design.test')
          .searchParams.get('workspaceId');
        const context = workspaceId === projectTeamContext.workspaceId
          ? projectTeamContext
          : ambientFreeContext;
        const teamScoped = context.workspaceId === projectTeamContext.workspaceId;
        return jsonResponse({
          summary: {
            workspaceId: null,
            membershipTier: 'free',
            balanceUsd: '0',
            workspaceBalance: null,
          },
          workspaceBalance: {
            workspaceId: context.workspaceId,
            workspaceMemberId: context.workspaceMemberId,
            balanceUsd: teamScoped ? '12.34' : '0',
            billingScopeVersion: 2,
            expiresAt: null,
            updatedAt: null,
          },
          workspaceSnapshot: {
            schemaVersion: 1,
            workspaceId: context.workspaceId,
            workspaceMemberId: context.workspaceMemberId,
            billingScopeVersion: 2,
            billing: {
              billingState: teamScoped ? 'active' : 'free',
              planId: teamScoped ? 'team_pro' : null,
            },
            wallet: {
              balanceUsd: teamScoped ? '12.34' : '0',
              expiresAt: null,
              updatedAt: null,
            },
            revisions: {
              billing: `billing-${context.workspaceId}`,
              wallet: `wallet-${context.workspaceId}`,
            },
          },
        });
      }
      if (url.endsWith('/api/workspace/context')) {
        return jsonResponse({ context: ambientFreeContext });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(capturedPlanCalls.at(-1)).toEqual({
        plan: 'team_pro',
        planResolved: true,
      });
    });
    expect(capturedPlanCalls.some((call) => call.plan === 'free')).toBe(false);
  });
});
