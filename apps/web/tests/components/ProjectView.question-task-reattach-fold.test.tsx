// @vitest-environment jsdom
// OPEND-2944 (reload/reattach half): the page is refreshed while an OD Next
// task is mid-flight, so the row is followed by `reattachDaemonRun` instead of
// `streamViaDaemon`. When the daemon advances that task to its successor Run,
// the reattach `onRunCreated` re-points the row at the new Run — and must
// re-derive the row's logical task position from the daemon projection for
// THAT Run. Spreading the predecessor row keeps the predecessor's
// `strategyTaskRunIndex` on a row that is now streaming a different Run, which
// is the position `foldStrategyTaskTurns`, the fork boundary and the
// successor-absorption rule all read.
//
// The strict rule is shared with the live send path: a projection that does
// not name this Run exactly once yields `undefined`, never the predecessor's
// index and never a guess.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, type ReactNode } from 'react';
import type { DaemonReattachOptions } from '../../src/providers/daemon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { StrategyTaskProjectionV2Schema } from '@open-design/contracts';
import type {
  ChatRunStatusResponse,
  StrategyTaskProjectionV2,
  WorkspaceCollabContext,
} from '@open-design/contracts';
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

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: vi.fn(), newRequestId: () => 'reattach-request' }),
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
    viewerOnly: false,
    isOwner: true,
    writerAuthority: 'allowed',
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

// ProjectView, ChatPane and AssistantMessage are all real, so the rendered
// assistant grouping is the product's own `foldStrategyTaskTurns` output.
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
] as unknown as AgentInfo[];

function renderProjectView() {
  return render(
    <ProjectView
      project={project}
      routeFileName={null}
      config={cliConfig}
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

const TASK_ID = 'odnext-reload-task';
const ASSISTANT_ID = 'reload-assistant-request';
const REQUEST_RUN = 'request-run';
const PRODUCTION_RUN = 'production-run';
const REQUEST_TEXT = 'Decision summary for the reloaded request.';
const PRODUCTION_TEXT = 'Production continuation is running.';

const STRATEGY = {
  id: 'od-next-strategy',
  version: '2.0.4',
  packageHash: 'c'.repeat(64),
  snapshotId: 'reload-snapshot',
} as const;

/** How the daemon names Run positions in the successor projection. */
type MappingMode = 'valid' | 'legacy' | 'wrong-run' | 'duplicate';
let mappingMode: MappingMode;

/** The task while the reloaded page is still following the request Run. */
function requestProjection(): StrategyTaskProjectionV2 {
  return {
    taskExecutionId: TASK_ID,
    strategy: STRATEGY,
    inputStage: 'request',
    outcome: 'running',
    route: 'full_plan',
    executionMode: null,
    activeRunId: REQUEST_RUN,
    runMappings: [{ runId: REQUEST_RUN, taskRunIndex: 0 }],
    terminal: false,
  };
}

/** The projection that rides the reattach stream's successor hand-off. */
function productionProjection(): StrategyTaskProjectionV2 {
  const runMappings = mappingMode === 'wrong-run'
    ? [{ runId: 'some-other-run', taskRunIndex: 7 }]
    : mappingMode === 'duplicate'
      ? [
        { runId: PRODUCTION_RUN, taskRunIndex: 1 },
        { runId: PRODUCTION_RUN, taskRunIndex: 2 },
      ]
      : [
        { runId: REQUEST_RUN, taskRunIndex: 0 },
        { runId: PRODUCTION_RUN, taskRunIndex: 1 },
      ];
  return {
    taskExecutionId: TASK_ID,
    strategy: STRATEGY,
    inputStage: 'production',
    outcome: 'running',
    route: 'full_plan',
    executionMode: 'simple',
    activeRunId: PRODUCTION_RUN,
    ...(mappingMode === 'legacy' ? {} : { runMappings }),
    terminal: false,
  };
}

/** A refreshed page that is still following an in-flight request Run. */
function hydratedMessages(): ChatMessage[] {
  const now = Date.now();
  return [{
    id: 'reload-user', role: 'user', content: 'Build a prototype.', createdAt: now - 3000,
  }, {
    id: ASSISTANT_ID,
    role: 'assistant',
    content: '',
    agentId: 'claude',
    agentName: 'Claude',
    runId: REQUEST_RUN,
    runStatus: 'running',
    createdAt: now - 2000,
    startedAt: now - 2000,
    strategyTaskExecutionId: TASK_ID,
    strategyTaskRunIndex: 0,
  }];
}

/** Keeps the reattach subscription open until ProjectView aborts it. */
function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

/** The rows ProjectView persisted for the reattached assistant message. */
function persistedAssistantRows(): ChatMessage[] {
  return saveMessage.mock.calls
    .map((call) => call[2] as ChatMessage)
    .filter((message) => message?.id === ASSISTANT_ID);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mappingMode = 'valid';
  workspaceScopeMocks.ambientContext = workspaceScopeMocks.personalContext();
  listConversations.mockResolvedValue([conversation]);
  createConversation.mockResolvedValue(conversation);
  listMessages.mockImplementation(async () => structuredClone(hydratedMessages()));
  fetchPreviewComments.mockResolvedValue([]);
  fetchProjectFiles.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchBrands.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], active: null });
  fetchChatRunStatus.mockImplementation(async (runId: string): Promise<ChatRunStatusResponse> => ({
    id: runId, projectId: project.id, conversationId: conversation.id,
    assistantMessageId: ASSISTANT_ID, agentId: 'claude', status: 'running',
    createdAt: Date.now() - 2000, updatedAt: Date.now(),
    strategyTask: requestProjection(),
  }));
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  saveMessage.mockImplementation(async (_p: string, _c: string, message: ChatMessage) => message);
  streamViaDaemon.mockImplementation(() => new Promise<void>(() => {}));
  checkAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * Replays the request Run, then hands the reattach subscription over to the
 * daemon-created successor exactly as `reattachDaemonRun` does on the wire.
 */
async function reattachThroughSuccessor() {
  reattachDaemonRun.mockImplementation(async (options: DaemonReattachOptions) => {
    expect(options.runId).toBe(REQUEST_RUN);
    options.handlers.onAgentEvent({ kind: 'done_key', key: 'request-key' });
    options.handlers.onDelta(REQUEST_TEXT);
    options.handlers.onAgentEvent({ kind: 'text', text: REQUEST_TEXT });
    options.onRunCreated?.(PRODUCTION_RUN, productionProjection());
    options.onRunStatus?.('running');
    options.handlers.onAgentEvent({ kind: 'done_key', key: 'production-key' });
    options.handlers.onDelta(`\n${PRODUCTION_TEXT}`);
    options.handlers.onAgentEvent({ kind: 'text', text: `\n${PRODUCTION_TEXT}` });
    await untilAborted(options.signal);
  });
  const view = renderProjectView();
  await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
  await act(async () => {});
  await screen.findByText(PRODUCTION_TEXT, { exact: false });
  return view;
}

describe('OPEND-2944 a reloaded page that follows its task to the successor Run', () => {
  it('keeps the fixture projections in the shape the daemon contract accepts', () => {
    expect(() => StrategyTaskProjectionV2Schema.parse(requestProjection())).not.toThrow();
    for (const mode of ['valid', 'legacy', 'duplicate', 'wrong-run'] as const) {
      mappingMode = mode;
      expect(() => StrategyTaskProjectionV2Schema.parse(productionProjection())).not.toThrow();
    }
  });

  it('adopts the successor Run\'s daemon-issued task position', async () => {
    const view = await reattachThroughSuccessor();

    const followed = persistedAssistantRows().filter((row) => row.runId === PRODUCTION_RUN);
    expect(followed.length).toBeGreaterThan(0);
    // The row now streams the successor Run, so its logical task position is
    // the successor's — not the predecessor's 0 that `...prev` carried over.
    for (const row of followed) {
      expect(row.strategyTaskExecutionId).toBe(TASK_ID);
      expect(row.strategyTaskRunIndex).toBe(1);
    }
    // Same fold verdict as the live send path: one logical task, one author.
    expect(view.container.querySelectorAll('[data-assistant-message-id]')).toHaveLength(1);
    expect(screen.getAllByTestId('assistant-role')).toHaveLength(1);
  });

  it.each(['legacy', 'wrong-run', 'duplicate'] as const)(
    'drops the position rather than inheriting the predecessor\'s under %s evidence',
    async (mode) => {
      mappingMode = mode;
      await reattachThroughSuccessor();

      const followed = persistedAssistantRows().filter((row) => row.runId === PRODUCTION_RUN);
      expect(followed.length).toBeGreaterThan(0);
      for (const row of followed) {
        expect(row.strategyTaskRunIndex).toBeUndefined();
      }
    },
  );
});
