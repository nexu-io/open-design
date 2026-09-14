// @vitest-environment jsdom
//
// OPEND-2720 红测:**项目页里,团队所有者被降级成 member,拿不到升级入口。**
//
// 2026-09-07 本地 vela 全栈 + 真 Chrome 跑的六格矩阵,两格挂在同一个根因上:
//
//   B  team-max-owner / Max Team(team)/ max / role=owner
//      → 弹出 `AmrOwnerTopUpDialog`「请联系团队所有者充值」,按钮只有 X 和
//        「知道了」,**一个升级入口都没有**。他自己就是 owner。
//   C  team-max-owner / 个人档 / max
//      → 弹窗主 CTA 落 `billing=auto-recharge`(对),**卡上那颗「升级」落
//        `billing=plan`**(错),两者跳去不同的地方。
//
// 根因:daemon 两个端点对同一个工作区、同一个 member 给出互相矛盾的答案。
// `GET /api/projects/:id/workspace-scope` 的上下文是
// `resolveLocalProjectWorkspaceScope()` **拼**出来的 —— 那个函数的文档注释第一句
// 就是「without consulting the membership directory」,它填的 `role: 'member'`
// 是最小权限占位,`workspaceName` 直接拿 workspaceId 当名字是同一个破绽。
// `GET /api/workspace/context` 报的才是这个人的真实角色。
//
// 那个占位**不许动**:daemon 的写闸门按 `privileged = role === 'owner'|'admin'`
// 算 `canMutate = privileged || selfCreated`,它就是「创建者可写 / 非创建者只读」
// 的实现方式(守卫见 `apps/daemon/tests/collab/project-scope-least-privilege.test.ts`)。
// 要改的是**它被拿去回答付款权限**这件事。
//
// 所以这份夹具刻意把两份上下文分开,像生产那样:项目 scope 那份是拼出来的
// (role member、名字就是 id),环境那份是权威的(role owner)。既有的
// `ProjectView.amr-balance-branches.test.tsx` 把 `projectScope` 永远留在
// `{ loading: true, scope: null }`,于是 preflight 一路回退到环境上下文 ——
// 那条路上这个缺陷根本照不出来,那些测试今天全绿。

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
  type ProjectWorkspaceScope,
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

const PROJECT_ID = 'opend2720-project';
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';
const PERSONAL_WORKSPACE = 'ac43mfba3blvfvfmeie1euti';
const MEMBER_ID = 'dn87ohicuyq4o839pgi37op4';
const TEAM_SETTINGS_URL =
  `https://open-design.ai/amr/settings?workspaceId=${TEAM_WORKSPACE}`;
const PERSONAL_SETTINGS_URL =
  `https://open-design.ai/amr/settings?workspaceId=${PERSONAL_WORKSPACE}`;

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
vi.mock('../../src/components/FileWorkspace', async () => {
  const { useProjectCollabContext } = await import('../../src/collab/collab-context');
  return {
    DESIGN_SYSTEM_TAB: '__design_system__',
    FileWorkspace: () => {
      // ProjectView 把**项目资源/写权限**用的那份上下文放进这个 React context
      // (`collabValue.workspaceContext = projectRunWorkspaceContext`),
      // `workspaceProjectHeaders` 也是从同一份取 `x-od-workspace-role`。
      // 合出来的账单上下文一旦泄漏到这里,只读模型当场失效。
      const { workspaceContext } = useProjectCollabContext();
      resourceContextObservations.push(workspaceContext);
      return <div data-testid="file-workspace" />;
    },
  };
});
vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: {
    activeConversationId?: string | null;
    sendDisabled?: boolean;
    amrBalanceCardUsd?: number | null;
    onAmrBalanceUpgrade?: () => void;
    onSend?: (prompt: string, attachments: [], commentAttachments: []) => unknown;
  }) => {
    chatPaneSpy(props);
    return (
      <div>
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
const mockedWindowOpen = vi.fn();

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

const project = (workspaceId: string): Project => ({
  id: PROJECT_ID,
  name: 'Caustic Pool',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  metadata: { kind: 'prototype' },
  workspaceId,
} as Project);

/**
 * `GET /api/projects/:id/workspace-scope` 真实产出的那一份 —— daemon 走
 * `workspaceContextFromDirectoryItem({ workspaceName: workspaceId,
 * role: 'member', … })` 拼出来的。两处破绽照原样保留:名字就是 id,角色写死。
 */
function synthesisedScopeContext(
  workspaceId: string,
  workspaceType: 'team' | 'personal',
  workspaceSettingsUrl: string,
): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = 'active' as const;
  const base: WorkspaceCollabContext = {
    workspaceId,
    workspaceType,
    workspaceMemberId: MEMBER_ID,
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    // 目录行不带套餐,daemon 两侧都写死 null。
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    workspaceSettingsUrl,
    // 破绽本身:名字就是 id。
    workspaceName: workspaceId,
  };
  return workspaceType === 'team'
    ? { ...base, teamId: workspaceId, teamName: workspaceId }
    : base;
}

/** `GET /api/workspace/context` 那一份:同一个工作区、同一个成员的真实角色。 */
function authoritativeContext(
  workspaceId: string,
  workspaceType: 'team' | 'personal',
  workspaceSettingsUrl: string,
  workspaceName: string,
): WorkspaceCollabContext {
  const role = 'owner' as const;
  const lifecycleState = 'active' as const;
  const base: WorkspaceCollabContext = {
    workspaceId,
    workspaceType,
    workspaceMemberId: MEMBER_ID,
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    workspaceSettingsUrl,
    workspaceName,
  };
  return workspaceType === 'team'
    ? { ...base, teamId: workspaceId, teamName: workspaceName }
    : base;
}

function boundScope(
  workspaceId: string,
  kind: 'team' | 'personal',
  settingsUrl: string,
): ProjectWorkspaceScope {
  return {
    kind,
    projectId: PROJECT_ID,
    workspaceId,
    visibility: kind === 'team' ? 'team' : 'personal',
    context: synthesisedScopeContext(workspaceId, kind, settingsUrl),
  } as ProjectWorkspaceScope;
}

const snapshot = (balanceUsd: string): AmrWalletSnapshot => ({
  status: 'available',
  profile: 'prod',
  user: { plan: 'max' },
  balanceUsd,
  updatedAt: null,
  fetchedAt: new Date().toISOString(),
  stale: false,
  source: 'vela_api',
});

const EMPTY_WALLET = {
  kind: 'hard' as const,
  reason: 'insufficient' as const,
  snapshot: snapshot('0'),
};

/** 团队工作区的套餐真实来源:账单快照(context 的 planId 生产上永远是 null)。 */
const TEAM_MAX_BILLING = {
  summary: {
    workspaceId: null,
    membershipTier: '',
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: '0.0000',
    subscriptionStatus: 'active',
    availableActions: [],
  },
  workspaceBalance: null,
  workspaceSnapshot: {
    schemaVersion: 1,
    workspaceId: TEAM_WORKSPACE,
    workspaceMemberId: MEMBER_ID,
    billingScopeVersion: 2,
    billing: { billingState: 'active', planId: 'team_max' },
    wallet: { balanceUsd: '0.0000', expiresAt: null, updatedAt: null },
    revisions: { billing: 'b1', wallet: 'w1' },
  },
};

/** 个人工作区:账号档就是作用域,`membershipTier` 直接说了算。 */
const PERSONAL_MAX_BILLING = {
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
  workspaceSnapshot: null,
};

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  );
}

function projectViewElement(workspaceId: string) {
  return (
    <ProjectView
      project={project(workspaceId)}
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
    />
  );
}

async function clickSendWhenReady() {
  await screen.findByTestId('normal-send');
  await waitFor(() =>
    expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByTestId('normal-send'));
}

/**
 * 一条外跳链接的**落点**:origin + path + `billing` 意图 + 它带的 workspaceId。
 *
 * 归因参数(`od_entry_source` 等)按入口不同天生不一样,不属于「跳去哪」。
 * 这个投影正是产品文档里那句「卡和弹窗是同一格的两件东西」要比较的东西。
 */
function billingDestination(rawUrl: string): string {
  const url = new URL(rawUrl);
  const billing = url.searchParams.get('billing') ?? '';
  const workspaceId = url.searchParams.get('workspaceId') ?? '';
  return `${url.origin}${url.pathname}?billing=${billing}&workspaceId=${workspaceId}`;
}

function openedUrl(callIndex: number): string {
  return String(mockedWindowOpen.mock.calls[callIndex]?.[0]);
}

function resetHarness() {
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
  mockedCheckAmrBalanceGate.mockResolvedValue(EMPTY_WALLET as never);
  mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
  projectCollabMocks.writerAuthority = 'allowed';
  projectCollabMocks.viewerOnly = false;
}

describe('OPEND-2720 项目页的付款入口读的是权威身份', () => {
  beforeEach(resetHarness);

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  // 矩阵 B 格。
  it('团队 Max 所有者:出会员转化弹窗并跳自动充值,而不是「请联系团队所有者充值」', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: boundScope(TEAM_WORKSPACE, 'team', TEAM_SETTINGS_URL),
    };
    workspaceScopeMocks.ambientContext = authoritativeContext(
      TEAM_WORKSPACE,
      'team',
      TEAM_SETTINGS_URL,
      'Max Team',
    );
    workspaceScopeMocks.billingResponse = TEAM_MAX_BILLING;

    render(projectViewElement(TEAM_WORKSPACE));
    await clickSendWhenReady();

    await waitFor(() => expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('0'));
    // 他自己就是所有者,「去找所有者」那张是死胡同。
    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());
    expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();

    // 弹窗的主 CTA 必须存在且落在自动充值 —— Max 所有者没有更高的套餐可买。
    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
    expect(mockedWindowOpen).toHaveBeenCalledTimes(1);
    const dialogUrl = openedUrl(0);
    expect(dialogUrl).toContain('billing=auto-recharge');
    expect(dialogUrl).toContain(`workspaceId=${TEAM_WORKSPACE}`);

    // 卡上那颗必须落在同一处(见下面那条守卫的理由)。
    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    expect(mockedWindowOpen).toHaveBeenCalledTimes(2);
    expect(billingDestination(openedUrl(1))).toBe(billingDestination(dialogUrl));
  });

  // 矩阵 C 格。源码自己把这称作缺陷:「卡和弹窗…两者跳去不同的地方是缺陷而不是
  // 特性」(`runtime/amr-balance-branch.ts` 的 `amrBalanceDialogUpgradeIntent`)。
  // 这条把那句话变成可执行的守卫。
  it('个人 Max 所有者:卡上那颗和弹窗那颗落在同一处', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: boundScope(PERSONAL_WORKSPACE, 'personal', PERSONAL_SETTINGS_URL),
    };
    workspaceScopeMocks.ambientContext = authoritativeContext(
      PERSONAL_WORKSPACE,
      'personal',
      PERSONAL_SETTINGS_URL,
      'Personal workspace',
    );
    workspaceScopeMocks.billingResponse = PERSONAL_MAX_BILLING;

    render(projectViewElement(PERSONAL_WORKSPACE));
    await clickSendWhenReady();

    await waitFor(() => expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('0'));
    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());

    fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
    const dialogUrl = openedUrl(0);
    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    const cardUrl = openedUrl(1);

    expect(billingDestination(cardUrl)).toBe(billingDestination(dialogUrl));
    expect(cardUrl).toContain('billing=auto-recharge');
    expect(cardUrl).toContain(`workspaceId=${PERSONAL_WORKSPACE}`);
  });

  // 条件 1(调度方 2026-09-07):合出来的账单上下文里 `role` 可能是 owner。
  // 它一旦流进项目资源/写权限那条链,daemon 的 `privileged` 就变成 true,
  // 只读模型静默失效。这条钉住它没有流过去。
  it('账单上下文不许流进项目资源/写权限那条链', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: boundScope(TEAM_WORKSPACE, 'team', TEAM_SETTINGS_URL),
    };
    workspaceScopeMocks.ambientContext = authoritativeContext(
      TEAM_WORKSPACE,
      'team',
      TEAM_SETTINGS_URL,
      'Max Team',
    );
    workspaceScopeMocks.billingResponse = TEAM_MAX_BILLING;

    render(projectViewElement(TEAM_WORKSPACE));
    await clickSendWhenReady();

    // 先证明账单那条链**确实**已经拿到了 owner 身份(否则这条守卫恒真)。
    await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());

    await waitFor(() => expect(resourceContextObservations.length).toBeGreaterThan(0));
    for (const observed of resourceContextObservations) {
      expect(observed).not.toBeNull();
      // 项目请求的 `x-od-workspace-role` 就是从这一份取的。
      expect(observed!.role).toBe('member');
      expect(observed!.permissions.canManageBilling).toBe(false);
      expect(observed!.permissions.canManageAutoRecharge).toBe(false);
    }
  });

  // 用户 2026-09-07:「不能等半天错误的身份模型再显示正确的」。权威上下文还没
  // 到(或者根本不可用)时,付款入口按 scope 的最小权限走 —— 团队工作区因此
  // 落到「找所有者」那张,而不是给出一颗点了会被后端拒的按钮。
  // 关键是:**这一格绝不许拿环境里那个个人工作区顶上**。
  it('权威上下文缺席时按 scope 的最小权限走,不借用别的工作区', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: boundScope(TEAM_WORKSPACE, 'team', TEAM_SETTINGS_URL),
    };
    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.billingResponse = TEAM_MAX_BILLING;

    render(projectViewElement(TEAM_WORKSPACE));
    await clickSendWhenReady();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-owner-dialog')).toBeTruthy(),
    );
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    expect(mockedWindowOpen).not.toHaveBeenCalled();
  });

  // 环境里选中的是**另一个**工作区时,同样不许借用它的身份 —— 那正是
  // `ProjectView.tsx:2290-2296` 那段注释在防的「掉回个人钱包」。
  it('环境里是另一个工作区时,不许拿它的身份回答这个项目的付款权限', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: boundScope(TEAM_WORKSPACE, 'team', TEAM_SETTINGS_URL),
    };
    workspaceScopeMocks.ambientContext = authoritativeContext(
      PERSONAL_WORKSPACE,
      'personal',
      PERSONAL_SETTINGS_URL,
      'Personal workspace',
    );
    workspaceScopeMocks.billingResponse = TEAM_MAX_BILLING;

    render(projectViewElement(TEAM_WORKSPACE));
    await clickSendWhenReady();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-owner-dialog')).toBeTruthy(),
    );
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('upgrade-card-click'));
    expect(mockedWindowOpen).not.toHaveBeenCalled();
  });
});
