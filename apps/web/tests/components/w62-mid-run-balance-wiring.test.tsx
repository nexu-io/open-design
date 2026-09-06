// @vitest-environment jsdom
//
// 红测(OPEND-2597 · 接线那一半):**跑到一半的余额不足,谁把升级卡点亮。**
//
// `ChatPane` 那一页(`tests/components/chat/w62-mid-run-balance-card.test.tsx`)
// 断言的是「拿到余额之后画出来的是升级卡、不是白卡」。这一页断言的是它的上游:
// 一轮 AMR run 跑到一半死在 `AMR_INSUFFICIENT_BALANCE` 上时,`ProjectView`
// 要去把钱包读数取回来,交给 `amrBalanceCardUsd`。
//
// 在此之前 `setAmrBalanceCardUsd` 全项目只有两处调用,都在**发送前**那道余额闸门里
// (`gate.kind === 'hard' | 'soft'`)。跑到一半那条路一次都没点亮过这张卡。
//
// `ChatPane` 在这一层是 mock 的(它自带半个应用),所以这里断言的是
// **ProjectView 把哪份数据交给了 ChatPane**;两段靠同一个 prop 名接在一起。

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

const PROJECT_ID = 'caustic-pool-project';
/** The team workspace from the report. */
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';
const TEAM_MEMBER = 'member-sender';
/** The 「水面焦散」 card's seeded prompt. */
const SEED_PROMPT =
  '自包含 WebGL2 主视觉：由域扭曲涟漪织成的动态水面焦散；点击水面掉涟漪。无网格、无贴图。';

/**
 * 这一页管的是「告警出卡 / 拦截出卡 + 弹窗」这一层,不是身份分支那一层。
 *
 * 身份钉在 **非 Max · owner** 上,因为那一组的弹窗就是 `AmrBalanceDialog` ——
 * 也就是这一页原本断言的那张。四种身份各自唤起哪张弹窗,由
 * `ProjectView.amr-balance-branches.test.tsx` 单独断言(规格 §6.V)。
 */
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
    amrBalanceCardUnavailable?: boolean;
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
    );
  },
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
      if (url.includes('/api/workspace/billing')) {
        return new Response(JSON.stringify(workspaceBillingResponse ?? {}), {
          status: 200,
        });
      }
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
 * 一份**被后端证明过**的工作区钱包投影。
 *
 * 这个项目绑在团队工作区上,所以它花的是工作区的钱 —— 补查读的也必须是这一份
 * (`/api/workspace/billing?scope=workspace&…&freshness=authoritative`),而不是
 * 账号级的 `/api/integrations/vela/wallet`。原先这个夹具只给了账号读数,
 * 那是**生产不会出现的形状**:同一个人的个人钱包和这个团队的钱包是两笔钱。
 * 「念的是哪个钱包」由 `w62-mid-run-balance-workspace-wallet.test.tsx` 单独钉;
 * 这一页只需要那份读数存在,好继续断言「谁把卡点亮」。
 */
function provenWorkspaceBilling(balanceUsd: string): WorkspaceBillingResponse {
  const observedAt = new Date().toISOString();
  return {
    summary: null,
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

/** 这一轮 `/api/workspace/billing` 回什么;`null` = 读不出工作区钱包。 */
let workspaceBillingResponse: WorkspaceBillingResponse | null = null;

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

describe('跑到一半余额不足:谁点亮升级卡', () => {
  beforeEach(() => {
    resourceContextObservations.length = 0;
    workspaceBillingResponse = null;
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
    // 发送前那道闸门放行 —— 这一页要的正是「闸门看不出问题,run 起来了,
    // 跑到一半才死在钱上」那一格。
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

  /** daemon 在一轮跑到一半时判定的失败。`code` 就是错误码。 */
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

  /**
   * 发一条,并等到 run 真的起来为止。
   *
   * 「点了按钮」不等于「run 起来了」:composer 在项目还在加载时是禁用的,
   * 而这一页要断言的东西全在 run 失败之后。所以先等按钮可用,再等
   * `streamViaDaemon` 真的被调用 —— 否则后面每一条断言都可能只是赢在
   * 「什么都还没发生」上。
   */
  async function sendOnce() {
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await screen.findByTestId('normal-send');
    await waitFor(() =>
      expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId('normal-send'));
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
  }

  it('跑到一半的余额不足:把钱包读数交给升级卡', async () => {
    mockedFetchAmrWalletSnapshot.mockResolvedValue(snapshot('0'));
    workspaceBillingResponse = provenWorkspaceBilling('0');
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('0'),
    );
  });

  it('余额还剩一点的那一档,念的是真实读数,不是 0', async () => {
    mockedFetchAmrWalletSnapshot.mockResolvedValue(snapshot('0.35'));
    workspaceBillingResponse = provenWorkspaceBilling('0.35');
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('0.35'),
    );
  });

  // 反向对照:别的失败不该顺手点亮这张卡。
  it('别的失败不点亮升级卡', async () => {
    mockedFetchAmrWalletSnapshot.mockResolvedValue(snapshot('0'));
    failMidRunWith('AGENT_EXECUTION_FAILED');

    await sendOnce();

    // 等一拍,让任何异步读数有机会落下来 —— 断言「没点亮」不能只赢在时序上。
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedFetchAmrWalletSnapshot).not.toHaveBeenCalled();
    expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('none');
  });

  // 读数拿不准就不念:付费档的 $0.00 本来就常态(#7190),
  // 编一个数字比不出卡更糟。
  it('钱包读不出来时不硬画一个数字', async () => {
    mockedFetchAmrWalletSnapshot.mockResolvedValue({
      ...snapshot('0'),
      status: 'unavailable',
      balanceUsd: null,
    });
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce();

    await waitFor(() => expect(mockedFetchAmrWalletSnapshot).toHaveBeenCalled());
    expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('none');
  });

  /*
   * 但「不念数字」不等于「不给出路」。报错卡已经把自己交给了升级卡
   * (`amr-guidance` 的 `suppressCard`),升级卡又画不出来 —— 两边都不画,
   * 用户在一轮死在钱上的失败之后屏幕上什么都不剩:没有充值入口,也没有重试。
   * 那是这条 P0 路唯一的自救口(`e2e/ui/amr-run-failure-recovery.test.ts:118`)。
   *
   * 所以补查落空要**说出来**,由 ChatPane 把白卡还回来。这一条钉的是那个信号。
   */
  it('补查落空要报给聊天面板,好让白卡还回来', async () => {
    mockedFetchAmrWalletSnapshot.mockResolvedValue({
      ...snapshot('0'),
      status: 'unavailable',
      balanceUsd: null,
    });
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-unavailable-prop').textContent).toBe('yes'),
    );
  });

  // 反向对照:读得出数字的那一格不许置位 —— 置了就会在升级卡旁边多出一张白卡,
  // 正是 2026-09-02 裁决要消掉的那两张。
  it('读得出数字时不报落空', async () => {
    mockedFetchAmrWalletSnapshot.mockResolvedValue(snapshot('0'));
    workspaceBillingResponse = provenWorkspaceBilling('0');
    failMidRunWith('AMR_INSUFFICIENT_BALANCE');

    await sendOnce();

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('0'),
    );
    expect(screen.getByTestId('amr-balance-unavailable-prop').textContent).toBe('no');
  });

  // 反向对照:根本不是余额那一档的失败,不许报落空 —— 那会让别的失败的白卡
  // 走上一条它不该走的判据。
  it('别的失败不报落空', async () => {
    mockedFetchAmrWalletSnapshot.mockResolvedValue({
      ...snapshot('0'),
      status: 'unavailable',
      balanceUsd: null,
    });
    failMidRunWith('AGENT_EXECUTION_FAILED');

    await sendOnce();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('amr-balance-unavailable-prop').textContent).toBe('no');
  });
});
