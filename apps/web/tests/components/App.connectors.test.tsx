// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { AppConfig } from '../../src/types';
import {
  fetchDaemonConfig,
  fetchComposioConfigFromDaemon,
  loadConfig,
  mergeDaemonConfig,
  saveConfig,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates } from '../../src/state/projects';

const useRouteMock = vi.fn(() => ({ kind: 'home' as const, view: 'home' as const }));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => useRouteMock(),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    config,
    onOpenSettings,
    onPersistComposioKey,
  }: {
    config: AppConfig;
    onOpenSettings: (section?: 'composio') => void;
    onPersistComposioKey: (composio: AppConfig['composio']) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onOpenSettings('composio')}>
        Open connectors settings
      </button>
      <button type="button" onClick={() => onOpenSettings()}>
        Open execution settings
      </button>
      <div>Composio tail: {config.composio?.apiKeyTail ?? 'none'}</div>
      <button
        type="button"
        onClick={() =>
          onPersistComposioKey({
            apiKey: 'cmp_secret_replacement',
            apiKeyConfigured: true,
            apiKeyTail: config.composio?.apiKeyTail ?? '',
          })
        }
      >
        Save connectors key
      </button>
      <button
        type="button"
        onClick={() =>
          onPersistComposioKey({
            apiKey: '',
            apiKeyConfigured: false,
            apiKeyTail: '',
          })
        }
      >
        Clear connectors key
      </button>
    </div>
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
    onDraftChange,
    onPersistComposioKey,
  }: {
    initial: AppConfig;
    initialSection?: string;
    onDraftChange?: (config: AppConfig) => void;
    onPersistComposioKey: (composio: AppConfig['composio']) => void;
  }) => (
    <div role="dialog" aria-label="Settings dialog">
      <div>Section: {initialSection}</div>
      <div>Composio tail: {initial.composio?.apiKeyTail ?? 'none'}</div>
      <button
        type="button"
        onClick={() =>
          onDraftChange?.({
            ...initial,
            model: 'claude-draft-before-autosave',
          })
        }
      >
        Edit settings draft
      </button>
      <button
        type="button"
        onClick={() =>
          onPersistComposioKey({
            apiKey: 'cmp_secret_replacement',
            apiKeyConfigured: true,
            apiKeyTail: initial.composio?.apiKeyTail ?? '',
          })
        }
      >
        Save connectors key
      </button>
      <button
        type="button"
        onClick={() =>
          onPersistComposioKey({
            apiKey: '',
            apiKeyConfigured: false,
            apiKeyTail: '',
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
    fetchAgentsStream: vi.fn(),
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
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
  };
});

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgentsStream = vi.mocked(fetchAgentsStream);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedFetchDaemonConfig = vi.mocked(fetchDaemonConfig);
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
    mockedFetchAgentsStream.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedFetchDaemonConfig.mockResolvedValue({});
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

    await waitFor(() => {
      expect(screen.getByText('Composio tail: uQEg')).toBeTruthy();
    });
  });

  it('does not show first-run privacy consent until daemon config hydration finishes', async () => {
    let resolveDaemonConfig: (value: Record<string, never>) => void = () => {};
    mockedFetchDaemonConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveDaemonConfig = resolve;
      }),
    );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(mockedFetchDaemonConfig).toHaveBeenCalled();
    });
    expect(container.querySelector('.privacy-consent-banner')).toBeNull();

    resolveDaemonConfig({});

    await waitFor(() => {
      expect(container.querySelector('.privacy-consent-banner')).toBeTruthy();
    });
    const banner = container.querySelector('.privacy-consent-banner');
    expect(banner?.querySelector('.seg-control')).toBeNull();
    expect(banner?.querySelector('.seg-btn.active')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share' }).className)
      .toContain('privacy-consent-action--primary');
    expect(screen.getByRole('button', { name: "Don't share" }).className).toContain(
      'privacy-consent-action',
    );
  });

  it('keeps telemetry and content sharing enabled when the first-run banner share choice is clicked', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalled();
    });
    mockedSyncConfigToDaemon.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: expect.any(String),
          privacyDecisionAt: expect.any(Number),
          telemetry: { metrics: true, content: true },
        }),
        expect.objectContaining({ throwOnError: true }),
      );
    });
  });

  it('preserves an existing installation id when the first-run banner share choice is clicked', async () => {
    const randomUUID = vi.fn(() => 'inst-new');
    vi.stubGlobal('crypto', { randomUUID });
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      installationId: 'inst-existing',
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalled();
    });
    mockedSyncConfigToDaemon.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: 'inst-existing',
          privacyDecisionAt: expect.any(Number),
          telemetry: { metrics: true, content: true },
        }),
        expect.objectContaining({ throwOnError: true }),
      );
    });
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('preserves the artifact manifest preference when the first-run banner share choice is clicked', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      installationId: 'inst-existing',
      telemetry: { metrics: false, content: false, artifactManifest: true },
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalled();
    });
    mockedSyncConfigToDaemon.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: 'inst-existing',
          privacyDecisionAt: expect.any(Number),
          telemetry: { metrics: true, content: true, artifactManifest: true },
        }),
        expect.objectContaining({ throwOnError: true }),
      );
    });
  });

  it('turns telemetry off when the first-run banner decline choice is clicked', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalled();
    });
    mockedSyncConfigToDaemon.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: "Don't share" }));

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: null,
          privacyDecisionAt: expect.any(Number),
          telemetry: { metrics: false, content: false },
        }),
        expect.objectContaining({ throwOnError: true }),
      );
    });
  });

  it('preserves the artifact manifest preference when the first-run banner decline choice is clicked', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      installationId: 'inst-existing',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalled();
    });
    mockedSyncConfigToDaemon.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: "Don't share" }));

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
        expect.objectContaining({
          installationId: null,
          privacyDecisionAt: expect.any(Number),
          telemetry: { metrics: false, content: false, artifactManifest: true },
        }),
        expect.objectContaining({ throwOnError: true }),
      );
    });
  });

  it('keeps the first-run privacy banner mounted while settings is open', async () => {
    // The banner and Settings have independent lifecycles. The banner's
    // z-index in index.css sits above the modal backdrop, so opening
    // Settings (or any other modal) must not unmount the banner — the
    // user has to be able to acknowledge the disclosure from any view.
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('.privacy-consent-banner')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open execution settings' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Settings dialog' })).toBeTruthy();
    });
    expect(container.querySelector('.privacy-consent-banner')).toBeTruthy();
  });

  it('preserves an open settings draft when the first-run banner share choice is clicked before autosave', async () => {
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('.privacy-consent-banner')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open execution settings' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Settings dialog' })).toBeTruthy();
    });

    mockedSyncConfigToDaemon.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Edit settings draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => {
      expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-draft-before-autosave',
          installationId: expect.any(String),
          privacyDecisionAt: expect.any(Number),
          telemetry: { metrics: true, content: true },
        }),
        expect.objectContaining({ throwOnError: true }),
      );
    });
  });

  it('withholds the privacy banner until onboarding completes', async () => {
    // First-run users should land on the welcome panel without the
    // privacy disclosure layered on top. The banner appears only after
    // onboardingCompleted flips to true (Skip and finish both flip it).
    mockedLoadConfig.mockReturnValue({ ...baseConfig, onboardingCompleted: false });
    mockedFetchDaemonConfig.mockResolvedValue({ onboardingCompleted: false });

    const { container } = render(<App />);

    await waitFor(() => {
      expect(mockedFetchDaemonConfig).toHaveBeenCalled();
    });
    // Give the bootstrap microtasks a turn to settle; banner must still
    // be absent because onboardingCompleted is false.
    await waitFor(() => {
      expect(container.querySelector('.privacy-consent-banner')).toBeNull();
    });
  });

  it('shows the privacy banner on non-home routes once onboarding completes', async () => {
    // The design-system finish path drops the user into a project view
    // (the first generation runs there). Product wants the disclosure to
    // appear in that view too — the user is already waiting for output,
    // so there is no benefit to delaying the banner until they navigate
    // back to home.
    useRouteMock.mockReturnValue({
      kind: 'project',
      projectId: 'proj-1',
      conversationId: null,
      fileName: null,
    } as never);

    try {
      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.privacy-consent-banner')).toBeTruthy();
      });
    } finally {
      useRouteMock.mockReturnValue({
        kind: 'home' as const,
        view: 'home' as const,
      } as never);
    }
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
