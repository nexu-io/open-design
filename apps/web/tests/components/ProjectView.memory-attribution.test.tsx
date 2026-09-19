// @vitest-environment jsdom
import type { DaemonStreamOptions } from '../../src/providers/daemon';

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

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
  onStop: null as null | (() => void),
  messages: [] as ChatMessage[],
}));

vi.mock('../../src/i18n', () => ({
  // ProjectView calls useI18n() (for locale/t); mock it like the other
  // ProjectView suites so the render does not throw on a missing export.
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
    onStop,
  }: {
    messages: ChatMessage[];
    onSend: typeof chatPaneHarness.onSend;
    onStop: typeof chatPaneHarness.onStop;
  }) => {
    chatPaneHarness.messages = messages;
    chatPaneHarness.onSend = onSend;
    chatPaneHarness.onStop = onStop;
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

function projectView(options?: {
  resolvedDir?: string | null;
  projectId?: string;
  routeConversationId?: string | null;
  apiMode?: boolean;
}) {
  const project = {
    id: options?.projectId ?? 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
  } as never;
  const view = (
    <ProjectView
      project={project}
      initialProjectDetail={{ project, resolvedDir: options?.resolvedDir ?? null }}
      routeConversationId={options?.routeConversationId ?? null}
      routeFileName={null}
      config={
        {
          mode: 'daemon',
          agentId: 'agent-1',
          notifications: undefined,
          agentModels: {},
          ...(options?.apiMode ? {
            mode: 'api', agentId: null, apiProtocol: 'openai', apiKey: 'byok-test-key',
            baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat',
          } : {}),
        } as never
      }
      agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never,
        { id: 'byok-opencode', name: 'BYOK OpenCode', bin: 'opencode', available: true, models: [] } as never]}
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
    />
  );
  return view;
}


const originalFetch = globalThis.fetch;

function memoryMessages(messages: ChatMessage[]) {
  return messages.filter((message) => message.content.includes('<od-card type="memory-applied">'));
}

describe('OPEND-2944 delayed memory summaries keep their originating conversation', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
    globalThis.fetch = originalFetch;
    chatPaneHarness.onSend = null;
    chatPaneHarness.messages = [];
    window.sessionStorage.clear();
  });

  it.each(['stay', 'conversation', 'project', 'conversation-running', 'project-running', 'unmount', 'conversation-running-late-record', 'conversation-running-early-record', 'conversation-running-completed-before-summary'] as const)(
    'persists A memory once and keeps B history clean after %s navigation', async (navigation) => {
      const stored = new Map<string, ChatMessage[]>();
      listConversations.mockImplementation(async (projectId: string) => projectId === 'project-1'
        ? [{ id: 'conv-1', title: 'A' }, { id: 'conv-2', title: 'B' }]
        : [{ id: 'conv-3', title: 'Other project' }]);
      listMessages.mockImplementation(async (projectId: string, conversationId: string) =>
        stored.get(`${projectId}:${conversationId}`) ?? []);
      const { saveMessage: persistMessage } = await vi.importActual<typeof import('../../src/state/projects')>('../../src/state/projects');
      saveMessage.mockImplementation(persistMessage);
      const memoryRequests: string[] = [];
      fetchPreviewComments.mockResolvedValue([]);
      loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
      fetchLiveArtifacts.mockResolvedValue([]);
      fetchSkill.mockResolvedValue(null);
      fetchDesignSystem.mockResolvedValue(null);
      getTemplate.mockResolvedValue(null);
      listActiveChatRuns.mockResolvedValue([]);
      listProjectRuns.mockResolvedValue([]);
      fetchProjectFiles.mockResolvedValue([]);
      let captured: DaemonStreamOptions | undefined;
      streamViaDaemon.mockImplementation(async (options: DaemonStreamOptions) => {
        captured = options;
        options.onRunCreated?.('run-memory-a');
        return new Promise<void>(() => {});
      });
      const lateRecord = navigation.endsWith('-record');
      const extractionStartedBeforeB = navigation === 'conversation-running-early-record';
      let extractionStartedAt: number | undefined;
      let extractionPolls = 0;
      let exposeExtraction = !lateRecord;
      let releaseSummaries: ((response: Response) => void) | undefined;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const messagePath = /^\/api\/projects\/([^/]+)\/conversations\/([^/]+)\/messages\/([^/]+)$/.exec(url);
        if (messagePath && init?.method === 'PUT') {
          const message = JSON.parse(String(init.body)) as ChatMessage;
          const key = `${messagePath[1]}:${messagePath[2]}`;
          const previous = stored.get(key) ?? [];
          stored.set(key, [...previous.filter((item) => item.id !== message.id), message]);
          if (memoryMessages([message]).length) memoryRequests.push(url);
          return Response.json({ message });
        }
        if (input.toString() === '/api/memory/extractions') {
          extractionPolls += 1;
          if (!exposeExtraction) return Response.json({ extractions: [] });
          return Response.json({ extractions: [{
            id: 'extraction-a', kind: 'llm',
            startedAt: extractionStartedAt ?? Date.now(), finishedAt: Date.now(), phase: 'success',
            writtenCount: 1, writtenIds: ['rule_from_a'],
          }] });
        }
        if (input.toString() === '/api/memory') {
          return new Promise<Response>((resolve) => { releaseSummaries = resolve; });
        }
        return Response.json({});
      }) as typeof fetch;
      const view = render(projectView({ routeConversationId: 'conv-1' }));
      await waitFor(() => expect(listMessages.mock.calls.some((call) => call[0] === 'project-1' && call[1] === 'conv-1')).toBe(true));
      await waitFor(() => expect(chatPaneHarness.onSend).not.toBeNull());
      // The race is controlled by the summary promise. Fake only polling time,
      // after the real ProjectView has loaded its initial transcript.
      vi.useFakeTimers();
      await act(async () => { void chatPaneHarness.onSend!('Remember my preference', [], []); });
      expect(captured).toBeDefined();
      await act(async () => {
        captured!.handlers.onDelta('Saved preference');
        captured!.onRunStatus?.('succeeded');
        captured!.handlers.onDone('Saved preference');
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      if (lateRecord) {
        expect(extractionPolls).toBe(1);
        expect(releaseSummaries).toBeUndefined();
        // Preserve a real extraction start timestamp independently of when
        // its successful record finally becomes visible to the poller.
        if (extractionStartedBeforeB) extractionStartedAt = Date.now();
        // B starts strictly later than A and the early extraction.
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      } else {
        expect(releaseSummaries).toBeDefined();
      }

      let projectId = 'project-1';
      let conversationId = 'conv-1';
      if (navigation.startsWith('project')) {
        projectId = 'project-2';
        conversationId = 'conv-3';
      } else if (navigation.startsWith('conversation')) {
        conversationId = 'conv-2';
      }
      await act(async () => { view.rerender(projectView({ projectId, routeConversationId: conversationId })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(listMessages.mock.calls.some((call) => call[0] === projectId && call[1] === conversationId)).toBe(true);
      if (navigation.includes('running')) {
        await act(async () => { void chatPaneHarness.onSend!('B starts another task', [], []); });
        expect(captured?.conversationId).toBe(conversationId);
      }
      if (navigation === 'conversation-running-completed-before-summary') {
        // A's first poll selected its record and is still awaiting summaries,
        // so its remaining budget is still MAX. Completing B must not cancel
        // that selected A result or leave it permanently consumed in `seen`.
        expect(releaseSummaries).toBeDefined();
        expect(memoryRequests).toHaveLength(0);
        await act(async () => {
          captured!.handlers.onDelta('B completed while A summary was pending');
          captured!.onRunStatus?.('succeeded');
          captured!.handlers.onDone('B completed while A summary was pending');
        });
      }
      if (lateRecord) {
        // A's already-scheduled retry still has A's closure. Keep the queue
        // empty through that retry so the following retry is scheduled while
        // B is active: this is where the mutable owner ref used to be reread.
        await act(async () => { await vi.advanceTimersByTimeAsync(2_998); });
        expect(extractionPolls).toBe(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(extractionPolls).toBe(2);
        expect(releaseSummaries).toBeUndefined();
        expect(memoryRequests).toHaveLength(0);
        if (!extractionStartedBeforeB) extractionStartedAt = Date.now();
        exposeExtraction = true;
        await act(async () => { await vi.advanceTimersByTimeAsync(2_999); });
        expect(extractionPolls).toBe(2);
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(extractionPolls).toBe(3);
        expect(releaseSummaries).toBeDefined();
      }
      if (navigation === 'unmount') view.unmount();
      await act(async () => {
        releaseSummaries!(Response.json({ entries: [{ id: 'rule_from_a', name: 'A preference', type: 'rule' }] }));
      });

      const writes = saveMessage.mock.calls.filter((call) => memoryMessages([call[2]]).length);
      if (navigation === 'unmount') {
        expect(writes).toHaveLength(0);
        expect(memoryRequests).toHaveLength(0);
        return;
      }
      expect(writes).toHaveLength(1);
      expect(memoryRequests).toEqual([`/api/projects/project-1/conversations/conv-1/messages/${writes[0]![2].id}`]);
      expect(writes[0]!.slice(0, 2)).toEqual(['project-1', 'conv-1']);
      expect(writes[0]![2].content).toContain('A preference');
      expect(memoryMessages(chatPaneHarness.messages)).toHaveLength(navigation === 'stay' ? 1 : 0);
      if (navigation !== 'stay') {
        expect(memoryMessages(stored.get(`${projectId}:${conversationId}`) ?? [])).toHaveLength(0);
        await act(async () => { view.rerender(projectView({ projectId: 'project-1', routeConversationId: 'conv-1' })); });
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(memoryMessages(chatPaneHarness.messages)).toHaveLength(1);
        expect(memoryMessages(chatPaneHarness.messages)[0]!.content).toContain('A preference');
        // Returning to A cannot create a second host message for the same attempt.
        expect(memoryRequests).toHaveLength(1);
      }
    },
  );

  it.each(['BYOK sending draft', 'observed physical successor runs'] as const)('preserves positive ownership for %s', async scenario => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Chat' }]);
    listMessages.mockResolvedValue([]);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    listProjectRuns.mockResolvedValue([]);
    fetchProjectFiles.mockResolvedValue([]);
    const { saveMessage: persistMessage } = await vi.importActual<typeof import('../../src/state/projects')>('../../src/state/projects');
    saveMessage.mockImplementation(persistMessage);
    let stream: DaemonStreamOptions | undefined;
    streamViaDaemon.mockImplementation(async (options: DaemonStreamOptions) => { stream = options; return new Promise<void>(() => {}); });
    const preflights: Record<string, unknown>[] = [];
    const records: unknown[] = [];
    const puts: ChatMessage[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/memory/extract') { preflights.push(JSON.parse(String(init?.body))); return Response.json({ changed: [], attemptedLLM: false }); }
      if (url === '/api/memory/extractions') return Response.json({ extractions: records });
      if (url === '/api/memory/system-prompt') return Response.json({ body: '' });
      if (url === '/api/memory') return Response.json({ entries: [
        { id: 'rule_from_a', name: 'A preference', type: 'rule' }, { id: 'rule_from_b', name: 'B preference', type: 'rule' },
        { id: 'rule_foreign', name: 'Foreign preference', type: 'rule' },
      ] });
      if (url.includes('/messages/') && init?.method === 'PUT') {
        const message = JSON.parse(String(init.body)) as ChatMessage;
        if (memoryMessages([message]).length) puts.push(message);
        return Response.json({ message });
      }
      return Response.json({});
    }) as typeof fetch;
    render(projectView({ routeConversationId: 'conv-1', apiMode: scenario === 'BYOK sending draft' }));
    await waitFor(() => expect(listMessages.mock.calls.some(call => call[1] === 'conv-1')).toBe(true));
    await waitFor(() => expect(chatPaneHarness.onSend).not.toBeNull());
    vi.useFakeTimers();
    await act(async () => { void chatPaneHarness.onSend!('Remember a preference', [], []); });
    expect(stream).toBeDefined();
    const run = stream!;
    if (scenario === 'BYOK sending draft') {
      expect(run.agentId).toBe('byok-opencode');
      expect(preflights).toHaveLength(1);
      expect(preflights[0]).toMatchObject({ projectId: 'project-1', conversationId: 'conv-1', assistantMessageId: run.assistantMessageId });
      return;
    }
    // Real provider loops call onRunCreated for each successor without an
    // intermediate terminal status. Batch both callbacks into one React commit
    // so deriving an observed set from rendered latest runId cannot fake green.
    await act(async () => {
      run.onRunCreated?.('physical-a');
      run.onRunStatus?.('running');
      run.onRunCreated?.('physical-b', {
        taskExecutionId: 'task-memory', strategy: { id: 'od-next-strategy', version: '1', packageHash: 'a'.repeat(64), snapshotId: 'snapshot-memory' },
        inputStage: 'production', outcome: 'running', route: 'full_plan', executionMode: 'complex', activeRunId: 'physical-b', terminal: false,
      });
      run.onRunStatus?.('running');
    });
    expect(chatPaneHarness.messages.find(message => message.id === run.assistantMessageId)?.runId).toBe('physical-b');
    for (const [name, runId, assistantMessageId] of [
      ['a', 'physical-a', run.assistantMessageId],
      ['b', 'physical-b', 'odnext_assistant_server_successor'],
      ['foreign', 'foreign-run', 'foreign-assistant'],
    ]) records.push({
      id: `extraction-${name}`, kind: 'llm', phase: 'success', startedAt: Date.now(), finishedAt: Date.now(), writtenCount: 1, writtenIds: [`rule_${name === 'foreign' ? 'foreign' : `from_${name}`}`],
      extractionOrigin: { projectId: 'project-1', conversationId: 'conv-1', runId, assistantMessageId },
    });
    await act(async () => { run.handlers.onDelta('Done'); run.onRunStatus?.('succeeded'); run.handlers.onDone('Done'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(puts).toHaveLength(2);
    expect(puts.map(message => message.content).join('\n')).toContain('A preference');
    expect(puts.map(message => message.content).join('\n')).toContain('B preference');
    expect(puts.map(message => message.content).join('\n')).not.toContain('Foreign preference');
  });

  it('keeps a delayed B run id when an A host notification is appended after the B draft', async () => {
    const stored = new Map<string, ChatMessage[]>();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'A and B' }]);
    listMessages.mockImplementation(async (projectId: string, conversationId: string) => stored.get(`${projectId}:${conversationId}`) ?? []);
    const { saveMessage: persistMessage } = await vi.importActual<typeof import('../../src/state/projects')>('../../src/state/projects');
    saveMessage.mockImplementation(persistMessage);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    listProjectRuns.mockResolvedValue([]);
    fetchProjectFiles.mockResolvedValue([]);
    const streams: DaemonStreamOptions[] = [];
    streamViaDaemon.mockImplementation(async (options: DaemonStreamOptions) => {
      streams.push(options);
      if (streams.length === 1) options.onRunCreated?.('run-memory-a');
      return new Promise<void>(() => {});
    });
    const records: unknown[] = [];
    const puts: ChatMessage[] = [];
    const record = (letter: 'a' | 'b') => ({
      id: `extraction-${letter}`, kind: 'llm', startedAt: Date.now(), finishedAt: Date.now(), phase: 'success',
      writtenCount: 1, writtenIds: [`rule_from_${letter}`],
      extractionOrigin: { projectId: 'project-1', conversationId: 'conv-1', runId: `run-memory-${letter}` },
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const match = /^\/api\/projects\/([^/]+)\/conversations\/([^/]+)\/messages\/([^/]+)$/.exec(url);
      if (match && init?.method === 'PUT') {
        const message = JSON.parse(String(init.body)) as ChatMessage;
        const key = `${match[1]}:${match[2]}`;
        const previous = stored.get(key) ?? [];
        stored.set(key, [...previous.filter(item => item.id !== message.id), message]);
        if (memoryMessages([message]).length) puts.push(message);
        return Response.json({ message });
      }
      if (url === '/api/memory/extractions') return Response.json({ extractions: records });
      if (url === '/api/memory') return Response.json({ entries: [
        { id: 'rule_from_a', name: 'A preference', type: 'rule' }, { id: 'rule_from_b', name: 'B preference', type: 'rule' },
      ] });
      return Response.json({});
    }) as typeof fetch;
    render(projectView({ routeConversationId: 'conv-1' }));
    await waitFor(() => expect(listMessages.mock.calls.some(call => call[0] === 'project-1' && call[1] === 'conv-1')).toBe(true));
    await waitFor(() => expect(chatPaneHarness.onSend).not.toBeNull());
    vi.useFakeTimers();
    await act(async () => { void chatPaneHarness.onSend!('A preference', [], []); });
    expect(streams).toHaveLength(1);
    await act(async () => {
      streams[0]!.handlers.onDelta('A done');
      streams[0]!.onRunStatus?.('succeeded');
      streams[0]!.handlers.onDone('A done');
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { void chatPaneHarness.onSend!('B preference', [], []); });
    expect(streams).toHaveLength(2);
    records.push(record('a'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(puts).toHaveLength(1);
    expect(puts[0]!.content).toContain('A preference');
    const bDraftId = streams[1]!.assistantMessageId;
    const bDraftIndex = chatPaneHarness.messages.findIndex(message => message.id === bDraftId);
    const hostIndex = chatPaneHarness.messages.findIndex(message => message.id === puts[0]!.id);
    expect(bDraftIndex).toBeGreaterThanOrEqual(0);
    expect(hostIndex).toBeGreaterThan(bDraftIndex);
    await act(async () => { streams[1]!.onRunCreated?.('run-memory-b'); });
    expect(chatPaneHarness.messages.find(message => message.id === bDraftId)?.runId).toBe('run-memory-b');
    expect(chatPaneHarness.messages.at(-1)?.id).toBe(puts[0]!.id);
    records.push(record('b'));
    await act(async () => {
      streams[1]!.handlers.onDelta('B done');
      streams[1]!.onRunStatus?.('succeeded');
      streams[1]!.handlers.onDone('B done');
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(puts).toHaveLength(2);
    expect(puts[1]!.content).toContain('B preference');
  });

  it.each([
    { start: 'early', arrival: 'A-first' },
    { start: 'late', arrival: 'A-first' },
    { start: 'early', arrival: 'B-first' },
    { start: 'late', arrival: 'B-first' },
  ] as const)('retains both completed windows when A starts $start and arrives $arrival', async ({ start, arrival }) => {
    const stored = new Map<string, ChatMessage[]>();
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'A' }, { id: 'conv-2', title: 'B' }]);
    listMessages.mockImplementation(async (projectId: string, conversationId: string) =>
      stored.get(`${projectId}:${conversationId}`) ?? []);
    const { saveMessage: persistMessage } = await vi.importActual<typeof import('../../src/state/projects')>('../../src/state/projects');
    saveMessage.mockImplementation(persistMessage);
    fetchPreviewComments.mockResolvedValue([]);
    loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null);
    fetchDesignSystem.mockResolvedValue(null);
    getTemplate.mockResolvedValue(null);
    listActiveChatRuns.mockResolvedValue([]);
    listProjectRuns.mockResolvedValue([]);
    fetchProjectFiles.mockResolvedValue([]);
    const streams: DaemonStreamOptions[] = [];
    streamViaDaemon.mockImplementation(async (options: DaemonStreamOptions) => {
      streams.push(options);
      options.onRunCreated?.(streams.length === 1 ? 'run-memory-a' : 'run-memory-b');
      return new Promise<void>(() => {});
    });
    // Proposed additive wire contract. These owners are supplied explicitly by
    // the producing run, never inferred from record ordering or preview text.
    // Companion daemon specs must prove that production actually emits them.
    type OwnedRecord = {
      id: string; kind: 'llm'; startedAt: number; finishedAt: number;
      phase: 'success'; writtenCount: number; writtenIds: string[];
      extractionOrigin: { projectId: string; conversationId: string; runId: string };
    };
    const exposed: OwnedRecord[] = [];
    let polls = 0;
    const puts: Array<{ conversationId: string; message: ChatMessage }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const match = /^\/api\/projects\/([^/]+)\/conversations\/([^/]+)\/messages\/([^/]+)$/.exec(url);
      if (match && init?.method === 'PUT') {
        const message = JSON.parse(String(init.body)) as ChatMessage;
        const key = `${match[1]}:${match[2]}`;
        const previous = stored.get(key) ?? [];
        stored.set(key, [...previous.filter(item => item.id !== message.id), message]);
        if (memoryMessages([message]).length) puts.push({ conversationId: match[2]!, message });
        return Response.json({ message });
      }
      if (url === '/api/memory/extractions') {
        polls += 1;
        return Response.json({ extractions: exposed });
      }
      if (url === '/api/memory') return Response.json({ entries: [
        { id: 'rule_from_a', name: 'A preference', type: 'rule' },
        { id: 'rule_from_b', name: 'B preference', type: 'rule' },
      ] });
      return Response.json({});
    }) as typeof fetch;
    const view = render(projectView({ routeConversationId: 'conv-1' }));
    await waitFor(() => expect(listMessages.mock.calls.some(call => call[0] === 'project-1' && call[1] === 'conv-1')).toBe(true));
    await waitFor(() => expect(chatPaneHarness.onSend).not.toBeNull());
    vi.useFakeTimers();
    await act(async () => { void chatPaneHarness.onSend!('A preference', [], []); });
    expect(streams).toHaveLength(1);
    const complete = async (stream: DaemonStreamOptions) => {
      await act(async () => {
        stream.handlers.onDelta('Completed');
        stream.onRunStatus?.('succeeded');
        stream.handlers.onDone('Completed');
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    };
    await complete(streams[0]!);
    expect(polls).toBe(1);
    const earlyStartedAt = Date.now();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { view.rerender(projectView({ routeConversationId: 'conv-2' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { void chatPaneHarness.onSend!('B preference', [], []); });
    expect(streams).toHaveLength(2);
    const bStartedAt = Date.now();
    await complete(streams[1]!);
    // A is still absent when B finishes; A's original budget has not expired.
    expect(puts).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const records: Record<'A' | 'B', OwnedRecord> = {
      A: { id: 'extraction-a', kind: 'llm', startedAt: start === 'early' ? earlyStartedAt : Date.now(),
        finishedAt: Date.now(), phase: 'success', writtenCount: 1, writtenIds: ['rule_from_a'],
        extractionOrigin: { projectId: 'project-1', conversationId: 'conv-1', runId: 'run-memory-a' } },
      B: { id: 'extraction-b', kind: 'llm', startedAt: bStartedAt,
        finishedAt: Date.now(), phase: 'success', writtenCount: 1, writtenIds: ['rule_from_b'],
        extractionOrigin: { projectId: 'project-1', conversationId: 'conv-2', runId: 'run-memory-b' } },
    };
    exposed.push(records[arrival === 'A-first' ? 'A' : 'B']);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    // A-first and B-first both exercise real message persistence. A queued
    // implementation may defer B, but must never persist either card to the
    // other conversation while awaiting its own record.
    expect(puts.some(put => put.message.content.includes('A preference') && put.conversationId !== 'conv-1')).toBe(false);
    expect(puts.some(put => put.message.content.includes('B preference') && put.conversationId !== 'conv-2')).toBe(false);
    exposed.unshift(records[arrival === 'A-first' ? 'B' : 'A']);
    // Two bounded retry intervals allow one serial window per tick; this is
    // inside each original 12-poll budget, not a wait-until-success loop.
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(puts.map(put => ({ conversationId: put.conversationId, preference:
      put.message.content.includes('A preference') ? 'A' : 'B' }))).toEqual(expect.arrayContaining([
      { conversationId: 'conv-1', preference: 'A' },
      { conversationId: 'conv-2', preference: 'B' },
    ]));
    expect(puts).toHaveLength(2);
    expect(memoryMessages(stored.get('project-1:conv-1') ?? [])).toHaveLength(1);
    expect(memoryMessages(stored.get('project-1:conv-2') ?? [])).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(puts).toHaveLength(2);
  });
});
