// @vitest-environment jsdom
/**
 * OPEND-2614 —— 「消息发送后界面卡顿约 1–2 秒才把消息发给 agent」。
 *
 * ## 量到的是什么
 *
 * 点击发送 → 消息上屏,这一段里 `handleSend` 只有**一个** await:
 * OpenDesign Cloud(AMR)的预检 `checkAmrBalanceGate`。它排在
 * `setMessages(nextVisibleMessages)` **前面**,所以消息要等预检回来才上屏。
 *
 * 而这一次预检在有工作区身份的项目上是两条并行的 HTTP 往返:
 *
 *   · `GET /api/integrations/vela/wallet`
 *   · `GET /api/workspace/billing?scope=workspace&…&freshness=authoritative`
 *
 * 后一条带 `freshness=authoritative`,daemon 侧翻成 `requireFresh: true`
 * (`apps/daemon/src/routes/collab-context.ts`),也就是**强制向上游 Vela 取一次
 * 新读数**。1–2 秒的空白就是这一趟,不是渲染慢。
 *
 * ## 这条用例钉的是**顺序**,不是秒表
 *
 * 秒表在 CI 上不可复现,也证明不了因果。这里把预检钉成一个**永不落定**的
 * promise —— 现实里它就是那 1–2 秒 —— 然后问一句:
 *
 *   预检还没回来的时候,用户那条消息在屏幕上吗?进行中态在吗?
 *
 * 「在」= 立即反馈;「不在」= 界面在等网络。修复前它不在。
 *
 * 预检**该不该拦住这一次 run** 完全不变(拦截档仍然在建 run 之前落定,由
 * `ProjectView.amr-balance-branches.test.tsx` 把四种分支钉死);变的只是
 * 「先画,再决定」。
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { streamViaDaemon } from '../../src/providers/daemon';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import {
  fetchPreviewComments,
  fetchProjectFiles,
} from '../../src/providers/registry';
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

const PROJECT_ID = 'send-latency-project';
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';
const TEAM_MEMBER = 'member-sender';
const PROMPT = 'draft a landing page';

const CALLER_CONTEXT: WorkspaceCollabContext = {
  workspaceId: TEAM_WORKSPACE,
  workspaceType: 'team',
  workspaceMemberId: TEAM_MEMBER,
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'team_pro',
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
} as WorkspaceCollabContext;

const workspaceScopeMocks = vi.hoisted(() => ({
  projectScope: { loading: true, scope: null } as ProjectWorkspaceScopeState,
  ambientContext: null as WorkspaceCollabContext | null,
  billingResponse: null as unknown,
}));
const chatPaneSpy = vi.hoisted(() => vi.fn());
const projectCollabMocks = vi.hoisted(() => ({
  writerAuthority: 'allowed' as 'allowed' | 'denied' | 'pending',
  viewerOnly: false,
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
  useWorkspaceBillingResponse: () => workspaceScopeMocks.billingResponse,
}));

vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: () => workspaceScopeMocks.projectScope,
}));

vi.mock('../../src/collab/useProjectCollab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectCollab')>()),
  useProjectCollab: () => ({
    enabled: true,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: projectCollabMocks.viewerOnly,
    writerAuthority: projectCollabMocks.writerAuthority,
    isOwner: projectCollabMocks.writerAuthority === 'allowed',
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: () => undefined,
    requestPublish: () => undefined,
    refreshPresence: () => undefined,
    checkStatusNow: () => undefined,
  }),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  formatVelaBalanceUsd: (value: string | null) => `$${value ?? '0'}`,
  fetchVelaLoginStatus: vi.fn().mockResolvedValue({ loggedIn: true }),
  startVelaLogin: vi.fn(),
  cancelVelaLogin: vi.fn(),
  canUpgradeVelaPlan: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/runtime/amr-balance-gate', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/amr-balance-gate')>(
    '../../src/runtime/amr-balance-gate',
  );
  return { ...actual, checkAmrBalanceGate: vi.fn().mockResolvedValue({ kind: 'allow' }) };
});

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/runtime/amr-low-balance-plan', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/runtime/amr-low-balance-plan')
  >('../../src/runtime/amr-low-balance-plan');
  return { ...actual, resolveAmrPlan: vi.fn().mockResolvedValue('pro') };
});

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

/**
 * ChatPane 自带半个应用,这一层把它换成一块**只报事实**的板子:
 * 流水里有哪些消息、这一轮是不是进行中。屏幕上「消息上屏了没有」就是这两格。
 */
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: {
    messages?: ChatMessage[];
    streaming?: boolean;
    sendDisabled?: boolean;
    onStop?: () => void;
    queuedItems?: Array<{ prompt: string }>;
    onSend?: (
      prompt: string,
      attachments: [],
      commentAttachments: [],
    ) => unknown;
  }) => {
    chatPaneSpy(props);
    return (
      <div>
        <div data-testid="transcript">
          {(props.messages ?? [])
            .map((message) => `${message.role}:${message.content}`)
            .join('|')}
        </div>
        <div data-testid="streaming">{props.streaming ? 'yes' : 'no'}</div>
        <div data-testid="queued">
          {(props.queuedItems ?? []).map((item) => item.prompt).join('|')}
        </div>
        <button
          type="button"
          data-testid="normal-send"
          disabled={props.sendDisabled}
          onClick={() => props.onSend?.(PROMPT, [], [])}
        >
          send
        </button>
        <button type="button" data-testid="stop" onClick={() => props.onStop?.()}>
          stop
        </button>
      </div>
    );
  },
}));

const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);
const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedFetchBrands = vi.mocked(fetchBrands);

/** AMR on a daemon runtime — 报告里的那套配置(Agent 为 OpenDesign)。 */
const config: AppConfig = {
  mode: 'daemon',
  apiProtocol: 'openai',
  apiKey: '',
  baseUrl: '',
  model: 'deepseek-v4-flash',
  agentId: 'amr',
  skillId: null,
  designSystemId: null,
};

const conversation = (projectId: string): Conversation => ({
  id: `conv-${projectId}`,
  projectId,
  title: null,
  createdAt: 1,
  updatedAt: 1,
});

const project = (): Project => ({
  id: PROJECT_ID,
  name: 'Caustic Pool',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  metadata: { kind: 'prototype' },
  workspaceId: TEAM_WORKSPACE,
});

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/context')) {
        return new Response(JSON.stringify({ context: CALLER_CONTEXT }), { status: 200 });
      }
      if (url.includes('/workspace-scope')) {
        return new Promise<Response>(() => {});
      }
      return new Response('{}', { status: 200 });
    }),
  );
}

function renderProjectView(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  return render(
    <ProjectView
      project={project()}
      routeFileName={null}
      config={config}
      agents={[{ id: 'amr', name: 'amr', available: true }] as unknown as AgentInfo[]}
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

/** 见 `ProjectView.amr-balance-branches.test.tsx` 的同名助手:先证明这一按会被受理。 */
async function clickSendWhenReady() {
  await screen.findByTestId('normal-send');
  await waitFor(() =>
    expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByTestId('normal-send'));
}

function transcript(): string {
  return screen.getByTestId('transcript').textContent ?? '';
}

describe('OPEND-2614 发送后先上屏,再等预检', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    stubFetch();
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
    mockedStreamViaDaemon.mockResolvedValue(undefined);
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    workspaceScopeMocks.billingResponse = null;
    projectCollabMocks.writerAuthority = 'allowed';
    projectCollabMocks.viewerOnly = false;
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  /**
   * 夹具自检:这条路真的走预检。
   *
   * 没有这一条,下面那条「预检还没回来时消息就在屏幕上」在**预检压根没被调用**
   * 的情况下也是绿的 —— 那时它证明的是「没有预检」,不是「先画后等」。
   */
  it('夹具自检:AMR 这一发确实要过 OpenDesign Cloud 预检', async () => {
    renderProjectView();
    await clickSendWhenReady();
    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1));
  });

  it('预检还在飞的时候,用户消息已经上屏并进入进行中', async () => {
    // 现实里这就是那 1–2 秒:两条 HTTP 往返,其中一条强制向上游取新读数。
    mockedCheckAmrBalanceGate.mockReturnValue(new Promise(() => {}) as never);

    renderProjectView();
    await clickSendWhenReady();

    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1));
    // 预检**永不落定**。此刻屏幕上必须已经有这条消息和进行中态。
    await waitFor(() => expect(transcript()).toContain(`user:${PROMPT}`));
    expect(screen.getByTestId('streaming').textContent).toBe('yes');
  });

  /**
   * 上屏提前带来的**新状态**:预检那一两秒里,〔停止〕第一次可以在建出 run
   * 之前按下去。按了就必须真的不跑 —— 否则用户叫停之后 run 还是起来了。
   */
  it('预检还在飞时用户按了停止:预检回来也不许再建 run', async () => {
    let settle: (value: unknown) => void = () => {};
    mockedCheckAmrBalanceGate.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );

    renderProjectView();
    await clickSendWhenReady();
    await waitFor(() => expect(transcript()).toContain(`user:${PROMPT}`));
    expect(screen.getByTestId('streaming').textContent).toBe('yes');

    fireEvent.click(screen.getByTestId('stop'));
    await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('no'));

    settle({ kind: 'allow' });
    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    // 停止是把这一轮收成终态,不是把它撤销 —— 用户说过的话留在屏幕上。
    expect(transcript()).toContain(`user:${PROMPT}`);
  });

  /**
   * 反向对照:先画不等于「拦不住了」。
   *
   * 预检判定拦截时,这一轮仍然不许留在流水里假装在跑 —— 它回到发送队列,
   * 由余额卡/弹窗解释原因(那四种分支由 `ProjectView.amr-balance-branches`
   * 钉死,这里只钉「画出来的那一轮被收回去了」)。
   */
  it('预检回来说拦截:画出去的那一轮要收回,并落进发送队列', async () => {
    let settle: (value: unknown) => void = () => {};
    mockedCheckAmrBalanceGate.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );

    renderProjectView();
    await clickSendWhenReady();
    await waitFor(() => expect(transcript()).toContain(`user:${PROMPT}`));

    settle({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: {
        status: 'available',
        profile: 'prod',
        user: { plan: 'pro' },
        balanceUsd: '0',
        updatedAt: null,
        fetchedAt: new Date().toISOString(),
        stale: false,
        source: 'vela_api',
      },
    });

    await waitFor(() => expect(screen.getByTestId('queued').textContent).toContain(PROMPT));
    expect(transcript()).not.toContain(`user:${PROMPT}`);
    expect(screen.getByTestId('streaming').textContent).toBe('no');
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
  });
});
