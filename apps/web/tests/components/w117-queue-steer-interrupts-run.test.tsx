// @vitest-environment jsdom
//
// 红测(OPEND-2602 · 接线那一半):**「引导对话」按下去走的是「中断 + 立即发送」。**
//
// `tests/components/chat/w117-queue-steer-interrupt.test.tsx` 断言的是这颗按钮
// 长什么样;这一页断言的是它接在哪条路上,以及**它什么时候出现**。
//
// 两件必须同时成立的事:
//
//   1. **对 `promptInputFormat` 不是 `stream-json` 的 agent 也出现。**
//      原来这颗由 `agentSupportsMidTurnSteering` 把关 —— 27 个 runtime 里只有
//      `claude` / `codebuddy` 过得了那道关,其余 25 个连按钮都没有。中断对所有
//      agent 都成立,所以那道关整个作废。这一页用 `codex`(`text`)当样本。
//
//   2. **点下去是 `handleStop()` + 重排队列,不是往 stdin 写字。**
//      证据钉在真实副作用上,不是「某个函数被调了」:在跑那一轮的 `cancelSignal`
//      真的被 abort,而且队列里那条真的作为**第二次** `streamViaDaemon` 发了出去;
//      同时 `steerChatRun` 一次都没被调用。
//
// `ChatPane` 在这一层是 mock 的(它自带半个应用),所以这里操作的是
// **ProjectView 交给 ChatPane 的那几个 prop**;两段靠同一个 prop 名接在一起。

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { steerChatRun, streamViaDaemon } from '../../src/providers/daemon';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import { fetchPreviewComments, fetchProjectFiles } from '../../src/providers/registry';
import { fetchBrands } from '../../src/runtime/brands';
import type {
  AgentInfo,
  AppConfig,
  ChatMessage,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';

const PROJECT_ID = 'steer-interrupt-project';
const FIRST_PROMPT = '先把首屏排出来';
const QUEUED_PROMPT = '顺手把 CTA 换成深色';

const chatPaneSpy = vi.hoisted(() => vi.fn());
const workspaceScopeMocks = vi.hoisted(() => ({
  projectScope: { loading: false, scope: null } as ProjectWorkspaceScopeState,
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({ navigate: vi.fn() }));

vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));

vi.mock('../../src/providers/daemon', () => ({
  GENERIC_DAEMON_DISCONNECT_CODE: 'DAEMON_STREAM_DISCONNECTED',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
  // 这一页最要紧的一条断言就是「它一次都没被调用」,所以它必须在 mock 里存在,
  // 否则 ProjectView 连模块都导不进来,断言会赢在「根本没跑起来」上。
  steerChatRun: vi.fn(),
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  formatVelaBalanceUsd: (value: string | null) => `$${value ?? '0'}`,
  fetchVelaLoginStatus: vi.fn().mockResolvedValue({ loggedIn: true }),
  startVelaLogin: vi.fn(),
  cancelVelaLogin: vi.fn(),
  canUpgradeVelaPlan: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: () => workspaceScopeMocks.projectScope,
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/hooks/useDesignMdState', () => ({
  useDesignMdState: () => ({
    exists: false,
    generatedAt: null,
    transcriptMessageCount: null,
    designSystemId: null,
    currentArtifact: null,
    isStale: false,
    staleReason: null,
    loading: false,
    error: null,
    refresh: async () => {},
  }),
  computeStale: () => ({ isStale: false, staleReason: null }),
}));

vi.mock('../../src/runtime/brands', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/brands')>(
    '../../src/runtime/brands',
  );
  return { ...actual, fetchBrands: vi.fn().mockResolvedValue([]) };
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
    fetchPreviewComments: vi.fn().mockResolvedValue([]),
    fetchProjectFiles: vi.fn().mockResolvedValue([]),
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
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    persistTabsToDaemonNow: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => <div data-testid="file-workspace" />,
}));
vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

type MockChatPaneProps = {
  activeConversationId?: string | null;
  messages?: ChatMessage[];
  streaming?: boolean;
  sendDisabled?: boolean;
  queuedItems?: Array<{ id: string; prompt: string }>;
  onSend?: (prompt: string, attachments: [], commentAttachments: []) => unknown;
  onSteerQueuedSend?: (id: string) => void;
  onSendQueuedNow?: (id: string) => void;
};

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: MockChatPaneProps) => {
    chatPaneSpy(props);
    const first = props.queuedItems?.[0];
    return (
      <div>
        <div data-testid="active-conversation">{props.activeConversationId ?? ''}</div>
        <div data-testid="queued-count">{String(props.queuedItems?.length ?? 0)}</div>
        {/* 「引导对话」那一颗的存在与否,完全由这个 prop 有没有值决定
            (`QueuedSendStrip` 里就是 `onSteer ? 引导态 : 退回态`)。 */}
        <div data-testid="steer-offered">{props.onSteerQueuedSend ? 'yes' : 'no'}</div>
        <button
          type="button"
          data-testid="normal-send"
          disabled={props.sendDisabled}
          onClick={() => props.onSend?.(FIRST_PROMPT, [], [])}
        >
          send
        </button>
        <button
          type="button"
          data-testid="queue-send"
          onClick={() => props.onSend?.(QUEUED_PROMPT, [], [])}
        >
          queue
        </button>
        <button
          type="button"
          data-testid="steer-click"
          disabled={!first || !props.onSteerQueuedSend}
          onClick={() => first && props.onSteerQueuedSend?.(first.id)}
        >
          steer
        </button>
      </div>
    );
  },
}));

const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);
const mockedSteerChatRun = vi.mocked(steerChatRun);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedFetchBrands = vi.mocked(fetchBrands);

/**
 * `codex` —— 25 个「中途不读 stdin」的 runtime 之一。这一页选它不是随手挑的:
 * 旧实现下 `agentSupportsMidTurnSteering(codex)` 是 `false`,按钮压根不出现。
 */
const CODEX: AgentInfo = {
  id: 'codex',
  name: 'Codex',
  available: true,
  promptInputFormat: 'text',
} as AgentInfo;

/**
 * 另一头的样本 —— `claude` 是原来唯二过得了那道关的 runtime 之一。
 * 留着它是为了照出**反过来接错**的那种回归(比如判据被写成
 * `!== 'stream-json'`):新规矩是两头都出现,一头绿一头红都算没接对。
 */
const CLAUDE: AgentInfo = {
  id: 'claude',
  name: 'Claude',
  available: true,
  promptInputFormat: 'stream-json',
} as AgentInfo;

const config: AppConfig = {
  mode: 'daemon',
  apiProtocol: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
};

const project = (): Project => ({
  id: PROJECT_ID,
  name: 'Steer Interrupt',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  metadata: { kind: 'prototype' },
} as Project);

const conversation = (projectId: string): Conversation => ({
  id: `conv-${projectId}`,
  projectId,
  title: null,
  createdAt: 1,
  updatedAt: 1,
});

function renderProjectView(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  return render(
    <ProjectView
      project={project()}
      routeFileName={null}
      config={config}
      agents={[CODEX]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[] as DesignSystemSummary[]}
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
      {...overrides}
    />,
  );
}

type DaemonRunOptions = {
  history?: Array<{ role: string; content: string }>;
  cancelSignal?: AbortSignal;
  onRunCreated?: (runId: string) => void;
  handlers: Record<string, unknown>;
};

const startedRuns: DaemonRunOptions[] = [];

/** 每一轮都起来就挂住 —— 只有挂住,会话才停在 busy 上等我们点那颗按钮。 */
function hangEveryRun() {
  mockedStreamViaDaemon.mockImplementation((options: unknown) => {
    const opts = options as DaemonRunOptions;
    startedRuns.push(opts);
    opts.onRunCreated?.(`run-${startedRuns.length}`);
    return new Promise<never>(() => {});
  });
}

function lastChatPaneProps(): MockChatPaneProps {
  return chatPaneSpy.mock.calls.at(-1)?.[0] as MockChatPaneProps;
}

describe('OPEND-2602:队列里的「引导对话」按下去中断当前运行', () => {
  beforeEach(() => {
    startedRuns.length = 0;
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    mockedListConversations.mockImplementation(async (projectId: string) => [
      conversation(projectId),
    ]);
    mockedCreateConversation.mockImplementation(async (projectId: string) =>
      conversation(projectId),
    );
    mockedListMessages.mockResolvedValue([]);
    mockedFetchPreviewComments.mockResolvedValue([]);
    mockedFetchProjectFiles.mockResolvedValue([]);
    mockedFetchBrands.mockResolvedValue([]);
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: { kind: 'unbound', projectId: PROJECT_ID, workspaceId: null, context: null },
    } as ProjectWorkspaceScopeState;
    hangEveryRun();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /** 起一轮并挂住,然后排一条队 —— 这一页每条用例的起手式。 */
  async function startRunAndQueueOne(agent: AgentInfo = CODEX) {
    renderProjectView({
      agents: [agent],
      config: { ...config, agentId: agent.id },
    });
    await screen.findByTestId('normal-send');
    await waitFor(() =>
      expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId('normal-send'));
    await waitFor(() => expect(startedRuns).toHaveLength(1));
    // 队列只在会话 busy 的时候才收得下 —— 这正是产品说的那个场景。
    fireEvent.click(screen.getByTestId('queue-send'));
    await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('1'));
  }

  // 两头都钉:25 个中途不读 stdin 的 runtime 里挑 codex,原来唯二过得了旧关卡的
  // 挑 claude。旧实现下前者是红的、后者是绿的 —— 只钉一头照不出「判据接反了」。
  it.each([
    ['codex(promptInputFormat: text)', CODEX],
    ['claude(promptInputFormat: stream-json)', CLAUDE],
  ])('%s 都给出这颗按钮', async (_name, agent) => {
    await startRunAndQueueOne(agent as AgentInfo);
    expect(screen.getByTestId('steer-offered').textContent).toBe('yes');
    expect(typeof lastChatPaneProps().onSteerQueuedSend).toBe('function');
  });

  it('点下去:在跑的那一轮被中断,队列里这条立刻作为新一轮发出去', async () => {
    await startRunAndQueueOne();

    const interrupted = startedRuns[0]!;
    expect(interrupted.cancelSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByTestId('steer-click'));

    // 一、在跑的那一轮真的被掐掉(不是「按钮变灰了」这种表面证据)。
    await waitFor(() => expect(interrupted.cancelSignal?.aborted).toBe(true));

    // 二、队列里那条真的作为**第二轮**发了出去,而且带的是它自己的话。
    await waitFor(() => expect(startedRuns).toHaveLength(2));
    const resent = startedRuns[1]!;
    const lastUser = [...(resent.history ?? [])].reverse().find((m) => m.role === 'user');
    expect(lastUser?.content).toContain(QUEUED_PROMPT);

    // 三、队列被清空 —— 这条已经在跑了,不能还排在队里等第二次。
    await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('0'));

    // 四、一个字都没往 stdin 里写。
    expect(mockedSteerChatRun).not.toHaveBeenCalled();
  });

  // ——— 反向对照:没有在跑的一轮 ———

  it('一轮都没在跑时不给这颗按钮 —— 没有任何东西可中断', async () => {
    renderProjectView();
    await screen.findByTestId('normal-send');
    await waitFor(() =>
      expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
    );
    // 等一拍,让任何异步落定 —— 「没给按钮」不能只赢在时序上。
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(startedRuns).toHaveLength(0);
    expect(screen.getByTestId('steer-offered').textContent).toBe('no');
    expect(lastChatPaneProps().onSteerQueuedSend).toBeUndefined();
    // 「立即发送」那条路一直都在,不许被这次改动带走。
    expect(typeof lastChatPaneProps().onSendQueuedNow).toBe('function');
  });
});
