// @vitest-environment jsdom
/**
 * The files panel's missing-entry notice follows the project's last settled
 * round, not the page's presence at the moment it settled. A build round
 * usually outlives the tab that started it: the user reloads, or opens the
 * conversation later, and the terminal frame that used to carry the daemon's
 * "no entry" verdict was never seen by this page. The reload probe of the
 * last succeeded OD Next row reads the same verdict off the stored run status
 * and surfaces the notice; a project that has recorded an entry since then
 * owes none.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, type ReactNode } from 'react';
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
  FileWorkspace: ({ entryMissingNotice }: { entryMissingNotice?: { files: string[] } | null }) => (
    <div data-testid="file-workspace">
      {entryMissingNotice ? (
        <div data-testid="entry-notice-probe">{entryMissingNotice.files.join(',')}</div>
      ) : null}
    </div>
  ),
}));

// ProjectView, ChatPane and AssistantMessage are all real, so the rendered
// assistant grouping is the product's own `foldStrategyTaskTurns` output.
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

let project: Project = {
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

const TASK_ID = 'odnext-entry-task';
const ASSISTANT_ID = 'entry-assistant';
const BUILD_RUN = 'build-run';

const STRATEGY = {
  id: 'od-next-strategy',
  version: '2.1.0',
  packageHash: 'c'.repeat(64),
  snapshotId: 'entry-snapshot',
} as const;

/** The task after its automatic build round settled with files but no entry. */
function settledProjection(): StrategyTaskProjectionV2 {
  return {
    taskExecutionId: TASK_ID,
    strategy: STRATEGY,
    inputStage: 'production',
    outcome: 'completed',
    route: 'full_plan',
    executionMode: 'simple',
    activeRunId: BUILD_RUN,
    runMappings: [{ runId: BUILD_RUN, taskRunIndex: 1 }],
    terminal: true,
    deliverableWritten: true,
    autoRoundCount: 1,
    settlementReason: 'deliverable_changed',
  };
}

/** A conversation reopened after the build round finished. */
function hydratedMessages(): ChatMessage[] {
  const now = Date.now();
  return [{
    id: 'entry-user', role: 'user', content: 'Two pages, no index.', createdAt: now - 30_000,
  }, {
    id: ASSISTANT_ID,
    role: 'assistant',
    content: 'Wrote home.html and work.html.',
    agentId: 'claude',
    agentName: 'Claude',
    runId: BUILD_RUN,
    runStatus: 'succeeded',
    createdAt: now - 20_000,
    startedAt: now - 20_000,
    endedAt: now - 10_000,
    strategyTaskExecutionId: TASK_ID,
    strategyTaskRunIndex: 1,
  }];
}

/** The stored status of that round: succeeded, two pages written, no entry. */
function storedStatus(runId: string): ChatRunStatusResponse {
  return {
    id: runId, projectId: project.id, conversationId: conversation.id,
    assistantMessageId: ASSISTANT_ID, agentId: 'claude', status: 'succeeded',
    createdAt: Date.now() - 20_000, updatedAt: Date.now() - 10_000,
    strategyTask: settledProjection(),
    artifactCount: 2,
    artifactPaths: ['home.html', 'work.html'],
    deliverableValid: false,
    deliverableValidation: 'entry_missing',
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  project = { ...project, metadata: undefined };
  workspaceScopeMocks.ambientContext = workspaceScopeMocks.personalContext();
  listConversations.mockResolvedValue([conversation]);
  createConversation.mockResolvedValue(conversation);
  listMessages.mockImplementation(async () => structuredClone(hydratedMessages()));
  fetchPreviewComments.mockResolvedValue([]);
  fetchProjectFiles.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchBrands.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], active: null });
  fetchChatRunStatus.mockImplementation(async (runId: string) => storedStatus(runId));
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
  saveMessage.mockImplementation(async (_p: string, _c: string, message: ChatMessage) => message);
  streamViaDaemon.mockImplementation(() => new Promise<void>(() => {}));
  reattachDaemonRun.mockImplementation(() => new Promise<void>(() => {}));
  checkAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('missing-entry notice on a reopened conversation', () => {
  it('keeps the fixture projection in the shape the daemon contract accepts', () => {
    expect(() => StrategyTaskProjectionV2Schema.parse(settledProjection())).not.toThrow();
  });

  it('surfaces the notice from the stored verdict of the last settled round', async () => {
    renderProjectView();
    await waitFor(() => expect(fetchChatRunStatus).toHaveBeenCalledWith(BUILD_RUN, expect.anything()));
    const probe = await screen.findByTestId('entry-notice-probe');
    expect(probe).toHaveTextContent('home.html,work.html');
    // A settled round is read, never replayed: no stream is opened for it.
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('owes no notice once the project records an entry', async () => {
    project = { ...project, metadata: { kind: 'prototype', entryFile: 'home.html' } };
    renderProjectView();
    await waitFor(() => expect(fetchChatRunStatus).toHaveBeenCalledWith(BUILD_RUN, expect.anything()));
    await act(async () => {});
    expect(screen.queryByTestId('entry-notice-probe')).toBeNull();
  });

  it('owes no notice when the round left the project with an entry', async () => {
    fetchChatRunStatus.mockImplementation(async (runId: string) => ({
      ...storedStatus(runId),
      deliverableValid: true,
      deliverableValidation: 'valid' as const,
      deliverableEntryFile: 'index.html',
      artifactPaths: ['index.html'],
    }));
    renderProjectView();
    await waitFor(() => expect(fetchChatRunStatus).toHaveBeenCalledWith(BUILD_RUN, expect.anything()));
    await act(async () => {});
    expect(screen.queryByTestId('entry-notice-probe')).toBeNull();
  });
});
