// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

const listConversations = vi.fn();
const fetchPreviewComments = vi.fn();
const loadTabs = vi.fn();
const fetchProjectFiles = vi.fn();
const fetchProjectDesignSystemPackageAudit = vi.fn();
const fetchLiveArtifacts = vi.fn();
const fetchSkill = vi.fn();
const fetchDesignSystem = vi.fn();
const getTemplate = vi.fn();
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

vi.mock('../../src/state/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/state/projects')>();
  return {
    ...actual,
    listConversations: (...args: unknown[]) => listConversations(...args),
    getTemplate: (...args: unknown[]) => getTemplate(...args),
    loadTabs: (...args: unknown[]) => loadTabs(...args),
    patchConversation: (...args: unknown[]) => patchConversation(...args),
    patchProject: (...args: unknown[]) => patchProject(...args),
    saveTabs: (...args: unknown[]) => saveTabs(...args),
  };
});

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

vi.mock('../../src/components/FileWorkspace', () => ({ DESIGN_SYSTEM_TAB: '__design_system__', FileWorkspace: () => null }));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => null,
}));

function renderProjectView(options?: { resolvedDir?: string | null; metadata?: unknown; byok?: boolean }) {
  const project = {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
    ...(options?.metadata ? { metadata: options.metadata } : {}),
  } as never;
  return render(
    <ProjectView
      project={project}
      initialProjectDetail={{ project, resolvedDir: options?.resolvedDir ?? null }}
      routeConversationId="conv-1"
      routeFileName={null}
      config={
        {
          mode: options?.byok ? 'api' : 'daemon',
          apiProtocol: 'openai', apiKey: 'unit-test-key', model: 'unit-test-model', baseUrl: 'https://example.invalid',
          agentId: 'agent-1',
          notifications: undefined,
          agentModels: {},
        } as never
      }
      agents={[{ id: 'agent-1', name: 'OpenCode', models: [] } as never, { id: 'byok-opencode', name: 'BYOK OpenCode', models: [], available: true } as never]}
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


const T0 = 1_789_000_000_000;
const RUN_ID = 'run-terminal-clock';
const messagesUrl = '/api/projects/project-1/conversations/conv-1/messages';

/** Exercise the real daemon provider and message HTTP serialization. Peripheral
 * project/catalog surfaces are stubbed; server merge policy is verified separately.
 * Date alone is virtual: stream delivery is controlled by explicit enqueue/close,
 * not by a wall-clock sleep or timer polling the expected outcome.
 */
describe('physical run terminal time through live delivery and transcript reload', () => {
  afterEach(() => {
    cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetAllMocks();
    window.sessionStorage.clear();
    chatPaneHarness.onSend = null; chatPaneHarness.onStop = null; chatPaneHarness.messages = [];
  });

  it.each([
    { status: 'succeeded', transport: 'sse' },
    { status: 'failed', transport: 'sse' },
    { status: 'canceled', transport: 'sse' },
    { status: 'succeeded', transport: 'legacy' },
    { status: 'succeeded', transport: 'invalid' },
    { status: 'succeeded', transport: 'byok' },
    { status: 'succeeded', transport: 'rest' },
    { status: 'succeeded', transport: 'reattach' },
    { status: 'succeeded', transport: 'successor' },
    { status: 'succeeded', transport: 'successor-legacy' },
  ] as const)(
    'retains physical terminal time for $status / $transport with late delivery', async ({ status, transport }) => {
      const expectedEnd = T0 + (transport === 'legacy' || transport === 'invalid' || transport === 'successor-legacy' ? 50_000 : 20_000);
      const renderOptions = { resolvedDir: '/workspace/project-1', byok: transport === 'byok' };
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0);
      listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
      fetchPreviewComments.mockResolvedValue([]); loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
      fetchProjectFiles.mockResolvedValue([]); fetchLiveArtifacts.mockResolvedValue([]);
      fetchSkill.mockResolvedValue(null); fetchDesignSystem.mockResolvedValue(null); getTemplate.mockResolvedValue(null);
      const stored = new Map<string, ChatMessage>();
      const submitted: ChatMessage[] = [];
      if (transport === 'reattach') stored.set('restored-assistant', {
        id: 'restored-assistant', role: 'assistant', content: '', runId: RUN_ID, runStatus: 'running',
        createdAt: T0, startedAt: T0, agentId: 'agent-1',
        events: [{ kind: 'status', label: 'starting' }],
      });
      let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
      let runCreates = 0;
      const openedStreams: string[] = [];
      const expectedRunId = transport.startsWith('successor') ? 'run-second' : RUN_ID;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/runs' && init?.method === 'POST') {
          runCreates += 1;
          return Response.json({ runId: RUN_ID }, { status: 202 });
        }
        if (url === `/api/runs/${RUN_ID}/events` || url === '/api/runs/run-second/events') {
          openedStreams.push(url);
          return new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }), {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        if (url === `/api/runs/${RUN_ID}`) {
          const active = transport === 'reattach' && Date.now() === T0;
          return Response.json({ runId: RUN_ID, status: active ? 'running' : status, createdAt: T0,
            updatedAt: active ? T0 : T0 + 50_000, terminalAt: active ? null : T0 + 20_000,
            exitCode: active ? null : status === 'failed' ? 1 : 0, artifactCount: 0 });
        }
        if (url === messagesUrl) return Response.json({ messages: [...stored.values()] });
        if (url.startsWith(`${messagesUrl}/`) && init?.method === 'PUT') {
          const message = JSON.parse(String(init.body)) as ChatMessage;
          submitted.push(message); stored.set(message.id, message);
          return Response.json({ message });
        }
        if (url.startsWith('/api/runs')) return Response.json({ runs: [] });
        return Response.json({});
      });
      vi.stubGlobal('fetch', fetchMock);
      const view = renderProjectView(renderOptions);
      await waitFor(() => expect(chatPaneHarness.onSend).toBeTypeOf('function'));
      if (transport !== 'reattach') await act(async () => { void chatPaneHarness.onSend?.('Reply with the result.', [], []); });
      await waitFor(() => expect(stream).toBeDefined());
      if (!stream) throw new Error('The real provider did not open its SSE subscription.');
      const encoder = new TextEncoder();
      await act(async () => {
        stream!.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({ runId: RUN_ID, agentId: 'agent-1' })}\n\n`));
        stream!.enqueue(encoder.encode(`event: agent\ndata: ${JSON.stringify({ type: 'text_delta', delta: 'The result is ready.' })}\n\n`));
      });
      await waitFor(() => expect(chatPaneHarness.messages.find(message => message.role === 'assistant')?.runStatus).toBe('running'));
      if (transport.startsWith('successor')) {
        await act(async () => {
          stream!.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ status: 'succeeded', code: 0, terminalAt: T0 + 10_000,
            strategyTask: { taskExecutionId: 'clock-task', strategy: { id: 'od-next-strategy', version: '2.0.0', packageHash: 'a'.repeat(64), snapshotId: 'clock-snapshot' },
              inputStage: 'production', route: 'full_plan', executionMode: 'simple', outcome: 'running', terminal: false, activeRunId: 'run-second' } })}\n\n`));
          stream!.close();
        });
        await waitFor(() => expect(openedStreams).toHaveLength(2));
        await act(async () => {
          stream!.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({ runId: 'run-second', agentId: 'agent-1' })}\n\n`));
          stream!.enqueue(encoder.encode(`event: agent\ndata: ${JSON.stringify({ type: 'text_delta', delta: ' Final delivery.' })}\n\n`));
        });
        await waitFor(() => expect(chatPaneHarness.messages.some(message => message.runId === 'run-second')).toBe(true));
      }
      vi.setSystemTime(T0 + 50_000);
      await act(async () => {
        if (transport === 'rest') {
          stream!.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: 'upstream stream interrupted' })}\n\n`));
        } else {
          stream!.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ status, code: status === 'failed' ? 1 : 0,
            ...((transport === 'legacy' || transport === 'successor-legacy') ? {} : { terminalAt: transport === 'invalid' ? 'not-a-timestamp' : T0 + 20_000 }), artifactCount: 0 })}\n\n`));
        }
        stream!.close();
      });
      await waitFor(() => expect(submitted.some(message => message.role === 'assistant' && message.runStatus === status && message.endedAt !== undefined)).toBe(true));
      const terminal = submitted.filter(message => message.role === 'assistant' && message.runStatus === status).at(-1);
      expect(terminal).toBeDefined(); if (!terminal) throw new Error('No terminal transcript PUT.');
      expect(runCreates).toBe(transport === 'reattach' ? 0 : 1);
      expect(terminal.runId).toBe(expectedRunId);
      expect(terminal.startedAt).toBe(T0);
      expect.soft(terminal.endedAt).toBe(expectedEnd);
      view.unmount(); chatPaneHarness.messages = []; vi.setSystemTime(T0 + 110_000);
      renderProjectView(renderOptions);
      await waitFor(() => expect(chatPaneHarness.messages.find(message => message.id === terminal.id)?.runStatus).toBe(status));
      expect.soft(chatPaneHarness.messages.find(message => message.id === terminal.id)?.endedAt).toBe(expectedEnd);
      expect(runCreates).toBe(transport === 'reattach' ? 0 : 1);
    },
  );

  it.each([false, true])('preserves a real run-admission failure without timing (BYOK=%s)', async byok => {
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Conversation' }]);
    fetchPreviewComments.mockResolvedValue([]); loadTabs.mockResolvedValue({ tabs: [], activeTabId: null });
    fetchProjectFiles.mockResolvedValue([]); fetchLiveArtifacts.mockResolvedValue([]);
    fetchSkill.mockResolvedValue(null); fetchDesignSystem.mockResolvedValue(null); getTemplate.mockResolvedValue(null);
    const stored = new Map<string, ChatMessage>();
    const submitted: ChatMessage[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/runs' && init?.method === 'POST') {
        return Response.json({ error: { code: 'AGENT_AUTH_REQUIRED', message: 'Agent authentication is required.' } }, { status: 401 });
      }
      if (url === messagesUrl) return Response.json({ messages: [...stored.values()] });
      if (url.startsWith(`${messagesUrl}/`) && init?.method === 'PUT') {
        const message = JSON.parse(String(init.body)) as ChatMessage;
        submitted.push(message); stored.set(message.id, message);
        return Response.json({ message });
      }
      if (url.startsWith('/api/runs')) return Response.json({ runs: [] });
      return Response.json({});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProjectView({ resolvedDir: '/workspace/project-1', byok });
    await waitFor(() => expect(chatPaneHarness.onSend).toBeTypeOf('function'));
    await act(async () => { await chatPaneHarness.onSend?.('Reply with the result.', [], []); });
    if (byok) {
      // Preserve the existing API error presentation, including its real cause.
      await waitFor(() => expect(chatPaneHarness.messages.find(message => message.role === 'assistant')?.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'status', label: 'error', code: 'AGENT_AUTH_REQUIRED', detail: 'Agent authentication is required.' })]),
      ));
      expect(chatPaneHarness.messages.find(message => message.role === 'assistant')?.runStatus).toBe('failed');
    } else {
      // No physical run was admitted: retain the failed user send and remove its placeholder.
      await waitFor(() => expect(submitted.some(message => message.role === 'user' && message.sendFailed === true)).toBe(true));
      expect(chatPaneHarness.messages.filter(message => message.role === 'assistant')).toEqual([]);
      expect(submitted.filter(message => message.role === 'assistant')).toEqual([]);
    }
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/runs' && init?.method === 'POST')).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/events'))).toBe(false);
    expect(submitted.every(message => message.runId === undefined)).toBe(true);
  });

});
