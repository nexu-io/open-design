// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchProjectDesignSystemPackageAudit = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const publishDaemonRunFinishedEvent = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveTabs = vi.fn();

const chatPaneHarness = vi.hoisted(() => ({
  onSend: null as null | ((
    prompt: string,
    attachments: unknown[],
    commentAttachments?: unknown[],
    meta?: unknown,
  ) => unknown),
  onStop: null as null | (() => void),
  messages: [] as ChatMessage[],
}));

// Records the WHOLE open request, not just `openRequest.name`. Reading only
// `.name` is exactly the false-green this suite exists to avoid: a batch open
// that the host issues as one request would look like a single-file open.
const workspaceHarness = vi.hoisted(() => ({
  lastRequest: null as unknown,
  requests: [] as { name: string; batch: string[] }[],
}));

function openedTabsInOrder(): string[] {
  const seen: string[] = [];
  for (const request of workspaceHarness.requests) {
    for (const name of [...request.batch, request.name]) {
      if (name && !seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

function focusedTab(): string | null {
  return workspaceHarness.requests.at(-1)?.name ?? null;
}

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (value: string) => value,
  }),
  useT: () => ((value: string) => value),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  GENERIC_DAEMON_DISCONNECT_CODE: 'GENERIC_DAEMON_DISCONNECT',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  publishDaemonRunFinishedEvent: (...args: unknown[]) => publishDaemonRunFinishedEvent(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: (...args: unknown[]) =>
    fetchProjectDesignSystemPackageAudit(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  cacheTabsLocally: vi.fn((projectId: string, tabs: unknown) => ({ projectId, tabs })),
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: (...args: unknown[]) => patchConversation(...args),
  patchProject: (...args: unknown[]) => patchProject(...args),
  persistTabsToDaemonNow: vi.fn(),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: (...args: unknown[]) => saveTabs(...args),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({
    messages,
    onSend,
    onStop,
  }: {
    messages: ChatMessage[];
    onSend: typeof chatPaneHarness.onSend;
    onStop: typeof chatPaneHarness.onStop;
  }) => {
    chatPaneHarness.messages = messages;
    chatPaneHarness.onSend = onSend;
    chatPaneHarness.onStop = onStop;
    return null;
  },
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: ({
    openRequest,
  }: {
    openRequest?: { name?: string; openBatch?: readonly string[] } | null;
  }) => {
    if (openRequest && openRequest !== workspaceHarness.lastRequest) {
      workspaceHarness.lastRequest = openRequest;
      if (openRequest.name) {
        workspaceHarness.requests.push({
          name: openRequest.name,
          batch: [...(openRequest.openBatch ?? [])],
        });
      }
    }
    return null;
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

function renderProjectView(options?: { resolvedDir?: string | null; metadata?: unknown }) {
  const project = {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
    ...(options?.metadata ? { metadata: options.metadata } : {}),
  } as never;
  return render(
    <ProjectView
      project={project}
      initialProjectDetail={{ project, resolvedDir: options?.resolvedDir ?? null }}
      routeConversationId={null}
      routeFileName={null}
      config={
        {
          mode: 'daemon',
          agentId: 'agent-1',
          notifications: undefined,
          agentModels: {},
        } as never
      }
      agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
      skills={[]}
      designTemplates={[]}
      designSystems={[]}
      daemonLive
      onModeChange={() => {}}
      onAgentChange={() => {}}
      onAgentModelChange={() => {}}
      onRefreshAgents={() => {}}
      onOpenSettings={() => {}}
      onBack={() => {}}
      onClearPendingPrompt={() => {}}
      onTouchProject={() => {}}
      onProjectChange={() => {}}
      onProjectsRefresh={() => {}}
    />,
  );
}

type Handlers = {
  onAgentEvent: (event: unknown) => void;
  onDone: (text?: string) => void;
};

async function runTurn(options: {
  beforeFiles: unknown[];
  afterFiles: unknown[];
  metadata?: unknown;
  doneText?: string;
}): Promise<void> {
  listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
  listMessages.mockResolvedValue([]);
  fetchPreviewComments.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchSkill.mockResolvedValue(null);
  fetchDesignSystem.mockResolvedValue(null);
  getTemplate.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  fetchProjectFiles.mockResolvedValue(options.beforeFiles);

  let handlers: Handlers | null = null;
  streamViaDaemon.mockImplementation(async (streamOptions: any) => {
    streamOptions.onRunCreated('run-batch-images');
    handlers = streamOptions.handlers;
    return new Promise<void>(() => {});
  });

  renderProjectView({ resolvedDir: '/tmp/projects/project-1', metadata: options.metadata });
  await waitFor(() => expect(chatPaneHarness.onSend).toBeTruthy());
  await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalled());

  // Every read after the turn starts sees the finished set of files. The
  // pre-turn snapshot is already captured by the send above.
  fetchProjectFiles.mockResolvedValue(options.afterFiles);

  void chatPaneHarness.onSend!('Generate four images', [], []);
  await waitFor(() => expect(handlers).toBeTruthy());
  handlers!.onDone(options.doneText ?? 'Done.');
}

const IMAGE_TURN_FILES = [
  { name: 'image-01.png', path: 'image-01.png', size: 10, mtime: 1_001, kind: 'image', mime: 'image/png' },
  { name: 'image-02.png', path: 'image-02.png', size: 11, mtime: 1_002, kind: 'image', mime: 'image/png' },
  { name: 'image-03.png', path: 'image-03.png', size: 12, mtime: 1_003, kind: 'image', mime: 'image/png' },
  { name: 'image-04.png', path: 'image-04.png', size: 13, mtime: 1_004, kind: 'image', mime: 'image/png' },
];

describe('ProjectView auto-open of a finished turn (OPEND-2588)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    chatPaneHarness.onSend = null;
    chatPaneHarness.onStop = null;
    chatPaneHarness.messages = [];
    workspaceHarness.lastRequest = null;
    workspaceHarness.requests = [];
    window.sessionStorage.clear();
  });

  it('opens every image a batch-generation turn produced, not just one', async () => {
    // OPEND-2588: four images generated, four artifact cards in chat, and
    // only two tabs on the right. Product ruling 2026-09-04: when the turn
    // finishes, open its primary artifacts — all of them.
    await runTurn({ beforeFiles: [], afterFiles: IMAGE_TURN_FILES });

    await waitFor(() => {
      expect(openedTabsInOrder()).toEqual([
        'image-01.png',
        'image-02.png',
        'image-03.png',
        'image-04.png',
      ]);
    });
  });

  it('still focuses the artifact the single-selection heuristic would have picked', async () => {
    // Opening N tabs still leaves one selected. The heuristic that used to
    // choose the ONLY tab now chooses the FOCUSED one — newest mtime among
    // equally ranked media.
    await runTurn({ beforeFiles: [], afterFiles: IMAGE_TURN_FILES });

    await waitFor(() => expect(openedTabsInOrder()).toHaveLength(4));
    expect(focusedTab()).toBe('image-04.png');
  });

  it('does not widen the criterion: a lower-ranked support file stays closed', async () => {
    // 2026-09-04 clarification: "all the PRIMARY artifacts". The turn's
    // primary deliverable here is the HTML page; plan.md and the screenshots
    // it embeds are incidental to it and must not each grab a tab.
    await runTurn({
      beforeFiles: [],
      afterFiles: [
        { name: 'index.html', path: 'index.html', size: 20, mtime: 2_000, kind: 'html', mime: 'text/html' },
        { name: 'plan.md', path: 'plan.md', size: 21, mtime: 2_001, kind: 'markdown', mime: 'text/markdown' },
        { name: 'shot-01.png', path: 'shot-01.png', size: 22, mtime: 2_002, kind: 'image', mime: 'image/png' },
      ],
    });

    await waitFor(() => expect(focusedTab()).toBe('index.html'));
    expect(openedTabsInOrder()).toEqual(['index.html']);
  });
});
