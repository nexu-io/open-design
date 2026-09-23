// @vitest-environment jsdom
//
// Acceptance #11 — "the onboarding page shows up on every login (it used to
// show once)". Two halves, both regressions of the same invariant:
//
//   1. Onboarding completion is a one-way ratchet. The boot merge folds the
//      daemon's `/api/app-config` copy over the local one; a daemon copy that
//      predates the completion (async PUT still in flight, or one that failed)
//      must not roll it back. The merged config is written straight back to
//      BOTH stores, so a single rollback is self-reinforcing — the user meets
//      onboarding on every launch from then on.
//   2. First-run routing is a boot decision. The bootstrap effect became
//      route-dependent on the workspace-team branch (`workspaceProjectView` is
//      derived from the route), so it re-runs — and re-decides the first-run
//      redirect — on ordinary navigation.

import { cleanup, act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App, resetExecutionConfigAfterSignOut } from '../../src/App';
import type { AppConfig } from '../../src/types';
import { loadConfig, fetchDaemonConfig, syncConfigToDaemon } from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { fetchAmrModels } from '../../src/providers/daemon';
import { listProjects, listTemplates } from '../../src/state/projects';

type TestRoute = Record<string, unknown>;

const routerState = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    current: { kind: 'home', view: 'home' } as TestRoute,
    listeners,
    set(route: TestRoute) {
      routerState.current = route;
      listeners.forEach((listen) => listen());
    },
  };
});

const entryViewCapture = vi.hoisted(() => ({
  firstAgentChange: null as null | ((agentId: string) => void),
  firstCompleteOnboarding: null as null | (() => void),
  firstRefreshAgents: null as null | ((
    options?: { throwOnError?: boolean; agentCliEnv?: AppConfig['agentCliEnv'] },
  ) => unknown),
  activeSignOut: null as null | (() => void | Promise<void>),
}));

const settingsCapture = vi.hoisted(() => ({
  resetOnboarding: null as null | ((next: AppConfig) => void),
}));

vi.mock('../../src/router', async () => {
  const React = await import('react');
  return {
    navigate: vi.fn((route: TestRoute) => routerState.set(route)),
    goBack: vi.fn(),
    useRoute: () => {
      const [, force] = React.useReducer((count: number) => count + 1, 0);
      React.useEffect(() => {
        routerState.listeners.add(force);
        return () => {
          routerState.listeners.delete(force);
        };
      }, [force]);
      return routerState.current;
    },
  };
});

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    config,
    onAgentChange,
    onCompleteOnboarding,
    onRefreshAgents,
    onSignedOut,
  }: {
    config: AppConfig;
    onAgentChange: (agentId: string) => void;
    onCompleteOnboarding: () => void;
    onRefreshAgents: (
      options?: { throwOnError?: boolean; agentCliEnv?: AppConfig['agentCliEnv'] },
    ) => unknown;
    onSignedOut: () => void | Promise<void>;
  }) => {
    entryViewCapture.firstAgentChange ??= onAgentChange;
    entryViewCapture.firstCompleteOnboarding ??= onCompleteOnboarding;
    entryViewCapture.firstRefreshAgents ??= onRefreshAgents;
    entryViewCapture.activeSignOut = onSignedOut;
    return (
      <>
        <div data-testid="onboarding-completed">{String(config.onboardingCompleted)}</div>
        <div data-testid="agent-id">{String(config.agentId ?? 'none')}</div>
        <div data-testid="api-key">{config.apiKey}</div>
        <div data-testid="api-model">{config.model}</div>
      </>
    );
  },
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
  SettingsDialog: ({
    initial,
    onResetOnboarding,
  }: {
    initial: AppConfig;
    onResetOnboarding: (next: AppConfig) => void;
  }) => {
    settingsCapture.resetOnboarding = onResetOnboarding;
    return (
      <div data-testid="settings-onboarding-completed">
        {String(initial.onboardingCompleted)}
      </div>
    );
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
    // Real merge: the ratchet under test lives inside it.
    saveConfig: vi.fn(),
    fetchDaemonConfig: vi.fn(),
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
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedFetchDaemonConfig = vi.mocked(fetchDaemonConfig);
const mockedSyncConfigToDaemon = vi.mocked(syncConfigToDaemon);

function returningUserConfig(): AppConfig {
  return {
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
    // The user already finished the first-run flow on this install.
    onboardingCompleted: true,
    mediaProviders: {},
    composio: {},
    agentModels: {},
    agentCliEnv: {},
  } as AppConfig;
}

function firstRunConfig(): AppConfig {
  return {
    ...returningUserConfig(),
    onboardingCompleted: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function navigatedToOnboarding(): Promise<boolean> {
  const { navigate } = await import('../../src/router');
  return vi
    .mocked(navigate)
    .mock.calls.some(
      ([route]) =>
        (route as { kind?: string; view?: string } | undefined)?.kind === 'home' &&
        (route as { kind?: string; view?: string } | undefined)?.view === 'onboarding',
    );
}

describe('App onboarding completion persistence', () => {
  beforeEach(() => {
    routerState.current = { kind: 'home', view: 'home' };
    entryViewCapture.firstAgentChange = null;
    entryViewCapture.firstCompleteOnboarding = null;
    entryViewCapture.firstRefreshAgents = null;
    entryViewCapture.activeSignOut = null;
    settingsCapture.resetOnboarding = null;
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedFetchAmrModels.mockResolvedValue({
      source: 'preset',
      refreshing: false,
      models: [],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('preserves local BYOK configuration across an active Cloud sign-out', () => {
    const current = {
      ...returningUserConfig(),
      mode: 'api',
      apiKey: 'secret',
      apiProtocol: 'openai',
      apiVersion: '2026-01-01',
      baseUrl: 'https://example.com/v1',
      model: 'private-model',
      apiProviderBaseUrl: 'https://example.com/v1',
      apiProtocolConfigs: {
        openai: {
          apiKey: 'secret',
          baseUrl: 'https://example.com/v1',
          model: 'private-model',
        },
      },
      byokImageModel: 'private-image-model',
      byokVideoModel: 'private-video-model',
      byokSpeechModel: 'private-speech-model',
      byokSpeechVoice: 'private-voice',
      byokProviderConfigDrafts: {
        'openai:https://example.com/v1': {
          apiConfig: {
            apiKey: 'draft-secret',
            baseUrl: 'https://example.com/v1',
            model: 'draft-model',
          },
          maxTokens: 8192,
        },
      },
      byokPendingProviderKey: 'openai:https://example.com/v1',
      maxTokens: 12345,
      agentId: 'claude-code',
      agentModels: { 'claude-code': { model: 'sonnet' } },
      agentCliEnv: { 'claude-code': { TOKEN: 'secret' } },
      agentCliEnvIntent: { 'claude-code': { TOKEN: 'set' } },
      designSystemId: 'keep-design-system',
      telemetry: { metrics: false, content: false },
    } as AppConfig;

    expect(resetExecutionConfigAfterSignOut(current)).toMatchObject({
      onboardingCompleted: false,
      mode: 'daemon',
      agentId: null,
      agentModels: {},
      agentCliEnv: {},
      agentCliEnvIntent: {},
      apiKey: 'secret',
      apiProtocol: 'openai',
      apiVersion: '2026-01-01',
      baseUrl: 'https://example.com/v1',
      model: 'private-model',
      apiProviderBaseUrl: 'https://example.com/v1',
      apiProtocolConfigs: {
        openai: {
          apiKey: 'secret',
          baseUrl: 'https://example.com/v1',
          model: 'private-model',
        },
      },
      byokImageModel: 'private-image-model',
      byokVideoModel: 'private-video-model',
      byokSpeechModel: 'private-speech-model',
      byokSpeechVoice: 'private-voice',
      byokProviderConfigDrafts: {
        'openai:https://example.com/v1': {
          apiConfig: {
            apiKey: 'draft-secret',
            baseUrl: 'https://example.com/v1',
            model: 'draft-model',
          },
          maxTokens: 8192,
        },
      },
      byokPendingProviderKey: 'openai:https://example.com/v1',
      maxTokens: 12345,
      designSystemId: 'keep-design-system',
      telemetry: { metrics: false, content: false },
    });
  });

  it('persists the Cloud reset without discarding BYOK and returns to onboarding', async () => {
    mockedLoadConfig.mockReturnValue({
      ...returningUserConfig(),
      mode: 'api',
      apiKey: 'persisted-key',
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      apiProtocolConfigs: {
        openai: {
          apiKey: 'persisted-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-5',
        },
      },
    });
    mockedFetchDaemonConfig.mockResolvedValue({ onboardingCompleted: true });

    render(<App />);

    await waitFor(() => {
      expect(entryViewCapture.activeSignOut).toEqual(expect.any(Function));
    });
    await act(async () => {
      await entryViewCapture.activeSignOut?.();
    });

    expect(screen.getByTestId('onboarding-completed').textContent).toBe('false');
    expect(screen.getByTestId('agent-id').textContent).toBe('none');
    expect(screen.getByTestId('api-key').textContent).toBe('persisted-key');
    expect(screen.getByTestId('api-model').textContent).toBe('gpt-5');
    expect(mockedSyncConfigToDaemon).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onboardingCompleted: false,
        mode: 'daemon',
        agentId: null,
        apiKey: 'persisted-key',
        model: 'gpt-5',
        agentModels: {},
        apiProtocolConfigs: {
          openai: {
            apiKey: 'persisted-key',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-5',
          },
        },
      }),
      { allowOnboardingReset: true },
    );
    expect(await navigatedToOnboarding()).toBe(true);
  });

  it('keeps a completed user out of onboarding when the daemon copy still says false', async () => {
    mockedLoadConfig.mockReturnValue(returningUserConfig());
    // The completion PUT never reached the daemon last session (offline /
    // crash / a write that lost the race), so its copy still reads false.
    mockedFetchDaemonConfig.mockResolvedValue({ onboardingCompleted: false });

    render(<App />);

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalled();
    });

    expect(await navigatedToOnboarding()).toBe(false);
    expect(screen.getByTestId('onboarding-completed').textContent).toBe('true');
    // And the rollback must not be written back — persisting it is what makes
    // the symptom recur on every subsequent launch.
    const wroteRollback = mockedSyncConfigToDaemon.mock.calls.some(
      ([cfg]) => (cfg as AppConfig | undefined)?.onboardingCompleted === false,
    );
    expect(wroteRollback).toBe(false);
  });

  it('only sends onboarding false through the explicit reset channel', async () => {
    const actualConfig = await vi.importActual<typeof import('../../src/state/config')>(
      '../../src/state/config',
    );
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await actualConfig.syncConfigToDaemon(firstRunConfig());
    await actualConfig.syncConfigToDaemon(returningUserConfig());
    await actualConfig.syncConfigToDaemon(
      firstRunConfig(),
      { allowOnboardingReset: true },
    );

    const bodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
    );
    expect(bodies[0]).not.toHaveProperty('onboardingCompleted');
    expect(bodies[1]).toMatchObject({ onboardingCompleted: true });
    expect(bodies[2]).toMatchObject({ onboardingCompleted: false });
  });

  it('does not let a pre-hydration direct-route callback downgrade daemon completion', async () => {
    const daemonConfig = deferred<{ onboardingCompleted: true }>();
    mockedLoadConfig.mockReturnValue(firstRunConfig());
    mockedFetchDaemonConfig.mockReturnValue(daemonConfig.promise);
    // A direct entry route (for example, a bookmarked Plugins page) renders
    // before daemon config hydration; the plain Home route intentionally
    // shows the first-run loader until the onboarding decision is hydrated.
    routerState.current = { kind: 'home', view: 'plugins' };

    render(<App />);

    await waitFor(() => {
      expect(entryViewCapture.firstAgentChange).not.toBeNull();
    });
    const preHydrationAgentChange = entryViewCapture.firstAgentChange;

    act(() => {
      preHydrationAgentChange?.('codex');
    });

    await act(async () => {
      daemonConfig.resolve({ onboardingCompleted: true });
      await daemonConfig.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-completed').textContent).toBe('true');
    });

    // Exercise the exact callback instance captured before hydration. It must
    // merge into the latest persisted config rather than its render snapshot.
    act(() => {
      preHydrationAgentChange?.('claude-code');
    });

    expect(screen.getByTestId('onboarding-completed').textContent).toBe('true');
    expect(mockedSyncConfigToDaemon).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onboardingCompleted: true,
        agentId: 'claude-code',
      }),
    );
  });

  it('owns explicit reset in App and can persist completion again', async () => {
    const completed = returningUserConfig();
    routerState.current = { kind: 'home', view: 'settings' };
    mockedLoadConfig.mockReturnValue(completed);
    mockedFetchDaemonConfig.mockResolvedValue({ onboardingCompleted: true });

    render(<App />);

    await waitFor(() => {
      expect(settingsCapture.resetOnboarding).toEqual(expect.any(Function));
      expect(screen.getByTestId('settings-onboarding-completed').textContent).toBe('true');
    });

    act(() => {
      settingsCapture.resetOnboarding?.({
        ...completed,
        onboardingCompleted: false,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-completed').textContent).toBe('false');
    });
    expect(mockedSyncConfigToDaemon).toHaveBeenLastCalledWith(
      expect.objectContaining({ onboardingCompleted: false }),
      { allowOnboardingReset: true },
    );

    act(() => {
      entryViewCapture.firstCompleteOnboarding?.();
    });

    expect(screen.getByTestId('onboarding-completed').textContent).toBe('true');
    expect(mockedSyncConfigToDaemon).toHaveBeenLastCalledWith(
      expect.objectContaining({ onboardingCompleted: true }),
    );
  });

  it('does not roll back an agent change while an agent refresh sync is pending', async () => {
    mockedLoadConfig.mockReturnValue(returningUserConfig());
    mockedFetchDaemonConfig.mockResolvedValue({ onboardingCompleted: true });

    render(<App />);

    await waitFor(() => {
      expect(entryViewCapture.firstRefreshAgents).not.toBeNull();
      expect(mockedSyncConfigToDaemon).toHaveBeenCalled();
    });

    mockedSyncConfigToDaemon.mockClear();
    const pendingSync = deferred<void>();
    mockedSyncConfigToDaemon.mockReturnValueOnce(pendingSync.promise);

    let refreshPromise: unknown;
    act(() => {
      refreshPromise = entryViewCapture.firstRefreshAgents?.({
        agentCliEnv: {
          codex: { CODEX_HOME: '/tmp/codex-ratchet-test' },
        },
      });
    });
    act(() => {
      entryViewCapture.firstAgentChange?.('codex');
    });
    expect(screen.getByTestId('agent-id').textContent).toBe('codex');

    await act(async () => {
      pendingSync.resolve();
      await refreshPromise;
    });

    expect(screen.getByTestId('agent-id').textContent).toBe('codex');
  });

  it('resolves first-run onboarding routing once per boot, not on every navigation', async () => {
    mockedLoadConfig.mockReturnValue(returningUserConfig());
    mockedFetchDaemonConfig.mockResolvedValue({ onboardingCompleted: true });

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchDaemonConfig).toHaveBeenCalledTimes(1);
    });

    // Opening a project switches the workspace project-list view, which the
    // bootstrap effect now depends on. Boot work — including the first-run
    // redirect decision — must not replay because the user navigated.
    act(() => {
      routerState.set({
        kind: 'project',
        projectId: 'project-1',
        conversationId: null,
        fileName: null,
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockedFetchDaemonConfig).toHaveBeenCalledTimes(1);
    expect(await navigatedToOnboarding()).toBe(false);
  });
});
