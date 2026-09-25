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
import { AMR_LOGIN_STATUS_EVENT } from '../../src/components/amrLoginPolling';
import { fetchVelaLoginStatus } from '../../src/providers/daemon';
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
const projectViewLoginUpdateRequestMock = vi.hoisted(() => vi.fn());

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

vi.mock('../../src/providers/daemon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/daemon')>();
  return { ...actual, fetchVelaLoginStatus: vi.fn().mockResolvedValue(null) };
});

vi.mock('../../src/components/EntryView', () => ({
  EntryView: () => <div>Entry view</div>,
}));

vi.mock('../../src/components/CloudSignInTip', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/components/CloudSignInTip')>(),
  CloudSignInTip: ({ onLoginSuccess }: { onLoginSuccess?: () => void }) => (
    <button onClick={() => onLoginSuccess?.()}>Sign in to update</button>
  ),
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: ({ onObservedPublicShareLink, loginUpdateRequest }: { loginUpdateRequest?: unknown; onObservedPublicShareLink?: (share: { projectId: string; filePath: string; slug: string; url: string; status: 'active'; workspaceId: string; workspaceMemberId: string; authorizationScopeKey: string; freshness: 'outdated' }) => void }) => {
    projectViewLoginUpdateRequestMock(loginUpdateRequest ?? null);
    useEffect(() => {
      projectViewMountedMock();
      return () => projectViewUnmountedMock();
    }, []);
    return <div>Project view<button onClick={() => onObservedPublicShareLink?.({ projectId: 'project-1', filePath: 'index.html', slug: 'prior', url: 'https://example.invalid/p/prior', status: 'active', workspaceId: 'ws-project', workspaceMemberId: 'wm-project', authorizationScopeKey: 'workspace:ws-project:wm-project', freshness: 'outdated' })}>Observe active share</button></div>;
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

  it('keeps the credits pill — but not the account menu — mounted on an open project', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<App />);

    // The credits pill rides the shared chrome portal; it appears once the
    // workspace context read resolves.
    const credits = await screen.findByTestId('entry-top-right-credits');
    expect(credits.closest('.entry-top-right-cluster')).not.toBeNull();

    // The account module now lives at the bottom of the entry rail, and this
    // route has no rail — so it is deliberately absent rather than relocated.
    expect(screen.queryByTestId('entry-nav-account')).toBeNull();

    // Balance still comes from THIS route's workspace, not the shell's. Asserted
    // without a currency symbol: the pill leads with the plan wordmark and
    // renders the bare amount beside it.
    expect(
      screen.getByTestId('entry-top-right-credits').textContent,
    ).toContain('12.34');
    expect(screen.getByTestId('entry-top-right-credits').textContent).not.toContain('98.76');

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

  it('S13 retains only an observed active same-project link for copy when a bound route signs out', async () => {
    vi.mocked(fetchVelaLoginStatus).mockResolvedValue({
      loggedIn: true, profile: 'default', configPath: '', user: { id: 'account-1', email: 'owner@example.invalid' },
    });
    const view = render(<App />);
    expect(await screen.findByText('Project view')).toBeTruthy();
    await waitFor(() => expect(fetchVelaLoginStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Observe active share' }));

    vi.mocked(fetchVelaLoginStatus).mockResolvedValue({ loggedIn: false, profile: 'default', configPath: '', user: null });
    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: null, loading: false, failure: 'unavailable', retry: vi.fn(),
    });
    window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
    view.rerender(<App />);
    await waitFor(() => expect(screen.queryByText('Project view')).toBeNull());
    expect(screen.getByText('https://example.invalid/p/prior')).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy share link/i })).toBeEnabled();
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      fireEvent.click(screen.getByRole('button', { name: /copy share link/i }));
      await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('https://example.invalid/p/prior'));
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
    // Same-project explicit file route B must revoke A even with ProjectView unmounted.
    useRouteMock.mockReturnValue({ ...PROJECT_ROUTE, fileName: 'other.html' });
    view.rerender(<App />);
    await waitFor(() => expect(screen.queryByText('https://example.invalid/p/prior')).toBeNull());
    useRouteMock.mockReturnValue({ ...PROJECT_ROUTE, fileName: 'index.html' });
    view.rerender(<App />);
    expect(screen.queryByText('https://example.invalid/p/prior')).toBeNull();
    useRouteMock.mockReturnValue({ ...PROJECT_ROUTE, projectId: 'another-project' });
    view.rerender(<App />);
    expect(screen.queryByText('https://example.invalid/p/prior')).toBeNull();
  });

  it.each([
    ['same account', 'account-1', true, false],
    ['different account', 'account-2', false, false],
    ['same account after file B then A', 'account-1', false, true],
  ] as const)('S13 explicit sign-in-to-update resumes only for %s', async (_label, accountId, allowed, switchFile) => {
    vi.mocked(fetchVelaLoginStatus).mockResolvedValue({
      loggedIn: true, profile: 'default', configPath: '', user: { id: 'account-1', email: 'owner@example.invalid' },
    });
    const view = render(<App />);
    await screen.findByText('Project view');
    fireEvent.click(screen.getByRole('button', { name: 'Observe active share' }));
    vi.mocked(fetchVelaLoginStatus).mockResolvedValue({ loggedIn: false, profile: 'default', configPath: '', user: null });
    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: null, loading: false, failure: 'unavailable', retry: vi.fn(),
    });
    window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
    view.rerender(<App />);
    await screen.findByText('https://example.invalid/p/prior');
    expect(screen.getByRole('button', { name: /sign in to update/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /sign in to update/i }));
    if (switchFile) {
      useRouteMock.mockReturnValue({ ...PROJECT_ROUTE, fileName: 'other.html' });
      view.rerender(<App />);
      await waitFor(() => expect(screen.queryByText('https://example.invalid/p/prior')).toBeNull());
      useRouteMock.mockReturnValue({ ...PROJECT_ROUTE, fileName: 'index.html' });
      view.rerender(<App />);
    }
    vi.mocked(fetchVelaLoginStatus).mockResolvedValue({
      loggedIn: true, profile: 'default', configPath: '', user: { id: accountId, email: 'owner@example.invalid' },
    });
    useProjectRouteWorkspaceContextMock.mockReturnValue({
      context: PROJECT_WORKSPACE_CONTEXT, loading: false, retry: vi.fn(),
    });
    window.dispatchEvent(new Event(AMR_LOGIN_STATUS_EVENT));
    view.rerender(<App />);
    await screen.findByText('Project view');
    await waitFor(() => {
      const lastRequest = projectViewLoginUpdateRequestMock.mock.lastCall?.[0];
      if (allowed) expect(lastRequest).toEqual(expect.objectContaining({
        accountId: 'account-1', link: expect.objectContaining({ slug: 'prior', freshness: 'outdated' }),
      }));
      else expect(lastRequest).toBeNull();
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
