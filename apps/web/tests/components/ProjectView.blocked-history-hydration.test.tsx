// @vitest-environment jsdom
// OPEND-3028: normalized history legitimately retains physical succeeded while
// the canonical task is blocked. A cold mount has no local error to preserve.
// HTTP fixtures model public DTOs; they do not import a daemon private writer or
// claim that echoing a client PUT reproduces daemon write arbitration.
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { forwardRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, OD_NEXT_AGENT_DECLARED_BLOCK_REASON,
  StrategyTaskProjectionV2Schema, type ChatRunStatusResponse, type StrategyTaskProjectionV2,
  type WorkspaceCollabContext } from '@open-design/contracts';
import { ProjectView } from '../../src/components/ProjectView';
import { I18nProvider } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import { streamViaDaemon, reattachDaemonRun } from '../../src/providers/daemon';
import type { AppConfig, ChatMessage, Project, ProjectFile } from '../../src/types';

const observedChat = vi.hoisted(() => ({ messages: [] as ChatMessage[], proofCompletions: [] as string[] }));

vi.mock('../../src/router', () => ({ navigate: vi.fn(), registerNavigationGuard: vi.fn(() => () => {}) }));
vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));
vi.mock('../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/daemon')>('../../src/providers/daemon');
  return { ...actual, fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
    fetchChatRunStatus: vi.fn(async (...args: Parameters<typeof actual.fetchChatRunStatus>) => {
      const result = await actual.fetchChatRunStatus(...args);
      observedChat.proofCompletions.push(args[0]);
      return result;
    }),
    fetchVelaLoginStatus: vi.fn().mockResolvedValue(null), streamViaDaemon: vi.fn().mockResolvedValue(undefined),
    reattachDaemonRun: vi.fn().mockResolvedValue(undefined),
    listActiveChatRuns: vi.fn().mockResolvedValue([]), listProjectRuns: vi.fn().mockResolvedValue([]),
    publishDaemonRunFinishedEvent: vi.fn() };
});
vi.mock('../../src/providers/project-events', () => ({ useProjectFileEvents: vi.fn() }));
vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>('../../src/providers/registry');
  return { ...actual, fetchDesignSystem: vi.fn().mockResolvedValue(null),
    fetchProjectDesignSystemPackageAudit: vi.fn().mockResolvedValue(null), fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchProjectFilePreview: vi.fn().mockResolvedValue(null), fetchProjectFileText: vi.fn().mockResolvedValue(null),
    fetchProjectFolders: vi.fn().mockResolvedValue([]), fetchPreviewComments: vi.fn().mockResolvedValue([]),
    fetchSkill: vi.fn().mockResolvedValue(null) };
});
vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>('../../src/state/projects');
  return { ...actual, createConversation: vi.fn(), listPlugins: vi.fn().mockResolvedValue([]),
    getTemplate: vi.fn().mockResolvedValue(null), loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn().mockResolvedValue(undefined), patchProject: vi.fn().mockResolvedValue(undefined),
    saveTabs: vi.fn().mockResolvedValue(undefined), persistTabsToDaemonNow: vi.fn().mockResolvedValue(undefined) };
});
vi.mock('../../src/components/AppChromeHeader', () => ({ AppChromeHeader: () => null, APP_CHROME_FILE_ACTIONS_ID: 'test-file-actions' }));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/ChatPane', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/ChatPane')>('../../src/components/ChatPane');
  return { ...actual, ChatPane: (props: ComponentProps<typeof actual.ChatPane>) => {
    // Observe the pre-fold boundary without replacing any real rendering or
    // callbacks. Physical predecessors need not have separate on-screen shells.
    observedChat.messages = props.messages;
    return <actual.ChatPane {...props} />;
  } };
});
// The real ProjectView, ChatPane, AssistantMessage and execution/error cards stay wired.
// Only the unrelated editor/viewer surfaces are replaced.
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));
vi.mock('../../src/components/FileWorkspace', () => ({ DESIGN_SYSTEM_TAB: '__design_system__', FileWorkspace: ({ files }: { files: ProjectFile[] }) =>
  <output data-testid="recovered-files">{files.map((file) => file.name).join(',')}</output> }));
vi.mock('../../src/components/workspace/TerminalViewer', () => ({ TerminalViewer: () => null }));

const MISSING_STATE = 'od_next_protocol_runtime_state_missing';
const config: AppConfig = { mode: 'daemon', apiProtocol: 'openai', apiKey: '', baseUrl: '', model: '',
  agentId: 'opencode', skillId: null, designSystemId: null };
const RESULT: ProjectFile = { name: 'result.html', path: 'result.html', kind: 'html',
  mime: 'text/html', size: 132, mtime: 2000 };
let sequence = 0;
let project: Project;
let context: WorkspaceCollabContext;
let contexts: Map<string, WorkspaceCollabContext>;
let histories: Map<string, ChatMessage[]>;
let proofs: Map<string, ChatRunStatusResponse>;
let proofHttpStatus: number;
let proofGate: Promise<void> | null;
let releaseProof: () => void = () => {};
let reads: string[];
let pendingProofReads: string[];
let unexpectedWrites: string[];

const conversationId = () => `conversation-${project.id}`;
const runId = () => `run-${project.id}`;
const assistantId = () => `assistant-${project.id}`;
const taskId = () => `task-${project.id}`;
const historyKey = (conversation = conversationId(), principal = context.workspaceMemberId) =>
  `${principal}/${conversation}`;

function blockedTask(overrides: Partial<StrategyTaskProjectionV2> = {}): StrategyTaskProjectionV2 {
  const task: StrategyTaskProjectionV2 = {
    taskExecutionId: taskId(), activeRunId: runId(), executionMode: null,
    inputStage: 'request', route: 'full_plan', outcome: 'blocked', terminal: true,
    strategy: { id: 'od-next-strategy', version: '2.0.4', packageHash: 'a'.repeat(64), snapshotId: 'fixture' },
    blockedContext: { reasonCodes: [MISSING_STATE], visibleText: 'The requested result was prepared.' },
    ...overrides,
  };
  // This is an existing public projection, not a new invented UI verdict DTO.
  return StrategyTaskProjectionV2Schema.parse(task);
}

function runProof(overrides: Partial<ChatRunStatusResponse> = {}): ChatRunStatusResponse {
  return { id: runId(), projectId: project.id, conversationId: conversationId(),
    assistantMessageId: assistantId(), agentId: 'opencode', status: 'succeeded',
    createdAt: 1000, updatedAt: 2000, terminalAt: 2000, artifactCount: 1,
    artifactPaths: [RESULT.name], deliverableValid: false, deliverableValidation: 'no_artifact',
    strategyTask: blockedTask(), ...overrides };
}

function persistedAssistant(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const content = 'Persisted result for this conversation.';
  return { id: assistantId(), role: 'assistant', content, createdAt: 1000, startedAt: 1000,
    endedAt: 2000, runId: runId(), runStatus: 'succeeded', resultDeliveryState: 'delivered',
    agentId: 'opencode', producedFiles: [RESULT], preTurnFileNames: [],
    events: [{ kind: 'thinking', text: 'Checking the requested result.' }, { kind: 'text', text: content }],
    strategyTaskExecutionId: taskId(), strategyTaskRunIndex: 0,
    strategyTaskBlocked: true, strategyTaskBlockedText: 'The requested result was prepared.',
    ...overrides };
}

function setHistory(message: ChatMessage, conversation = conversationId(), principal = context.workspaceMemberId) {
  histories.set(historyKey(conversation, principal), [
    { id: `user-${conversation}`, role: 'user', content: 'Create the requested result.', createdAt: 900 },
    message,
  ]);
}

function view(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  return <I18nProvider initial="en"><ProjectView project={project}
    initialProjectDetail={{ project, resolvedDir: '/workspace/history-verdict-fixture' }}
    routeConversationId={conversationId()} routeFileName={null} config={config}
    workspaceContextOverride={context}
    agents={[{ id: 'opencode', name: 'OpenCode', bin: 'opencode', available: true, models: [] }]}
    skills={[]} designTemplates={[]} designSystems={[]} daemonLive
    onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()}
    onRefreshAgents={vi.fn()} onOpenSettings={vi.fn()} onBack={vi.fn()}
    onClearPendingPrompt={vi.fn()} onTouchProject={vi.fn()} onProjectChange={vi.fn()}
    onProjectsRefresh={vi.fn()} {...overrides} /></I18nProvider>;
}

function messageElement(id = assistantId()) {
  const element = document.querySelector(`[data-assistant-message-id="${id}"]`);
  expect(element).not.toBeNull();
  return element as HTMLElement;
}

async function expectDisplayedStatus(label: string, id = assistantId()) {
  // The footer also says Done. Inspect the actual execution record heading,
  // not a whole-message text query that conflates the two status surfaces.
  await waitFor(() => {
    const flow = within(messageElement(id)).getByTestId('assistant-flow');
    // A canceled/open record also mounts nested Thoughts foldables. Its
    // top-level execution summary is the status, not those child headings.
    const headings = flow.querySelectorAll(':scope > details > summary > [data-testid="chat-foldable-summary-content"]');
    expect(headings.length).toBe(1);
    expect(headings[0]?.textContent).toBe(label);
  });
}

async function expectBlockedRecovery() {
  await expectDisplayedStatus(en['chat.record.failedTurn']);
  expect(screen.getByText(en['chat.runError.title.agentReplyIncomplete'])).toBeTruthy();
  expect(screen.getByTestId('chat-run-error-description').textContent)
    .toBe(en['chat.runError.agentReplyIncompleteMessage']);
  // Existing recovery control, not a new copy/action. Do not dispatch a model.
  await waitFor(() => expect((screen.getByTestId('chat-error-retry') as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByTestId('recovered-files').textContent).toContain(RESULT.name);
}

function holdProof() {
  proofGate = new Promise<void>((resolve) => { releaseProof = resolve; });
}

async function settleExistingTaskProbe() {
  await waitFor(() => expect(pendingProofReads).toContain(`${context.workspaceMemberId}/${runId()}`));
  // Observe the real provider's completed HTTP decode, then let React commit
  // its consumer. An initial Done before the proof resolves is not a guard.
  await act(async () => {
    releaseProof();
    await waitFor(() => expect(observedChat.proofCompletions).toContain(runId()));
  });
}

beforeEach(() => {
  vi.clearAllMocks(); window.localStorage.clear(); window.sessionStorage.clear();
  observedChat.messages = [];
  observedChat.proofCompletions = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // Decorative artifact shimmer is not part of this status/hydration test.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  context = { workspaceId: `history-workspace-${++sequence}`, workspaceType: 'team',
    workspaceMemberId: 'history-member', role: 'member', memberStatus: 'active',
    lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }) };
  project = { id: `history-verdict-${sequence}`, name: 'History verdict', workspaceId: context.workspaceId,
    workspaceVisibility: 'team', skillId: null, designSystemId: null, metadata: { kind: 'prototype' },
    createdAt: 1000, updatedAt: 2000 };
  contexts = new Map([[context.workspaceMemberId, context]]);
  histories = new Map(); proofs = new Map([[runId(), runProof()]]);
  proofHttpStatus = 200; proofGate = null; releaseProof = () => {};
  reads = []; pendingProofReads = []; unexpectedWrites = [];
  setHistory(persistedAssistant());
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const principal = headers.get('x-od-workspace-member-id') ?? context.workspaceMemberId;
    const requestContext = contexts.get(principal) ?? context;
    if (url.pathname.endsWith('/workspace-scope')) return Response.json({ scope: { kind: 'team',
      projectId: project.id, workspaceId: requestContext.workspaceId, visibility: 'team', context: requestContext } });
    if (url.pathname.endsWith('/collab/status')) return Response.json({ syncState: 'local_only',
      ownerMemberId: requestContext.workspaceMemberId, publishedVersion: null, localVersion: null });
    if (url.pathname === `/api/projects/${project.id}/conversations`) {
      return Response.json({ conversations: [...new Set([...histories.keys()].map((key) => key.split('/')[1]))]
        .map((id) => ({ id, projectId: project.id, title: null, sessionMode: 'design', createdAt: 1000, updatedAt: 2000 })) });
    }
    const messagesMatch = url.pathname.match(/\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch && method === 'GET') {
      const key = historyKey(decodeURIComponent(messagesMatch[1]!), principal);
      reads.push(key);
      return Response.json({ messages: histories.get(key) ?? [] });
    }
    if (url.pathname.startsWith('/api/runs/') && method === 'GET') {
      if (!contexts.has(headers.get('x-od-workspace-member-id') ?? '')
        || headers.get('x-od-workspace-id') !== context.workspaceId) {
        return Response.json({ error: 'Run unavailable' }, { status: 403 });
      }
      // Capture at request time so switching identity/conversation cannot turn
      // the old response into the new principal's proof inside this fixture.
      const proof = structuredClone(proofs.get(decodeURIComponent(url.pathname.slice('/api/runs/'.length))));
      const status = proofHttpStatus;
      const gate = proofGate;
      if (gate) {
        pendingProofReads.push(`${principal}/${proof?.id ?? 'missing-run'}`);
        await gate;
      }
      return Response.json(status === 200 && proof ? proof : { error: 'Run unavailable' },
        { status: status === 200 && !proof ? 404 : status });
    }
    if (url.pathname === `/api/projects/${project.id}/files` && method === 'GET') return Response.json({ files: [RESULT] });
    if (url.pathname === `/api/projects/${project.id}`) return Response.json({ project, resolvedDir: '/workspace/history-verdict-fixture' });
    if (method !== 'GET' && (url.pathname.includes('/messages/') || url.pathname.endsWith('/files') || url.pathname === '/api/chat')) {
      unexpectedWrites.push(`${method} ${url.pathname}`);
      // An attempted metadata write must not masquerade as daemon acceptance
      // of a client logical failure over its physical succeeded row.
      return Response.json({ error: 'Cold history fixture is read-only' }, { status: 409 });
    }
    return Response.json({});
  }));
});

afterEach(() => {
  cleanup(); releaseProof(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  window.localStorage.clear(); window.sessionStorage.clear();
});

describe('blocked task history hydration through real ProjectView and ChatPane (OPEND-3028)', () => {
  it('restores the reason-specific failure and retry after cold load and a second fresh mount', async () => {
    const original = structuredClone(histories.get(historyKey()));
    const mounted = render(view());
    await expectBlockedRecovery();
    mounted.unmount();
    const previousReads = reads.length;
    render(view());
    await waitFor(() => expect(reads.length).toBeGreaterThan(previousReads));
    await expectBlockedRecovery();
    expect(histories.get(historyKey())).toEqual(original);
    expect(unexpectedWrites).toEqual([]);
    expect(streamViaDaemon).not.toHaveBeenCalled();
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('does not turn the successful request predecessor into the later active run failure', async () => {
    const task = blockedTask({ activeRunId: 'later-production-run' });
    proofs.set(runId(), runProof({ strategyTask: task }));
    const successor = persistedAssistant({ id: 'later-assistant', runId: 'later-production-run',
      createdAt: 2001, startedAt: 2001, endedAt: 3000, runStatus: 'failed', strategyTaskRunIndex: 1,
      content: 'Production reached its recorded terminal failure.',
      events: [{ kind: 'thinking', text: 'Checking the production result.' },
        { kind: 'text', text: 'Production reached its recorded terminal failure.' }] });
    histories.get(historyKey())!.push(successor);
    proofs.set('later-production-run', runProof({ id: 'later-production-run', assistantMessageId: successor.id,
      status: 'failed', createdAt: 2001, updatedAt: 3000, terminalAt: 3000, strategyTask: task }));
    holdProof();
    render(view());
    await settleExistingTaskProbe();
    // Both persisted runs are present, so this is ordinary history, not the
    // legitimate crash-window path that replays an unpersisted successor.
    // Real ChatPane folds the logical turn, so inspect physical identity at
    // that real component boundary and the folded failure on screen.
    await waitFor(() => {
      expect(observedChat.messages.find((message) => message.id === assistantId()))
        .toMatchObject({ runId: runId(), runStatus: 'succeeded' });
      expect(observedChat.messages.find((message) => message.id === successor.id))
        .toMatchObject({ runId: successor.runId, runStatus: 'failed' });
    });
    await expectDisplayedStatus(en['chat.record.failedTurn']);
    expect(reattachDaemonRun).not.toHaveBeenCalled();
  });

  it('does not borrow a blocked verdict from another task even if its active run id matches', async () => {
    proofs.set(runId(), runProof({ strategyTask: blockedTask({ taskExecutionId: 'different-task' }) }));
    holdProof();
    render(view());
    await settleExistingTaskProbe();
    await expectDisplayedStatus(en['chat.record.done']);
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
  });

  it.each(['filesystem-valid', 'agent-declared'] as const)('keeps the existing %s physical-success exception', async (kind) => {
    proofs.set(runId(), runProof(kind === 'filesystem-valid'
      ? { deliverableValid: true, deliverableValidation: 'valid' }
      : { strategyTask: blockedTask({ blockedContext: {
        reasonCodes: [OD_NEXT_AGENT_DECLARED_BLOCK_REASON], visibleText: 'The user must supply the missing input.' } }) }));
    holdProof();
    render(view());
    await settleExistingTaskProbe();
    await expectDisplayedStatus(en['chat.record.done']);
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
  });

  it('does not treat an agent-declared reason without visible explanation as the success exception', async () => {
    // Schema permits null visible text; the provider success exception does
    // not. Keep that exact existing distinction in the history surface too.
    proofs.set(runId(), runProof({ strategyTask: blockedTask({ blockedContext: {
      reasonCodes: [OD_NEXT_AGENT_DECLARED_BLOCK_REASON], visibleText: null } }) }));
    render(view());
    await expectDisplayedStatus(en['chat.record.failedTurn']);
    expect(screen.getByTestId('chat-error-retry')).toBeTruthy();
  });

  it.each([
    ['succeeded', 'chat.record.done'], ['canceled', 'chat.record.canceled'], ['failed', 'chat.record.failedTurn'],
  ] as const)('preserves ordinary physical %s history without a strategy task', async (status, label) => {
    setHistory(persistedAssistant({ runStatus: status, strategyTaskBlocked: undefined,
      strategyTaskExecutionId: undefined, strategyTaskRunIndex: undefined, strategyTaskBlockedText: undefined }));
    proofs.set(runId(), runProof({ status, strategyTask: undefined }));
    render(view());
    await expectDisplayedStatus(en[label]);
    expect(screen.queryByText(en['chat.runError.title.agentReplyIncomplete'])).toBeNull();
  });

  it.each([403, 404, 503])('keeps the existing unavailable-proof fallback without inventing a specific blocked reason (%s)', async (status) => {
    proofHttpStatus = status;
    render(view());
    // Existing task-probe fallback marks a missing physical status failed.
    // Changing that policy is outside the authoritative-DTO repair. The first
    // draft wrongly assumed it retained succeeded; preserve the actual policy.
    await expectDisplayedStatus(en['chat.record.failedTurn']);
    expect(screen.queryByText(en['chat.runError.title.agentReplyIncomplete'])).toBeNull();
  });

  it.each(['conversation', 'principal'] as const)('ignores late old %s proof after switching to another visible history', async (boundary) => {
    proofGate = new Promise<void>((resolve) => { releaseProof = resolve; });
    const nextContext = boundary === 'principal'
      ? { ...context, workspaceMemberId: 'next-history-member' } : context;
    const nextConversation = boundary === 'conversation' ? 'next-conversation' : conversationId();
    contexts.set(nextContext.workspaceMemberId, nextContext);
    const nextMessage = persistedAssistant({ id: 'next-assistant', runId: 'next-run',
      content: 'Other authorized history remains visible.',
      events: [{ kind: 'thinking', text: 'Checking the next result.' },
        { kind: 'text', text: 'Other authorized history remains visible.' }],
      strategyTaskBlocked: undefined, strategyTaskExecutionId: undefined, strategyTaskRunIndex: undefined,
      strategyTaskBlockedText: undefined });
    setHistory(nextMessage, nextConversation, nextContext.workspaceMemberId);
    proofs.set('next-run', runProof({ id: 'next-run', conversationId: nextConversation,
      assistantMessageId: nextMessage.id, strategyTask: undefined }));
    // The target must already be in the loaded conversation catalogue: the
    // actual route-sync guard deliberately rejects nonexistent routed IDs.
    const mounted = render(view());
    // This isolation control uses the EXISTING terminal task probe and must
    // actually hold its old response; merely reading history could switch away
    // before any proof request existed. The main cold-load red above remains a
    // UI assertion, not an expected new GET. Real clocks preserve the race.
    await waitFor(() => expect(reads).toContain(historyKey()));
    await waitFor(() => expect(pendingProofReads).toContain(`${context.workspaceMemberId}/${runId()}`));
    mounted.rerender(view({ workspaceContextOverride: nextContext, routeConversationId: nextConversation }));
    await waitFor(() => expect(reads).toContain(historyKey(nextConversation, nextContext.workspaceMemberId)));
    await act(async () => { releaseProof(); });
    await expectDisplayedStatus(en['chat.record.done'], nextMessage.id);
    expect(screen.getByText(nextMessage.content)).toBeTruthy();
    expect(document.querySelector(`[data-assistant-message-id="${assistantId()}"]`)).toBeNull();
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
    expect(unexpectedWrites).toEqual([]);
  });
});
