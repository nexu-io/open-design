// @vitest-environment jsdom
import type { DaemonStreamOptions } from '../../src/providers/daemon';

import { cleanup, render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
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
  openRequestNames: [] as string[],
  messages: [] as ChatMessage[],
}));

vi.mock('../../src/i18n', () => ({
  // ProjectView calls useI18n() (for locale/t); mock it like the other
  // ProjectView suites so the render does not throw on a missing export.
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
  // 一轮死在 `AMR_INSUFFICIENT_BALANCE` 上之后,`ProjectView` 会去查一次钱包读数
  // 来点亮升级卡(用户 2026-09-02 裁决:钱的事只有那一张卡)。这一页不测那张卡,
  // 只是要让那条路走得通 —— 少了这个 mock 会变成一条 unhandled rejection。
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
    const name = openRequest?.name;
    // A finished turn's other artifacts ride in `openBatch` (OPEND-2588).
    // Recording only `.name` would quietly make the "never opened ghost.html"
    // assertion below vacuous for anything opened through a batch.
    for (const batched of openRequest?.openBatch ?? []) {
      if (batched !== name && chatPaneHarness.openRequestNames.at(-1) !== batched) {
        chatPaneHarness.openRequestNames.push(batched);
      }
    }
    if (name && chatPaneHarness.openRequestNames.at(-1) !== name) {
      chatPaneHarness.openRequestNames.push(name);
    }
    return null;
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

function renderProjectView(options?: {
  resolvedDir?: string | null;
  projectId?: string;
  routeConversationId?: string | null;
  strict?: boolean;
}) {
  const project = {
    id: options?.projectId ?? 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
  } as never;
  const view = (
    <ProjectView
      project={project}
      initialProjectDetail={{ project, resolvedDir: options?.resolvedDir ?? null }}
      routeConversationId={options?.routeConversationId ?? null}
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
    />
  );
  return render(options?.strict ? <StrictMode>{view}</StrictMode> : view);
}


describe('OPEND-2950 actual completion attribution', () => {
  afterEach(() => {
    cleanup(); vi.resetAllMocks();
    chatPaneHarness.onSend = null; chatPaneHarness.onStop = null;
    chatPaneHarness.messages = []; chatPaneHarness.openRequestNames = [];
    window.sessionStorage.clear();
  });
  it.each(['complete', 'missing', 'successor', 'explicit-empty', 'explicit-backup', 'failed-edit', 'different-task', 'different-task-missing', 'successor-missing', 'revised-authority', 'external-edit', 'late-files-empty', 'late-files-nonempty', 'late-files-missing'] as const)('attributes only this task outputs with %s authority', async (authority) => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    listMessages.mockResolvedValue([]); fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchLiveArtifacts.mockResolvedValue([]); fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null); getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]); listProjectRuns.mockResolvedValue([]);
    saveMessage.mockResolvedValue(undefined);
    const main = { name: 'index.html', path: 'index.html', size: 100, mtime: 1, kind: 'html', mime: 'text/html' };
    const modified = { ...main, size: 120, mtime: Date.now() };
    const backup = { ...modified, name: 'reference/light-paper.html', path: 'reference/light-paper.html' };
    fetchProjectFiles.mockResolvedValue([main]);
    let captured: DaemonStreamOptions | undefined;
    streamViaDaemon.mockImplementation(async (options: DaemonStreamOptions) => {
      captured = options;
      options.onRunCreated?.('run-dark', { taskExecutionId: 'task-dark', strategy: { id: 'od-next-strategy', version: '2.0.0', packageHash: 'e'.repeat(64), snapshotId: 'snapshot-dark' }, inputStage: 'request', outcome: 'running', route: 'full_plan', executionMode: null, activeRunId: 'run-dark', terminal: false });
      return new Promise<void>(() => {});
    });
    renderProjectView({ resolvedDir: '/tmp/projects/project-1' });
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalled());
    await waitFor(() => expect(chatPaneHarness.onSend).not.toBeNull());
    void chatPaneHarness.onSend!('再生成一版更深沉的暗色纸纹配色', [], []);
    await waitFor(() => expect(captured).toBeDefined());
    const options = captured!;
    fetchProjectFiles.mockResolvedValue([modified, backup]);
    options.handlers.onAgentEvent?.({ kind: 'tool_use', id: 'edit-main', name: 'Edit', input: { file_path: authority === 'external-edit' ? '/tmp/outside/index.html' : '/tmp/projects/project-1/index.html', old_string: '#efe7d2', new_string: '#17140f' } });
    options.handlers.onAgentEvent?.({ kind: 'tool_result', toolUseId: 'edit-main', content: authority === 'failed-edit' ? 'permission denied' : 'ok', isError: authority === 'failed-edit' });
    if (['successor', 'different-task', 'different-task-missing', 'successor-missing'].includes(authority)) {
      options.onArtifactPaths?.(['index.html']);
      options.onRunCreated?.('run-backup', {
        taskExecutionId: authority.startsWith('different-task') ? 'task-other' : 'task-dark',
        strategy: { id: 'od-next-strategy', version: '2.0.0', packageHash: 'e'.repeat(64), snapshotId: 'snapshot-dark' },
        inputStage: 'production', outcome: 'running', route: 'full_plan', executionMode: 'simple', activeRunId: 'run-backup', terminal: false,
      });
    }
    options.handlers.onAgentEvent?.({ kind: 'tool_use', id: 'write-backup', name: 'Write', input: { file_path: '/tmp/projects/project-1/reference/light-paper.html', content: '<html>light</html>' } });
    options.handlers.onAgentEvent?.({ kind: 'tool_result', toolUseId: 'write-backup', content: 'ok', isError: false });
    if (authority === 'complete') options.onArtifactPaths?.(['index.html', 'reference/light-paper.html']);
    if (authority === 'revised-authority') { options.onArtifactPaths?.(['index.html']); options.onArtifactPaths?.(['reference/light-paper.html']); }
    if (['successor', 'different-task', 'explicit-backup'].includes(authority)) options.onArtifactPaths?.(['reference/light-paper.html']);
    if (authority === 'explicit-empty') options.onArtifactPaths?.([]);
    const lateFiles = authority.startsWith('late-files-');
    // After A's terminal authority, another run can add files before A's
    // completion GET resolves. These files have no successful tool event in A.
    const unrelatedArtifacts = ['html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'mp4', 'mov', 'webm', 'mp3', 'wav', 'm4a']
      .map((extension) => ({
        ...backup, name: `other-run/ghost.${extension}`, path: `other-run/ghost.${extension}`,
        kind: ['html', 'htm'].includes(extension) ? 'html' : extension === 'svg' ? 'sketch'
          : ['mp4', 'mov', 'webm'].includes(extension) ? 'video'
            : ['mp3', 'wav', 'm4a'].includes(extension) ? 'audio' : 'image',
        mime: extension === 'svg' ? 'image/svg+xml' : 'application/octet-stream',
      }));
    const ordinaryFiles = ['plugin/open-design.json', 'plugin/SKILL.md', 'DESIGN.md', 'notes.pdf', 'styles.css', 'app.js', 'app.cjs', 'app.jsx', 'app.mjs', 'app.ts', 'app.tsx', 'audio.ogg']
      .map((name) => ({
        ...backup, name, path: name,
        kind: name.endsWith('.pdf') ? 'pdf' : name.endsWith('.ogg') ? 'audio' : 'code',
        mime: name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.ogg') ? 'audio/ogg' : 'text/plain',
      }));
    let releaseFiles: ((files: typeof backup[]) => void) | undefined;
    const filesReadsBeforeDone = fetchProjectFiles.mock.calls.length;
    if (lateFiles) {
      if (authority === 'late-files-empty') options.onArtifactPaths?.([]);
      if (authority === 'late-files-nonempty') options.onArtifactPaths?.(['reference/light-paper.html']);
      fetchProjectFiles.mockImplementation(() => new Promise<typeof backup[]>((resolve) => { releaseFiles = resolve; }));
    }
    options.handlers.onDelta('index.html 为深色交付，reference/light-paper.html 为浅色参考副本。');
    options.onRunStatus?.('succeeded');
    options.handlers.onDone('index.html 为深色交付，reference/light-paper.html 为浅色参考副本。');
    if (lateFiles) {
      await waitFor(() => expect(fetchProjectFiles.mock.calls.length).toBeGreaterThan(filesReadsBeforeDone));
      expect(releaseFiles).toBeDefined();
      releaseFiles!([modified, backup, ...unrelatedArtifacts, ...ordinaryFiles]);
    }
    let stored: ChatMessage | undefined;
    await waitFor(() => {
      stored = saveMessage.mock.calls.map((call) => call[2] as ChatMessage).filter((message) => message.role === 'assistant' && Array.isArray(message.producedFiles)).at(-1);
      expect(stored).toBeDefined();
    });
    let expected = ['complete', 'missing', 'successor', 'successor-missing'].includes(authority) ? ['index.html', 'reference/light-paper.html'] : ['reference/light-paper.html'];
    if (authority === 'explicit-empty') expected = [];
    if (lateFiles) {
      expected = ordinaryFiles.map((file) => file.name);
      if (authority !== 'late-files-empty') expected.push(backup.name);
      if (authority === 'late-files-missing') expected.push(main.name, ...unrelatedArtifacts.map((file) => file.name));
      expected.sort();
    }
    expect(stored!.producedFiles!.map((file) => file.name).sort()).toEqual(expected);
  });
});
