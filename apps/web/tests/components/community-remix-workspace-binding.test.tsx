// @vitest-environment jsdom
//
// Community Remix must create the copied project INSIDE the workspace the user
// is standing in. Product reproduction: 「通过 remix 后的方案, 不出现在我当前
// workspace 里的草稿了」.
//
// Why this is a call-site spec and not a `state/projects` unit spec: the daemon
// side already works. `authorizeCreatedProjectWorkspace`
// (apps/daemon/src/collab/created-project-workspace.ts) treats a COMPLETELY
// headerless create as a legal legacy/anonymous caller and deliberately leaves
// the new project unbound — `bindCreatedProjectToWorkspace` is a no-op for a
// null context. So a web call site that forgets to pass its workspace context
// to `duplicatePluginAsProject` silently produces an orphan project that no
// workspace view can ever list. The fetch mocks below reproduce exactly that
// daemon rule, plus the follow-on it causes: `enforceWorkspaceResourceMutation`
// resolves the workspace row for the CALLER'S workspace, finds none for an
// unbound project, and 403s the pendingPrompt PATCH — so the template prompt is
// dropped too.
//
// Same bypass class as c0bce3b8f (47 write/upload/rename call sites).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import {
  resetTeamProjectsCache,
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  loadConfig,
  mergeDaemonConfig,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
} from '../../src/state/config';
import { listProjects, listTemplates } from '../../src/state/projects';
import type { Route } from '../../src/router';
import type { AgentInfo, AppConfig } from '../../src/types';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

const TEMPLATE_ID = 'example-fundraising-deck';
const TEMPLATE_PROMPT = 'Remix this seed round deck for my studio.';
const REMIXED_PROJECT_ID = 'remixed-project';

let currentRoute: Route = { kind: 'home', view: 'community' };

vi.mock('../../src/router', async () => {
  const actual = await vi.importActual<typeof import('../../src/router')>('../../src/router');
  return {
    ...actual,
    navigate: vi.fn(),
    useRoute: () => currentRoute,
  };
});

// The gallery card itself is covered by community-view.test.tsx; what is under
// test here is the host's remix handler, so the view is reduced to the one
// affordance that fires it.
vi.mock('../../src/components/CommunityView', () => ({
  CommunityView: ({
    onRemixTemplate,
  }: {
    onRemixTemplate?: (remix: { templateId: string; prompt: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onRemixTemplate?.({ templateId: TEMPLATE_ID, prompt: TEMPLATE_PROMPT })}
    >
      Remix template
    </button>
  ),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: () => <div data-testid="entry-view" />,
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: () => <div data-testid="project-view" />,
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgentsStream: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

// `duplicatePluginAsProject` and `patchProject` stay REAL: the headers they put
// on the wire are the whole subject of this spec.
vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    fetchComposioConfigFromDaemon: vi.fn(),
    fetchDaemonConfig: vi.fn(),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    syncComposioConfigToDaemon: vi.fn(),
    syncConfigToDaemon: vi.fn(),
  };
});

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const TEAM_WORKSPACE_ID = 'ws-team';
const TEAM_MEMBER_ID = 'wm-remixer';

function teamContext(): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: TEAM_WORKSPACE_ID,
    workspaceType: 'team',
    workspaceMemberId: TEAM_MEMBER_ID,
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
  };
}

function baseConfig(): AppConfig {
  return {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'anthropic',
    apiVersion: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    apiProtocolConfigs: {},
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1778244000000,
    mediaProviders: {},
    composio: {},
    agentModels: {},
    agentCliEnv: {},
  };
}

function codexAgent(): AgentInfo {
  return {
    id: 'codex',
    name: 'Codex',
    bin: 'codex',
    available: true,
    models: [{ id: 'gpt-5', label: 'GPT 5' }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  return new Headers(headers as HeadersInit).get(name);
}

interface DaemonSpy {
  /** Workspace this daemon bound the remixed project to, mirroring
   *  `bindCreatedProjectToWorkspace` (null when the create arrived
   *  headerless — the legacy-caller path that leaves an orphan). */
  boundWorkspaceId: string | null;
  duplicateInit: RequestInit | undefined;
  patchInit: RequestInit | undefined;
  patchStatus: number | null;
  seededPendingPrompt: string | null;
  directoryReads: number;
  contextReads: number;
  contextWorkspaceId: string | null;
  contextWorkspaceMemberId: string | null;
}

/**
 * A fetch stub that reproduces the daemon's create-then-bind contract:
 * headerless create → unbound project → the workspace-scoped PATCH cannot find
 * a row for the caller's workspace → 403.
 */
function installDaemonStub(options: { refusePatch?: boolean } = {}): DaemonSpy {
  const spy: DaemonSpy = {
    boundWorkspaceId: null,
    duplicateInit: undefined,
    patchInit: undefined,
    patchStatus: null,
    seededPendingPrompt: null,
    directoryReads: 0,
    contextReads: 0,
    contextWorkspaceId: null,
    contextWorkspaceMemberId: null,
  };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const pathname = new URL(url, 'http://daemon.local').pathname;

    if (pathname === '/api/workspace/directory') {
      spy.directoryReads += 1;
      return jsonResponse(workspaceDirectoryFixture([teamContext()]));
    }
    if (pathname === '/api/workspace/context') {
      spy.contextReads += 1;
      spy.contextWorkspaceId = headerOf(init, 'x-od-workspace-id');
      spy.contextWorkspaceMemberId = headerOf(init, 'x-od-workspace-member-id');
      return jsonResponse({ context: teamContext() });
    }
    if (pathname === '/api/workspace/billing') {
      return jsonResponse({ summary: null, workspaceBalance: null });
    }
    if (pathname === '/api/workspace/projects/team') return jsonResponse({ projects: [] });

    if (pathname === `/api/plugins/${TEMPLATE_ID}/duplicate-project`) {
      spy.duplicateInit = init;
      const workspaceId = headerOf(init, 'x-od-workspace-id');
      const memberId = headerOf(init, 'x-od-workspace-member-id');
      // resolveCreatedProjectWorkspace: no identity headers at all is the
      // legacy caller, and the bind step is skipped entirely.
      spy.boundWorkspaceId = workspaceId && memberId ? workspaceId : null;
      return jsonResponse(
        {
          ok: true,
          projectId: REMIXED_PROJECT_ID,
          conversationId: 'remixed-conversation',
          relPath: 'index.html',
        },
        201,
      );
    }

    if (pathname === `/api/projects/${REMIXED_PROJECT_ID}` && init?.method === 'PATCH') {
      spy.patchInit = init;
      const workspaceId = headerOf(init, 'x-od-workspace-id');
      // enforceWorkspaceResourceMutation: a workspace-aware caller is checked
      // against the row for ITS OWN workspace; no row means no standing.
      if (options.refusePatch || (workspaceId && spy.boundWorkspaceId !== workspaceId)) {
        spy.patchStatus = 403;
        return jsonResponse(
          { error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED', message: 'not allowed' } },
          403,
        );
      }
      const patch = init?.body ? (JSON.parse(String(init.body)) as { pendingPrompt?: string }) : {};
      spy.seededPendingPrompt = patch.pendingPrompt ?? null;
      spy.patchStatus = 200;
      return jsonResponse({
        id: REMIXED_PROJECT_ID,
        name: 'Remixed deck',
        skillId: null,
        designSystemId: null,
        createdAt: 1778244000000,
        updatedAt: 1778244000000,
        pendingPrompt: patch.pendingPrompt,
        metadata: { kind: 'prototype' },
      });
    }

    if (pathname === '/api/plugins') return jsonResponse({ plugins: [] });
    return jsonResponse({});
  }) as typeof fetch;
  return spy;
}

function renderEntryShellCommunity(
  handlers: {
    onOpenProject?: (id: string, fileName?: string) => void;
    onCreateProject?: (input: unknown) => Promise<boolean>;
  } = {},
) {
  return render(
    <I18nProvider initial="en">
      <EntryShell
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        projects={[]}
        templates={[]}
        promptTemplates={[]}
        defaultDesignSystemId={null}
        connectors={[]}
        connectorsLoading={false}
        config={baseConfig()}
        agents={[codexAgent()]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onConfigPersist={vi.fn()}
        onRefreshAgents={vi.fn(() => [codexAgent()])}
        onCreateProject={handlers.onCreateProject ?? vi.fn(async () => true)}
        onCreatePluginShareProject={vi.fn()}
        onImportClaudeDesign={vi.fn()}
        onOpenProject={handlers.onOpenProject ?? vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDeleteProject={vi.fn()}
        onRenameProject={vi.fn()}
        onChangeDefaultDesignSystem={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onOpenSettings={vi.fn()}
        onCompleteOnboarding={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe('Community Remix workspace binding', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
    window.history.replaceState(null, '', '/community');
    vi.mocked(daemonIsLive).mockResolvedValue(true);
    vi.mocked(fetchAgentsStream).mockResolvedValue([codexAgent()]);
    vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
    vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(listProjects).mockResolvedValue([]);
    vi.mocked(listTemplates).mockResolvedValue([]);
    vi.mocked(fetchDaemonConfig).mockResolvedValue({});
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue(null);
    vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
    vi.mocked(loadConfig).mockReturnValue(baseConfig());
    vi.mocked(syncConfigToDaemon).mockResolvedValue(undefined);
    vi.mocked(syncComposioConfigToDaemon).mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  it('binds an entry-shell remix to the team workspace the member is standing in', async () => {
    currentRoute = { kind: 'home', view: 'community' };
    const daemon = installDaemonStub();
    renderEntryShellCommunity();
    await waitFor(() => expect(daemon.contextReads).toBeGreaterThan(0));
    expect(daemon.directoryReads).toBeGreaterThan(0);
    expect(daemon.contextWorkspaceId).toBe(TEAM_WORKSPACE_ID);
    expect(daemon.contextWorkspaceMemberId).toBe(TEAM_MEMBER_ID);

    fireEvent.click(await screen.findByRole('button', { name: 'Remix template' }));

    await waitFor(() => expect(daemon.duplicateInit).toBeDefined());
    expect(headerOf(daemon.duplicateInit, 'x-od-workspace-id')).toBe(TEAM_WORKSPACE_ID);
    expect(headerOf(daemon.duplicateInit, 'x-od-workspace-member-id')).toBe(TEAM_MEMBER_ID);
    // The whole point of the headers: the copied project is a member of this
    // workspace, so it can appear in 草稿 / 全部项目.
    expect(daemon.boundWorkspaceId).toBe(TEAM_WORKSPACE_ID);

    // And because it is bound, the follow-up prompt seed is authorized rather
    // than 403'd into a silently-dropped `null`.
    await waitFor(() => expect(daemon.patchStatus).not.toBeNull());
    expect(daemon.patchStatus).toBe(200);
    expect(daemon.seededPendingPrompt).toBe(TEMPLATE_PROMPT);
  });

  // The remaining `null` shapes once binding is correct are genuine transient
  // refusals (daemon down, membership revoked mid-flight, workspace locked
  // between the two requests). The copied project is real and bound by then, so
  // the flow must NOT fall into its own catch: that would strand the copy and
  // hand the user a second, empty prompt-only project. It keeps the user on the
  // remix and reports the dropped seed instead of swallowing it.
  it('keeps the user on the remixed project — and creates no second one — when the prompt seed is refused', async () => {
    currentRoute = { kind: 'home', view: 'community' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const daemon = installDaemonStub({ refusePatch: true });
    const onOpenProject = vi.fn();
    const onCreateProject = vi.fn(async () => true);
    renderEntryShellCommunity({ onOpenProject, onCreateProject });
    await waitFor(() => expect(daemon.contextReads).toBeGreaterThan(0));
    expect(daemon.directoryReads).toBeGreaterThan(0);
    expect(daemon.contextWorkspaceId).toBe(TEAM_WORKSPACE_ID);
    expect(daemon.contextWorkspaceMemberId).toBe(TEAM_MEMBER_ID);

    fireEvent.click(await screen.findByRole('button', { name: 'Remix template' }));

    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith(REMIXED_PROJECT_ID, 'index.html'));
    expect(daemon.patchStatus).toBe(403);
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('binds a standalone /community remix to the team workspace the member is standing in', async () => {
    currentRoute = { kind: 'community' };
    const daemon = installDaemonStub();
    render(<App />);
    await waitFor(() => expect(daemon.contextReads).toBeGreaterThan(0));
    expect(daemon.directoryReads).toBeGreaterThan(0);
    expect(daemon.contextWorkspaceId).toBe(TEAM_WORKSPACE_ID);
    expect(daemon.contextWorkspaceMemberId).toBe(TEAM_MEMBER_ID);

    fireEvent.click(await screen.findByRole('button', { name: 'Remix template' }));

    await waitFor(() => expect(daemon.duplicateInit).toBeDefined());
    expect(headerOf(daemon.duplicateInit, 'x-od-workspace-id')).toBe(TEAM_WORKSPACE_ID);
    expect(headerOf(daemon.duplicateInit, 'x-od-workspace-member-id')).toBe(TEAM_MEMBER_ID);
    expect(daemon.boundWorkspaceId).toBe(TEAM_WORKSPACE_ID);

    await waitFor(() => expect(daemon.patchStatus).not.toBeNull());
    expect(daemon.patchStatus).toBe(200);
    expect(daemon.seededPendingPrompt).toBe(TEMPLATE_PROMPT);
  });
});
