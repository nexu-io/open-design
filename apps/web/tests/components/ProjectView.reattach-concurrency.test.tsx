// @vitest-environment jsdom
/**
 * 红测:**重开一个有多条可恢复消息的会话,不许一次性把所有重连全放出去。**
 *
 * `attachRecoverableRuns` 逐条走 `messages`,每条都 `void reattachDaemonRun(...)`。
 * `reattachControllersRef` 只按 runId 去重(同一条 run 不重复订阅),没有任何东西
 * 限制**同时**有多少条不同的 run 在重连。
 *
 * 为什么这在这个页面上要命:浏览器给一个 origin 的 HTTP/1.1 连接约 6 条,而且是
 * **整个 profile 共享**的 —— 另一个停在后台的 OD 标签页已经占掉一部分。刷新一个
 * 攒了几条断线消息的会话,恰好是连接预算最紧的那一刻,而这里把 N 条订阅一起放出去,
 * 页面还欠的其它请求(文件列表、评论、封面探测)就全排在后面。
 *
 * 判据分三条,缺一条这个改动就不成立:
 *  1. 任一时刻在飞的重连数 ≤ 2;
 *  2. 5 条**最终全部**重连 —— 排队是延后,不是丢弃。丢一条重连 = 丢一条运行中
 *     的输出,比排队糟得多;
 *  3. daemon 说还活着的那条 run **不排队** —— 它的 SSE 要跑到 run 结束才 resolve,
 *     把它放进闸里就等于让后面的 run 在前一条跑完之前收不到任何输出。
 */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const paneHarness = vi.hoisted(() => ({ messages: [] as ChatMessage[] }));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (value: string) => value }),
  useT: () => ((value: string) => value),
}));

vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));

vi.mock('../../src/providers/daemon', () => ({
  GENERIC_DAEMON_DISCONNECT_CODE: 'GENERIC_DAEMON_DISCONNECT',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
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

vi.mock('../../src/providers/project-events', () => ({ useProjectFileEvents: vi.fn() }));
vi.mock('../../src/router', () => ({ navigate: vi.fn() }));

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

vi.mock('../../src/components/AppChromeHeader', () => ({ AppChromeHeader: () => null }));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: { messages: ChatMessage[] }) => {
    paneHarness.messages = props.messages;
    return null;
  },
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => null,
}));

vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => null }));

const CONVERSATION_ID = '64acc867-a666-429c-a201-1e662f7c787d';
const STARTED_AT = 1787844872191;
const ENDED_AT = 1787845003969;
const RECOVERABLE_COUNT = 5;

const runIdFor = (index: number) => `2b09f25a-78db-438e-a2c9-1ebaf705600${index}`;
const messageIdFor = (index: number) => `b7b61e19-486c-47b3-937f-8b6f68f0a87${index}`;

/**
 * 用户真机上那条形状:有正文(躲开 `spuriouslyFailedPending` 的提前 bail),
 * 末尾带 `DAEMON_STREAM_DISCONNECTED`,于是 `recoverableGenericDisconnectFailed`
 * 为真,一路进到重挂。
 */
function disconnectedFailedMessage(index: number): ChatMessage {
  return {
    id: messageIdFor(index),
    role: 'assistant',
    content: `partial answer ${index}`,
    agentId: 'codex',
    runId: runIdFor(index),
    runStatus: 'failed',
    startedAt: STARTED_AT + index,
    endedAt: ENDED_AT + index,
    createdAt: STARTED_AT + index,
    events: [
      { kind: 'status', label: 'starting', detail: 'codex' },
      { kind: 'text', text: `partial answer ${index}` },
      {
        kind: 'status',
        label: 'error',
        detail: 'daemon stream disconnected before run completed',
        code: 'GENERIC_DAEMON_DISCONNECT',
      },
    ],
  } as unknown as ChatMessage;
}

function runningMessage(index: number): ChatMessage {
  return {
    id: messageIdFor(index),
    role: 'assistant',
    content: '',
    agentId: 'codex',
    runId: runIdFor(index),
    runStatus: 'running',
    startedAt: STARTED_AT + index,
    createdAt: STARTED_AT + index,
    events: [{ kind: 'status', label: 'starting', detail: 'codex' }],
  } as unknown as ChatMessage;
}

function daemonRunStatus(runId: string, messageId: string, status: string) {
  return {
    id: runId,
    projectId: 'project-1',
    conversationId: CONVERSATION_ID,
    assistantMessageId: messageId,
    agentId: 'codex',
    status,
    createdAt: STARTED_AT,
    updatedAt: ENDED_AT,
    error: 'Run interrupted because the daemon restarted.',
    errorCode: 'DAEMON_RESTARTED',
    resumable: false,
    artifactCount: 0,
  };
}

function renderProjectView() {
  const project = {
    id: 'project-1', name: 'Project', skillId: null, designSystemId: null,
  } as never;
  return render(
    <ProjectView
      project={project}
      initialProjectDetail={{ project, resolvedDir: null }}
      routeFileName={null}
      config={{ mode: 'daemon', agentId: 'codex', notifications: undefined, agentModels: {} } as never}
      agents={[{ id: 'codex', name: 'Codex', models: [] } as never]}
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

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ReattachOptions = {
  runId: string;
  onRunStatus?: (status: string) => void;
  onRunEventId?: (id: string) => void;
  handlers: { onDone: (text: string) => void; onError: (err: Error) => void };
};

// The gate under test is module scope (the connection budget belongs to the
// tab, not to one effect run), so a case that ends with reattaches still held
// open would carry those slots into the next case. Every probe registers its
// resolvers here and `afterEach` drains them.
const openReattachResolvers: Array<() => void> = [];

/** Records how many reattaches were simultaneously in flight. */
function reattachProbe() {
  const probe = {
    inFlight: 0,
    peak: 0,
    startedRunIds: new Set<string>(),
    release: openReattachResolvers,
  };
  reattachDaemonRun.mockImplementation(async (options: ReattachOptions) => {
    probe.inFlight += 1;
    probe.peak = Math.max(probe.peak, probe.inFlight);
    probe.startedRunIds.add(options.runId);
    await new Promise<void>((resolve) => {
      probe.release.push(resolve);
    });
    probe.inFlight -= 1;
    options.onRunStatus?.('failed');
    options.handlers.onError(new Error('the run failed'));
  });
  return probe;
}

beforeEach(() => {
  vi.clearAllMocks();
  openReattachResolvers.length = 0;
  paneHarness.messages = [];
  listConversations.mockResolvedValue([
    { id: CONVERSATION_ID, projectId: 'project-1', title: 'T', createdAt: 0, updatedAt: 0 },
  ]);
  loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
  fetchProjectFiles.mockResolvedValue([]);
  fetchPreviewComments.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchProjectDesignSystemPackageAudit.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  saveMessage.mockResolvedValue(undefined);
  publishDaemonRunFinishedEvent.mockReturnValue(undefined);
});

afterEach(async () => {
  cleanup();
  // Hand every held slot back before the next case renders. Draining admits
  // whatever was queued behind it, so keep draining until nothing new starts.
  for (let guard = 0; guard < 20 && openReattachResolvers.length > 0; guard += 1) {
    openReattachResolvers.splice(0).forEach((resolve) => resolve());
    await settle(20);
  }
  openReattachResolvers.length = 0;
});

describe('重挂:并发有上限,但一条都不许丢', () => {
  it('5 条可恢复消息同时在飞的重连数不超过 2', async () => {
    const messages = Array.from({ length: RECOVERABLE_COUNT }, (_, i) => disconnectedFailedMessage(i));
    listMessages.mockResolvedValue(messages);
    fetchChatRunStatus.mockImplementation(async (runId: string) => {
      const index = messages.findIndex((m) => m.runId === runId);
      return daemonRunStatus(runId, messageIdFor(index), 'failed');
    });
    const probe = reattachProbe();

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await settle(300);

    expect(
      probe.peak,
      `同时有 ${probe.peak} 条重连在飞 —— 这一刻正是连接预算最紧的时候`,
    ).toBeLessThanOrEqual(2);
  }, 20_000);

  it('排队不是丢弃:5 条最终全部重连', async () => {
    const messages = Array.from({ length: RECOVERABLE_COUNT }, (_, i) => disconnectedFailedMessage(i));
    listMessages.mockResolvedValue(messages);
    fetchChatRunStatus.mockImplementation(async (runId: string) => {
      const index = messages.findIndex((m) => m.runId === runId);
      return daemonRunStatus(runId, messageIdFor(index), 'failed');
    });
    const probe = reattachProbe();

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());

    // Drain the queue: every completion must admit the next one.
    for (let guard = 0; guard < 40 && probe.startedRunIds.size < RECOVERABLE_COUNT; guard += 1) {
      probe.release.splice(0).forEach((resolve) => resolve());
      await settle(60);
    }

    expect(
      [...probe.startedRunIds].sort(),
      '被限流挡住的重连必须后来补上,不能就此不连',
    ).toEqual(Array.from({ length: RECOVERABLE_COUNT }, (_, i) => runIdFor(i)).sort());
    expect(probe.peak).toBeLessThanOrEqual(2);
  }, 20_000);

  it('只有一条时不引入额外延迟:重连在同一轮就发出', async () => {
    listMessages.mockResolvedValue([disconnectedFailedMessage(0)]);
    fetchChatRunStatus.mockResolvedValue(
      daemonRunStatus(runIdFor(0), messageIdFor(0), 'failed'),
    );
    const probe = reattachProbe();

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));

    expect(probe.startedRunIds.has(runIdFor(0))).toBe(true);
    expect(probe.peak).toBe(1);
  }, 20_000);

  it('daemon 说还活着的 run 不排队 —— 它的流要跑到 run 结束才 resolve', async () => {
    // 三条活着的 run。它们的重挂 promise 在 run 结束前不会 settle,所以任何
    // 「占着槽位直到 promise settle」的限流都会让第三条永远收不到输出。
    const messages = [runningMessage(0), runningMessage(1), runningMessage(2)];
    listMessages.mockResolvedValue(messages);
    fetchChatRunStatus.mockImplementation(async (runId: string) => {
      const index = messages.findIndex((m) => m.runId === runId);
      return daemonRunStatus(runId, messageIdFor(index), 'running');
    });
    const started = new Set<string>();
    reattachDaemonRun.mockImplementation(async (options: ReattachOptions) => {
      started.add(options.runId);
      options.onRunStatus?.('running');
      await new Promise(() => {}); // 活着的流不结束
    });

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await settle(300);

    expect(
      [...started].sort(),
      '活着的 run 一条都不能被挡在闸后面 —— 挡住就是丢它的输出',
    ).toEqual([runIdFor(0), runIdFor(1), runIdFor(2)]);
  }, 20_000);
});
