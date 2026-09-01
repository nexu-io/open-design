// @vitest-environment jsdom
//
// The floating avatar + credits cluster must survive opening a project.
//
// The entry refresh moved the account module (avatar chip + credits pill)
// into a top-right chrome cluster owned by EntryNavRail — which unmounts with
// EntryShell the moment a project tab opens. Product: the avatar and credits
// stay visible on the project view too, in the same top-right spot. App.tsx
// therefore mounts `WorkspaceTopRightAccountCluster` with the route-owned
// Workspace authority whenever `route.kind === 'project'`.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { Route } from '../../src/router';
import type { AppConfig, Project } from '../../src/types';
import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
} from '@open-design/contracts';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  fetchMediaProvidersFromDaemon,
  loadConfig,
  mergeDaemonConfig,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgents,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates } from '../../src/state/projects';
import {
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';

const PROJECT_ROUTE: Route = {
  kind: 'project' as const,
  projectId: 'project-1',
  conversationId: null,
  fileName: null,
};
const useRouteMock = vi.fn<() => Route>(() => PROJECT_ROUTE);
const useProjectRouteWorkspaceContextMock = vi.hoisted(() => vi.fn());
const projectViewMountedMock = vi.hoisted(() => vi.fn());
const projectViewUnmountedMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => useRouteMock(),
}));

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
  ProjectView: () => {
    useEffect(() => {
      projectViewMountedMock();
      return () => projectViewUnmountedMock();
    }, []);
    return <div>Project view</div>;
  },
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  openWorkspaceTab: vi.fn(),
  WorkspaceTabsBar: () => null,
}));

vi.mock('../../src/components/MemoryToast', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/MemoryToast')>(
    '../../src/components/MemoryToast',
  );
  return {
    ...actual,
    MemoryToast: () => null,
  };
});

vi.mock('../../src/components/PrivacyConsentModal', () => ({
  PrivacyConsentModal: () => null,
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgents: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
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
    fetchComposioConfigFromDaemon: vi.fn(),
    fetchDaemonConfig: vi.fn(),
    fetchMediaProvidersFromDaemon: vi.fn(),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
  };
});

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
  agentModels: {},
  agentCliEnv: {},
  privacyDecisionAt: 1778244000000,
};

const project: Project = {
  id: 'project-1',
  name: 'Project 1',
  skillId: null,
  designSystemId: null,
  customInstructions: '',
  createdAt: 1,
  updatedAt: 1,
  workspaceId: 'ws-project',
};

const PROJECT_DIRECTORY_ITEM: WorkspaceDirectoryItem = {
  workspaceId: 'ws-project',
  workspaceMemberId: 'wm-project',
  workspaceName: 'Project Workspace',
  workspaceType: 'personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const AMBIENT_DIRECTORY_ITEM: WorkspaceDirectoryItem = {
  workspaceId: 'ws-ambient',
  workspaceMemberId: 'wm-ambient',
  workspaceName: 'Ambient Workspace',
  workspaceType: 'personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const PROJECT_WORKSPACE_CONTEXT: WorkspaceCollabContext = {
  ...PROJECT_DIRECTORY_ITEM,
  displayName: 'Project Nova',
  billingState: 'active',
  planId: 'pro',
  providerMode: 'platform_credits',
  seatSummary: {
    seatLimit: 0,
    usedSeats: 0,
    availableSeats: 0,
    isSeatFull: false,
  },
  permissions: {
    canManageMembers: false,
    canManageBilling: true,
    canInviteMembers: false,
    canManageAutoRecharge: true,
    canShareProjects: false,
    canWriteSyncedFiles: false,
    canViewWorkspaceSettings: false,
    canManageSharedResources: false,
  },
  workspaceSettingsUrl: 'https://cloud.example/settings?workspaceId=ws-project',
};

const AMBIENT_WORKSPACE_CONTEXT: WorkspaceCollabContext = {
  ...PROJECT_WORKSPACE_CONTEXT,
  ...AMBIENT_DIRECTORY_ITEM,
  displayName: 'Ambient Bea',
  workspaceSettingsUrl: 'https://cloud.example/settings?workspaceId=ws-ambient',
};

const PROJECT_BILLING_RESPONSE = {
  summary: {
    workspaceId: 'ws-project',
    membershipTier: 'pro',
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: '12.34',
    subscriptionStatus: 'active',
    availableActions: [],
  },
  workspaceBalance: {
    billingScopeVersion: 2,
    workspaceId: 'ws-project',
    workspaceMemberId: 'wm-project',
    balanceUsd: '12.34',
  },
};

const AMBIENT_BILLING_RESPONSE = {
  ...PROJECT_BILLING_RESPONSE,
  summary: {
    ...PROJECT_BILLING_RESPONSE.summary,
    workspaceId: 'ws-ambient',
    balanceUsd: '98.76',
  },
  workspaceBalance: {
    ...PROJECT_BILLING_RESPONSE.workspaceBalance,
    workspaceId: 'ws-ambient',
    workspaceMemberId: 'wm-ambient',
    balanceUsd: '98.76',
  },
};

function stubFetchByUrl() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = url.includes('/api/workspace/directory')
        ? { items: [PROJECT_DIRECTORY_ITEM, AMBIENT_DIRECTORY_ITEM] }
        : url.includes('/api/workspace/context')
          ? { context: AMBIENT_WORKSPACE_CONTEXT }
          : url.includes('/api/workspace/billing')
            ? url.includes('workspaceId=ws-project')
              ? PROJECT_BILLING_RESPONSE
              : AMBIENT_BILLING_RESPONSE
            : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

describe('project route — floating account cluster', () => {
  beforeEach(() => {
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetWorkspaceDirectoryCache();
    useRouteMock.mockReturnValue(PROJECT_ROUTE);
    vi.mocked(daemonIsLive).mockResolvedValue(true);
    vi.mocked(fetchAgents).mockResolvedValue([]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
    vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
    vi.mocked(listProjects).mockResolvedValue([project]);
    vi.mocked(listTemplates).mockResolvedValue([]);
    vi.mocked(fetchDaemonConfig).mockResolvedValue({});
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue(null);
    vi.mocked(fetchMediaProvidersFromDaemon).mockResolvedValue({ status: 'ok', providers: {} });
    vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig });
    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: PROJECT_WORKSPACE_CONTEXT,
      loading: false,
      retry: vi.fn(),
    });
    stubFetchByUrl();
    window.history.replaceState(null, '', '/projects/project-1');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetWorkspaceDirectoryCache();
  });

  it('keeps the avatar and credits pill mounted on an open project', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<App />);

    // Both cluster members ride the shared chrome portal; they appear once the
    // workspace context read resolves.
    const avatar = await screen.findByTestId('entry-nav-account');
    expect(avatar.closest('.entry-top-right-cluster')).not.toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('entry-top-right-credits')).toBeTruthy();
    });
    expect(avatar.getAttribute('aria-label')).toBe('Project Nova');
    expect(
      screen.getByTestId('entry-top-right-credits').textContent,
    ).toContain('$12.34');
    expect(screen.getByTestId('entry-top-right-credits').textContent).not.toContain('$98.76');

    fireEvent.click(screen.getByTestId('entry-top-right-credits'));
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[0]).toContain('/dashboard?workspaceId=ws-project');
  });

  it.each([
    ['signed out', false],
    ['workspace identity is still loading', true],
  ])('renders no cluster when %s', async (_state, loading) => {
    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: null,
      loading,
      retry: vi.fn(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    render(<App />);

    await screen.findByText(loading ? 'Loading workspace…' : 'Project view');
    await waitFor(() => {
      expect(document.querySelector('.entry-top-right-cluster')).toBeNull();
      expect(screen.queryByTestId('entry-top-right-github')).toBeNull();
      expect(screen.queryByTestId('entry-nav-account')).toBeNull();
      expect(screen.queryByTestId('entry-nav-account-updater')).toBeNull();
    });
  });

  it('keeps the same project instance mounted through a transient authority outage and recovery', async () => {
    const view = render(<App />);

    expect(await screen.findByText('Project view')).toBeTruthy();
    expect(projectViewMountedMock).toHaveBeenCalledTimes(1);
    expect(projectViewUnmountedMock).not.toHaveBeenCalled();

    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: PROJECT_WORKSPACE_CONTEXT,
      loading: false,
      failure: 'unavailable',
      retry: vi.fn(),
    });
    view.rerender(<App />);

    expect(await screen.findByText('Project view')).toBeTruthy();
    expect(screen.getByTestId('project-workspace-recovery-tip')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(projectViewMountedMock).toHaveBeenCalledTimes(1);
    expect(projectViewUnmountedMock).not.toHaveBeenCalled();

    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: PROJECT_WORKSPACE_CONTEXT,
      loading: false,
      retry: vi.fn(),
    });
    view.rerender(<App />);

    expect(screen.queryByTestId('project-workspace-recovery-tip')).toBeNull();
    expect(projectViewMountedMock).toHaveBeenCalledTimes(1);
    expect(projectViewUnmountedMock).not.toHaveBeenCalled();
  });
});
