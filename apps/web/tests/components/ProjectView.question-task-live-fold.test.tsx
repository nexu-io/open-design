// @vitest-environment jsdom
// OPEND-2944: real ProjectView → question form → streamed task → ChatPane fold.
// The native Home case had two assistant roles live and one after reload.
// Do not infer task membership from analytics or physical run count.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, type ReactNode } from 'react';
import type { DaemonReattachOptions, DaemonStreamOptions } from '../../src/providers/daemon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import type { ChatRunStatusResponse, WorkspaceCollabContext, StrategyTaskProjectionV2 } from '@open-design/contracts';
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
const reattachDaemonRun = vi.fn();
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

vi.mock('../../src/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/i18n')>()),
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
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
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
  patchConversation: vi.fn().mockResolvedValue(null),
  patchProject: vi.fn().mockResolvedValue(null),
  persistTabsToDaemonNow: vi.fn().mockResolvedValue(undefined),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: vi.fn().mockResolvedValue(undefined),
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

// ProjectView, ChatPane, AssistantMessage and QuestionForm are all real.
// Only the unrelated composer presentation is replaced.
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

/** Match the native A2 controlled-Claude route. */
const cliConfig: AppConfig = {
  mode: 'daemon',
  apiProtocol: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: 'claude',
  agentModels: {},
  skillId: null,
  designSystemId: null,
};

const agents = [
  { id: 'claude', name: 'Claude', bin: 'claude', available: true, models: [] },
  { id: 'amr', name: 'OpenDesign Cloud', available: true, models: [] },
] as unknown as AgentInfo[];

function renderProjectView(config: AppConfig = cliConfig) {
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


const TASK_ID = 'odnext-native-home-task';
const REQUEST_ID = 'home-auto-send-native-assistant';
const FORM_ID = 'native-palette';
const FORM = `<question-form id="${FORM_ID}" title="Palette">${JSON.stringify({
  lang: 'en', submitLabel: 'Continue plan', questions: [{
    id: 'palette', label: 'Choose palette', type: 'radio', required: true,
    options: [{ label: 'Warm', value: 'warm' }, { label: 'Cool', value: 'cool' }],
  }],
})}</question-form>`;
const PREPARATION = 'Palette confirmed; prepare production.';
const WORKING = 'Native production is running.';
let conversationMessages: ChatMessage[];
let strategyEnabled: boolean;
let mappingMode: 'valid' | 'legacy' | 'wrong-run' | 'different-task';

function projection(stage: 'request' | 'clarification' | 'production', runId: string): StrategyTaskProjectionV2 {
  const mapping = [
    { runId: 'request-run', taskRunIndex: 0 },
    { runId: 'clarification-run', taskRunIndex: 1 },
    { runId: 'production-run', taskRunIndex: 2 },
  ].find((entry) => entry.runId === runId);
  return {
    taskExecutionId: mappingMode === 'different-task' && stage !== 'request' ? 'another-task' : TASK_ID,
    strategy: {
      id: 'od-next-strategy', version: '2.0.4', packageHash: 'b'.repeat(64), snapshotId: 'native-snapshot',
    },
    inputStage: stage, outcome: stage === 'request' ? 'clarification_required' : 'running',
    route: 'full_plan', executionMode: stage === 'request' ? null : 'simple',
    activeRunId: runId, terminal: false,
    ...(mappingMode === 'legacy' ? {} : { runMappings: mappingMode === 'wrong-run'
      ? [{ runId: 'unrelated-run', taskRunIndex: 9 }]
      : mapping ? [mapping] : [] }),
  };
}

function initialMessages(withStrategy: boolean): ChatMessage[] {
  const now = Date.now();
  return [{
    id: 'home-auto-send-native-user', role: 'user', content: 'Build a prototype.', createdAt: now - 3000,
  }, {
    id: REQUEST_ID, role: 'assistant', content: FORM, agentId: 'claude', agentName: 'Claude',
    runId: 'request-run', runStatus: 'succeeded', createdAt: now - 2000, startedAt: now - 2000, endedAt: now - 1000,
    events: [{ kind: 'done_key', key: 'request-key' }, { kind: 'text', text: FORM }],
    ...(withStrategy ? { strategyTaskExecutionId: TASK_ID, strategyTaskRunIndex: 0 } : {}),
  }];
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  strategyEnabled = true;
  mappingMode = 'valid';
  conversationMessages = initialMessages(true);
  workspaceScopeMocks.ambientContext = workspaceScopeMocks.personalContext();
  projectCollabMocks.viewerOnly = false;
  projectCollabMocks.writerAuthority = 'allowed';
  listConversations.mockResolvedValue([conversation]);
  createConversation.mockResolvedValue(conversation);
  listMessages.mockImplementation(async () => structuredClone(conversationMessages));
  fetchPreviewComments.mockResolvedValue([]);
  fetchProjectFiles.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchBrands.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], active: null });
  fetchChatRunStatus.mockImplementation(async (runId: string): Promise<ChatRunStatusResponse> => ({
    id: runId, projectId: project.id, conversationId: conversation.id,
    assistantMessageId: REQUEST_ID, agentId: 'claude', status: 'succeeded',
    createdAt: conversationMessages[1]?.createdAt ?? Date.now(), updatedAt: Date.now(),
    ...(strategyEnabled ? { strategyTask: projection('request', runId) } : {}),
  }));
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  saveMessage.mockImplementation(async (_project: string, _conversation: string, message: ChatMessage) => message);
  // A succeeded request whose task is parked on the user
  // (clarification_required) is sealed after the status probe, not replayed
  // (OPEND-3230). Keep a real replay payload anyway: if the host ever replays
  // it again, the form must not be erased by an undefined mock promise before
  // answerAndStartProduction rejects the replay.
  reattachDaemonRun.mockImplementation(async (options: DaemonReattachOptions) => {
    expect(options.runId).toBe('request-run');
    options.handlers.onAgentEvent({ kind: 'done_key', key: 'request-key' });
    options.handlers.onDelta(FORM);
    options.handlers.onAgentEvent({ kind: 'text', text: FORM });
    options.onRunStatus?.('succeeded');
    await options.handlers.onDone(FORM);
  });
  streamViaDaemon.mockImplementation(() => new Promise<void>(() => {}));
  checkAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function answerAndStartProduction() {
  if (strategyEnabled) {
    // Let hydration's daemon task probe for the parked request settle before
    // answering, so the answer races neither the probe nor a replay.
    await waitFor(() => expect(fetchChatRunStatus.mock.calls.map((call) => call[0])).toContain('request-run'));
    await act(async () => {
      await Promise.allSettled(fetchChatRunStatus.mock.results.map((result) => result.value));
    });
    await act(async () => {});
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  }
  expect(streamViaDaemon).not.toHaveBeenCalled();
  const warm = await screen.findByRole('radio', { name: 'Warm' });
  fireEvent.click(warm);
  const submit = screen.getByRole('button', { name: 'Continue plan' });
  await waitFor(() => expect(submit).toHaveProperty('disabled', false));
  fireEvent.click(submit);
  await waitFor(() => expect(streamViaDaemon).toHaveBeenCalledTimes(1));
  const options = streamViaDaemon.mock.calls[0]![0] as DaemonStreamOptions;
  expect(options.history.at(-1)?.content).toContain(`[form answers — ${FORM_ID}]`);
  expect(options.taskExecutionId).toBe(strategyEnabled ? TASK_ID : undefined);
  await act(async () => {
    options.onRunCreated?.('clarification-run', strategyEnabled ? projection('clarification', 'clarification-run') : undefined);
    options.onRunStatus?.('running');
    options.handlers.onAgentEvent({ kind: 'done_key', key: 'clarification-key' });
    options.handlers.onDelta(`${PREPARATION}\n`);
    options.handlers.onAgentEvent({ kind: 'text', text: `${PREPARATION}\n` });
    // The production callback is the provider's existing successor boundary;
    // no invented taskRunIndex is passed by this fixture.
    if (strategyEnabled) {
      options.onRunCreated?.('production-run', projection('production', 'production-run'));
      options.onRunStatus?.('running');
      options.handlers.onAgentEvent({ kind: 'done_key', key: 'production-key' });
    }
    options.handlers.onDelta(WORKING);
    options.handlers.onAgentEvent({ kind: 'text', text: WORKING });
  });
  await screen.findByText(WORKING, { exact: false });
  return options;
}

function expectAnswerOwnership() {
  const summary = screen.getByTestId('question-form-summary');
  expect(summary.getAttribute('data-form-id')).toBe(FORM_ID);
  expect(summary.getAttribute('data-message-id')).toBe(REQUEST_ID);
  expect(summary.textContent).toContain('Warm');
  return summary;
}

describe('OPEND-2944 task ownership before history reload', () => {
  it('keeps native clarification and production under the original task role while streaming', async () => {
    const view = renderProjectView();
    await answerAndStartProduction();
    const summary = expectAnswerOwnership();
    const working = screen.getByText(WORKING, { exact: false });
    expect(summary.compareDocumentPosition(working) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.container.querySelectorAll('[data-assistant-message-id]')).toHaveLength(1);
    expect(screen.getAllByTestId('assistant-role')).toHaveLength(1);
    expect(working.closest('[data-assistant-message-id]')?.getAttribute('data-assistant-message-id')).toBe(REQUEST_ID);
    expect(view.container.textContent?.split(PREPARATION)).toHaveLength(2);
    expect(view.container.textContent?.split(WORKING)).toHaveLength(2);
  });

  it('keeps an ordinary form follow-up separate without a daemon strategy task', async () => {
    strategyEnabled = false;
    conversationMessages = initialMessages(false);
    const view = renderProjectView();
    await answerAndStartProduction();
    expectAnswerOwnership();
    expect(view.container.querySelectorAll('[data-assistant-message-id]')).toHaveLength(2);
    expect(screen.getAllByTestId('assistant-role')).toHaveLength(2);
    expect(screen.getByText(WORKING, { exact: false }).closest('[data-assistant-message-id]')?.getAttribute('data-assistant-message-id')).not.toBe(REQUEST_ID);
  });

  it.each(['legacy', 'wrong-run', 'different-task'] as const)(
    'does not join the source question using %s ownership evidence', async (mode) => {
      mappingMode = mode;
      const view = renderProjectView();
      await answerAndStartProduction();
      expectAnswerOwnership();
      expect(view.container.querySelectorAll('[data-assistant-message-id]')).toHaveLength(2);
      expect(screen.getAllByTestId('assistant-role')).toHaveLength(2);
      expect(screen.getByText(WORKING, { exact: false }).closest('[data-assistant-message-id]')?.getAttribute('data-assistant-message-id')).not.toBe(REQUEST_ID);
    },
  );
});
