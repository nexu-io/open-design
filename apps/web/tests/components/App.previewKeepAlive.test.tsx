// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { AppConfig, Project } from '../../src/types';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  fetchMediaProvidersFromDaemon,
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
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates } from '../../src/state/projects';
import { useIframeKeepAlivePool } from '../../src/components/IframeKeepAlivePool';

const evictProjectMock = vi.fn();
const evictMatchingMock = vi.fn();
const useRouteMock = vi.fn(() => ({
  kind: 'project' as const,
  projectId: 'project-1',
  conversationId: null,
  fileName: null,
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => useRouteMock(),
}));

vi.mock('../../src/components/IframeKeepAlivePool', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/IframeKeepAlivePool')>(
    '../../src/components/IframeKeepAlivePool',
  );
  return {
    ...actual,
    useIframeKeepAlivePool: vi.fn(),
  };
});

vi.mock('../../src/components/EntryView', () => ({
  EntryView: () => <div>Entry view</div>,
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: ({
    project,
    onProjectChange,
    onOpenSettings,
  }: {
    project: Project;
    onProjectChange: (project: Project) => void;
    onOpenSettings: (section?: string) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onProjectChange({
            ...project,
            skillId: 'fresh-skill',
          })
        }
      >
        Change skill
      </button>
      <button
        type="button"
        onClick={() =>
          onProjectChange({
            ...project,
            designSystemId: 'fresh-design-system',
          })
        }
      >
        Change design system
      </button>
      <button
        type="button"
        onClick={() =>
          onProjectChange({
            ...project,
            customInstructions: 'Fresh project instructions',
          })
        }
      >
        Change custom instructions
      </button>
      <button type="button" onClick={() => onOpenSettings('skills')}>
        Open settings
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: ({
    onSkillsChanged,
    onDesignSystemsChanged,
  }: {
    onSkillsChanged?: (id?: string) => void;
    onDesignSystemsChanged?: (id?: string) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onSkillsChanged?.('old-skill')}
      >
        Trigger skill body change
      </button>
      <button
        type="button"
        onClick={() => onSkillsChanged?.('unrelated-skill')}
      >
        Trigger unrelated skill change
      </button>
      <button
        type="button"
        onClick={() => onDesignSystemsChanged?.('old-design-system')}
      >
        Trigger design system change
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  WorkspaceTabsBar: () => null,
}));

vi.mock('../../src/components/MemoryToast', () => ({
  MemoryToast: () => null,
}));

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

const mockedDaemonIsLive = vi.mocked(daemonIsLive);
const mockedFetchAgents = vi.mocked(fetchAgents);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchDesignTemplates = vi.mocked(fetchDesignTemplates);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedFetchComposioConfigFromDaemon = vi.mocked(fetchComposioConfigFromDaemon);
const mockedFetchDaemonConfig = vi.mocked(fetchDaemonConfig);
const mockedFetchMediaProvidersFromDaemon = vi.mocked(fetchMediaProvidersFromDaemon);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedMergeDaemonConfig = vi.mocked(mergeDaemonConfig);
const mockedUseIframeKeepAlivePool = vi.mocked(useIframeKeepAlivePool);

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
  skillId: 'old-skill',
  designSystemId: 'old-design-system',
  customInstructions: 'Old project instructions',
  createdAt: 1,
  updatedAt: 1,
};

describe('App preview keep-alive invalidation', () => {
  beforeEach(() => {
    mockedUseIframeKeepAlivePool.mockReturnValue({
      attach: vi.fn(),
      release: vi.fn(),
      evict: vi.fn(),
      evictProject: evictProjectMock,
      evictMatching: evictMatchingMock,
    });
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgents.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignTemplates.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedListProjects.mockResolvedValue([project]);
    mockedListTemplates.mockResolvedValue([]);
    mockedFetchDaemonConfig.mockResolvedValue({});
    mockedFetchComposioConfigFromDaemon.mockResolvedValue(null);
    mockedFetchMediaProvidersFromDaemon.mockResolvedValue({ status: 'ok', providers: {} });
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
    window.history.replaceState(null, '', '/projects/project-1');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    'Change skill',
    'Change design system',
    'Change custom instructions',
  ])('evicts the active preview when the open project prompt context changes: %s', async (buttonName) => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: buttonName }));

    await waitFor(() => {
      expect(evictProjectMock).toHaveBeenCalledWith('project-1', { includeActive: true });
    });
  });

  // Regression for the mrcfps follow-up on PR #2190: ProjectView's
  // signature only hashes SkillSummary / DesignSystemSummary fields, so a
  // body-only registry edit leaves every signature unchanged and the
  // signature-driven eviction path silently misses it. Settings →
  // Skills / Design Systems now call back through App.tsx after every
  // mutation so the pool drops any project that depends on the affected
  // id — active or parked — regardless of which summary fields moved.
  it('evicts pool entries for projects that use a changed skill, even on body-only edits', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Trigger skill body change' }));

    await waitFor(() => {
      expect(evictMatchingMock).toHaveBeenCalled();
    });
    const [predicate, options] = evictMatchingMock.mock.calls.at(-1) ?? [];
    expect(options).toEqual({ includeActive: true });
    expect(typeof predicate).toBe('function');
    expect(
      (predicate as (entry: { projectId: string; key: string; fileName: string }) => boolean)({
        key: 'project-1 file.html',
        projectId: 'project-1',
        fileName: 'file.html',
      }),
    ).toBe(true);
  });

  it('does not evict pool entries for projects that use a different skill', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open settings' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Trigger unrelated skill change' }),
    );

    await waitFor(() => {
      expect(evictMatchingMock).toHaveBeenCalled();
    });
    const [predicate] = evictMatchingMock.mock.calls.at(-1) ?? [];
    expect(
      (predicate as (entry: { projectId: string; key: string; fileName: string }) => boolean)({
        key: 'project-1 file.html',
        projectId: 'project-1',
        fileName: 'file.html',
      }),
    ).toBe(false);
  });

  it('evicts pool entries for projects that use a changed design system', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open settings' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Trigger design system change' }),
    );

    await waitFor(() => {
      expect(evictMatchingMock).toHaveBeenCalled();
    });
    const [predicate, options] = evictMatchingMock.mock.calls.at(-1) ?? [];
    expect(options).toEqual({ includeActive: true });
    expect(
      (predicate as (entry: { projectId: string; key: string; fileName: string }) => boolean)({
        key: 'project-1 file.html',
        projectId: 'project-1',
        fileName: 'file.html',
      }),
    ).toBe(true);
  });
});
