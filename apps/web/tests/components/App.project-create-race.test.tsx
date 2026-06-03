// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { AppConfig, Project } from '../../src/types';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
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
  uploadProjectFiles,
} from '../../src/providers/registry';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  listTemplates,
  patchProject,
} from '../../src/state/projects';

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    onCreateProject,
    onDeleteProject,
    onImportFolderResponse,
    onOpenProject,
    projects,
  }: {
    onCreateProject: (input: unknown) => void;
    onDeleteProject: (id: string) => void;
    onImportFolderResponse?: (response: {
      conversationId: string;
      entryFile: string | null;
      ok: true;
      projectId: string;
    }) => Promise<void> | void;
    onOpenProject: (id: string) => void;
    projects: Project[];
  }) => (
    <main>
      <button
        type="button"
        onClick={() =>
          onCreateProject({
            name: 'Fresh project',
            skillId: null,
            designSystemId: null,
            metadata: { kind: 'prototype' },
          })
        }
      >
        Create project
      </button>
      <button
        type="button"
        onClick={() =>
          void onImportFolderResponse?.({
            conversationId: 'conv-import',
            entryFile: null,
            ok: true,
            projectId: 'project-new',
          })
        }
      >
        Host import folder
      </button>
      {projects.map((project) => (
        <div key={project.id} data-testid={`entry-project-${project.id}`}>
          <span>{project.name}</span>
          <button type="button" onClick={() => onOpenProject(project.id)}>
            Open {project.name}
          </button>
          <button type="button" onClick={() => void onDeleteProject(project.id)}>
            Delete {project.name}
          </button>
        </div>
      ))}
    </main>
  ),
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: ({
    onBack,
    onProjectsRefresh,
    project,
  }: {
    onBack: () => void;
    onProjectsRefresh: () => Promise<void>;
    project: Project;
  }) => (
    <main data-testid="project-view">
      <span data-testid="project-title">{project.name}</span>
      <button type="button" onClick={onBack}>
        Back to projects
      </button>
      <button type="button" onClick={() => void onProjectsRefresh()}>
        Refresh projects
      </button>
    </main>
  ),
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  WorkspaceTabsBar: () => null,
  openWorkspaceTab: () => {},
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
  switchApiProtocolConfig: (config: AppConfig) => config,
  updateCurrentApiProtocolConfig: (config: AppConfig) => config,
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
    uploadProjectFiles: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    getProject: vi.fn(),
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
    patchProject: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
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
const mockedUploadProjectFiles = vi.mocked(uploadProjectFiles);
const mockedCreateProject = vi.mocked(createProject);
const mockedDeleteProject = vi.mocked(deleteProject);
const mockedGetProject = vi.mocked(getProject);
const mockedListProjects = vi.mocked(listProjects);
const mockedListTemplates = vi.mocked(listTemplates);
const mockedPatchProject = vi.mocked(patchProject);
const mockedFetchDaemonConfig = vi.mocked(fetchDaemonConfig);
const mockedFetchComposioConfigFromDaemon = vi.mocked(fetchComposioConfigFromDaemon);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedMergeDaemonConfig = vi.mocked(mergeDaemonConfig);
const mockedSaveConfig = vi.mocked(saveConfig);
const mockedSyncComposioConfigToDaemon = vi.mocked(syncComposioConfigToDaemon);
const mockedSyncConfigToDaemon = vi.mocked(syncConfigToDaemon);

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  privacyDecisionAt: 1778244000000,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
};

const freshProject: Project = {
  id: 'project-new',
  name: 'Fresh project',
  skillId: null,
  designSystemId: null,
  createdAt: 1778244000000,
  updatedAt: 1778244000000,
  metadata: { kind: 'prototype' },
};

const existingProject: Project = {
  id: 'project-existing',
  name: 'Existing project',
  skillId: null,
  designSystemId: null,
  createdAt: 1778243000000,
  updatedAt: 1778243000000,
  metadata: { kind: 'prototype' },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('App project creation routing', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgents.mockResolvedValue([]);
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignTemplates.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    mockedFetchPromptTemplates.mockResolvedValue([]);
    mockedFetchAppVersionInfo.mockResolvedValue(null);
    mockedListTemplates.mockResolvedValue([]);
    mockedFetchDaemonConfig.mockResolvedValue({});
    mockedFetchComposioConfigFromDaemon.mockResolvedValue(null);
    mockedMergeDaemonConfig.mockImplementation((local) => local);
    mockedLoadConfig.mockReturnValue({ ...baseConfig });
    mockedUploadProjectFiles.mockResolvedValue({ uploaded: [], failed: [] });
    mockedCreateProject.mockResolvedValue({
      project: freshProject,
      conversationId: 'conv-new',
    });
    mockedDeleteProject.mockResolvedValue(true);
    mockedGetProject.mockResolvedValue(null);
    mockedPatchProject.mockResolvedValue(freshProject);
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

  it('keeps a newly created project open when the initial project list resolves stale', async () => {
    const bootstrapProjects = deferred<Project[]>();
    mockedListProjects
      .mockReturnValueOnce(bootstrapProjects.promise)
      .mockResolvedValue([]);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    });
    expect(window.location.pathname).toBe('/projects/project-new');

    await act(async () => {
      bootstrapProjects.resolve([]);
      await bootstrapProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    expect(window.location.pathname).toBe('/projects/project-new');
  });

  it('keeps a newly created project open when a post-create refresh resolves stale', async () => {
    const bootstrapProjects = deferred<Project[]>();
    const staleRefreshProjects = deferred<Project[]>();
    mockedListProjects
      .mockReturnValueOnce(bootstrapProjects.promise)
      .mockReturnValueOnce(staleRefreshProjects.promise)
      .mockResolvedValue([]);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    });
    expect(window.location.pathname).toBe('/projects/project-new');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));

    await act(async () => {
      staleRefreshProjects.resolve([]);
      await staleRefreshProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    expect(window.location.pathname).toBe('/projects/project-new');

    await act(async () => {
      bootstrapProjects.resolve([]);
      await bootstrapProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    expect(window.location.pathname).toBe('/projects/project-new');
  });

  it('ignores an older stale project list after a newer response confirms the local project', async () => {
    const bootstrapProjects = deferred<Project[]>();
    const refreshedProjects = deferred<Project[]>();
    mockedListProjects
      .mockReturnValueOnce(bootstrapProjects.promise)
      .mockReturnValueOnce(refreshedProjects.promise)
      .mockResolvedValue([]);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    });
    expect(window.location.pathname).toBe('/projects/project-new');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));

    await act(async () => {
      refreshedProjects.resolve([freshProject]);
      await refreshedProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    expect(window.location.pathname).toBe('/projects/project-new');

    await act(async () => {
      bootstrapProjects.resolve([]);
      await bootstrapProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    expect(window.location.pathname).toBe('/projects/project-new');
  });

  it('does not revive nonlocal projects from an older list after a newer empty refresh', async () => {
    const bootstrapProjects = deferred<Project[]>();
    const createRefreshProjects = deferred<Project[]>();
    mockedListProjects
      .mockReturnValueOnce(bootstrapProjects.promise)
      .mockReturnValueOnce(createRefreshProjects.promise)
      .mockResolvedValue([]);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    });
    expect(window.location.pathname).toBe('/projects/project-new');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
    expect(mockedListProjects).toHaveBeenCalledTimes(2);

    await act(async () => {
      createRefreshProjects.resolve([]);
      await createRefreshProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    expect(window.location.pathname).toBe('/projects/project-new');

    await act(async () => {
      bootstrapProjects.resolve([existingProject]);
      await bootstrapProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    expect(window.location.pathname).toBe('/projects/project-new');

    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));

    await waitFor(() => {
      expect(screen.getByTestId('entry-project-project-new').textContent).toContain(
        'Fresh project',
      );
    });
    expect(screen.queryByTestId('entry-project-project-existing')).toBeNull();
  });

  it('does not re-add a locally deleted project when an older project list resolves stale', async () => {
    const initialProjects = deferred<Project[]>();
    const staleRefreshProjects = deferred<Project[]>();
    mockedListProjects
      .mockReturnValueOnce(initialProjects.promise)
      .mockReturnValueOnce(staleRefreshProjects.promise)
      .mockResolvedValue([]);

    render(<App />);

    await act(async () => {
      initialProjects.resolve([freshProject]);
      await initialProjects.promise;
    });

    expect(screen.getByTestId('entry-project-project-new').textContent).toContain(
      'Fresh project',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Fresh project' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
    expect(mockedListProjects).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Fresh project' }));

    await waitFor(() => {
      expect(mockedDeleteProject).toHaveBeenCalledWith('project-new');
      expect(screen.queryByTestId('entry-project-project-new')).toBeNull();
    });

    await act(async () => {
      staleRefreshProjects.resolve([freshProject]);
      await staleRefreshProjects.promise;
    });

    expect(screen.queryByTestId('entry-project-project-new')).toBeNull();
  });

  it('keeps a host-imported project routable when getProject and the list lag behind', async () => {
    // Desktop import flow (handleImportFolderResponse fallback): the host
    // bridge has already POSTed the import, but `/api/projects/:id` and
    // `/api/projects` are both still catching up. Without a placeholder
    // the stale `[]` list response would drop the just-imported project
    // from state and the route-guard effect would bounce to Home.
    const bootstrapProjects = deferred<Project[]>();
    const importListProjects = deferred<Project[]>();
    mockedListProjects
      .mockReturnValueOnce(bootstrapProjects.promise)
      .mockReturnValueOnce(importListProjects.promise)
      .mockResolvedValue([]);
    mockedGetProject.mockResolvedValue(null);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Host import folder' }));

    await act(async () => {
      importListProjects.resolve([]);
      await importListProjects.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('project-view')).toBeTruthy();
    });
    expect(window.location.pathname).toBe('/projects/project-new');

    await act(async () => {
      bootstrapProjects.resolve([]);
      await bootstrapProjects.promise;
    });

    expect(screen.getByTestId('project-view')).toBeTruthy();
    expect(window.location.pathname).toBe('/projects/project-new');
  });

  it('hydrates a host-import placeholder from an older project list that contains the import', async () => {
    const bootstrapProjects = deferred<Project[]>();
    const importListProjects = deferred<Project[]>();
    mockedListProjects
      .mockReturnValueOnce(bootstrapProjects.promise)
      .mockReturnValueOnce(importListProjects.promise)
      .mockResolvedValue([]);
    mockedGetProject.mockResolvedValue(null);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Host import folder' }));

    await act(async () => {
      importListProjects.resolve([]);
      await importListProjects.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('project-view')).toBeTruthy();
    });
    expect(screen.getByTestId('project-title').textContent).toBe('');
    expect(window.location.pathname).toBe('/projects/project-new');

    await act(async () => {
      bootstrapProjects.resolve([freshProject]);
      await bootstrapProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    expect(window.location.pathname).toBe('/projects/project-new');
  });

  it('does not revive unrelated projects from an older list that hydrates a host import', async () => {
    const bootstrapProjects = deferred<Project[]>();
    const importListProjects = deferred<Project[]>();
    mockedListProjects
      .mockReturnValueOnce(bootstrapProjects.promise)
      .mockReturnValueOnce(importListProjects.promise)
      .mockResolvedValue([]);
    mockedGetProject.mockResolvedValue(null);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Host import folder' }));

    await act(async () => {
      importListProjects.resolve([]);
      await importListProjects.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('project-view')).toBeTruthy();
    });
    expect(screen.getByTestId('project-title').textContent).toBe('');
    expect(window.location.pathname).toBe('/projects/project-new');

    await act(async () => {
      bootstrapProjects.resolve([freshProject, existingProject]);
      await bootstrapProjects.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));

    await waitFor(() => {
      expect(screen.getByTestId('entry-project-project-new').textContent).toContain(
        'Fresh project',
      );
    });
    expect(screen.queryByTestId('entry-project-project-existing')).toBeNull();
  });
});
