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

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectView } from '../../src/components/ProjectView';
import {
  WORKSPACE_CONTEXT_REFRESH_EVENT,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { streamViaDaemon } from '../../src/providers/daemon';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import {
  createConversation,
  listConversations,
  listMessages,
} from '../../src/state/projects';
import { fetchPreviewComments } from '../../src/providers/registry';
import { fetchBrands } from '../../src/runtime/brands';
import type {
  AgentInfo,
  AppConfig,
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

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/router', () => ({ navigate: vi.fn() }));

vi.mock('../../src/providers/anthropic', () => ({ streamMessage: vi.fn() }));

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
    saveMessage: vi.fn(),
    saveTabs: vi.fn(),
  };
});

vi.mock('../../src/components/AppChromeHeader', () => ({
  AppChromeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock('../../src/components/AvatarMenu', () => ({ AvatarMenu: () => null }));
vi.mock('../../src/components/FileWorkspace', () => ({
  DESIGN_SYSTEM_TAB: '__design_system__',
  FileWorkspace: () => <div data-testid="file-workspace" />,
}));
vi.mock('../../src/components/Loading', () => ({
  CenteredLoader: () => <div data-testid="loader" />,
}));
vi.mock('../../src/components/ChatPane', () => ({
  ChatPane: (props: {
    activeConversationId?: string | null;
    onSend?: (prompt: string, attachments: unknown[], comments: unknown[]) => void;
  }) => (
    <>
      <div data-testid="active-conversation">{props.activeConversationId ?? ''}</div>
      <button
        type="button"
        data-testid="send-message"
        onClick={() => props.onSend?.('post-switch send', [], [])}
      >
        send
      </button>
    </>
  ),
}));

const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);
const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const mockedListConversations = vi.mocked(listConversations);
const mockedCreateConversation = vi.mocked(createConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedFetchPreviewComments = vi.mocked(fetchPreviewComments);
const mockedFetchBrands = vi.mocked(fetchBrands);

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

function renderProjectView(overrides: Partial<ComponentProps<typeof ProjectView>> = {}) {
  return render(
    <ProjectView
      project={project()}
      routeFileName={null}
      config={config}
      agents={[{ id: 'amr', name: 'amr', available: true }] as unknown as AgentInfo[]}
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
    />,
  );
}

describe('a Home auto-send identifies its caller before the project scope resolves', () => {
  beforeEach(() => {
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
    mockedFetchBrands.mockResolvedValue([]);
    // Home's hand-off: this flag is what makes ProjectView fire the seeded
    // prompt without a second click.
    window.sessionStorage.setItem(`od:auto-send-first:${PROJECT_ID}`, '1');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  // RED before the fix: `workspaceContext` is null, so `POST /api/runs` carries
  // no `x-od-workspace-*` and the daemon refuses the send with 401
  // WORKSPACE_CONTEXT_REQUIRED.
  it('passes the caller\'s workspace context to POST /api/runs', async () => {
    renderProjectView();

    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());
    const options = mockedStreamViaDaemon.mock.calls[0]?.[0];
    expect(
      options?.workspaceContext,
      'a run POST with no workspace context is refused 401 WORKSPACE_CONTEXT_REQUIRED '
        + 'on a workspace-bound project',
    ).toEqual(CALLER_CONTEXT);
  });

  // The second consequence of the same null, and one of the acceptance goals:
  // 「跑一次 AMR, 确认额度是从团队扣的」. `checkAmrBalanceGate` prices the run
  // against the TEAM wallet only when it is handed a team scope; with
  // `undefined` it falls through to the account wallet.
  it('prices the AMR pre-run balance gate against the team wallet, not the account', async () => {
    renderProjectView();

    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalled());
    expect(mockedCheckAmrBalanceGate.mock.calls[0]?.[0]).toEqual({
      workspaceType: 'team',
      workspaceId: TEAM_WORKSPACE,
      workspaceMemberId: TEAM_MEMBER,
    });
  });
});

// The regression `nettee` caught on the first cut of this fix, at the layer the
// user actually hits it. `useProjectWorkspaceScope`'s trailing guard re-enters
// `{ loading: true, scope: null }` whenever the resolved caller identity stops
// matching, and a workspace switch does exactly that. Keying the fallback on
// `loading` therefore made a send issued in that window assert workspace B for a
// project bound to workspace A.
//
// Both consumers are asserted separately because they fail differently:
// `POST /api/runs` can 403 (the gate still finds the row under A) while
// `checkAmrBalanceGate` silently preflights B's wallet.
describe('a send immediately after a workspace switch does not assert the new workspace', () => {
  const WORKSPACE_B = 'ws-switched-to';
  const MEMBER_B = 'member-in-b';

  function contextForB(): WorkspaceCollabContext {
    return {
      ...CALLER_CONTEXT,
      workspaceId: WORKSPACE_B,
      workspaceMemberId: MEMBER_B,
    } as WorkspaceCollabContext;
  }

  /**
   * Resolve this project's binding to workspace A once, then hang on every later
   * read. The hang is what parks the hook in the post-switch revalidation window
   * instead of letting it race back to a resolved scope.
   */
  function stubSwitchableFetch(state: { context: WorkspaceCollabContext }) {
    let scopeReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/workspace/context')) {
          return new Response(JSON.stringify({ context: state.context }), { status: 200 });
        }
        if (url.includes('/workspace-scope')) {
          scopeReads += 1;
          if (scopeReads > 1) return new Promise<Response>(() => {});
          return new Response(
            JSON.stringify({
              scope: {
                kind: 'team',
                projectId: PROJECT_ID,
                workspaceId: TEAM_WORKSPACE,
                visibility: 'personal',
                context: CALLER_CONTEXT,
              },
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 200 });
      }),
    );
  }

  beforeEach(() => {
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
    // Deliberately NO auto-send flag: the send is driven explicitly, after the
    // switch, which is the scenario under test.
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
  });

  async function renderThenSwitch() {
    const state = { context: CALLER_CONTEXT };
    stubSwitchableFetch(state);
    renderProjectView();
    // The binding is read and settled for workspace A.
    await waitFor(() => expect(mockedCheckAmrBalanceGate).not.toBeUndefined());
    await waitFor(() =>
      expect(screen.getByTestId('active-conversation').textContent).toBe(`conv-${PROJECT_ID}`),
    );
    // Now the user switches to workspace B.
    state.context = contextForB();
    resetWorkspaceContextCache();
    await act(async () => {
      window.dispatchEvent(new Event(WORKSPACE_CONTEXT_REFRESH_EVENT));
      await Promise.resolve();
    });
    return state;
  }

  it('does not hand POST /api/runs the workspace the user switched to', async () => {
    await renderThenSwitch();

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(mockedStreamViaDaemon).toHaveBeenCalled());

    const asserted = mockedStreamViaDaemon.mock.calls[0]?.[0]?.workspaceContext;
    expect(
      asserted?.workspaceId,
      'workspace B would 403: the gate still finds this project under workspace A',
    ).not.toBe(WORKSPACE_B);
  });

  it('does not preflight the AMR wallet of the workspace the user switched to', async () => {
    await renderThenSwitch();
    mockedCheckAmrBalanceGate.mockClear();

    fireEvent.click(screen.getByTestId('send-message'));
    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalled());

    expect(
      mockedCheckAmrBalanceGate.mock.calls[0]?.[0]?.workspaceId,
      'charging the wrong team is worse than charging nothing: it looks plausible',
    ).not.toBe(WORKSPACE_B);
  });
});
