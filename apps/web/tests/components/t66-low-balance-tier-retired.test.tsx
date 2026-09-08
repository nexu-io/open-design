// @vitest-environment jsdom
//
// 红测 · T66「软档整档撤掉」。
//
// 产品 2026-09-07 看到软档那张卡的截图(「剩余额度 $3.20 / 余额可能撑不完下一个
// 任务 —— 中途用尽会停在半成品上」+ Upgrade)之后原话:
//
//   「这个要不先不要了,跟产品说了一下,不要这个了」
//
// 追问范围后:「余额为零的那个卡片要显示的,并且也要弹窗的」。
//
// 于是终态只剩两档:
//
//   余额 > 0(含 $0–$2 这一段)→ **什么都不出**,不出卡、不弹窗、不挡发送
//   余额 = 0                   → 卡**和**弹窗都出,发送被拦住
//
// ⚠️ **这一页故意不 mock `checkAmrBalanceGate`。** 「软档不出东西」是一条从
// **余额数字**到**屏幕**的完整判据 —— 把闸门 mock 掉就只能喂一个 `kind`,而
// 「$1.20 该算哪一档」正是这次要改的那一半。所以这里喂的是钱包读数本身,
// 判定用真的,断言落在 `ProjectView` 交给 `ChatPane` 的 prop 和弹窗的去留上。
//
// `ChatPane` 仍是 mock 的(它自带半个应用)。「ChatPane 拿到 `null` 之后真的
// 一张卡都不画」由 `tests/components/chat/ChatPane.wired-cards.test.tsx` 的
// 「没有余额提示时不渲染这张卡」从真实 ChatPane 断言,两段靠同一个 prop 名接住。

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
import {
  fetchAmrWalletSnapshot,
  fetchVelaLoginStatus,
  streamViaDaemon,
} from '../../src/providers/daemon';
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
import { resolveAmrPlan } from '../../src/runtime/amr-low-balance-plan';
import type {
  AgentInfo,
  AppConfig,
  ChatMessage,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';

const PROJECT_ID = 't66-project';
const TEAM_WORKSPACE = 't66-workspace';
const TEAM_MEMBER = 't66-member';

/** 产品截图上的那个数字 —— 软档的代表值,落在 `(0, $2)` 里。 */
const SOFT_BALANCE = '1.20';
/** 硬拦档:钱包真的空了。 */
const EMPTY_BALANCE = '0';

/** 身份钉在 **非 Max · owner** 上,那一组的弹窗就是 `AmrBalanceDialog`。 */
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
    viewerOnly: false,
    writerAuthority: 'allowed' as const,
    isOwner: true,
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
  fetchAmrWalletSnapshot: vi.fn(),
  formatVelaBalanceUsd: (value: string | null) => `$${value ?? '0'}`,
  fetchVelaLoginStatus: vi.fn(),
  startVelaLogin: vi.fn(),
  cancelVelaLogin: vi.fn(),
  canUpgradeVelaPlan: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

// 套餐读数在这一层是**可观测的**。原来 OPEND-2600 那一族红测按档位扫「低余额卡
// 各档都要出」;那张卡没了之后,能扫的只剩「档位改变不了结果」,而结果由下面
// 「一次套餐读数都不发」直接钉死 —— 余额 > 0 这条路根本不问档位。
vi.mock('../../src/runtime/amr-low-balance-plan', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/runtime/amr-low-balance-plan')
  >('../../src/runtime/amr-low-balance-plan');
  return { ...actual, resolveAmrPlan: vi.fn(actual.resolveAmrPlan) };
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
    activeConversationId?: string | null;
    messages?: ChatMessage[];
    sendDisabled?: boolean;
    amrBalanceCardUsd?: number | null;
    amrBalanceCardAnchorMessageId?: string | null;
    onSend?: (prompt: string, attachments: [], commentAttachments: []) => unknown;
  }) => (
    <div>
      <div data-testid="active-conversation">{props.activeConversationId ?? ''}</div>
      <div data-testid="amr-balance-card-prop">
        {props.amrBalanceCardUsd == null ? 'none' : String(props.amrBalanceCardUsd)}
      </div>
      <div data-testid="amr-balance-anchor-prop">
        {props.amrBalanceCardAnchorMessageId ?? 'none'}
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
const mockedFetchVelaLoginStatus = vi.mocked(fetchVelaLoginStatus);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedFetchBrands = vi.mocked(fetchBrands);
const mockedResolveAmrPlan = vi.mocked(resolveAmrPlan);

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
  name: 'T66',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  // 没有待发提示词 —— 这一页的每一次发送都由测试自己按下,不走首页自动发送。
  metadata: { kind: 'prototype' },
  workspaceId: TEAM_WORKSPACE,
} as Project);

/** 账号钱包 —— 闸门只从它取 `profile` / `user`,钱看的是工作区那份。 */
const accountSnapshot = (): AmrWalletSnapshot => ({
  status: 'available',
  profile: 'prod',
  user: { id: 'u1', email: 'user@example.com', plan: 'pro' },
  balanceUsd: '99',
  updatedAt: null,
  fetchedAt: new Date().toISOString(),
  stale: false,
  source: 'vela_api',
});

/** 一份能通过闸门全部身份校验的 v2 工作区余额。 */
function authoritativeWorkspaceBilling(balanceUsd: string) {
  const observedAt = '2026-09-07T00:00:00.000Z';
  return {
    summary: null,
    workspaceBalance: {
      billingScopeVersion: 2,
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
      balanceUsd,
      expiresAt: null,
      updatedAt: observedAt,
    },
    workspaceRuntime: {
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
      status: 'fresh',
      revision: '4',
      observedAt,
      softExpiresAt: '2099-09-07T00:00:30.000Z',
      hardExpiresAt: '2099-09-07T00:02:00.000Z',
      retryAt: null,
      errorCode: null,
      reason: 'authoritative-action-read',
      sourceGapDetected: false,
    },
    authoritativeWorkspaceRead: {
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
      observedAt,
    },
  };
}

/** 工作区钱包的余额由调用方给;其余请求原样放行。 */
function stubFetch(workspaceBalanceUsd: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/billing')) {
        return new Response(
          JSON.stringify(authoritativeWorkspaceBilling(workspaceBalanceUsd)),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
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

/** 项目页发一条,余额由工作区钱包那份读数给。 */
async function sendWithWorkspaceBalance(balanceUsd: string) {
  stubFetch(balanceUsd);
  renderProjectView();
  await screen.findByTestId('normal-send');
  await waitFor(() =>
    expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByTestId('normal-send'));
}

describe('T66 · 软档整档撤掉:余额 (0, $2) 什么都不出', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
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
    mockedFetchAmrWalletSnapshot.mockResolvedValue(accountSnapshot());
    // 登录态读不出来 → 套餐退回钱包快照上的 `pro`,也就是「档次读得出来」。
    mockedFetchVelaLoginStatus.mockRejectedValue(new Error('status unavailable'));
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  // 产品 2026-09-07:「这个要不先不要了,跟产品说了一下,不要这个了」
  it('$1.20:流水里不出现任何余额卡', async () => {
    await sendWithWorkspaceBalance(SOFT_BALANCE);

    // 发送照常跑起来 —— 软档从来就不挡发送,撤掉卡不该把这一条也带走。
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    // 卡的读数在闸门那一步就该是 `null`:出卡那一步排在建 run 之前,
    // run 已经建出来就说明那一步已经走过了。
    expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('none');
    // 锚点也一起没有 —— 没有卡就没有「挂在哪一轮下面」这回事。
    expect(screen.getByTestId('amr-balance-anchor-prop').textContent).toBe('none');
  });

  it('$1.20:也不弹任何余额弹窗', async () => {
    await sendWithWorkspaceBalance(SOFT_BALANCE);

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(screen.queryByTestId('amr-owner-top-up-dialog')).toBeNull();
  });

  // 反向对照。产品同日追问后原话:「余额为零的那个卡片要显示的,并且也要弹窗的」。
  describe('反向对照 · 余额 = $0 两个都要在', () => {
    it('$0:卡在,弹窗也在,而且这一次发送被拦住', async () => {
      await sendWithWorkspaceBalance(EMPTY_BALANCE);

      await waitFor(() => expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy());
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('0');
      expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    });
  });

  // OPEND-2600 那一族按档位扫的覆盖,搬到这里翻了个面:任何档位都不再出卡。
  // ⚠️ 这一组之所以还留着而不是删掉,是因为它是**回归护栏** —— 判定层今天压根
  // 不问档位(下面那条红线量的就是这个),所以它现在恒绿;哪天有人重新按档位
  // 分叉,它会立刻变红。
  it.each(['free', 'pro', 'plus', 'max', 'go'])(
    '%s 档在 $1.20 同样什么都不出',
    async (plan) => {
      mockedResolveAmrPlan.mockResolvedValue(plan);

      await sendWithWorkspaceBalance(SOFT_BALANCE);

      await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('none');
      expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    },
  );

  // 红线(T40):余额 > 0 这条路不许多打一次套餐读数。撤掉软档之后这条更严格 ——
  // 那一段现在连「要不要提醒」都不用算,套餐读数一次都不该发生。
  it('红线:$1.20 这条路上一次套餐读数都不发', async () => {
    await sendWithWorkspaceBalance(SOFT_BALANCE);

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(mockedResolveAmrPlan).not.toHaveBeenCalled();
  });

  /*
   * 守卫:`(0, $2)` 这一段的静默**不是因为闸门根本没查**。
   *
   * 少了这一条,把闸门整个短路掉也能让上面两条变绿 —— 那时 $0 那一档会跟着
   * 一起静默,而产品要的正是它必须出。这里量的是「查过了」本身。
   */
  it('守卫:软档这一段确实问过工作区钱包', async () => {
    await sendWithWorkspaceBalance(SOFT_BALANCE);

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    const calls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('/api/workspace/billing'))).toBe(true);
  });
});
