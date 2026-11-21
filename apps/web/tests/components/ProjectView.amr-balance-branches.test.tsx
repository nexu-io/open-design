// @vitest-environment jsdom
//
// 红测:**余额不足 · 身份 × 订阅的四种分支**(规格
// `specs/current/run-error-catalog.md` §6.V,2026-08-26 用户逐条裁决)。
//
// 卡片永远保留,四组的差别只在「同时唤起什么弹窗、点了跳哪」:
//
//   非 Max · owner    卡 + 会员转化弹窗            卡和弹窗都跳 console 的套餐页
//   非 Max · 非 owner 卡 + 新的「找所有者充值」弹窗  不外跳
//   Max   · owner     卡保留独立入口;RUN-004 弹窗没有购买快捷入口
//   Max   · 非 owner  卡 + 新的「找所有者充值」弹窗  不外跳
//
// RUN-004 / frozen product r271 cancels the dialog's automatic-recharge
// shortcut, including Max. Separate card actions remain covered below.
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

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { StrictMode, type ComponentProps, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { composerText, flushMounts, typeAndSettle } from '../helpers/lexical-composer';
import { STAGE_ATTACHMENT_EVENT } from '../../src/components/ChatComposer';
import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { advanceWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import { streamViaDaemon } from '../../src/providers/daemon';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import { setRuntimeAmrConsoleOrigin } from '../../src/runtime/amr-guidance';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
  saveMessage,
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
  role: 'owner' | 'admin' | 'member',
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
const realChatPane = vi.hoisted(() => ({ enabled: false }));
const resourceContextObservations = vi.hoisted(
  () => [] as Array<WorkspaceCollabContext | null>,
);
const projectCollabMocks = vi.hoisted(() => ({
  writerAuthority: 'allowed' as 'allowed' | 'denied' | 'pending',
  viewerOnly: false,
}));

const concurrencyAnalytics = vi.hoisted(() => ({ track: vi.fn() }));
beforeEach(() => concurrencyAnalytics.track.mockClear());
vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ ...actual.useAnalytics(), track: concurrencyAnalytics.track }) };
});
function concurrencyViews() {
  return concurrencyAnalytics.track.mock.calls.filter(([event, props]) => event === 'surface_view' && props.area === 'concurrency_limit_dialog');
}
vi.mock('../../src/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/i18n')>();
  return {
    ...actual,
    useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: (key: string) => key }),
    useT: () => localizedOwnerCopy.enabled ? actual.tForLanguageTag('en')! : (key: string) => key,
  };
});

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

vi.mock('../../src/providers/daemon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/daemon')>()),
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
    openExternalUrl: async (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); return true; },
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
    registerQueuedSubmission: vi.fn(async (projectId, submission) => ({
      id: submission.id, projectId, conversationId: submission.conversationId, acceptedAt: submission.submittedAt,
    })),
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
vi.mock('../../src/components/ChatPane', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/ChatPane')>();
  return { ...actual,
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
    if (realChatPane.enabled) return <actual.ChatPane {...props as ComponentProps<typeof actual.ChatPane>} />;
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
}; });

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
  agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local' } },
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


const localizedOwnerCopy = vi.hoisted(() => ({ enabled: false }));
const mockedWindowOpen = vi.fn();

const EMPTY_WALLET = {
  kind: 'hard' as const,
  reason: 'insufficient' as const,
  snapshot: snapshot('0'),
};

describe('Link request concurrency rejection preserves the original send', () => {
  beforeEach(() => {

    realChatPane.enabled = false;
    localizedOwnerCopy.enabled = false;
    window.localStorage.clear(); window.sessionStorage.clear(); resetWorkspaceContextCache(); stubFetch();
    vi.stubGlobal('open', mockedWindowOpen);
    mockedListConversations.mockImplementation(async (id: string) => [conversation(id)]);
    mockedCreateConversation.mockImplementation(async (id: string) => conversation(id));
    mockedListMessages.mockResolvedValue([]); mockedFetchPreviewComments.mockResolvedValue([]);
    mockedFetchProjectFiles.mockResolvedValue([]); mockedFetchBrands.mockResolvedValue([]);
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
    workspaceScopeMocks.billingResponse = null; projectCollabMocks.writerAuthority = 'allowed'; projectCollabMocks.viewerOnly = false;
    mockedStreamViaDaemon.mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); resetWorkspaceContextCache(); setRuntimeAmrConsoleOrigin(null); });

  it.each(['owner', 'admin', 'member'] as const)('%s retains draft/files after a unified concurrency rejection without fetching funding', async role => {
    workspaceScopeMocks.ambientContext = callerContext(role, 'team_go');
    const originalFetch = globalThis.fetch;
    const previews: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/billing/send-preflight')) {
        const request = JSON.parse(String(init?.body)); previews.push(request);
        return Response.json({ schemaVersion: 1, requestId: 'server', ...request, decision: 'reject', reason: 'concurrency_full', details: { running: 'bad' } });
      }
      if (String(input).includes('/billing/preflight?') || String(input).includes('/billing/request-concurrency?')) throw new Error('retired send endpoint');
      return originalFetch(input, init);
    }));
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await waitFor(() => expect(screen.getByTestId('normal-send')).toBeEnabled());
    let result: unknown;
    await act(async () => { result = await chatPaneSpy.mock.calls.at(-1)![0].onSend('retain exact draft', [{ path: 'brief.txt', name: 'brief.txt', kind: 'file' }], []); });
    expect(result).toBe('restore-draft');
    expect(previews).toHaveLength(1);
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    expect(saveMessage).not.toHaveBeenCalled();
    expect(chatPaneSpy.mock.calls.at(-1)![0].messages).toEqual([]);
    expect(chatPaneSpy.mock.calls.at(-1)![0].queuedItems).toEqual([]);
    await screen.findByTestId('amr-concurrency-dialog');
  });

  it.each(['owner', 'admin', 'member'] as const)('%s sees a real request-limit dialog, retains text/files and retries only manually', async (role) => {
    workspaceScopeMocks.ambientContext = callerContext(role, 'team_pro');
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never,
      config: { ...config, agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local' } } } });
    await waitFor(() => expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false));
    const attachments = [{ name: 'brief.txt', path: 'brief.txt', kind: 'file' }];
    await act(async () => { await chatPaneSpy.mock.calls.at(-1)![0].onSend('keep exact draft', attachments, []); });
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    const options = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => {
      options.onRunCreated?.('limit-run');
      await options.handlers.onError(Object.assign(new Error('[code=tier_limit_exceeded] membership concurrency limit exceeded'), {
        code: 'AGENT_EXECUTION_FAILED', failureDetail: 'membership_concurrency_limit',
      }));
    });
    const dialog = await screen.findByTestId('amr-concurrency-dialog');
    expect(dialog).toBeTruthy();
    expect(concurrencyViews().at(-1)?.[1]).toMatchObject({ stage: 'before_run' });
    const props = chatPaneSpy.mock.calls.at(-1)![0];
    expect(props.rejectedComposerSend).toMatchObject({ text: 'keep exact draft', attachments });
    expect(screen.queryByTestId('amr-concurrency-upgrade') !== null).toBe(role === 'owner');
    expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('amr-concurrency-close'));
    expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
    expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1);
    await clickSendWhenReady();
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(2));
  });

  it('RUN-014 Max Owner hides Pricing after Link refuses when the counter was unavailable', async () => {
    const context = callerContext('owner', null);
    workspaceScopeMocks.ambientContext = context;
    const originalFetch = globalThis.fetch;
    const preflightRead = vi.fn(async () => new Response(JSON.stringify({ preflight: {
      schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
      modelId: null, generatedAt: new Date().toISOString(), fundingCheck: 'available', balanceUsd: '10',
      codingPlan: { workspaceId: context.workspaceId, eligible: true, tier: 'max', windows: [] },
    } })));
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/billing/request-concurrency?')) return Promise.resolve(new Response('{}', { status: 503 }));
      if (url.includes('/billing/preflight?')) return preflightRead();
      return originalFetch(input, init);
    }));
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await waitFor(() => expect(screen.getByTestId('normal-send')).toBeEnabled());
    await act(async () => { await chatPaneSpy.mock.calls.at(-1)![0].onSend('real Link refusal draft',
      [{ path: 'brief.txt', name: 'brief.txt', kind: 'file' }], []); });
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledOnce());
    expect(preflightRead).not.toHaveBeenCalled();
    const options = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => { await options.handlers.onError(Object.assign(new Error('Link request concurrency full'), {
      failureDetail: 'membership_concurrency_limit',
    })); });
    expect(await screen.findByTestId('amr-concurrency-dialog')).toBeTruthy();
    expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
    expect(chatPaneSpy.mock.calls.at(-1)![0].rejectedComposerSend).toMatchObject({
      text: 'real Link refusal draft', attachments: [{ path: 'brief.txt' }],
    });
    fireEvent.click(screen.getByTestId('amr-concurrency-close'));
    expect(mockedStreamViaDaemon).toHaveBeenCalledOnce();
  });
  it.each([
    ['local', 'http://127.0.0.1:49195'],
    ['test', 'http://127.0.0.1:49195'],
    ['prod', 'https://open-design.ai'],
    ['unrecognized', 'https://open-design.ai'],
    [null, null],
  ] as const)('snapshot-less funding failure freezes supplied %s profile and payer', async (profile, origin) => {
    const context = callerContext('owner', 'team_pro');
    workspaceScopeMocks.ambientContext = context;
    setRuntimeAmrConsoleOrigin('http://127.0.0.1:49195');
    const props = { project: { ...project(), pendingPrompt: null } as never, amrProfile: profile,
      config: { ...config, agentCliEnv: {} } };
    const view = renderProjectView(props);
    await clickSendWhenReady();
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledOnce());
    const options = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => {
      options.onRunCreated?.('profile-funding-run');
      await options.handlers.onError(Object.assign(new Error('actual Link insufficient funding'), {
        code: 'AMR_INSUFFICIENT_BALANCE',
      }));
    });
    await screen.findByTestId('amr-balance-dialog');
    if (profile === null) {
      expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
    }
    // A later status/profile render cannot change the failure's billing link.
    view.rerender(projectViewElement({ ...props, amrProfile: profile === 'prod' ? 'local' : 'prod' }));
    if (origin === null) {
      // Integration's existing explicit-unknown contract waits for a runtime
      // profile; it must not guess production, even after a later render.
      expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
      expect(mockedWindowOpen).not.toHaveBeenCalled();
    } else {
      fireEvent.click(await screen.findByTestId('amr-balance-dialog-plans'));
      const target = new URL(String(mockedWindowOpen.mock.calls[0]![0]));
      expect(target.origin).toBe(origin);
      expect(target.searchParams.get('workspaceId')).toBe(context.workspaceId);
      expect(target.searchParams.get('billing')).toBe('plan');
    }
    expect(mockedStreamViaDaemon).toHaveBeenCalledOnce();
    setRuntimeAmrConsoleOrigin(null);
  });


  it('freezes the authenticated status profile and origin ahead of stale configuration', async () => {
    const context = callerContext('owner', 'team_pro');
    workspaceScopeMocks.ambientContext = context;
    setRuntimeAmrConsoleOrigin('http://127.0.0.1:49195');
    const props = { project: { ...project(), pendingPrompt: null } as never,
      config: { ...config, agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'prod' } } },
      amrProfile: 'prod',
      workspaceQuotaStatus: { profile: 'test', consoleOrigin: 'http://127.0.0.1:49196' } };
    const view = renderProjectView(props);
    await clickSendWhenReady();
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledOnce());
    const options = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => {
      options.onRunCreated?.('status-funding-run');
      await options.handlers.onError(Object.assign(new Error('actual Link insufficient funding'), {
        code: 'AMR_INSUFFICIENT_BALANCE',
      }));
    });
    await screen.findByTestId('amr-balance-dialog-plans');
    setRuntimeAmrConsoleOrigin('http://127.0.0.1:49197');
    view.rerender(projectViewElement({ ...props,
      workspaceQuotaStatus: { profile: 'prod', consoleOrigin: 'https://open-design.ai' } }));
    fireEvent.click(screen.getByTestId('amr-balance-dialog-plans'));
    const target = new URL(String(mockedWindowOpen.mock.calls[0]![0]));
    expect(target.origin).toBe('http://127.0.0.1:49196');
    expect(target.searchParams.get('workspaceId')).toBe(context.workspaceId);
    expect(target.searchParams.get('billing')).toBe('plan');
    expect(mockedStreamViaDaemon).toHaveBeenCalledOnce();
  });

  it.each([
    ['local', 'http://localhost:5173'],
    ['test', 'https://open-design.powerformer.net'],
    ['prod', 'https://open-design.ai'],
  ] as const)('Project concurrency upgrade preserves %s profile and the rejected payer', async (profile, origin) => {
    const context = callerContext('owner', 'team_pro');
    workspaceScopeMocks.ambientContext = context;
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never,
      config: { ...config, agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: profile } } } });
    await clickSendWhenReady();
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledOnce());
    const options = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => {
      options.onRunCreated?.('profile-limit-run');
      await options.handlers.onError(Object.assign(new Error('actual Link concurrency rejection'), {
        failureDetail: 'membership_concurrency_limit',
      }));
    });
    fireEvent.click(await screen.findByTestId('amr-concurrency-upgrade'));
    const target = new URL(String(mockedWindowOpen.mock.calls[0]![0]));
    expect(target.origin).toBe(origin);
    expect(target.searchParams.get('workspaceId')).toBe(context.workspaceId);
    expect(target.searchParams.get('billing')).toBe('plan');
    expect(mockedStreamViaDaemon).toHaveBeenCalledOnce();
  });
  it.each(['partial', 'thinking', 'tool', 'artifact', 'disconnect', 'late'] as const)('does not restore or reopen from %s work', async (mode) => {
    workspaceScopeMocks.ambientContext = callerContext('owner', 'team_max');
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await clickSendWhenReady();
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    const first = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => {
      first.onRunCreated?.('first-limit-run');
      if (mode === 'partial') first.handlers.onDelta('already delivered part');
      if (mode === 'thinking') first.handlers.onAgentEvent({ kind: 'thinking', text: 'Reviewing the current document.' });
      if (mode === 'tool') first.handlers.onAgentEvent({ kind: 'tool_use', id: 'read-existing', name: 'Read', input: { file_path: 'index.html' } });
      if (mode === 'artifact') first.handlers.onAgentEvent({ kind: 'artifact_focus', open: 'index.html' });
      if (mode === 'late') first.handlers.onDone('finished');
    });
    // Preserve an already committed artifact/event frame just as a real
    // streamed response would, before the later request-limit rejection.
    await flushMounts();
    if (mode !== 'late') await act(async () => {
      await first.handlers.onError(mode === 'disconnect' ? new Error('daemon disconnected') : Object.assign(new Error('named request limit'), { failureDetail: 'membership_concurrency_limit' }));
    });
    if (['partial', 'thinking', 'tool', 'artifact'].includes(mode)) {
      expect(await screen.findByTestId('amr-concurrency-dialog')).toBeTruthy();
      expect(concurrencyViews().at(-1)?.[1]).toMatchObject({ stage: 'mid_run' });
      expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
      expect(chatPaneSpy.mock.calls.at(-1)![0].rejectedComposerSend).toBeUndefined();
    } else if (mode === 'disconnect') {
      expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
      expect(chatPaneSpy.mock.calls.at(-1)![0].rejectedComposerSend).toBeUndefined();
    } else {
      await clickSendWhenReady();
      await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(2));
      await act(async () => { await first.handlers.onError(Object.assign(new Error('old rejected request'), { failureDetail: 'membership_concurrency_limit' })); });
      expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
      expect(chatPaneSpy.mock.calls.at(-1)![0].rejectedComposerSend).toBeUndefined();
    }
  });

  it.each(['empty', 'new-text', 'new-file', 'partial-output', 'workspace-change'] as const)('selected model changes after sending: concurrency rejection preserves %s boundaries', async (draft) => {
    realChatPane.enabled = true;
    workspaceScopeMocks.ambientContext = callerContext('owner', 'team_pro');
    const agents = [{ id: 'amr', name: 'amr', bin: 'vela', available: true,
      models: [{ id: 'glm-5', label: 'GLM 5' }, { id: 'deepseek-v4.1-flash', label: 'Flash' }] }] as AgentInfo[];
    const firstConfig = { ...config, agentModels: { amr: { model: 'glm-5' } } };
    const props = { project: { ...project(), pendingPrompt: null } as never, agents, config: firstConfig };
    const view = renderProjectView(props);
    await flushMounts();
    await typeAndSettle('original model-independent concurrency draft');
    act(() => window.dispatchEvent(new CustomEvent(STAGE_ATTACHMENT_EVENT,
      { detail: { attachments: [{ path: 'original.txt', name: 'original.txt', kind: 'file' }] } })));
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeEnabled());
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledOnce());
    const first = mockedStreamViaDaemon.mock.calls[0]![0];
    expect(first.model).toBe('glm-5');
    await waitFor(() => expect(composerText().trim()).toBe(''));
    if (draft === 'new-text') await typeAndSettle('keep the newer draft');
    if (draft === 'new-file') act(() => window.dispatchEvent(new CustomEvent(STAGE_ATTACHMENT_EVENT,
      { detail: { attachments: [{ path: 'newer.txt', name: 'newer.txt', kind: 'file' }] } })));
    if (draft === 'partial-output') await act(async () => { first.handlers.onDelta('actual model output'); });
    if (draft === 'workspace-change') workspaceScopeMocks.ambientContext = { ...callerContext('owner', 'team_pro'),
      workspaceId: 'different-paying-space', workspaceMemberId: 'different-owner' };
    view.rerender(projectViewElement({ ...props,
      config: { ...config, agentModels: { amr: { model: 'deepseek-v4.1-flash' } } } }));
    await flushMounts();
    await act(async () => { first.onRunCreated?.('model-changed-limit-run');
      first.handlers.onAgentEvent({ kind: 'done_key', key: 'model-changed-protocol-only' }); });
    await flushMounts();
    await act(async () => { await first.handlers.onError(Object.assign(new Error('actual request concurrency limit'),
      { failureDetail: 'membership_concurrency_limit' })); });
    if (draft === 'workspace-change') {
      expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
      expect(composerText().trim()).toBe('');
    } else {
      expect(await screen.findByTestId('amr-concurrency-dialog')).toBeTruthy();
      expect(concurrencyViews().at(-1)?.[1]).toMatchObject({ stage: draft === 'partial-output' ? 'mid_run' : 'before_run' });
      expect(composerText().trim()).toBe(draft === 'empty' ? 'original model-independent concurrency draft'
        : draft === 'new-text' ? 'keep the newer draft' : '');
      const attachments = within(screen.queryByTestId('staged-attachments') ?? document.createElement('div'));
      if (draft === 'empty') expect(attachments.getByTitle('original.txt')).toBeTruthy();
      else expect(attachments.queryByTitle('original.txt')).toBeNull();
      if (draft === 'new-file') expect(attachments.getByTitle('newer.txt')).toBeTruthy();
    }
    expect(mockedStreamViaDaemon).toHaveBeenCalledOnce();
  });

  it.each(['empty', 'new-text', 'new-file'] as const)('real ProjectView→ChatPane→Composer restores a rejected file turn without replacing %s', async (draft) => {
    realChatPane.enabled = true;
    workspaceScopeMocks.ambientContext = callerContext('owner', 'team_pro');
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await flushMounts();
    await typeAndSettle('original detailed brief');
    act(() => window.dispatchEvent(new CustomEvent(STAGE_ATTACHMENT_EVENT, { detail: { attachments: [{ path: 'brief.png', name: 'brief.png', kind: 'image' }] } })));
    await waitFor(() => expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(composerText().trim()).toBe(''));
    if (draft === 'new-text') await typeAndSettle('new unsent idea');
    if (draft === 'new-file') act(() => window.dispatchEvent(new CustomEvent(STAGE_ATTACHMENT_EVENT, { detail: { attachments: [{ path: 'next.png', name: 'next.png', kind: 'image' }] } })));
    const options = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => {
      options.onRunCreated?.('real-file-limit-run');
      // Real daemon /api/runs/:id/events emits this before any model output.
      // A protocol nonce is not evidence that the original draft was consumed.
      options.handlers.onAgentEvent({ kind: 'done_key', key: 'server-issued-test-run-key' });
    });
    // The nonce frame arrives before the child starts; the later Link refusal
    // is a separate network turn, after React has stored that event.
    await flushMounts();
    await act(async () => {
      await options.handlers.onError(Object.assign(new Error('[code=tier_limit_exceeded] membership concurrency limit exceeded'), { failureDetail: 'membership_concurrency_limit' }));
    });
    expect(await screen.findByTestId('amr-concurrency-dialog')).toBeTruthy();
    await flushMounts();
    if (draft === 'empty') {
      expect(composerText()).toBe('original detailed brief');
      expect(within(screen.getByTestId('staged-attachments')).getByTitle('brief.png')).toBeTruthy();
    } else if (draft === 'new-text') {
      expect(composerText()).toBe('new unsent idea');
      expect(within(screen.queryByTestId('staged-attachments') ?? document.createElement('div')).queryByTitle('brief.png')).toBeNull();
    } else {
      expect(composerText().trim()).toBe('');
      expect(within(screen.getByTestId('staged-attachments')).getByTitle('next.png')).toBeTruthy();
      expect(within(screen.queryByTestId('staged-attachments') ?? document.createElement('div')).queryByTitle('brief.png')).toBeNull();
    }
    fireEvent.click(screen.getByTestId('amr-concurrency-close'));
    expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1);
  });

  it('VIEW-015 restores the original file draft after unknown preflight and a later structured funding refusal', async () => {
    realChatPane.enabled = true;
    workspaceScopeMocks.ambientContext = callerContext('member', 'team_pro');
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await flushMounts();
    await typeAndSettle('B workspace original detailed brief');
    act(() => window.dispatchEvent(new CustomEvent(STAGE_ATTACHMENT_EVENT, {
      detail: { attachments: [{ path: 'brief.png', name: 'brief.png', kind: 'image' }] },
    })));
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeEnabled());
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledOnce());
    // The default preflight body is unavailable/unknown. The send promise has
    // already resolved when the native child later reports the Link refusal.
    await waitFor(() => expect(screen.queryByTestId('chat-send-pending')).toBeNull());
    expect(composerText().trim()).toBe('');
    const options = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => {
      options.onRunCreated?.('funding-admission-rejected-run');
      options.handlers.onAgentEvent({ kind: 'done_key', key: 'original-native-run-nonce' });
    });
    await flushMounts();
    const refusal = Object.assign(new Error('actual Link insufficient funding'), { code: 'AMR_INSUFFICIENT_BALANCE' });
    await act(async () => { await options.handlers.onError(refusal); });
    await screen.findByTestId('amr-balance-owner-dialog');
    await waitFor(() => expect(composerText()).toBe('B workspace original detailed brief'));
    expect(within(screen.getByTestId('staged-attachments')).getByTitle('brief.png')).toBeTruthy();
    expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
    expect(mockedStreamViaDaemon).toHaveBeenCalledOnce();
    // A duplicated terminal event cannot replace the user's newer edit.
    await typeAndSettle('new unsent idea');
    await act(async () => { await options.handlers.onError(refusal); });
    await flushMounts();
    expect(composerText()).toBe('new unsent idea');
    expect(mockedStreamViaDaemon).toHaveBeenCalledOnce();
  });

  it.each(['new-text', 'new-file', 'text', 'thinking', 'tool', 'artifact', 'canceled', 'account', 'model-roundtrip', 'finished', 'unstructured'] as const)(
    'VIEW-015 funding refusal does not restore over %s', async (boundary) => {
      realChatPane.enabled = true;
      workspaceScopeMocks.ambientContext = callerContext('member', 'team_pro');
      const agents = [{ id: 'amr', name: 'amr', bin: 'vela', available: true,
        models: [{ id: 'glm-5', label: 'GLM 5' }, { id: 'deepseek-v4.1-flash', label: 'Flash' }] }] as AgentInfo[];
      const props = { project: { ...project(), pendingPrompt: null } as never, agents,
        config: { ...config, agentModels: { amr: { model: 'glm-5' } } } };
      const view = renderProjectView(props);
      await flushMounts();
      await typeAndSettle('original rejected input');
      await waitFor(() => expect(screen.getByTestId('chat-send')).toBeEnabled());
      fireEvent.click(screen.getByTestId('chat-send'));
      await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledOnce());
      await waitFor(() => expect(screen.queryByTestId('chat-send-pending')).toBeNull());
      const options = mockedStreamViaDaemon.mock.calls[0]![0];
      await act(async () => { options.onRunCreated?.('initial-run'); });
      if (boundary === 'new-text') await typeAndSettle('new unsent idea');
      if (boundary === 'new-file') act(() => window.dispatchEvent(new CustomEvent(STAGE_ATTACHMENT_EVENT, {
        detail: { attachments: [{ path: 'next.png', name: 'next.png', kind: 'image' }] },
      })));
      await act(async () => {
        if (boundary === 'text') options.handlers.onDelta('partial output');
        if (boundary === 'thinking') options.handlers.onAgentEvent({ kind: 'thinking', text: 'model work' });
        if (boundary === 'tool') options.handlers.onAgentEvent({ kind: 'tool_use', id: 'read', name: 'Read', input: {} });
        if (boundary === 'artifact') options.handlers.onAgentEvent({ kind: 'artifact_focus', open: 'index.html' });
        if (boundary === 'canceled') fireEvent.click(screen.getByRole('button', { name: 'chat.stop' }));
        if (boundary === 'account') advanceWorkspaceAccountGeneration('VIEW015-new-account');
        if (boundary === 'finished') options.handlers.onDone('completed');
      });
      if (boundary === 'model-roundtrip') {
        view.rerender(projectViewElement({ ...props,
          config: { ...config, agentModels: { amr: { model: 'deepseek-v4.1-flash' } } } }));
        await flushMounts();
        view.rerender(projectViewElement(props));
      }
      await flushMounts();
      await act(async () => { await options.handlers.onError(Object.assign(new Error('AMR_INSUFFICIENT_BALANCE'), {
        ...(boundary === 'unstructured' ? {} : { code: 'AMR_INSUFFICIENT_BALANCE' }),
      })); });
      await flushMounts();
      expect(composerText().trim()).toBe(boundary === 'new-text' ? 'new unsent idea' : '');
      if (boundary === 'new-file') expect(within(screen.getByTestId('staged-attachments')).getByTitle('next.png')).toBeTruthy();
      expect(mockedStreamViaDaemon).toHaveBeenCalledOnce();
    },
  );

  it.each([false, true])('Home auto-send only requests a route recovery after an empty actual composer witness (new text=%s)', async (typed) => {
    realChatPane.enabled = true;
    workspaceScopeMocks.ambientContext = callerContext('owner', 'team_pro');
    window.sessionStorage.setItem(`od:auto-send-first:${PROJECT_ID}`, '1');
    window.sessionStorage.setItem(`od:auto-send-prompt:${PROJECT_ID}`, 'original Home prompt');
    window.sessionStorage.setItem(`od:auto-send-attachments:${PROJECT_ID}`, JSON.stringify([{ path: 'home.png', name: 'home.png', kind: 'image' }]));
    const onRejected = vi.fn().mockReturnValue(true);
    renderProjectView({ project: { ...project(), pendingPrompt: 'original Home prompt' } as never,
      onInitialHomeRequestConcurrencyRejected: onRejected });
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    await flushMounts();
    if (typed) await typeAndSettle('new project draft');
    const options = mockedStreamViaDaemon.mock.calls[0]![0];
    await act(async () => {
      options.onRunCreated?.('home-first-request');
      options.handlers.onAgentEvent({ kind: 'done_key', key: 'server-home-run-key' });
    });
    await flushMounts();
    await act(async () => {
      await options.handlers.onError(Object.assign(new Error('actual request limit'), { failureDetail: 'membership_concurrency_limit' }));
    });
    await flushMounts();
    if (typed) {
      expect(onRejected).not.toHaveBeenCalled();
      expect(composerText()).toBe('new project draft');
    } else {
      expect(onRejected).toHaveBeenCalledOnce();
      expect(onRejected).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID,
        clientRequestId: options.clientRequestId }));
      expect(composerText()).toBe('original Home prompt');
      expect(within(screen.getByTestId('staged-attachments')).getByTitle('home.png')).toBeTruthy();
    }
  });

});
