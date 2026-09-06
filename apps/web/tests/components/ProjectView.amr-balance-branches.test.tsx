// @vitest-environment jsdom
//
// 红测:**余额不足 · 身份 × 订阅的四种分支**(规格
// `specs/current/run-error-catalog.md` §6.V,2026-08-26 用户逐条裁决)。
//
// 卡片永远保留,四组的差别只在「同时唤起什么弹窗、点了跳哪」:
//
//   非 Max · owner    卡 + 会员转化弹窗            卡和弹窗都跳 console 的套餐页
//   非 Max · 非 owner 卡 + 新的「找所有者充值」弹窗  不外跳
//   Max   · owner     卡 + **同一张**会员转化弹窗   卡和弹窗都跳 vela web 的自动充值
//   Max   · 非 owner  卡 + 新的「找所有者充值」弹窗  不外跳
//
// ⚠️ 第三格 2026-09-06 由 **T58** 定终态,推翻了这里原来那条「Max · owner
// **不弹窗**」。依据是产品文档第四节第 3 行:那一格画的就是**和第一格同一张**
// 会员转化弹窗,文案一字不差(此前记录里那句「未达到 $100.00/月的额度」是飞书
// 导出时 AI 生成的图片 alt 描述,不是产品文案,以图为准)。两格唯一的差别是
// 主按钮的落点:第一格 `billing=plan`,第三格 `billing=auto-recharge`。
//
// 另外两条守卫:
//
//   ① 判定放行时,四种分支一个都不许冒出来。(原措辞挂在「付费档余额 0 =
//      不限量,不拦」#7190 / R-010 上 —— 那条口径 2026-09-06 已被 T55 推翻,
//      个人工作区付费档 $0 现在照拦;但这一组守卫要钉的东西不变:判定说放行,
//      呈现层就不许自己冒出弹窗。)
//   ② §6.Y 的死胡同:没有账单权限的成员,必须拿到**属于他的那张弹窗**,
//      不是他点不动的升级弹窗。(原措辞是「弹窗上不能只剩一颗『暂不需要』」,
//      依据那颗「复制请求」;产品 2026-09-06 删掉了它,T56,这一档回到单出口。)
//
// `ChatPane` 在这一层是 mock 的(它自带半个应用),所以「卡点了跳哪」是按下
// ProjectView 交给它的那个回调来断言的;真卡把这个回调接到按钮上这件事,
// 由 `tests/components/chat/ChatPane.wired-cards.test.tsx` 从真实 ChatPane 保证。

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
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

const PROJECT_ID = 'balance-branch-project';
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';
const TEAM_MEMBER = 'member-sender';
const SEED_PROMPT = 'ignored — the branch tests send manually';

/**
 * 一个团队工作区的调用者。`role` 决定 `canManageBilling`(契约
 * `buildWorkspacePermissions`:`readable && role === 'owner'`),
 * `planId` 决定订阅档。四种分支就是这两位的四种组合。
 */
function callerContext(
  role: 'owner' | 'member',
  planId: string | null,
  extra: Partial<WorkspaceCollabContext> = {},
): WorkspaceCollabContext {
  return {
    workspaceId: TEAM_WORKSPACE,
    workspaceType: 'team',
    workspaceMemberId: TEAM_MEMBER,
    role,
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }),
    ...extra,
  } as WorkspaceCollabContext;
}

const CALLER_CONTEXT = callerContext('owner', 'team_pro');

const workspaceScopeMocks = vi.hoisted(() => ({
  projectScope: { loading: true, scope: null } as ProjectWorkspaceScopeState,
  ambientContext: null as WorkspaceCollabContext | null,
  billingResponse: null as unknown,
}));
const chatPaneSpy = vi.hoisted(() => vi.fn());
const resourceContextObservations = vi.hoisted(
  () => [] as Array<WorkspaceCollabContext | null>,
);
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
  // 拦截档的弹窗是**真的**渲染出来的(这一条正是要断言的),所以它用到的
  // provider 也得在这里给全。
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  formatVelaBalanceUsd: (value: string | null) => `$${value ?? '0'}`,
  fetchVelaLoginStatus: vi.fn().mockResolvedValue({ loggedIn: true }),
  startVelaLogin: vi.fn(),
  cancelVelaLogin: vi.fn(),
  canUpgradeVelaPlan: vi.fn().mockReturnValue(false),
}));

// The balance gate is not what is under test; it must simply allow the send so
// the run POST is reached. Its ARGUMENT is asserted below.
vi.mock('../../src/runtime/amr-balance-gate', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/amr-balance-gate')>(
    '../../src/runtime/amr-balance-gate',
  );
  return { ...actual, checkAmrBalanceGate: vi.fn().mockResolvedValue({ kind: 'allow' }) };
});

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

// 呈现层曾经用 `isPaidAmrPlan(await resolveAmrPlan(...))` 把免费档的告警滤掉。
// 产品 2026-09-03 裁决(OPEND-2600)把那道过滤删了 —— 告警对所有档位可见,
// 呈现层也不再读套餐。这份 mock 因此已经不影响结论,留着只是把套餐读数钉死,
// 免得哪天有人重新把它接回发送路径而没人发现。档位覆盖见
// `tests/components/w116-amr-low-balance-card-tiers.test.tsx`。
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
vi.mock('../../src/components/FileWorkspace', async () => {
  const { useProjectCollabContext } = await import('../../src/collab/collab-context');
  return {
    DESIGN_SYSTEM_TAB: '__design_system__',
    FileWorkspace: ({
      onTabsStateChange,
    }: {
      onTabsStateChange?: (state: { tabs: string[]; active: string | null }) => void;
    }) => {
      const { workspaceContext } = useProjectCollabContext();
      resourceContextObservations.push(workspaceContext);
      return (
        <div data-testid="file-workspace">
          <button
            type="button"
            data-testid="queue-tab-write"
            onClick={() => onTabsStateChange?.({
              tabs: ['index.html'],
              active: 'index.html',
            })}
          >
            queue tab write
          </button>
          <button
            type="button"
            data-testid="queue-alt-tab-write"
            onClick={() => onTabsStateChange?.({
              tabs: ['index.html', 'about.html'],
              active: 'about.html',
            })}
          >
            queue alternate tab write
          </button>
        </div>
      );
    },
  };
});
vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: {
    activeConversationId?: string | null;
    conversations?: Conversation[];
    loading?: boolean;
    messages?: ChatMessage[];
    messagesConversationId?: string | null;
    previewComments?: unknown[];
    onDeleteComment?: (commentId: string) => void;
    onSelectConversation?: (conversationId: string) => void;
    sendDisabled?: boolean;
    queuedItems?: Array<{ prompt: string }>;
    amrBalanceCardUsd?: number | null;
    onAmrBalanceUpgrade?: () => void;
    onSend?: (
      prompt: string,
      attachments: [],
      commentAttachments: [],
    ) => unknown;
  }) => {
    chatPaneSpy(props);
    return (
      <div>
        <div data-testid="active-conversation">{props.activeConversationId ?? ''}</div>
        <div data-testid="amr-balance-card-prop">
          {props.amrBalanceCardUsd == null ? 'none' : String(props.amrBalanceCardUsd)}
        </div>
        <button
          type="button"
          data-testid="normal-send"
          disabled={props.sendDisabled}
          onClick={() => props.onSend?.('normal prompt', [], [])}
        >
          send
        </button>
        {/* 卡上那颗 Upgrade。真卡由 `chat/UpgradeCard.tsx` 画,这里只需要
            按下**它拿到的那个回调**,才能断言「点了跳哪」。 */}
        <button
          type="button"
          data-testid="upgrade-card-click"
          disabled={props.onAmrBalanceUpgrade == null}
          onClick={() => props.onAmrBalanceUpgrade?.()}
        >
          upgrade
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

/** AMR on a daemon runtime — the reported configuration. */
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



/**
 * The project Home just created from the example card: bound to the team
 * workspace, carrying the seeded prompt and the applied plugin.
 */
const project = (): Project => ({
  id: PROJECT_ID,
  name: 'Caustic Pool',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  pendingPrompt: SEED_PROMPT,
  metadata: { kind: 'prototype', pluginId: 'example-webgl-experience' },
  // The daemon's read model of the project's single `workspace_projects` row,
  // carried on the project record itself (`Project.workspaceId`). Home created
  // this project in the caller's workspace, so it names that workspace.
  workspaceId: TEAM_WORKSPACE,
} as Project);

/**
 * Answer the caller-identity read, and leave the PROJECT-scope read pending
 * forever. That is the window the auto-send fires in: `useProjectWorkspaceScope`
 * needs a round trip, while the auto-send gate only waits for the conversation
 * and message reads.
 */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/context')) {
        return new Response(JSON.stringify({ context: CALLER_CONTEXT }), { status: 200 });
      }
      if (url.includes('/workspace-scope')) {
        // Never settles — the scope is unread at send time.
        return new Promise<Response>(() => {});
      }
      return new Response('{}', { status: 200 });
    }),
  );
}

function projectViewElement(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  return (
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
    />
  );
}

function renderProjectView(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  return render(projectViewElement(overrides));
}

/**
 * 按下〔发送〕—— **等到这一按真的会被受理为止**。
 *
 * 按钮一渲染就在,但会话流水还在加载:那段时间 `sendDisabled` 是真的
 * (`currentConversationLoading`),按下去什么都不会发生。之前这里是渲染完
 * 立刻按,赢的只是「本机上 `listMessages` 恰好比第一帧先落」那几毫秒 ——
 * CI 上慢过 5ms 就整条判定路都走不到,弹窗和卡片一个都不出,`waitFor` 白等
 * 3 秒然后报「找不到弹窗」,看起来像产品坏了。实测阈值在 1ms 和 5ms 之间。
 *
 * 和 `tests/components/w62-mid-run-balance-wiring.test.tsx` 的 `sendOnce`
 * 同一条纪律:先证明这一按会被受理,再断言它的后果。
 */
async function clickSendWhenReady() {
  await screen.findByTestId('normal-send');
  await waitFor(() =>
    expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByTestId('normal-send'));
}


/** 一份可用的钱包读数,余额由调用方给。 */
const snapshot = (balanceUsd: string): AmrWalletSnapshot => ({
  status: 'available',
  profile: 'prod',
  user: { plan: 'pro' },
  balanceUsd,
  updatedAt: null,
  fetchedAt: new Date().toISOString(),
  stale: false,
  source: 'vela_api',
});


const mockedWindowOpen = vi.fn();

const EMPTY_WALLET = {
  kind: 'hard' as const,
  reason: 'insufficient' as const,
  snapshot: snapshot('0'),
};

describe('余额不足:身份 × 订阅的四种分支', () => {
  beforeEach(() => {
    resourceContextObservations.length = 0;
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    stubFetch();
    vi.stubGlobal('open', mockedWindowOpen);
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  /** 用给定身份发一条,并把余额门钉在给定判定上。 */
  async function sendAs(
    context: WorkspaceCollabContext | null,
    gate: Awaited<ReturnType<typeof checkAmrBalanceGate>>,
  ) {
    workspaceScopeMocks.ambientContext = context;
    mockedCheckAmrBalanceGate.mockResolvedValue(gate as never);
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await clickSendWhenReady();
  }

  /** 卡出现了吗(ProjectView 交给 ChatPane 的那个余额)。 */
  function cardBalance(): string {
    return screen.getByTestId('amr-balance-card-prop').textContent ?? '';
  }

  // 反向对照(T58 的对照组)。这一格**没有变**:同一张弹窗、主按钮仍然落在
  // 套餐页。少了它,把两格合并成「都跳自动充值」也会全绿。
  it('非 Max · owner:卡 + 会员转化弹窗,卡和弹窗都跳 console 的套餐页', async () => {
    await sendAs(callerContext('owner', 'team_pro'), EMPTY_WALLET);

    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();
    expect(cardBalance()).toBe('0');

    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    expect(mockedWindowOpen).toHaveBeenCalledTimes(1);
    // 这一条钉的始终是「卡和弹窗去同一个地方」;那个地方变过两次。
    // 合并 origin/main 后是公开 Pricing(#7122 / #7167),2026-09-06 产品把它
    // 改回 console 的套餐页并要求 **profile-aware**(T54)—— 写死 Pricing 时
    // 非生产的包会把人送去生产结账。
    const upgradeUrl = String(mockedWindowOpen.mock.calls[0]?.[0]);
    expect(upgradeUrl).toContain('billing=plan');
    expect(upgradeUrl).not.toContain('/pricing');

    // **弹窗那颗主按钮**也是套餐页 —— 卡走对了、弹窗走错了同样是缺陷。
    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
    expect(mockedWindowOpen).toHaveBeenCalledTimes(2);
    const dialogUrl = String(mockedWindowOpen.mock.calls[1]?.[0]);
    expect(dialogUrl).toContain('billing=plan');
    expect(dialogUrl).not.toContain('billing=auto-recharge');
  });

  it('非 Max · 非 owner:卡 + 找所有者充值弹窗,不外跳', async () => {
    await sendAs(callerContext('member', 'team_pro'), EMPTY_WALLET);

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-owner-dialog')).toBeTruthy(),
    );
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(cardBalance()).toBe('0');

    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    expect(mockedWindowOpen).not.toHaveBeenCalled();
  });

  // T58:这一格现在**也出弹窗** —— 和第一格同一张会员转化弹窗,文案一字不差。
  // 差别只在主按钮:第一格 `billing=plan`,这里 `billing=auto-recharge`。
  it('Max · owner:卡 + 同一张会员转化弹窗,卡和弹窗都跳 vela web 的自动充值', async () => {
    await sendAs(callerContext('owner', 'team_max'), EMPTY_WALLET);

    await waitFor(() => expect(cardBalance()).toBe('0'));
    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());
    // 成员那张不许顶替:这一格的人**有**账单权限。
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    expect(mockedWindowOpen).toHaveBeenCalledTimes(1);
    expect(String(mockedWindowOpen.mock.calls[0]?.[0])).toContain('billing=auto-recharge');

    // 命门:弹窗那颗主按钮走的是**自动充值**,不是套餐页 —— 他没有更高的套餐
    // 可买,把他送去套餐页是让他买一个已经在用的东西。
    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
    expect(mockedWindowOpen).toHaveBeenCalledTimes(2);
    const dialogUrl = String(mockedWindowOpen.mock.calls[1]?.[0]);
    expect(dialogUrl).toContain('billing=auto-recharge');
    expect(dialogUrl).not.toContain('billing=plan');
  });

  // 上面那条 Max·owner 是把 `planId` 直接写在 context 上的。**真实后端不会这样报。**
  //
  // 2026-09-04 用四个真账号打本地 vela 实测(od-team-max-owner@local.test,
  // 团队工作区 team_max / owner):
  //
  //   vela  `PUT /api/v1/workspaces/current` → planId: "team_max"、role owner、
  //         permissions.canManageBilling: true
  //   OD    `GET /api/workspace/context`     → role owner ✓、canManageBilling ✓、
  //         **planId: null** ✗
  //
  // 不是掉数据,是结构使然:context 只由 vela 的 `/api/v1/workspaces` 目录行拼出来
  // (`daemon/src/collab/vela-workspace-context.ts:385` 把 planId 写死成 null),
  // 而目录行根本不带套餐字段。工作区的套餐只在账单快照里
  // (`vela billing workspace-snapshot` → `workspaceSnapshot.billing.planId`)。
  //
  // 于是这一格钉的是**生产形状**:context 不带 planId,套餐只从账单来。
  // ProjectView 必须仍然认出这是 Max·owner,跳自动充值 —— 否则一个团队 Max
  // 所有者会被送去 Pricing 页买他已经买过的东西,而上面那条测试照样是绿的。
  // Home 那条链路(EntryShell)本来就把投影后的账单传进去了,这里没传。
  it('生产形状:context 不带 planId,团队 Max 所有者仍要跳自动充值', async () => {
    workspaceScopeMocks.billingResponse = {
      // 账号档是 max(个人梯子),**不是**团队命名空间,按投影规则不许给团队工作区当替身。
      summary: {
        workspaceId: null,
        membershipTier: 'max',
        totalAvailableCredits: 0,
        subscriptionCredits: 0,
        rechargeCredits: 0,
        balanceUsd: '0.0000',
        subscriptionStatus: 'active',
        availableActions: [],
      },
      workspaceBalance: null,
      // 工作区套餐唯一的真实来源。
      workspaceSnapshot: {
        schemaVersion: 1,
        workspaceId: TEAM_WORKSPACE,
        workspaceMemberId: TEAM_MEMBER,
        billingScopeVersion: 2,
        billing: { billingState: 'active', planId: 'team_max' },
        wallet: { balanceUsd: '0.0000', expiresAt: null, updatedAt: null },
        revisions: { billing: 'b1', wallet: 'w1' },
      },
    };

    await sendAs(callerContext('owner', null), EMPTY_WALLET);

    await waitFor(() => expect(cardBalance()).toBe('0'));
    // T58:Max·owner 现在也出会员转化弹窗(和第一格同一张)。
    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    expect(mockedWindowOpen).toHaveBeenCalledTimes(1);
    const url = String(mockedWindowOpen.mock.calls[0]?.[0]);
    expect(url).toContain('billing=auto-recharge');
    // 反向对照:确认他没有被送去买一个他已经在用的套餐。
    expect(url).not.toContain('open-design.ai/pricing');

    // 弹窗那颗主按钮同样要认出这个生产形状(context 不带 planId)。
    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
    expect(String(mockedWindowOpen.mock.calls[1]?.[0])).toContain('billing=auto-recharge');
  });

  // 「Max」= 个人 Max 和团队 Max 都算(用户修正)。个人档走的是另一条链路
  // (个人工作区 + 账号档),但结论必须一样。
  it('个人 Max · owner:同样出那张弹窗,同样跳自动充值', async () => {
    await sendAs(
      callerContext('owner', 'max', { workspaceType: 'personal' }),
      EMPTY_WALLET,
    );

    await waitFor(() => expect(cardBalance()).toBe('0'));
    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    expect(String(mockedWindowOpen.mock.calls[0]?.[0])).toContain('billing=auto-recharge');

    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
    expect(String(mockedWindowOpen.mock.calls[1]?.[0])).toContain('billing=auto-recharge');
  });

  it('Max · 非 owner:和非 Max 的成员同一条路', async () => {
    await sendAs(callerContext('member', 'team_max'), EMPTY_WALLET);

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-owner-dialog')).toBeTruthy(),
    );
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(cardBalance()).toBe('0');
  });

  // 团队工作区带着 vela 的 settings URL 时,自动充值链接要落在那个工作区的
  // 控制台上,而不是账号级兜底页 —— 否则所有者会被带到别的工作区去充值。
  it('团队工作区的自动充值链接带上这个工作区', async () => {
    await sendAs(
      callerContext('owner', 'team_max', {
        workspaceSettingsUrl:
          'https://open-design.ai/amr/settings?workspaceId=nt3itfm1b95puq5w33tvzu44',
      }),
      EMPTY_WALLET,
    );

    await waitFor(() => expect(cardBalance()).toBe('0'));
    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    const url = String(mockedWindowOpen.mock.calls[0]?.[0]);
    expect(url).toContain('workspaceId=nt3itfm1b95puq5w33tvzu44');
    expect(url).toContain('billing=auto-recharge');
  });
});

describe('死胡同:没有账单权限的成员必须拿到一条前进的路', () => {
  beforeEach(() => {
    resourceContextObservations.length = 0;
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    stubFetch();
    vi.stubGlobal('open', mockedWindowOpen);
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
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
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
   * §6.Y 的出口是**这张弹窗本身**,不是它上面有几颗按钮。
   *
   * 原来 `AmrBalanceDialog` 的主按钮取自 `workspaceUpgradeUrl`,而它对没有
   * `canManageBilling` 的成员返回 `null` —— 三元落空,弹窗上只剩一颗
   * 「暂不需要」,任务就那么 park 在队列里。换成 `AmrOwnerTopUpDialog` 之后,
   * 这类成员至少被告知了「该找谁」。
   *
   * ⚠️ 这条测试在 2026-09-06 被**改写**(T56)。它原来钉的是「弹窗里除了关闭
   * 之外还得有别的可点的东西」,依据是那颗「复制请求」。产品裁决删掉那颗按钮
   * (「不要保留,严格按产品稿,不要私自发挥」),这一档因此**回到单出口** ——
   * 所以判据从「按钮数 > 2」改成「按身份出对的那张弹窗」。文案与按钮数的判据
   * 移到 `AmrOwnerTopUpDialog.copy.test.tsx`。
   */
  it('成员拿到的是「找所有者充值」,不是他点不动的升级弹窗', async () => {
    workspaceScopeMocks.ambientContext = callerContext('member', 'team_pro');
    mockedCheckAmrBalanceGate.mockResolvedValue(EMPTY_WALLET as never);
    render(projectViewElement({ project: { ...project(), pendingPrompt: null } as never }));
    await clickSendWhenReady();

    await screen.findByTestId('amr-balance-owner-dialog');
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    // 那颗「复制请求」是产品明确删掉的,不许有人顺手加回来。
    expect(screen.queryByTestId('amr-balance-owner-copy')).toBeNull();
  });
});

describe('守卫:判定放行时四种分支一个都不许冒出来', () => {
  beforeEach(() => {
    resourceContextObservations.length = 0;
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    stubFetch();
    vi.stubGlobal('open', mockedWindowOpen);
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
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
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
   * 「付费档余额 0 = 不限量,不拦」(`error-ux-design.md` §3 / R-010 / OD #7190)。
   * 那条口径住在 `runtime/amr-balance-gate.ts` —— 它对这种账号返回 `allow`。
   * 这一步的职责只有一个:**别把它重新拦回去**。四组身份逐一验一遍,免得某一支
   * 顺手把「拦截」画进了呈现层。
   */
  it.each([
    ['非 Max · owner', callerContext('owner', 'team_pro')],
    ['非 Max · 非 owner', callerContext('member', 'team_pro')],
    ['Max · owner', callerContext('owner', 'team_max')],
    ['Max · 非 owner', callerContext('member', 'team_max')],
  ])('%s:余额 0 但判定放行 → 照跑,不出卡也不弹窗', async (_name, context) => {
    workspaceScopeMocks.ambientContext = context;
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    render(projectViewElement({ project: { ...project(), pendingPrompt: null } as never }));
    await clickSendWhenReady();

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('none');
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();
  });
});
