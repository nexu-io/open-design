// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { navigationTiming } from '../../src/observability/navigation-timing';
import { reportSafetyEvent } from '../../src/analytics/error-tracking';
import { ProjectView } from '../../src/components/ProjectView';
import { navigate, registerNavigationGuard, useRoute } from '../../src/router';
import type {
  AgentInfo,
  AppConfig,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';
import {
  cacheTabsLocally,
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
} from '../../src/state/projects';
import { fetchPreviewComments, fetchProjectFiles } from '../../src/providers/registry';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (key: string) => key,
  }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/analytics/error-tracking', () => ({ reportSafetyEvent: vi.fn() }));

vi.mock('../../src/providers/anthropic', () => ({
  streamMessage: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn(),
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
    registerQueuedSubmission: vi.fn(async (projectId, submission) => ({
      id: submission.id, projectId, conversationId: submission.conversationId, acceptedAt: submission.submittedAt,
    })),
    cacheTabsLocally: vi.fn((_projectId: string, state: { tabs: string[]; active: string | null }) => state),
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn(),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    persistTabsToDaemonNow: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
}));

vi.mock('../../src/components/AvatarMenu', () => ({
  AvatarMenu: () => null,
}));

vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: ({ tabsState, onTabsStateChange, designSystemProject, openRequest }: {
    tabsState: { tabs: string[]; active: string | null };
    onTabsStateChange: (state: { tabs: string[]; active: string | null }) => void;
    designSystemProject?: DesignSystemSummary | null;
    openRequest?: { name: string; nonce: number } | null;
  }) => {
    useEffect(() => {
      if (!openRequest?.name) return;
      if (tabsState.active === openRequest.name && tabsState.tabs.includes(openRequest.name)) return;
      const tabs = tabsState.tabs.includes(openRequest.name)
        ? tabsState.tabs
        : [...tabsState.tabs, openRequest.name];
      onTabsStateChange({ tabs, active: openRequest.name });
    }, [onTabsStateChange, openRequest?.name, openRequest?.nonce, tabsState.tabs]);
    return (
      <div data-testid="file-workspace">
        <output data-testid="workspace-active-tab">{tabsState.active ?? ''}</output>
        <output data-testid="workspace-design-system-id">{designSystemProject?.id ?? ''}</output>
        <button
          type="button"
          data-testid="close-all-tabs"
          onClick={() => onTabsStateChange({ tabs: [], active: null })}
        >
          close all tabs
        </button>
      </div>
    );
  },
}));

vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));

vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: ({ onSelectConversation }: { onSelectConversation: (id: string) => void }) => (
    <div data-testid="chat-pane">
      <button onClick={() => onSelectConversation('conv-2')}>Switch conversation</button>
    </div>
  ),
}));

const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedCacheTabsLocally = vi.mocked(cacheTabsLocally);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);

const config: AppConfig = {
  mode: 'api',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

const project: Project = {
  id: 'project-1',
  name: 'Project 1',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
};

const conversation: Conversation = {
  id: 'conv-1',
  projectId: project.id,
  title: null,
  createdAt: 1,
  updatedAt: 1,
};

function renderProjectView(props?: {
  project?: Project;
  designSystems?: DesignSystemSummary[];
  routeFileName?: string | null;
  routeConversationId?: string | null;
  materializationPending?: boolean;
}) {
  function RoutedProjectView() {
    const route = useRoute();
    useLayoutEffect(() => navigationTiming.observeRoute(route), [route]);
    return <ProjectView
      project={props?.project ?? project}
      initialMaterializationPending={props?.materializationPending}
      initialProjectDetail={{ project: props?.project ?? project, resolvedDir: null }}
      initialWorkspaceScope={{ kind: 'unbound', projectId: (props?.project ?? project).id, workspaceId: null, context: null }}
      routeFileName={props?.routeFileName ?? null}
      routeConversationId={props?.routeConversationId ?? (route.kind === 'project' ? route.conversationId : null)}
      config={config}
      agents={[] as AgentInfo[]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={props?.designSystems ?? ([] as DesignSystemSummary[])}
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
    />;
  }
  return render(<RoutedProjectView />);
}


function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function results() {
  return vi.mocked(reportSafetyEvent).mock.calls
    .filter(([name]) => name === 'client_navigation_result')
    .map(([, props]) => props);
}

beforeEach(() => {
  navigationTiming.cancel('page_exit');
  vi.clearAllMocks();
  navigate({ kind: 'project', projectId: project.id, conversationId: conversation.id, fileName: null }, { replace: true });
  mockedListConversations.mockResolvedValue([conversation]);
  mockedCreateConversation.mockResolvedValue(conversation);
  mockedListMessages.mockResolvedValue([]);
  mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
  mockedFetchProjectFiles.mockResolvedValue([]);
  mockedFetchPreviewComments.mockResolvedValue([]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});
afterEach(() => {
  cleanup();
  navigationTiming.cancel('page_exit');
  vi.unstubAllGlobals();
});

describe('ProjectView business Ready wiring', () => {
  it.each(['rejected', 'pending'] as const)('observes existing conversation reconciliation while the router guard is %s', async (mode) => {
    mockedListConversations.mockResolvedValue([conversation, { ...conversation, id: 'conv-2' }]);
    renderProjectView();
    await screen.findByTestId('chat-pane');
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalled());
    const gate = deferred<boolean>();
    const guard = vi.fn(() => gate.promise);
    const unregister = registerNavigationGuard(guard);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Switch conversation' }));
      await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
      expect(results().map(e => e?.status)).toEqual(['started']);
      expect(window.location.pathname).toContain('conv-1');
      await act(async () => { gate.resolve(mode === 'pending'); });
      // The original handler mutates conversation state before the guard.
      // Its route reconciliation can supersede this request; instrumentation
      // observes that cancellation instead of moving mutations behind a guard.
      await waitFor(() => expect(results().map(e => e?.status)).toEqual(['started', 'cancelled']));
      expect(results().at(-1)?.reason).toBe('superseded');
      expect(window.location.pathname).toContain(mode === 'rejected' ? 'conv-1' : 'conv-2');
    } finally { unregister(); }
  });

  it('waits for the current transcript, then reports actionable Ready exactly once', async () => {
    const messages = deferred<Awaited<ReturnType<typeof listMessages>>>();
    mockedListMessages.mockReturnValue(messages.promise);
    navigationTiming.begin({ kind: 'home', view: 'projects' }, { projectId: project.id });
    renderProjectView();
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalled());
    expect(results()[0]?.result).toBe('started');
    expect(results().some(e => e?.result === 'ready')).toBe(false);
    await act(async () => { messages.resolve([]); });
    await waitFor(() => expect(results().map((e) => e?.status)).toEqual(['started', 'first_visible', 'ready']));
    expect(results().at(-1)?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('measures a conversation switch from its handler and waits for the new transcript', async () => {
    mockedListConversations.mockResolvedValue([conversation, { ...conversation, id: 'conv-2' }]);
    const second = deferred<Awaited<ReturnType<typeof listMessages>>>();
    mockedListMessages.mockImplementation(async (_projectId, conversationId) =>
      conversationId === 'conv-2' ? second.promise : []);
    renderProjectView();
    await screen.findByTestId('chat-pane');
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalled());
    expect(results()).toEqual([]); // mounting is not a navigation intent
    fireEvent.click(screen.getByRole('button', { name: 'Switch conversation' }));
    expect(results()[0]?.result).toBe('started');
    expect(results().some(e => e?.result === 'ready')).toBe(false);
    await act(async () => { second.resolve([]); });
    await waitFor(() => expect(results().map((e) => e?.status)).toEqual(['started', 'first_visible', 'ready']));
    expect(results().at(-1)?.navigation_type).toBe('conversation_switch');
  });

  it('does not call a mounted but still materializing project actionable Ready', async () => {
    navigationTiming.begin({ kind: 'home' }, { projectId: project.id });
    renderProjectView({ materializationPending: true });
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalled());
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(results().map((e) => e?.status)).toEqual(['started', 'first_visible']);
    expect(results().some(e => e?.result === 'ready')).toBe(false);
  });

  it('does not turn a failed transcript read into Ready', async () => {
    mockedListMessages.mockRejectedValue(new Error('private upstream text'));
    navigationTiming.begin({ kind: 'home' }, { projectId: project.id });
    renderProjectView();
    await waitFor(() => expect(results().map((e) => e?.status)).toEqual(['started', 'failed']));
    expect(results()[1]?.reason).toBe('messages_unavailable');
    expect(JSON.stringify(results())).not.toContain('private upstream text');
  });

  it('cannot finish a cancelled entry when its messages resolve after unmount', async () => {
    const messages = deferred<Awaited<ReturnType<typeof listMessages>>>();
    mockedListMessages.mockReturnValue(messages.promise);
    navigationTiming.begin({ kind: 'home' }, { projectId: project.id });
    const view = renderProjectView();
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalled());
    act(() => navigationTiming.observeRoute({ kind: 'project', projectId: project.id }));
    act(() => navigationTiming.observeRoute({ kind: 'home' }));
    view.unmount();
    await act(async () => { messages.resolve([]); });
    expect(results().at(-1)?.result).toBe('cancelled');
    expect(results().some(e => e?.result === 'ready')).toBe(false);
  });
});
