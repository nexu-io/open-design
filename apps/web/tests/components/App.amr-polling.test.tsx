// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
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

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => ({ kind: 'home' as const, view: 'home' as const }),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    agents,
    config,
    onOpenSettings,
  }: {
    agents: Array<{ id: string; models?: Array<{ id: string }>; authStatus?: string }>;
    config: AppConfig;
    onOpenSettings: () => void;
  }) => (
    <>
      <div data-testid="amr-model">
        {agents.find((agent) => agent.id === 'amr')?.models?.[0]?.id ?? 'none'}
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
    onRefreshAgents,
    onAmrLoginStatusChange,
  }: {
    onRefreshAgents: (options?: { agentCliEnv?: AppConfig['agentCliEnv'] }) => void | Promise<void>;
    onAmrLoginStatusChange?: (status: {
      loggedIn: boolean;
      loginInFlight?: boolean;
      profile: string;
      user: null;
      configPath: string;
    } | null) => void;
  }) => (
    <>
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

describe('App AMR polling', () => {
  beforeEach(() => {
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
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps polling AMR models until the remote catalog replaces the preset list', { timeout: 10_000 }, async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');
    });

    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('remote-a');
    }, { timeout: 4_000 });
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

  it('restarts AMR polling after sign-in when preset refresh previously stopped on a remote error', {
    timeout: 10_000,
  }, async () => {
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

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    }, { timeout: 4_000 });
    await waitFor(() => {
      expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');
    });

    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(2);
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: true,
      profile: 'default',
      user: null,
      configPath: '/tmp/amr-config.json',
    });

    fireEvent.click(screen.getByText('open settings'));
    await waitFor(() => {
      expect(screen.getByText('mark amr signed in')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('mark amr signed in'));

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId('amr-model').textContent).toBe('remote-a');
    }, { timeout: 4_000 });
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

  it('stops polling after the preset retry budget is exhausted when remote never arrives', {
    timeout: 20_000,
  }, async () => {
    mockedFetchAmrModels.mockReset();
    mockedFetchAmrModels.mockImplementation(async () => ({
      source: 'preset',
      refreshing: true,
      models: [{ id: 'preset-a', label: 'preset-a' }],
    }));

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchAmrModels).toHaveBeenCalledTimes(11);
    }, { timeout: 12_000 });

    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(mockedFetchAmrModels).toHaveBeenCalledTimes(11);
    expect(screen.getByTestId('amr-model').textContent).toBe('preset-a');
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
