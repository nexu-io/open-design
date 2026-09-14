// @vitest-environment jsdom

/*
 * 在 OD Next 折叠回合的**末尾**点分叉,新会话只剩第一轮。
 *
 * 真实现场(打包版 Beta,project 1bedbbc7-5b52-4178-b916-f0d7d8c79d21,
 * 会话 59edcc92-3f83-4c7f-880f-8eccf905785a):一条 Full Plan 走了三个物理 run
 * (request / clarification / production,`strategy_task_runs.task_run_index`
 * 0/1/2),落库是 position 0..4 五条消息。用户在对话末尾点了分叉,
 * 新会话 44308cdb / ce06468e 里只有 position 0 和 1 —— 也就是 **request 那一轮**,
 * 后面的澄清和交付全丢了。
 *
 * 触发路径:历史 GET 给每条消息补上 `strategyTaskRunIndex`
 * (`apps/daemon/src/routes/project/conversations.ts` 的 messages 路由),
 * `foldStrategyTaskTurns` 于是把 position 1/3/4 三条助手消息折成**一条**渲染消息,
 * 而折出来那条沿用的是**头一条**(runIndex 0)的 `id`。分叉按钮挂在这条折叠消息上,
 * `handleForkFromMessage` 直接把 `assistantMessage.id` 当成 `forkAfterMessageId`
 * 送给 daemon,daemon 按契约「copy only source messages up to and including this
 * message」切在 position 1。
 *
 * 折叠是**渲染层**的事(`packages/contracts/src/sse/chat.ts` 里那条注释:客户端
 * "folding the task's messages at render time",不该重指消息)。分叉是**转录层**的
 * 操作,边界必须落回这条逻辑回合在转录里的最后一条物理消息。
 */

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@open-design/contracts';
import { ProjectView } from '../../src/components/ProjectView';
import { foldStrategyTaskTurns } from '../../src/components/ChatPane';

const analyticsMocks = vi.hoisted(() => ({
  newRequestId: vi.fn(() => 'fork-request-1'),
  track: vi.fn(),
}));

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const deleteConversation = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveMessage = vi.fn();
const saveTabs = vi.fn();

const chatPaneProps: {
  onForkFromMessage?: (message: ChatMessage) => Promise<void> | void;
  messages?: ChatMessage[];
} = {};

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

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    newRequestId: analyticsMocks.newRequestId,
    setConfigureGlobals: vi.fn(),
    setConsent: vi.fn(),
    setIdentity: vi.fn(),
    track: analyticsMocks.track,
  }),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  ProjectConversationsHttpError: class ProjectConversationsHttpError extends Error {
    constructor(readonly status: number, message = `conversations ${status}`) {
      super(message);
    }
  },
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: (...args: unknown[]) => deleteConversation(...args),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: (...args: unknown[]) => patchConversation(...args),
  patchProject: (...args: unknown[]) => patchProject(...args),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: (...args: unknown[]) => saveTabs(...args),
}));

/*
 * ChatPane 只把组件换成一个抓 props 的空壳,**模块其余导出保持真身** ——
 * `foldStrategyTaskTurns` 得是产品里那一份,不然这条测试断言的就是一个仿制的折叠结果。
 */
vi.mock('../../src/components/ChatPane', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/ChatPane')>();
  return {
    ...actual,
    ChatPane: (props: {
      onForkFromMessage?: (message: ChatMessage) => Promise<void> | void;
      messages?: ChatMessage[];
    }) => {
      chatPaneProps.onForkFromMessage = props.onForkFromMessage;
      chatPaneProps.messages = props.messages;
      return null;
    },
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => null,
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

const TASK_EXECUTION_ID = 'odnext_d56fa27247794fe6a7f2e46156f0dee0';
const REQUEST_ASSISTANT_ID = 'home-auto-send-0qzyd9dzs8wn2-assistant';
const PRODUCTION_ASSISTANT_ID = 'odnext_assistant_26e1ba4b367f97c2d2aa9ac0aedafb35';
const CLARIFICATION_ASSISTANT_ID = '5ba87c0e-4e52-4d7f-a265-cc244e68bdaa';
const FORM_ANSWER_USER_ID = 'qf-answer-2ig14i1cfplni-user';

/**
 * 落盘原样(`app.sqlite` 里那五行 + 历史 GET 补的三个 strategyTask* 字段)。
 * id / run_id / task_run_index / outcome=completed 带来的 delivered 都照抄。
 */
const TRANSCRIPT: ChatMessage[] = [
  {
    id: 'home-auto-send-0qzyd9dzs8wn2-user',
    role: 'user',
    content: '像一线企业客户 AE 一样写 B2B SaaS 销售提案——一份可商业交付的B2B 销售 Deck',
    sessionMode: 'design',
  },
  {
    id: REQUEST_ASSISTANT_ID,
    role: 'assistant',
    content: "I'll start by understanding the request and checking the assets.",
    agentId: 'claude',
    runId: 'b349a574-12dc-4333-86b7-052c6495f217',
    runStatus: 'succeeded',
    sessionMode: 'design',
    strategyTaskExecutionId: TASK_EXECUTION_ID,
    strategyTaskRunIndex: 0,
    strategyTaskDelivered: true,
  },
  {
    id: FORM_ANSWER_USER_ID,
    role: 'user',
    content: '[form answers — discovery]\n- 这份提案最终递给谁拍板？: 设计负责人 / Head of Design',
    sessionMode: 'design',
  },
  {
    id: CLARIFICATION_ASSISTANT_ID,
    role: 'assistant',
    content: '收到。三个答案已并入计划，路线保持 Full Plan，不再追问。',
    agentId: 'claude',
    runId: 'fefe72f4-48f0-4fb8-bf0d-3b837340a584',
    runStatus: 'succeeded',
    resultDeliveryState: 'delivered',
    sessionMode: 'design',
    strategyTaskExecutionId: TASK_EXECUTION_ID,
    strategyTaskRunIndex: 1,
    strategyTaskDelivered: true,
  },
  {
    id: PRODUCTION_ASSISTANT_ID,
    role: 'assistant',
    content: 'Slide count reads 17 because the grep also matched the frame.\n<od-done/>',
    agentId: 'claude',
    runId: '2518cf42-0368-4625-8bda-b0dac207a060',
    runStatus: 'succeeded',
    resultDeliveryState: 'delivered',
    sessionMode: 'design',
    strategyTaskExecutionId: TASK_EXECUTION_ID,
    strategyTaskRunIndex: 2,
    strategyTaskDelivered: true,
  },
];

function renderProjectView() {
  return render(
    <ProjectView
      project={{ id: 'project-1', name: 'Project', skillId: null, designSystemId: null } as never}
      routeFileName={null}
      config={{ mode: 'daemon', agentId: 'agent-1', notifications: undefined, agentModels: {} } as never}
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

describe('ProjectView fork from a folded OD Next turn', () => {
  beforeEach(() => {
    analyticsMocks.newRequestId.mockReturnValue('fork-request-1');
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'B2B SaaS 销售提案 Deck' }]);
    listMessages.mockResolvedValue(TRANSCRIPT);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]);
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    fetchChatRunStatus.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    listProjectRuns.mockResolvedValue([]);
    reattachDaemonRun.mockResolvedValue(undefined);
    createConversation.mockResolvedValue({ id: 'conv-fork', title: 'B2B SaaS 销售提案 Deck (1)' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    chatPaneProps.onForkFromMessage = undefined;
    chatPaneProps.messages = undefined;
  });

  it('前提:三个 run 折成一条渲染消息,而它带的是第一个 run 的 id', () => {
    const folded = foldStrategyTaskTurns(TRANSCRIPT);
    const assistants = folded.filter((message) => message.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0]!.id).toBe(REQUEST_ASSISTANT_ID);
    // 三个 run 的正文都在这一条里 —— 屏幕上「对话末尾」就是它。
    expect(assistants[0]!.content).toContain('Slide count reads 17');
    expect(assistants[0]!.runId).toBe('2518cf42-0368-4625-8bda-b0dac207a060');
  });

  it('在折叠回合末尾分叉要带上整条逻辑回合,而不是切在第一个 run', async () => {
    renderProjectView();
    // 只等转录到位。ProjectView 会给这些历史 run 补状态(本用例没起 daemon,
    // 它们会被判成 failed),那不影响分叉边界 —— 边界只看 id 和顺序。
    await waitFor(() =>
      expect(chatPaneProps.messages?.map((message) => message.id)).toEqual(
        TRANSCRIPT.map((message) => message.id),
      ),
    );

    const foldedTurn = foldStrategyTaskTurns(TRANSCRIPT).find(
      (message) => message.role === 'assistant',
    );
    expect(foldedTurn).toBeDefined();

    await act(async () => {
      await chatPaneProps.onForkFromMessage?.(foldedTurn!);
    });

    expect(createConversation).toHaveBeenCalledTimes(1);
    const [, , opts] = createConversation.mock.calls[0] as [
      string,
      string | undefined,
      { forkAfterMessageId?: string; forkFallbackPredecessorMessageId?: string | null },
    ];
    expect(
      opts.forkAfterMessageId,
      '分叉边界要落在这条逻辑回合在转录里的最后一条物理消息(production run),否则 daemon 切在 request run,澄清和交付全丢',
    ).toBe(PRODUCTION_ASSISTANT_ID);
    expect(opts.forkFallbackPredecessorMessageId).toBe(CLARIFICATION_ASSISTANT_ID);
  });
});
