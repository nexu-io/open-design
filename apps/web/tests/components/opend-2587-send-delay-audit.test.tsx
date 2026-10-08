// @vitest-environment jsdom
// Real ProjectView, ChatPane, ChatComposer and AMR gate; defer the billing HTTP response.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { composerText, flushMounts, typeAndSettle } from '../helpers/lexical-composer';
import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { streamViaDaemon } from '../../src/providers/daemon';
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
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';

const PROJECT_ID = 'send-latency-project';
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';
const TEAM_MEMBER = 'member-sender';
const PROMPT = '【QA 网络接收延迟模拟】请只回复收到。';

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

const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);
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

let pendingBilling: Promise<Response> | null = null;

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/workspace/billing?') && pendingBilling) return pendingBilling;
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

describe('OPEND-2587 real composer and transcript during delayed local reception', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    pendingBilling = null;
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

  async function sendWithDelayedBilling() {
    let resolveBilling!: (value: Response) => void;
    pendingBilling = new Promise((resolve) => { resolveBilling = resolve; });
    // Real balance gate + ProjectView + ChatPane + ChatComposer, deferred HTTP boundary.
    // Keep the subsequent run provider off live services.
    mockedStreamViaDaemon.mockReturnValue(new Promise(() => {}));
    renderProjectView();
    await screen.findByTestId('chat-composer-input');
    await flushMounts();
    await typeAndSettle(PROMPT);
    await waitFor(() => expect(screen.getByTestId('chat-send')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('chat-send'));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(
      ([url]) => String(url).startsWith('/api/workspace/billing?'),
    )).toBe(true));
    expect(screen.getByTestId('user-message')).toHaveTextContent(PROMPT);
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    return (status = 200) => {
      const observedAt = new Date().toISOString();
      resolveBilling(new Response(JSON.stringify({
        workspaceRuntime: {
          workspaceId: TEAM_WORKSPACE, workspaceMemberId: TEAM_MEMBER,
          status: 'fresh', observedAt,
          hardExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        authoritativeWorkspaceRead: {
          workspaceId: TEAM_WORKSPACE, workspaceMemberId: TEAM_MEMBER, observedAt,
        },
        workspaceBalance: {
          billingScopeVersion: 2, workspaceId: TEAM_WORKSPACE,
          workspaceMemberId: TEAM_MEMBER, balanceUsd: '10.00', updatedAt: observedAt,
        },
      }), { status }));
    };
  }

  it('retains the sent message during an unresolved local billing request and admits it once', async () => {
    const releaseBilling = await sendWithDelayedBilling();
    expect(composerText().trim()).toBe(PROMPT);
    // Diagnostic repeat-click witness: no second turn is submitted.
    const send = screen.queryByTestId('chat-send');
    if (send && !(send as HTMLButtonElement).disabled) fireEvent.click(send);
    expect(screen.getAllByTestId('user-message')).toHaveLength(1);
    await act(async () => releaseBilling());
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    expect(screen.getAllByTestId('user-message')).toHaveLength(1);
    expect(screen.getByTestId('user-message')).toHaveTextContent(PROMPT);
    await waitFor(() => expect(composerText().trim()).toBe(''));
    expect(screen.getByRole('button', { name: 'chat.stop' })).toBeEnabled();
    expect(screen.queryByTestId('chat-send-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-send')).not.toBeInTheDocument();
    await typeAndSettle('下一条消息');
    expect(screen.getByTestId('chat-send')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'chat.stop' })).not.toBeInTheDocument();
  });

  it('shows the existing disabled preparing action while local admission is pending', async () => {
    await sendWithDelayedBilling();
    expect(screen.queryByTestId('chat-send')).not.toBeInTheDocument();
    const pending = screen.getByTestId('chat-send-pending');
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(pending).toHaveAccessibleName('assistant.statusPreparing');
  });

  it('keeps preparing as the only action when the retained draft is cleared during admission', async () => {
    await sendWithDelayedBilling();
    await typeAndSettle('');
    expect(screen.getByTestId('chat-send-pending')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'chat.stop' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-send')).not.toBeInTheDocument();
    expect(screen.getByTestId('user-message')).toHaveTextContent(PROMPT);
  });

  it('releases preparing when the billing endpoint rejects admission', async () => {
    const releaseBilling = await sendWithDelayedBilling();
    await act(async () => releaseBilling(503));
    await waitFor(() => expect(composerText().trim()).toBe(''));
    expect(screen.queryByTestId('chat-send-pending')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'chat.stop' })).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
  });

});
