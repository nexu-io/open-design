// @vitest-environment jsdom
/**
 * 红测:**daemon 已经判定终态的那条 run,重挂时的历史 `start` 帧不许把它复活成「进行中」**。
 *
 * 真机现象(用户 2026-08-27 实测,会话 64acc867 / 消息 b7b61e19):
 * DB 与 `/api/.../messages` 都写着 `runStatus: "failed"` + 正常的 `endedAt`,
 * 界面壳头却是 `Working 202m 23s`,秒数还在涨(199m24s → 200m48s → 202m23s);
 * 发送按钮 `disabled: true`、**没有停止按钮**,刷新也解不开 —— 这个会话对用户是死的。
 *
 * 因果链(逐段实测):
 *  1. 这条消息带 `DAEMON_STREAM_DISCONNECTED` 报错事件,于是
 *     `recoverableGenericDisconnectFailed` 为真;它又**有正文**,
 *     所以 `spuriouslyFailedPending` 为假 —— 走不到 `status === 'failed'` 的提前 bail,
 *     一路进到 `reattachDaemonRun`。
 *  2. daemon 重放这条 run 的事件日志。日志里**有 `start`、没有 `end`**
 *     (daemon 被重启打断,`terminalTrigger: "daemon_restart"`)。
 *  3. `providers/daemon.ts` 收到 `start` 就 `onRunStatus('running')` —— 那是「这条 run
 *     现在活着」的信号,可这里是一帧**历史**。消息被改回 `running`。
 *  4. 没有 `end`,就没有任何一帧把它改回终态。于是:
 *     · `isAssistantMessageStreaming` 因 `isActiveRunStatus` 提前返回 true
 *       → `AssistantMessage` 把 `turnRunStatus` 钉成 `'running'`
 *       → 壳头「进行中」,耗时走 `nowMs`,秒数永远涨;
 *     · `currentConversationAwaitingActiveRunAttach`(有活跃 run 但没在流)为真
 *       → 发送禁用,而 `currentConversationControlStreaming` 为假 → **没有停止按钮**。
 *
 * 判据:**重放帧不许压过 daemon 对同一条 run 已经给出的终态裁定。**
 * 订阅之前客户端刚问过 `/api/runs/:id`,拿到的就是 `failed` —— 那份裁定是权威的,
 * 它之后从同一条 run 的流里回放出来的「活着」信号只能是历史。
 *
 * 对照组一起钉住,免得用「永远不显示进行中」这种办法把 bug 弄消失:
 *  · daemon 说还在跑的重挂,`running` 照样落地;
 *  · 重挂中途 daemon 起了**新的 run**(strategy task 推进),新 run 的 `running` 照样落地。
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

const RUN_ID = '2b09f25a-78db-438e-a2c9-1ebaf7056668';
const MESSAGE_ID = 'b7b61e19-486c-47b3-937f-8b6f68f0a871';
const CONVERSATION_ID = '64acc867-a666-429c-a201-1e662f7c787d';
const STARTED_AT = 1787844872191;
const ENDED_AT = 1787845003969;

/**
 * `messages.events_json` 的**原样**拷贝(sqlite 里取出来的那一份)。
 * 关键两点:带 `startedAt` 却没有 `tool_result` 的 `tool_use`,
 * 以及末尾那条 `DAEMON_STREAM_DISCONNECTED`。
 */
const PERSISTED_EVENTS = [
  { kind: 'status', label: 'starting', detail: 'codex' },
  { kind: 'done_key', key: '42bcec4487e388e5' },
  { kind: 'status', label: 'initializing' },
  { kind: 'status', label: 'thinking' },
  { kind: 'thinking', text: '**Planning detailed typography article**' },
  {
    kind: 'text',
    text: '\n\n\n我会保留现有羊皮纸写作室与交互，只把当前主文稿改写为一篇至少八节的中文排版长文。\n',
  },
  {
    kind: 'tool_use',
    id: 'item_2',
    name: 'TodoWrite',
    input: {
      todos: [
        { content: '核对现有文稿结构与权威排版依据', status: 'pending' },
        { content: '撰写八节以上的中文排版长文', status: 'pending' },
      ],
    },
    startedAt: 1787844892886,
  },
  {
    kind: 'status',
    label: 'error',
    detail: 'daemon stream disconnected before run completed',
    code: 'GENERIC_DAEMON_DISCONNECT',
  },
] as unknown as ChatMessage['events'];

function failedMessage(): ChatMessage {
  return {
    id: MESSAGE_ID,
    role: 'assistant',
    content: '\n\n\n我会保留现有羊皮纸写作室与交互，只把当前主文稿改写为一篇至少八节的中文排版长文。\n',
    agentId: 'codex',
    runId: RUN_ID,
    runStatus: 'failed',
    startedAt: STARTED_AT,
    endedAt: ENDED_AT,
    createdAt: STARTED_AT,
    events: PERSISTED_EVENTS,
  } as unknown as ChatMessage;
}

/** `/api/runs/:id` 对这条 run 的真实回读(实测 200,`status: "failed"`)。 */
function daemonRunStatus(status: string) {
  return {
    id: RUN_ID,
    projectId: 'project-1',
    conversationId: CONVERSATION_ID,
    assistantMessageId: MESSAGE_ID,
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

const paneMessage = (): ChatMessage | undefined =>
  paneHarness.messages.find((m) => m.id === MESSAGE_ID);

beforeEach(() => {
  vi.clearAllMocks();
  paneHarness.messages = [];
  paneHarness.streaming = false;
  paneHarness.sendDisabled = false;
  listConversations.mockResolvedValue([
    { id: CONVERSATION_ID, projectId: 'project-1', title: 'T', createdAt: 0, updatedAt: 0 },
  ]);
  listMessages.mockResolvedValue([failedMessage()]);
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

describe('重挂一条 daemon 已判终态的 run', () => {
  it('历史 `start` 帧不许把「已失败」改回「进行中」', async () => {
    fetchChatRunStatus.mockResolvedValue(daemonRunStatus('failed'));
    // daemon 重放这条 run 的日志:有 `start`、没有 `end`。
    // `providers/daemon.ts:1900` 收到 `start` 就发 'running' —— 原样复现那一下。
    reattachDaemonRun.mockImplementation(async (options: { onRunStatus?: (s: string) => void }) => {
      options.onRunStatus?.('running');
    });

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());

    await waitFor(() => {
      expect(paneMessage(), '消息应当还在列表里').toBeDefined();
    });
    // 壳头的判据:`AssistantMessage` 只要看到 running/queued 就把整轮画成「进行中」。
    expect(paneMessage()?.runStatus, '已判失败的轮次不能被历史帧改回进行中').toBe('failed');
    // 用户的出路:发送按钮不能被这条死 run 永久锁住。
    expect(paneHarness.sendDisabled, '发送不该被一条已结束的 run 锁住').toBe(false);
  });

  it('daemon 说还在跑时,`running` 照样落地(别用「永不进行中」把 bug 弄消失)', async () => {
    fetchChatRunStatus.mockResolvedValue(daemonRunStatus('running'));
    reattachDaemonRun.mockImplementation(async (options: { onRunStatus?: (s: string) => void }) => {
      options.onRunStatus?.('running');
    });

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await waitFor(() => {
      expect(paneMessage()?.runStatus, '真的在跑就该是 running').toBe('running');
    });
  });

  it('重挂中途 daemon 起了新的 run —— 新 run 的 `running` 照样落地', async () => {
    fetchChatRunStatus.mockResolvedValue(daemonRunStatus('failed'));
    reattachDaemonRun.mockImplementation(
      async (options: {
        onRunCreated?: (runId: string) => void;
        onRunStatus?: (s: string) => void;
      }) => {
        options.onRunCreated?.('11111111-2222-3333-4444-555555555555');
        options.onRunStatus?.('running');
      },
    );

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await waitFor(() => {
      expect(paneMessage()?.runStatus, '新 run 是另一条 run,终态裁定管不到它').toBe('running');
    });
  });
});
