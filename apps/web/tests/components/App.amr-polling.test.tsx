// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import { navigate, type Route } from '../../src/router';
import type { AppConfig } from '../../src/types';
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
import * as workspaceContextModule from '../../src/collab/useWorkspaceContext';
import * as workspaceEventsModule from '../../src/collab/workspace-events';
import { resetWorkspaceContextCache, resetWorkspaceBillingCache } from '../../src/collab/useWorkspaceContext';
import { workspaceContextFixture } from '../helpers/workspace-context';

// Settings is now a full-page route (`/settings`): App.openSettings navigates
// instead of toggling a modal flag, so the router mock must feed navigate()
// calls back into useRoute() (like the production useSyncExternalStore router)
// for the settings surface to render at all.
const homeRouteMock = { kind: 'home' as const, view: 'home' as const };
const routeListeners = new Set<() => void>();
const useRouteMock = vi.fn<() => Route>(() => homeRouteMock);

vi.mock('../../src/router', async () => {
  const actual = await vi.importActual<typeof import('../../src/router')>('../../src/router');
  return {
    ...actual,
    navigate: vi.fn((route: unknown) => {
      useRouteMock.mockReturnValue(route as never);
      routeListeners.forEach((notify) => notify());
    }),
    useRoute: () =>
      useSyncExternalStore(
        (onChange) => {
          routeListeners.add(onChange);
          return () => routeListeners.delete(onChange);
        },
        useRouteMock,
      ),
  };
});

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    agents,
    config,
    onOpenSettings,
  }: {
    agents: Array<{ id: string; models?: Array<{ id: string; enabled?: boolean }>; authStatus?: string }>;
    config: AppConfig;
    onOpenSettings: () => void;
  }) => (
    <>
      <div data-testid="amr-model">
        {agents.find((agent) => agent.id === 'amr')?.models?.[0]?.id ?? 'none'}
      </div>
      <div data-testid="amr-model-enabled">
        {String(agents.find((agent) => agent.id === 'amr')?.models?.[0]?.enabled ?? false)}
      </div>
      <div data-testid="config-amr-model">
        {config.agentModels?.amr?.model ?? 'none'}
      </div>
      <div data-testid="amr-profile">
        {config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE ?? 'none'}
      </div>
      <div data-testid="codex-auth">
        {agents.find((agent) => agent.id === 'codex')?.authStatus ?? 'none'}
      </div>
      <button onClick={() => onOpenSettings()}>open settings</button>
    </>
  ),
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: ({ amrProfile }: { amrProfile?: string | null }) => <div data-testid="project-amr-profile">{amrProfile ?? 'none'}</div>,
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: ({
    initial,
    agents,
    onRefreshAgents,
    onAmrLoginStatusChange,
    onClose,
  }: {
    initial: AppConfig;
    agents: Array<{ id: string; models?: Array<{ id: string }> }>;
    onRefreshAgents: (options?: { agentCliEnv?: AppConfig['agentCliEnv'] }) => void | Promise<void>;
    onAmrLoginStatusChange?: (status: {
      loggedIn: boolean;
      loginInFlight?: boolean;
      profile: string;
      user: null;
      configPath: string;
    } | null) => void;
    onClose: () => void;
  }) => (
    <>
      <div data-testid="settings-amr-model">
        {agents.find((agent) => agent.id === 'amr')?.models?.[0]?.id ?? 'none'}
      </div>
      <button onClick={() => void onRefreshAgents({ agentCliEnv: initial.agentCliEnv ?? {} })}>
        rescan same environment
      </button>
      <button onClick={() => void onRefreshAgents()}>background agent probe</button>
      <button
        onClick={() =>
          void onRefreshAgents({
            agentCliEnv: {
              amr: { VELA_PROFILE: 'next-profile' },
            },
          })}
      >
        rescan agents
      </button>
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('od:amr-login-status-change'));
          onAmrLoginStatusChange?.({
            loggedIn: true,
            profile: 'default',
            user: null,
            configPath: '/tmp/amr-config.json',
          });
        }}
      >
        mark amr signed in
      </button>
      <button onClick={onClose}>close settings</button>
    </>
  ),
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
    fetchMediaProvidersFromDaemon: vi.fn().mockResolvedValue({
      status: 'ok',
      providers: null,
    }),
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
const mockedNavigate = vi.mocked(navigate);

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function advanceTestClock(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('App AMR polling', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    useRouteMock.mockReturnValue(homeRouteMock);
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([
      {
        id: 'amr',
        name: 'AMR',
        bin: 'vela',
        available: true,
        version: '1.0.0',
        models: [],
      },
    ]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedFetchVelaLoginStatus.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedFetchDaemonConfig.mockResolvedValue({});
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockResolvedValueOnce({
        source: 'preset',
        refreshing: true,
        models: [{ id: 'preset-a', label: 'preset-a' }],
      })
      .mockResolvedValueOnce({
        source: 'preset',
        refreshing: true,
        models: [{ id: 'preset-a', label: 'preset-a' }],
      })
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'remote-a', label: 'remote-a' }],
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        // These existing polling cases exercise the supported legacy default
        // catalog, without a workspace-capable daemon. Scoped cases below
        // supply their context provider explicitly.
        ok: !url.startsWith('/api/workspace'),
        status: url.startsWith('/api/workspace') ? 404 : 200,
        json: async () => ({}),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('refreshes catalog entitlements for the selected A to B to A workspace principal', async () => {
    const a = workspaceContextFixture({ workspaceId: 'free-a', workspaceMemberId: 'member-a' });
    const b = workspaceContextFixture({ workspaceId: 'go-b', workspaceMemberId: 'member-b' });
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockResolvedValueOnce({ source: 'remote', refreshing: false, models: [{ id: 'free-a-flash', label: 'Flash', enabled: true }] })
      .mockResolvedValueOnce({ source: 'remote', refreshing: false, models: [{ id: 'go-b-pro', label: 'Pro', enabled: true }] })
      .mockResolvedValueOnce({ source: 'remote', refreshing: false, models: [{ id: 'free-a-flash', label: 'Flash', enabled: true }] });
    let selected = a;
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockImplementation(() => ({ context: selected, loading: false }));
    const view = render(<App />);
    await waitFor(() => expect(screen.getByTestId('amr-model').textContent).toBe('free-a-flash'));
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(a);

    selected = b;
    view.rerender(<App />);
    await waitFor(() => expect(screen.getByTestId('amr-model').textContent).toBe('go-b-pro'));
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(b);

    selected = a;
    view.rerender(<App />);
    await waitFor(() => expect(screen.getByTestId('amr-model').textContent).toBe('free-a-flash'));
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(a);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);
  });

  it('refreshes the same workspace model catalog when its authoritative billing snapshot upgrades', async () => {
    mockedLoadConfig.mockReturnValue({ ...baseConfig, mode: 'daemon', agentId: 'amr' });
    let subscriptionChanged: workspaceEventsModule.WorkspaceInvalidationHandlers['billing-subscription-changed'];
    vi.spyOn(workspaceEventsModule, 'useWorkspaceInvalidation').mockImplementation((handlers) => {
      if (handlers['billing-subscription-changed']) subscriptionChanged = handlers['billing-subscription-changed'];
      return { connected: false } as ReturnType<typeof workspaceEventsModule.useWorkspaceInvalidation>;
    });
    const selected = workspaceContextFixture({
      workspaceId: 'paid-a', workspaceMemberId: 'member-a', planId: null,
    });
    let planId = 'free';
    let balanceUsd = '0.00';
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockImplementation(() => ({ context: selected, loading: false }));
    vi.spyOn(workspaceContextModule, 'useWorkspaceBillingResponse').mockImplementation(() => ({
      workspaceSnapshot: {
        billingScopeVersion: 2,
        workspaceId: selected.workspaceId,
        workspaceMemberId: selected.workspaceMemberId,
        billing: { billingState: 'active', planId },
        wallet: { balanceUsd, expiresAt: null, updatedAt: null },
      },
    }) as ReturnType<typeof workspaceContextModule.useWorkspaceBillingResponse>);
    mockedFetchAmrModels.mockReset()
      .mockResolvedValueOnce({ source: 'remote', refreshing: false, models: [{ id: 'paid-model', label: 'Paid', enabled: false }] })
      .mockResolvedValueOnce({ source: 'preset', refreshing: true, models: [{ id: 'seed', label: 'Seed' }] })
      .mockResolvedValueOnce({ source: 'remote', refreshing: false, models: [{ id: 'paid-model', label: 'Paid', enabled: true }] })
      .mockResolvedValueOnce({ source: 'preset', refreshing: false, remoteError: 'remote unavailable', models: [{ id: 'seed', label: 'Seed' }] })
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ source: 'preset', refreshing: false, remoteError: 'remote unavailable', models: [] });

    const view = render(<App />);
    await waitFor(() => expect(screen.getByTestId('amr-model').textContent).toBe('paid-model'));
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('amr-model-enabled').textContent).toBe('false');

    vi.useFakeTimers();
    balanceUsd = '5.00';
    await act(async () => { view.rerender(<App />); });
    await advanceTestClock(300);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);

    planId = 'pro';
    await act(async () => { view.rerender(<App />); });
    await advanceTestClock(250);
    expect(mockedFetchAmrModels).toHaveBeenCalledWith(selected, { refresh: true });
    expect(screen.getByTestId('amr-model').textContent).toBe('paid-model');
    expect(screen.getByTestId('amr-model-enabled').textContent).toBe('false');
    await advanceTestClock(1_000);
    expect(screen.getByTestId('amr-model-enabled').textContent).toBe('true');
    balanceUsd = '10.00';
    await act(async () => { view.rerender(<App />); });
    await advanceTestClock(300);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);

    // A new subscription revision may change access without changing planId.
    // Duplicate transport frames for that revision must still cause one read.
    await act(async () => {
      subscriptionChanged?.({ type: 'billing-subscription-changed', workspaceId: selected.workspaceId, revision: 'billing-1' });
      subscriptionChanged?.({ type: 'billing-subscription-changed', workspaceId: selected.workspaceId, revision: 'billing-1' });
    });
    await advanceTestClock(250);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(4);
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(selected, { refresh: true });
    expect(screen.getByTestId('amr-model').textContent).toBe('paid-model');
    expect(screen.getByTestId('amr-model-enabled').textContent).toBe('true');
    await advanceTestClock(3_000);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(4);

    await act(async () => {
      subscriptionChanged?.({ type: 'billing-subscription-changed', workspaceId: selected.workspaceId, revision: 'billing-2' });
    });
    await advanceTestClock(250);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(5);
    expect(screen.getByTestId('amr-model').textContent).toBe('paid-model');
    await advanceTestClock(3_000);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(6);
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(selected);
    expect(screen.getByTestId('amr-model').textContent).toBe('paid-model');
  });

  it('follows an existing remote catalog while it refreshes in the background', async () => {
    vi.useFakeTimers();
    mockedFetchAmrModels.mockReset()
      .mockResolvedValueOnce({ source: 'remote', refreshing: true, models: [{ id: 'old-model', label: 'Old', enabled: false }] })
      .mockResolvedValueOnce({ source: 'remote', refreshing: true, models: [{ id: 'old-model', label: 'Old', enabled: false }] })
      .mockResolvedValueOnce({ source: 'remote', refreshing: false, models: [{ id: 'new-model', label: 'New', enabled: true }] });

    render(<App />);
    await advanceTestClock(0);
    expect(screen.getByTestId('amr-model').textContent).toBe('old-model');
    await advanceTestClock(1_000);
    expect(screen.getByTestId('amr-model').textContent).toBe('old-model');
    await advanceTestClock(1_000);
    expect(screen.getByTestId('amr-model').textContent).toBe('new-model');
    await advanceTestClock(3_000);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);
  });

  it('follows an empty preset while the remote catalog is still loading', async () => {
    vi.useFakeTimers();
    mockedFetchAmrModels.mockReset()
      .mockResolvedValueOnce({ source: 'preset', refreshing: true, models: [] })
      .mockResolvedValueOnce({ source: 'remote', refreshing: false, models: [{ id: 'new-model', label: 'New', enabled: true }] });

    render(<App />);
    await advanceTestClock(0);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    await advanceTestClock(1_000);
    expect(screen.getByTestId('amr-model').textContent).toBe('new-model');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
  });

  it('does not borrow an unscoped agent catalog or a late prior-workspace catalog', async () => {
    const a = workspaceContextFixture({ workspaceId: 'free-a', workspaceMemberId: 'member-a' });
    const b = workspaceContextFixture({ workspaceId: 'go-b', workspaceMemberId: 'member-b' });
    const lateA = deferred<Awaited<ReturnType<typeof fetchAmrModels>>>();
    const pendingB = deferred<Awaited<ReturnType<typeof fetchAmrModels>>>();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockReturnValueOnce(lateA.promise).mockReturnValueOnce(pendingB.promise);
    mockedFetchAgentsStream.mockResolvedValue([{
      id: 'amr', name: 'AMR', bin: 'vela', available: true, version: '1.0.0',
      models: [{ id: 'ambient-pro', label: 'Ambient Pro', enabled: true }],
    }]);
    let selected = a;
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockImplementation(() => ({ context: selected, loading: false }));
    const view = render(<App />);
    await waitFor(() => expect(mockedFetchAgentsStream).toHaveBeenCalled());
    expect(screen.getByTestId('amr-model').textContent).toBe('none');

    selected = b;
    view.rerender(<App />);
    await waitFor(() => expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2));
    await act(async () => { lateA.resolve({ source: 'remote', refreshing: false, models: [{ id: 'late-a-pro', label: 'A Pro', enabled: true }] }); });
    expect(screen.getByTestId('amr-model').textContent).toBe('none');
    await act(async () => { pendingB.resolve({ source: 'remote', refreshing: false, models: [{ id: 'b-pro', label: 'B Pro', enabled: true }] }); });
    expect(screen.getByTestId('amr-model').textContent).toBe('b-pro');
  });

  it('keeps polling AMR models until the remote catalog replaces the preset list', async () => {
    vi.useFakeTimers();
    render(<App />);

    await advanceTestClock(0);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);

    await advanceTestClock(1_999);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    await advanceTestClock(1);

    expect(screen.getByTestId('amr-model').textContent).toBe('remote-a');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);
  });

  it('refreshes AMR status and model catalog when returning from an external upgrade flow', async () => {
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'locked-model', label: 'locked-model', enabled: false }],
      })
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'unlocked-model', label: 'unlocked-model', enabled: true }],
      });
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: null,
      configPath: '/tmp/amr-config.json',
      account: { plan: 'pro' },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('locked-model');
    });

    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(mockedFetchVelaLoginStatus).toHaveBeenCalledWith({ refresh: true });
    });
    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('unlocked-model');
    });
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
  });

  it('hands the authenticated daemon profile to a project when Settings has no override', async () => {
    const project = { id: 'profile-project', name: 'Profile project', skillId: null,
      designSystemId: null, customInstructions: '', createdAt: 1, updatedAt: 1 };
    useRouteMock.mockReturnValue({ kind: 'project', projectId: project.id, conversationId: null, fileName: null });
    mockedListProjects.mockResolvedValue([project]);
    mockedLoadConfig.mockReturnValue({ ...baseConfig, mode: 'daemon', agentId: 'amr', agentCliEnv: {} });
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true, loginInFlight: false, profile: 'local',
      sessionState: 'authenticated', user: { id: 'profile-user', email: 'profile@example.test' },
      configPath: '/isolated/amr/config.json',
    });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('project-amr-profile').textContent).toBe('local'));
  });

  it('returns every authenticated surface to onboarding when Cloud auth definitively expires', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      mode: 'daemon',
      agentId: 'amr',
    });
    useRouteMock.mockReturnValue({
      kind: 'project',
      projectId: 'project-with-expired-auth',
      conversationId: null,
      fileName: null,
    });
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      loginInFlight: false,
      profile: 'local',
      user: { id: 'expired-user', email: 'expired@example.com' },
      configPath: '/tmp/amr-config.json',
      sessionState: 'reauth_required',
      credentialRevision: 'expired-revision',
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith(
        { kind: 'home', view: 'onboarding' },
        { replace: true },
      );
    });
  });

  it('starts AMR preset polling before the agent probe resolves', { timeout: 10_000 }, async () => {
    let resolveAgents!: (value: Array<{
      id: string;
      name: string;
      bin: string;
      available: boolean;
      version: string;
      models: Array<{ id: string; label: string }>;
    }>) => void;
    mockedFetchAgentsStream.mockReturnValue(
      new Promise((resolve) => {
        resolveAgents = resolve;
      }),
    );
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'preset',
      refreshing: true,
      models: [{ id: 'preset-a', label: 'preset-a' }],
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    });
    resolveAgents([
      {
        id: 'amr',
        name: 'AMR',
        bin: 'vela',
        available: true,
        version: '1.0.0',
        models: [],
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');
    });
  });

  it('rescans agents on window focus so external CLI auth changes are detected', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'preset',
      refreshing: false,
      models: [{ id: 'preset-a', label: 'preset-a' }],
    });
    mockedFetchAgentsStream
      .mockResolvedValueOnce([
        {
          id: 'codex',
          name: 'Codex CLI',
          bin: 'codex',
          available: true,
          version: 'codex-cli 9.9.9',
          authStatus: 'missing',
          models: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'codex',
          name: 'Codex CLI',
          bin: 'codex',
          available: true,
          version: 'codex-cli 9.9.9',
          authStatus: 'ok',
          models: [],
        },
      ]);

    try {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('codex-auth').textContent).toBe('missing');
      });

      fireEvent(window, new Event('focus'));
      expect(mockedFetchAgentsStream).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        nowSpy.mockReturnValue(10_001);
        fireEvent(window, new Event('focus'));
        expect(mockedFetchAgentsStream).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(screen.getByTestId('codex-auth').textContent).toBe('ok');
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('restarts AMR polling after sign-in when preset refresh previously stopped on a remote error', async () => {
    vi.useFakeTimers();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockResolvedValueOnce({
        source: 'preset',
        refreshing: true,
        models: [{ id: 'preset-a', label: 'preset-a' }],
      })
      .mockResolvedValueOnce({
        source: 'preset',
        refreshing: true,
        remoteError: 'remote unavailable',
        models: [{ id: 'preset-a', label: 'preset-a' }],
      })
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'remote-a', label: 'remote-a' }],
      });

    render(<App />);

    await advanceTestClock(0);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');

    await advanceTestClock(1_000);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');

    await advanceTestClock(1_500);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      profile: 'default',
      user: null,
      configPath: '/tmp/amr-config.json',
    });

    fireEvent.click(screen.getByText('open settings'));
    expect(screen.getByText('mark amr signed in')).toBeTruthy();
    fireEvent.click(screen.getByText('mark amr signed in'));
    await advanceTestClock(0);

    // Settings is a full-page route now; return home so the EntryView
    // mock (which renders the amr-model probe) is mounted again.
    fireEvent.click(screen.getByText('close settings'));
    await advanceTestClock(0);

    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('amr-model').textContent).toBe('remote-a');
  });

  it('does not restart AMR model polling for repeated signed-in status snapshots', async () => {
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'remote-a', label: 'remote-a' }],
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('open settings'));
    await waitFor(() => {
      expect(screen.getByText('mark amr signed in')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('mark amr signed in'));
    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByText('mark amr signed in'));
    fireEvent.click(screen.getByText('mark amr signed in'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
  });

  it('bounds local catalog follow-up while a slow remote refresh never arrives', async () => {
    vi.useFakeTimers();
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockImplementation(async () => ({
      source: 'preset',
      refreshing: true,
      models: [{ id: 'preset-a', label: 'preset-a' }],
    }));

    render(<App />);

    await advanceTestClock(0);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    await advanceTestClock(10_000);

    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(11);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');

    await advanceTestClock(1_500);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(11);
    await advanceTestClock(22_500);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(23);
    await advanceTestClock(4_000);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(23);
  });

  it('keeps the verified workspace model catalog during a same environment rescan', async () => {
    const selected = workspaceContextFixture({ workspaceId: 'paid-a', workspaceMemberId: 'member-a' });
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockReturnValue({ context: selected, loading: false });
    mockedFetchAmrModels.mockReset().mockResolvedValue({
      source: 'remote', refreshing: false,
      models: [{ id: 'scoped-model', label: 'Scoped model' }],
    });
    mockedFetchAgentsStream.mockResolvedValue([{
      id: 'amr', name: 'AMR', bin: 'vela', available: true, version: '1.0.0',
      models: [{ id: 'ambient-model', label: 'Ambient model' }],
    }]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('amr-model').textContent).toBe('scoped-model'));
    fireEvent.click(screen.getByText('open settings'));
    await act(async () => { fireEvent.click(screen.getByText('rescan same environment')); });

    expect(screen.getByTestId('settings-amr-model').textContent).toBe('scoped-model');
    expect(mockedFetchAgentsStream).toHaveBeenCalledTimes(2);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
  });

  it('recovers a failed scoped model read without another login or workspace change', async () => {
    vi.useFakeTimers();
    const selected = workspaceContextFixture({ workspaceId: 'paid-a', workspaceMemberId: 'member-a' });
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockReturnValue({ context: selected, loading: false });
    mockedFetchAmrModels.mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        source: 'remote', refreshing: false,
        models: [{ id: 'recovered-model', label: 'Recovered model' }],
      });
    await act(async () => { render(<App />); });
    expect(screen.getByTestId('amr-model').textContent).toBe('none');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    await advanceTestClock(1_000);
    expect(screen.getByTestId('amr-model').textContent).toBe('recovered-model');
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(selected);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
  });

  it('refreshes a stopped scoped catalog once before polling after a user rescan', async () => {
    vi.useFakeTimers();
    const selected = workspaceContextFixture({ workspaceId: 'paid-a', workspaceMemberId: 'member-a' });
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockReturnValue({ context: selected, loading: false });
    let refreshed = false;
    mockedFetchAmrModels.mockReset().mockImplementation(async (_context, options) => {
      if (options?.refresh) {
        refreshed = true;
        return { source: 'preset', refreshing: true, models: [] };
      }
      if (refreshed) {
        return {
          source: 'remote', refreshing: false,
          models: [{ id: 'recovered-model', label: 'Recovered model' }],
        };
      }
      // An ordinary cache get can start a new background refresh while still
      // exposing the prior error. Only explicit invalidation clears that error.
      return { source: 'preset', refreshing: true, remoteError: 'previous remote failure', models: [] };
    });
    await act(async () => { render(<App />); });
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('open settings'));
    for (let probe = 0; probe < 4; probe += 1) {
      await act(async () => { fireEvent.click(screen.getByText('background agent probe')); });
    }
    await advanceTestClock(1_000);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByText('rescan same environment')); });
    await advanceTestClock(250);
    expect(screen.getByTestId('settings-amr-model').textContent).toBe('none');
    await advanceTestClock(1_000);
    expect(screen.getByTestId('settings-amr-model').textContent).toBe('recovered-model');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);
    expect(mockedFetchAmrModels).toHaveBeenNthCalledWith(2, selected, { refresh: true });
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(selected);
    expect(mockedFetchAmrModels.mock.calls.filter(([, options]) => options?.refresh)).toHaveLength(1);
  });

  it('clears the old scoped catalog and reads the new AMR environment after a rescan', async () => {
    const selected = workspaceContextFixture({ workspaceId: 'paid-a', workspaceMemberId: 'member-a' });
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockReturnValue({ context: selected, loading: false });
    const nextCatalog = deferred<Awaited<ReturnType<typeof fetchAmrModels>>>();
    mockedFetchAmrModels.mockReset()
      .mockResolvedValueOnce({
        source: 'remote', refreshing: false,
        models: [{ id: 'old-scoped-model', label: 'Old scoped model' }],
      })
      .mockReturnValueOnce(nextCatalog.promise);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('amr-model').textContent).toBe('old-scoped-model'));
    fireEvent.click(screen.getByText('open settings'));
    await act(async () => { fireEvent.click(screen.getByText('rescan agents')); });

    expect(screen.getByTestId('settings-amr-model').textContent).toBe('none');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(selected);
    await act(async () => {
      nextCatalog.resolve({
        source: 'remote', refreshing: false,
        models: [{ id: 'new-scoped-model', label: 'New scoped model' }],
      });
    });
    expect(screen.getByTestId('settings-amr-model').textContent).toBe('new-scoped-model');
  });

  it('cancels a failed model read retry when the workspace principal changes', async () => {
    vi.useFakeTimers();
    const a = workspaceContextFixture({ workspaceId: 'paid-a', workspaceMemberId: 'member-a' });
    const b = workspaceContextFixture({ workspaceId: 'paid-b', workspaceMemberId: 'member-b' });
    let selected = a;
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockImplementation(() => ({ context: selected, loading: false }));
    mockedFetchAmrModels.mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ source: 'remote', refreshing: false, models: [{ id: 'b-model', label: 'B model' }] });
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<App />); });
    selected = b;
    await act(async () => { view.rerender(<App />); });
    await advanceTestClock(1_000);
    expect(screen.getByTestId('amr-model').textContent).toBe('b-model');
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    expect(mockedFetchAmrModels).toHaveBeenLastCalledWith(b);
  });

  it('bounds retries when scoped model reads keep failing', async () => {
    vi.useFakeTimers();
    const selected = workspaceContextFixture({ workspaceId: 'paid-a', workspaceMemberId: 'member-a' });
    vi.spyOn(workspaceContextModule, 'useWorkspaceContext').mockReturnValue({ context: selected, loading: false });
    mockedFetchAmrModels.mockReset().mockResolvedValue(null);
    await act(async () => { render(<App />); });
    await advanceTestClock(38_000);
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(23);
    expect(screen.getByTestId('amr-model').textContent).toBe('none');
  });

  it('does not merge stale AMR remote models over a rescan with new agent env', async () => {
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockResolvedValue({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'old-remote', label: 'old-remote' }],
    });
    mockedFetchAgentsStream
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [{ id: 'new-probe', label: 'new-probe' }],
        },
      ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('old-remote');
    });

    fireEvent.click(screen.getByText('open settings'));

    await waitFor(() => {
      expect(screen.getByText('rescan agents')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('rescan agents'));

    // Settings is a full-page route now; return home so the EntryView
    // mock (which renders the amr-model probe) is mounted again.
    fireEvent.click(screen.getByText('close settings'));

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('new-probe');
    });
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
  });

  it('refreshes renderer config and clears stale AMR models after a desktop app-config change event', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      agentModels: { amr: { model: 'old-remote', reasoning: 'default' } },
      agentCliEnv: {
        amr: { OPEN_DESIGN_AMR_PROFILE: 'prod' },
      },
    });
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'old-remote', label: 'old-remote' }],
      })
      .mockResolvedValueOnce({
        source: 'remote',
        refreshing: false,
        models: [{ id: 'local-remote', label: 'local-remote' }],
      });
    mockedFetchDaemonConfig
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        agentCliEnv: {
          amr: { OPEN_DESIGN_AMR_PROFILE: 'local' },
        },
      });
    mockedMergeDaemonConfig.mockImplementation((local, daemon) => ({
      ...local,
      agentCliEnv: daemon?.agentCliEnv ?? local.agentCliEnv,
    }));
    mockedFetchAgentsStream
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [{ id: 'local-probe', label: 'local-probe' }],
        },
      ]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('old-remote');
    });
    await waitFor(() => {
      expect(screen.getByTestId('config-amr-model').textContent).toBe('old-remote');
    });
    await waitFor(() => {
      expect(screen.getByTestId('amr-profile').textContent).toBe('prod');
    });

    const fetchMock = vi.mocked(globalThis.fetch);
    const workspaceDirectoryReadsBefore = fetchMock.mock.calls.filter(([input]) =>
      input.toString().includes('/api/workspace/directory')).length;

    fireEvent(window, new CustomEvent('open-design:app-config-changed'));

    await waitFor(() => {
      expect(screen.getByTestId('amr-profile').textContent).toBe('local');
    });
    await waitFor(() => {
      expect(screen.getByTestId('config-amr-model').textContent).toBe('none');
    });
    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('local-remote');
    });
    await waitFor(() => {
      expect(mockedFetchAgentsStream).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) =>
        input.toString().includes('/api/workspace/directory')).length,
      ).toBeGreaterThan(workspaceDirectoryReadsBefore);
    });
    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
  });

  it('ignores stale in-flight AMR model polls after a desktop app-config change restarts polling', async () => {
    const oldRemotePoll = deferred<Awaited<ReturnType<typeof fetchAmrModels>>>();
    const localRemotePoll = deferred<Awaited<ReturnType<typeof fetchAmrModels>>>();
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      agentCliEnv: {
        amr: { OPEN_DESIGN_AMR_PROFILE: 'prod' },
      },
    });
    mockedFetchDaemonConfig
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        agentCliEnv: {
          amr: { OPEN_DESIGN_AMR_PROFILE: 'local' },
        },
      });
    mockedMergeDaemonConfig.mockImplementation((local, daemon) => ({
      ...local,
      agentCliEnv: daemon?.agentCliEnv ?? local.agentCliEnv,
    }));
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels
      .mockReturnValueOnce(oldRemotePoll.promise)
      .mockReturnValueOnce(localRemotePoll.promise);
    mockedFetchAgentsStream
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'amr',
          name: 'AMR',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: [{ id: 'local-probe', label: 'local-probe' }],
        },
      ]);

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    });

    fireEvent(window, new CustomEvent('open-design:app-config-changed'));

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    });

    localRemotePoll.resolve({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'local-remote', label: 'local-remote' }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('amr-profile').textContent).toBe('local');
    });
    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('local-remote');
    });

    oldRemotePoll.resolve({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'old-remote', label: 'old-remote' }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('local-remote');
    });
  });
});
