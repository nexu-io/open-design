// @vitest-environment jsdom
//
// 红测(OPEND-2597 · 数字那一半):**升级卡念的是哪个钱包的余额。**
//
// 姊妹页 `w62-mid-run-balance-wiring.test.tsx` 钉的是「谁把卡点亮」;
// 这一页钉的是点亮之后**那个数字从哪儿来**。
//
// 工单要的是「卡片明确展示『剩余额度』及金额」,而金额的档次(橙 / 红)和那句话
// (「余额可能撑不完下一个任务」/「现在无法开始新任务」)全由这个数决定。
// 念错数字不是显示瑕疵,是整张卡说反了:团队钱包 $0 的那一轮,如果念的是
// 这个人个人账号里的 $12.50,卡会用橙色说「可能撑不完」—— 而真相是「现在
// 无法开始新任务」。
//
// 补查读的那条 `/api/integrations/vela/wallet` 是**账号级**的
// (`daemon/src/routes/vela.ts:601`:`velaWalletSnapshotReader.read({env, configuredEnv, refresh})`,
// 请求里没有任何 workspace 参数)。而这一轮花的是**工作区**的钱 ——
// 发送前那道闸门为此专门走 `/api/workspace/billing?scope=workspace&workspaceId=…&freshness=authoritative`,
// 它自己的注释逐字写着「falling back to the account wallet would make the
// preflight disagree with the final daemon spawn authority」,`ProjectView.tsx:2196`
// 也逐字写着「It must never inspect an unrelated account wallet just because
// project scope is inconclusive」。
//
// 补查这一条是同一个问题的另一半:同一张卡、同一笔钱,却走了被点名不许走的那条读法。

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
  type WorkspaceBillingResponse,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { fetchAmrWalletSnapshot, streamViaDaemon } from '../../src/providers/daemon';
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

const PROJECT_ID = 'workspace-wallet-project';
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';
const TEAM_MEMBER = 'member-sender';

/** 这一轮花钱的那个工作区(团队)。 */
const CALLER_CONTEXT: WorkspaceCollabContext = {
  workspaceId: TEAM_WORKSPACE,
  workspaceType: 'team',
  workspaceMemberId: TEAM_MEMBER,
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  // 生产形状:`/api/workspace/context` 把 planId 写死成 null
  // (`daemon/src/collab/vela-workspace-context.ts:385`)。
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
} as WorkspaceCollabContext;

const workspaceScopeMocks = vi.hoisted(() => ({
  projectScope: { loading: true, scope: null } as ProjectWorkspaceScopeState,
  ambientContext: null as WorkspaceCollabContext | null,
}));
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
  GENERIC_DAEMON_DISCONNECT_CODE: 'DAEMON_STREAM_DISCONNECTED',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
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

// 闸门放行 —— 这一页要的是「闸门看不出问题、run 起来了、跑到一半才死在钱上」。
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
  return { ...actual, resolveAmrPlan: vi.fn().mockResolvedValue('team_max') };
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
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: {
    amrBalanceCardUsd?: number | null;
    amrBalanceCardUnavailable?: boolean;
    sendDisabled?: boolean;
    onSend?: (prompt: string, attachments: [], commentAttachments: []) => unknown;
  }) => (
    <div>
      <div data-testid="amr-balance-card-prop">
        {props.amrBalanceCardUsd == null ? 'none' : String(props.amrBalanceCardUsd)}
      </div>
      <div data-testid="amr-balance-unavailable-prop">
        {props.amrBalanceCardUnavailable === true ? 'yes' : 'no'}
      </div>
      <button
        type="button"
        data-testid="normal-send"
        disabled={props.sendDisabled}
        onClick={() => props.onSend?.('normal prompt', [], [])}
      >
        send
      </button>
    </div>
  ),
}));

const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);
const mockedFetchAmrWalletSnapshot = vi.mocked(fetchAmrWalletSnapshot);
const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedFetchBrands = vi.mocked(fetchBrands);

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
  name: 'Workspace Wallet',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  metadata: { kind: 'prototype' },
  workspaceId: TEAM_WORKSPACE,
});

/** 账号级钱包读数(`/api/integrations/vela/wallet`)。 */
const accountSnapshot = (balanceUsd: string): AmrWalletSnapshot => ({
  status: 'available',
  profile: 'prod',
  user: { plan: 'max' },
  balanceUsd,
  updatedAt: null,
  fetchedAt: new Date().toISOString(),
  stale: false,
  source: 'vela_api',
});

/**
 * 一份**被后端证明过**的工作区钱包投影 —— 和发送前闸门要求的那一份逐字同形:
 * runtime 是 fresh、hardExpiresAt 还没到、authoritativeWorkspaceRead 与 runtime
 * 同一个 observedAt、workspaceBalance 是 v2 且身份对得上。
 */
function provenWorkspaceBilling(balanceUsd: string): WorkspaceBillingResponse {
  const observedAt = new Date().toISOString();
  return {
    summary: {
      workspaceId: null,
      membershipTier: 'max',
      totalAvailableCredits: 0,
      subscriptionCredits: 0,
      rechargeCredits: 0,
      balanceUsd: '12.50',
      subscriptionStatus: 'active',
      availableActions: [],
      workspaceBalance: null,
    },
    workspaceBalance: {
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
      balanceUsd,
      billingScopeVersion: 2,
      expiresAt: null,
      updatedAt: observedAt,
    },
    workspaceRuntime: {
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
      status: 'fresh',
      revision: '1',
      observedAt,
      softExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      hardExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      retryAt: null,
      errorCode: null,
      reason: 'authoritative',
      sourceGapDetected: false,
    },
    authoritativeWorkspaceRead: {
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
      observedAt,
    },
  };
}

let billingResponse: WorkspaceBillingResponse | null = null;

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/billing')) {
        return new Response(JSON.stringify(billingResponse ?? {}), { status: 200 });
      }
      if (url.includes('/api/workspace/context')) {
        return new Response(
          JSON.stringify({ context: workspaceScopeMocks.ambientContext }),
          { status: 200 },
        );
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

function failMidRunWith(code: string) {
  mockedStreamViaDaemon.mockImplementation(async (options: unknown) => {
    const opts = options as {
      onRunCreated?: (runId: string) => void;
      handlers: { onError: (error: Error) => void };
    };
    opts.onRunCreated?.('run-mid-run-balance');
    const err = new Error('insufficient balance') as Error & { code?: string };
    err.code = code;
    opts.handlers.onError(err);
  });
}

async function sendOnce(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  renderProjectView(overrides);
  await screen.findByTestId('normal-send');
  await waitFor(() =>
    expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByTestId('normal-send'));
  await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
}

describe('升级卡的余额:念这一轮真正花的那个钱包', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    billingResponse = null;
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
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    projectCollabMocks.writerAuthority = 'allowed';
    projectCollabMocks.viewerOnly = false;
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  /*
   * 核心那一条:团队工作区的钱包是 $0(这一轮就是死在它上面),而这个人的
   * 个人账号里还有 $12.50。卡上必须念 0 —— 念 12.5 会让「额度耗尽」那一档
   * 整个说反:橙色数字 + 「余额可能撑不完下一个任务」,而真相是「现在无法
   * 开始新任务」,而且这个人无论怎么充自己的个人钱包都救不了这个团队。
   */
  it('团队工作区:念工作区钱包的 0,不是个人账号的 12.50', async () => {
    billingResponse = provenWorkspaceBilling('0');
    mockedFetchAmrWalletSnapshot.mockResolvedValue(accountSnapshot('12.50'));
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('0'),
    );
  });

  /*
   * 反向对照,证明上一条不是靠「永远返回 0」赢的:工作区钱包还剩 $1.20 时,
   * 念的是 1.2,而不是个人账号那份 12.50,也不是 0。
   */
  it('团队工作区还剩一点:念的是工作区那份读数', async () => {
    billingResponse = provenWorkspaceBilling('1.20');
    mockedFetchAmrWalletSnapshot.mockResolvedValue(accountSnapshot('12.50'));
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('1.2'),
    );
  });

  /*
   * 工作区读数**证明不了**的那一格(daemon 没给 authoritativeWorkspaceRead ——
   * 旧 daemon、或者那一次授权读没落下来)。此时不许拿账号钱包顶上:
   * 那正是闸门注释点名不许做的回落。按 T41,补查落空要说出来,由 ChatPane
   * 把白卡(充值 + 重试)还回来 —— 少一张卡好过念错一个数。
   */
  it('工作区读数证明不了时:不拿账号余额顶替,改报落空', async () => {
    const unproven = provenWorkspaceBilling('0');
    delete unproven.authoritativeWorkspaceRead;
    billingResponse = unproven;
    mockedFetchAmrWalletSnapshot.mockResolvedValue(accountSnapshot('12.50'));
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-unavailable-prop').textContent).toBe('yes'),
    );
    expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('none');
  });

  /*
   * 反向对照:根本没有工作区身份的那一格(旧的、没绑工作区的项目 + 没有
   * 环境上下文)。那种项目花的**就是**账号钱包,所以账号读数在这一格仍是
   * 正确答案 —— 修复不许把这条老路一起砍掉。
   */
  it('没有工作区身份的老项目:仍然念账号钱包', async () => {
    workspaceScopeMocks.ambientContext = null;
    // 明确未绑定的老项目 —— 它花的就是账号钱包,所以这条读法在这一格仍然对。
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    };
    billingResponse = null;
    mockedFetchAmrWalletSnapshot.mockResolvedValue(accountSnapshot('0.75'));
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce({ project: { ...project(), workspaceId: undefined } as never });

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('0.75'),
    );
  });
});
