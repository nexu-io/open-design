// @vitest-environment jsdom
//
// 红测 · OPEND-2600 的**呈现**那一半。
//
// 判定层给出 `soft` 之后,`ProjectView` 还有一道 `if (isPaidAmrPlan(plan))`
// 过滤才把卡交给 `ChatPane`。两头一夹,个人工作区在两个档位下都拿不到卡:
//
//   付费档 → 判定层早退,`soft` 根本算不出来(判定层红测见
//            `tests/runtime/w116-amr-low-balance-all-tiers.test.ts`)
//   免费档 → 判定层算得出 `soft`,但呈现层被 `isPaidAmrPlan` 挡掉
//
// 产品裁决(2026-09-03):提醒对**所有档位**可见,呈现层那道过滤删掉。
// 另外一条红线:软提醒不许拖慢运行 —— 出这张卡**不许多等一次网络往返**。
// 下面用「把套餐读数吊死也照样出卡、照样跑起来」来量这一条。
//
// `ChatPane` 在这一层是 mock 的(它自带半个应用),断言的是 **ProjectView 把
// 哪份数据交给了 ChatPane**;「ChatPane 拿到之后真的画出那张卡」由
// `tests/components/chat/ChatPane.wired-cards.test.tsx` 从真实 ChatPane 断言。

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
import { resolveAmrPlan } from '../../src/runtime/amr-low-balance-plan';
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

const PROJECT_ID = 'opend-2600-project';
/** QA 报的是**个人**工作区。 */
const PERSONAL_WORKSPACE = 'ws-personal-opend-2600';
const PERSONAL_MEMBER = 'wm-personal-opend-2600';
/** QA 报的余额。 */
const REPORTED_BALANCE = '1.79';

const CALLER_CONTEXT: WorkspaceCollabContext = {
  workspaceId: PERSONAL_WORKSPACE,
  workspaceType: 'personal',
  workspaceMemberId: PERSONAL_MEMBER,
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'personal_pro',
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
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

// 套餐读数在这一层是**可观测的**:这次要证明呈现层不再依赖它。
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
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: {
    activeConversationId?: string | null;
    sendDisabled?: boolean;
    amrBalanceCardUsd?: number | null;
    onSend?: (prompt: string, attachments: [], commentAttachments: []) => unknown;
  }) => (
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
    </div>
  ),
}));

const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);
const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const mockedResolveAmrPlan = vi.mocked(resolveAmrPlan);
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
  name: 'OPEND-2600',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  metadata: { kind: 'prototype' },
  workspaceId: PERSONAL_WORKSPACE,
} as Project);

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

/** 一份可用的钱包读数;套餐字段由 `resolveAmrPlan` 那一路决定,不从这里读。 */
const snapshot = (balanceUsd: string): AmrWalletSnapshot => ({
  status: 'available',
  profile: 'prod',
  user: { id: 'u1', email: 'user@example.com' },
  balanceUsd,
  updatedAt: null,
  fetchedAt: new Date().toISOString(),
  stale: false,
  source: 'vela_api',
});

async function sendOnce(gate: Awaited<ReturnType<typeof checkAmrBalanceGate>>) {
  mockedCheckAmrBalanceGate.mockResolvedValue(gate as never);
  renderProjectView();
  // 按钮一渲染就在,但流水还在加载 —— 那段时间 `sendDisabled` 是真的,按下去
  // 什么都不会发生,后面每一条断言都只是赢在「什么都还没发生」上。CI 上慢过
  // 几毫秒就整条判定路都走不到(实测阈值在 1ms 和 5ms 之间)。先等它可用。
  await screen.findByTestId('normal-send');
  await waitFor(() =>
    expect((screen.getByTestId('normal-send') as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(screen.getByTestId('normal-send'));
}

describe('OPEND-2600 · 低余额卡对所有档位可见', () => {
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
    mockedResolveAmrPlan.mockResolvedValue('pro');
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

  it.each(['free', 'pro', 'plus', 'max', 'go'])(
    '%s 档拿到告警判定时都要出卡',
    async (plan) => {
      mockedResolveAmrPlan.mockResolvedValue(plan);

      await sendOnce({ kind: 'soft', snapshot: snapshot(REPORTED_BALANCE) });

      await waitFor(() =>
        expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('1.79'),
      );
      // 提醒 ≠ 拦截:这一次发送照常跑完。
      await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    },
  );

  it('套餐读不出来(null 档)也要出卡 —— 这一档不能掉进缝里', async () => {
    mockedResolveAmrPlan.mockResolvedValue(null);

    await sendOnce({ kind: 'soft', snapshot: snapshot(REPORTED_BALANCE) });

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('1.79'),
    );
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
  });

  it('红线:套餐读数吊死也照样出卡、照样跑起来(软提醒不许拖慢发送)', async () => {
    // 一个永远不 resolve 的套餐读数 = 一次挂住的网络往返。
    mockedResolveAmrPlan.mockReturnValue(new Promise<string | null>(() => {}));

    await sendOnce({ kind: 'soft', snapshot: snapshot(REPORTED_BALANCE) });

    await waitFor(() =>
      expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('1.79'),
    );
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
  });

  it('红线:告警这一路一次套餐读数都不发', async () => {
    await sendOnce({ kind: 'soft', snapshot: snapshot(REPORTED_BALANCE) });

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(mockedResolveAmrPlan).not.toHaveBeenCalled();
  });

  it('反向对照:判定放行时不出卡,也不发套餐读数', async () => {
    await sendOnce({ kind: 'allow' });

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(screen.getByTestId('amr-balance-card-prop').textContent).toBe('none');
    expect(mockedResolveAmrPlan).not.toHaveBeenCalled();
  });
});
