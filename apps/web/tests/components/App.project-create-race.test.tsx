// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildWorkspacePermissions } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { ProjectNameAuthorityResolution } from '../../src/components/ProjectView';
import type { AgentInfo, AppConfig, Project } from '../../src/types';
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
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
  replaceProjectWorkingDir,
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
import {
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    onCreateProject,
    onDeleteProject,
    onImportFolderResponse,
    onOpenProject,
    onRefreshAgents,
    agents,
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
    onOpenProject: (
      id: string,
      fileName?: string,
      projectTitleHint?: {
        authoritative: boolean;
        name: string;
        workspaceId: string | null;
        workspaceMemberId: string | null;
      },
    ) => Promise<boolean> | boolean | void;
    onRefreshAgents: () => void | Promise<void>;
    agents: AgentInfo[];
    projects: Project[];
  }) => (
    <main>
      <div data-testid="entry-home-surface" />
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
          onCreateProject({
            name: 'Dir project',
            skillId: null,
            designSystemId: null,
            metadata: { kind: 'prototype', userWorkingDir: '/Users/me/external' },
            userWorkingDirToken: 'wd-token',
            pendingFiles: [new File(['hi'], 'note.txt', { type: 'text/plain' })],
          })
        }
      >
        Create project with working dir
      </button>
      <button
        type="button"
        onClick={() =>
          onCreateProject({
            name: 'Context dir project',
            skillId: null,
            designSystemId: null,
            metadata: { kind: 'prototype', linkedDirs: ['/Users/me/existing'] },
            linkedDirs: ['/Users/me/reference', ' /Users/me/reference ', '/Users/me/local-code'],
          })
        }
      >
        Create project with context dirs
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
      <button type="button" onClick={() => void onRefreshAgents()}>
        Refresh agents
      </button>
      <button type="button" onClick={() => void onOpenProject('project-missing')}>
        Open missing project
      </button>
      <button
        type="button"
        onClick={() =>
          void onOpenProject('project-shared', undefined, {
            authoritative: true,
            name: 'Catalog authority',
            workspaceId: 'ws-1',
            workspaceMemberId: 'wm-1',
          })
        }
      >
        Open catalog project
      </button>
      <button
        type="button"
        onClick={() =>
          void onOpenProject('project-shared', undefined, {
            authoritative: true,
            name: 'New card authority',
            workspaceId: 'ws-1',
            workspaceMemberId: 'wm-1',
          })
        }
      >
        Open updated catalog project
      </button>
      <button
        type="button"
        onClick={() =>
          void onOpenProject('project-own', undefined, {
            authoritative: false,
            name: 'Own local project',
            workspaceId: 'ws-1',
            workspaceMemberId: 'wm-1',
          })
        }
      >
        Open own unbound project
      </button>
      <button
        type="button"
        onClick={() =>
          void onOpenProject('project-same', undefined, {
            authoritative: true,
            name: 'Workspace A catalog',
            workspaceId: 'ws-a',
            workspaceMemberId: 'member-ws-a',
          })
        }
      >
        Open workspace A project
      </button>
      <button
        type="button"
        onClick={() =>
          void onOpenProject('project-same', undefined, {
            authoritative: false,
            name: 'Workspace A stale own title',
            workspaceId: 'ws-a',
            workspaceMemberId: 'member-ws-a',
          })
        }
      >
        Open stale own workspace A project
      </button>
      <div data-testid="entry-agent-list">
        {agents.map((agent) => (
          <span key={agent.id} data-testid={`entry-agent-${agent.id}`}>
            {agent.name}
          </span>
        ))}
      </div>
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
    onCreateProjectFromDesignSystem,
    onProjectsRefresh,
    project,
    routeConversationId,
    authoritativeProjectName,
    projectAuthorizationKey,
    resolveAuthoritativeProjectName,
  }: {
    onBack: () => void;
    onCreateProjectFromDesignSystem?: (designSystemId: string, title: string) => Promise<void> | void;
    onProjectsRefresh: () => Promise<void>;
    project: Project;
    routeConversationId?: string | null;
    authoritativeProjectName?: string;
    projectAuthorizationKey?: string;
    resolveAuthoritativeProjectName?: (
      projectId: string,
      expectedAuthorizationKey: string,
    ) => Promise<ProjectNameAuthorityResolution>;
  }) => (
    <main data-testid="project-view">
      <span data-testid="project-title">{project.name}</span>
      <span data-testid="project-authoritative-title">{authoritativeProjectName ?? 'none'}</span>
      <span data-testid="project-workspace-id">{project.workspaceId ?? 'unbound'}</span>
      <span data-testid="project-route-conversation">{routeConversationId ?? 'none'}</span>
      <button type="button" onClick={onBack}>
        Back to projects
      </button>
      <button type="button" onClick={() => void onProjectsRefresh()}>
        Refresh projects
      </button>
      <button
        type="button"
        onClick={() => void onCreateProjectFromDesignSystem?.('slack', 'Slack')}
      >
        Create design from design system
      </button>
      <button
        type="button"
        onClick={() =>
          void resolveAuthoritativeProjectName?.(
            project.id,
            projectAuthorizationKey ?? project.id,
          )
        }
      >
        Refresh catalog title
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
    fetchAgentsStream: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
    replaceProjectWorkingDir: vi.fn(),
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
const mockedFetchAgentsStream = vi.mocked(fetchAgentsStream);
const mockedFetchAppVersionInfo = vi.mocked(fetchAppVersionInfo);
const mockedFetchDesignSystems = vi.mocked(fetchDesignSystems);
const mockedFetchDesignTemplates = vi.mocked(fetchDesignTemplates);
const mockedFetchPromptTemplates = vi.mocked(fetchPromptTemplates);
const mockedFetchSkills = vi.mocked(fetchSkills);
const mockedUploadProjectFiles = vi.mocked(uploadProjectFiles);
const mockedReplaceProjectWorkingDir = vi.mocked(replaceProjectWorkingDir);
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

function workspaceContextPayload(
  workspaceId: string,
  workspaceMemberId: string,
) {
  return { context: workspaceContext(workspaceId, workspaceMemberId) };
}

function workspaceContext(
  workspaceId: string,
  workspaceMemberId: string,
) {
  return {
    workspaceId,
    workspaceType: 'team' as const,
    workspaceMemberId,
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    billingState: 'active' as const,
    planId: null,
    providerMode: 'platform_credits' as const,
    seatSummary: {
      seatLimit: 5,
      usedSeats: 1,
      availableSeats: 4,
      isSeatFull: false,
    },
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
    displayName: workspaceId,
  };
}

function stubWorkspaceContext(
  workspaceId: string,
  workspaceMemberId: string,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      return {
        ok: true,
        json: async () =>
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([workspaceContext(workspaceId, workspaceMemberId)])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload(workspaceId, workspaceMemberId)
              : {},
      } as Response;
    }),
  );
}

describe('App project creation routing', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    window.history.replaceState(null, '', '/');
    mockedDaemonIsLive.mockResolvedValue(true);
    mockedFetchAgentsStream.mockResolvedValue([]);
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
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetCoalescedGet();
  });

  it('auto-picks the first available agent in registry order after streamed probes settle', async () => {
    const codexAgent: AgentInfo = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      models: [{ id: 'default', label: 'Default' }],
    };
    const claudeAgent: AgentInfo = {
      id: 'claude',
      name: 'Claude Code',
      bin: 'claude',
      available: true,
      version: '1.0.0',
      models: [{ id: 'default', label: 'Default' }],
    };
    mockedLoadConfig.mockReturnValue({ ...baseConfig, agentId: null });
    mockedListProjects.mockResolvedValue([]);
    mockedFetchAgentsStream.mockImplementation(async ({ onAgent }) => {
      onAgent(codexAgent);
      onAgent(claudeAgent);
      return [codexAgent, claudeAgent];
    });

    render(<App />);

    await waitFor(() => {
      expect(mockedSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'claude' }),
      );
    });
    expect(
      mockedSaveConfig.mock.calls.some(([saved]) => saved.agentId === 'codex'),
    ).toBe(false);
    expect(mockedSyncConfigToDaemon).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'claude' }),
    );
  });

  it('ignores stale streamed writes from an older bootstrap after a newer rescan', async () => {
    const staleCodexAgent: AgentInfo = {
      id: 'codex',
      name: 'Stale Codex CLI',
      bin: 'codex',
      available: false,
      version: null,
      models: [],
    };
    const refreshedCodexAgent: AgentInfo = {
      id: 'codex',
      name: 'Fresh Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      models: [{ id: 'default', label: 'Default' }],
    };
    const staleBootstrap = deferred<AgentInfo[]>();
    let emitStaleAgent: ((agent: AgentInfo) => void) | null = null;
    mockedFetchAgentsStream
      .mockImplementationOnce(({ onAgent }) => {
        emitStaleAgent = onAgent;
        return staleBootstrap.promise;
      })
      .mockImplementationOnce(async ({ onAgent }) => {
        onAgent(refreshedCodexAgent);
        return [refreshedCodexAgent];
      });
    mockedListProjects.mockResolvedValue([]);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh agents' }));

    await waitFor(() => {
      expect(screen.getByTestId('entry-agent-codex').textContent).toBe(
        'Fresh Codex CLI',
      );
    });

    await act(async () => {
      emitStaleAgent?.(staleCodexAgent);
      staleBootstrap.resolve([staleCodexAgent]);
      await staleBootstrap.promise;
    });

    expect(screen.getByTestId('entry-agent-codex').textContent).toBe(
      'Fresh Codex CLI',
    );
  });

  it('does not auto-pick from a partial rescan when an older bootstrap settles', async () => {
    const codexAgent: AgentInfo = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      models: [{ id: 'default', label: 'Default' }],
    };
    const claudeAgent: AgentInfo = {
      id: 'claude',
      name: 'Claude Code',
      bin: 'claude',
      available: true,
      version: '1.0.0',
      models: [{ id: 'default', label: 'Default' }],
    };
    const staleBootstrap = deferred<AgentInfo[]>();
    const rescan = deferred<AgentInfo[]>();
    mockedLoadConfig.mockReturnValue({ ...baseConfig, agentId: null });
    mockedListProjects.mockResolvedValue([]);
    mockedFetchAgentsStream
      .mockReturnValueOnce(staleBootstrap.promise)
      .mockImplementationOnce(({ onAgent }) => {
        onAgent(codexAgent);
        return rescan.promise;
      });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh agents' }));

    await waitFor(() => {
      expect(screen.getByTestId('entry-agent-codex').textContent).toBe(
        'Codex CLI',
      );
    });

    await act(async () => {
      staleBootstrap.resolve([]);
      await staleBootstrap.promise;
    });
    await act(async () => {
      rescan.resolve([codexAgent, claudeAgent]);
      await rescan.promise;
    });

    await waitFor(() => {
      expect(mockedSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'claude' }),
      );
    });
    expect(
      mockedSaveConfig.mock.calls.some(([saved]) => saved.agentId === 'codex'),
    ).toBe(false);
  });

  it('keeps auto-pick gated while rescanning from an empty agent state', async () => {
    const codexAgent: AgentInfo = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      models: [{ id: 'default', label: 'Default' }],
    };
    const claudeAgent: AgentInfo = {
      id: 'claude',
      name: 'Claude Code',
      bin: 'claude',
      available: true,
      version: '1.0.0',
      models: [{ id: 'default', label: 'Default' }],
    };
    const initialProbe = deferred<AgentInfo[]>();
    const rescan = deferred<AgentInfo[]>();
    mockedLoadConfig.mockReturnValue({ ...baseConfig, agentId: null });
    mockedListProjects.mockResolvedValue([]);
    mockedFetchAgentsStream
      .mockReturnValueOnce(initialProbe.promise)
      .mockImplementationOnce(({ onAgent }) => {
        onAgent(codexAgent);
        return rescan.promise;
      });

    render(<App />);

    await waitFor(() => {
      expect(mockedFetchAgentsStream).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      initialProbe.resolve([]);
      await initialProbe.promise;
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh agents' }));

    await waitFor(() => {
      expect(screen.getByTestId('entry-agent-codex').textContent).toBe(
        'Codex CLI',
      );
    });

    await act(async () => {
      rescan.resolve([codexAgent, claudeAgent]);
      await rescan.promise;
    });

    await waitFor(() => {
      expect(mockedSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'claude' }),
      );
    });
    expect(
      mockedSaveConfig.mock.calls.some(([saved]) => saved.agentId === 'codex'),
    ).toBe(false);
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

  it('routes "create with this design system" through the default design router, not a prototype', async () => {
    mockedListProjects.mockResolvedValue([existingProject]);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await screen.findByTestId('project-view');
    fireEvent.click(screen.getByRole('button', { name: 'Create design from design system' }));

    await waitFor(() => {
      expect(mockedCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Untitled',
          skillId: null,
          designSystemId: 'slack',
          // No prototype assumption: the click binds the hidden default
          // router so the agent asks (via the task-type question-form) what
          // to build, then auto-sends a preset prompt that names the system.
          pluginId: 'od-default',
          conversationMode: 'design',
          pendingPrompt: expect.stringContaining('Slack'),
          pluginInputs: expect.objectContaining({
            prompt: expect.stringContaining('Slack'),
          }),
          metadata: expect.objectContaining({
            kind: 'other',
          }),
        }),
      );
    });

    // The web-prototype scenario and prototype kind must NOT leak in.
    const call = mockedCreateProject.mock.calls.at(-1)?.[0] as
      | { pluginId?: string; metadata?: { kind?: string } }
      | undefined;
    expect(call?.pluginId).not.toBe('example-web-prototype');
    expect(call?.metadata?.kind).not.toBe('prototype');
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
      expect(screen.getByTestId('entry-home-surface')).toBeTruthy();
      expect(screen.getByTestId('entry-project-project-new').textContent).toContain(
        'Fresh project',
      );
    });
    expect(window.location.pathname).toBe('/');
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
      expect(mockedDeleteProject).toHaveBeenCalledWith('project-new', null);
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

  it('switches to the picked working dir before uploading staged Home attachments', async () => {
    // Regression for the "picked working dir + staged attachment" case:
    // replaceProjectWorkingDir flips metadata.baseDir to the external folder,
    // so it must run BEFORE uploadProjectFiles — otherwise the staged files
    // land in the temporary managed .od/projects/<id> root and vanish once the
    // working dir flips. Asserting the call order locks the ordering in.
    mockedListProjects.mockResolvedValue([]);
    mockedReplaceProjectWorkingDir.mockResolvedValue(undefined as never);
    stubWorkspaceContext('ws-create', 'wm-create');
    const createContext = workspaceContextPayload('ws-create', 'wm-create').context;

    render(<App />);
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(([input]) =>
          String(input).includes('/api/workspace/context')),
      ).toBe(true);
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create project with working dir' }),
    );

    await waitFor(() => {
      expect(mockedReplaceProjectWorkingDir).toHaveBeenCalledTimes(1);
      expect(mockedUploadProjectFiles).toHaveBeenCalledTimes(1);
    });

    expect(mockedReplaceProjectWorkingDir).toHaveBeenCalledWith(
      'project-new',
      '/Users/me/external',
      'wd-token',
      createContext,
    );
    // Both target the same project id, and the working-dir handoff is ordered
    // strictly before the upload so the files land in the final tree.
    expect(mockedUploadProjectFiles.mock.calls[0]?.[0]).toBe('project-new');
    expect(mockedUploadProjectFiles.mock.calls[0]?.[3]).toEqual(createContext);
    const replaceOrder = mockedReplaceProjectWorkingDir.mock.invocationCallOrder[0]!;
    const uploadOrder = mockedUploadProjectFiles.mock.invocationCallOrder[0]!;
    expect(replaceOrder).toBeLessThan(uploadOrder);
  });

  it('persists Home context linked dirs into the project create metadata', async () => {
    mockedListProjects.mockResolvedValue([]);

    render(<App />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create project with context dirs' }),
    );

    await waitFor(() => {
      expect(mockedCreateProject).toHaveBeenCalled();
    });
    expect(mockedCreateProject.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          linkedDirs: [
            '/Users/me/existing',
            '/Users/me/reference',
            '/Users/me/local-code',
          ],
        }),
      }),
    );
  });

  it('short-circuits the upload + auto-send when the working-dir handoff fails', async () => {
    // Regression for the swallowed-failure case: the desktop working-dir token
    // has a ~60s TTL, so a slow user (or any rejected POST) makes
    // replaceProjectWorkingDir throw AFTER the project already exists. The old
    // code only logged a warning and then uploaded the staged attachments into
    // the managed root while the user believed their chosen folder was applied.
    // The fix surfaces a create-time error toast AND aborts the rest of the
    // submit path so the first run cannot proceed on a tree the user did not
    // choose.
    mockedListProjects.mockResolvedValue([]);
    mockedReplaceProjectWorkingDir.mockRejectedValue(
      new Error('working-dir token expired'),
    );

    render(<App />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create project with working dir' }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Couldn't apply the chosen folder/i)).toBeTruthy();
    });
    expect(mockedReplaceProjectWorkingDir).toHaveBeenCalledTimes(1);
    // The handoff failed, so the staged attachments must NOT be uploaded into
    // the managed `.od/projects/<id>` root the user did not pick.
    expect(mockedUploadProjectFiles).not.toHaveBeenCalled();
  });

  it('surfaces a toast instead of silently bouncing when opening a missing project', async () => {
    mockedListProjects.mockResolvedValue([]);
    mockedGetProject.mockResolvedValue(null);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open missing project' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'This project has been deleted or no longer exists.',
      );
    });
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByTestId('project-view')).toBeNull();
  });

  it('renders the catalog title on the first project frame instead of the local placeholder', async () => {
    stubWorkspaceContext('ws-1', 'wm-1');
    mockedListProjects.mockResolvedValue([{
      id: 'project-shared',
      name: '共享项目',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-1',
      createdAt: 20,
      updatedAt: 20,
    }]);

    render(<App />);

    await screen.findByTestId('entry-project-project-shared');
    fireEvent.click(await screen.findByRole('button', { name: 'Open catalog project' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Catalog authority');
    });
    expect(window.location.pathname).toBe('/projects/project-shared');
    expect(mockedGetProject).not.toHaveBeenCalled();
  });

  it('uses a title hint only after loading the workspace-bound local row', async () => {
    stubWorkspaceContext('ws-1', 'wm-1');
    mockedListProjects.mockResolvedValue([]);
    mockedGetProject.mockResolvedValueOnce({
      id: 'project-shared',
      name: '共享项目',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-1',
      createdAt: 20,
      updatedAt: 20,
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open catalog project' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Catalog authority');
      expect(screen.getByTestId('project-workspace-id').textContent).toBe('ws-1');
    });
    expect(mockedGetProject).toHaveBeenCalledWith(
      'project-shared',
      workspaceContext('ws-1', 'wm-1'),
    );
  });

  it('keeps the original local-open behavior for an own unbound legacy project', async () => {
    stubWorkspaceContext('ws-1', 'wm-1');
    mockedListProjects.mockResolvedValue([{
      id: 'project-own',
      name: 'Legacy local name',
      skillId: null,
      designSystemId: null,
      createdAt: 20,
      updatedAt: 20,
    }]);

    render(<App />);

    await screen.findByTestId('entry-project-project-own');
    fireEvent.click(screen.getByRole('button', { name: 'Open own unbound project' }));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Own local project');
      expect(screen.getByTestId('project-workspace-id').textContent).toBe('unbound');
    });
    expect(mockedGetProject).not.toHaveBeenCalled();
  });

  it('rejects an authoritative card whose workspace/member scope is already stale', async () => {
    let activeWorkspaceId = 'ws-a';
    mockedListProjects.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([
                  workspaceContext('ws-a', 'member-ws-a'),
                  workspaceContext('ws-b', 'member-ws-b'),
                ])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload(
                    activeWorkspaceId,
                    `member-${activeWorkspaceId}`,
                  )
                : {},
        } as Response;
      }),
    );

    render(<App />);
    await waitFor(() => {
      expect(mockedListProjects.mock.calls.some(
        ([options]) => options?.workspaceContext?.workspaceId === 'ws-a',
      )).toBe(true);
    });

    activeWorkspaceId = 'ws-b';
    notifyWorkspaceContextRefresh({
      context: workspaceContext('ws-b', 'member-ws-b'),
    });
    await waitFor(() => {
      expect(mockedListProjects.mock.calls.some(
        ([options]) => options?.workspaceContext?.workspaceId === 'ws-b',
      )).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open workspace A project' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedGetProject).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByTestId('project-view')).toBeNull();
  });

  it('rejects an authoritative card from a previous member in the same workspace', async () => {
    let activeWorkspaceMemberId = 'member-ws-a';
    mockedListProjects.mockResolvedValue([]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      return {
        ok: true,
        json: async () =>
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([
                workspaceContext('ws-a', activeWorkspaceMemberId),
              ])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload('ws-a', activeWorkspaceMemberId)
              : {},
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) =>
        new URL(String(input), 'http://d.local').pathname.endsWith('/workspace/context'),
      ).length).toBeGreaterThanOrEqual(1);
    });

    activeWorkspaceMemberId = 'replacement-member';
    act(() => {
      notifyWorkspaceContextRefresh({
        context: workspaceContext('ws-a', activeWorkspaceMemberId),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open workspace A project' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedGetProject).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByTestId('project-view')).toBeNull();
  });

  it('ignores a stale non-authoritative title while opening the current bound row', async () => {
    stubWorkspaceContext('ws-b', 'member-ws-b');
    mockedListProjects.mockResolvedValue([{
      id: 'project-same',
      name: 'Workspace B current title',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-b',
      createdAt: 30,
      updatedAt: 30,
    }]);

    render(<App />);
    await screen.findByTestId('entry-project-project-same');
    fireEvent.click(screen.getByRole(
      'button',
      { name: 'Open stale own workspace A project' },
    ));

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe(
        'Workspace B current title',
      );
      expect(screen.getByTestId('project-workspace-id').textContent).toBe('ws-b');
    });
    expect(mockedGetProject).not.toHaveBeenCalled();
  });

  it('does not open a project bound to another workspace through a non-hint path', async () => {
    stubWorkspaceContext('ws-b', 'member-ws-b');
    const workspaceAProject: Project = {
      id: 'project-bound-a',
      name: 'Workspace A local',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-a',
      createdAt: 20,
      updatedAt: 20,
    };
    mockedListProjects.mockResolvedValue([workspaceAProject]);
    mockedGetProject.mockResolvedValue(workspaceAProject);

    render(<App />);
    fireEvent.click(await screen.findByRole(
      'button',
      { name: 'Open Workspace A local' },
    ));

    await waitFor(() => {
      expect(mockedGetProject).toHaveBeenCalledWith(
        'project-bound-a',
        workspaceContext('ws-b', 'member-ws-b'),
      );
    });
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByTestId('project-view')).toBeNull();
  });

  it('does not let an async open from workspace A navigate or overwrite same-id workspace B', async () => {
    let activeWorkspaceId = 'ws-a';
    const delayedAProject = deferred<Project | null>();
    mockedGetProject.mockReturnValueOnce(delayedAProject.promise);
    mockedListProjects.mockImplementation(async (options) => {
      const workspaceId = options?.workspaceContext?.workspaceId;
      if (workspaceId === 'ws-b') {
        return [{
          id: 'project-same',
          name: 'Workspace B local',
          skillId: null,
          designSystemId: null,
          workspaceId: 'ws-b',
          createdAt: 30,
          updatedAt: 30,
        }];
      }
      return [];
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/workspace/directory')) {
          return {
            ok: true,
            json: async () => workspaceDirectoryFixture([
              workspaceContext('ws-a', 'member-ws-a'),
              workspaceContext('ws-b', 'member-ws-b'),
            ]),
          } as Response;
        }
        if (pathname.endsWith('/workspace/context')) {
          return {
            ok: true,
            json: async () => workspaceContextPayload(
              activeWorkspaceId,
              `member-${activeWorkspaceId}`,
            ),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({}),
        } as Response;
      }),
    );

    render(<App />);
    await waitFor(() => {
      expect(mockedListProjects.mock.calls.some(
        ([options]) => options?.workspaceContext?.workspaceId === 'ws-a',
      )).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open workspace A project' }));
    activeWorkspaceId = 'ws-b';
    notifyWorkspaceContextRefresh({
      context: workspaceContext('ws-b', 'member-ws-b'),
    });
    await screen.findByTestId('entry-project-project-same');

    delayedAProject.resolve({
      id: 'project-same',
      name: 'Workspace A stale',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-a',
      createdAt: 20,
      updatedAt: 20,
    });
    await act(async () => {
      await delayedAProject.promise;
      await Promise.resolve();
    });

    expect(window.location.pathname).toBe('/');
    expect(screen.queryByTestId('project-view')).toBeNull();
    expect(screen.getByTestId('entry-project-project-same').textContent).toContain(
      'Workspace B local',
    );
  });

  it('rejects a delayed same-id open after workspace A to B to A returns to the same key', async () => {
    let activeWorkspaceId = 'ws-a';
    const delayedAProject = deferred<Project | null>();
    mockedGetProject.mockReturnValueOnce(delayedAProject.promise);
    mockedListProjects.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/workspace/directory')) {
          return {
            ok: true,
            json: async () => workspaceDirectoryFixture([
              workspaceContext('ws-a', 'member-ws-a'),
              workspaceContext('ws-b', 'member-ws-b'),
            ]),
          } as Response;
        }
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/context')
              ? workspaceContextPayload(
                  activeWorkspaceId,
                  `member-${activeWorkspaceId}`,
                )
              : {},
        } as Response;
      }),
    );

    render(<App />);
    await waitFor(() => {
      expect(mockedListProjects.mock.calls.some(
        ([options]) => options?.workspaceContext?.workspaceId === 'ws-a',
      )).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open workspace A project' }));

    activeWorkspaceId = 'ws-b';
    notifyWorkspaceContextRefresh({
      context: workspaceContext('ws-b', 'member-ws-b'),
    });
    await waitFor(() => {
      expect(mockedListProjects.mock.calls.some(
        ([options]) => options?.workspaceContext?.workspaceId === 'ws-b',
      )).toBe(true);
    });

    activeWorkspaceId = 'ws-a';
    act(() => {
      notifyWorkspaceContextRefresh({
        context: workspaceContext('ws-a', 'member-ws-a'),
      });
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    delayedAProject.resolve({
      id: 'project-same',
      name: 'Workspace A stale result',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-a',
      createdAt: 20,
      updatedAt: 20,
    });
    await act(async () => {
      await delayedAProject.promise;
      await Promise.resolve();
    });

    expect(window.location.pathname).toBe('/');
    expect(screen.queryByTestId('project-view')).toBeNull();
  });

  it('does not let an older catalog read roll back a newer card title', async () => {
    let projectListReads = 0;
    mockedListProjects.mockImplementation(async () => {
      const name = projectListReads === 0 ? '共享项目' : 'New card authority';
      projectListReads += 1;
      return [{
        id: 'project-shared',
        name,
        skillId: null,
        designSystemId: null,
        workspaceId: 'ws-1',
        createdAt: 20,
        updatedAt: 20,
      }];
    });
    const olderCatalog = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/workspace/directory')) {
          return {
            ok: true,
            json: async () => workspaceDirectoryFixture([
              workspaceContext('ws-1', 'wm-1'),
            ]),
          } as Response;
        }
        if (pathname.endsWith('/workspace/context')) {
          return {
            ok: true,
            json: async () => workspaceContextPayload('ws-1', 'wm-1'),
          } as Response;
        }
        if (pathname.endsWith('/workspace/projects/team')) {
          return olderCatalog.promise;
        }
        return {
          ok: true,
          json: async () => ({}),
        } as Response;
      }),
    );

    render(<App />);
    await screen.findByTestId('entry-project-project-shared');
    fireEvent.click(screen.getByRole('button', { name: 'Open catalog project' }));
    await screen.findByTestId('project-view');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog title' }));
    const listReadsBeforeBack = mockedListProjects.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    await waitFor(() => {
      expect(mockedListProjects.mock.calls.length).toBeGreaterThan(listReadsBeforeBack);
    });
    fireEvent.click(await screen.findByRole(
      'button',
      { name: 'Open updated catalog project' },
    ));
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('New card authority');
    });

    olderCatalog.resolve({
      ok: true,
      json: async () => ({
        projects: [{
          projectId: 'project-shared',
          ownerMemberId: 'owner',
          sharedAt: '2026-07-27T00:00:00.000Z',
          name: 'Old catalog title',
        }],
      }),
    } as Response);
    await act(async () => {
      await olderCatalog.promise;
      await Promise.resolve();
    });

    expect(screen.getByTestId('project-title').textContent).toBe('New card authority');
    expect(screen.getByTestId('project-authoritative-title').textContent).toBe(
      'New card authority',
    );
  });

  it('rejects an out-of-order older catalog response after a newer rename wins', async () => {
    mockedListProjects.mockResolvedValue([{
      id: 'project-shared',
      name: '共享项目',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-1',
      createdAt: 20,
      updatedAt: 20,
    }]);
    const olderCatalog = deferred<Response>();
    const newerCatalog = deferred<Response>();
    let catalogReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/workspace/directory')) {
          return {
            ok: true,
            json: async () => workspaceDirectoryFixture([
              workspaceContext('ws-1', 'wm-1'),
            ]),
          } as Response;
        }
        if (pathname.endsWith('/workspace/context')) {
          return {
            ok: true,
            json: async () => workspaceContextPayload('ws-1', 'wm-1'),
          } as Response;
        }
        if (pathname.endsWith('/workspace/projects/team')) {
          catalogReads += 1;
          return catalogReads === 1 ? olderCatalog.promise : newerCatalog.promise;
        }
        return {
          ok: true,
          json: async () => ({}),
        } as Response;
      }),
    );

    render(<App />);
    await screen.findByTestId('entry-project-project-shared');
    fireEvent.click(screen.getByRole('button', { name: 'Open catalog project' }));
    await screen.findByTestId('project-view');

    const refresh = screen.getByRole('button', { name: 'Refresh catalog title' });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    await waitFor(() => expect(catalogReads).toBe(2));

    newerCatalog.resolve({
      ok: true,
      json: async () => ({
        projects: [{
          projectId: 'project-shared',
          ownerMemberId: 'owner',
          sharedAt: '2026-07-27T00:00:00.000Z',
          name: 'New catalog rename',
        }],
      }),
    } as Response);
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('New catalog rename');
    });

    olderCatalog.resolve({
      ok: true,
      json: async () => ({
        projects: [{
          projectId: 'project-shared',
          ownerMemberId: 'owner',
          sharedAt: '2026-07-27T00:00:00.000Z',
          name: 'Old catalog title',
        }],
      }),
    } as Response);
    await act(async () => {
      await olderCatalog.promise;
      await Promise.resolve();
    });
    expect(screen.getByTestId('project-title').textContent).toBe('New catalog rename');
  });

  it('calibrates a deep-linked local placeholder from the other-owner hub catalog', async () => {
    window.history.replaceState(null, '', '/projects/project-shared');
    mockedListProjects.mockResolvedValue([{
      id: 'project-shared',
      name: '共享项目',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-1',
      createdAt: 20,
      updatedAt: 999,
    }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/workspace/directory')) {
          return {
            ok: true,
            json: async () => workspaceDirectoryFixture([
              workspaceContext('ws-1', 'wm-1'),
            ]),
          } as Response;
        }
        if (pathname.endsWith('/workspace/context')) {
          return {
            ok: true,
            json: async () => workspaceContextPayload('ws-1', 'wm-1'),
          } as Response;
        }
        if (pathname.endsWith('/workspace/projects/team')) {
          return {
            ok: true,
            json: async () => ({
              projects: [{
                projectId: 'project-shared',
                ownerMemberId: 'wm-owner',
                sharedAt: '2026-07-27T00:00:00.000Z',
                name: 'Catalog rename',
                updatedAt: 42,
              }],
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({}),
        } as Response;
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Catalog rename');
      expect(screen.getByTestId('project-authoritative-title').textContent).toBe('Catalog rename');
      expect(screen.getByTestId('project-workspace-id').textContent).toBe('ws-1');
    });
  });

  it('opens the seeded brand extraction conversation after creating a design system', async () => {
    const brandProject: Project = {
      id: 'brand-acme',
      name: 'acme.com Design System',
      skillId: null,
      designSystemId: null,
      createdAt: 1778244000000,
      updatedAt: 1778244000000,
      metadata: { kind: 'brand', importedFrom: 'brand-extraction', brandId: 'acme' },
    };
    window.history.replaceState(null, '', '/design-systems/create');
    mockedListProjects.mockResolvedValue([]);
    mockedGetProject.mockResolvedValue(brandProject);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, _init?: unknown) => {
        if (typeof input === 'string' && input === '/api/brands') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'acme',
              projectId: brandProject.id,
              conversationId: 'conv-brand-acme',
              sourceUrl: 'https://acme.com/',
              status: 'extracting',
            }),
          } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }),
    );

    render(<App />);

    fireEvent.change(await screen.findByPlaceholderText('https://github.com/org/repo'), {
      target: { value: 'https://acme.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue to generation/i }));

    await waitFor(() => {
      expect(screen.getByTestId('project-route-conversation').textContent).toBe('conv-brand-acme');
    });
    expect(window.location.pathname).toBe(`/projects/${brandProject.id}/conversations/conv-brand-acme`);
  });
});
