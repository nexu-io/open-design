// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
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
  FileWorkspace: () => <div data-testid="file-workspace" />,
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

const checkStatusNowMock = vi.fn();
const applyContentTransferStateMock = vi.fn();

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const project: Project = {
  id: 'project-1',
  name: 'Project 1',
  skillId: 'skill-1',
  designSystemId: 'ds-1',
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

const skill: SkillSummary = {
  id: 'skill-1',
  name: 'Prompt skill',
  description: 'Old prompt context',
  triggers: ['prompt'],
  mode: 'prototype',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Create a prototype.',
  aggregatesExamples: false,
};

const designSystem: DesignSystemSummary = {
  id: 'ds-1',
  title: 'Design System',
  category: 'product',
  summary: 'Old system context',
};

// Owner side of a team-shared project, mid-edit: this is exactly the state
// `markLocalChangePending` (apps/daemon/src/collab/runtime.ts) puts the
// project in the instant a local file change is observed. The FileSyncBadge
// "uploading" treatment (ProjectView.tsx's `fileSyncBadge` derivation) reads
// straight off `syncState === 'pending_upload'`.
function sharedOwnerCollab(overrides?: Partial<ProjectCollab>): ProjectCollab {
  return {
    enabled: true,
    member: { memberId: 'owner-1', name: 'Owner' },
    present: [],
    publishedVersion: 3,
    syncState: 'pending_upload',
    viewerOnly: false,
    writerAuthority: 'allowed',
    isOwner: true,
    isEffectiveOwner: true,
    isSharedNonOwner: false,
    ownerDisplayName: null,
    ownerRole: 'owner',
    downloadPending: false,
    reportChange: vi.fn(),
    requestPublish: vi.fn(),
    refreshPresence: vi.fn(),
    checkStatusNow: checkStatusNowMock,
    applyContentTransferState: applyContentTransferStateMock,
    ...overrides,
  };
}

function renderProjectView() {
  return render(
    <ProjectView
      project={project}
      routeFileName={null}
      config={config}
      agents={[] as AgentInfo[]}
      skills={[skill]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[designSystem]}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onRefreshAgents={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
      onClearPendingPrompt={vi.fn()}
      onTouchProject={vi.fn()}
      onProjectChange={vi.fn()}
      onProjectsRefresh={vi.fn()}
    />,
  );
}

describe('ProjectView file-sync badge — status check on local file change', () => {
  beforeEach(() => {
    mockedUseIframeKeepAlivePool.mockReturnValue({
      attach: vi.fn(),
      release: vi.fn(),
      evict: vi.fn(),
      evictProject: vi.fn(),
      evictMatching: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      revision: vi.fn(() => 0),
    });
    mockedUseProjectCollab.mockReturnValue(sharedOwnerCollab());
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

  // recvqghymxqQQq: the owner's own edit lands on disk, the daemon's
  // collab-publish-watcher flips syncState to 'pending_upload' SYNCHRONOUSLY
  // on that same chokidar event (apps/daemon/src/collab/runtime.ts
  // markLocalChangePending), then reverts to 'synced' once the debounced
  // publish resolves — a window that is typically well under a second
  // (CollabPublishScheduler's 400ms debounce + a fast/local publish).
  //
  // The owner's OWN browser tab, however, only learns the new syncState
  // through CollabClient's fixed 5s status poll (DEFAULT_STATUS_POLL_MS in
  // apps/web/src/collab/collab-client.ts) UNLESS something calls
  // `checkStatusNow()` sooner. ProjectView already does this reactively for
  // OTHER hub push signals (`project-metadata-changed` → "Run one status
  // check now ... instead of waiting for the next 5s status tick"), but the
  // project's own `file-changed` SSE event — fired by the exact same
  // chokidar watch that the daemon uses to trigger markLocalChangePending —
  // was wired only to refresh the file list/preview, never to check collab
  // status. So the "uploading" transient is real server-side but is missed
  // by the owner's own client almost every time, and the tab icon never
  // appears to change.
  it('checks collab status immediately when the project\'s own file-changed SSE event fires', async () => {
    renderProjectView();

    const handleProjectEvent = mockedUseProjectFileEvents.mock.calls[0]?.[2] as
      | ((evt: ProjectEvent) => void)
      | undefined;
    expect(handleProjectEvent).toBeTypeOf('function');

    checkStatusNowMock.mockClear();
    handleProjectEvent!({ type: 'file-changed', path: 'index.html', kind: 'change' });

    // `file-changed` fans out through `coalescedFileChangedRefresh`
    // (useCoalescedCallback, real 80ms/250ms debounce — see ProjectView.tsx)
    // before `refreshFilesAndDesignMd` (and the `checkStatusNow()` call inside
    // it) actually runs, so the effect is not synchronous with the event.
    await waitFor(() => {
      expect(checkStatusNowMock).toHaveBeenCalled();
    });
  });

  it('re-reads exact-scoped status instead of applying an unscoped transfer event', () => {
    renderProjectView();

    const handleProjectEvent = mockedUseProjectFileEvents.mock.calls[0]?.[2] as
      | ((evt: ProjectEvent) => void)
      | undefined;
    checkStatusNowMock.mockClear();
    applyContentTransferStateMock.mockClear();
    handleProjectEvent?.({
      type: 'project-content-transfer-state',
      projectId: project.id,
      // Legacy/foreign scope A payload. Even if an older daemon still sends
      // it, this view may currently be workspace B and must never apply it.
      state: {
        status: 'idle',
        version: 8,
        startedAt: 100,
        updatedAt: 200,
      },
    } as unknown as ProjectEvent);

    // The same project id may exist under another workspace/owner/resource
    // binding. Applying A's idle payload directly could hide B's download.
    // The event is only an invalidation; /collab/status resolves B's exact
    // current scope and the CollabClient ordering fences arbitrate the result.
    expect(checkStatusNowMock).toHaveBeenCalledTimes(1);
    expect(applyContentTransferStateMock).not.toHaveBeenCalled();
  });
});
