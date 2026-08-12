// @vitest-environment jsdom
//
// The floating avatar + credits cluster must survive opening a project.
//
// The entry refresh moved the account module (avatar chip + credits pill)
// into a fixed top-right cluster owned by EntryNavRail — which unmounts with
// EntryShell the moment a project tab opens. Product: the avatar and credits
// stay visible on the project view too, in the same top-right spot. App.tsx
// therefore mounts `WorkspaceTopRightAccountCluster` (the self-wiring variant
// of `EntryTopRightCluster`) whenever `route.kind === 'project'`.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { Route } from '../../src/router';
import type { AppConfig, Project } from '../../src/types';
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

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => useRouteMock(),
}));

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
};

// One personal workspace, so `chooseWorkspaceForTab` selects it without any
// sessionStorage seeding, and the billing summary passes through unpartitioned.
const DIRECTORY_ITEM = {
  workspaceId: 'ws-1',
  workspaceMemberId: 'wm-1',
  workspaceName: 'Workspace One',
  workspaceType: 'personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
};

const WORKSPACE_CONTEXT = {
  ...DIRECTORY_ITEM,
  displayName: 'Nova',
  billingState: 'active',
  planId: 'pro',
  permissions: { canInviteMembers: false, canViewWorkspaceSettings: false },
};

const BILLING_RESPONSE = {
  summary: {
    workspaceId: 'ws-1',
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
    workspaceId: 'ws-1',
    workspaceMemberId: 'wm-1',
    balanceUsd: '12.34',
  },
};

function stubFetchByUrl() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = url.includes('/api/workspace/directory')
        ? { items: [DIRECTORY_ITEM] }
        : url.includes('/api/workspace/context')
          ? { context: WORKSPACE_CONTEXT }
          : url.includes('/api/workspace/billing')
            ? BILLING_RESPONSE
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
    render(<App />);

    // Both cluster members ride the portal on document.body; they appear once
    // the workspace context read resolves.
    const avatar = await screen.findByTestId('entry-nav-account');
    expect(avatar.closest('.entry-top-right-cluster')).not.toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('entry-top-right-credits')).toBeTruthy();
    });
    expect(
      screen.getByTestId('entry-top-right-credits').textContent,
    ).toContain('$12.34');
  });

  it('renders no cluster while signed out (context resolves to null)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    render(<App />);

    await screen.findByText('Project view');
    await waitFor(() => {
      expect(screen.queryByTestId('entry-nav-account')).toBeNull();
    });
  });
});
