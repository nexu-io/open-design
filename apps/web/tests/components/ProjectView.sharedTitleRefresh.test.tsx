// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView, reconcileProjectDetail } from '../../src/components/ProjectView';
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
  FileWorkspace: ({ projectName }: { projectName: string }) => (
    <div data-project-name={projectName} data-testid="file-workspace" />
  ),
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: () => <div data-testid="chat-pane" />,
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

function renderProjectView(
  projectOverride: Project = project,
  options: {
    authoritativeProjectName?: string;
    resolveAuthoritativeProjectName?: (
      projectId: string,
      expectedAuthorizationKey: string,
    ) => Promise<ProjectNameAuthorityResolution>;
  } = {},
) {
  return render(
    <ProjectView
      project={projectOverride}
      projectAuthorizationKey="ws-1:wm-1:project-1"
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
      onProjectChange={onProjectChangeMock}
      onProjectsRefresh={vi.fn()}
    />,
  );
}

function dispatchProjectEvent(evt: ProjectEvent) {
  const handleProjectEvent = mockedUseProjectFileEvents.mock.calls[0]?.[2] as
    | ((evt: ProjectEvent) => void)
    | undefined;
  expect(handleProjectEvent).toBeTypeOf('function');
  handleProjectEvent!(evt);
}

describe('ProjectView shared-project title refresh on project-metadata-changed', () => {
  beforeEach(() => {
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
});
