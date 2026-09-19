// @vitest-environment jsdom
//
// OPEND-3230: an OD Next clarification turn sometimes rendered its question
// form card followed by raw form JSON — the transcript T with a copy of its own
// tail T[cut:] appended, cut somewhere inside the form.
//
// Mechanism: a clarification turn ends with the Run physically `succeeded`
// while its logical task stays open (`clarification_required`, not terminal).
// `attachRecoverableRuns` probed that task, saw "not terminal", and cleared the
// finished row to replay the whole Run from event 0. A conversation refresh
// landing mid-replay adopted the server's full transcript, the rest of the
// replay was appended behind it, and the replay's terminal PUT persisted the
// duplicated text.
//
// The invariant under test: a Run whose logical task holds no active Run (the
// task is parked on the user) has nothing left to follow, so its row is never
// cleared and replayed. Rows that still need recovery keep replaying.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrategyTaskProjectionV2Schema } from '@open-design/contracts';
import type { ChatRunStatusResponse, StrategyTaskProjectionV2 } from '@open-design/contracts';
import { ProjectView } from '../../src/components/ProjectView';
import type { AgentEvent, ChatMessage } from '../../src/types';
import clarificationFixture from '../fixtures/chat/odnext-clarification-form.json';

const listConversations = vi.fn();
const listMessages = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchProjectDesignSystemPackageAudit = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
const fetchChatRunStatus = vi.fn();
const listActiveChatRuns = vi.fn();
const listProjectRuns = vi.fn();
const reattachDaemonRun = vi.fn();
const publishDaemonRunFinishedEvent = vi.fn();
const streamViaDaemon = vi.fn();
const saveMessage = vi.fn();
const createConversation = vi.fn();
const patchConversation = vi.fn();
const patchProject = vi.fn();
const saveTabs = vi.fn();

const chatPaneHarness = vi.hoisted(() => ({
  onSend: null as null | ((
    prompt: string,
    attachments: unknown[],
    commentAttachments?: unknown[],
    meta?: unknown,
  ) => unknown),
  messages: [] as ChatMessage[],
  activeConversationId: null as string | null,
  loading: false,
  sendDisabled: false,
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (value: string) => value,
  }),
  useT: () => ((value: string) => value),
}));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  GENERIC_DAEMON_DISCONNECT_CODE: 'GENERIC_DAEMON_DISCONNECT',
  GENERIC_DAEMON_DISCONNECT_MESSAGE: 'daemon stream disconnected before run completed',
  fetchChatRunStatus: (...args: unknown[]) => fetchChatRunStatus(...args),
  fetchAmrWalletSnapshot: vi.fn().mockResolvedValue(null),
  listActiveChatRuns: (...args: unknown[]) => listActiveChatRuns(...args),
  listProjectRuns: (...args: unknown[]) => listProjectRuns(...args),
  publishDaemonRunFinishedEvent: (...args: unknown[]) => publishDaemonRunFinishedEvent(...args),
  reattachDaemonRun: (...args: unknown[]) => reattachDaemonRun(...args),
  streamViaDaemon: (...args: unknown[]) => streamViaDaemon(...args),
}));

vi.mock('../../src/providers/registry', () => ({
  deletePreviewComment: vi.fn(),
  fetchPreviewComments: (...args: unknown[]) => fetchPreviewComments(...args),
  fetchDesignSystem: (...args: unknown[]) => fetchDesignSystem(...args),
  fetchProjectDesignSystemPackageAudit: (...args: unknown[]) =>
    fetchProjectDesignSystemPackageAudit(...args),
  fetchLiveArtifacts: (...args: unknown[]) => fetchLiveArtifacts(...args),
  fetchProjectFiles: (...args: unknown[]) => fetchProjectFiles(...args),
  fetchSkill: (...args: unknown[]) => fetchSkill(...args),
  patchPreviewCommentStatus: vi.fn(),
  upsertPreviewComment: vi.fn(),
  writeProjectTextFile: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('../../src/state/projects', () => ({
  cacheTabsLocally: vi.fn((projectId: string, tabs: unknown) => ({ projectId, tabs })),
  createConversation: (...args: unknown[]) => createConversation(...args),
  deleteConversation: vi.fn(),
  getTemplate: (...args: unknown[]) => getTemplate(...args),
  listConversations: (...args: unknown[]) => listConversations(...args),
  listMessages: (...args: unknown[]) => listMessages(...args),
  loadTabs: (...args: unknown[]) => loadTabs(...args),
  patchConversation: (...args: unknown[]) => patchConversation(...args),
  patchProject: (...args: unknown[]) => patchProject(...args),
  persistTabsToDaemonNow: vi.fn(),
  saveMessage: (...args: unknown[]) => saveMessage(...args),
  saveTabs: (...args: unknown[]) => saveTabs(...args),
}));

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: () => null,
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({
    messages,
    onSend,
    activeConversationId,
    loading,
    sendDisabled,
  }: {
    messages: ChatMessage[];
    onSend: typeof chatPaneHarness.onSend;
    activeConversationId: string | null;
    loading?: boolean;
    sendDisabled?: boolean;
  }) => {
    chatPaneHarness.messages = messages;
    chatPaneHarness.onSend = onSend;
    chatPaneHarness.activeConversationId = activeConversationId;
    chatPaneHarness.loading = Boolean(loading);
    chatPaneHarness.sendDisabled = Boolean(sendDisabled);
    return null;
  },
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => null,
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

function renderProjectView() {
  const project = {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
  } as never;
  return render(
    <ProjectView
      project={project}
      initialProjectDetail={{ project, resolvedDir: null }}
      routeConversationId={null}
      routeFileName={null}
      config={
        {
          mode: 'daemon',
          agentId: 'agent-1',
          notifications: undefined,
          agentModels: {},
        } as never
      }
      agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never]}
      skills={[]}
      designTemplates={[]}
      designSystems={[]}
      daemonLive
      onModeChange={() => {}}
      onAgentChange={() => {}}
      onAgentModelChange={() => {}}
      onRefreshAgents={() => {}}
      onOpenSettings={() => {}}
      onBack={() => {}}
      onClearPendingPrompt={() => {}}
      onTouchProject={() => {}}
      onProjectChange={() => {}}
      onProjectsRefresh={() => {}}
    />,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The synthetic clarification turn: narration followed by one question form. */
const FORM_TURN_TEXT = clarificationFixture.events
  .filter((event) => event.kind === 'text')
  .map((event) => ('text' in event ? event.text : ''))
  .join('');

const RUN_ID = 'run-clarification';
const TASK_EXECUTION_ID = 'task-clarification';
const STRATEGY_IDENTITY = {
  id: 'od-next-strategy',
  version: '2.0.0',
  packageHash: 'e'.repeat(64),
  snapshotId: 'snapshot-clarification',
} as const;

/** What `POST /api/runs` projects while the initial request is still running. */
const RUNNING_REQUEST_PROJECTION: StrategyTaskProjectionV2 = {
  taskExecutionId: TASK_EXECUTION_ID,
  strategy: STRATEGY_IDENTITY,
  inputStage: 'request',
  outcome: 'running',
  route: null,
  executionMode: null,
  activeRunId: RUN_ID,
  terminal: false,
};

/**
 * What the daemon projects once the Run has settled a task that now waits on
 * the user. Mirrors `projectStrategyTask`
 * (apps/daemon/src/strategies/od-next/automatic-simple-production.ts): the task
 * store keeps no active Run for a non-`running` outcome, and the wire
 * projection then falls back to the latest Run — this same Run.
 */
const PARKED_PROJECTIONS: Record<'clarification_required' | 'plan_ready', StrategyTaskProjectionV2> = {
  clarification_required: {
    taskExecutionId: TASK_EXECUTION_ID,
    strategy: STRATEGY_IDENTITY,
    inputStage: 'request',
    outcome: 'clarification_required',
    route: 'full_plan',
    executionMode: null,
    activeRunId: RUN_ID,
    terminal: false,
  },
  plan_ready: {
    taskExecutionId: TASK_EXECUTION_ID,
    strategy: STRATEGY_IDENTITY,
    inputStage: 'request',
    outcome: 'plan_ready',
    route: 'full_plan',
    executionMode: 'simple',
    activeRunId: RUN_ID,
    terminal: false,
  },
};

function succeededStatus(strategyTask: StrategyTaskProjectionV2): ChatRunStatusResponse {
  const now = Date.now();
  return {
    id: RUN_ID,
    status: 'succeeded',
    createdAt: now - 30_000,
    updatedAt: now,
    exitCode: 0,
    signal: null,
    strategyTask,
  } as ChatRunStatusResponse;
}

const textOf = (message: ChatMessage | undefined) =>
  (message?.events ?? [])
    .filter((event): event is Extract<AgentEvent, { kind: 'text' }> => event.kind === 'text')
    .map((event) => event.text)
    .join('');

const assistantOf = () => chatPaneHarness.messages.find((message) => message.role === 'assistant');

/** Classifies a transcript against the one clean copy of the turn. */
function transcriptShape(text: string): string {
  if (text === FORM_TURN_TEXT) return 'clean';
  if (text === '') return 'empty';
  if (text.length > FORM_TURN_TEXT.length && text.startsWith(FORM_TURN_TEXT)) {
    return FORM_TURN_TEXT.endsWith(text.slice(FORM_TURN_TEXT.length))
      ? `duplicated-tail(${text.length - FORM_TURN_TEXT.length})`
      : `overlong(${text.length})`;
  }
  return FORM_TURN_TEXT.startsWith(text) ? `prefix(${text.length})` : `other(${text.length})`;
}

function mockProjectShell() {
  listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
  fetchPreviewComments.mockResolvedValue([]);
  loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
  fetchProjectFiles.mockResolvedValue([]);
  fetchLiveArtifacts.mockResolvedValue([]);
  fetchSkill.mockResolvedValue(null);
  fetchDesignSystem.mockResolvedValue(null);
  getTemplate.mockResolvedValue(null);
  listActiveChatRuns.mockResolvedValue([]);
  listProjectRuns.mockResolvedValue([]);
}

/** Settles every status probe issued so far, then lets React commit what follows. */
async function settleStatusProbes() {
  await act(async () => {
    await Promise.allSettled(fetchChatRunStatus.mock.results.map((result) => result.value));
  });
  await act(async () => {});
}

/**
 * Sends only once the composer would let a user send: a conversation is active
 * and its transcript read has settled. `onSend` is mounted from the first
 * render, but ProjectView refuses a send issued before that point without
 * starting a Run, so waiting for the callback alone races the transcript load.
 */
async function sendWhenComposerReady(prompt: string) {
  await waitFor(() => {
    expect(chatPaneHarness.activeConversationId).not.toBeNull();
    expect(chatPaneHarness.loading).toBe(false);
    expect(chatPaneHarness.sendDisabled).toBe(false);
  });
  void chatPaneHarness.onSend!(prompt, [], []);
}

const probedRunIds = () => fetchChatRunStatus.mock.calls.map((call) => call[0]);

/**
 * A reattach stream that stays open until ProjectView aborts it (unmount).
 * Terminal replays share a module-level concurrency gate, so a stream that
 * never settles would starve the next case's replay.
 */
function streamUntilAborted(options: { signal: AbortSignal }): Promise<void> {
  return new Promise<void>((resolve) => {
    if (options.signal.aborted) resolve();
    else options.signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

describe('OPEND-3230 a finished OD Next turn whose task waits on the user', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    chatPaneHarness.onSend = null;
    chatPaneHarness.messages = [];
    chatPaneHarness.activeConversationId = null;
    chatPaneHarness.loading = false;
    chatPaneHarness.sendDisabled = false;
    window.sessionStorage.clear();
  });

  it('keeps the fixture projections in the shape the daemon contract accepts', () => {
    expect(() => StrategyTaskProjectionV2Schema.parse(RUNNING_REQUEST_PROJECTION)).not.toThrow();
    for (const projection of Object.values(PARKED_PROJECTIONS)) {
      expect(() => StrategyTaskProjectionV2Schema.parse(projection)).not.toThrow();
    }
  });

  it('does not clear and replay the clarification turn after its own live stream ends', async () => {
    mockProjectShell();
    saveMessage.mockResolvedValue(undefined);
    // The transcript read settles well after the first render, as it does on
    // a slow runner; the send below must wait for it instead of racing it.
    listMessages.mockImplementation(async () => {
      await sleep(200);
      return [];
    });
    let sendOptions: any = null;
    const liveStream = deferred<void>();
    streamViaDaemon.mockImplementation(async (options: any) => {
      sendOptions = options;
      options.onRunCreated(RUN_ID, RUNNING_REQUEST_PROJECTION);
      options.onRunStatus?.('running');
      return liveStream.promise;
    });
    fetchChatRunStatus.mockResolvedValue(succeededStatus(PARKED_PROJECTIONS.clarification_required));
    reattachDaemonRun.mockImplementation(streamUntilAborted);

    renderProjectView();
    await sendWhenComposerReady('prompt');
    await waitFor(() => expect(sendOptions).not.toBeNull());
    sendOptions.handlers.onDelta(FORM_TURN_TEXT);
    sendOptions.handlers.onAgentEvent({ kind: 'text', text: FORM_TURN_TEXT });
    await waitFor(() => expect(textOf(assistantOf())).toBe(FORM_TURN_TEXT));
    const assistantId = assistantOf()!.id;

    await act(async () => {
      sendOptions.onRunStatus('succeeded');
      sendOptions.handlers.onDone(FORM_TURN_TEXT);
      liveStream.resolve();
      await liveStream.promise;
    });
    // Recovery re-reads daemon task truth once the local finalizer releases
    // the Run; that probe is the decision point this case is about.
    await waitFor(() => expect(probedRunIds()).toContain(RUN_ID));
    await settleStatusProbes();

    expect(reattachDaemonRun).not.toHaveBeenCalled();
    expect(textOf(assistantOf())).toBe(FORM_TURN_TEXT);
    expect(assistantOf()?.content).toBe(FORM_TURN_TEXT);
    const clearedWrites = saveMessage.mock.calls
      .map((call) => call[2] as ChatMessage)
      .filter((message) => message?.id === assistantId && message.content !== FORM_TURN_TEXT && message.runStatus === 'succeeded');
    expect(clearedWrites).toEqual([]);
  });

  it.each(['clarification_required', 'plan_ready'] as const)(
    'does not clear and replay a hydrated succeeded row whose task is parked on the user (%s)',
    async (outcome) => {
      mockProjectShell();
      saveMessage.mockResolvedValue(undefined);
      const startedAt = Date.now() - 30_000;
      listMessages.mockResolvedValue([
        { id: 'msg-user', role: 'user', content: 'prompt', createdAt: startedAt },
        {
          id: 'msg-clarification',
          role: 'assistant',
          agentId: 'agent-1',
          content: FORM_TURN_TEXT,
          events: clarificationFixture.events as AgentEvent[],
          createdAt: startedAt,
          startedAt,
          endedAt: startedAt + 20_000,
          runId: RUN_ID,
          runStatus: 'succeeded',
          lastRunEventId: '42',
          strategyTaskExecutionId: TASK_EXECUTION_ID,
        },
      ] satisfies ChatMessage[]);
      fetchChatRunStatus.mockResolvedValue(succeededStatus(PARKED_PROJECTIONS[outcome]));
      reattachDaemonRun.mockImplementation(streamUntilAborted);

      renderProjectView();
      await waitFor(() => expect(probedRunIds()).toContain(RUN_ID));
      await settleStatusProbes();

      expect(reattachDaemonRun).not.toHaveBeenCalled();
      expect(assistantOf()?.content).toBe(FORM_TURN_TEXT);
      expect(textOf(assistantOf())).toBe(FORM_TURN_TEXT);
      expect(
        saveMessage.mock.calls
          .map((call) => call[2] as ChatMessage)
          .filter((message) => message?.id === 'msg-clarification'),
      ).toEqual([]);
    },
  );

  it('still replays a parked-task row whose persisted transcript never landed', async () => {
    mockProjectShell();
    saveMessage.mockResolvedValue(undefined);
    const startedAt = Date.now() - 30_000;
    listMessages.mockResolvedValue([
      { id: 'msg-user', role: 'user', content: 'prompt', createdAt: startedAt },
      {
        id: 'msg-clarification',
        role: 'assistant',
        agentId: 'agent-1',
        content: '',
        events: [],
        createdAt: startedAt,
        startedAt,
        runId: RUN_ID,
        runStatus: 'succeeded',
        strategyTaskExecutionId: TASK_EXECUTION_ID,
      },
    ] satisfies ChatMessage[]);
    fetchChatRunStatus.mockResolvedValue(succeededStatus(PARKED_PROJECTIONS.clarification_required));
    reattachDaemonRun.mockImplementation(streamUntilAborted);

    renderProjectView();

    await waitFor(() => expect(reattachDaemonRun).toHaveBeenCalledTimes(1));
    expect(reattachDaemonRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: RUN_ID,
      initialLastEventId: null,
    }));
  });

  // Real clock on purpose: this case is about how React commits interleave
  // with pending I/O (status probe, post-run refresh, message PUTs), which
  // fake timers would collapse into one act (docs/testing/test-efficiency.zh-CN.md).
  // The small sleeps inside the mocks stand in for network latency.
  it.each([3, 6, 12])(
    'keeps the rendered and persisted transcript clean when a post-run refresh overlaps recovery (replay pacing %sms)',
    async (replayPauseMs) => {
      mockProjectShell();
      const NON_TEXT = Array.from({ length: 36 }, (_, index) => ({ kind: 'status', label: `s${index}`, detail: 'x' }));
      const REPLAY_HEAD = Array.from({ length: 5 }, (_, index) => ({ kind: 'status', label: `r${index}`, detail: 'x' }));
      const TRAILING = [
        { kind: 'usage', inputTokens: 1, outputTokens: 1 },
        { kind: 'status', label: 'tail-a', detail: 'x' },
        { kind: 'status', label: 'tail-b', detail: 'x' },
      ];

      // SIMPLIFIED DAEMON STORE (hand-written model, not the real route). It
      // keeps only the rules of PUT /api/projects/:id/conversations/:cid/messages/:mid
      // (apps/daemon/src/routes/project/conversations.ts) that decide this bug
      // for a terminal, daemon-known Run: a write with fewer events than stored
      // is refused (`shrinksEvents`); otherwise content is the strictly longer
      // of the two and events are the incoming ones. While the Run is live the
      // daemon owns the row, so client writes are ignored.
      let serverAssistant: ChatMessage | null = null;
      let serverUser: ChatMessage | null = null;
      let runTerminal = false;
      saveMessage.mockImplementation(async (_projectId: string, _conversationId: string, message: ChatMessage) => {
        await sleep(2);
        if (message.role === 'user') {
          serverUser = message;
          return;
        }
        if (!runTerminal || !serverAssistant) return;
        const incomingEvents = message.events ?? [];
        if (incomingEvents.length < (serverAssistant.events ?? []).length) return;
        const content = (message.content?.length ?? 0) > (serverAssistant.content?.length ?? 0)
          ? message.content
          : serverAssistant.content;
        serverAssistant = { ...message, content, events: incomingEvents };
      });
      listMessages.mockImplementation(async () => {
        if (!runTerminal) return [];
        await sleep(4);
        return [serverUser, serverAssistant].filter(Boolean);
      });

      let sendOptions: any = null;
      const liveStream = deferred<void>();
      streamViaDaemon.mockImplementation(async (options: any) => {
        sendOptions = options;
        options.onRunCreated(RUN_ID, RUNNING_REQUEST_PROJECTION);
        options.onRunStatus?.('running');
        return liveStream.promise;
      });
      fetchChatRunStatus.mockImplementation(async () => {
        await sleep(3);
        return succeededStatus(PARKED_PROJECTIONS.clarification_required);
      });
      // What a replay of this Run from event 0 would deliver, in paced chunks.
      reattachDaemonRun.mockImplementation(async (options: any) => {
        let eventId = 2450;
        options.onRunEventId?.(String(++eventId));
        for (const event of REPLAY_HEAD) {
          options.onRunEventId?.(String(++eventId));
          options.handlers.onAgentEvent(event);
        }
        let chunks = 0;
        for (let index = 0; index < FORM_TURN_TEXT.length; index += 3) {
          const chunk = FORM_TURN_TEXT.slice(index, index + 3);
          options.onRunEventId?.(String(++eventId));
          options.handlers.onDelta(chunk);
          options.handlers.onAgentEvent({ kind: 'text', text: chunk });
          if (++chunks % 8 === 0) await sleep(replayPauseMs);
        }
        for (const event of TRAILING) {
          options.onRunEventId?.(String(++eventId));
          options.handlers.onAgentEvent(event);
        }
        options.onRunEventId?.(String(++eventId));
        options.onRunStatus?.('succeeded');
        await options.handlers.onDone?.(FORM_TURN_TEXT);
      });

      renderProjectView();
      await sendWhenComposerReady('prompt');
      await waitFor(() => expect(sendOptions).not.toBeNull());
      for (const event of NON_TEXT) sendOptions.handlers.onAgentEvent(event);
      sendOptions.handlers.onDelta(FORM_TURN_TEXT);
      sendOptions.handlers.onAgentEvent({ kind: 'text', text: FORM_TURN_TEXT });
      for (const event of TRAILING) sendOptions.handlers.onAgentEvent(event);
      await waitFor(() => expect(textOf(assistantOf())).toBe(FORM_TURN_TEXT));
      const assistantId = assistantOf()!.id;
      // The daemon finalizes the row with the full transcript before the
      // client observes the terminal frame.
      serverAssistant = {
        ...assistantOf()!,
        content: FORM_TURN_TEXT,
        events: [...NON_TEXT, { kind: 'text', text: FORM_TURN_TEXT }, ...TRAILING] as AgentEvent[],
        runStatus: 'succeeded',
      };
      runTerminal = true;
      const renderedShapes: string[] = [];
      const sampleRendered = setInterval(() => {
        const shape = transcriptShape(textOf(chatPaneHarness.messages.find((message) => message.id === assistantId)));
        if (renderedShapes.at(-1) !== shape) renderedShapes.push(shape);
      }, 1);
      const listCallsBeforeEnd = listMessages.mock.calls.length;

      try {
        await act(async () => {
          sendOptions.onRunStatus('succeeded');
          sendOptions.handlers.onDone(FORM_TURN_TEXT);
          liveStream.resolve();
          await liveStream.promise;
          // STAGED TIMING: let the local finalizer release the Run, then land
          // one late frame cursor on the row. Any messages change in that
          // window re-runs recovery before the 150ms post-run refresh; in the
          // field that is whatever updates the row next.
          await sleep(30);
          sendOptions.onRunEventId?.('2451');
        });

        await waitFor(() => expect(probedRunIds()).toContain(RUN_ID));
        await settleStatusProbes();
        // The post-run refresh scheduled by the live terminal status.
        await waitFor(() => expect(listMessages.mock.calls.length).toBeGreaterThan(listCallsBeforeEnd));
        await act(async () => {
          await Promise.allSettled(listMessages.mock.results.map((result) => result.value));
        });
        if (reattachDaemonRun.mock.calls.length > 0) {
          // Only reached when recovery replays the Run: wait for that replay,
          // its finalizing PUTs, and the refresh its terminal status schedules.
          await act(async () => {
            await Promise.allSettled(reattachDaemonRun.mock.results.map((result) => result.value));
          });
          const listCallsAfterReplay = listMessages.mock.calls.length;
          await waitFor(
            () => expect(listMessages.mock.calls.length).toBeGreaterThan(listCallsAfterReplay),
            { timeout: 3_000 },
          );
          await act(async () => {
            await Promise.allSettled(listMessages.mock.results.map((result) => result.value));
            await Promise.allSettled(saveMessage.mock.results.map((result) => result.value));
          });
        }
      } finally {
        clearInterval(sampleRendered);
      }

      const renderedFinal = transcriptShape(textOf(chatPaneHarness.messages.find((message) => message.id === assistantId)));
      const persistedFinal = transcriptShape(textOf(serverAssistant!));
      expect({ renderedFinal, persistedFinal, renderedShapes }).toEqual({
        renderedFinal: 'clean',
        persistedFinal: 'clean',
        renderedShapes: ['clean'],
      });
      expect(reattachDaemonRun).not.toHaveBeenCalled();
    },
    20_000,
  );
});
