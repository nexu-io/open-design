// @vitest-environment jsdom
/**
 * 红测:**一次没拿到裁定的重挂,不许原地立刻再来一次。**
 *
 * 真机现象(用户 2026-08-28,Next.js 16 dev):控制台反复报
 * `Maximum update depth exceeded`,栈落在重挂这条链上 ——
 * `onRunEventId → updateMessageById → setMessages`(ProjectView.tsx:6723 → 4538)
 * 以及 `persistSoon → scheduleProjectTimeout → persistMessageById → setMessages`
 * (:6008 → :2216 → :4517)。
 *
 * 因果链:
 *  1. `attachRecoverableRuns` 那条 effect 的依赖里带着 `messages`。
 *  2. 重挂过程中每一条回放事件都会 `updateMessageById`(改 `lastRunEventId`),
 *     而 `updateMessageById` 的 `setMessages((curr) => curr.map(...))` **永远**返回新数组
 *     —— 于是每条事件都让这条 effect 重跑一次。
 *  3. 正常收场时不要紧:`onDone` / `onError` 会 `completeReattachRuns()` 把这条 run 封存,
 *     effect 重跑时在 `completedReattachRunsRef` 那道闸上直接 `continue`。
 *  4. 但流**没有给出任何裁定**就结束时(既没 done 也没 error),收尾只走 `.finally()` 里的
 *     `releaseReattachRuns()`:认领被释放、又没有封存。下一次 effect 重跑发现这条消息
 *     照旧「需要重放」、既没被认领也没被封存 —— 立刻又订阅一次,又回放一整份事件日志,
 *     又改一遍 `messages`,再触发下一次重跑。
 *
 * 实测(本文件的探针版本):约 **120 次重挂/秒**,每次都带一次 SSE 订阅 + 一次 saveMessage,
 * 一秒钟能打出 600 次 `onRunEventId → setMessages`。
 *
 * 判据:**daemon 一句话都没说的那次重挂,不构成「再试一次」的理由。**
 * 这里数的是循环本身(订阅次数在涨没涨),不是「消息最后是什么状态」——
 * 循环的每一帧,消息状态都是对的。
 *
 * 反向对照在下面:daemon 真的说了话时,重挂照常发生、事件照常落地。
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

const RUN_ID = '2b09f25a-78db-438e-a2c9-1ebaf7056668';
const MESSAGE_ID = 'b7b61e19-486c-47b3-937f-8b6f68f0a871';
const CONVERSATION_ID = '64acc867-a666-429c-a201-1e662f7c787d';
const STARTED_AT = 1787844872191;
const ENDED_AT = 1787845003969;

/**
 * 用户那条真机消息的形状:有正文(所以躲开 `spuriouslyFailedPending` 的提前 bail),
 * 末尾带 `DAEMON_STREAM_DISCONNECTED`(所以 `recoverableGenericDisconnectFailed` 为真,
 * 一路进到重挂)。
 */
function disconnectedFailedMessage(): ChatMessage {
  return {
    id: MESSAGE_ID,
    role: 'assistant',
    content: '我会保留现有羊皮纸写作室与交互。',
    agentId: 'codex',
    runId: RUN_ID,
    runStatus: 'failed',
    startedAt: STARTED_AT,
    endedAt: ENDED_AT,
    createdAt: STARTED_AT,
    events: [
      { kind: 'status', label: 'starting', detail: 'codex' },
      { kind: 'text', text: '我会保留现有羊皮纸写作室与交互。' },
      {
        kind: 'status',
        label: 'error',
        detail: 'daemon stream disconnected before run completed',
        code: 'GENERIC_DAEMON_DISCONNECT',
      },
    ],
  } as unknown as ChatMessage;
}

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
  onRunStatus?: (status: string) => void;
  onRunEventId?: (id: string) => void;
  handlers: { onDone: (text: string) => void; onError: (err: Error) => void };
};

beforeEach(() => {
  vi.clearAllMocks();
  paneHarness.messages = [];
  listConversations.mockResolvedValue([
    { id: CONVERSATION_ID, projectId: 'project-1', title: 'T', createdAt: 0, updatedAt: 0 },
  ]);
  listMessages.mockResolvedValue([disconnectedFailedMessage()]);
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

afterEach(() => { cleanup(); });

describe('重挂:没有裁定的那一次不构成重试理由', () => {
  it('回放流悄悄结束(没有 done 也没有 error)时,订阅次数必须收敛', async () => {
    fetchChatRunStatus.mockResolvedValue(daemonRunStatus('failed'));
    let events = 0;
    reattachDaemonRun.mockImplementation(async (options: ReattachOptions) => {
      // daemon 回放这条 run 的事件日志,然后流就没了 —— 一句裁定都没给。
      for (let i = 0; i < 5; i += 1) {
        events += 1;
        options.onRunEventId?.(`evt-${events}`);
        await Promise.resolve();
      }
    });

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await settle(400);
    const first = reattachDaemonRun.mock.calls.length;
    await settle(600);
    const second = reattachDaemonRun.mock.calls.length;

    expect(
      second,
      `重挂在 1 秒内被发起了 ${second} 次(前 400ms 已经 ${first} 次)—— 这是订阅风暴,不是重试`,
    ).toBeLessThanOrEqual(2);
    expect(second, '不许因此彻底不重挂:第一次订阅必须真的发生过').toBeGreaterThanOrEqual(1);
    // 每次订阅都要回放整份日志,写一遍 messages,再顺带一次 saveMessage。
    expect(saveMessage.mock.calls.length, '持久化写入也必须跟着收敛').toBeLessThan(20);
  }, 20_000);

  /** 反向对照 1:daemon 说了话的那次重挂,一切照旧。 */
  it('daemon 给出终态裁定时,重挂照常发生、回放事件照常落地', async () => {
    fetchChatRunStatus.mockResolvedValue(daemonRunStatus('failed'));
    let events = 0;
    reattachDaemonRun.mockImplementation(async (options: ReattachOptions) => {
      for (let i = 0; i < 5; i += 1) {
        events += 1;
        options.onRunEventId?.(`evt-${events}`);
        await Promise.resolve();
      }
      options.onRunStatus?.('failed');
      options.handlers.onError(new Error('the run failed'));
    });

    renderProjectView();
    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalled());
    await settle(700);

    expect(events, '事件必须真的被消费过').toBe(5);
    expect(reattachDaemonRun.mock.calls.length, '拿到裁定后不该反复重挂').toBeLessThanOrEqual(2);
    expect(
      paneHarness.messages.find((m) => m.id === MESSAGE_ID)?.runStatus,
      '终态裁定要落到消息上',
    ).toBe('failed');
  }, 20_000);

  /** 反向对照 2:daemon 说这条 run 还活着时,必须真的接上并把内容放行。 */
  it('daemon 说 run 还在跑时,重挂必须真的接上', async () => {
    fetchChatRunStatus.mockResolvedValue(daemonRunStatus('running'));
    let attached = false;
    reattachDaemonRun.mockImplementation(async (options: ReattachOptions) => {
      attached = true;
      options.onRunStatus?.('running');
      await new Promise(() => {}); // 活着的流不结束
    });

    renderProjectView();
    await waitFor(() => expect(attached).toBe(true));
    await settle(500);

    expect(reattachDaemonRun.mock.calls.length, '活着的流只订阅一次').toBe(1);
    await waitFor(() => {
      expect(
        paneHarness.messages.find((m) => m.id === MESSAGE_ID)?.runStatus,
        'daemon 说在跑就该是 running',
      ).toBe('running');
    });
  }, 20_000);
});
