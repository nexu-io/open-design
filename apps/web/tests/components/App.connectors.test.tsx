// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { AppConfig } from '../../src/types';
import {
  fetchComposioConfigFromDaemon,
  loadConfig,
  mergeDaemonConfig,
  saveConfig,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgents,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates } from '../../src/state/projects';

const useRouteMock = vi.fn(() => ({ kind: 'home' as const }));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => useRouteMock(),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({ onOpenSettings }: { onOpenSettings: (section?: 'composio') => void }) => (
    <button type="button" onClick={() => onOpenSettings('composio')}>
      Open connectors settings
    </button>
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
    initial,
    initialSection,
    onSave,
  }: {
    initial: AppConfig;
    initialSection?: string;
    onSave: (next: AppConfig) => void;
  }) => (
    <div role="dialog" aria-label="Settings dialog">
      <div>Section: {initialSection}</div>
      <div>Composio tail: {initial.composio?.apiKeyTail ?? 'none'}</div>
      <button
        type="button"
        onClick={() =>
          onSave({
            ...initial,
            composio: {
              apiKey: 'cmp_secret_replacement',
              apiKeyConfigured: true,
              apiKeyTail: initial.composio?.apiKeyTail ?? '',
            },
          })
        }
      >
        Save connectors key
      </button>
      <button
        type="button"
        onClick={() =>
          onSave({
            ...initial,
            composio: {
              apiKey: '',
              apiKeyConfigured: false,
              apiKeyTail: '',
            },
          })
        }
      >
        Clear connectors key
      </button>
    </div>
  ),
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
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
  };
});

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgents = vi.mocked(fetchAgents);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedFetchComposioConfigFromDaemon = vi.mocked(fetchComposioConfigFromDaemon);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedMergeDaemonConfig = vi.mocked(mergeDaemonConfig);
const mockedSaveConfig = vi.mocked(saveConfig);
const mockedSyncConfigToDaemon = vi.mocked(syncConfigToDaemon);
const mockedSyncComposioConfigToDaemon = vi.mocked(syncComposioConfigToDaemon);

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

describe('App connectors settings flows', () => {
  beforeEach(() => {
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgents.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedFetchComposioConfigFromDaemon.mockResolvedValue(null);
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
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

  it('hydrates a daemon-saved Composio key into settings when local state does not have a pending edit', async () => {
    mockedFetchComposioConfigFromDaemon.mockResolvedValue({
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyTail: 'uQEg',
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open connectors settings' }));

    await waitFor(() => {
      expect(screen.getByText('Composio tail: uQEg')).toBeTruthy();
    });
  });

  it('normalizes local persistence but sends the raw replacement key to the daemon on save', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      composio: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: 'uQEg',
      },
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open connectors settings' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Settings dialog' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save connectors key' }));

    await waitFor(() => {
      expect(mockedSyncComposioConfigToDaemon).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'cmp_secret_replacement',
          apiKeyConfigured: true,
        }),
      );
    });

    expect(mockedSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingCompleted: true,
        composio: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: 'ment',
        },
      }),
    );
    expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingCompleted: true,
      }),
    );
    expect(mockedSaveConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      onboardingCompleted: true,
      composio: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: 'ment',
      },
    });
  });

  it('sends a cleared Composio config to the daemon when the saved key is removed', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      composio: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: 'uQEg',
      },
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open connectors settings' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Settings dialog' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear connectors key' }));

    await waitFor(() => {
      expect(mockedSyncComposioConfigToDaemon).toHaveBeenCalledWith({
        apiKey: '',
        apiKeyConfigured: false,
        apiKeyTail: '',
      });
    });

    expect(mockedSaveConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      composio: {
        apiKey: '',
        apiKeyConfigured: false,
        apiKeyTail: '',
      },
    });
  });
});
