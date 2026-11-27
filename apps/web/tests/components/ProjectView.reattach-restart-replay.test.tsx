// @vitest-environment jsdom
/**
 * 红测:daemon 被 `kill -9` 后重启,浏览器放弃重连,用户点〔重新连接〕。
 *
 * 那一轮带 `DAEMON_STREAM_DISCONNECTED` 标记(`recoverableGenericDisconnectFailed`),
 * 重挂走全量重放(`?after=` 不带游标,daemon 从第 0 条重推)。重启后的 daemon 把这条
 * run 从 state.json 里读回来、判成 `failed`(daemon_restart),`updatedAt` 是它最后
 * 一次落盘的时刻 —— 开跑后约 5 秒。
 *
 * run 从 state.json 里读回来、判成 `failed`(daemon_restart);`updatedAt` / `terminalAt`
 * 都是**重启时刻**(`interruptDurableRunAfterDaemonRestart`),不是这条 run 真正停下的时刻。
 *
 * 两处现象(main 上都能复现):
 *  1. 正文重复:重放出来的字被**追加**到已经显示过的正文后面(`working…working…`),
 *     而且错误标记还留着,每次刷新再追加一份。
 *  2. 结束时间错:壳头耗时取的是浏览器放弃重连的时刻(`onError` 盖的 `endedAt`),
 *     而 daemon 记录里有真正的终态时间时应当以记录为准。
 *
 * 判据:
 *  · 全量重放就是从 run 的事件日志重建这一轮,起点必须是空白(或任务前缀),
 *    与 daemon 的裁定是什么无关;
 *  · 重建只在内存里做,在重放结果落地之前这一轮必须仍可恢复 —— 中途刷新不许丢正文;
 *  · daemon 记录的终态时间是真实终态时才采用;重启补判的时间是开机时刻,不能拿来当结束。
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

/** ChatPane 收到的最后一份 props —— 发送闸与停止按钮的可见判据都在这里。 */
const paneHarness = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  streaming: false,
  sendDisabled: false,
}));

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
  ChatPane: (props: {
    messages: ChatMessage[];
    streaming: boolean;
    sendDisabled: boolean;
  }) => {
    paneHarness.messages = props.messages;
    paneHarness.streaming = props.streaming;
    paneHarness.sendDisabled = props.sendDisabled;
    return null;
  },
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => null,
}));

vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => null }));

const RUN_ID = 'run-restart-1';
const MESSAGE_ID = 'assistant-restart-1';
const CONVERSATION_ID = 'conversation-restart-1';
const STARTED_AT = 1_790_000_000_000;
/** daemon 自己判出的真实终态时刻(没有经过重启的那种失败)。 */
const RECORD_ENDED_AT = STARTED_AT + 5_000;
/** 浏览器 5 次重连用尽、放弃的时刻 —— 直播 `onError` 盖在 `endedAt` 上的值。 */
const GAVE_UP_AT = STARTED_AT + 89_000;
/** daemon 重启后补判的时刻 —— 比放弃重连还晚。 */
const DAEMON_BOOTED_AT = STARTED_AT + 120_000;
const TEXT = 'working…';
const DISCONNECT_MESSAGE = 'daemon stream disconnected before run completed';

function disconnectedMessage(): ChatMessage {
  return {
    id: MESSAGE_ID,
    role: 'assistant',
    content: TEXT,
    agentId: 'codex',
    runId: RUN_ID,
    runStatus: 'failed',
    startedAt: STARTED_AT,
    endedAt: GAVE_UP_AT,
    createdAt: STARTED_AT,
    lastRunEventId: '3',
    events: [
      { kind: 'status', label: 'starting', detail: 'codex' },
      { kind: 'text', text: TEXT },
      {
        kind: 'status',
        label: 'error',
        detail: DISCONNECT_MESSAGE,
        code: 'GENERIC_DAEMON_DISCONNECT',
      },
    ],
  } as unknown as ChatMessage;
}

function restartedRunStatus() {
  return {
    ...terminalRunStatus(),
    updatedAt: DAEMON_BOOTED_AT,
    terminalAt: DAEMON_BOOTED_AT,
    terminalTrigger: 'daemon_restart',
  };
}

/** 断连期间 daemon 还活着、run 自己失败了:记录里的时间就是真实终态。 */
function agentFailedRunStatus() {
  return {
    ...terminalRunStatus(),
    error: 'agent exited with code 1',
    errorCode: 'AGENT_EXITED',
    terminalTrigger: null,
  };
}

function terminalRunStatus() {
  return {
    id: RUN_ID,
    projectId: 'project-1',
    conversationId: CONVERSATION_ID,
    assistantMessageId: MESSAGE_ID,
    agentId: 'codex',
    status: 'failed',
    createdAt: STARTED_AT,
    updatedAt: RECORD_ENDED_AT,
    terminalAt: RECORD_ENDED_AT,
    error: 'Run interrupted because the daemon restarted.',
    errorCode: 'DAEMON_RESTARTED',
    resumable: false,
    artifactCount: 0,
  };
}

type ReattachOptions = {
  handlers: {
    onDelta: (delta: string) => void;
    onAgentEvent: (ev: unknown) => void;
    onError: (err: Error) => void | Promise<void>;
  };
  onRunStatus?: (status: string) => void;
};

/** daemon 从第 0 条重推这条 run 的日志:start、正文,然后是终态 error + end(failed)。 */
function replayRunLog(message: string, code: string) {
  return async (options: ReattachOptions) => {
    options.onRunStatus?.('running');
    options.handlers.onAgentEvent({ kind: 'status', label: 'starting', detail: 'codex' });
    options.handlers.onDelta(TEXT);
    options.handlers.onAgentEvent({ kind: 'text', text: TEXT });
    options.onRunStatus?.('failed');
    await options.handlers.onError(Object.assign(new Error(message), { code }));
  };
}

const replayRestartedRunLog = replayRunLog(
  'Run interrupted because the daemon restarted.',
  'DAEMON_RESTARTED',
);

const hasErrorCode = (message: ChatMessage | undefined, code: string) =>
  (message?.events ?? []).some(
    (ev) => ev.kind === 'status' && (ev as { code?: string }).code === code,
  );

function renderProjectView(options?: { daemonLive?: boolean }) {
  const project = {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
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
      daemonLive={options?.daemonLive ?? true}
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

beforeEach(() => {
  vi.clearAllMocks();
  paneHarness.messages = [];
  paneHarness.streaming = false;
  paneHarness.sendDisabled = false;
  listConversations.mockResolvedValue([
    { id: CONVERSATION_ID, projectId: 'project-1', title: 'T', createdAt: 0, updatedAt: 0 },
  ]);
  listMessages.mockResolvedValue([disconnectedMessage()]);
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

afterEach(() => {
  cleanup();
});


const paneMessage = (): ChatMessage | undefined =>
  paneHarness.messages.find((m) => m.id === MESSAGE_ID);

const textEvents = (message: ChatMessage | undefined) =>
  (message?.events ?? []).filter((ev) => ev.kind === 'text');

const hasDisconnectMarker = (message: ChatMessage | undefined) =>
  (message?.events ?? []).some(
    (ev) => ev.kind === 'status' && ev.label === 'error'
      && (ev as { code?: string }).code === 'GENERIC_DAEMON_DISCONNECT',
  );

describe('daemon 重启后重挂一条断连的 run', () => {
  it('重放出来的正文替换而不是追加,刷新也不再追加', async () => {
    fetchChatRunStatus.mockResolvedValue(restartedRunStatus());
    reattachDaemonRun.mockImplementation(replayRestartedRunLog);

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await waitFor(() => {
      expect(textEvents(paneMessage()).length, '重放应当落地').toBeGreaterThan(0);
      expect(hasErrorCode(paneMessage(), 'DAEMON_RESTARTED')).toBe(true);
    });

    expect(paneMessage()?.content, '已经显示过的正文不许再拼一份').toBe(TEXT);
    expect(
      textEvents(paneMessage()).map((ev) => (ev as { text: string }).text).join(''),
    ).toBe(TEXT);
    // 断连标记还在,下次刷新就会再全量重放一次、再追加一份。
    expect(hasDisconnectMarker(paneMessage()), '重放已经给出 daemon 的裁定').toBe(false);
    expect(paneMessage()?.runStatus).toBe('failed');
  });

  it('daemon 记录的是真实终态时,结束时间以记录为准,不是浏览器放弃重连的时刻', async () => {
    fetchChatRunStatus.mockResolvedValue(agentFailedRunStatus());
    reattachDaemonRun.mockImplementation(replayRunLog('agent exited with code 1', 'AGENT_EXITED'));

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await waitFor(() => expect(hasErrorCode(paneMessage(), 'AGENT_EXITED')).toBe(true));

    expect(paneMessage()?.content).toBe(TEXT);
    expect(paneMessage()?.endedAt).toBe(RECORD_ENDED_AT);
  });

  it('重启补判的时刻是开机时间,不能当结束时间(否则耗时只会更长)', async () => {
    fetchChatRunStatus.mockResolvedValue(restartedRunStatus());
    reattachDaemonRun.mockImplementation(replayRestartedRunLog);

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await waitFor(() => expect(hasErrorCode(paneMessage(), 'DAEMON_RESTARTED')).toBe(true));

    expect(paneMessage()?.endedAt).not.toBe(DAEMON_BOOTED_AT);
    expect(paneMessage()?.endedAt).toBe(GAVE_UP_AT);
  });

  it('重放结果落地之前刷新,这一轮仍然可恢复,日志照样重放回来', async () => {
    fetchChatRunStatus.mockResolvedValue(restartedRunStatus());
    // 第一次挂载:订阅已经开始,但日志一帧都还没回来。
    reattachDaemonRun.mockImplementationOnce(() => new Promise(() => undefined));

    const first = renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    // 让已经排上的落盘都走完,再看此刻库里存的是什么。
    await new Promise((resolve) => setTimeout(resolve, 700));
    const savedBeforeReplay = saveMessage.mock.calls
      .map((call) => call[2] as ChatMessage)
      .filter((saved) => saved?.id === MESSAGE_ID)
      .at(-1);
    first.unmount();

    // 刷新:从库里存的那一份重新载入。
    listMessages.mockResolvedValue([savedBeforeReplay ?? disconnectedMessage()]);
    reattachDaemonRun.mockImplementation(replayRestartedRunLog);
    renderProjectView();

    await waitFor(
      () => expect(reattachDaemonRun, '刷新后应当再订阅一次,把日志重放回来').toHaveBeenCalledTimes(2),
    );
    await waitFor(() => expect(hasErrorCode(paneMessage(), 'DAEMON_RESTARTED')).toBe(true));
    expect(paneMessage()?.content).toBe(TEXT);
  });
});
