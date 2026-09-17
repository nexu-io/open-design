// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';
import type { DaemonStreamOptions } from '../../src/providers/daemon';

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
    return <button onClick={() => onSend?.('Update the requested primary index.', [], [])}>Send focus case</button>;
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
      routeConversationId="conv-1"
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

const index = {
  name: 'index.html', path: 'index.html', size: 256, mtime: 1000,
  kind: 'html', mime: 'text/html',
};
const darkIndex = { ...index, size: 300, mtime: 2000 };
const backup = {
  name: 'reference/light-paper.html', path: 'reference/light-paper.html',
  size: 256, mtime: 2001, kind: 'html', mime: 'text/html',
};

async function initializeTwoTurnCase() {
  listConversations.mockResolvedValue([{ id: 'conv-1', projectId: 'project-1', title: 'Conversation', createdAt: 1, updatedAt: 1 }]);
  listMessages.mockResolvedValue([]);
  fetchPreviewComments.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], active: null });
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchSkill.mockResolvedValue(null);
  fetchDesignSystem.mockResolvedValue(null);
  getTemplate.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
  saveMessage.mockResolvedValue(undefined);
  patchConversation.mockResolvedValue(undefined);
  fetchProjectFiles.mockResolvedValue([]);
  streamViaDaemon.mockImplementation(() => new Promise<void>(() => {}));
  renderProjectView({ resolvedDir: '/tmp/projects/project-1', metadata: { kind: 'prototype' } });
  await waitFor(() => expect(listMessages).toHaveBeenCalled());
  await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalled());
}

async function startTurn(number: number): Promise<DaemonStreamOptions> {
  fireEvent.click(screen.getByRole('button', { name: 'Send focus case' }));
  await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(number));
  const options = streamViaDaemon.mock.calls[number - 1]![0] as DaemonStreamOptions;
  await act(async () => {
    options.onRunCreated?.(`run-focus-${number}`);
    options.onRunStatus?.('running');
    options.handlers.onDelta(number === 1 ? 'Light original prepared.' : 'The index is dark; the backup keeps the light original.');
  });
  return options;
}

async function successfulWrite(options: DaemonStreamOptions, name: string, id: string, tool: 'Write' | 'Edit') {
  await act(async () => {
    options.handlers.onAgentEvent?.({
      kind: 'tool_use', id, name: tool,
      input: { file_path: `/tmp/projects/project-1/${name}` },
    });
    options.handlers.onAgentEvent?.({ kind: 'tool_result', toolUseId: id, content: 'File operation completed.', isError: false });
  });
}

async function finishTurn(options: DaemonStreamOptions, number: number, paths: string[]) {
  await act(async () => {
    options.onArtifactPaths?.(paths);
    options.onRunStatus?.('succeeded');
    options.handlers.onDone(number === 1 ? 'Light original prepared.' : 'The index is dark; the backup keeps the light original.');
  });
  await waitFor(() => expect(saveMessage.mock.calls.some((call) => {
    const message = call[2] as ChatMessage;
    return message?.runId === `run-focus-${number}` && message.runStatus === 'succeeded';
  })).toBe(true));
}

async function runTwoTurns(declareFocus: boolean) {
  await initializeTwoTurnCase();
  const first = await startTurn(1);
  fetchProjectFiles.mockResolvedValue([index]);
  await successfulWrite(first, 'index.html', 'write-light', 'Write');
  await finishTurn(first, 1, ['index.html']);
  await waitFor(() => expect(focusedTab()).toBe('index.html'));

  const second = await startTurn(2);
  fetchProjectFiles.mockResolvedValue([darkIndex, backup]);
  await successfulWrite(second, 'index.html', 'edit-dark', 'Edit');
  await successfulWrite(second, 'reference/light-paper.html', 'write-backup', 'Write');
  if (declareFocus) {
    // The actual daemon emitted these as two separate parsed artifact_focus
    // events (normal-a/second-complete-main/messages.raw), after both writes.
    await act(async () => {
      second.handlers.onAgentEvent?.({ kind: 'artifact_focus', show: ['index.html'] });
      second.handlers.onAgentEvent?.({ kind: 'artifact_focus', open: 'index.html' });
    });
  }
  await finishTurn(second, 2, ['index.html', 'reference/light-paper.html']);
}

describe('OPEND-2950: explicit primary preview survives a second-turn backup', () => {
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

  it('keeps the updated main HTML focused at completion instead of its newly created backup', async () => {
    await runTwoTurns(true);
    expect(focusedTab()).toBe('index.html');
    const finalMessage = saveMessage.mock.calls.map((call) => call[2] as ChatMessage)
      .filter((message) => message?.runId === 'run-focus-2' && message.runStatus === 'succeeded').at(-1)!;
    expect(finalMessage.producedFiles?.map((file) => file.name).sort()).toEqual([
      'index.html', 'reference/light-paper.html',
    ]);
    expect(finalMessage.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'artifact_focus', show: ['index.html'] }),
      expect.objectContaining({ kind: 'artifact_focus', open: 'index.html' }),
    ]));
  });

  it('keeps the existing newest-created heuristic when the agent gives no explicit focus', async () => {
    await runTwoTurns(false);
    expect(focusedTab()).toBe('reference/light-paper.html');
  });
});
