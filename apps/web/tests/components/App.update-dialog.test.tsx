// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  OpenDesignHostUpdaterOpenDialogListener,
  OpenDesignHostUpdaterStatusSnapshot,
} from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { App } from '../../src/App';
import { fetchAmrModels, fetchVelaLoginStatus } from '../../src/providers/daemon';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { fetchDaemonConfig, loadConfig, mergeDaemonConfig } from '../../src/state/config';
import { listProjects, listTemplates } from '../../src/state/projects';
import type { AppConfig } from '../../src/types';

const routeState = vi.hoisted(() => ({
  current: { kind: 'home' as const, view: 'home' as const } as
    | { kind: 'home'; view: 'home' }
    | { kind: 'project'; projectId: string },
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => routeState.current,
}));

vi.mock('../../src/components/EntryNavRail', () => ({
  WorkspaceTopRightAccountCluster: ({ updaterSlot }: { updaterSlot?: ReactNode }) => (
    <div data-testid="project-top-right-account-cluster">{updaterSlot}</div>
  ),
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

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

vi.mock('../../src/components/AmrArtifactUpgradeGate', () => ({
  AmrArtifactUpgradeGate: () => null,
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
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    fetchMediaProvidersFromDaemon: vi.fn().mockResolvedValue({ status: 'ok', providers: null }),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
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
  privacyDecisionAt: 1,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
};

function idleStatus(
  overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {},
): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'arm64',
    capabilities: {
      canApplyInPlace: true,
      canDownload: true,
      canOpenInstaller: false,
      requiresManualInstall: false,
    },
    channel: 'beta',
    currentVersion: '1.2.3',
    enabled: true,
    mode: 'js-incremental',
    platform: 'darwin',
    state: 'idle',
    supported: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('App updater dialog integration', () => {
  let restoreHost: (() => void) | null = null;

  beforeEach(() => {
    routeState.current = { kind: 'home', view: 'home' };
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedFetchAmrModels.mockResolvedValue({ source: 'preset', refreshing: false, models: [] });
    mockedFetchVelaLoginStatus.mockResolvedValue({
      loggedIn: false,
      loginInFlight: false,
      profile: 'prod',
      user: null,
      configPath: '/tmp/amr-config.json',
    });
    mockedListProjects.mockResolvedValue([]);
    mockedListTemplates.mockResolvedValue([]);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedFetchDaemonConfig.mockResolvedValue({ privacyDecisionAt: 1 });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
  });

  afterEach(() => {
    cleanup();
    restoreHost?.();
    restoreHost = null;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('exposes the desktop host platform on the workspace shell', () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        client: {
          platform: 'win32',
        },
      },
    });

    const { container } = render(<App />);

    expect(container.querySelector('.workspace-shell')).toHaveAttribute(
      'data-host-platform',
      'win32',
    );
  });

  it('mounts the updater open-dialog subscription and handles the mac app menu request', async () => {
    let openDialogListener: OpenDesignHostUpdaterOpenDialogListener | null = null;
    const check = vi.fn(async () => idleStatus({ state: 'not-available' }));
    const unsubscribeOpenDialog = vi.fn();
    const subscribeOpenDialog = vi.fn((listener: OpenDesignHostUpdaterOpenDialogListener) => {
      openDialogListener = listener;
      return unsubscribeOpenDialog;
    });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          check,
          status: vi.fn(async () => idleStatus()),
          subscribeOpenDialog,
        },
      },
    });

    const { unmount } = render(<App />);

    await waitFor(() => expect(subscribeOpenDialog).toHaveBeenCalledTimes(1));
    await act(async () => {
      openDialogListener?.({ source: 'mac-app-menu' });
      await Promise.resolve();
    });

    expect(await screen.findByRole('dialog', { name: 'Check for updates' })).toBeTruthy();
    await waitFor(() => expect(check).toHaveBeenCalledWith({
      payload: { autoDownload: true, source: 'mac-app-menu' },
    }));
    expect(check).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribeOpenDialog).toHaveBeenCalledTimes(1);
  });

  it('shows the update-ready rocket in the project-detail account cluster', async () => {
    routeState.current = { kind: 'project', projectId: 'project-1' };
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => idleStatus({
            availableVersion: '1.2.4',
            downloadPath: '/tmp/open-design-updater/Open Design Beta.dmg',
            state: 'downloaded',
          })),
        },
      },
    });

    render(<App />);

    expect(await screen.findByTestId('project-top-right-account-cluster')).toBeTruthy();
    expect(await screen.findByTestId('entry-nav-updater')).toBeTruthy();
    expect(screen.getByTestId('updater-rocket-glyph')).toBeTruthy();
  });
});
