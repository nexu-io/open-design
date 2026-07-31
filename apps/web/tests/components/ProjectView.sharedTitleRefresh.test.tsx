// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProjectView,
  reconcileConversationRecoveryGlobalError,
  reconcileProjectDetail,
} from '../../src/components/ProjectView';
import type { ProjectNameAuthorityResolution } from '../../src/components/ProjectView';
import { useIframeKeepAlivePool } from '../../src/components/IframeKeepAlivePool';
import { useProjectCollab, type ProjectCollab } from '../../src/collab/useProjectCollab';
import { useProjectFileEvents, type ProjectEvent } from '../../src/providers/project-events';
import type {
  AgentInfo,
  AppConfig,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';
import {
  createConversation,
  getProject,
  listConversations,
  listMessages,
  loadTabs,
  ProjectConversationsHttpError,
} from '../../src/state/projects';
import { fetchPreviewComments } from '../../src/providers/registry';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: () => {},
  }),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
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

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/collab/useProjectCollab', async () => {
  const actual = await vi.importActual<typeof import('../../src/collab/useProjectCollab')>(
    '../../src/collab/useProjectCollab',
  );
  return {
    ...actual,
    useProjectCollab: vi.fn(),
  };
});

vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: (
    projectId: string,
    workspaceContext: WorkspaceCollabContext | null,
    persistedWorkspaceId: string | null | undefined,
  ) => (
    workspaceContext && persistedWorkspaceId === workspaceContext.workspaceId
      ? {
          loading: false,
          scope: {
            kind: workspaceContext.workspaceType,
            projectId,
            workspaceId: workspaceContext.workspaceId,
            visibility: workspaceContext.workspaceType,
            context: workspaceContext,
          },
        }
      : {
          loading: false,
          scope: {
            kind: 'unbound',
            projectId,
            workspaceId: null,
            context: null,
          },
        }
  ),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn(),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn(),
    getTemplate: vi.fn(),
    patchPreviewCommentStatus: vi.fn(),
    upsertPreviewComment: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    createConversation: vi.fn(),
    getProject: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn(),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: ({
    projectName,
    focusMode = false,
    onFocusModeChange,
  }: {
    projectName: string;
    focusMode?: boolean;
    onFocusModeChange?: (focused: boolean) => void;
  }) => (
    <div data-project-name={projectName} data-testid="file-workspace">
      {focusMode ? (
        <button
          type="button"
          data-testid="workspace-focus-toggle"
          onClick={() => onFocusModeChange?.(false)}
        >
          show chat
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({ error }: { error?: string | null }) => (
    <div data-testid="chat-pane">
      {error ? <span data-testid="chat-error">{error}</span> : null}
    </div>
  ),
}));

const mockedUseIframeKeepAlivePool = vi.mocked(useIframeKeepAlivePool);
const mockedUseProjectCollab = vi.mocked(useProjectCollab);
const mockedUseProjectFileEvents = vi.mocked(useProjectFileEvents);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedGetProject = vi.mocked(getProject);

const onProjectChangeMock = vi.fn();

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

// The state a member's web sits in right after deep-linking into a
// not-yet-pulled team-shared project: the daemon answered `getProject` with
// the placeholder record `ensureSharedProjectPlaceholder` registered, and
// App.tsx put that placeholder name into its `projects` state (sidebar + tab
// title both render it).
const project: Project = {
  id: 'project-1',
  name: '共享项目',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const conversation: Conversation = {
  id: 'conv-1',
  projectId: project.id,
  title: null,
  createdAt: 1,
  updatedAt: 1,
};

/** Member (non-owner) side of a team-shared project. */
function sharedMemberCollab(overrides?: Partial<ProjectCollab>): ProjectCollab {
  return {
    enabled: true,
    member: { memberId: 'member-1', name: 'Member' },
    present: [],
    publishedVersion: 3,
    syncState: 'synced',
    viewerOnly: true,
    writerAuthority: 'denied',
    isOwner: false,
    isEffectiveOwner: false,
    isSharedNonOwner: true,
    ownerDisplayName: 'Owner',
    ownerRole: 'owner',
    downloadPending: false,
    reportChange: vi.fn(),
    requestPublish: vi.fn(),
    refreshPresence: vi.fn(),
    checkStatusNow: vi.fn(),
    ...overrides,
  };
}

function projectViewElement(
  projectOverride: Project = project,
  options: {
    authoritativeProjectName?: string;
    resolveAuthoritativeProjectName?: (
      projectId: string,
      expectedAuthorizationKey: string,
    ) => Promise<ProjectNameAuthorityResolution>;
    workspaceContextOverride?: WorkspaceCollabContext | null;
    projectAuthorizationKey?: string;
    onProjectChange?: (next: Project) => void;
  } = {},
) {
  return (
    <ProjectView
      project={projectOverride}
      workspaceContextOverride={options.workspaceContextOverride}
      projectAuthorizationKey={options.projectAuthorizationKey ?? 'ws-1:wm-1:project-1'}
      authoritativeProjectName={options.authoritativeProjectName}
      resolveAuthoritativeProjectName={options.resolveAuthoritativeProjectName}
      routeFileName={null}
      config={config}
      agents={[] as AgentInfo[]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[] as DesignSystemSummary[]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()}
      onTouchProject={vi.fn()}
      onProjectChange={options.onProjectChange ?? onProjectChangeMock}
      onProjectsRefresh={vi.fn()}
    />
  );
}

function renderProjectView(
  projectOverride: Project = project,
  options: {
    authoritativeProjectName?: string;
    resolveAuthoritativeProjectName?: (
      projectId: string,
      expectedAuthorizationKey: string,
    ) => Promise<ProjectNameAuthorityResolution>;
    workspaceContextOverride?: WorkspaceCollabContext | null;
    projectAuthorizationKey?: string;
  } = {},
) {
  return render(projectViewElement(projectOverride, options));
}

function dispatchProjectEvent(evt: ProjectEvent) {
  const handleProjectEvent = mockedUseProjectFileEvents.mock.calls[0]?.[2] as
    | ((evt: ProjectEvent) => void)
    | undefined;
  expect(handleProjectEvent).toBeTypeOf('function');
  handleProjectEvent!(evt);
}

function teamWorkspaceContext(
  workspaceId = 'ws-1',
  workspaceMemberId = 'wm-1',
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 3,
      usedSeats: 2,
      availableSeats: 1,
      isSeatFull: false,
    },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: false,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
  };
}

async function exhaustConversationMaterializationRetries() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(11_520);
  });
}

describe('ProjectView shared-project title refresh on project-metadata-changed', () => {
  beforeEach(() => {
    mockedListConversations.mockReset();
    mockedListMessages.mockReset();
    mockedUseIframeKeepAlivePool.mockReturnValue({
      attach: vi.fn(),
      release: vi.fn(),
      evict: vi.fn(),
      evictProject: vi.fn(),
      evictMatching: vi.fn(),
    });
    mockedUseProjectCollab.mockReturnValue(sharedMemberCollab());
    mockedListConversations.mockResolvedValue([conversation]);
    mockedCreateConversation.mockResolvedValue(conversation);
    mockedListMessages.mockResolvedValue([]);
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
    mockedFetchPreviewComments.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('lets a shared non-owner reopen chat without a collab rerender collapsing it again', async () => {
    const view = renderProjectView();

    await waitFor(() => {
      expect(document.querySelector('.split')).toHaveClass('split-focus');
    });
    fireEvent.click(screen.getByTestId('workspace-focus-toggle'));
    expect(document.querySelector('.split')).not.toHaveClass('split-focus');

    mockedUseProjectCollab.mockReturnValue(sharedMemberCollab({
      publishedVersion: 4,
      present: [{ memberId: 'member-2', name: 'Teammate' }],
    }));
    view.rerender(projectViewElement());

    expect(document.querySelector('.split')).not.toHaveClass('split-focus');
    expect(screen.queryByTestId('workspace-focus-toggle')).toBeNull();
  });

  // recvqhwv6RPU1j: a member's first open of a team-shared project registers a
  // "共享项目" placeholder record; the background pull later swaps in the real
  // name in the daemon DB only. The daemon signals that swap with the existing
  // `project-metadata-changed` thin event — the open project view must react
  // by re-fetching the project record and propagating it up through
  // `onProjectChange`, or App.tsx's `projects` state (sidebar + tab title)
  // keeps the placeholder until a manual page reload.
  it('re-fetches the project and propagates the real name up when project-metadata-changed fires', async () => {
    const pulled: Project = {
      ...project,
      name: 'Q3 Marketing Site',
      skillId: 'deck-builder',
      designSystemId: 'ds-emerald',
      updatedAt: 456,
    };
    mockedGetProject.mockResolvedValue(pulled);

    renderProjectView();
    dispatchProjectEvent({ type: 'project-metadata-changed', projectId: project.id });

    await waitFor(() => {
      expect(onProjectChangeMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'project-1', name: 'Q3 Marketing Site' }),
      );
    });
  });

  it.each([
    ['member', sharedMemberCollab()],
    ['owner', sharedMemberCollab({
      viewerOnly: false,
      writerAuthority: 'allowed',
      isOwner: true,
      isEffectiveOwner: true,
      isSharedNonOwner: false,
      ownerDisplayName: null,
      ownerRole: null,
    })],
  ])('pins %s title hydration to the opened Workspace after ambient Workspace changes', async (
    role,
    collab,
  ) => {
    mockedUseProjectCollab.mockReturnValue(collab);
    const workspaceA = {
      workspaceId: 'ws-1',
      workspaceType: 'team',
      workspaceMemberId: 'wm-1',
      role: role as WorkspaceCollabContext['role'],
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: null,
      providerMode: 'platform_credits',
      seatSummary: {
        seatLimit: 3,
        usedSeats: 2,
        availableSeats: 1,
        isSeatFull: false,
      },
      permissions: {},
    } as WorkspaceCollabContext;
    const placeholder = { ...project, workspaceId: workspaceA.workspaceId };
    const pulled = {
      ...placeholder,
      name: 'Recipient sees the real title',
      updatedAt: 456,
    };
    mockedGetProject.mockImplementation(async (_projectId, workspaceContext) => (
      workspaceContext?.workspaceId === workspaceA.workspaceId
        ? pulled
        : placeholder
    ));

    function RecipientShell() {
      const [activeProject, setActiveProject] = useState<Project>(placeholder);
      return (
        <>
          <span data-testid="recipient-sidebar-title">{activeProject.name}</span>
          <span data-testid="recipient-tab-title">{activeProject.name}</span>
          {projectViewElement(activeProject, {
            workspaceContextOverride: workspaceA,
            onProjectChange: setActiveProject,
          })}
        </>
      );
    }

    render(<RecipientShell />);
    dispatchProjectEvent({ type: 'project-metadata-changed', projectId: project.id });

    await waitFor(() => {
      expect(mockedGetProject).toHaveBeenCalledWith(project.id, workspaceA);
      expect(screen.getByTestId('recipient-sidebar-title').textContent).toBe(pulled.name);
      expect(screen.getByTestId('recipient-tab-title').textContent).toBe(pulled.name);
      expect(screen.getByTestId('file-workspace').getAttribute('data-project-name')).toBe(pulled.name);
    });
  });

  it('ignores project-metadata-changed events for other projects', async () => {
    mockedGetProject.mockResolvedValue({ ...project, id: 'project-2', name: 'Other' });

    renderProjectView();
    dispatchProjectEvent({ type: 'project-metadata-changed', projectId: 'project-2' });

    // Give any (wrong) async refetch a beat to run before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockedGetProject).not.toHaveBeenCalled();
    expect(onProjectChangeMock).not.toHaveBeenCalled();
  });

  it('does not churn App state when the re-fetched record matches what is already rendered', async () => {
    // Same name/skill/design-system as the current prop: e.g. the signal came
    // from a content-publish nudge, not a rename. No `onProjectChange` — an
    // unconditional apply would re-render the whole App on every publish.
    mockedGetProject.mockResolvedValue({ ...project });

    renderProjectView();
    dispatchProjectEvent({ type: 'project-metadata-changed', projectId: project.id });

    await waitFor(() => {
      expect(mockedGetProject).toHaveBeenCalledWith(project.id, null);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onProjectChangeMock).not.toHaveBeenCalled();
  });

  it('does not propagate a newer placeholder over the catalog title after metadata invalidation', async () => {
    const catalogProject = {
      ...project,
      name: 'Q3 Marketing Site',
    };
    mockedGetProject.mockResolvedValue({
      ...project,
      name: '共享项目',
      updatedAt: 999,
    });

    renderProjectView(catalogProject, {
      authoritativeProjectName: 'Q3 Marketing Site',
      resolveAuthoritativeProjectName: vi.fn().mockResolvedValue({
        kind: 'resolved',
        name: 'Q3 Marketing Site',
      }),
    });
    dispatchProjectEvent({ type: 'project-metadata-changed', projectId: project.id });

    await waitFor(() => {
      expect(mockedGetProject).toHaveBeenCalledWith(project.id, null);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onProjectChangeMock).not.toHaveBeenCalled();
  });

  it('lets a newer real detail calibrate a placeholder title', () => {
    expect(reconcileProjectDetail(project, {
      ...project,
      name: 'Q3 Marketing Site',
      updatedAt: 2,
    }).name).toBe('Q3 Marketing Site');
  });

  it('does not let a newer local placeholder cover the catalog title', () => {
    const catalogProject = {
      ...project,
      name: 'Q3 Marketing Site',
      updatedAt: 1,
    };
    expect(reconcileProjectDetail(
      catalogProject,
      {
        ...project,
        name: '共享项目',
        updatedAt: 999,
      },
      'Q3 Marketing Site',
    ).name).toBe('Q3 Marketing Site');
  });

  it('keeps an other-owner catalog rename authoritative over a newer stale local real name', () => {
    const catalogProject = {
      ...project,
      name: 'Owner renamed project',
      updatedAt: 1,
    };
    expect(reconcileProjectDetail(
      catalogProject,
      {
        ...project,
        name: 'Old local real name',
        skillId: 'new-skill',
        updatedAt: 999,
      },
      'Owner renamed project',
    )).toEqual(expect.objectContaining({
      name: 'Owner renamed project',
      skillId: 'new-skill',
    }));
  });

  it('refreshes the other-owner catalog authority before applying a metadata event', async () => {
    const catalogProject = {
      ...project,
      name: 'Catalog before rename',
    };
    const resolveAuthoritativeProjectName = vi.fn().mockResolvedValue({
      kind: 'resolved',
      name: 'Catalog after rename',
    });
    mockedGetProject.mockResolvedValue({
      ...project,
      name: 'Old local real name',
      updatedAt: 999,
    });

    renderProjectView(catalogProject, {
      authoritativeProjectName: 'Catalog before rename',
      resolveAuthoritativeProjectName,
    });
    dispatchProjectEvent({ type: 'project-metadata-changed', projectId: project.id });

    await waitFor(() => {
      expect(resolveAuthoritativeProjectName).toHaveBeenCalledWith(
        project.id,
        'ws-1:wm-1:project-1',
      );
      expect(onProjectChangeMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Catalog after rename' }),
      );
    });
  });

  it('drops a same-project-id metadata result after its authorization scope becomes stale', async () => {
    mockedGetProject.mockResolvedValue({
      ...project,
      name: 'Workspace A stale title',
      updatedAt: 999,
    });
    const resolveAuthoritativeProjectName = vi.fn().mockResolvedValue({
      kind: 'stale',
    });

    renderProjectView({
      ...project,
      name: 'Workspace B title',
    }, {
      authoritativeProjectName: 'Workspace B title',
      resolveAuthoritativeProjectName,
    });
    dispatchProjectEvent({ type: 'project-metadata-changed', projectId: project.id });

    await waitFor(() => {
      expect(resolveAuthoritativeProjectName).toHaveBeenCalledWith(
        project.id,
        'ws-1:wm-1:project-1',
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onProjectChangeMock).not.toHaveBeenCalled();
  });

  it('ignores a late detail response from the previous project', () => {
    const nextProject = {
      ...project,
      id: 'project-2',
      name: 'Next project',
      updatedAt: 1,
    };
    expect(reconcileProjectDetail(nextProject, {
      ...project,
      id: 'project-1',
      name: 'Stale project',
      updatedAt: 999,
    })).toBe(nextProject);
  });

  it('recovers an exhausted first-share conversation 404 when materialization signals completion', async () => {
    vi.useFakeTimers();
    const workspace = teamWorkspaceContext();
    const sharedProject = { ...project, workspaceId: workspace.workspaceId };
    mockedListConversations.mockRejectedValue(
      new ProjectConversationsHttpError(404),
    );

    renderProjectView(sharedProject, {
      workspaceContextOverride: workspace,
    });
    await exhaustConversationMaterializationRetries();
    const callsAfterExhaustion = mockedListConversations.mock.calls.length;

    mockedListConversations.mockResolvedValue([conversation]);
    dispatchProjectEvent({
      type: 'project-metadata-changed',
      projectId: sharedProject.id,
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedListConversations).toHaveBeenCalledTimes(callsAfterExhaustion + 1);
    expect(mockedListMessages).toHaveBeenCalledWith(
      sharedProject.id,
      conversation.id,
      workspace,
    );
  });

  it('recovers an exhausted first-share conversation 404 when downloadPending settles', async () => {
    vi.useFakeTimers();
    const workspace = teamWorkspaceContext();
    const sharedProject = { ...project, workspaceId: workspace.workspaceId };
    mockedUseProjectCollab.mockReturnValue(sharedMemberCollab({
      downloadPending: true,
    }));
    mockedListConversations.mockRejectedValue(
      new ProjectConversationsHttpError(404),
    );

    const view = renderProjectView(sharedProject, {
      workspaceContextOverride: workspace,
    });
    await exhaustConversationMaterializationRetries();
    const callsAfterExhaustion = mockedListConversations.mock.calls.length;

    mockedListConversations.mockResolvedValue([conversation]);
    mockedUseProjectCollab.mockReturnValue(sharedMemberCollab({
      downloadPending: false,
    }));
    view.rerender(projectViewElement(sharedProject, {
      workspaceContextOverride: workspace,
    }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedListConversations).toHaveBeenCalledTimes(callsAfterExhaustion + 1);
    expect(mockedListMessages).toHaveBeenCalledWith(
      sharedProject.id,
      conversation.id,
      workspace,
    );
  });

  it('does not commit a materialization recovery after its Workspace authority becomes stale', async () => {
    vi.useFakeTimers();
    const workspaceA = teamWorkspaceContext('ws-a', 'wm-a');
    const workspaceB = teamWorkspaceContext('ws-b', 'wm-b');
    const sharedProjectA = { ...project, workspaceId: workspaceA.workspaceId };
    const sharedProjectB = { ...project, workspaceId: workspaceB.workspaceId };
    mockedListConversations.mockRejectedValue(
      new ProjectConversationsHttpError(404),
    );

    const view = renderProjectView(sharedProjectA, {
      workspaceContextOverride: workspaceA,
      projectAuthorizationKey: 'ws-a:wm-a:project-1',
    });
    await exhaustConversationMaterializationRetries();
    const staleHandler = mockedUseProjectFileEvents.mock.calls.at(-1)?.[2] as
      | ((evt: ProjectEvent) => void)
      | undefined;

    let resolveWorkspaceARecovery: ((value: Conversation[]) => void) | undefined;
    mockedListConversations
      .mockImplementationOnce(() => new Promise<Conversation[]>((resolve) => {
        resolveWorkspaceARecovery = resolve;
      }))
      .mockRejectedValue(new ProjectConversationsHttpError(404));
    staleHandler?.({
      type: 'project-metadata-changed',
      projectId: sharedProjectA.id,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolveWorkspaceARecovery).toBeTypeOf('function');

    view.rerender(projectViewElement(sharedProjectB, {
      workspaceContextOverride: workspaceB,
      projectAuthorizationKey: 'ws-b:wm-b:project-1',
    }));
    await act(async () => {
      resolveWorkspaceARecovery?.([conversation]);
      await Promise.resolve();
    });

    expect(mockedListMessages).not.toHaveBeenCalled();
  });

  it('does not commit an in-flight materialization recovery after unmount', async () => {
    vi.useFakeTimers();
    const workspace = teamWorkspaceContext();
    const sharedProject = { ...project, workspaceId: workspace.workspaceId };
    mockedListConversations.mockRejectedValue(
      new ProjectConversationsHttpError(404),
    );
    const view = renderProjectView(sharedProject, {
      workspaceContextOverride: workspace,
    });
    await exhaustConversationMaterializationRetries();

    let resolveRecovery: ((value: Conversation[]) => void) | undefined;
    mockedListConversations.mockImplementationOnce(
      () => new Promise<Conversation[]>((resolve) => {
        resolveRecovery = resolve;
      }),
    );
    dispatchProjectEvent({
      type: 'project-metadata-changed',
      projectId: sharedProject.id,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolveRecovery).toBeTypeOf('function');

    view.unmount();
    await act(async () => {
      resolveRecovery?.([conversation]);
      await Promise.resolve();
    });

    expect(mockedListMessages).not.toHaveBeenCalled();
  });

  it('does not let an old A request swallow the only completion signal after A to B to A', async () => {
    vi.useFakeTimers();
    const workspaceA = teamWorkspaceContext('ws-a', 'wm-a');
    const workspaceB = teamWorkspaceContext('ws-b', 'wm-b');
    const sharedProjectA = { ...project, workspaceId: workspaceA.workspaceId };
    const sharedProjectB = { ...project, workspaceId: workspaceB.workspaceId };
    mockedListConversations.mockRejectedValue(
      new ProjectConversationsHttpError(404),
    );
    const view = renderProjectView(sharedProjectA, {
      workspaceContextOverride: workspaceA,
      projectAuthorizationKey: 'ws-a:wm-a:project-1',
    });
    await exhaustConversationMaterializationRetries();

    let resolveOldWorkspaceARecovery: ((value: Conversation[]) => void) | undefined;
    mockedListConversations.mockImplementationOnce(
      () => new Promise<Conversation[]>((resolve) => {
        resolveOldWorkspaceARecovery = resolve;
      }),
    );
    dispatchProjectEvent({
      type: 'project-metadata-changed',
      projectId: sharedProjectA.id,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolveOldWorkspaceARecovery).toBeTypeOf('function');

    mockedListConversations.mockRejectedValue(
      new ProjectConversationsHttpError(404),
    );
    await act(async () => {
      view.rerender(projectViewElement(sharedProjectB, {
        workspaceContextOverride: workspaceB,
        projectAuthorizationKey: 'ws-b:wm-b:project-1',
      }));
      await Promise.resolve();
    });
    await act(async () => {
      view.rerender(projectViewElement(sharedProjectA, {
        workspaceContextOverride: workspaceA,
        projectAuthorizationKey: 'ws-a:wm-a:project-1',
      }));
      await Promise.resolve();
    });
    await exhaustConversationMaterializationRetries();
    const callsBeforeNewCompletion = mockedListConversations.mock.calls.length;

    mockedListConversations.mockResolvedValueOnce([conversation]);
    const currentHandler = mockedUseProjectFileEvents.mock.calls.at(-1)?.[2] as
      | ((evt: ProjectEvent) => void)
      | undefined;
    currentHandler?.({
      type: 'project-metadata-changed',
      projectId: sharedProjectA.id,
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedListConversations).toHaveBeenCalledTimes(callsBeforeNewCompletion + 1);
    expect(mockedListMessages).toHaveBeenCalledWith(
      sharedProjectA.id,
      conversation.id,
      workspaceA,
    );
    await act(async () => {
      resolveOldWorkspaceARecovery?.([conversation]);
      await Promise.resolve();
    });
  });

  it.each([403, 500])(
    'replaces an exhausted 404 with the completion read %s error',
    async (status) => {
      vi.useFakeTimers();
      const workspace = teamWorkspaceContext();
      const sharedProject = { ...project, workspaceId: workspace.workspaceId };
      mockedListConversations.mockRejectedValue(
        new ProjectConversationsHttpError(404),
      );
      renderProjectView(sharedProject, {
        workspaceContextOverride: workspace,
      });
      await exhaustConversationMaterializationRetries();

      mockedListConversations.mockRejectedValueOnce(
        new ProjectConversationsHttpError(status),
      );
      dispatchProjectEvent({
        type: 'project-metadata-changed',
        projectId: sharedProject.id,
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByTestId('chat-error').textContent).toBe(`conversations ${status}`);
    },
  );

  it('does not overwrite an unrelated global error with a recovery read error', () => {
    expect(reconcileConversationRecoveryGlobalError(
      'artifact failed to load',
      'conversations 404',
      'conversations 500',
    )).toBe('artifact failed to load');
    expect(reconcileConversationRecoveryGlobalError(
      'conversations 404',
      'conversations 404',
      'conversations 500',
    )).toBe('conversations 500');
  });

  it('coalesces concurrent completion signals within one recovery generation', async () => {
    vi.useFakeTimers();
    const workspace = teamWorkspaceContext();
    const sharedProject = { ...project, workspaceId: workspace.workspaceId };
    mockedListConversations.mockRejectedValue(
      new ProjectConversationsHttpError(404),
    );
    renderProjectView(sharedProject, {
      workspaceContextOverride: workspace,
    });
    await exhaustConversationMaterializationRetries();
    const callsAfterExhaustion = mockedListConversations.mock.calls.length;

    let rejectRecovery: ((reason: unknown) => void) | undefined;
    mockedListConversations.mockImplementationOnce(
      () => new Promise<Conversation[]>((_resolve, reject) => {
        rejectRecovery = reject;
      }),
    );
    dispatchProjectEvent({
      type: 'project-metadata-changed',
      projectId: sharedProject.id,
    });
    dispatchProjectEvent({ type: 'file-changed', path: 'index.html', kind: 'change' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedListConversations).toHaveBeenCalledTimes(callsAfterExhaustion + 1);
    await act(async () => {
      rejectRecovery?.(new ProjectConversationsHttpError(404));
      await Promise.resolve();
    });
  });
});
