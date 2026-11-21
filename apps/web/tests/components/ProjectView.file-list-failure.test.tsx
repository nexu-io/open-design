// @vitest-environment jsdom

// #9489. A file-list read that failed, or has not answered yet, must never be
// handed to the Design Files panel as an authoritative empty project. Only a
// listing the daemon actually returned may confirm "empty"; a failed read
// surfaces as `filesListFailed` so the panel can offer a retry, and the retry
// re-runs the authoritative read.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { useIframeKeepAlivePool } from '../../src/components/IframeKeepAlivePool';
import { useProjectCollab, type ProjectCollab } from '../../src/collab/useProjectCollab';
import type {
  AgentInfo,
  AppConfig,
  Conversation,
  DesignSystemSummary,
  Project,
  ProjectFile,
  SkillSummary,
} from '../../src/types';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import { fetchPreviewComments, fetchProjectFiles } from '../../src/providers/registry';

interface CapturedWorkspaceProps {
  files: ProjectFile[];
  filesAuthoritative?: boolean;
  filesListFailed?: boolean;
  onRefreshFiles: (options?: { fresh?: boolean }) => Promise<unknown> | unknown;
}

const workspaceProps = vi.hoisted(() => ({ current: null as CapturedWorkspaceProps | null }));

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
    fetchProjectFiles: vi.fn(),
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
    registerQueuedSubmission: vi.fn(async (projectId, submission) => ({
      id: submission.id, projectId, conversationId: submission.conversationId, acceptedAt: submission.submittedAt,
    })),
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
  FileWorkspace: (props: CapturedWorkspaceProps) => {
    workspaceProps.current = props;
    return <div data-testid="file-workspace" />;
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: () => <div data-testid="chat-pane" />,
}));

const mockedUseIframeKeepAlivePool = vi.mocked(useIframeKeepAlivePool);
const mockedUseProjectCollab = vi.mocked(useProjectCollab);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);

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
  description: 'Prompt context',
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
  summary: 'System context',
};

function localCollab(): ProjectCollab {
  return {
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
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
    checkStatusNow: vi.fn(),
    applyContentTransferState: vi.fn(),
  } as unknown as ProjectCollab;
}

function projectFiles(count: number): ProjectFile[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `page-${index + 1}.html`,
    path: `page-${index + 1}.html`,
    type: 'file',
    size: 512,
    mtime: 1,
    kind: 'html',
    mime: 'text/html',
  }) as ProjectFile);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

function workspace(): CapturedWorkspaceProps {
  if (!workspaceProps.current) throw new Error('FileWorkspace has not rendered');
  return workspaceProps.current;
}

describe('ProjectView file-list read outcome (#9489)', () => {
  beforeEach(() => {
    workspaceProps.current = null;
    mockedUseIframeKeepAlivePool.mockReturnValue({
      attach: vi.fn(),
      release: vi.fn(),
      evict: vi.fn(),
      evictProject: vi.fn(),
      evictMatching: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      revision: vi.fn(() => 0),
    });
    mockedUseProjectCollab.mockReturnValue(localCollab());
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

  // A busy daemon answered the same 56-file listing in 67 s instead of 31 ms.
  // While that read is outstanding the panel must keep saying "loading", not
  // "empty", and not "failed" either.
  it('keeps a delayed listing unconfirmed, then accepts the files it returns', async () => {
    const slowRead = deferred<ProjectFile[]>();
    mockedFetchProjectFiles.mockReturnValue(slowRead.promise);

    renderProjectView();
    await waitFor(() => expect(mockedFetchProjectFiles).toHaveBeenCalled());

    expect(workspace().filesAuthoritative).toBe(false);
    expect(workspace().filesListFailed).toBeFalsy();
    expect(workspace().files).toHaveLength(0);

    await act(async () => {
      slowRead.resolve(projectFiles(56));
    });

    await waitFor(() => expect(workspace().filesAuthoritative).toBe(true));
    expect(workspace().filesListFailed).toBeFalsy();
    expect(workspace().files).toHaveLength(56);
  });

  it('reports a failed listing instead of an empty project, and a retry re-runs the authoritative read', async () => {
    mockedFetchProjectFiles.mockRejectedValue(new Error('Project files request failed (504)'));

    renderProjectView();

    await waitFor(() => expect(workspace().filesListFailed).toBe(true));
    expect(workspace().filesAuthoritative).toBe(false);
    expect(workspace().files).toHaveLength(0);

    mockedFetchProjectFiles.mockReset();
    mockedFetchProjectFiles.mockResolvedValue(projectFiles(56));

    await act(async () => {
      await workspace().onRefreshFiles({ fresh: true });
    });

    expect(mockedFetchProjectFiles).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({ requireAuthoritative: true, fresh: true }),
    );
    await waitFor(() => expect(workspace().filesAuthoritative).toBe(true));
    expect(workspace().filesListFailed).toBeFalsy();
    expect(workspace().files).toHaveLength(56);
  });

  it('confirms a genuinely empty project only from a successful empty listing', async () => {
    mockedFetchProjectFiles.mockResolvedValue([]);

    renderProjectView();

    await waitFor(() => expect(workspace().filesAuthoritative).toBe(true));
    expect(workspace().filesListFailed).toBeFalsy();
    expect(workspace().files).toHaveLength(0);
  });
});
