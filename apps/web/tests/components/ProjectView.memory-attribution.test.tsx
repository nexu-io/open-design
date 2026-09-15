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

  it.each(['stay', 'conversation', 'project', 'conversation-running', 'project-running', 'unmount'] as const)(
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
          return Response.json({ extractions: [{
            id: 'extraction-a', kind: 'llm', startedAt: Date.now(), phase: 'success',
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
      expect(releaseSummaries).toBeDefined();

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
      if (navigation.endsWith('running')) {
        await act(async () => { void chatPaneHarness.onSend!('B starts another task', [], []); });
        expect(captured?.conversationId).toBe(conversationId);
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
});
