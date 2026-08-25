// @vitest-environment jsdom
//
// A send from Home must identify its caller to the daemon.
//
// REPRODUCTION (Open Design Beta 0.16.2-beta.147, macOS, team workspace): on
// Home, click the 「水面焦散」 example-prompt card — which seeds the composer with
// the 「WebGL 体验」 plugin chip, a 「水面焦散」 template chip and the plugin's
// description as the prompt — then press send. The send fails immediately with
//
//     daemon 401: {"error":{"code":"WORKSPACE_CONTEXT_REQUIRED","message":"workspace context is required"}}
//
// and `run_id: n/a`, because the refusal happens before the run is created.
//
// That string is produced in exactly one place in the repo — the `!createResp.ok`
// branch of the `POST /api/runs` create fetch in `providers/daemon.ts` — so the
// refused call is run creation, gated by `enforceWorkspaceResourceMutation
// ('project', …)` (apps/daemon/src/server.ts wires it via
// `createEnforceWorkspaceProjectMutation`).
//
// The cause is on this side of the wire. Home creates the project WITH the
// caller's workspace headers, so #6201 binds it to the team workspace; the
// follow-on auto-send then went out with NO headers, because it took its
// identity from the project's own workspace scope — an async read that is still
// in flight when the auto-send fires (its gate is `messagesInitialized` +
// `activeConversationId`, never the scope). Every OTHER project write in
// ProjectView (`patchProject`, `uploadProjectFiles`, the comment writes) already
// asserts the caller's own context; run creation was the one that did not.
//
// Nothing here is AMR-specific — the same null identity is passed on the
// CLI-agent and BYOK-OpenCode branches alike — but the report is an AMR run on a
// team workspace, and AMR is also where the second consequence shows up: the
// pre-run balance gate receives the same null and silently prices the run
// against the ACCOUNT wallet instead of the team's.

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type PreviewComment,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { streamViaDaemon } from '../../src/providers/daemon';
import { useProjectFileEvents } from '../../src/providers/project-events';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import {
  createConversation,
  listConversations,
  listMessages,
  loadTabs,
  persistTabsToDaemonNow,
  ProjectConversationsHttpError,
} from '../../src/state/projects';
import {
  deletePreviewComment,
  fetchPreviewComments,
  fetchProjectFiles,
} from '../../src/providers/registry';
import { fetchBrands } from '../../src/runtime/brands';
import type {
  AgentInfo,
  AppConfig,
  ChatMessage,
  Conversation,
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../../src/types';

const PROJECT_ID = 'caustic-pool-project';
/** The team workspace from the report. */
const TEAM_WORKSPACE = 'nt3itfm1b95puq5w33tvzu44';
const TEAM_MEMBER = 'member-sender';
/** The 「水面焦散」 card's seeded prompt. */
const SEED_PROMPT =
  '自包含 WebGL2 主视觉：由域扭曲涟漪织成的动态水面焦散；点击水面掉涟漪。无网格、无贴图。';

const CALLER_CONTEXT: WorkspaceCollabContext = {
  workspaceId: TEAM_WORKSPACE,
  workspaceType: 'team',
  workspaceMemberId: TEAM_MEMBER,
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'team_pro',
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
} as WorkspaceCollabContext;

const PERSONAL_CONTEXT: WorkspaceCollabContext = {
  ...CALLER_CONTEXT,
  workspaceId: 'personal-workspace',
  workspaceType: 'personal',
  workspaceMemberId: 'personal-member',
  planId: 'plus',
} as WorkspaceCollabContext;

const workspaceScopeMocks = vi.hoisted(() => ({
  projectScope: { loading: true, scope: null } as ProjectWorkspaceScopeState,
  ambientContext: null as WorkspaceCollabContext | null,
}));
const chatPaneSpy = vi.hoisted(() => vi.fn());
const resourceContextObservations = vi.hoisted(
  () => [] as Array<WorkspaceCollabContext | null>,
);
const projectCollabMocks = vi.hoisted(() => ({
  writerAuthority: 'allowed' as 'allowed' | 'denied' | 'pending',
  viewerOnly: false,
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
}));

vi.mock('../../src/collab/useProjectWorkspaceScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectWorkspaceScope')>()),
  useProjectWorkspaceScope: () => workspaceScopeMocks.projectScope,
}));

vi.mock('../../src/collab/useProjectCollab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useProjectCollab')>()),
  useProjectCollab: () => ({
    enabled: true,
    member: null,
    present: [],
    publishedVersion: null,
    syncState: null,
    viewerOnly: projectCollabMocks.viewerOnly,
    writerAuthority: projectCollabMocks.writerAuthority,
    isOwner: projectCollabMocks.writerAuthority === 'allowed',
    ownerDisplayName: null,
    ownerRole: null,
    downloadPending: false,
    reportChange: () => undefined,
    requestPublish: () => undefined,
    refreshPresence: () => undefined,
    checkStatusNow: () => undefined,
  }),
}));

vi.mock('../../src/providers/daemon', () => ({
  fetchChatRunStatus: vi.fn(),
  listActiveChatRuns: vi.fn().mockResolvedValue([]),
  listProjectRuns: vi.fn().mockResolvedValue([]),
  publishDaemonRunFinishedEvent: vi.fn(),
  reattachDaemonRun: vi.fn(),
  streamViaDaemon: vi.fn(),
}));

// The balance gate is not what is under test; it must simply allow the send so
// the run POST is reached. Its ARGUMENT is asserted below.
vi.mock('../../src/runtime/amr-balance-gate', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/amr-balance-gate')>(
    '../../src/runtime/amr-balance-gate',
  );
  return { ...actual, checkAmrBalanceGate: vi.fn().mockResolvedValue({ kind: 'allow' }) };
});

vi.mock('../../src/providers/project-events', () => ({
  useProjectFileEvents: vi.fn(),
}));

vi.mock('../../src/runtime/brands', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/brands')>(
    '../../src/runtime/brands',
  );
  return { ...actual, fetchBrands: vi.fn().mockResolvedValue([]) };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    deletePreviewComment: vi.fn(),
    fetchDesignSystem: vi.fn(),
    fetchLiveArtifacts: vi.fn().mockResolvedValue([]),
    fetchPreviewComments: vi.fn().mockResolvedValue([]),
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
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    listMessages: vi.fn(),
    loadTabs: vi.fn().mockResolvedValue({ tabs: [], active: null }),
    patchConversation: vi.fn(),
    patchProject: vi.fn(),
    persistTabsToDaemonNow: vi.fn(),
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/FileWorkspace', async () => {
  const { useProjectCollabContext } = await import('../../src/collab/collab-context');
  return {
    DESIGN_SYSTEM_TAB: '__design_system__',
    FileWorkspace: ({
      onTabsStateChange,
    }: {
      onTabsStateChange?: (state: { tabs: string[]; active: string | null }) => void;
    }) => {
      const { workspaceContext } = useProjectCollabContext();
      resourceContextObservations.push(workspaceContext);
      return (
        <div data-testid="file-workspace">
          <button
            type="button"
            data-testid="queue-tab-write"
            onClick={() => onTabsStateChange?.({
              tabs: ['index.html'],
              active: 'index.html',
            })}
          >
            queue tab write
          </button>
          <button
            type="button"
            data-testid="queue-alt-tab-write"
            onClick={() => onTabsStateChange?.({
              tabs: ['index.html', 'about.html'],
              active: 'about.html',
            })}
          >
            queue alternate tab write
          </button>
        </div>
      );
    },
  };
});
vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: {
    activeConversationId?: string | null;
    conversations?: Conversation[];
    loading?: boolean;
    messages?: ChatMessage[];
    messagesConversationId?: string | null;
    previewComments?: unknown[];
    onDeleteComment?: (commentId: string) => void;
    onSelectConversation?: (conversationId: string) => void;
    sendDisabled?: boolean;
    queuedItems?: Array<{ prompt: string }>;
    onSend?: (
      prompt: string,
      attachments: [],
      commentAttachments: [],
    ) => unknown;
  }) => {
    chatPaneSpy(props);
    return (
      <div>
        <div data-testid="active-conversation">{props.activeConversationId ?? ''}</div>
        <button
          type="button"
          data-testid="normal-send"
          disabled={props.sendDisabled}
          onClick={() => props.onSend?.('normal prompt', [], [])}
        >
          send
        </button>
      </div>
    );
  },
}));

const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);
const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedLoadTabs = vi.mocked(loadTabs);
const mockedPersistTabsToDaemonNow = vi.mocked(persistTabsToDaemonNow);
const mockedDeletePreviewComment = vi.mocked(deletePreviewComment);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchProjectFiles = vi.mocked(fetchProjectFiles);
const mockedFetchBrands = vi.mocked(fetchBrands);
const mockedUseProjectFileEvents = vi.mocked(useProjectFileEvents);

/** AMR on a daemon runtime — the reported configuration. */
const config: AppConfig = {
  mode: 'daemon',
  apiProtocol: 'openai',
  apiKey: '',
  baseUrl: '',
  model: 'deepseek-v4-flash',
  agentId: 'amr',
  skillId: null,
  designSystemId: null,
};

const conversation = (projectId: string): Conversation => ({
  id: `conv-${projectId}`,
  projectId,
  title: null,
  createdAt: 1,
  updatedAt: 1,
});

const previewComment = (id: string, note: string, updatedAt: number): PreviewComment => ({
  id,
  projectId: PROJECT_ID,
  conversationId: `conv-${PROJECT_ID}`,
  filePath: 'index.html',
  elementId: 'hero',
  selector: '#hero',
  label: 'Hero',
  text: 'Hero',
  position: { x: 0, y: 0, width: 100, height: 40 },
  htmlHint: '<section id="hero">Hero</section>',
  note,
  status: 'open',
  createdAt: 1,
  updatedAt,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

/**
 * The project Home just created from the example card: bound to the team
 * workspace, carrying the seeded prompt and the applied plugin.
 */
const project = (): Project => ({
  id: PROJECT_ID,
  name: 'Caustic Pool',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  pendingPrompt: SEED_PROMPT,
  metadata: { kind: 'prototype', pluginId: 'example-webgl-experience' },
  // The daemon's read model of the project's single `workspace_projects` row,
  // carried on the project record itself (`Project.workspaceId`). Home created
  // this project in the caller's workspace, so it names that workspace.
  workspaceId: TEAM_WORKSPACE,
} as Project);

/**
 * Answer the caller-identity read, and leave the PROJECT-scope read pending
 * forever. That is the window the auto-send fires in: `useProjectWorkspaceScope`
 * needs a round trip, while the auto-send gate only waits for the conversation
 * and message reads.
 */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/context')) {
        return new Response(JSON.stringify({ context: CALLER_CONTEXT }), { status: 200 });
      }
      if (url.includes('/workspace-scope')) {
        // Never settles — the scope is unread at send time.
        return new Promise<Response>(() => {});
      }
      return new Response('{}', { status: 200 });
    }),
  );
}

function projectViewElement(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  return (
    <ProjectView
      project={project()}
      routeFileName={null}
      config={config}
      agents={[{
        id: 'amr',
        name: 'amr',
        available: true,
        models: [{
          id: 'deepseek-v4-flash',
          label: 'DeepSeek V4 Flash',
          default: true,
        }],
      }] as unknown as AgentInfo[]}
      skills={[] as SkillSummary[]}
      designTemplates={[] as SkillSummary[]}
      designSystems={[] as DesignSystemSummary[]}
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
      {...overrides}
    />
  );
}

function renderProjectView(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  return render(projectViewElement(overrides));
}

describe('a Home auto-send identifies its caller before the project scope resolves', () => {
  beforeEach(() => {
    resourceContextObservations.length = 0;
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    stubFetch();
    mockedListConversations.mockImplementation(async (projectId: string) => [
      conversation(projectId),
    ]);
    mockedCreateConversation.mockImplementation(async (projectId: string) =>
      conversation(projectId),
    );
    mockedListMessages.mockResolvedValue([]);
    mockedFetchPreviewComments.mockResolvedValue([]);
    mockedFetchProjectFiles.mockResolvedValue([]);
    mockedFetchBrands.mockResolvedValue([]);
    mockedStreamViaDaemon.mockResolvedValue(undefined);
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    projectCollabMocks.writerAuthority = 'allowed';
    projectCollabMocks.viewerOnly = false;
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
    // Home's hand-off: this flag is what makes ProjectView fire the seeded
    // prompt without a second click.
    window.sessionStorage.setItem(`od:auto-send-first:${PROJECT_ID}`, '1');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  // RED before the fix: `workspaceContext` is null, so `POST /api/runs` carries
  // no `x-od-workspace-*` and the daemon refuses the send with 401
  // WORKSPACE_CONTEXT_REQUIRED.
  it('passes the caller\'s workspace context to POST /api/runs', async () => {
    mockedCheckAmrBalanceGate.mockImplementation(async (scope) =>
      scope
        ? { kind: 'allow' }
        : {
            kind: 'hard',
            reason: 'insufficient',
            snapshot: {
              status: 'available',
              profile: 'prod',
              user: null,
              balanceUsd: '0',
              updatedAt: null,
              fetchedAt: new Date().toISOString(),
              stale: false,
              source: 'vela_api',
            },
          } as never,
    );
    renderProjectView();

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(mockedCheckAmrBalanceGate).toHaveBeenCalledWith({
      workspaceType: 'team',
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
    }, 'deepseek-v4-flash');
    const options = mockedStreamViaDaemon.mock.calls[0]?.[0];
    expect(
      options?.workspaceContext,
      'a run POST with no workspace context is refused 401 WORKSPACE_CONTEXT_REQUIRED '
        + 'on a workspace-bound project',
    ).toEqual(CALLER_CONTEXT);
  });

  it('keeps fetch headers while using the project-authoritative raw URL for auto-open analysis', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    mockedFetchProjectFiles.mockResolvedValue([
      { name: 'index.html', path: 'index.html', kind: 'html', size: 100, mtime: 2 },
      { name: 'src/app.jsx', path: 'src/app.jsx', kind: 'text', size: 100, mtime: 2 },
    ] as never);
    mockedStreamViaDaemon.mockImplementation(async (options) => {
      options.handlers.onAgentEvent({
        kind: 'tool_use',
        id: 'write-jsx',
        name: 'Write',
        input: { file_path: 'src/app.jsx', content: 'export default function App() {}' },
      });
      options.handlers.onAgentEvent({
        kind: 'tool_result',
        toolUseId: 'write-jsx',
        content: 'written',
        isError: false,
      });
      options.handlers.onDone('done');
    });

    renderProjectView();

    const fetchMock = vi.mocked(globalThis.fetch);
    await waitFor(() => {
      const rawCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes(`/api/projects/${PROJECT_ID}/raw/index.html`),
      );
      expect(rawCall).toBeDefined();
      expect(String(rawCall?.[0])).toBe(`/api/projects/${PROJECT_ID}/raw/index.html`);
      expect(rawCall?.[1]).toEqual(expect.objectContaining({
        headers: expect.objectContaining({
          'x-od-workspace-id': TEAM_WORKSPACE,
          'x-od-workspace-member-id': TEAM_MEMBER,
        }),
      }));
    });
  });

  it('hydrates the persisted transcript without waiting for preview comments', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    const comments = deferred<Awaited<ReturnType<typeof fetchPreviewComments>>>();
    const failedAssistant: ChatMessage = {
      id: 'failed-amr-assistant',
      role: 'assistant',
      content: '',
      createdAt: 1,
      runStatus: 'failed',
      agentId: 'amr',
      events: [{
        kind: 'status',
        label: 'error',
        detail: 'Sign in required.',
        code: 'AMR_AUTH_REQUIRED',
      }],
    };
    mockedListMessages.mockResolvedValue([failedAssistant]);
    mockedFetchPreviewComments.mockReturnValue(comments.promise);

    renderProjectView();

    await waitFor(() => {
      const latest = chatPaneSpy.mock.calls.at(-1)?.[0];
      expect(latest?.loading).toBe(false);
      expect(latest?.messagesConversationId).toBe(`conv-${PROJECT_ID}`);
      expect(latest?.messages).toEqual([failedAssistant]);
    });
    expect(mockedFetchPreviewComments).toHaveBeenCalledTimes(1);

    comments.resolve([]);
  });

  it('clears the established transcript when request authority changes and reload fails', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    const persistedMessage: ChatMessage = {
      id: 'persisted-assistant',
      role: 'assistant',
      content: 'Persisted answer',
      createdAt: 1,
    };
    mockedListMessages.mockResolvedValueOnce([persistedMessage]);
    const view = renderProjectView({
      project: { ...project(), pendingPrompt: '' },
    });

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([persistedMessage]);
    });

    const reload = deferred<ChatMessage[]>();
    mockedListMessages.mockReturnValueOnce(reload.promise);
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: {
          ...CALLER_CONTEXT,
          role: 'admin',
          permissions: buildWorkspacePermissions({
            role: 'admin',
            lifecycleState: 'active',
          }),
        } as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    view.rerender(projectViewElement({
      project: { ...project(), pendingPrompt: '' },
    }));

    await waitFor(() => expect(mockedListMessages).toHaveBeenCalledTimes(2));
    expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([]);

    await act(async () => {
      reload.reject(new Error('workspace directory unavailable'));
      await reload.promise.catch(() => undefined);
    });

    expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([]);
    expect(chatPaneSpy.mock.calls.at(-1)?.[0].messagesConversationId).toBeNull();
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
  });

  it('keeps a cold Home run attached when an empty authority refresh settles after stream events', async () => {
    const activeStream = deferred<void>();
    let runOptions: Parameters<typeof streamViaDaemon>[0] | undefined;
    mockedStreamViaDaemon.mockImplementation((options) => {
      runOptions = options;
      return activeStream.promise;
    });

    const view = renderProjectView();

    await waitFor(() => expect(runOptions).toBeDefined());
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([
        expect.objectContaining({ role: 'user', content: SEED_PROMPT }),
        expect.objectContaining({ role: 'assistant', runStatus: 'running' }),
      ]);
    });

    const authorityReload = deferred<ChatMessage[]>();
    mockedListMessages.mockReturnValueOnce(authorityReload.promise);
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: {
          ...CALLER_CONTEXT,
          role: 'admin',
          permissions: buildWorkspacePermissions({
            role: 'admin',
            lifecycleState: 'active',
          }),
        } as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    await act(async () => {
      view.rerender(projectViewElement());
    });

    await waitFor(() => expect(mockedListMessages).toHaveBeenCalledTimes(2));
    const expectedOutput = 'The first packaged run is still live.';
    await act(async () => {
      runOptions?.onRunCreated?.('run-first-home');
      runOptions?.onRunStatus?.('running');
      runOptions?.handlers.onAgentEvent({ kind: 'text', text: expectedOutput });
      runOptions?.handlers.onAgentEvent({
        kind: 'tool_use',
        id: 'write-index',
        name: 'Write',
        input: { file_path: 'index.html', content: '<main>ready</main>' },
      });
    });

    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([
        expect.objectContaining({ role: 'user', content: SEED_PROMPT }),
        expect.objectContaining({
          role: 'assistant',
          runId: 'run-first-home',
          events: expect.arrayContaining([
            expect.objectContaining({ kind: 'text', text: expectedOutput }),
          ]),
        }),
      ]);
    });

    await act(async () => {
      authorityReload.resolve([]);
      await authorityReload.promise;
    });

    expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([
      expect.objectContaining({ role: 'user', content: SEED_PROMPT }),
      expect.objectContaining({
        role: 'assistant',
        runId: 'run-first-home',
        events: expect.arrayContaining([
          expect.objectContaining({ kind: 'text', text: expectedOutput }),
        ]),
      }),
    ]);

    activeStream.resolve();
  });

  it('keeps a terminal cold Home run attached when the empty refresh outlives its controller', async () => {
    const activeStream = deferred<void>();
    let runOptions: Parameters<typeof streamViaDaemon>[0] | undefined;
    mockedStreamViaDaemon.mockImplementation((options) => {
      runOptions = options;
      return activeStream.promise;
    });

    const view = renderProjectView();
    await waitFor(() => expect(runOptions).toBeDefined());

    const authorityReload = deferred<ChatMessage[]>();
    mockedListMessages.mockReturnValueOnce(authorityReload.promise);
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: {
          ...CALLER_CONTEXT,
          role: 'admin',
          permissions: buildWorkspacePermissions({
            role: 'admin',
            lifecycleState: 'active',
          }),
        } as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    await act(async () => {
      view.rerender(projectViewElement());
    });
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalledTimes(2));

    const expectedOutput = 'The terminal first run stays visible.';
    await act(async () => {
      runOptions?.onRunCreated?.('run-terminal-home');
      runOptions?.onRunStatus?.('running');
      runOptions?.handlers.onAgentEvent({ kind: 'text', text: expectedOutput });
      runOptions?.handlers.onAgentEvent({
        kind: 'tool_use',
        id: 'write-terminal-index',
        name: 'Write',
        input: { file_path: 'index.html', content: '<main>complete</main>' },
      });
      runOptions?.onRunStatus?.('succeeded');
    });

    await act(async () => {
      authorityReload.resolve([]);
      await authorityReload.promise;
      runOptions?.handlers.onDone('');
    });

    expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([
      expect.objectContaining({ role: 'user', content: SEED_PROMPT }),
      expect.objectContaining({
        role: 'assistant',
        runId: 'run-terminal-home',
        endedAt: expect.any(Number),
        events: expect.arrayContaining([
          expect.objectContaining({ kind: 'text', text: expectedOutput }),
        ]),
      }),
    ]);

    activeStream.resolve();
  });

  it('does not restore a cold Home run after project authority is revoked', async () => {
    const activeStream = deferred<void>();
    let runOptions: Parameters<typeof streamViaDaemon>[0] | undefined;
    mockedStreamViaDaemon.mockImplementation((options) => {
      runOptions = options;
      return activeStream.promise;
    });

    const view = renderProjectView();
    await waitFor(() => expect(runOptions).toBeDefined());

    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: null,
      failure: 'forbidden',
    };
    await act(async () => {
      view.rerender(projectViewElement());
    });

    await waitFor(() => expect(mockedListMessages).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([]);
    });

    await act(async () => {
      runOptions?.onRunCreated?.('run-revoked-home');
      runOptions?.handlers.onAgentEvent({
        kind: 'text',
        text: 'This output belongs to the revoked authority.',
      });
      runOptions?.handlers.onAgentEvent({
        kind: 'tool_use',
        id: 'revoked-write',
        name: 'Write',
        input: { file_path: 'index.html', content: '<main>private</main>' },
      });
    });

    expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([]);
    activeStream.resolve();
  });

  it('reuses one Home handoff identity across ProjectView remounts', async () => {
    const firstView = renderProjectView();
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    const firstRun = mockedStreamViaDaemon.mock.calls[0]?.[0];
    firstView.unmount();

    window.sessionStorage.setItem(`od:auto-send-first:${PROJECT_ID}`, '1');
    renderProjectView();
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(2));
    const replayedRun = mockedStreamViaDaemon.mock.calls[1]?.[0];

    expect({
      clientRequestId: replayedRun?.clientRequestId,
      userMessageId: replayedRun?.userMessageId,
      assistantMessageId: replayedRun?.assistantMessageId,
    }).toEqual({
      clientRequestId: firstRun?.clientRequestId,
      userMessageId: firstRun?.userMessageId,
      assistantMessageId: firstRun?.assistantMessageId,
    });
    expect(firstRun?.clientRequestId).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(firstRun?.userMessageId).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(firstRun?.assistantMessageId).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('keeps Home handoff identities within the daemon limit for a maximum-length project id', async () => {
    const maximumLengthProjectId = 'p'.repeat(128);
    window.sessionStorage.setItem(`od:auto-send-first:${maximumLengthProjectId}`, '1');

    renderProjectView({
      project: {
        ...project(),
        id: maximumLengthProjectId,
      },
    });

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    const run = mockedStreamViaDaemon.mock.calls[0]?.[0];
    const ids = [run?.clientRequestId, run?.userMessageId, run?.assistantMessageId];

    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(id?.length).toBeLessThanOrEqual(128);
    }
  });

  it('does not let the initial comments read replace a newer SSE refresh', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    const initialComments = deferred<Awaited<ReturnType<typeof fetchPreviewComments>>>();
    const staleComment = previewComment('comment-stale', 'stale initial read', 1);
    const freshComment = previewComment('comment-fresh', 'fresh SSE read', 2);
    mockedFetchPreviewComments
      .mockReturnValueOnce(initialComments.promise)
      .mockResolvedValueOnce([freshComment]);

    renderProjectView();

    await waitFor(() => {
      expect(mockedUseProjectFileEvents).toHaveBeenCalled();
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].loading).toBe(false);
    });
    const handleProjectEvent = mockedUseProjectFileEvents.mock.calls.at(-1)?.[2];
    await act(async () => {
      handleProjectEvent?.({ type: 'comment-changed', projectId: PROJECT_ID });
    });

    await waitFor(() => {
      expect(mockedFetchPreviewComments).toHaveBeenCalledTimes(2);
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].previewComments).toEqual([freshComment]);
    });

    await act(async () => {
      initialComments.resolve([staleComment]);
      await initialComments.promise;
    });
    expect(chatPaneSpy.mock.calls.at(-1)?.[0].previewComments).toEqual([freshComment]);
  });

  it('does not let the initial comments read resurrect a locally deleted comment', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    const initialComments = deferred<Awaited<ReturnType<typeof fetchPreviewComments>>>();
    const deletedComment = previewComment('comment-deleted', 'deleted locally', 1);
    mockedFetchPreviewComments.mockReturnValue(initialComments.promise);
    mockedDeletePreviewComment.mockResolvedValue(true);

    renderProjectView();

    const onDeleteComment = await waitFor(() => {
      const latest = chatPaneSpy.mock.calls.at(-1)?.[0];
      expect(latest?.loading).toBe(false);
      expect(latest?.onDeleteComment).toEqual(expect.any(Function));
      return latest?.onDeleteComment;
    });
    await act(async () => {
      onDeleteComment?.(deletedComment.id);
      await Promise.resolve();
    });
    expect(mockedDeletePreviewComment).toHaveBeenCalledWith(
      PROJECT_ID,
      `conv-${PROJECT_ID}`,
      deletedComment.id,
      CALLER_CONTEXT,
    );

    await act(async () => {
      initialComments.resolve([deletedComment]);
      await initialComments.promise;
    });
    expect(chatPaneSpy.mock.calls.at(-1)?.[0].previewComments).toEqual([]);
  });

  it('reuses the matching Home Team preflight while the project scope read is pending', async () => {
    window.sessionStorage.setItem(
      `od:auto-send-amr-gate-witness:${PROJECT_ID}`,
      JSON.stringify({
        workspaceType: 'team',
        workspaceId: TEAM_WORKSPACE,
        workspaceMemberId: TEAM_MEMBER,
      }),
    );

    renderProjectView();

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(mockedCheckAmrBalanceGate).not.toHaveBeenCalled();
    expect(mockedStreamViaDaemon.mock.calls[0]?.[0].workspaceContext).toEqual(
      CALLER_CONTEXT,
    );
  });

  it('keeps Team billing scope when its scope read is temporarily unavailable', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      failure: 'unavailable',
      scope: {
        kind: 'unavailable',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'personal',
        context: null,
      },
    };

    renderProjectView();

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(mockedCheckAmrBalanceGate).toHaveBeenCalledWith({
      workspaceType: 'team',
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
    }, 'deepseek-v4-flash');
    expect(mockedStreamViaDaemon.mock.calls[0]?.[0].workspaceContext).toEqual(
      CALLER_CONTEXT,
    );
  });

  it('consumes the Home handoff after an unavailable AMR gate durably queues it and starts it once after recovery', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'personal',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'unavailable' });

    const stableOverrides: Partial<ComponentProps<typeof ProjectView>> = {
      project: project(),
      agents: [{
        id: 'amr',
        name: 'amr',
        available: true,
        models: [{
          id: 'deepseek-v4-flash',
          label: 'DeepSeek V4 Flash',
          default: true,
        }],
      }] as unknown as AgentInfo[],
      skills: [] as SkillSummary[],
      designTemplates: [] as SkillSummary[],
      designSystems: [] as DesignSystemSummary[],
      onModeChange: vi.fn(),
      onAgentChange: vi.fn(),
      onAgentModelChange: vi.fn(),
      onRefreshAgents: vi.fn(),
      onOpenSettings: vi.fn(),
      onBack: vi.fn(),
      onClearPendingPrompt: vi.fn(),
      onTouchProject: vi.fn(),
      onProjectChange: vi.fn(),
      onProjectsRefresh: vi.fn(),
    };
    const view = renderProjectView(stableOverrides);

    await waitFor(() => {
      const latest = chatPaneSpy.mock.calls.at(-1)?.[0];
      expect(latest?.queuedItems).toHaveLength(1);
    });
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(`od:auto-send-first:${PROJECT_ID}`)).toBeNull();

    view.rerender(projectViewElement({
      ...stableOverrides,
      config: { ...config, agentId: 'codex' },
      agents: [{ id: 'codex', name: 'Codex', available: true }] as unknown as AgentInfo[],
    }));

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const latest = chatPaneSpy.mock.calls.at(-1)?.[0];
      expect(latest?.queuedItems).toHaveLength(0);
    });
    expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicitly Personal project on the Personal preflight', async () => {
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'personal',
        projectId: PROJECT_ID,
        workspaceId: PERSONAL_CONTEXT.workspaceId,
        visibility: 'personal',
        context: PERSONAL_CONTEXT as WorkspaceCollabContext & { workspaceType: 'personal' },
      },
    };

    renderProjectView({
      project: {
        ...project(),
        workspaceId: PERSONAL_CONTEXT.workspaceId,
      },
    });

    await waitFor(() => {
      expect(mockedCheckAmrBalanceGate).toHaveBeenCalledWith({
        workspaceType: 'personal',
        workspaceId: PERSONAL_CONTEXT.workspaceId,
        workspaceMemberId: PERSONAL_CONTEXT.workspaceMemberId,
      }, 'deepseek-v4-flash');
    });
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
  });

  it('uses an exact Personal witness to preflight and adopt a confirmed unbound Home project', async () => {
    workspaceScopeMocks.ambientContext = PERSONAL_CONTEXT;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    };

    renderProjectView({
      project: {
        ...project(),
        workspaceId: undefined,
      },
    });

    await waitFor(() => {
      expect(mockedCheckAmrBalanceGate).toHaveBeenCalledWith({
        workspaceType: 'personal',
        workspaceId: PERSONAL_CONTEXT.workspaceId,
        workspaceMemberId: PERSONAL_CONTEXT.workspaceMemberId,
      }, 'deepseek-v4-flash');
    });
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    expect(mockedStreamViaDaemon.mock.calls[0]?.[0].workspaceContext).toEqual(
      PERSONAL_CONTEXT,
    );
    await waitFor(() => {
      expect(
        chatPaneSpy.mock.calls.at(-1)?.[0].amrAuthRetryPersonalAdoptionWitness,
      ).toEqual({
        workspaceIdentityKey:
          'personal-workspace:personal:personal-member:member:active:active:true:true',
        workspaceId: PERSONAL_CONTEXT.workspaceId,
        workspaceMemberId: PERSONAL_CONTEXT.workspaceMemberId,
        workspaceType: 'personal',
        memberStatus: 'active',
      });
    });
  });

  it.each([
    ['a Team caller', CALLER_CONTEXT],
    ['no caller', null],
  ])(
    'does not inspect the account wallet for an unbound normal send from %s',
    async (_label, ambientContext) => {
      window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
      workspaceScopeMocks.ambientContext = ambientContext;
      workspaceScopeMocks.projectScope = {
        loading: false,
        scope: {
          kind: 'unbound',
          projectId: PROJECT_ID,
          workspaceId: null,
          context: null,
        },
      };

      const view = renderProjectView({
        project: {
          ...project(),
          pendingPrompt: '',
          workspaceId: undefined,
        },
      });
      const send = await waitFor(() => {
        const candidate = view.getByTestId('normal-send');
        expect(candidate).not.toBeDisabled();
        return candidate;
      });
      fireEvent.click(send);

      await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
      expect(mockedCheckAmrBalanceGate).not.toHaveBeenCalled();
      expect(mockedStreamViaDaemon.mock.calls[0]?.[0].workspaceContext).toBeNull();
    },
  );
});

describe('a Home auto-send observes a project billing scope that settles after mount', () => {
  beforeEach(() => {
    resourceContextObservations.length = 0;
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetWorkspaceContextCache();
    mockedListConversations.mockImplementation(async (projectId: string) => [
      conversation(projectId),
    ]);
    mockedCreateConversation.mockImplementation(async (projectId: string) =>
      conversation(projectId),
    );
    mockedListMessages.mockResolvedValue([]);
    mockedFetchPreviewComments.mockResolvedValue([]);
    mockedFetchBrands.mockResolvedValue([]);
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    projectCollabMocks.writerAuthority = 'allowed';
    projectCollabMocks.viewerOnly = false;
    mockedLoadTabs.mockResolvedValue({ tabs: [], active: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  it('preflights and auto-sends with the latest settled Team billing scope', async () => {
    // Keep every prop that participates in `handleSend` or the auto-send effect
    // referentially stable across the rerender. The project billing scope is the
    // only dependency allowed to change in this regression.
    const stableOverrides: Partial<ComponentProps<typeof ProjectView>> = {
      project: project(),
      agents: [{
        id: 'amr',
        name: 'amr',
        available: true,
        models: [{
          id: 'deepseek-v4-flash',
          label: 'DeepSeek V4 Flash',
          default: true,
        }],
      }] as unknown as AgentInfo[],
      skills: [] as SkillSummary[],
      designTemplates: [] as SkillSummary[],
      designSystems: [] as DesignSystemSummary[],
      onModeChange: vi.fn(),
      onAgentChange: vi.fn(),
      onAgentModelChange: vi.fn(),
      onRefreshAgents: vi.fn(),
      onOpenSettings: vi.fn(),
      onBack: vi.fn(),
      onClearPendingPrompt: vi.fn(),
      onTouchProject: vi.fn(),
      onProjectChange: vi.fn(),
      onProjectsRefresh: vi.fn(),
    };
    const view = renderProjectView(stableOverrides);
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalled());
    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();

    // Add the Home hand-off only after mount, then settle the project scope to
    // the SAME context object already used for run identity. That keeps
    // `projectRunWorkspaceContext` referentially stable, so only the billing
    // context changed. Without the `handleSend` billing dependency, the effect
    // dispatches through a callback that still holds its mount-time `null`.
    // The effect also lists the billing context it reads directly instead of
    // relying on that callback's identity as a transitive dependency.
    window.sessionStorage.setItem(`od:auto-send-first:${PROJECT_ID}`, '1');
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'personal',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    view.rerender(projectViewElement(stableOverrides));

    await waitFor(() => {
      expect(mockedCheckAmrBalanceGate).toHaveBeenCalledWith({
        workspaceType: 'team',
        workspaceId: TEAM_WORKSPACE,
        workspaceMemberId: TEAM_MEMBER,
      }, 'deepseek-v4-flash');
    });
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
  });

  it('auto-sends a cold unbound local project through the account-scoped Cloud lane', async () => {
    window.sessionStorage.setItem(`od:auto-send-first:${PROJECT_ID}`, '1');
    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    };
    const stableOverrides: Partial<ComponentProps<typeof ProjectView>> = {
      project: { ...project(), workspaceId: undefined },
    };
    renderProjectView(stableOverrides);

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalledTimes(1));
    // Home already performed the account-scoped balance gate. ProjectView
    // must not duplicate it while handing off the accepted first prompt.
    expect(mockedCheckAmrBalanceGate).not.toHaveBeenCalled();
    expect(mockedStreamViaDaemon.mock.calls[0]?.[0].workspaceContext).toBeNull();
    expect(window.sessionStorage.getItem(`od:auto-send-first:${PROJECT_ID}`)).toBeNull();
  });

  it('reconciles files and comments with the exact Team scope when the project event stream becomes ready', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };

    renderProjectView({
      project: { ...project(), pendingPrompt: '' },
    });
    await waitFor(() => {
      expect(mockedUseProjectFileEvents).toHaveBeenCalledWith(
        PROJECT_ID,
        true,
        expect.any(Function),
        expect.objectContaining({ onReady: expect.any(Function) }),
        CALLER_CONTEXT,
      );
    });

    const options = mockedUseProjectFileEvents.mock.calls.at(-1)?.[3];
    mockedFetchProjectFiles.mockClear();
    mockedFetchPreviewComments.mockClear();
    await act(async () => {
      options?.onReady?.();
    });

    await waitFor(() => {
      expect(mockedFetchProjectFiles).toHaveBeenCalledWith(PROJECT_ID, {
        fresh: true,
        requireAuthoritative: true,
        workspaceContext: CALLER_CONTEXT,
      });
    });
    await waitFor(() => {
      expect(mockedFetchPreviewComments).toHaveBeenCalledWith(
        PROJECT_ID,
        `conv-${PROJECT_ID}`,
        CALLER_CONTEXT,
      );
    });
  });

  it('keeps established project data while the same workspace authority object settles', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    mockedListMessages.mockResolvedValue([{
      id: 'existing-message',
      role: 'assistant',
      content: 'existing transcript',
      createdAt: 1,
    } as never]);

    const view = renderProjectView({
      project: {
        ...project(),
        pendingPrompt: '',
      },
    });
    await waitFor(() => expect(mockedListMessages).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
    const establishedResourceContext = resourceContextObservations.find(
      (context) => context?.workspaceId === TEAM_WORKSPACE,
    );
    expect(establishedResourceContext).toBeTruthy();

    const conversationsPending = deferred<Conversation[]>();
    const messagesPending = deferred<never[]>();
    mockedListConversations.mockImplementationOnce(() => conversationsPending.promise);
    mockedListMessages.mockImplementationOnce(() => messagesPending.promise);

    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'personal',
        context: {
          ...CALLER_CONTEXT,
          permissions: { ...CALLER_CONTEXT.permissions },
        } as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    await act(async () => {
      view.rerender(projectViewElement({
        project: {
          ...project(),
          pendingPrompt: '',
        },
      }));
    });

    expect(
      mockedListConversations,
      'same project/workspace/member revalidation must not restart the conversation load',
    ).toHaveBeenCalledTimes(1);
    expect(
      mockedListMessages,
      'same project/workspace/member revalidation must not blank and reload the transcript',
    ).toHaveBeenCalledTimes(1);
    expect(
      mockedLoadTabs,
      'same project/workspace/member revalidation must not clear and rehydrate open tabs',
    ).toHaveBeenCalledTimes(1);
    expect(
      resourceContextObservations.at(-1),
      'FileWorkspace/FileViewer consumers must keep one canonical context object',
    ).toBe(establishedResourceContext);
  });

  it('keeps the selected conversation when the same project authority identity refreshes', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    mockedListConversations.mockReset();
    mockedListMessages.mockReset();
    mockedListMessages.mockResolvedValue([]);
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    const availableConversations = [
      { ...conversation(PROJECT_ID), id: 'conv-first' },
      { ...conversation(PROJECT_ID), id: 'conv-second', createdAt: 2, updatedAt: 2 },
    ];
    mockedListConversations.mockResolvedValue(availableConversations);

    const stableProject = { ...project(), pendingPrompt: '' };
    const view = renderProjectView({ project: stableProject });
    await waitFor(() => expect(mockedListConversations).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].activeConversationId).toBe('conv-first');
    });

    await act(async () => {
      chatPaneSpy.mock.calls.at(-1)?.[0].onSelectConversation?.('conv-second');
    });
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].activeConversationId).toBe('conv-second');
    });

    const refreshedContext = {
      ...CALLER_CONTEXT,
      workspaceMemberId: 'member-revalidated',
    } as WorkspaceCollabContext & { workspaceType: 'team' };
    workspaceScopeMocks.ambientContext = refreshedContext;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: refreshedContext,
      },
    };
    await act(async () => {
      view.rerender(projectViewElement({ project: stableProject }));
    });

    await waitFor(() => expect(mockedListConversations).toHaveBeenCalledTimes(2));
    expect(chatPaneSpy.mock.calls.at(-1)?.[0].activeConversationId).toBe('conv-second');
  });

  it('clears an established transcript when the project authority is revoked', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    mockedListConversations.mockReset();
    mockedListMessages.mockReset();
    mockedListConversations.mockImplementation(async (projectId: string) => [
      conversation(projectId),
    ]);
    mockedListMessages
      .mockResolvedValueOnce([{
        id: 'workspace-a-message',
        role: 'assistant',
        content: 'Workspace A secret',
        createdAt: 1,
      } as never])
      .mockRejectedValueOnce(new Error('workspace access forbidden'));
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };

    const stableProject = { ...project(), pendingPrompt: '' };
    const view = renderProjectView({ project: stableProject });
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([
        expect.objectContaining({ content: 'Workspace A secret' }),
      ]);
    });

    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: null,
      failure: 'forbidden',
    };
    await act(async () => {
      view.rerender(projectViewElement({ project: stableProject }));
    });

    await waitFor(() => expect(mockedListMessages).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].messages).toEqual([]);
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].sendDisabled).toBe(true);
    });
  });

  it('clears established conversation metadata when revalidation is forbidden', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    mockedListConversations.mockReset();
    mockedListMessages.mockReset();
    mockedListConversations
      .mockResolvedValueOnce([{
        ...conversation(PROJECT_ID),
        title: 'Workspace A secret title',
      }])
      .mockRejectedValueOnce(
        new ProjectConversationsHttpError(403, 'workspace access forbidden'),
      );
    mockedListMessages.mockResolvedValue([]);
    workspaceScopeMocks.ambientContext = CALLER_CONTEXT;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };

    const stableProject = { ...project(), pendingPrompt: '' };
    const view = renderProjectView({ project: stableProject });
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].conversations).toEqual([
        expect.objectContaining({ title: 'Workspace A secret title' }),
      ]);
    });

    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: null,
      failure: 'forbidden',
    };
    await act(async () => {
      view.rerender(projectViewElement({ project: stableProject }));
    });

    await waitFor(() => expect(mockedListConversations).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].conversations).toEqual([]);
      expect(chatPaneSpy.mock.calls.at(-1)?.[0].activeConversationId).toBeNull();
    });
  });

  it('flushes project A tabs with A authority after rendering project B', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    projectCollabMocks.writerAuthority = 'allowed';
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    const projectA: Project = {
      ...project(),
      pendingPrompt: '',
    };
    const projectBContext: WorkspaceCollabContext = {
      ...CALLER_CONTEXT,
      workspaceId: 'workspace-b',
      workspaceMemberId: 'member-b',
      teamId: 'workspace-b',
      teamName: 'Workspace B',
    };
    const projectB: Project = {
      ...projectA,
      id: 'project-b',
      name: 'Project B',
      workspaceId: projectBContext.workspaceId,
    };
    const stableOverrides: Partial<ComponentProps<typeof ProjectView>> = {
      project: projectA,
      onModeChange: vi.fn(),
      onAgentChange: vi.fn(),
      onAgentModelChange: vi.fn(),
      onRefreshAgents: vi.fn(),
      onOpenSettings: vi.fn(),
      onBack: vi.fn(),
      onClearPendingPrompt: vi.fn(),
      onTouchProject: vi.fn(),
      onProjectChange: vi.fn(),
      onProjectsRefresh: vi.fn(),
    };
    const view = renderProjectView(stableOverrides);
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));

    fireEvent.click(view.getByTestId('queue-tab-write'));
    expect(mockedPersistTabsToDaemonNow).not.toHaveBeenCalled();

    workspaceScopeMocks.ambientContext = projectBContext;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: projectB.id,
        workspaceId: projectBContext.workspaceId,
        visibility: 'personal',
        context: projectBContext as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    view.rerender(projectViewElement({
      ...stableOverrides,
      project: projectB,
    }));

    await waitFor(() => {
      expect(mockedPersistTabsToDaemonNow).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({
          tabs: ['index.html'],
          active: 'index.html',
        }),
        CALLER_CONTEXT,
      );
    });
  });

  it('keeps a read-only Team member tab-local and never sends a daemon PUT', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    projectCollabMocks.writerAuthority = 'denied';
    projectCollabMocks.viewerOnly = true;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };

    const view = renderProjectView({
      project: { ...project(), pendingPrompt: '' },
      routeFileName: 'index.html',
    });
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
    expect(mockedLoadTabs).toHaveBeenCalledWith(
      PROJECT_ID,
      CALLER_CONTEXT,
      { reconcileNewerCacheToDaemon: false },
    );
    vi.useFakeTimers();
    fireEvent.click(view.getByTestId('queue-alt-tab-write'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(mockedPersistTabsToDaemonNow).not.toHaveBeenCalled();
  });

  it.each(['pending', 'denied'] as const)(
    'does not treat a missing local workspaceId as unbound when Team writer authority is %s',
    async (writerAuthority) => {
      window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
      projectCollabMocks.writerAuthority = writerAuthority;
      projectCollabMocks.viewerOnly = writerAuthority === 'denied';
      workspaceScopeMocks.projectScope = {
        loading: false,
        scope: {
          kind: 'team',
          projectId: PROJECT_ID,
          workspaceId: TEAM_WORKSPACE,
          visibility: 'team',
          context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
        },
      };

      const view = renderProjectView({
        project: {
          ...project(),
          pendingPrompt: '',
          workspaceId: undefined,
        },
      });
      await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
      expect(mockedLoadTabs).toHaveBeenCalledWith(
        PROJECT_ID,
        CALLER_CONTEXT,
        { reconcileNewerCacheToDaemon: false },
      );
      vi.useFakeTimers();
      fireEvent.click(view.getByTestId('queue-alt-tab-write'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(mockedPersistTabsToDaemonNow).not.toHaveBeenCalled();
    },
  );

  it('coalesces confirmed-writer tab changes into one daemon PUT', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    projectCollabMocks.writerAuthority = 'allowed';
    const view = renderProjectView({
      project: { ...project(), pendingPrompt: '' },
    });
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();

    fireEvent.click(view.getByTestId('queue-tab-write'));
    fireEvent.click(view.getByTestId('queue-alt-tab-write'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(mockedPersistTabsToDaemonNow).toHaveBeenCalledTimes(1);
    expect(mockedPersistTabsToDaemonNow).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        tabs: ['index.html', 'about.html'],
        active: 'about.html',
      }),
      CALLER_CONTEXT,
    );
    vi.useRealTimers();
  });

  it('does not rewrite an unchanged routed tab for a confirmed writer', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    projectCollabMocks.writerAuthority = 'allowed';
    mockedLoadTabs.mockResolvedValueOnce({
      tabs: ['index.html'],
      active: 'index.html',
      hasSavedState: true,
    });

    renderProjectView({
      project: { ...project(), pendingPrompt: '' },
      routeFileName: 'index.html',
    });
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
    expect(mockedPersistTabsToDaemonNow).not.toHaveBeenCalled();
  });

  it('writes one changed routed tab for a confirmed writer', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    projectCollabMocks.writerAuthority = 'allowed';

    renderProjectView({
      project: { ...project(), pendingPrompt: '' },
      routeFileName: 'index.html',
    });
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
    expect(mockedPersistTabsToDaemonNow).toHaveBeenCalledTimes(1);
    expect(mockedPersistTabsToDaemonNow).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        tabs: ['index.html'],
        active: 'index.html',
      }),
      CALLER_CONTEXT,
    );
  });

  it('starts daemon tab persistence only after Team writer authority is allowed', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    projectCollabMocks.writerAuthority = 'pending';
    projectCollabMocks.viewerOnly = false;
    const stableOverrides = {
      project: { ...project(), pendingPrompt: '' },
    };
    const view = renderProjectView(stableOverrides);
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();

    fireEvent.click(view.getByTestId('queue-tab-write'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(mockedPersistTabsToDaemonNow).not.toHaveBeenCalled();

    projectCollabMocks.writerAuthority = 'allowed';
    view.rerender(projectViewElement(stableOverrides));
    fireEvent.click(view.getByTestId('queue-alt-tab-write'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(mockedPersistTabsToDaemonNow).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('preserves Personal project daemon tab persistence', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    projectCollabMocks.writerAuthority = 'denied';
    workspaceScopeMocks.ambientContext = PERSONAL_CONTEXT;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'personal',
        projectId: PROJECT_ID,
        workspaceId: PERSONAL_CONTEXT.workspaceId,
        visibility: 'personal',
        context: PERSONAL_CONTEXT as WorkspaceCollabContext & { workspaceType: 'personal' },
      },
    };
    const view = renderProjectView({
      project: {
        ...project(),
        pendingPrompt: '',
        workspaceId: PERSONAL_CONTEXT.workspaceId,
      },
    });
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    fireEvent.click(view.getByTestId('queue-tab-write'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(mockedPersistTabsToDaemonNow).toHaveBeenCalledTimes(1);
    expect(mockedPersistTabsToDaemonNow.mock.calls[0]?.[2]).toEqual(PERSONAL_CONTEXT);
  });

  it('preserves anonymous unbound project daemon tab persistence', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    projectCollabMocks.writerAuthority = 'pending';
    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    };
    const view = renderProjectView({
      project: {
        ...project(),
        pendingPrompt: '',
        workspaceId: undefined,
      },
    });
    await waitFor(() => expect(mockedLoadTabs).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    fireEvent.click(view.getByTestId('queue-tab-write'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(mockedPersistTabsToDaemonNow).toHaveBeenCalledTimes(1);
    expect(mockedPersistTabsToDaemonNow.mock.calls[0]?.[2]).toBeNull();
  });

  it('gates bound-project SSE until exact project authority exists', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.projectScope = { loading: true, scope: null };
    const stableProject = { ...project(), pendingPrompt: '' };
    const view = renderProjectView({ project: stableProject });

    await waitFor(() => expect(mockedUseProjectFileEvents).toHaveBeenCalled());
    expect(mockedUseProjectFileEvents.mock.calls.at(-1)?.[1]).toBe(false);

    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'team',
        projectId: PROJECT_ID,
        workspaceId: TEAM_WORKSPACE,
        visibility: 'team',
        context: CALLER_CONTEXT as WorkspaceCollabContext & { workspaceType: 'team' },
      },
    };
    view.rerender(projectViewElement({ project: stableProject }));
    expect(mockedUseProjectFileEvents.mock.calls.at(-1)?.[1]).toBe(true);

    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: null,
      failure: 'forbidden',
    };
    view.rerender(projectViewElement({ project: stableProject }));
    expect(mockedUseProjectFileEvents.mock.calls.at(-1)?.[1]).toBe(false);
  });

  it('does not treat a missing local workspaceId as settled unbound SSE authority', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.projectScope = { loading: true, scope: null };

    renderProjectView({
      project: {
        ...project(),
        pendingPrompt: '',
        workspaceId: undefined,
      },
    });

    await waitFor(() => expect(mockedUseProjectFileEvents).toHaveBeenCalled());
    expect(mockedUseProjectFileEvents.mock.calls.at(-1)?.[1]).toBe(false);
  });

  it('enables SSE for a settled Personal project scope', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.ambientContext = PERSONAL_CONTEXT;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'personal',
        projectId: PROJECT_ID,
        workspaceId: PERSONAL_CONTEXT.workspaceId,
        visibility: 'personal',
        context: PERSONAL_CONTEXT as WorkspaceCollabContext & { workspaceType: 'personal' },
      },
    };

    renderProjectView({
      project: {
        ...project(),
        pendingPrompt: '',
        workspaceId: undefined,
      },
    });
    await waitFor(() => expect(mockedUseProjectFileEvents).toHaveBeenCalled());
    expect(mockedUseProjectFileEvents.mock.calls.at(-1)?.[1]).toBe(true);
  });

  it('keeps anonymous unbound project SSE enabled', async () => {
    window.sessionStorage.removeItem(`od:auto-send-first:${PROJECT_ID}`);
    workspaceScopeMocks.ambientContext = null;
    workspaceScopeMocks.projectScope = {
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    };

    renderProjectView({
      project: {
        ...project(),
        pendingPrompt: '',
        workspaceId: undefined,
      },
    });
    await waitFor(() => expect(mockedUseProjectFileEvents).toHaveBeenCalled());
    expect(mockedUseProjectFileEvents.mock.calls.at(-1)?.[1]).toBe(true);
  });
});
