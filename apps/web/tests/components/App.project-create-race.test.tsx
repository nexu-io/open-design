// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import { notifyAmrLoginStatusChanged } from '../../src/components/amrLoginPolling';
import type {
  ProjectNameAuthorityResolution,
  ProjectRenameFenceToken,
} from '../../src/components/ProjectView';
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
  createDesignSystemProjectFromProject,
  createProject,
  createPluginShareProject,
  deleteProject,
  duplicateProject,
  getProject,
  invalidatePluginCatalogCache,
  listProjects,
  listTemplates,
  patchProject,
} from '../../src/state/projects';
import {
  WORKSPACE_CONTEXT_REFRESH_EVENT,
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  currentWorkspaceAccountGeneration,
  workspaceIdentityCacheKey,
} from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import {
  projectDisplaySnapshotKey,
  readProjectDisplaySnapshot,
  resetProjectDisplaySnapshots,
  writeProjectDisplaySnapshot,
} from '../../src/state/project-display-cache';
import type { AmrAuthRetryContinuation } from '../../src/runtime/amr-auth-retry-continuation';
import type { VelaLoginStatus } from '../../src/providers/daemon';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

const workspaceInvalidationHarness = vi.hoisted(() => ({
  handlers: [] as Array<Record<string, (payload: any) => void>>,
  onActive: [] as Array<() => void>,
}));

const iframePoolHarness = vi.hoisted(() => ({
  evictMatching: vi.fn(),
  evictProject: vi.fn(),
}));

const projectViewRenameFenceHarness = vi.hoisted(() => ({
  token: null as ProjectRenameFenceToken | null,
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn((
    handlers: Record<string, (payload: any) => void>,
    options?: { onActive?: () => void },
  ) => {
    workspaceInvalidationHarness.handlers.push(handlers);
    if (options?.onActive) workspaceInvalidationHarness.onActive.push(options.onActive);
    return { connected: false };
  }),
}));

vi.mock('../../src/components/IframeKeepAlivePool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/components/IframeKeepAlivePool')>()),
  useIframeKeepAlivePool: () => ({
    attach: vi.fn(),
    release: vi.fn(),
    evict: vi.fn(),
    evictProject: iframePoolHarness.evictProject,
    evictMatching: iframePoolHarness.evictMatching,
    subscribe: vi.fn(() => () => {}),
    revision: vi.fn(() => 0),
  }),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    onCreateProject,
    onCreatePluginShareProject,
    onDeleteProject,
    onImportFolderResponse,
    onOpenProject,
    onRenameProject,
    onOpenSettings,
    onRefreshAgents,
    agents,
    amrLoggedIn,
    projects,
    projectsLoading,
  }: {
    onCreateProject: (input: unknown) => boolean | Promise<boolean>;
    onCreatePluginShareProject: (
      pluginId: string,
      action: 'publish-github' | 'contribute-open-design',
    ) => Promise<unknown>;
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
    onRenameProject?: (id: string, name: string) => Promise<void> | void;
    onOpenSettings: () => void;
    onRefreshAgents: () => void | Promise<void>;
    agents: AgentInfo[];
    amrLoggedIn?: boolean | null;
    projects: Project[];
    projectsLoading?: boolean;
  }) => (
    <main>
      <div data-testid="entry-home-surface" />
      <div data-testid="amr-login-status">{String(amrLoggedIn)}</div>
      <div data-testid="entry-projects-loading">{String(Boolean(projectsLoading))}</div>
      <button
        type="button"
        onClick={() => {
          void Promise.resolve(onCreateProject({
            name: 'Fresh project',
            skillId: null,
            designSystemId: null,
            metadata: { kind: 'prototype' },
          })).catch(() => {});
        }}
      >
        Create project
      </button>
      <button
        type="button"
        onClick={() => {
          void Promise.resolve(onCreateProject({
            name: 'Prompted project',
            skillId: null,
            designSystemId: null,
            pendingPrompt: 'Build the retained artifact prompt',
            autoSendFirstMessage: true,
            metadata: { kind: 'prototype' },
          })).catch(() => {});
        }}
      >
        Create prompted project
      </button>
      <button
        type="button"
        onClick={() => void onCreatePluginShareProject(
          'plugin-source',
          'publish-github',
        )}
      >
        Create plugin share project
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
      <button type="button" onClick={onOpenSettings}>
        Open settings from home
      </button>
      <button type="button" onClick={() => void onOpenProject('project-missing')}>
        Open missing project
      </button>
      <button
        type="button"
        onClick={() => projects[0] && void onRenameProject?.(projects[0].id, 'Rename A')}
      >
        Rename first project A
      </button>
      <button
        type="button"
        onClick={() => projects[0] && void onRenameProject?.(projects[0].id, 'Rename B')}
      >
        Rename first project B
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
    onCreateDesignSystemFromProject,
    onDuplicateProject,
    onProjectsRefresh,
    onProjectChange,
    onProjectRenameStarted,
    onProjectRenameSettled,
    project,
    routeConversationId,
    authoritativeProjectName,
    projectAuthorizationKey,
    resolveAuthoritativeProjectName,
    amrAuthRetryContinuation,
    onArmAmrAuthRetryContinuation,
    onConsumeAmrAuthRetryContinuation,
    onOpenAmrSettings,
    onOpenSettings,
    workspaceContextOverride,
  }: {
    onBack: () => void;
    onCreateProjectFromDesignSystem?: (designSystemId: string, title: string) => Promise<void> | void;
    onCreateDesignSystemFromProject?: (
      sourceProjectId: string,
      input: { name?: string; pendingPrompt?: string },
    ) => Promise<void> | void;
    onDuplicateProject?: (
      sourceProjectId: string,
      input?: { name?: string },
    ) => Promise<void> | void;
    onProjectsRefresh: () => Promise<void>;
    onProjectChange: (project: Project) => void;
    onProjectRenameStarted?: (project: Project) => ProjectRenameFenceToken | null;
    onProjectRenameSettled?: (
      token: ProjectRenameFenceToken | null,
      project: Project,
    ) => void;
    project: Project;
    routeConversationId?: string | null;
    authoritativeProjectName?: string;
    projectAuthorizationKey?: string;
    resolveAuthoritativeProjectName?: (
      projectId: string,
      expectedAuthorizationKey: string,
    ) => Promise<ProjectNameAuthorityResolution>;
    amrAuthRetryContinuation?: AmrAuthRetryContinuation | null;
    onArmAmrAuthRetryContinuation?: (
      continuation: Omit<AmrAuthRetryContinuation, 'accountIdAtArm' | 'createdAtMs'>,
    ) => void;
    onConsumeAmrAuthRetryContinuation?: (
      continuation: AmrAuthRetryContinuation,
    ) => boolean;
    onOpenAmrSettings?: () => void;
    onOpenSettings?: () => void;
    workspaceContextOverride?: WorkspaceCollabContext | null;
  }) => (
    <main data-testid="project-view">
      <span data-testid="project-title">{project.name}</span>
      <span data-testid="project-authoritative-title">{authoritativeProjectName ?? 'none'}</span>
      <span data-testid="project-workspace-id">{project.workspaceId ?? 'unbound'}</span>
      <span data-testid="project-route-workspace-context">
        {workspaceContextOverride
          ? `${workspaceContextOverride.workspaceId}:${workspaceContextOverride.workspaceMemberId}`
          : 'none'}
      </span>
      <span data-testid="project-route-conversation">{routeConversationId ?? 'none'}</span>
      <span data-testid="project-auth-continuation">
        {amrAuthRetryContinuation?.assistantId ?? 'none'}
      </span>
      <button type="button" onClick={onBack}>
        Back to projects
      </button>
      <button
        type="button"
        onClick={() => void onCreateDesignSystemFromProject?.(project.id, {
          name: 'Derived design system',
          pendingPrompt: 'Extract the retained design system prompt',
        })}
      >
        Extract design system project
      </button>
      <button
        type="button"
        onClick={() => void onDuplicateProject?.(project.id, {
          name: 'Scoped duplicate',
        })}
      >
        Duplicate project
      </button>
      <button type="button" onClick={onOpenSettings}>
        Open settings from project
      </button>
      <button type="button" onClick={() => void onProjectsRefresh()}>
        Refresh projects
      </button>
      <button
        type="button"
        onClick={() => {
          const optimistic = {
            ...project,
            name: 'After local rename',
            updatedAt: project.updatedAt + 1,
          };
          projectViewRenameFenceHarness.token = onProjectRenameStarted?.(optimistic) ?? null;
          onProjectChange(optimistic);
        }}
      >
        Rename current project
      </button>
      <button
        type="button"
        onClick={() => onProjectChange({
          ...project,
          name: 'Remote rename',
          updatedAt: project.updatedAt + 1,
        })}
      >
        Apply remote project rename
      </button>
      <button
        type="button"
        onClick={() => onProjectRenameSettled?.(projectViewRenameFenceHarness.token, project)}
      >
        Settle current project rename
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
      <button
        type="button"
        onClick={() => onArmAmrAuthRetryContinuation?.({
          projectId: project.id,
          conversationId: routeConversationId ?? 'conv-auth',
          assistantId: 'assistant-auth-failure',
          originMountId: 'origin-mount',
          workspaceIdentityKey: workspaceIdentityCacheKey(workspaceContextOverride),
        })}
      >
        Arm auth continuation
      </button>
      <button
        type="button"
        onClick={() => {
          onArmAmrAuthRetryContinuation?.({
            projectId: project.id,
            conversationId: routeConversationId ?? 'conv-auth',
            assistantId: 'assistant-auth-failure',
            originMountId: 'origin-mount',
            workspaceIdentityKey: workspaceIdentityCacheKey(workspaceContextOverride),
          });
          onOpenAmrSettings?.();
        }}
      >
        Authorize in settings
      </button>
      <button
        type="button"
        disabled={!amrAuthRetryContinuation}
        onClick={() => {
          if (amrAuthRetryContinuation) {
            onConsumeAmrAuthRetryContinuation?.(amrAuthRetryContinuation);
          }
        }}
      >
        Consume auth continuation
      </button>
    </main>
  ),
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  WorkspaceTabsBar: ({
    activeProjectWorkspaceId,
    projects,
  }: {
    activeProjectWorkspaceId?: string | null;
    projects: Project[];
  }) => (
    <>
      <span data-testid="workspace-tabs-active-project-workspace">
        {activeProjectWorkspaceId === undefined
          ? 'unresolved'
          : activeProjectWorkspaceId ?? 'personal'}
      </span>
      {projects.map((project) => (
        <span key={project.id} data-testid={`workspace-tab-name-${project.id}`}>
          {project.name}
        </span>
      ))}
    </>
  ),
  openWorkspaceTab: () => {},
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="settings-surface">
      <button type="button" onClick={onClose}>
        Close settings
      </button>
    </div>
  ),
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
    createDesignSystemProjectFromProject: vi.fn(),
    createProject: vi.fn(),
    createPluginShareProject: vi.fn(),
    deleteProject: vi.fn(),
    duplicateProject: vi.fn(),
    getProject: vi.fn(),
    invalidatePluginCatalogCache: vi.fn(actual.invalidatePluginCatalogCache),
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
const mockedCreateDesignSystemProjectFromProject = vi.mocked(createDesignSystemProjectFromProject);
const mockedCreateProject = vi.mocked(createProject);
const mockedCreatePluginShareProject = vi.mocked(createPluginShareProject);
const mockedDeleteProject = vi.mocked(deleteProject);
const mockedDuplicateProject = vi.mocked(duplicateProject);
const mockedGetProject = vi.mocked(getProject);
const mockedInvalidatePluginCatalogCache = vi.mocked(invalidatePluginCatalogCache);
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
    workspaceName: workspaceId,
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
    resetProjectDisplaySnapshots();
    workspaceInvalidationHarness.handlers.length = 0;
    workspaceInvalidationHarness.onActive.length = 0;
    projectViewRenameFenceHarness.token = null;
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
    mockedCreateDesignSystemProjectFromProject.mockResolvedValue({
      project: {
        ...freshProject,
        id: 'project-design-system',
        name: 'Derived design system',
      },
      conversationId: 'conv-design-system',
      designSystemId: 'derived-design-system',
      copiedFiles: [],
    });
    mockedCreatePluginShareProject.mockResolvedValue({
      ok: true,
      project: {
        ...freshProject,
        id: 'project-plugin-share',
        name: 'Plugin share project',
        pendingPrompt: 'Publish the retained plugin share prompt',
      },
      conversationId: 'conv-plugin-share',
      actionPluginId: 'od-plugin-publish-github',
      sourcePluginId: 'plugin-source',
      stagedPath: 'plugin-source',
      prompt: 'Publish the retained plugin share prompt',
      message: 'Prepared',
    });
    mockedDeleteProject.mockResolvedValue(true);
    mockedDuplicateProject.mockResolvedValue({
      project: {
        ...freshProject,
        id: 'project-duplicate',
        name: 'Scoped duplicate',
      },
      conversationId: 'conv-duplicate',
      copiedFiles: [],
    });
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
    resetProjectDisplaySnapshots();
    resetCoalescedGet();
    workspaceInvalidationHarness.handlers.length = 0;
    workspaceInvalidationHarness.onActive.length = 0;
  });

  it('routes mutations and limits global focus catch-up to Skills and Design Systems', async () => {
    const context = workspaceContext('ws-resources', 'wm-resources');
    stubWorkspaceContext(context.workspaceId, context.workspaceMemberId);
    mockedListProjects.mockResolvedValue([]);
    const pluginChanged = vi.fn();
    window.addEventListener('open-design:plugins-changed', pluginChanged);

    render(<App />);
    await waitFor(() => {
      expect(mockedFetchSkills).toHaveBeenCalled();
      expect(mockedFetchDesignSystems).toHaveBeenCalled();
    });
    mockedFetchSkills.mockClear();
    mockedFetchDesignTemplates.mockClear();
    mockedFetchDesignSystems.mockClear();
    mockedInvalidatePluginCatalogCache.mockClear();

    const currentHandlers = () => [...workspaceInvalidationHarness.handlers]
      .reverse()
      .find((handlers) => handlers['team-resources-changed'])!;

    act(() => currentHandlers()['team-resources-changed']?.({
      type: 'team-resources-changed',
      resourceKind: 'skill',
      resourceId: 'skill-1',
    }));
    await waitFor(() => expect(mockedFetchSkills).toHaveBeenCalledTimes(1));
    expect(mockedFetchDesignTemplates).toHaveBeenCalledTimes(1);
    expect(mockedFetchDesignSystems).not.toHaveBeenCalled();
    expect(mockedInvalidatePluginCatalogCache).not.toHaveBeenCalled();

    act(() => currentHandlers()['team-resources-changed']?.({
      type: 'team-resources-changed',
      resourceKind: 'design_system',
      resourceId: 'system-1',
    }));
    await waitFor(() => expect(mockedFetchDesignSystems).toHaveBeenCalledTimes(1));
    expect(mockedFetchDesignSystems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId,
      }),
      { forceTeamMaterialization: true },
    );
    expect(mockedFetchSkills).toHaveBeenCalledTimes(1);

    act(() => currentHandlers()['team-resources-changed']?.({
      type: 'team-resources-changed',
      resourceKind: 'plugin',
      resourceId: 'plugin-1',
    }));
    expect(mockedInvalidatePluginCatalogCache).toHaveBeenCalledWith({
      workspaceContext: expect.objectContaining({
        workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId,
      }),
      accountGeneration: currentWorkspaceAccountGeneration(),
    });
    expect(pluginChanged).toHaveBeenCalledTimes(1);

    // The shell closes missed-event gaps for its two global registries. It must
    // not broadcast a fake plugin mutation or evict project previews.
    const onActive = workspaceInvalidationHarness.onActive.at(-1);
    expect(onActive).toBeTypeOf('function');
    mockedFetchSkills.mockClear();
    mockedFetchDesignSystems.mockClear();
    mockedInvalidatePluginCatalogCache.mockClear();
    pluginChanged.mockClear();
    iframePoolHarness.evictMatching.mockClear();
    act(() => onActive?.());
    await waitFor(() => {
      expect(mockedFetchSkills).toHaveBeenCalledTimes(1);
      expect(mockedFetchDesignSystems).toHaveBeenCalledTimes(1);
    });
    expect(mockedInvalidatePluginCatalogCache).not.toHaveBeenCalled();
    expect(pluginChanged).not.toHaveBeenCalled();
    expect(iframePoolHarness.evictMatching).not.toHaveBeenCalled();
    window.removeEventListener('open-design:plugins-changed', pluginChanged);
  });

  it('supersedes the Team fallback snapshot when SSE opens, then refreshes once on later focus', async () => {
    const context = workspaceContext('ws-initial-catch-up', 'wm-initial-catch-up');
    stubWorkspaceContext(context.workspaceId, context.workspaceMemberId);
    mockedListProjects.mockResolvedValue([]);
    const skillsFirst = deferred<Awaited<ReturnType<typeof fetchSkills>>>();
    const systemsFirst = deferred<Awaited<ReturnType<typeof fetchDesignSystems>>>();
    mockedFetchSkills.mockImplementationOnce(() => skillsFirst.promise);
    mockedFetchDesignSystems.mockImplementation((issuedContext) => {
      if (issuedContext?.workspaceId === context.workspaceId) return systemsFirst.promise;
      return Promise.resolve([]);
    });

    render(<App />);
    await waitFor(() => {
      expect(mockedFetchSkills).toHaveBeenCalledTimes(1);
      expect(mockedFetchDesignSystems.mock.calls.filter(
        ([issued]) => issued?.workspaceId === context.workspaceId,
      )).toHaveLength(1);
    });

    const onActive = workspaceInvalidationHarness.onActive.at(-1);
    act(() => onActive?.());
    await waitFor(() => expect(mockedFetchSkills).toHaveBeenCalledTimes(2));
    expect(mockedFetchDesignSystems.mock.calls.filter(
      ([issued]) => issued?.workspaceId === context.workspaceId,
    )).toHaveLength(2);

    skillsFirst.resolve([]);
    systemsFirst.resolve([]);
    await act(async () => Promise.all([skillsFirst.promise, systemsFirst.promise]));
    mockedFetchSkills.mockResolvedValue([]);
    mockedFetchDesignSystems.mockResolvedValue([]);
    act(() => onActive?.());
    await waitFor(() => expect(mockedFetchSkills).toHaveBeenCalledTimes(3));
    expect(mockedFetchDesignSystems.mock.calls.filter(
      ([issued]) => issued?.workspaceId === context.workspaceId,
    )).toHaveLength(3);
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

  it('stores the Home auto-send prompt outside the project projection before a refresh can drop it', async () => {
    mockedListProjects.mockResolvedValue([]);
    mockedCreateProject.mockResolvedValue({
      project: { ...freshProject, name: 'Prompted project' },
      conversationId: 'conv-new',
    });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create prompted project' }));

    await screen.findByTestId('project-view');
    expect(window.sessionStorage.getItem('od:auto-send-first:project-new')).toBe('1');
    expect(window.sessionStorage.getItem('od:auto-send-prompt:project-new')).toBe(
      'Build the retained artifact prompt',
    );
  });

  it('stores the plugin-share prompt before its prepared project projection can refresh', async () => {
    mockedListProjects.mockResolvedValue([]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create plugin share project' }));

    await waitFor(() => expect(mockedCreatePluginShareProject).toHaveBeenCalled());
    await screen.findByTestId('project-view');
    expect(window.sessionStorage.getItem('od:auto-send-first:project-plugin-share')).toBe('1');
    expect(window.sessionStorage.getItem('od:auto-send-prompt:project-plugin-share')).toBe(
      'Publish the retained plugin share prompt',
    );
  });

  it.each([
    ['Local CLI', { ...baseConfig, mode: 'daemon' as const, agentId: 'codex' }],
    ['BYOK', { ...baseConfig, mode: 'api' as const, agentId: 'amr' }],
  ])(
    'lets %s create an unscoped project while AMR workspace discovery is unavailable',
    async (_label, executionConfig) => {
      mockedLoadConfig.mockReturnValue(executionConfig);
      mockedListProjects.mockResolvedValue([]);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const pathname = new URL(String(input), 'http://d.local').pathname;
          if (pathname.endsWith('/integrations/vela/status')) {
            return new Response(JSON.stringify({
              loggedIn: false,
              profile: 'default',
              user: null,
              configPath: '/test/vela.json',
            }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (pathname.endsWith('/workspace/directory')) {
            return new Promise<Response>(() => {});
          }
          return new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }),
      );

      render(<App />);
      await screen.findByText('false', { selector: '[data-testid="amr-login-status"]' });
      fireEvent.click(await screen.findByRole('button', { name: 'Create project' }));

      await waitFor(() => {
        expect(mockedCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({ workspaceContext: null }),
        );
      });
      expect(screen.getByTestId('project-title').textContent).toBe('Fresh project');
    },
  );

  it.each([
    ['Local CLI', 'loading', { ...baseConfig, mode: 'daemon' as const, agentId: 'codex' }],
    ['BYOK', 'unavailable', { ...baseConfig, mode: 'api' as const, agentId: 'amr' }],
  ])(
    'keeps %s project creation fail-closed for a signed-in account while Team workspace discovery is %s',
    async (_label, discoveryState, executionConfig) => {
      mockedLoadConfig.mockReturnValue(executionConfig);
      mockedListProjects.mockResolvedValue([]);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const pathname = new URL(String(input), 'http://d.local').pathname;
          if (pathname.endsWith('/integrations/vela/status')) {
            return new Response(JSON.stringify({
              loggedIn: true,
              profile: 'default',
              user: { id: 'account-team-member' },
              configPath: '/test/vela.json',
            }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (pathname.endsWith('/workspace/directory')) {
            if (discoveryState === 'loading') return new Promise<Response>(() => {});
            return new Response('{}', { status: 503 });
          }
          return new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }),
      );

      render(<App />);
      await screen.findByText('true', { selector: '[data-testid="amr-login-status"]' });
      fireEvent.click(await screen.findByRole('button', { name: 'Create project' }));

      await waitFor(() => {
        expect(mockedCreateProject).not.toHaveBeenCalled();
      });
    },
  );

  it('keeps AMR Cloud project creation fail-closed while workspace discovery is loading even when signed out', async () => {
    mockedLoadConfig.mockReturnValue({
      ...baseConfig,
      mode: 'daemon',
      agentId: 'amr',
    });
    mockedListProjects.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/integrations/vela/status')) {
          return new Response(JSON.stringify({
            loggedIn: false,
            profile: 'default',
            user: null,
            configPath: '/test/vela.json',
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (pathname.endsWith('/workspace/directory')) {
          return new Promise<Response>(() => {});
        }
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    render(<App />);
    await screen.findByText('false', { selector: '[data-testid="amr-login-status"]' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(mockedCreateProject).not.toHaveBeenCalled();
    });
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
    expect(window.sessionStorage.getItem('od:auto-send-first:project-new')).toBe('1');
    expect(window.sessionStorage.getItem('od:auto-send-prompt:project-new')).toContain('Slack');
  });

  it('stores the extraction prompt when converting an existing project into a design system', async () => {
    mockedListProjects.mockResolvedValue([existingProject]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Extract design system project' }));

    await waitFor(() => {
      expect(mockedCreateDesignSystemProjectFromProject).toHaveBeenCalledWith(
        'project-existing',
        expect.objectContaining({
          pendingPrompt: 'Extract the retained design system prompt',
        }),
        null,
      );
    });
    expect(window.sessionStorage.getItem('od:auto-send-first:project-design-system')).toBe('1');
    expect(window.sessionStorage.getItem('od:auto-send-prompt:project-design-system')).toBe(
      'Extract the retained design system prompt',
    );
  });

  it('duplicates from the source project persisted Workspace instead of the ambient shell Workspace', async () => {
    const sourceProject = { ...existingProject, workspaceId: 'ws-source' };
    window.history.replaceState(null, '', `/projects/${sourceProject.id}`);
    mockedListProjects.mockResolvedValue([sourceProject]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([
                  workspaceContext('ws-source', 'member-source'),
                  workspaceContext('ws-ambient', 'member-ambient'),
                ])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload('ws-ambient', 'member-ambient')
                : {},
        } as Response;
      }),
    );

    render(<App />);
    await screen.findByTestId('project-view');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate project' }));

    await waitFor(() => {
      expect(mockedDuplicateProject).toHaveBeenCalledWith(
        sourceProject.id,
        { name: 'Scoped duplicate' },
        expect.objectContaining({
          workspaceId: 'ws-source',
          workspaceMemberId: 'member-source',
        }),
      );
    });
  });

  it('creates a design-system copy in the source project persisted Workspace', async () => {
    const sourceProject = { ...existingProject, workspaceId: 'ws-source' };
    window.history.replaceState(null, '', `/projects/${sourceProject.id}`);
    mockedListProjects.mockResolvedValue([sourceProject]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([
                  workspaceContext('ws-source', 'member-source'),
                  workspaceContext('ws-ambient', 'member-ambient'),
                ])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload('ws-ambient', 'member-ambient')
                : {},
        } as Response;
      }),
    );

    render(<App />);
    await screen.findByTestId('project-view');
    fireEvent.click(screen.getByRole('button', { name: 'Extract design system project' }));

    await waitFor(() => {
      expect(mockedCreateDesignSystemProjectFromProject).toHaveBeenCalledWith(
        sourceProject.id,
        expect.objectContaining({
          pendingPrompt: 'Extract the retained design system prompt',
        }),
        expect.objectContaining({
          workspaceId: 'ws-source',
          workspaceMemberId: 'member-source',
        }),
      );
    });
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

  it('retains the exact card-opening context while the ambient workspace revalidates', async () => {
    const workspaceProject: Project = {
      id: 'project-opening-witness',
      name: 'Workspace project',
      skillId: null,
      designSystemId: null,
      workspaceId: 'ws-1',
      createdAt: 20,
      updatedAt: 20,
    };
    const pendingDirectory = new Promise<Response>(() => {});
    let blockDirectory = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        if (blockDirectory) return pendingDirectory;
        return new Response(JSON.stringify(
          workspaceDirectoryFixture([workspaceContext('ws-1', 'wm-1')]),
        ), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (pathname.endsWith('/workspace/context')) {
        return new Response(JSON.stringify(workspaceContextPayload('ws-1', 'wm-1')), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));
    mockedListProjects.mockResolvedValue([workspaceProject]);

    render(<App />);

    await screen.findByTestId(`entry-project-${workspaceProject.id}`);
    fireEvent.click(screen.getByRole('button', { name: `Open ${workspaceProject.name}` }));
    await waitFor(() => {
      expect(screen.getByTestId('project-route-workspace-context').textContent).toBe(
        'ws-1:wm-1',
      );
    });

    blockDirectory = true;
    await act(async () => {
      window.dispatchEvent(new Event(WORKSPACE_CONTEXT_REFRESH_EVENT));
      await Promise.resolve();
    });

    expect(window.location.pathname).toBe(`/projects/${workspaceProject.id}`);
    expect(screen.getByTestId('project-route-workspace-context').textContent).toBe(
      'ws-1:wm-1',
    );
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

  it('waits for exact current Workspace authority before opening a boot-visible bound project', async () => {
    const directoryResponse = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/workspace/directory')) return directoryResponse.promise;
        return Promise.resolve({
          ok: true,
          json: async () => pathname.endsWith('/workspace/context')
            ? workspaceContextPayload('ws-1', 'wm-1')
            : {},
        } as Response);
      }),
    );
    mockedListProjects.mockResolvedValue([{
      ...existingProject,
      workspaceId: 'ws-1',
    }]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedGetProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('workspace-tabs-active-project-workspace').textContent).toBe(
      'unresolved',
    );

    await act(async () => {
      directoryResponse.resolve({
        ok: true,
        json: async () => workspaceDirectoryFixture([
          workspaceContext('ws-1', 'wm-1'),
        ]),
      } as Response);
      await directoryResponse.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('workspace-tabs-active-project-workspace').textContent).toBe(
        'ws-1',
      );
    });
    expect(mockedGetProject).not.toHaveBeenCalled();
  });

  it('opens a known unbound local project without waiting for cloud Workspace discovery', async () => {
    const directoryResponse = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/workspace/directory')) return directoryResponse.promise;
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        } as Response);
      }),
    );
    mockedListProjects.mockResolvedValue([existingProject]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));

    await screen.findByTestId('project-view');
    expect(mockedGetProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('project-workspace-id').textContent).toBe('unbound');
  });

  it('cancels a pending boot-card open when the selected Workspace changes', async () => {
    const directoryResponse = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/workspace/directory')) return directoryResponse.promise;
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        } as Response);
      }),
    );
    mockedListProjects.mockResolvedValue([{
      ...existingProject,
      workspaceId: 'ws-a',
    }]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      notifyWorkspaceContextRefresh({
        context: workspaceContext('ws-b', 'wm-b'),
      });
    });
    await act(async () => {
      directoryResponse.resolve({
        ok: true,
        json: async () => workspaceDirectoryFixture([
          workspaceContext('ws-a', 'wm-a'),
        ]),
      } as Response);
      await directoryResponse.promise;
      await Promise.resolve();
    });

    expect(mockedGetProject).not.toHaveBeenCalled();
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

  it('patches recent projects and the workspace tab from an exact remote rename signal', async () => {
    const sharedProject: Project = {
      ...existingProject,
      id: 'project-shared',
      name: 'Before rename',
      workspaceId: 'ws-1',
    };
    mockedListProjects.mockResolvedValue([sharedProject]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return new Response(JSON.stringify(workspaceDirectoryFixture([
          workspaceContext('ws-1', 'wm-viewer'),
        ])), { status: 200 });
      }
      if (pathname.endsWith('/workspace/context')) {
        return new Response(JSON.stringify(
          workspaceContextPayload('ws-1', 'wm-viewer'),
        ), { status: 200 });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        return new Response(JSON.stringify({
          projects: [{
            projectId: sharedProject.id,
            ownerMemberId: 'wm-owner',
            name: 'After rename',
          }],
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));

    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('entry-project-project-shared').textContent).toContain(
        'Before rename',
      );
      expect(screen.getByTestId('workspace-tab-name-project-shared').textContent).toBe(
        'Before rename',
      );
    });

    const metadataHandler = workspaceInvalidationHarness.handlers
      .map((handlers) => handlers['team-projects-changed'])
      .find((handler) => typeof handler === 'function');
    expect(metadataHandler).toBeTypeOf('function');
    act(() => metadataHandler!({
      type: 'team-projects-changed',
      projectId: sharedProject.id,
      kind: 'metadata',
    }));

    await waitFor(() => {
      expect(screen.getByTestId('entry-project-project-shared').textContent).toContain(
        'After rename',
      );
      expect(screen.getByTestId('workspace-tab-name-project-shared').textContent).toBe(
        'After rename',
      );
    });
  });

  it('silently reconciles the active project list after a remote share or move', async () => {
    const beforeMove: Project = {
      ...existingProject,
      id: 'project-before-move',
      name: 'Before remote move',
      workspaceId: 'ws-1',
    };
    const afterMove: Project = {
      ...existingProject,
      id: 'project-after-move',
      name: 'After remote move',
      workspaceId: 'ws-1',
    };
    const refreshed = deferred<Project[]>();
    let reads = 0;
    let catalogInvalidated = false;
    mockedListProjects.mockImplementation(async () => {
      reads += 1;
      return catalogInvalidated ? refreshed.promise : [beforeMove];
    });
    stubWorkspaceContext('ws-1', 'wm-viewer');

    render(<App />);
    await screen.findByTestId(`entry-project-${beforeMove.id}`);
    expect(screen.getByTestId('entry-projects-loading').textContent).toBe('false');
    await act(async () => {
      await Promise.resolve();
    });
    const readsBeforeInvalidation = reads;

    const catalogHandler = workspaceInvalidationHarness.handlers
      .map((handlers) => handlers['team-projects-changed'])
      .find((handler) => typeof handler === 'function');
    expect(catalogHandler).toBeTypeOf('function');
    act(() => {
      catalogInvalidated = true;
      catalogHandler!({
        type: 'team-projects-changed',
        projectId: beforeMove.id,
        kind: 'catalog',
      });
    });

    await waitFor(() => expect(reads).toBe(readsBeforeInvalidation + 1));
    // A stale-while-revalidate refresh must not replace usable rows with a
    // full-page loader while the exact Workspace identity is unchanged.
    expect(screen.getByTestId(`entry-project-${beforeMove.id}`)).toBeTruthy();
    expect(screen.getByTestId('entry-projects-loading').textContent).toBe('false');

    await act(async () => {
      refreshed.resolve([afterMove]);
      await refreshed.promise;
    });
    await waitFor(() => {
      expect(screen.queryByTestId(`entry-project-${beforeMove.id}`)).toBeNull();
      expect(screen.getByTestId(`entry-project-${afterMove.id}`)).toBeTruthy();
    });
  });

  it('keeps current, recent, and tab projections on the newest targeted rename response', async () => {
    const sharedProject: Project = {
      ...existingProject,
      id: 'project-shared',
      name: 'Before rename',
      workspaceId: 'ws-1',
    };
    mockedListProjects.mockResolvedValue([sharedProject]);
    const olderMetadataRefresh = deferred<Response>();
    const newerMetadataRefresh = deferred<Response>();
    let catalogReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return new Response(JSON.stringify(workspaceDirectoryFixture([
          workspaceContext('ws-1', 'wm-viewer'),
        ])), { status: 200 });
      }
      if (pathname.endsWith('/workspace/context')) {
        return new Response(JSON.stringify(
          workspaceContextPayload('ws-1', 'wm-viewer'),
        ), { status: 200 });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        catalogReads += 1;
        if (catalogReads === 1) {
          return new Response(JSON.stringify({ projects: [{
            projectId: sharedProject.id,
            ownerMemberId: 'wm-owner',
            name: 'Before rename',
          }] }), { status: 200 });
        }
        return catalogReads === 2
          ? olderMetadataRefresh.promise
          : newerMetadataRefresh.promise;
      }
      return new Response('{}', { status: 200 });
    }));

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Before rename' }));
    await screen.findByTestId('project-view');
    await waitFor(() => expect(catalogReads).toBe(1));

    const metadataHandler = workspaceInvalidationHarness.handlers
      .map((handlers) => handlers['team-projects-changed'])
      .find((handler) => typeof handler === 'function');
    expect(metadataHandler).toBeTypeOf('function');
    act(() => {
      metadataHandler!({
        type: 'team-projects-changed',
        projectId: sharedProject.id,
        kind: 'metadata',
      });
      metadataHandler!({
        type: 'team-projects-changed',
        projectId: sharedProject.id,
        kind: 'metadata',
      });
    });

    await waitFor(() => expect(catalogReads).toBe(3));
    newerMetadataRefresh.resolve(new Response(JSON.stringify({
      projects: [{
        projectId: sharedProject.id,
        ownerMemberId: 'wm-owner',
        name: 'Newest rename',
        updatedAt: 3,
      }],
    }), { status: 200 }));
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Newest rename');
      expect(screen.getByTestId('workspace-tab-name-project-shared').textContent).toBe(
        'Newest rename',
      );
    });

    olderMetadataRefresh.resolve(new Response(JSON.stringify({
      projects: [{
        projectId: sharedProject.id,
        ownerMemberId: 'wm-owner',
        name: 'Older rename',
        updatedAt: 2,
      }],
    }), { status: 200 }));
    await act(async () => {
      await olderMetadataRefresh.promise;
      await Promise.resolve();
    });
    expect(screen.getByTestId('project-title').textContent).toBe('Newest rename');
    expect(screen.getByTestId('workspace-tab-name-project-shared').textContent).toBe(
      'Newest rename',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    await waitFor(() => {
      expect(screen.getByTestId('entry-project-project-shared').textContent).toContain(
        'Newest rename',
      );
    });
  });

  it('projects a current-view rename into the tab and recent list immediately', async () => {
    mockedListProjects.mockResolvedValue([existingProject]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await screen.findByTestId('project-view');

    fireEvent.click(screen.getByRole('button', { name: 'Rename current project' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('After local rename');
      expect(screen.getByTestId('workspace-tab-name-project-existing').textContent).toBe(
        'After local rename',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    await waitFor(() => {
      expect(screen.getByTestId('entry-project-project-existing').textContent).toContain(
        'After local rename',
      );
    });
  });

  it('does not mistake an authoritative remote title update for a local rename fence', async () => {
    mockedListProjects
      .mockResolvedValueOnce([existingProject])
      .mockResolvedValue([{ ...existingProject, name: 'Newer server authority' }]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await screen.findByTestId('project-view');

    fireEvent.click(screen.getByRole('button', { name: 'Apply remote project rename' }));
    expect(screen.getByTestId('project-title').textContent).toBe('Remote rename');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Newer server authority');
      expect(screen.getByTestId('workspace-tab-name-project-existing').textContent).toBe(
        'Newer server authority',
      );
    });
  });

  it('releases a settled local rename fence to a newer authoritative server title', async () => {
    mockedListProjects
      .mockResolvedValueOnce([existingProject])
      .mockResolvedValue([{ ...existingProject, name: 'Other tab rename' }]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await screen.findByTestId('project-view');

    fireEvent.click(screen.getByRole('button', { name: 'Rename current project' }));
    expect(screen.getByTestId('project-title').textContent).toBe('After local rename');
    fireEvent.click(screen.getByRole('button', { name: 'Settle current project rename' }));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Other tab rename');
      expect(screen.getByTestId('workspace-tab-name-project-existing').textContent).toBe(
        'Other tab rename',
      );
    });
  });

  it('does not let a pre-rename list response roll back the project title or tab', async () => {
    const staleList = deferred<Project[]>();
    mockedListProjects
      .mockResolvedValueOnce([existingProject])
      .mockImplementationOnce(() => staleList.promise)
      .mockResolvedValue([{ ...existingProject, name: 'After local rename' }]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await screen.findByTestId('project-view');
    fireEvent.click(screen.getByRole('button', { name: 'Rename current project' }));
    expect(screen.getByTestId('project-title').textContent).toBe('After local rename');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
    await waitFor(() => expect(mockedListProjects).toHaveBeenCalledTimes(2));
    await act(async () => {
      staleList.resolve([existingProject]);
      await staleList.promise;
    });

    expect(screen.getByTestId('project-title').textContent).toBe('After local rename');
    expect(screen.getByTestId('workspace-tab-name-project-existing').textContent).toBe(
      'After local rename',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
    await waitFor(() => expect(mockedListProjects).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    await waitFor(() => {
      expect(screen.getByTestId('entry-project-project-existing').textContent).toContain(
        'After local rename',
      );
    });
  });

  it('serializes list renames and rolls repeated failures back to the confirmed name', async () => {
    const firstPatch = deferred<Project | null>();
    const secondPatch = deferred<Project | null>();
    mockedListProjects.mockResolvedValue([existingProject]);
    mockedPatchProject
      .mockImplementationOnce(() => firstPatch.promise)
      .mockImplementationOnce(() => secondPatch.promise);

    render(<App />);
    await screen.findByTestId('entry-project-project-existing');
    fireEvent.click(screen.getByRole('button', { name: 'Rename first project A' }));
    await waitFor(() => expect(mockedPatchProject).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Rename first project B' }));
    await act(async () => Promise.resolve());
    expect(mockedPatchProject).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('entry-project-project-existing').textContent).toContain('Rename B');

    await act(async () => {
      firstPatch.resolve(null);
      await firstPatch.promise;
    });
    await waitFor(() => expect(mockedPatchProject).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('entry-project-project-existing').textContent).toContain('Rename B');

    await act(async () => {
      secondPatch.resolve(null);
      await secondPatch.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('entry-project-project-existing').textContent).toContain(
        'Existing project',
      );
    });
  });

  it.each([
    [true, 'Newer Workspace A authority'],
    [false, 'Workspace A project'],
  ])(
    'settles a captured Workspace rename fence after switching away (success=%s)',
    async (succeeds, expectedName) => {
      const workspaceA = workspaceContext('ws-a', 'wm-a');
      const workspaceB = workspaceContext('ws-b', 'wm-b');
      const projectA: Project = {
        ...existingProject,
        id: 'project-a',
        name: 'Workspace A project',
        workspaceId: workspaceA.workspaceId,
      };
      const projectB: Project = {
        ...existingProject,
        id: 'project-b',
        name: 'Workspace B project',
        workspaceId: workspaceB.workspaceId,
      };
      const patch = deferred<Project | null>();
      let workspaceAAuthority = projectA;
      mockedPatchProject.mockImplementationOnce(() => patch.promise);
      mockedListProjects.mockImplementation(async (options) =>
        options?.workspaceContext?.workspaceId === workspaceB.workspaceId
          ? [projectB]
          : [workspaceAAuthority]);
      stubWorkspaceContext(workspaceA.workspaceId, workspaceA.workspaceMemberId);

      render(<App />);
      await screen.findByTestId('entry-project-project-a');
      fireEvent.click(screen.getByRole('button', { name: 'Rename first project A' }));
      await waitFor(() => expect(mockedPatchProject).toHaveBeenCalledTimes(1));

      act(() => notifyWorkspaceContextRefresh({ context: workspaceB }));
      await screen.findByTestId('entry-project-project-b');

      const persisted = succeeds
        ? { ...projectA, name: 'Rename A', updatedAt: projectA.updatedAt + 1 }
        : null;
      workspaceAAuthority = succeeds
        ? { ...projectA, name: 'Newer Workspace A authority', updatedAt: projectA.updatedAt + 2 }
        : projectA;
      await act(async () => {
        patch.resolve(persisted);
        await patch.promise;
      });

      act(() => notifyWorkspaceContextRefresh({ context: workspaceA }));
      await waitFor(() => {
        expect(screen.getByTestId('entry-project-project-a').textContent).toContain(expectedName);
      });
    },
  );

  it('keeps a newly created renamed project when the project route restores an older all snapshot', async () => {
    const context = workspaceContext('ws-1', 'wm-1');
    const olderProjects: Project[] = [
      {
        ...existingProject,
        id: 'project-old-a',
        name: 'Untitled A',
        workspaceId: context.workspaceId,
      },
      {
        ...existingProject,
        id: 'project-old-b',
        name: 'Untitled B',
        workspaceId: context.workspaceId,
      },
    ];
    const createdProject: Project = {
      ...freshProject,
      workspaceId: context.workspaceId,
    };
    mockedListProjects.mockResolvedValue(olderProjects);
    mockedCreateProject.mockResolvedValue({
      project: createdProject,
      conversationId: 'conv-new',
    });
    stubWorkspaceContext(context.workspaceId, context.workspaceMemberId);

    render(<App />);
    await screen.findByTestId('entry-project-project-old-a');

    // Project routes use the `all` projection. Reproduce the real browser
    // state where that projection predates the create performed on Home's
    // `recent` projection.
    writeProjectDisplaySnapshot({
      accountGeneration: currentWorkspaceAccountGeneration(),
      context,
      view: 'all',
    }, olderProjects);

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByTestId('project-view');
    fireEvent.click(screen.getByRole('button', { name: 'Rename current project' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('After local rename');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    await screen.findByTestId('entry-home-surface');
    expect(screen.getByTestId('entry-project-project-new').textContent).toContain(
      'After local rename',
    );
  });

  it('does not preserve a pending Workspace A project into Workspace B display snapshots', async () => {
    const workspaceA = workspaceContext('ws-a', 'wm-a');
    const workspaceB = workspaceContext('ws-b', 'wm-b');
    const workspaceAProject: Project = {
      ...freshProject,
      workspaceId: workspaceA.workspaceId,
    };
    const workspaceBProject: Project = {
      ...existingProject,
      id: 'project-workspace-b',
      name: 'Workspace B project',
      workspaceId: workspaceB.workspaceId,
    };
    mockedCreateProject.mockResolvedValue({
      project: workspaceAProject,
      conversationId: 'conv-new',
    });
    mockedListProjects.mockImplementation(async (options) =>
      options?.workspaceContext?.workspaceId === workspaceB.workspaceId
        ? [workspaceBProject]
        : []);
    stubWorkspaceContext(workspaceA.workspaceId, workspaceA.workspaceMemberId);

    render(<App />);
    await waitFor(() => expect(mockedListProjects).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByTestId('project-view');

    const accountGeneration = currentWorkspaceAccountGeneration();
    for (const view of ['recent', 'all'] as const) {
      writeProjectDisplaySnapshot({
        accountGeneration,
        context: workspaceB,
        view,
      }, [workspaceBProject]);
    }
    act(() => notifyWorkspaceContextRefresh({ context: workspaceB }));
    await waitFor(() => {
      expect(mockedListProjects.mock.calls.some(
        ([options]) => options?.workspaceContext?.workspaceId === workspaceB.workspaceId,
      )).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    await screen.findByTestId('entry-project-project-workspace-b');
    expect(screen.queryByTestId('entry-project-project-new')).toBeNull();
  });

  it('does not preserve a pending project across an account generation boundary', async () => {
    const context = workspaceContext('ws-1', 'wm-1');
    const createdProject: Project = {
      ...freshProject,
      workspaceId: context.workspaceId,
    };
    mockedListProjects.mockResolvedValue([]);
    mockedCreateProject.mockResolvedValue({
      project: createdProject,
      conversationId: 'conv-new',
    });
    stubWorkspaceContext(context.workspaceId, context.workspaceMemberId);

    render(<App />);
    await waitFor(() => expect(mockedListProjects).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByTestId('project-view');

    const previousGeneration = currentWorkspaceAccountGeneration();
    act(() => notifyWorkspaceContextRefresh());
    await waitFor(() => {
      expect(currentWorkspaceAccountGeneration()).toBeGreaterThan(previousGeneration);
    });
    const nextGeneration = currentWorkspaceAccountGeneration();

    await waitFor(() => {
      expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey({
        accountGeneration: nextGeneration,
        context,
        view: 'all',
      }))?.projects.some((project) => project.id === createdProject.id)).toBe(false);
    });
  });

  it('projects a current-view rename into inactive Personal and Team snapshots', async () => {
    const context = workspaceContext('ws-1', 'wm-1');
    const scopedProject = {
      ...existingProject,
      workspaceId: context.workspaceId,
    };
    mockedListProjects.mockResolvedValue([scopedProject]);
    stubWorkspaceContext(context.workspaceId, context.workspaceMemberId);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await screen.findByTestId('project-view');

    const accountGeneration = currentWorkspaceAccountGeneration();
    for (const view of ['drafts', 'team'] as const) {
      writeProjectDisplaySnapshot({ accountGeneration, context, view }, [scopedProject]);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Rename current project' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('After local rename');
    });

    for (const view of ['drafts', 'team'] as const) {
      expect(readProjectDisplaySnapshot(projectDisplaySnapshotKey({
        accountGeneration,
        context,
        view,
      }))).toMatchObject({
        projects: [{ id: scopedProject.id, name: 'After local rename' }],
        dirty: true,
      });
    }
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

  it('passes the active project persisted Workspace to the tab switch guard', async () => {
    stubWorkspaceContext('ws-1', 'wm-1');
    mockedListProjects.mockResolvedValue([{
      ...existingProject,
      workspaceId: 'ws-1',
    }]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-tabs-active-project-workspace').textContent).toBe(
        'ws-1',
      );
    });
  });

  it('owns one AMR auth continuation above ProjectView and clears it after consume, cancel, or route exit', async () => {
    stubWorkspaceContext('ws-1', 'wm-1');
    mockedListProjects.mockResolvedValue([{
      ...existingProject,
      workspaceId: 'ws-1',
    }]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await screen.findByTestId('project-view');

    fireEvent.click(screen.getByRole('button', { name: 'Arm auth continuation' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-auth-continuation').textContent).toBe(
        'assistant-auth-failure',
      );
    });

    const refreshedIdentity = deferred<void>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (
          pathname.endsWith('/workspace/directory')
          || pathname.endsWith('/workspace/context')
        ) {
          await refreshedIdentity.promise;
        }
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([workspaceContext('ws-1', 'wm-1')])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload('ws-1', 'wm-1')
                : {},
        } as Response;
      }),
    );
    act(() => notifyWorkspaceContextRefresh());
    await waitFor(() => expect(screen.queryByTestId('project-view')).toBeNull());
    await act(async () => {
      refreshedIdentity.resolve();
      await refreshedIdentity.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('project-auth-continuation').textContent).toBe(
        'assistant-auth-failure',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Consume auth continuation' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-auth-continuation').textContent).toBe('none');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Arm auth continuation' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-auth-continuation').textContent).toBe(
        'assistant-auth-failure',
      );
    });
    act(() => notifyAmrLoginStatusChanged('login-canceled'));
    await waitFor(() => {
      expect(screen.getByTestId('project-auth-continuation').textContent).toBe('none');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Arm auth continuation' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-auth-continuation').textContent).toBe(
        'assistant-auth-failure',
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-auth-continuation').textContent).toBe('none');
    });
  });

  it('preserves an exact retry through Settings and returns to its project after sign-in', async () => {
    mockedListProjects.mockResolvedValue([{
      ...existingProject,
      workspaceId: 'ws-1',
    }]);
    let loginStatus: VelaLoginStatus = {
      loggedIn: false,
      profile: 'test',
      user: null,
      configPath: '',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([workspaceContext('ws-1', 'wm-1')])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload('ws-1', 'wm-1')
                : pathname.endsWith('/integrations/vela/status')
                  ? loginStatus
                  : {},
        } as Response;
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Existing project' }));
    await screen.findByTestId('project-view');

    fireEvent.click(screen.getByRole('button', { name: 'Authorize in settings' }));
    await screen.findByTestId('settings-surface');
    expect(window.location.pathname).toBe('/settings');

    loginStatus = {
      loggedIn: true,
      profile: 'test',
      user: { id: 'account-a', email: 'account-a@example.com', plan: 'free' },
      configPath: '',
    };
    act(() => notifyAmrLoginStatusChanged());

    await waitFor(() => {
      expect(window.location.pathname).toBe('/projects/project-existing/conversations/conv-auth');
      expect(screen.getByTestId('project-auth-continuation').textContent).toBe(
        'assistant-auth-failure',
      );
    });
  });

  it('returns from full-page Settings to the exact project conversation and file route', async () => {
    window.history.replaceState(
      null,
      '',
      '/projects/project-existing/conversations/conv-exact/files/nested%2Fartifact.html',
    );
    stubWorkspaceContext('ws-1', 'wm-1');
    mockedListProjects.mockResolvedValue([{
      ...existingProject,
      workspaceId: 'ws-1',
    }]);

    render(<App />);
    await screen.findByTestId('project-view');

    fireEvent.click(screen.getByRole('button', { name: 'Open settings from project' }));
    await screen.findByTestId('settings-surface');
    expect(window.location.pathname).toBe('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        '/projects/project-existing/conversations/conv-exact/files/nested/artifact.html',
      );
      expect(screen.getByTestId('project-route-conversation').textContent).toBe('conv-exact');
    });
  });

  it('returns home when full-page Settings was opened from home', async () => {
    mockedListProjects.mockResolvedValue([]);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open settings from home' }));
    await screen.findByTestId('settings-surface');

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
      expect(screen.getByTestId('entry-home-surface')).toBeTruthy();
    });
  });

  it('fails closed instead of reopening a project after the Settings workspace changes', async () => {
    window.history.replaceState(
      null,
      '',
      '/projects/project-existing/conversations/conv-exact',
    );
    mockedListProjects.mockResolvedValue([{
      ...existingProject,
      workspaceId: 'ws-1',
    }]);
    const loginStatus: VelaLoginStatus = {
      loggedIn: true,
      profile: 'test',
      user: { id: 'account-a', email: 'account-a@example.com', plan: 'free' },
      configPath: '',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([
                  workspaceContext('ws-1', 'wm-1'),
                  workspaceContext('ws-2', 'wm-2'),
                ])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload('ws-1', 'wm-1')
                : pathname.endsWith('/integrations/vela/status')
                  ? loginStatus
                  : {},
        } as Response;
      }),
    );

    render(<App />);
    await screen.findByTestId('project-view');
    fireEvent.click(screen.getByRole('button', { name: 'Open settings from project' }));
    await screen.findByTestId('settings-surface');

    act(() => {
      notifyWorkspaceContextRefresh({
        context: workspaceContext('ws-2', 'wm-2'),
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
      expect(screen.getByTestId('entry-home-surface')).toBeTruthy();
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
