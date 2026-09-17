// @vitest-environment jsdom
// 宿主门控与真实错误卡生命周期。2026-09-14 用户明确：有效重试后旧卡撤下，
// 由新结果接管；历史失败消息保留。pending 身份用于防重/归属，不再要求旧卡回归。
// 旧门控/队列测试保留轻量 ChatPane stub；生命周期测试使用真实 ChatPane 与卡片。

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import type { ChatPane as ChatPaneComponent } from '../../src/components/ChatPane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type {
  AgentInfo,
  AppConfig,
  ChatMessage,
  Conversation,
  Project,
} from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const checkAmrBalanceGate = vi.fn();
const fetchBrands = vi.fn();

/** What each composer send was told to do with its draft. */
const sendOutcomes: unknown[] = [];
/** What the non-composer hosts got back from their own `handleSend` calls. */
const hostSendOutcomes: unknown[] = [];

const workspaceScopeMocks = vi.hoisted(() => {
  const personalContext = (): WorkspaceCollabContext => ({
    workspaceId: 'workspace-personal',
    workspaceMemberId: 'member-personal',
    workspaceType: 'personal',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 1,
      usedSeats: 1,
      availableSeats: 0,
      isSeatFull: true,
    },
    permissions: {
      canManageMembers: true,
      canManageBilling: true,
      canInviteMembers: true,
      canManageAutoRecharge: true,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: true,
    },
  } as WorkspaceCollabContext);
  return {
    personalContext,
    ambientContext: null as WorkspaceCollabContext | null,
    projectScope: {
      loading: false,
      scope: {
        kind: 'personal' as const,
        projectId: 'project-1',
        workspaceId: 'workspace-personal',
        visibility: 'personal' as const,
        context: personalContext(),
      },
    } as ProjectWorkspaceScopeState,
  };
});

const projectCollabMocks = vi.hoisted(() => ({
  viewerOnly: false,
  writerAuthority: 'allowed' as 'allowed' | 'denied' | 'pending',
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({ navigate: vi.fn() }));

vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: workspaceScopeMocks.ambientContext,
    loading: false,
  }),
  lastResolvedTeamProjects: () => [],
  lastResolvedWorkspaceContext: () => workspaceScopeMocks.ambientContext,
  workspaceIdentityCanBillAmr: (state: { context: unknown; loading: boolean }) =>
    state.context !== null || state.loading,
  useWorkspaceBilling: () => null,
}));

vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: () => workspaceScopeMocks.projectScope,
}));

vi.mock('../../src/collab/useProjectCollab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectCollab')>()),
  useProjectCollab: () => ({
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: 'local_only',
    viewerOnly: projectCollabMocks.viewerOnly,
    isOwner: true,
    writerAuthority: projectCollabMocks.writerAuthority,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: vi.fn(),
    requestPublish: vi.fn(),
    refreshPresence: vi.fn(),
    checkStatusNow: vi.fn(),
    applyContentTransferState: vi.fn(),
  }),
}));

vi.mock('../../src/providers/daemon', () => ({
  GENERIC_DAEMON_DISCONNECT_CODE: 'GENERIC_DAEMON_DISCONNECT',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
  // 拦截档的弹窗是真的渲染出来的,它要的 provider 得给全。
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  formatVelaBalanceUsd: (value: string | null) => `$${value ?? '0'}`,
  fetchVelaLoginStatus: vi.fn().mockResolvedValue({ loggedIn: true }),
  startVelaLogin: vi.fn(),
  cancelVelaLogin: vi.fn(),
  canUpgradeVelaPlan: vi.fn().mockReturnValue(false),
  launchAntigravityOauth: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>()),
  checkAmrBalanceGate: (...args: unknown[]) => checkAmrBalanceGate(...args),
}));

vi.mock('../../src/runtime/brands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/brands')>()),
  fetchBrands: (...args: unknown[]) => fetchBrands(...args),
}));

vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/registry')>()),
  deletePreviewComment: vi.fn(),
  fetchDesignSystem: vi.fn(),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: vi.fn(),
  getTemplate: vi.fn(),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/state/projects')>()),
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: vi.fn(),
  patchProject: vi.fn(),
  persistTabsToDaemonNow: vi.fn(),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: vi.fn(),
  cacheTabsLocally: (_projectId: string, state: unknown) => state,
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => null }));
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => <div data-testid="file-workspace" />,
}));


const chatSurface = vi.hoisted(() => ({
  real: false,
  props: null as ComponentProps<typeof ChatPaneComponent> | null,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <output data-testid={`history-${message.id}`}>{JSON.stringify(message)}</output>
  ),
}));
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/components/ChatPane', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/ChatPane')>();
  return {
    ...actual,
  ChatPane: (props: {
    activeConversationId?: string | null;
    messages?: ChatMessage[];
    sendDisabled?: boolean;
    queuedItems?: Array<{ id: string; prompt: string; meta?: Record<string, unknown> }>;
    recoveryActionsBlockedReason?: string | null;
    retryPendingAssistantId?: string | null;
    onRetry?: (message: ChatMessage, actionType?: string) => void;
    onSend?: (
      prompt: string,
      attachments: unknown[],
      commentAttachments: unknown[],
      meta?: unknown,
    ) => unknown;
    onResumeRun?: (message: ChatMessage) => void;
    onShareToOpenDesign?: (assistantMessageId: string) => void;
    onContinueRemainingTasks?: (
      message: ChatMessage,
      todos: Array<{ content: string; status: string }>,
    ) => unknown;
    onSubmitQuestionForm?: (
      text: string,
      attachments?: unknown[],
      context?: unknown,
      sourceAssistantMessageId?: string,
      formId?: string,
    ) => unknown;
  }) => {
    chatSurface.props = props as unknown as ComponentProps<typeof ChatPaneComponent>;
    if (chatSurface.real) return <actual.ChatPane {...chatSurface.props} />;
    const failed = [...(props.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant' && message.runStatus === 'failed');
    return (
      <section>
        <output data-testid="active-conversation">{props.activeConversationId ?? ''}</output>
        <output data-testid="queued-count">{props.queuedItems?.length ?? 0}</output>
        <output data-testid="queued-prompts">
          {(props.queuedItems ?? []).map((item) => item.prompt).join('|')}
        </output>
        {/* 队列项**落库**的 meta 键名 —— transport-only 的标记不许出现在这里。 */}
        <output data-testid="queued-meta-keys">
          {(props.queuedItems ?? [])
            .map((item) => Object.keys(item.meta ?? {}).sort().join(','))
            .join('|')}
        </output>
        {/* ① 宿主宣告的阻断原因。`none` = 宿主说这一刻可以动作。 */}
        <output data-testid="recovery-blocked-reason">
          {props.recoveryActionsBlockedReason ?? 'none'}
        </output>
        {/* ② 宿主宣告的「这一轮正在重试」。`none` = 没有在飞的重试。 */}
        <output data-testid="retry-pending-id">{props.retryPendingAssistantId ?? 'none'}</output>
        <output data-testid="assistant-summary">
          {(props.messages ?? [])
            .filter((message) => message.role === 'assistant')
            .map((message) => `${message.id}|${message.runStatus ?? ''}`)
            .join('\n')}
        </output>
        <button
          type="button"
          data-testid="chat-retry"
          onClick={() => {
            if (failed) props.onRetry?.(failed, 'manual_retry');
          }}
        >
          retry
        </button>
        <button
          type="button"
          data-testid="send-message"
          disabled={props.sendDisabled}
          onClick={() => {
            void Promise.resolve(props.onSend?.('a fresh prompt', [], [])).then((outcome) => {
              sendOutcomes.push(outcome);
            });
          }}
        >
          send
        </button>
        {/*
          * 四条**不是从输入框发出去**的 `handleSend` 调用方,用来钉住 2719 的
          * 收窄:它们的正文不在输入框里,所以余额拦截对它们仍然走原来的排队。
          */}
        <button
          type="button"
          data-testid="share-to-open-design"
          onClick={() => {
            if (failed) props.onShareToOpenDesign?.(failed.id);
          }}
        >
          share
        </button>
        <button
          type="button"
          data-testid="continue-remaining"
          onClick={() => {
            if (failed) {
              void Promise.resolve(
                props.onContinueRemainingTasks?.(failed, [
                  { content: 'finish the hero section', status: 'in_progress' },
                ]),
              ).then((outcome) => hostSendOutcomes.push(outcome));
            }
          }}
        >
          continue remaining
        </button>
        <button
          type="button"
          data-testid="resume-run"
          onClick={() => {
            if (failed) props.onResumeRun?.(failed);
          }}
        >
          resume
        </button>
        <button
          type="button"
          data-testid="submit-question-form"
          onClick={() => {
            void Promise.resolve(
              props.onSubmitQuestionForm?.('Audience: designers', [], undefined, undefined, 'brief'),
            ).then((outcome) => hostSendOutcomes.push(outcome));
          }}
        >
          answer form
        </button>
      </section>
    );
  },
  };
});

const project: Project = {
  id: 'project-1',
  name: 'Project',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const conversation: Conversation = {
  id: 'conv-a',
  projectId: project.id,
  title: 'A',
  createdAt: 1,
  updatedAt: 1,
};

/** 本地 CLI:不走 AMR 预检,门控那一层看得最干净。 */
const localConfig: AppConfig = {
  mode: 'daemon',
  apiProtocol: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: 'agent-1',
  agentModels: {},
  skillId: null,
  designSystemId: null,
};

/** OpenDesign Cloud:2719 那条路唯一会跑预检的配置。 */
const amrConfig: AppConfig = { ...localConfig, agentId: 'amr' };

const agents = [
  { id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] },
  { id: 'amr', name: 'OpenDesign Cloud', available: true, models: [] },
] as unknown as AgentInfo[];

const userMessage: ChatMessage = {
  id: 'user-1',
  role: 'user',
  content: 'build me a landing page',
  createdAt: 1,
};

/** 队尾那条失败助手消息 —— 报错卡和〔重试〕挂在它身上。 */
const failedAssistant: ChatMessage = {
  id: 'assistant-failed',
  role: 'assistant',
  content: 'partial work',
  createdAt: 2,
  runId: 'run-1',
  runStatus: 'failed',
  agentId: 'agent-1',
  events: [
    { kind: 'status', label: 'error', detail: 'upstream said no', code: 'AGENT_EXECUTION_FAILED' },
  ],
} as ChatMessage;

/**
 * 同一条会话里还挂着一轮**没有落终态**的运行(SSE 断在半路、daemon 重启,
 * 落库那条 `running` 就永远留在那儿)。它让 `currentConversationHasActiveRun`
 * 为真 —— 于是 `currentConversationActionDisabled` 为真,而报错卡照旧画在队尾。
 * 这正是 OPEND-2821 那颗「看起来能点、点了没反应」的按钮的实际触发路径。
 */
const strandedRunningAssistant: ChatMessage = {
  id: 'assistant-stranded',
  role: 'assistant',
  content: 'still running',
  createdAt: 0,
  runId: 'run-0',
  runStatus: 'running',
} as ChatMessage;

function renderProjectView(config: AppConfig = localConfig) {
  return render(
    <ProjectView
      project={project}
      routeFileName={null}
      config={config}
      agents={agents}
      skills={[]}
      designTemplates={[]}
      designSystems={[]}
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
    />,
  );
}

async function waitForConversation() {
  await waitFor(() =>
    expect(screen.getByTestId('active-conversation').textContent).toBe('conv-a'),
  );
}

let conversationMessages: ChatMessage[] = [];

beforeEach(() => {
  chatSurface.real = false;
  chatSurface.props = null;
  sendOutcomes.length = 0;
  hostSendOutcomes.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  conversationMessages = [userMessage, failedAssistant];
  workspaceScopeMocks.ambientContext = workspaceScopeMocks.personalContext();
  projectCollabMocks.viewerOnly = false;
  projectCollabMocks.writerAuthority = 'allowed';
  listConversations.mockResolvedValue([conversation]);
  createConversation.mockResolvedValue(conversation);
  listMessages.mockImplementation(async () => conversationMessages);
  fetchPreviewComments.mockResolvedValue([]);
  fetchProjectFiles.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchBrands.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], active: null });
  fetchChatRunStatus.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  saveMessage.mockResolvedValue(null);
  streamViaDaemon.mockResolvedValue(undefined);
  checkAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('OPEND-2821 门控为真时,宿主要说出原因而不是静默吞掉点击', () => {
  it('会话里还挂着没落终态的运行 → 宿主宣告「正忙」,重试不起新 run', async () => {
    conversationMessages = [strandedRunningAssistant, userMessage, failedAssistant];
    // 这一档的名字就是 `awaitingActiveRunAttach`:落库那一行还是 `running`,
    // 而客户端**还没接上**它。让状态查询悬着,这个窗口就稳定停在那儿,
    // 而不是几十毫秒后被对账悄悄收尾 —— 那会让这条用例的判据随时序漂。
    fetchChatRunStatus.mockImplementation(() => new Promise(() => {}));

    renderProjectView();
    await waitForConversation();

    await waitFor(() =>
      expect(screen.getByTestId('recovery-blocked-reason').textContent).toBe(
        'conversation-busy',
      ),
    );

    // 宣告和行为必须一致:这一刻点下去确实什么都不会跑。
    fireEvent.click(screen.getByTestId('chat-retry'));
    await Promise.resolve();
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  it('只读访客 → 宿主宣告「只读」', async () => {
    projectCollabMocks.viewerOnly = true;

    renderProjectView();
    await waitForConversation();

    await waitFor(() =>
      expect(screen.getByTestId('recovery-blocked-reason').textContent).toBe('read-only'),
    );
  });

  /*
   * 反向锚点。没有这一条,「永远禁用」也能让上面两条全绿 —— 而那是把守卫
   * 拆成了死按钮,不是把状态说清楚。
   */
  it('反向锚点:没有东西挡着时,宿主不宣告原因,重试照常起 run', async () => {
    renderProjectView();
    await waitForConversation();

    await waitFor(() =>
      expect(screen.getByTestId('recovery-blocked-reason').textContent).toBe('none'),
    );

    fireEvent.click(screen.getByTestId('chat-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
  });
});

describe('重试请求归属在确认/拒绝时释放，失败历史始终保留', () => {
  it('点下重试后,新 run 未确认之前宿主一直宣告「正在重试」', async () => {
    // POST /api/runs 还没回来:`onRunCreated` 一直不调用。
    streamViaDaemon.mockImplementation(async () => new Promise<void>(() => {}));

    renderProjectView();
    await waitForConversation();
    await waitFor(() =>
      expect(screen.getByTestId('recovery-blocked-reason').textContent).toBe('none'),
    );

    fireEvent.click(screen.getByTestId('chat-retry'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    // 宣告的是**原来那一条**失败助手消息 —— 报错卡就是挂在它身上的。
    expect(screen.getByTestId('retry-pending-id').textContent).toBe('assistant-failed');
  });

  it('服务端确认新 run 之后,宣告才撤掉', async () => {
    let confirmRun: (() => void) | null = null;
    streamViaDaemon.mockImplementation(
      async (options: { onRunCreated?: (runId: string) => void }) => {
        confirmRun = () => options.onRunCreated?.('run-2');
        return new Promise<void>(() => {});
      },
    );

    renderProjectView();
    await waitForConversation();
    await waitFor(() =>
      expect(screen.getByTestId('recovery-blocked-reason').textContent).toBe('none'),
    );

    fireEvent.click(screen.getByTestId('chat-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('retry-pending-id').textContent).toBe('assistant-failed');

    confirmRun!();

    await waitFor(() =>
      expect(screen.getByTestId('retry-pending-id').textContent).toBe('none'),
    );
  });

  /*
   * ⚠️ 这两条**先钉「宣告确实立起来过」再钉「它被撤掉」**。
   * 只断言最终为 `none` 的写法在 `main` 上是空绿的:那儿这份宣告从来就不存在,
   * 断言只是在赢一个从未发生的状态。
   */
  it('新 run 没建成(POST 直接失败)→ 请求归属释放，失败历史仍保留', async () => {
    let failTheRun: (() => void) | null = null;
    streamViaDaemon.mockImplementation(
      async (options: { handlers: { onError: (error: Error) => void } }) => {
        // 没有 onRunCreated:这一发根本没有 run。
        failTheRun = () => options.handlers.onError(new Error('POST /api/runs failed'));
        return new Promise<void>(() => {});
      },
    );

    renderProjectView();
    await waitForConversation();
    await waitFor(() =>
      expect(screen.getByTestId('recovery-blocked-reason').textContent).toBe('none'),
    );

    fireEvent.click(screen.getByTestId('chat-retry'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('retry-pending-id').textContent).toBe('assistant-failed');

    failTheRun!();

    await waitFor(() =>
      expect(screen.getByTestId('retry-pending-id').textContent).toBe('none'),
    );
    // 保留失败历史不等于继续展示旧错误卡；真实卡片断言见下面生命周期用例。
    expect(screen.getByTestId('assistant-summary').textContent).toContain(
      'assistant-failed|failed',
    );
  });

  it('预检拒绝(余额不足)的重试 → 请求归属释放，失败历史仍保留', async () => {
    let settleGate: ((result: unknown) => void) | null = null;
    checkAmrBalanceGate.mockImplementation(
      () => new Promise((resolve) => {
        settleGate = resolve;
      }),
    );

    renderProjectView(amrConfig);
    await waitForConversation();
    await waitFor(() =>
      expect(screen.getByTestId('recovery-blocked-reason').textContent).toBe('none'),
    );

    fireEvent.click(screen.getByTestId('chat-retry'));

    await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalled());
    // 预检还在飞:这一刻宣告必须已经立起来,否则卡早就没了。
    expect(screen.getByTestId('retry-pending-id').textContent).toBe('assistant-failed');

    settleGate!({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: {
        status: 'available',
        profile: 'prod',
        user: { plan: 'free' },
        balanceUsd: '0',
        updatedAt: null,
        fetchedAt: new Date().toISOString(),
        stale: false,
        source: 'vela_api',
      },
    });

    await waitFor(() =>
      expect(screen.getByTestId('retry-pending-id').textContent).toBe('none'),
    );
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(screen.getByTestId('assistant-summary').textContent).toContain(
      'assistant-failed|failed',
    );
  });
});

describe('OPEND-2719 余额不足是终局:不进队列,不起任务,弹窗和卡照出', () => {
  const insufficient = {
    kind: 'hard' as const,
    reason: 'insufficient' as const,
    snapshot: {
      status: 'available' as const,
      profile: 'prod',
      user: { plan: 'free' },
      balanceUsd: '0',
      updatedAt: null,
      fetchedAt: new Date().toISOString(),
      stale: false,
      source: 'vela_api' as const,
    },
  };

  it('余额不足的一发:弹窗出、任务不起、队列一条都不许多', async () => {
    conversationMessages = [];
    checkAmrBalanceGate.mockResolvedValue(insufficient);

    renderProjectView(amrConfig);
    await waitForConversation();
    await waitFor(() =>
      expect((screen.getByTestId('send-message') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(screen.getByTestId('queued-count').textContent).toBe('0');
  });

  it('余额不足之后再发一条:同样出弹窗,同样不进队列', async () => {
    conversationMessages = [];
    checkAmrBalanceGate.mockResolvedValue(insufficient);

    renderProjectView(amrConfig);
    await waitForConversation();
    await waitFor(() =>
      expect((screen.getByTestId('send-message') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy();
    expect(screen.getByTestId('queued-count').textContent).toBe('0');
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  it('被拦下的正文交还给输入框,不靠队列替它保管', async () => {
    conversationMessages = [];
    checkAmrBalanceGate.mockResolvedValue(insufficient);

    renderProjectView(amrConfig);
    await waitForConversation();
    await waitFor(() =>
      expect((screen.getByTestId('send-message') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(sendOutcomes).toEqual(['restore-draft']));
  });

  /*
   * 反向锚点:预检放行时什么都没变 —— 队列不该因为这次改动开始吞消息,
   * 输入框也不该赖着不清。
   */
  it('反向锚点:预检放行时照常起任务,不进队列,输入框照常清空', async () => {
    conversationMessages = [];
    checkAmrBalanceGate.mockResolvedValue({ kind: 'allow' });

    renderProjectView(amrConfig);
    await waitForConversation();
    await waitFor(() =>
      expect((screen.getByTestId('send-message') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('queued-count').textContent).toBe('0');
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    await waitFor(() => expect(sendOutcomes).toEqual([undefined]));
  });
});

/*
 * OPEND-2719 的**收窄**(PR #7927 评审)。
 *
 * 「不代管、把正文还回输入框」这条路原来的判据是排除法:「不是重试、不是排空
 * 队列 ⇒ 就是用户从输入框发的」。可 `handleSend` 还有十来个直接调用方 ——
 * 分享到社区、设计系统反馈、继续未完成任务、续跑、问答表单、首页自动发送……
 * 它们的正文压根不在输入框里,用户也没在等着编辑它,把它们一起拖上这条路
 * 等于**悄悄取消了它们的排队**(问答表单更严重:它靠 `acceptDurableQueue`
 * 才知道答案被durable接住了,收不到就会解锁表单并回滚已上传的文件)。
 *
 * 所以判据改成肯定式:只有 `handleComposerSend` 自己打上的标记才走这条路。
 * 下面四条钉的是「别人的行为一个字没变」。
 */
describe('OPEND-2719 收窄:只有输入框那条路把正文要回去', () => {
  const insufficient = {
    kind: 'hard' as const,
    reason: 'insufficient' as const,
    snapshot: {
      status: 'available' as const,
      profile: 'prod',
      user: { plan: 'free' },
      balanceUsd: '0',
      updatedAt: null,
      fetchedAt: new Date().toISOString(),
      stale: false,
      source: 'vela_api' as const,
    },
  };

  async function renderBlockedAmrProject() {
    checkAmrBalanceGate.mockResolvedValue(insufficient);
    renderProjectView(amrConfig);
    await waitForConversation();
    await waitFor(() =>
      expect(screen.getByTestId('recovery-blocked-reason').textContent).toBe('none'),
    );
  }

  it('分享到社区:余额不足时照旧进队列,不抢输入框', async () => {
    await renderBlockedAmrProject();

    fireEvent.click(screen.getByTestId('share-to-open-design'));

    await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('1'));
    expect(screen.getByTestId('queued-prompts').textContent).not.toBe('');
    expect(streamViaDaemon).not.toHaveBeenCalled();
    // 输入框那条路一次都没被叫到,自然也没有正文要还。
    expect(sendOutcomes).toEqual([]);
  });

  it('继续未完成任务:余额不足时照旧进队列', async () => {
    await renderBlockedAmrProject();

    fireEvent.click(screen.getByTestId('continue-remaining'));

    await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('1'));
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  it('续跑:余额不足时照旧进队列', async () => {
    await renderBlockedAmrProject();

    fireEvent.click(screen.getByTestId('resume-run'));

    await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('1'));
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  /*
   * 问答表单是这一组里代价最高的一个:它把答案(和刚上传的文件)只留了一份,
   * 靠 `acceptDurableQueue` 的 `true` 才敢释放表单。被误拖上「不代管」那条路
   * 会让它收到 `false` —— 表单解锁、上传回滚,用户被要求重答一遍。
   */
  it('问答表单的答案:余额不足时进队列,而且要被告知「已durable接住」', async () => {
    await renderBlockedAmrProject();

    fireEvent.click(screen.getByTestId('submit-question-form'));

    await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('1'));
    await waitFor(() => expect(hostSendOutcomes).toEqual([true]));
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  /*
   * 反向锚点:收窄之后输入框那条路必须还在。没有这一条,「谁都不走这条路」
   * 也能让上面四条全绿 —— 而那等于把 2719 又改回去了。
   */
  it('反向锚点:输入框那条路仍然不进队列,正文仍然还回去', async () => {
    conversationMessages = [];
    await renderBlockedAmrProject();
    await waitFor(() =>
      expect((screen.getByTestId('send-message') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(sendOutcomes).toEqual(['restore-draft']));
    expect(screen.getByTestId('queued-count').textContent).toBe('0');
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });
});

/*
 * `composerOwnedDraft` 是 **transport-only** 的,和 `acceptDurableQueue` 同类:
 * 它说的是「此刻输入框正拿着这份正文等回信」,而一条消息**一旦排进队列**,
 * 保管方就换成了队列项 —— 输入框早清空了。让这份认领跟着回放走,回放被余额
 * 拦下时就会去撤一个不存在的草稿,而队列里那条真正的载体反倒没人管。
 */
describe('OPEND-2719:输入框认领不许落进队列', () => {
  it('会话正忙时排队的那条输入框消息,落库的 meta 里没有这份认领', async () => {
    conversationMessages = [];
    checkAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    // 第一发跑起来就不结束 —— 会话进入 busy,第二发只能排队。
    streamViaDaemon.mockImplementation(
      async (options: { onRunCreated?: (runId: string) => void }) => {
        options.onRunCreated?.('run-live');
        return new Promise<void>(() => {});
      },
    );

    renderProjectView(amrConfig);
    await waitForConversation();
    await waitFor(() =>
      expect((screen.getByTestId('send-message') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => expect(screen.getByTestId('queued-count').textContent).toBe('1'));
    expect(screen.getByTestId('queued-meta-keys').textContent).not.toContain(
      'composerOwnedDraft',
    );
  });
});

/**
 * These tests exercise the real ProjectView → ChatPane → RunErrorCard/UpgradeCard
 * connection. Assistant content and the composer are leaf stubs; neither decides
 * whether an error card survives retry or which surface owns the next failure.
 */
describe('2026-09-14 retry replaces the old error surface without erasing history', () => {
  // G16: only Cloud failures expose manual Retry. Keep the earlier local-CLI
  // callback/composer gate tests intact and use a Cloud-owned failed attempt
  // for this real ChatPane group, including folded and busy-history cases.
  let cloudFailedAssistant: ChatMessage;

  beforeEach(() => {
    cloudFailedAssistant = structuredClone({ ...failedAssistant, agentId: 'amr' });
    conversationMessages = [userMessage, cloudFailedAssistant];
  });

  type RunOptions = Parameters<typeof import('../../src/providers/daemon').streamViaDaemon>[0];
  type GateOutcome = Awaited<ReturnType<typeof import('../../src/runtime/amr-balance-gate').checkAmrBalanceGate>>;

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => { resolve = settle; });
    return { promise, resolve };
  }

  const insufficient = (): GateOutcome => ({
    kind: 'hard',
    reason: 'insufficient',
    snapshot: {
      status: 'available',
      profile: 'prod',
      user: { plan: 'free' },
      balanceUsd: '0',
      updatedAt: null,
      fetchedAt: '2026-09-14T04:00:00.000Z',
      stale: false,
      source: 'vela_api',
    },
  });

  async function renderRealChat(config = amrConfig) {
    chatSurface.real = true;
    // Run terminal callbacks refresh the transcript. Keep that read faithful
    // to completed writes instead of restoring the seed fixture after success.
    saveMessage.mockImplementation(async (_projectId: string, conversationId: string, message: ChatMessage) => {
      if (conversationId !== 'conv-a') return;
      const index = conversationMessages.findIndex((candidate) => candidate.id === message.id);
      conversationMessages = index < 0
        ? [...conversationMessages, message]
        : conversationMessages.map((candidate) => candidate.id === message.id ? message : candidate);
    });
    const view = renderProjectView(config);
    await waitFor(() => {
      expect(chatSurface.props?.activeConversationId).toBe('conv-a');
      expect((screen.getByTestId('chat-error-retry') as HTMLButtonElement).disabled).toBe(false);
    });
    return view;
  }

  function expectOriginalFailurePreserved() {
    expect(chatSurface.props?.messages.find((message) => message.id === cloudFailedAssistant.id))
      .toEqual(cloudFailedAssistant);
  }

  function captureRun() {
    let options: RunOptions | undefined;
    streamViaDaemon.mockImplementation((value: RunOptions) => {
      options = value;
      return new Promise<void>(() => {});
    });
    return () => {
      expect(options).toBeDefined();
      return options!;
    };
  }

  it('accepting retry removes the old card before the replacement has a run id', async () => {
    captureRun();
    await renderRealChat();
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));

    expect(chatSurface.props?.messages.some((message) =>
      message.role === 'assistant' && message.id !== cloudFailedAssistant.id && !message.runId,
    )).toBe(true);
    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expectOriginalFailurePreserved();
  });

  it('an insufficient-balance rejection replaces the old failure card with the balance card', async () => {
    const gate = deferred<GateOutcome>();
    checkAmrBalanceGate.mockReturnValue(gate.promise);
    await renderRealChat(amrConfig);
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalledTimes(1));
    // Settle the real preflight path before checking the screenshot's terminal
    // state. An earlier pending-card failure must not hide this second defect.
    await act(async () => gate.resolve(insufficient()));
    await waitFor(() => expect(screen.getByTestId('chat-upgrade-card')).toBeTruthy());

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expect(screen.getAllByTestId('chat-upgrade-card')).toHaveLength(1);
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(chatSurface.props?.queuedItems ?? []).toHaveLength(0);
    expectOriginalFailurePreserved();
  });

  it('a folded task retry replaces its visible head error after a rejected physical-tail retry', async () => {
    const gate = deferred<GateOutcome>();
    checkAmrBalanceGate.mockReturnValue(gate.promise);
    const planning: ChatMessage = {
      ...cloudFailedAssistant,
      id: 'assistant-task-head',
      runId: 'run-task-plan',
      runStatus: 'succeeded',
      content: 'Retained planning output.',
      events: [],
      strategyTaskExecutionId: 'task-folded-retry',
      strategyTaskRunIndex: 0,
      strategyTaskBlocked: true,
      strategyTaskBlockedText: null,
    };
    const production: ChatMessage = {
      ...cloudFailedAssistant,
      id: 'assistant-task-tail',
      runId: 'run-task-production',
      content: 'Retained failed production output.',
      createdAt: 3,
      strategyTaskExecutionId: 'task-folded-retry',
      strategyTaskRunIndex: 1,
      strategyTaskBlocked: true,
      strategyTaskBlockedText: null,
    };
    conversationMessages = [userMessage, planning, production];
    // A persisted successful strategy predecessor probes its task projection on
    // hydration. Returning null would simulate a missing daemon run and trigger
    // the separate stale-run fallback before anyone clicks Retry.
    fetchChatRunStatus.mockImplementation(async (runId: string) => {
      const message = conversationMessages.find((candidate) => candidate.runId === runId);
      if (!message) return null;
      return {
        id: runId,
        projectId: project.id,
        conversationId: conversation.id,
        assistantMessageId: message.id,
        agentId: message.agentId,
        status: message.runStatus,
        createdAt: message.createdAt,
        updatedAt: message.createdAt,
        strategyTask: {
          taskExecutionId: 'task-folded-retry',
          strategy: {
            id: 'od-next-strategy', version: '2.0.0',
            packageHash: 'b'.repeat(64), snapshotId: 'snapshot-folded-retry',
          },
          inputStage: 'production',
          outcome: 'blocked',
          route: 'full_plan',
          executionMode: 'simple',
          activeRunId: production.runId,
          terminal: true,
        },
      };
    });
    const view = await renderRealChat(amrConfig);
    expect(chatSurface.props?.messages).toEqual([userMessage, planning, production]);
    // Actual ChatPane folds both runs into the first assistant's displayed ID.
    expect(screen.getByTestId('history-assistant-task-head').textContent)
      .toContain('Retained failed production output.');
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalledTimes(1));
    await act(async () => gate.resolve(insufficient()));
    await waitFor(() => expect(screen.getByTestId('chat-upgrade-card')).toBeTruthy());

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(chatSurface.props?.messages).toEqual([userMessage, planning, production]);
    view.unmount();
    renderProjectView(amrConfig);
    await waitFor(() => expect(chatSurface.props?.messages).toEqual([userMessage, planning, production]));
    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
  });

  it('a rejected retry remains consumed after remounting the same client conversation', async () => {
    const gate = deferred<GateOutcome>();
    checkAmrBalanceGate.mockReturnValue(gate.promise);
    const view = await renderRealChat(amrConfig);
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalledTimes(1));
    await act(async () => gate.resolve(insufficient()));
    await waitFor(() => expect(screen.getByTestId('chat-upgrade-card')).toBeTruthy());
    view.unmount();
    renderProjectView(amrConfig);
    await waitFor(() => expect(chatSurface.props?.messages.some((message) =>
      message.id === cloudFailedAssistant.id,
    )).toBe(true));
    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expectOriginalFailurePreserved();
  });

  it('restricted session storage does not stop the accepted retry consuming its old card', async () => {
    const gate = deferred<GateOutcome>();
    checkAmrBalanceGate.mockReturnValue(gate.promise);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('storage disabled', 'SecurityError');
    });
    try {
      await renderRealChat(amrConfig);
      fireEvent.click(screen.getByTestId('chat-error-retry'));
      await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalledTimes(1));
      await act(async () => gate.resolve(insufficient()));
      await waitFor(() => expect(screen.getByTestId('chat-upgrade-card')).toBeTruthy());
      expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
      expectOriginalFailurePreserved();
    } finally {
      storageWrite.mockRestore();
    }
  });

  it('a confirmed replacement that succeeds leaves no error card and preserves the prior failure', async () => {
    const getRun = captureRun();
    await renderRealChat();
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await act(async () => {
      getRun().onRunCreated?.('run-retry-success');
    });
    // Creation and terminal delivery are distinct transport callbacks. Let the
    // run-id persistence finish before emitting its final status.
    await waitFor(() => expect(conversationMessages.some((message) =>
      message.runId === 'run-retry-success',
    )).toBe(true));
    const completedReport = 'The requested layout audit is complete. The heading hierarchy is consistent.';
    await act(async () => {
      getRun().handlers.onDelta(completedReport);
    });
    // This case covers an ordinary streamed response whose text is visible
    // before completion. Wait for the real buffer's observable commit; a
    // delta+end in one React turn is a separate finalization-race reproduction.
    await waitFor(() => expect(chatSurface.props?.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({
        runId: 'run-retry-success', content: completedReport,
      })]),
    ));
    await act(async () => {
      // daemon.ts:2330,2410 emits both callbacks for a successful response.
      getRun().onRunStatus?.('succeeded');
      getRun().handlers.onDone(completedReport);
    });
    const messageState = (message: ChatMessage) => ({
      id: message.id,
      runId: message.runId,
      runStatus: message.runStatus,
      content: message.content,
      sessionMode: message.sessionMode,
      events: message.events,
    });
    await waitFor(() => expect({
      persisted: conversationMessages.map(messageState),
      visible: chatSurface.props?.messages.map(messageState),
      writes: saveMessage.mock.calls.slice(-8).map(([projectId, conversationId, message]) => ({
        projectId,
        conversationId,
        message: messageState(message as ChatMessage),
      })),
      transport: {
        projectId: getRun().projectId,
        conversationId: getRun().conversationId,
        assistantMessageId: getRun().assistantMessageId,
        hasCreatedCallback: typeof getRun().onRunCreated,
        hasStatusCallback: typeof getRun().onRunStatus,
        hasDoneCallback: typeof getRun().handlers.onDone,
      },
    }).toMatchObject({
      persisted: expect.arrayContaining([expect.objectContaining({
        runId: 'run-retry-success', runStatus: 'succeeded', content: completedReport,
      })]),
    }));
    await waitFor(() => expect(chatSurface.props?.messages.map(messageState)).toEqual(
      expect.arrayContaining([expect.objectContaining({
        runId: 'run-retry-success', runStatus: 'succeeded',
      })]),
    ));

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expectOriginalFailurePreserved();
  });

  it('a second run failing with the same diagnostic still receives its own single recovery card', async () => {
    const getRun = captureRun();
    await renderRealChat();
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await act(async () => {
      getRun().onRunCreated?.('run-retry-failed');
      getRun().handlers.onError(Object.assign(new Error('upstream said no'), {
        code: 'AGENT_EXECUTION_FAILED',
      }));
    });
    await waitFor(() => expect(chatSurface.props?.messages.some((message) =>
      message.runId === 'run-retry-failed' && message.runStatus === 'failed',
    )).toBe(true));

    expect(screen.getAllByTestId('chat-run-error-card')).toHaveLength(1);
    expect((screen.getByTestId('chat-error-retry') as HTMLButtonElement).disabled).toBe(false);
    expectOriginalFailurePreserved();
  });

  it('POST failure before run creation exposes the new send failure without reviving the old run card', async () => {
    const getRun = captureRun();
    await renderRealChat();
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    await act(async () => {
      getRun().handlers.onError(new Error('POST /api/runs failed'));
    });
    await waitFor(() => expect(chatSurface.props?.messages.find((message) =>
      message.id === userMessage.id,
    )?.sendFailed).toBe(true));

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expect(chatSurface.props?.messages.filter((message) => message.role === 'assistant'))
      .toHaveLength(1);
    expectOriginalFailurePreserved();
  });

  it('an active run disables the real retry button and guards direct callback invocation', async () => {
    conversationMessages = [strandedRunningAssistant, userMessage, cloudFailedAssistant];
    fetchChatRunStatus.mockImplementation(() => new Promise(() => {}));
    chatSurface.real = true;
    renderProjectView(amrConfig);
    await waitFor(() => expect(chatSurface.props?.recoveryActionsBlockedReason).toBe('conversation-busy'));
    const retry = screen.getByTestId('chat-error-retry') as HTMLButtonElement;
    expect(retry.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(retry);
      chatSurface.props?.onRetry?.(cloudFailedAssistant, 'manual_retry');
    });
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(checkAmrBalanceGate).not.toHaveBeenCalled();
    expect(chatSurface.props?.queuedItems ?? []).toHaveLength(0);
    expect(screen.getAllByTestId('chat-run-error-card')).toHaveLength(1);
    expect(screen.queryByTestId('chat-error-actions-blocked')).toBeNull();
  });

  it('two invocations in the same render turn create one retry and no queued duplicate', async () => {
    captureRun();
    await renderRealChat();
    const retry = chatSurface.props!.onRetry!;
    // The callbacks intentionally share the pre-update closure; two separate
    // fireEvent calls would flush React between them and miss this boundary.
    await act(async () => {
      retry(cloudFailedAssistant, 'manual_retry');
      retry(cloudFailedAssistant, 'manual_retry');
    });
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalled());
    expect(streamViaDaemon).toHaveBeenCalledTimes(1);
    expect(chatSurface.props?.queuedItems ?? []).toHaveLength(0);
    expectOriginalFailurePreserved();
  });

  it('a late rejected retry from conversation A does not paint a balance card over conversation B', async () => {
    const gate = deferred<GateOutcome>();
    checkAmrBalanceGate.mockReturnValue(gate.promise);
    const otherConversation = { ...conversation, id: 'conv-b', title: 'B' };
    const otherMessage: ChatMessage = {
      id: 'user-b', role: 'user', content: 'conversation B', createdAt: 10,
    };
    listConversations.mockResolvedValue([conversation, otherConversation]);
    listMessages.mockImplementation(async (_projectId: string, id: string) =>
      id === 'conv-b' ? [otherMessage] : conversationMessages,
    );
    await renderRealChat(amrConfig);
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    await waitFor(() => expect(checkAmrBalanceGate).toHaveBeenCalledTimes(1));
    await act(async () => { chatSurface.props?.onSelectConversation?.('conv-b'); });
    await waitFor(() => expect(chatSurface.props?.messages.map((message) => message.id)).toEqual(['user-b']));
    await act(async () => gate.resolve(insufficient()));

    expect(chatSurface.props?.activeConversationId).toBe('conv-b');
    expect(chatSurface.props?.messages).toEqual([otherMessage]);
    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expect(screen.queryByTestId('chat-upgrade-card')).toBeNull();
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });
});
