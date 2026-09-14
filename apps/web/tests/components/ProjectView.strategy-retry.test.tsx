// @vitest-environment jsdom
// Real ProjectView → ChatPane fold → actual Retry button → provider dispatch.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, type ReactNode } from 'react';
import type { DaemonStreamOptions } from '../../src/providers/daemon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import type { ChatRunStatusResponse, WorkspaceCollabContext } from '@open-design/contracts';
import type {
  AgentInfo,
  AppConfig,
  ChatMessage,
  Conversation,
  Project,
} from '../../src/types';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const checkAmrBalanceGate = vi.fn();
const fetchBrands = vi.fn();


const workspaceScopeMocks = vi.hoisted(() => {
  const personalContext = (): WorkspaceCollabContext => ({
    workspaceId: 'workspace-personal',
    workspaceMemberId: 'member-personal',
    workspaceType: 'personal',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 1,
      usedSeats: 1,
      availableSeats: 0,
      isSeatFull: true,
    },
    permissions: {
      canManageMembers: true,
      canManageBilling: true,
      canInviteMembers: true,
      canManageAutoRecharge: true,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: true,
    },
  } as WorkspaceCollabContext);
  return {
    personalContext,
    ambientContext: null as WorkspaceCollabContext | null,
    projectScope: {
      loading: false,
      scope: {
        kind: 'personal' as const,
        projectId: 'project-1',
        workspaceId: 'workspace-personal',
        visibility: 'personal' as const,
        context: personalContext(),
      },
    } as ProjectWorkspaceScopeState,
  };
});

const projectCollabMocks = vi.hoisted(() => ({
  viewerOnly: false,
  writerAuthority: 'allowed' as 'allowed' | 'denied' | 'pending',
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: vi.fn(), newRequestId: () => 'retry-click-request' }),
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
  lastResolvedTeamProjects: () => [],
  lastResolvedWorkspaceContext: () => workspaceScopeMocks.ambientContext,
  workspaceIdentityCanBillAmr: (state: { context: unknown; loading: boolean }) =>
    state.context !== null || state.loading,
  useWorkspaceBilling: () => null,
}));

vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: () => workspaceScopeMocks.projectScope,
}));

vi.mock('../../src/collab/useProjectCollab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectCollab')>()),
  useProjectCollab: () => ({
    enabled: false,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: 'local_only',
    viewerOnly: projectCollabMocks.viewerOnly,
    isOwner: true,
    writerAuthority: projectCollabMocks.writerAuthority,
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: vi.fn(),
    requestPublish: vi.fn(),
    refreshPresence: vi.fn(),
    checkStatusNow: vi.fn(),
    applyContentTransferState: vi.fn(),
  }),
}));

vi.mock('../../src/providers/daemon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/daemon')>()),
  GENERIC_DAEMON_DISCONNECT_CODE: 'GENERIC_DAEMON_DISCONNECT',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
  // 拦截档的弹窗是真的渲染出来的,它要的 provider 得给全。
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  formatVelaBalanceUsd: (value: string | null) => `$${value ?? '0'}`,
  fetchVelaLoginStatus: vi.fn().mockResolvedValue({ loggedIn: true }),
  startVelaLogin: vi.fn(),
  cancelVelaLogin: vi.fn(),
  canUpgradeVelaPlan: vi.fn().mockReturnValue(false),
  launchAntigravityOauth: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>()),
  checkAmrBalanceGate: (...args: unknown[]) => checkAmrBalanceGate(...args),
}));

vi.mock('../../src/runtime/brands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/brands')>()),
  fetchBrands: (...args: unknown[]) => fetchBrands(...args),
}));

vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/registry')>()),
  deletePreviewComment: vi.fn(),
  fetchDesignSystem: vi.fn(),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: vi.fn(),
  getTemplate: vi.fn(),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/state/projects')>()),
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: vi.fn(),
  patchProject: vi.fn(),
  persistTabsToDaemonNow: vi.fn(),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: vi.fn(),
  cacheTabsLocally: (_projectId: string, state: unknown) => state,
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/Loading', () => ({ CenteredLoader: () => null }));
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => <div data-testid="file-workspace" />,
}));

// These are unrelated presentation leaves. ProjectView, ChatPane, folding,
// the error card and its real Retry action/callback remain production code.
vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => <div>{message.content}</div>,
}));
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

const project: Project = {
  id: 'project-1',
  name: 'Project',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const conversation: Conversation = {
  id: 'conv-a',
  projectId: project.id,
  title: 'A',
  createdAt: 1,
  updatedAt: 1,
};

/** 本地 CLI:不走 AMR 预检,门控那一层看得最干净。 */
const localConfig: AppConfig = {
  mode: 'daemon',
  apiProtocol: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: 'agent-1',
  agentModels: {},
  skillId: null,
  designSystemId: null,
};

const agents = [
  { id: 'agent-1', name: 'OpenCode', bin: 'opencode', available: true, models: [] },
  { id: 'amr', name: 'OpenDesign Cloud', available: true, models: [] },
] as unknown as AgentInfo[];

function renderProjectView(config: AppConfig = localConfig) {
  return render(
    <ProjectView
      project={project}
      routeFileName={null}
      config={config}
      agents={agents}
      skills={[]}
      designTemplates={[]}
      designSystems={[]}
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
    />,
  );
}

const TASK_ID = 'task-original';
const originalUser: ChatMessage = {
  id: 'original-user', role: 'user', createdAt: 1,
  content: '做一个简洁的 SaaS 落地页，包含 ROI 计算器和一个 CTA。',
};
const requestAssistant: ChatMessage = {
  id: 'request-assistant', role: 'assistant', createdAt: 2,
  content: 'The plan is ready.', agentId: 'agent-1',
  runId: 'request-run', runStatus: 'succeeded',
  strategyTaskExecutionId: TASK_ID, strategyTaskRunIndex: 0,
};
const productionAssistant: ChatMessage = {
  id: 'production-assistant', role: 'assistant', createdAt: 3,
  content: 'Production did not finish.', agentId: 'agent-1',
  runId: 'production-run', runStatus: 'failed',
  strategyTaskExecutionId: TASK_ID, strategyTaskRunIndex: 1,
  events: [{
    kind: 'status', label: 'error', detail: 'ACP response timed out',
    code: 'AGENT_EXECUTION_FAILED', failureDetail: 'inactivity_timeout',
  }],
};
let conversationMessages: ChatMessage[];

function persistedRunStatus(runId: string): ChatRunStatusResponse | null {
  const message = conversationMessages.find((row) => row.runId === runId);
  if (!message?.runStatus) return null;
  const taskId = message.strategyTaskExecutionId;
  // Task projection belongs to this Run's task, not the conversation's tail.
  // In the cross-task control, the old request therefore stays completed on
  // request-run while different-task is blocked on production-run.
  const taskTail = taskId
    ? conversationMessages.filter((row) => row.strategyTaskExecutionId === taskId).at(-1)
    : undefined;
  return {
    id: runId,
    projectId: project.id,
    conversationId: conversation.id,
    assistantMessageId: message.id,
    agentId: message.agentId ?? null,
    status: message.runStatus,
    createdAt: message.createdAt ?? 1,
    updatedAt: message.createdAt ?? 1,
    ...(taskId && taskTail?.runId ? {
      strategyTask: {
        taskExecutionId: taskId,
        strategy: {
          id: 'od-next-strategy', version: '2.0.0',
          packageHash: 'b'.repeat(64), snapshotId: `snapshot-${taskId}`,
        },
        inputStage: (taskTail.strategyTaskRunIndex ?? 0) > 0 ? 'production' : 'request',
        outcome: taskTail.runStatus === 'failed' ? 'blocked' : 'completed',
        route: (taskTail.strategyTaskRunIndex ?? 0) > 0 ? 'full_plan' : 'direct_edit',
        executionMode: 'simple',
        activeRunId: taskTail.runId,
        terminal: true,
      },
    } : {}),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  conversationMessages = structuredClone([originalUser, requestAssistant, productionAssistant]);
  workspaceScopeMocks.ambientContext = workspaceScopeMocks.personalContext();
  projectCollabMocks.viewerOnly = false;
  projectCollabMocks.writerAuthority = 'allowed';
  listConversations.mockResolvedValue([conversation]);
  createConversation.mockResolvedValue(conversation);
  listMessages.mockImplementation(async () => conversationMessages);
  fetchPreviewComments.mockResolvedValue([]);
  fetchProjectFiles.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchBrands.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], active: null });
  // A null response injects a status-lookup outage: ProjectView probes even
  // succeeded task predecessors and would mark them failed. Keep that separate
  // failure out of this retry-ownership regression.
  fetchChatRunStatus.mockImplementation(async (runId: string) => persistedRunStatus(runId));
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  saveMessage.mockResolvedValue(null);
  // The witness is the actual provider call, not a synthetic callback from a
  // mocked ChatPane. Keep dispatch unresolved until the test unmounts.
  streamViaDaemon.mockImplementation(() => new Promise<void>(() => {}));
  checkAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function clickRetry() {
  const retry = await screen.findByTestId('chat-error-retry');
  // Wait for the actionability the real host publishes, not merely a loaded
  // message or a callback that existed before workspace/history settled.
  await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByTestId('chat-error-actions-blocked')).toBeNull();
  for (const predecessor of conversationMessages.filter((row) =>
    row.role === 'assistant' && row.runStatus === 'succeeded' && row.strategyTaskExecutionId,
  )) {
    await waitFor(() => expect(fetchChatRunStatus).toHaveBeenCalledWith(
      predecessor.runId, expect.any(Object),
    ));
    // Drain the resolved status probe before clicking; a transient render with
    // the intended fixture is not sufficient if hydration later downgrades it.
    await act(async () => {});
    const savedRequestRows = saveMessage.mock.calls
      .map((call) => call[2] as ChatMessage)
      .filter((row) => row?.id === predecessor.id);
    expect(savedRequestRows.every((row) => row.runStatus === 'succeeded')).toBe(true);
  }
  expect(streamViaDaemon).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(retry); });
}

function expectOriginalDispatch(user: ChatMessage) {
  const options = streamViaDaemon.mock.calls[0]?.[0] as DaemonStreamOptions;
  expect(options).toMatchObject({
    projectId: project.id, conversationId: conversation.id, userMessageId: user.id,
  });
  expect(options.history.at(-1)).toMatchObject({ id: user.id, role: 'user', content: user.content });
  expect(options.assistantMessageId).toEqual(expect.any(String));
  expect(conversationMessages.map((row) => row.id)).not.toContain(options.assistantMessageId);
  expect(options.clientRequestId).toEqual(expect.any(String));
  expect(options.clientRequestId?.length).toBeGreaterThan(0);
}

describe('strategy retry through ProjectView and the real ChatPane', () => {
  it('retries a folded failed production using its original user and a fresh assistant', async () => {
    renderProjectView();
    await clickRetry();
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expectOriginalDispatch(originalUser);
    const options = streamViaDaemon.mock.calls[0]![0] as DaemonStreamOptions;
    expect(options.analyticsHints).toMatchObject({
      recoveryActionType: 'manual_retry', sourceRunId: productionAssistant.runId,
    });
    // Resolving the action must not mutate either persisted process verdict.
    expect(conversationMessages[1]?.runStatus).toBe('succeeded');
    expect(conversationMessages[2]?.runStatus).toBe('failed');
  });

  it('still sends one ordinary single-run retry through the same real button', async () => {
    conversationMessages = [originalUser, {
      ...productionAssistant, strategyTaskExecutionId: undefined, strategyTaskRunIndex: undefined,
    }];
    renderProjectView();
    await clickRetry();
    await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
    expectOriginalDispatch(originalUser);
  });

  it.each(['request', 'production'] as const)(
    'retries again after a new strategy task fails during %s, preserving the original failed attempt',
    async (failedStage) => {
      // Hydrate the history after the first manual Retry has itself failed.
      // ProjectView preserves A's entire attempt, while the normal run POST
      // creates a distinct task B: no strategy task continuation ID is sent.
      // These are persisted HTTP-boundary rows, not a claimed live daemon run.
      const retryRequest: ChatMessage = {
        ...requestAssistant,
        id: 'retry-request-assistant', runId: 'retry-request-run', createdAt: 4,
        strategyTaskExecutionId: 'task-retry', strategyTaskRunIndex: 0,
        ...(failedStage === 'request' ? {
          runStatus: 'failed', content: 'The retry request did not finish.',
          events: structuredClone(productionAssistant.events),
        } : {}),
      };
      const retryProduction: ChatMessage = {
        ...productionAssistant,
        id: 'retry-production-assistant', runId: 'retry-production-run', createdAt: 5,
        strategyTaskExecutionId: 'task-retry', strategyTaskRunIndex: 1,
      };
      conversationMessages.push(retryRequest);
      if (failedStage === 'production') conversationMessages.push(retryProduction);
      const failedRetry = failedStage === 'request' ? retryRequest : retryProduction;
      const physicalVerdicts = conversationMessages.map((row) => [row.id, row.runStatus]);

      renderProjectView();
      await clickRetry();
      await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
      expectOriginalDispatch(originalUser);
      const options = streamViaDaemon.mock.calls[0]![0] as DaemonStreamOptions;
      expect(options.analyticsHints).toMatchObject({
        recoveryActionType: 'manual_retry', sourceRunId: failedRetry.runId,
      });
      expect(conversationMessages.map((row) => [row.id, row.runStatus])).toEqual(physicalVerdicts);
      expect(screen.getAllByText(/The plan is ready/).length).toBeGreaterThan(0);
    },
  );

  it('does not skip an unrelated successful task to find an older user', async () => {
    conversationMessages = [originalUser, requestAssistant, {
      ...productionAssistant, strategyTaskExecutionId: 'different-task', strategyTaskRunIndex: 0,
    }];
    renderProjectView();
    await clickRetry();
    expect(streamViaDaemon).not.toHaveBeenCalled();
  });

  it.each(['user', 'completed response'] as const)(
    'does not offer the old failed task as the retry target after a newer %s',
    async (tail) => {
      conversationMessages.push({ id: 'newer-user', role: 'user', content: 'A separate request.', createdAt: 4 });
      if (tail === 'completed response') {
        conversationMessages.push({
          id: 'newer-assistant', role: 'assistant', content: 'A separate result.',
          runId: 'newer-run', runStatus: 'succeeded', createdAt: 5,
        });
      }
      renderProjectView();
      await screen.findByText(tail === 'user' ? 'A separate request.' : 'A separate result.');
      expect(screen.queryByTestId('chat-error-retry')).toBeNull();
      expect(streamViaDaemon).not.toHaveBeenCalled();
    },
  );
});
