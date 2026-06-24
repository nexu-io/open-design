// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { AppConfig } from '../../src/types';
import { loadConfig, mergeDaemonConfig, fetchDaemonConfig } from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { fetchAmrModels, fetchVelaLoginStatus } from '../../src/providers/daemon';
import { listProjects, listTemplates } from '../../src/state/projects';

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => ({ kind: 'home' as const, view: 'home' as const }),
}));

vi.mock('../../src/components/ApiTokenPrompt', () => ({
  ApiTokenPrompt: () => <div data-testid="api-token-prompt">ApiTokenPrompt</div>,
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: () => <div data-testid="entry-view">EntryView</div>,
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
  SettingsDialog: () => <div>Settings dialog</div>,
}));

vi.mock('../../src/components/PrivacyConsentModal', () => ({
  PrivacyConsentModal: () => null,
}));

vi.mock('../../src/components/MemoryToast', () => ({
  MemoryToast: () => null,
}));

vi.mock('../../src/components/TooltipLayer', () => ({
  TooltipLayer: () => null,
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  WorkspaceTabsBar: () => null,
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
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
    fetchMediaProvidersFromDaemon: vi.fn().mockResolvedValue({
      status: 'ok',
      providers: null,
    }),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncMediaProvidersToDaemon: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: vi.fn(),
    setUserId: vi.fn(),
    setConsent: vi.fn(),
    setConfigureGlobals: vi.fn(),
    setIdentity: vi.fn(),
  }),
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgentsStream = vi.mocked(fetchAgentsStream);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchDesignTemplates = vi.mocked(fetchDesignTemplates);
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

describe('bootstrap nonce exchange failure gate', () => {
  beforeEach(() => {
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchDesignTemplates.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedFetchAmrModels.mockResolvedValue(null);
    mockedFetchVelaLoginStatus.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedFetchDaemonConfig.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows ApiTokenPrompt when bootstrap-token=200 but bootstrap POST=401 and cookie probe also 401', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : '';
      if (url.includes('/api/auth/bootstrap-token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ nonce: 'test-nonce' }),
        } as Response);
      }
      if (url.includes('/api/auth/bootstrap')) {
        return Promise.resolve({
          ok: false,
          status: 401,
        } as Response);
      }
      if (url.includes('/api/plugins')) {
        return Promise.resolve({
          ok: false,
          status: 401,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('api-token-prompt')).toBeTruthy();
    });

    // Fan-out must not have started
    expect(screen.queryByTestId('entry-view')).toBeNull();
  });

  it('shows ApiTokenPrompt when bootstrap-token=200 but bootstrap POST=403 and cookie probe also 401', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : '';
      if (url.includes('/api/auth/bootstrap-token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ nonce: 'test-nonce' }),
        } as Response);
      }
      if (url.includes('/api/auth/bootstrap')) {
        return Promise.resolve({
          ok: false,
          status: 403,
        } as Response);
      }
      if (url.includes('/api/plugins')) {
        return Promise.resolve({
          ok: false,
          status: 401,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('api-token-prompt')).toBeTruthy();
    });
    expect(screen.queryByTestId('entry-view')).toBeNull();
  });

  it('shows ApiTokenPrompt when bootstrap-token=200 but bootstrap POST=500 and cookie probe also 401', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : '';
      if (url.includes('/api/auth/bootstrap-token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ nonce: 'test-nonce' }),
        } as Response);
      }
      if (url.includes('/api/auth/bootstrap')) {
        return Promise.resolve({
          ok: false,
          status: 500,
        } as Response);
      }
      if (url.includes('/api/plugins')) {
        return Promise.resolve({
          ok: false,
          status: 401,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('api-token-prompt')).toBeTruthy();
    });
    expect(screen.queryByTestId('entry-view')).toBeNull();
  });

  it('proceeds to fan-out when bootstrap exchange fails but cookie probe succeeds (existing cookie valid)', async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : '';
      if (url.includes('/api/auth/bootstrap-token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ nonce: 'test-nonce' }),
        } as Response);
      }
      if (url.includes('/api/auth/bootstrap')) {
        return Promise.resolve({
          ok: false,
          status: 401,
        } as Response);
      }
      if (url.includes('/api/plugins')) {
        // Cookie probe succeeds — existing cookie is still valid
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('entry-view')).toBeTruthy();
    });

    expect(screen.queryByTestId('api-token-prompt')).toBeNull();
  });

  it('shows ApiTokenPrompt when bootstrap-token returns 403 (proxied request) and cookie probe also 401', async () => {
    // Regression guard: the existing 403 handling must still work.
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : '';
      if (url.includes('/api/auth/bootstrap-token')) {
        return Promise.resolve({
          ok: false,
          status: 403,
        } as Response);
      }
      if (url.includes('/api/plugins')) {
        return Promise.resolve({
          ok: false,
          status: 401,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('api-token-prompt')).toBeTruthy();
    });
    expect(screen.queryByTestId('entry-view')).toBeNull();
  });
});
