// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';
import type { DaemonReattachOptions } from '../../src/providers/daemon';

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

// Observe the real ProjectView request sent to FileWorkspace. Recovery must
// choose the declared focus without discarding the backup from persisted data.
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
  name: 'index.html', path: 'index.html', size: 300, mtime: 2000,
  kind: 'html', mime: 'text/html',
};
const backup = {
  name: 'reference/light-paper.html', path: 'reference/light-paper.html',
  size: 256, mtime: 2001, kind: 'html', mime: 'text/html',
};

async function recoverRunningTurn(declareFocus: boolean, artifactPathsPresent = true) {
  const startedAt = Date.now();
  const message: ChatMessage = {
    id: 'assistant-running-second-turn', role: 'assistant', agentId: 'agent-1',
    content: 'Editing the primary file.', events: [], createdAt: startedAt,
    startedAt, runId: 'run-second-turn', runStatus: 'running',
    sessionMode: 'design', preTurnFileNames: ['index.html'], lastRunEventId: '4',
  };
  listConversations.mockResolvedValue([{ id: 'conv-1', projectId: 'project-1', title: 'Conversation', createdAt: 1, updatedAt: 1 }]);
  listMessages.mockResolvedValue([
    { id: 'user-second-turn', role: 'user', content: 'Darken index and preserve a light backup.', createdAt: startedAt - 1 },
    message,
  ]);
  fetchPreviewComments.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: ['index.html'], active: 'index.html' });
  fetchProjectFiles.mockResolvedValue([index, backup]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchSkill.mockResolvedValue(null);
  fetchDesignSystem.mockResolvedValue(null);
  getTemplate.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
  saveMessage.mockResolvedValue(undefined);
  patchConversation.mockResolvedValue(undefined);
  const status = {
    id: message.runId, status: 'running' as 'running' | 'succeeded',
    createdAt: startedAt, updatedAt: startedAt, exitCode: null as number | null,
    signal: null, artifactCount: 2,
    ...(artifactPathsPresent ? { artifactPaths: ['index.html', 'reference/light-paper.html'] } : {}),
  };
  // Contended daemon runs omit the field; an explicit [] has different authority.
  expect(Object.hasOwn(status, 'artifactPaths')).toBe(artifactPathsPresent);
  fetchChatRunStatus.mockImplementation(async () => ({ ...status }));
  let releaseStream!: () => void;
  const streamFinished = new Promise<void>((resolve) => { releaseStream = resolve; });
  reattachDaemonRun.mockImplementation(() => streamFinished);

  // This is the normal reload / return-to-conversation entry: persisted running
  // history is loaded, then ProjectView probes daemon truth and reattaches.
  // We do not invoke onSend or any auto-open helper.
  renderProjectView({ resolvedDir: '/tmp/projects/project-1', metadata: { kind: 'prototype' } });
  await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
  const options = reattachDaemonRun.mock.calls[0]![0] as DaemonReattachOptions;
  expect(options).toEqual(expect.objectContaining({
    projectId: 'project-1', conversationId: 'conv-1', runId: message.runId,
    initialLastEventId: null,
  }));
  expect(streamViaDaemon).not.toHaveBeenCalled();

  const events: NonNullable<ChatMessage['events']> = [
    { kind: 'tool_use', id: 'edit-dark', name: 'Edit', input: { file_path: '/tmp/projects/project-1/index.html' } },
    { kind: 'tool_result', toolUseId: 'edit-dark', content: 'Edited index.', isError: false },
    { kind: 'tool_use', id: 'write-backup', name: 'Write', input: { file_path: '/tmp/projects/project-1/reference/light-paper.html' } },
    { kind: 'tool_result', toolUseId: 'write-backup', content: 'Wrote backup.', isError: false },
    ...(declareFocus ? [
      { kind: 'artifact_focus' as const, show: ['index.html'] },
      { kind: 'artifact_focus' as const, open: 'index.html' },
    ] : []),
  ];
  const finalContent = 'The index is dark; the backup keeps the light original.';
  await act(async () => {
    options.handlers.onDelta(finalContent);
    for (const event of events) options.handlers.onAgentEvent?.(event);
    if (status.artifactPaths !== undefined) options.onArtifactPaths?.(status.artifactPaths);
    status.status = 'succeeded';
    status.updatedAt = startedAt + 100;
    status.exitCode = 0;
    options.onRunStatus?.('succeeded');
    await options.handlers.onDone(finalContent);
    releaseStream();
    await streamFinished;
  });

  // Wait for actual final delivery persistence, not the intermediate status
  // write emitted before asynchronous file refresh finishes.
  await waitFor(() => {
    const saved = saveMessage.mock.calls.map((call) => call[2] as ChatMessage)
      .filter((candidate) => candidate?.id === message.id).at(-1);
    expect(saved?.runStatus).toBe('succeeded');
    expect(saved?.producedFiles?.map((file) => file.name).sort()).toEqual([
      'index.html', 'reference/light-paper.html',
    ]);
    expect(saved?.events).toEqual(expect.arrayContaining(events));
  });
  expect(reattachDaemonRun).toHaveBeenCalledTimes(1);
}

describe('OPEND-2950: explicit edited focus after running-history reattachment', () => {
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

  it('keeps the successfully edited declared primary focused after reload recovery finishes', async () => {
    await recoverRunningTurn(true);
    expect(focusedTab()).toBe('index.html');
  });

  it('preserves both produced files and the declared primary when contended recovery has no artifactPaths field', async () => {
    // Real provider contract: no onArtifactPaths callback when terminal paths
    // are absent. Successful replayed Edit/Write evidence must retain index,
    // not merely open it while saving only the newly created backup.
    await recoverRunningTurn(true, false);
    expect(focusedTab()).toBe('index.html');
  });

  it('retains the existing new-backup fallback when recovered events contain no focus declaration', async () => {
    await recoverRunningTurn(false);
    expect(focusedTab()).toBe('reference/light-paper.html');
  });
});
