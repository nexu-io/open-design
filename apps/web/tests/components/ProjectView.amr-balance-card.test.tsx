// @vitest-environment jsdom
//
// 红测:余额判定的**呈现**改了口径 —— 产品 2026-08-26 裁决
// 「告警可继续的不弹窗,只有卡片;余额不足再弹窗」。
//
//   拦截档(余额耗尽)     → 弹窗**保留**,**同时**也出卡片。
//   空钱包但硬拦让了位     → 只出卡片,不弹窗、不挡发送(T55 的兜底档)。
//
// ⚠️ **原来还有第三档「告警档」(余额 > 0 但撑不住下一轮),已经整档撤掉。**
// 产品 2026-09-07 原话「这个要不先不要了,跟产品说了一下,不要这个了」——
// 余额 `> 0` 现在一律 `allow`,什么都不出。见规格 **T66**,红测在
// `tests/components/t66-low-balance-tier-retired.test.tsx`。
//
// 这一层管的是「判定结果怎么呈现」,判定本身在 `runtime/amr-balance-gate.ts`;
// 「付费档余额 0 = 不限量,不拦」是另一条已定口径(#7190),属于判定不属于呈现,
// 这里只保证这张卡**不会把判定放行的人重新拦回去**。
//
// `ChatPane` 在这一层是 mock 的(它自带半个应用),所以这里断言的是
// **ProjectView 把哪份数据交给了 ChatPane** + 弹窗的去留。
// 「ChatPane 拿到这份数据之后真的画出了那张卡」由
// `tests/components/chat/ChatPane.wired-cards.test.tsx` 从真实 ChatPane 断言,
// 两段靠同一个 prop 名(typecheck 保证)接在一起。

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import { ChatComposer, STAGE_ATTACHMENT_EVENT } from '../../src/components/ChatComposer';
import { composerText, flushMounts, typeAndSettle } from '../helpers/lexical-composer';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { currentWorkspaceSendTarget, notifyWorkspaceContextRefresh, resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { handoffAmrSendPreflight } from '../../src/runtime/amr-send-preflight';
import { fetchVelaLoginStatus, streamViaDaemon } from '../../src/providers/daemon';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
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
const useRealComposer = vi.hoisted(() => ({ value: false }));
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
vi.mock('../../src/components/ChatPane', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/components/ChatPane')>()),
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
    streaming?: boolean;
    onStop?: () => void;
    queuedItems?: Array<{ prompt: string }>;
    amrBalanceCardUsd?: number | null;
    amrBalanceCardAnchorMessageId?: string | null;
    onSend?: ComponentProps<typeof ChatComposer>['onSend'];
  }) => {
    chatPaneSpy(props);
    return (
      <div>
        <div data-testid="active-conversation">{props.activeConversationId ?? ''}</div>
        <div data-testid="amr-balance-card-prop">
          {props.amrBalanceCardUsd == null ? 'none' : String(props.amrBalanceCardUsd)}
        </div>
        {/* T61:读数是替哪一轮取的。`none` = 没有轮次可锚,落在流水末尾。 */}
        <div data-testid="amr-balance-anchor-prop">
          {props.amrBalanceCardAnchorMessageId ?? 'none'}
        </div>
        {/* 这一轮的助手消息 id —— 断言锚点指的就是它,而不是随便一条。 */}
        <div data-testid="last-assistant-id">
          {[...(props.messages ?? [])].reverse().find((m) => m.role === 'assistant')?.id ?? ''}
        </div>
        {useRealComposer.value ? <ChatComposer
          projectId={PROJECT_ID} projectFiles={[]} skills={[]}
          streaming={props.streaming ?? false} onStop={props.onStop ?? (() => {})}
          onEnsureProject={async () => PROJECT_ID}
          onSend={props.onSend ?? (() => {})}
        /> : null}
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

function resolvedTeamScope(context: WorkspaceCollabContext): ProjectWorkspaceScopeState {
  return {
    loading: false,
    scope: {
      kind: 'team', projectId: PROJECT_ID, workspaceId: context.workspaceId,
      visibility: 'team', context: { ...context, workspaceType: 'team' },
    },
  };
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

describe('server send preflight preserves composer and target', () => {
  beforeEach(() => {
    resourceContextObservations.length = 0;
    useRealComposer.value = false;
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    resetWorkspaceAccountGeneration();

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

  it.each(['owner', 'admin', 'member'] as const)('authoritative insufficient blocks %s before run transport and returns the original composer payload for manual retry', async (role) => {
    const context = { ...CALLER_CONTEXT, role, permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }) };
    workspaceScopeMocks.ambientContext = context;
    workspaceScopeMocks.projectScope = resolvedTeamScope(context);
    let funding = 'insufficient';
    const preflights: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/workspace/billing/send-preflight')) {
        preflights.push(url);
        const request = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ schemaVersion: 1, requestId: 'server', ...request, decision: funding === 'insufficient' ? 'reject' : 'proceed', ...(funding === 'insufficient' ? { reason: 'insufficient_funds' } : {}) }));
      }
      return new Response('{}');
    }));
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await waitFor(() => expect(screen.getByTestId('normal-send')).not.toBeDisabled());
    const send = () => chatPaneSpy.mock.calls.at(-1)![0].onSend;
    const attachments = [{ path: 'attachments/design.png', name: 'design.png', kind: 'image', size: 1 }];
    let outcome: unknown;
    await act(async () => { outcome = await send()('keep my exact draft', attachments, []); });
    expect(outcome).toBe('restore-draft');
    expect(vi.mocked(saveMessage)).not.toHaveBeenCalled();
    expect(preflights).toHaveLength(1);
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    expect(chatPaneSpy.mock.calls.at(-1)![0].queuedItems ?? []).toHaveLength(0);
    expect(chatPaneSpy.mock.calls.at(-1)![0].messages.some((m: ChatMessage) => m.content === 'keep my exact draft')).toBe(false);
    // A second click still checks the same principal afresh; a denial is not a reusable positive.
    await act(async () => { outcome = await send()('keep my exact draft', attachments, []); });
    expect(outcome).toBe('restore-draft');
    expect(preflights).toHaveLength(2);
    funding = 'available';

    await act(async () => { await Promise.resolve(); });
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    await act(async () => { outcome = await send()('keep my exact draft', attachments, []); });
    expect(outcome).toBeUndefined();
    expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1);
    expect(mockedStreamViaDaemon.mock.calls[0]![0]).toMatchObject({ attachments: attachments.map((attachment) => attachment.path) });
  });


  it.each(['text and attachment', 'attachment only'] as const)('restores real composer %s after a refusal and does not duplicate a rapid Send', async (payload) => {
    useRealComposer.value = true;
    workspaceScopeMocks.projectScope = resolvedTeamScope(CALLER_CONTEXT);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/workspace/billing/send-preflight')) {
        const request = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ schemaVersion: 1, requestId: 'server', ...request, decision: 'reject', reason: 'insufficient_funds' }));
      }
      return new Response('{}');
    }));
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await waitFor(() => expect(screen.getByTestId('normal-send')).not.toBeDisabled());
    await flushMounts();
    if (payload === 'text and attachment') await typeAndSettle('preserve text and file');
    act(() => window.dispatchEvent(new CustomEvent(STAGE_ATTACHMENT_EVENT, {
      detail: { attachments: [{ path: 'design.png', name: 'design.png', kind: 'image' }] },
    })));
    expect(screen.getByRole('button', { name: 'chat.attachments.preview' })).toBeTruthy();
    const submit = screen.getByTestId('chat-send');
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByTestId('chat-send-pending')).toBeNull());
    await waitFor(() => expect(composerText().trim()).toBe(payload === 'text and attachment' ? 'preserve text and file' : ''));
    expect(screen.getByRole('button', { name: 'chat.attachments.preview' })).toBeTruthy();
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    expect(chatPaneSpy.mock.calls.at(-1)![0].queuedItems ?? []).toHaveLength(0);
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes('/api/workspace/billing/send-preflight'))).toHaveLength(1);
  });


  it.each(['model', 'workspace', 'account', 'stop', 'unmount'] as const)('never starts a run when %s changes while the exact funding check is pending', async (change) => {
    workspaceScopeMocks.projectScope = resolvedTeamScope(CALLER_CONTEXT);
    let resolve!: (value: Response) => void;
    let request: Record<string, unknown> = {};
    const fetchFunding = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/workspace/billing/send-preflight')) {
        request = JSON.parse(String(init?.body));
        fetchFunding();
        return new Promise<Response>((settle) => { resolve = settle; });
      }
      return new Response('{}');
    }));
    const view = renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await waitFor(() => expect(screen.getByTestId('normal-send')).not.toBeDisabled());
    let pending!: Promise<unknown>;
    act(() => { pending = chatPaneSpy.mock.calls.at(-1)![0].onSend('pending draft', [], []); });
    await waitFor(() => expect(fetchFunding).toHaveBeenCalledTimes(1));
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    if (change === 'model') view.rerender(projectViewElement({ project: { ...project(), pendingPrompt: null } as never, config: { ...config, agentModels: { amr: { model: 'different-model' } } } }));
    if (change === 'workspace') {
      const context = { ...CALLER_CONTEXT, workspaceId: 'other-workspace' };
      workspaceScopeMocks.projectScope = resolvedTeamScope(context);
      workspaceScopeMocks.ambientContext = context;
      view.rerender(projectViewElement({ project: { ...project(), pendingPrompt: null, workspaceId: 'other-workspace' } as never }));
    }
    if (change === 'account') advanceWorkspaceAccountGeneration('new-account');
    if (change === 'stop') act(() => chatPaneSpy.mock.calls.at(-1)![0].onStop());
    if (change === 'unmount') view.unmount();
    await act(async () => {
      resolve(new Response(JSON.stringify({ schemaVersion: 1, requestId: 'server', ...request, decision: 'proceed' })));
      await pending;
    });
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
  });


  it.each(['unknown', 'unavailable'] as const)('keeps backend admission when preflight is %s rather than inventing a financial refusal', async (funding) => {
    workspaceScopeMocks.projectScope = resolvedTeamScope(CALLER_CONTEXT);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/workspace/billing/send-preflight')) {
        return new Response(JSON.stringify({ preflight: {
          schemaVersion: 1, workspaceId: TEAM_WORKSPACE, workspaceMemberId: TEAM_MEMBER,
          modelId: null, generatedAt: new Date().toISOString(), fundingCheck: 'unknown',
        } }), { status: funding === 'unavailable' ? 503 : 200 });
      }
      return new Response('{}');
    }));
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await waitFor(() => expect(screen.getByTestId('normal-send')).not.toBeDisabled());
    await act(async () => { await chatPaneSpy.mock.calls.at(-1)![0].onSend('backend decides', [], []); });
    expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1);
  });


  it('confirmed unauthenticated uses the existing sign-in dialog without a wallet prerequisite', async () => {
    vi.mocked(fetchVelaLoginStatus).mockResolvedValue({ loggedIn: false } as never);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/billing/send-preflight') ? Response.json({ error: 'unauthenticated' }, { status: 401 }) : Response.json({})));
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await waitFor(() => expect(screen.getByTestId('normal-send')).toBeEnabled());
    await act(async () => { await chatPaneSpy.mock.calls.at(-1)![0].onSend('keep auth draft', [], []); });
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    await screen.findByTestId('amr-balance-dialog');
    expect(mockedCheckAmrBalanceGate).not.toHaveBeenCalled();
  });
  it('uses the persisted bound target even when display scope is unavailable', async () => {
    const requests: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => { requests.push(JSON.parse(String(init?.body))); return new Response('{}', { status: 503 }); }));
    workspaceScopeMocks.projectScope = { loading: false, scope: { kind: 'unavailable', projectId: PROJECT_ID, workspaceId: TEAM_WORKSPACE, context: null } } as never;
    workspaceScopeMocks.ambientContext = { ...CALLER_CONTEXT, workspaceId: 'navbar-other' };
    renderProjectView({ project: { ...project(), pendingPrompt: null } as never });
    await waitFor(() => expect(screen.getByTestId('normal-send')).toBeEnabled());
    await act(async () => { await chatPaneSpy.mock.calls.at(-1)![0].onSend('bound task', [], []); });
    expect(requests).toEqual([expect.objectContaining({ workspaceId: TEAM_WORKSPACE })]);
    expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1);
  });

  it.each(['model', 'account'] as const)('consumes stale Home %s intent without automatic replay or cross-account draft exposure', async change => {
    workspaceScopeMocks.projectScope = resolvedTeamScope(CALLER_CONTEXT);
    const attachment = { path: 'original-home.txt', name: 'original-home.txt', kind: 'file' };
    window.sessionStorage.setItem(`od:auto-send-first:${PROJECT_ID}`, '1');
    window.sessionStorage.setItem(`od:auto-send-attachments:${PROJECT_ID}`, JSON.stringify([attachment]));
    let finish!: (value: Response) => void;
    let request: Record<string, unknown> = {};
    const previews = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/billing/send-preflight')) {
        request = JSON.parse(String(init?.body)); previews();
        return new Promise<Response>(resolve => { finish = resolve; });
      }
      return Response.json({});
    }));
    const view = renderProjectView();
    await waitFor(() => expect(previews).toHaveBeenCalledTimes(1));
    if (change === 'model') view.rerender(projectViewElement({ config: { ...config, agentModels: { amr: { model: 'new-model' } } } }));
    else advanceWorkspaceAccountGeneration('new-home-principal');
    await act(async () => { finish(Response.json({ schemaVersion: 1, requestId: 'server', ...request, decision: 'proceed' })); });
    await waitFor(() => expect(window.sessionStorage.getItem(`od:auto-send-first:${PROJECT_ID}`)).toBeNull());
    await waitFor(() => expect(chatPaneSpy.mock.calls.at(-1)![0].queuedItems).toHaveLength(change === 'model' ? 1 : 0));
    const manual = JSON.parse(window.localStorage.getItem(`od:chat-queued-sends:${PROJECT_ID}:v1`) ?? '[]');
    expect(manual).toEqual(change === 'model' ? [expect.objectContaining({ prompt: SEED_PROMPT, attachments: [attachment], manualStartOnly: true })] : []);
    await flushMounts();
    expect(previews).toHaveBeenCalledTimes(1);
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
  });

  it.each(['model', 'account'] as const)('rejects a Home stage already stale before the first Project attempt (%s)', async change => {
    workspaceScopeMocks.projectScope = resolvedTeamScope(CALLER_CONTEXT);
    notifyWorkspaceContextRefresh({ context: CALLER_CONTEXT });
    const target = currentWorkspaceSendTarget()!;
    const attachment = { path: 'before-first.txt', name: 'before-first.txt', kind: 'file' };
    window.sessionStorage.setItem(`od:auto-send-first:${PROJECT_ID}`, '1');
    window.sessionStorage.setItem(`od:auto-send-attachments:${PROJECT_ID}`, JSON.stringify([attachment]));
    handoffAmrSendPreflight(PROJECT_ID, { clientRequestId: 'original-home-attempt', workspaceId: target.workspaceId,
      accountGeneration: target.accountGeneration, targetRevision: target.selectionRevision, modelId: change === 'model' ? 'previous-model' : null });
    if (change === 'account') advanceWorkspaceAccountGeneration('changed-before-first-project-attempt');
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({})); vi.stubGlobal('fetch', fetch);
    renderProjectView();
    await waitFor(() => expect(window.sessionStorage.getItem(`od:auto-send-first:${PROJECT_ID}`)).toBeNull());
    await flushMounts();
    expect(fetch.mock.calls.filter(([input]) => String(input).includes('/billing/send-preflight'))).toHaveLength(0);
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    const queued = JSON.parse(window.localStorage.getItem(`od:chat-queued-sends:${PROJECT_ID}:v1`) ?? '[]');
    expect(queued).toEqual(change === 'model' ? [expect.objectContaining({ prompt: SEED_PROMPT, attachments: [attachment], manualStartOnly: true })] : []);
  });

});
