// @vitest-environment jsdom
//
// Switching workspaces must not leave the previous workspace's projects on
// screen.
//
// Reported shape (owner, packaged client): 「在切换 workspace 时, 首页的"最近项目"
// 总是要慢一拍, 我切换过去后 首页下面的最近项目会继续显示我上个 workspace 的项目,
// 然后过一会儿再变」. The strip keeps rendering workspace A's cards under
// workspace B's identity for as long as B's list takes to arrive — which is
// worse than a spinner, because another workspace's data is presented as this
// one's.
//
// It is NOT a request-cache problem, and this test is what rules that out: it
// mocks `listProjects` outright, so `coalescedGet` never runs, and the previous
// workspace's card still rendered. The read the home strip goes through is
// `App.projects` ← `reconcileFetchedProjects` ← `listCurrentWorkspaceProjects`
// ← `listProjects({ workspaceContext })` → `listWorkspaceProjectSummaries`,
// whose coalesce key already carries workspaceId + memberId + role +
// memberStatus + lifecycleState + view (state/projects.ts). The hardcoded
// `'local-projects'` key sits on the other branch, unreachable once a context
// exists, so it cannot answer workspace B with workspace A's rows either.
//
// What was missing is simpler: `reconcileFetchedProjects` refuses to APPLY a
// response whose scope has moved on, but nothing DISCARDED the rows already on
// screen, and the re-list runs in an effect — i.e. after the commit the browser
// has already painted. So the fix is client-side state, not a request: no extra
// backend round-trip, and no dependency on a workspace-invalidation SSE event
// (a local switch must correct itself locally).

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildWorkspacePermissions } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import { navigate } from '../../src/router';
import type { AppConfig, Project } from '../../src/types';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  loadConfig,
  mergeDaemonConfig,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates, patchProject } from '../../src/state/projects';
import {
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { resetProjectDisplaySnapshots } from '../../src/state/project-display-cache';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

const projectViewLifecycle = vi.hoisted(() => ({
  mounts: vi.fn(),
  unmounts: vi.fn(),
  renders: vi.fn(),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    projects,
    projectsLoading,
    projectsLoadFailed,
    onProjectsRefresh,
    onOpenProject,
  }: {
    projects: Project[];
    projectsLoading?: boolean;
    projectsLoadFailed?: boolean;
    onProjectsRefresh?: () => Promise<void>;
    onOpenProject?: (id: string) => void;
  }) => (
    <main>
      <div data-testid="entry-home-surface" />
      <div data-testid="entry-projects-loading">{String(Boolean(projectsLoading))}</div>
      <div data-testid="entry-projects-failed">{String(Boolean(projectsLoadFailed))}</div>
      <button onClick={() => void onProjectsRefresh?.().catch(() => {})}>Retry projects</button>
      {projects.map((project) => (
        <div key={project.id} data-testid={`entry-project-${project.id}`} data-recency={project.lastUserQueryAt}>
          {project.name}
          <button onClick={() => onOpenProject?.(project.id)}>Open {project.id}</button>
        </div>
      ))}
    </main>
  ),
}));

vi.mock('../../src/components/ProjectView', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react');
  return {
    ProjectView: (props: {
      project: Project;
      workspaceContextOverride?: ReturnType<typeof workspaceContext> | null;
      onBack: () => void;
      onTouchProject: (sentAt: number) => void;
      onProjectChange: (project: Project) => void;
      onProjectsRefresh: () => Promise<void> | void;
    }) => {
      projectViewLifecycle.renders(props);
      useEffect(() => {
        projectViewLifecycle.mounts();
        return () => {
          projectViewLifecycle.unmounts();
          const context = props.workspaceContextOverride;
          void fetch(`/api/projects/${props.project.id}/collab/presence/leave`, {
            method: 'POST',
            headers: context
              ? {
                  'x-od-workspace-id': context.workspaceId,
                  'x-od-workspace-member-id': context.workspaceMemberId,
                }
              : undefined,
          });
        };
      }, []);
      useEffect(() => {
        const context = props.workspaceContextOverride;
        void fetch(`/api/projects/${props.project.id}/mock-project-resource`, {
          headers: context
            ? {
                'x-od-workspace-id': context.workspaceId,
                'x-od-workspace-member-id': context.workspaceMemberId,
              }
            : undefined,
        });
      }, [
        props.project.id,
        props.workspaceContextOverride?.workspaceId,
        props.workspaceContextOverride?.workspaceMemberId,
      ]);
      return (
        <main data-testid="project-view">
          <span data-testid="project-recency">{props.project.lastUserQueryAt}</span>
          <button data-testid="project-send" onClick={() => props.onTouchProject(5000)}>Send</button>
          <span data-testid="project-title">{props.project.name}</span>
          <button
            type="button"
            data-testid="project-rename"
            onClick={() => props.onProjectChange({
              ...props.project,
              name: 'Renamed from deep link',
              updatedAt: props.project.updatedAt + 1,
            })}
          >
            Rename
          </button>
          <button
            type="button"
            data-testid="project-foreign-update"
            onClick={() => props.onProjectChange({
              ...props.project,
              name: 'Foreign workspace title',
              workspaceId: 'ws-b',
              updatedAt: props.project.updatedAt + 2,
            })}
          >
            Foreign update
          </button>
          <button data-testid="project-back" onClick={props.onBack}>Back</button>
          <button
            data-testid="project-refresh"
            onClick={() => void Promise.resolve(props.onProjectsRefresh()).catch(() => {})}
          >
            Refresh
          </button>
        </main>
      );
    },
  };
});

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
  switchApiProtocolConfig: (config: AppConfig) => config,
  updateCurrentApiProtocolConfig: (config: AppConfig) => config,
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

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
    patchProject: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
  };
});

const baseConfig: AppConfig = {
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

function project(id: string, name: string): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 1778244000000,
    updatedAt: 1778244000000,
    metadata: { kind: 'prototype' },
  };
}

const WORKSPACE_A_PROJECT = project('project-in-a', 'Workspace A project');
const WORKSPACE_B_PROJECT = project('project-in-b', 'Workspace B project');

function workspaceContext(workspaceId: string) {
  return {
    workspaceId,
    workspaceType: 'team' as const,
    workspaceMemberId: `member-${workspaceId}`,
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    billingState: 'active' as const,
    planId: null,
    providerMode: 'platform_credits' as const,
    seatSummary: {
      seatLimit: 5,
      usedSeats: 1,
      availableSeats: 4,
      isSeatFull: false,
    },
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
    displayName: workspaceId,
  };
}

function workspaceContextPayload(workspaceId: string) {
  return { context: workspaceContext(workspaceId) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('App project list across a workspace switch', () => {
  beforeEach(() => {
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetCoalescedGet();
    resetProjectDisplaySnapshots();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.mocked(daemonIsLive).mockResolvedValue(true);
    vi.mocked(fetchAgentsStream).mockResolvedValue([]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
    vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
    vi.mocked(listTemplates).mockResolvedValue([]);
    vi.mocked(fetchDaemonConfig).mockResolvedValue({});
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue(null);
    vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig });
    projectViewLifecycle.mounts.mockClear();
    projectViewLifecycle.unmounts.mockClear();
    projectViewLifecycle.renders.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetCoalescedGet();
    resetProjectDisplaySnapshots();
  });

  it('keeps locally shared projects on the All projects page before the shared catalog catches up', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      return Response.json(pathname.endsWith('/workspace/directory')
        ? workspaceDirectoryFixture([workspaceContext('ws-a')])
        : pathname.endsWith('/workspace/context')
          ? workspaceContextPayload('ws-a')
          : {});
    }));
    const sharedProject = {
      ...WORKSPACE_A_PROJECT,
      id: 'locally-shared',
      name: 'Just moved to team',
      workspaceVisibility: 'team' as const,
    };
    vi.mocked(listProjects).mockImplementation(async (options) =>
      !options?.workspaceContext
        ? []
        : options.workspaceView === 'drafts'
          ? [WORKSPACE_A_PROJECT]
          : [WORKSPACE_A_PROJECT, sharedProject]);
    window.history.replaceState(null, '', '/drafts');

    render(<App />);
    await waitFor(() => expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy());
    expect(screen.getByText('Just moved to team').closest('[data-testid]')?.getAttribute('data-testid'))
      .toBe('entry-project-locally-shared');
  });

  it('never renders the previous workspace\'s projects while the new list is in flight', async () => {
    let activeWorkspaceId = 'ws-a';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([
                  workspaceContext('ws-a'),
                  workspaceContext('ws-b'),
                ])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload(activeWorkspaceId)
                : {},
        } as Response;
      }),
    );

    const workspaceB = deferred<Project[]>();
    vi.mocked(listProjects).mockImplementation(async (options) => {
      const workspaceId = options?.workspaceContext?.workspaceId ?? null;
      if (workspaceId === 'ws-b') return workspaceB.promise;
      return [WORKSPACE_A_PROJECT];
    });

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy(),
    );

    // The switch itself: B's context resolves, B's project list has NOT.
    activeWorkspaceId = 'ws-b';
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: workspaceContext('ws-b') });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        vi.mocked(listProjects).mock.calls.some(
          ([options]) => options?.workspaceContext?.workspaceId === 'ws-b',
        ),
      ).toBe(true),
    );

    // Workspace B is the active identity now. Whatever the strip shows must
    // belong to B — an empty strip is fine, A's project is not.
    expect(screen.queryByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeNull();

    await act(async () => {
      workspaceB.resolve([WORKSPACE_B_PROJECT]);
      await workspaceB.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_B_PROJECT.id}`)).toBeTruthy(),
    );
    expect(screen.queryByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeNull();
  });

  it('shows an exact warm view snapshot while one background refresh runs', async () => {
    const refreshedRecent = deferred<Project[]>();
    let recentReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return Response.json(
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([workspaceContext('ws-a')])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload('ws-a')
              : {},
        );
      }),
    );
    vi.mocked(listProjects).mockImplementation(async (options) => {
      if (options?.workspaceView === 'recent') {
        recentReads += 1;
        return recentReads === 1 ? [WORKSPACE_A_PROJECT] : refreshedRecent.promise;
      }
      if (options?.workspaceView === 'all') return [WORKSPACE_B_PROJECT];
      return [];
    });
    window.history.replaceState(null, '', '/');

    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy(),
    );
    act(() => navigate({ kind: 'home', view: 'all-projects' }));
    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_B_PROJECT.id}`)).toBeTruthy(),
    );

    act(() => navigate({ kind: 'home', view: 'home' }));
    await waitFor(() => expect(recentReads).toBe(2));

    expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`entry-project-${WORKSPACE_B_PROJECT.id}`)).toBeNull();
    expect(screen.getByTestId('entry-projects-loading').textContent).toBe('false');
    expect(recentReads).toBe(2);

    await act(async () => {
      refreshedRecent.resolve([{ ...WORKSPACE_A_PROJECT, name: 'Workspace A refreshed' }]);
      await refreshedRecent.promise;
    });
    await waitFor(() => expect(screen.getByText('Workspace A refreshed')).toBeTruthy());
  });

  it('keeps the exact last-good view when its background refresh fails', async () => {
    let recentReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return Response.json(
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([workspaceContext('ws-a')])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload('ws-a')
              : {},
        );
      }),
    );
    vi.mocked(listProjects).mockImplementation(async (options) => {
      if (options?.workspaceView === 'recent') {
        recentReads += 1;
        if (recentReads === 1) return [WORKSPACE_A_PROJECT];
        throw new Error('recent refresh unavailable');
      }
      if (options?.workspaceView === 'all') return [WORKSPACE_B_PROJECT];
      return [];
    });
    window.history.replaceState(null, '', '/');

    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy(),
    );
    act(() => navigate({ kind: 'home', view: 'all-projects' }));
    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_B_PROJECT.id}`)).toBeTruthy(),
    );
    act(() => navigate({ kind: 'home', view: 'home' }));

    await waitFor(() => expect(recentReads).toBe(3), { timeout: 3000 });
    expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`entry-project-${WORKSPACE_B_PROJECT.id}`)).toBeNull();
    expect(screen.getByTestId('entry-projects-loading').textContent).toBe('false');
  });

  it('does not reuse a snapshot across an account boundary with the same workspace identity', async () => {
    const secondAccountProjects = deferred<Project[]>();
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return Response.json(
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([workspaceContext('ws-a')])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload('ws-a')
              : {},
        );
      }),
    );
    vi.mocked(listProjects).mockImplementation(async (options) => {
      if (!options?.workspaceContext) return [];
      reads += 1;
      return reads === 1 ? [WORKSPACE_A_PROJECT] : secondAccountProjects.promise;
    });

    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy(),
    );

    act(() => notifyWorkspaceContextRefresh());
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
    expect(screen.queryByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeNull();

    await act(async () => {
      secondAccountProjects.resolve([WORKSPACE_B_PROJECT]);
      await secondAccountProjects.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_B_PROJECT.id}`)).toBeTruthy(),
    );
  });

  it('separates signed-in workspace projects from signed-out local projects in both directions', async () => {
    let signedIn = true;
    let signingInAgain = false;
    let nextWorkspaceReadStarted = false;
    const localProjects = deferred<Project[]>();
    const nextWorkspaceProjects = deferred<Project[]>();
    const localProject = project('signed-out-local', 'Signed-out local project');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      return Response.json(pathname.endsWith('/workspace/directory')
        ? {
            ...workspaceDirectoryFixture(signedIn ? [workspaceContext('ws-a')] : []),
            activeWorkspaceId: signedIn ? 'ws-a' : null,
          }
        : pathname.endsWith('/workspace/context')
          ? { context: signedIn ? workspaceContext('ws-a') : null }
          : {});
    }));
    vi.mocked(listProjects).mockImplementation(async (options) => {
      if (!options?.workspaceContext) return localProjects.promise;
      if (signingInAgain) nextWorkspaceReadStarted = true;
      return signingInAgain ? nextWorkspaceProjects.promise : [WORKSPACE_A_PROJECT];
    });
    window.history.replaceState(null, '', '/drafts');
    render(<App />);
    await waitFor(() => expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy());

    signedIn = false;
    await act(async () => notifyWorkspaceContextRefresh());
    await waitFor(() => expect(screen.queryByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeNull());
    await act(async () => localProjects.resolve([localProject]));
    await waitFor(() => expect(screen.getByTestId('entry-project-signed-out-local')).toBeTruthy());

    signedIn = true;
    signingInAgain = true;
    await act(async () => notifyWorkspaceContextRefresh());
    await waitFor(() => expect(nextWorkspaceReadStarted).toBe(true));
    await waitFor(() => {
      expect(screen.queryByTestId('entry-project-signed-out-local')).toBeNull();
      expect(screen.queryByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeNull();
    });
    await act(async () => nextWorkspaceProjects.resolve([WORKSPACE_B_PROJECT]));
    await waitFor(() => expect(screen.getByTestId(`entry-project-${WORKSPACE_B_PROJECT.id}`)).toBeTruthy());
  });

  it('keeps an open A project mounted and scoped to A while the ambient shell switches to B', async () => {
    const boundProjectA: Project = {
      ...WORKSPACE_A_PROJECT,
      workspaceId: 'ws-a',
    };
    const boundProjectB: Project = {
      ...WORKSPACE_B_PROJECT,
      workspaceId: 'ws-b',
    };
    let activeWorkspaceId = 'ws-a';
    const projectResourceRequests: Array<{ url: string; headers: Headers }> = [];
    const presenceLeaveRequests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const pathname = new URL(url, 'http://d.local').pathname;
        if (pathname.endsWith('/mock-project-resource')) {
          projectResourceRequests.push({
            url: pathname,
            headers: new Headers(init?.headers),
          });
        }
        if (pathname.endsWith('/collab/presence/leave')) {
          presenceLeaveRequests.push(pathname);
        }
        return new Response(JSON.stringify(
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([
                workspaceContext('ws-a'),
                workspaceContext('ws-b'),
              ])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload(activeWorkspaceId)
              : pathname.endsWith('/integrations/vela/status')
                ? {
                    loggedIn: true,
                    profile: 'default',
                    user: { id: 'user-1', email: 'owner@example.com' },
                    configPath: '/test/config.json',
                  }
              : {},
        ), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    const workspaceB = deferred<Project[]>();
    vi.mocked(listProjects).mockImplementation(async (options) => {
      const workspaceId = options?.workspaceContext?.workspaceId ?? null;
      if (workspaceId === 'ws-b') return workspaceB.promise;
      return [boundProjectA];
    });
    window.history.replaceState(null, '', `/projects/${boundProjectA.id}`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-view')).toBeTruthy();
      expect(projectViewLifecycle.mounts).toHaveBeenCalledTimes(1);
      expect(projectResourceRequests).toHaveLength(1);
    });
    expect(projectResourceRequests[0]?.headers.get('x-od-workspace-id')).toBe('ws-a');

    activeWorkspaceId = 'ws-b';
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: workspaceContext('ws-b') });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        vi.mocked(listProjects).mock.calls.some(
          ([options]) => options?.workspaceContext?.workspaceId === 'ws-b',
        ),
      ).toBe(true),
    );

    expect(screen.getByTestId('project-view')).toBeTruthy();
    expect(projectViewLifecycle.mounts).toHaveBeenCalledTimes(1);
    expect(projectViewLifecycle.unmounts).not.toHaveBeenCalled();
    expect(presenceLeaveRequests).toEqual([]);
    expect(window.location.pathname).toBe(`/projects/${boundProjectA.id}`);
    expect(projectViewLifecycle.renders.mock.lastCall?.[0]).toMatchObject({
      project: { id: boundProjectA.id, workspaceId: 'ws-a' },
      workspaceContextOverride: {
        workspaceId: 'ws-a',
        workspaceMemberId: 'member-ws-a',
      },
    });

    await act(async () => {
      workspaceB.resolve([boundProjectB]);
      await workspaceB.promise;
    });
    await waitFor(() =>
      expect(
        vi.mocked(listProjects).mock.calls.some(
          ([options]) => options?.workspaceContext?.workspaceId === 'ws-b',
        ),
      ).toBe(true),
    );

    expect(screen.getByTestId('project-view')).toBeTruthy();
    expect(projectViewLifecycle.mounts).toHaveBeenCalledTimes(1);
    expect(projectViewLifecycle.unmounts).not.toHaveBeenCalled();
    expect(presenceLeaveRequests).toEqual([]);
    expect(window.location.pathname).toBe(`/projects/${boundProjectA.id}`);
    expect(projectResourceRequests.every(
      (request) =>
        request.headers.get('x-od-workspace-id') === 'ws-a'
        && request.headers.get('x-od-workspace-member-id') === 'member-ws-a',
    )).toBe(true);
  });

  it('drops an open project after its own authoritative workspace list no longer contains it', async () => {
    const boundProjectA: Project = {
      ...WORKSPACE_A_PROJECT,
      workspaceId: 'ws-a',
    };
    const projectResourceRequests: Array<{ url: string; headers: Headers }> = [];
    let removeProjectFromAuthoritativeList = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname.endsWith('/mock-project-resource')) {
          projectResourceRequests.push({
            url: pathname,
            headers: new Headers(init?.headers),
          });
        }
        if (pathname === `/api/projects/${boundProjectA.id}/workspace-scope`) {
          return new Response(JSON.stringify({ error: 'project_not_found' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([workspaceContext('ws-a')])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload('ws-a')
              : {},
        ), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    vi.mocked(listProjects).mockImplementation(async () =>
      removeProjectFromAuthoritativeList ? [] : [boundProjectA],
    );
    window.history.replaceState(null, '', `/projects/${boundProjectA.id}`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-view')).toBeTruthy();
      expect(projectViewLifecycle.mounts).toHaveBeenCalledTimes(1);
      expect(projectResourceRequests).toHaveLength(1);
    });
    expect(projectResourceRequests[0]?.headers.get('x-od-workspace-id')).toBe('ws-a');

    removeProjectFromAuthoritativeList = true;
    fireEvent.click(screen.getByTestId('project-refresh'));

    await waitFor(() => {
      expect(screen.queryByTestId('project-view')).toBeNull();
      expect(projectViewLifecycle.unmounts).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(window.location.pathname).toBe(`/projects/${boundProjectA.id}`);
    expect(projectResourceRequests).toHaveLength(1);
  });

  it('retains a bootstrapped project when a newer authoritative refresh fails', async () => {
    const boundProjectA: Project = {
      ...WORKSPACE_A_PROJECT,
      workspaceId: 'ws-a',
    };
    let projectListReads = 0;
    let scopeReads = 0;
    const projectResourceRequests: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (pathname === `/api/projects/${boundProjectA.id}/workspace-scope`) {
          scopeReads += 1;
          return new Response(JSON.stringify({
            scope: {
              kind: 'team',
              projectId: boundProjectA.id,
              workspaceId: 'ws-a',
              visibility: 'team',
              context: workspaceContext('ws-a'),
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (pathname === `/api/projects/${boundProjectA.id}`) {
          return new Response(JSON.stringify({ project: boundProjectA }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (pathname.endsWith('/mock-project-resource')) {
          projectResourceRequests.push({
            url: pathname,
            headers: new Headers(init?.headers),
          });
        }
        return new Response(JSON.stringify(
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([workspaceContext('ws-a')])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload('ws-a')
              : {},
        ), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    vi.mocked(listProjects).mockImplementation(async () => {
      projectListReads += 1;
      if (projectListReads === 1) return [];
      throw new Error('authoritative list unavailable');
    });
    window.history.replaceState(null, '', `/projects/${boundProjectA.id}`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('project-view')).toBeTruthy();
      expect(scopeReads).toBe(2);
      expect(projectViewLifecycle.mounts).toHaveBeenCalledTimes(1);
      expect(projectResourceRequests).toHaveLength(1);
    });

    fireEvent.click(screen.getByTestId('project-refresh'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('project-view')).toBeTruthy();
    expect(scopeReads).toBe(2);
    expect(projectViewLifecycle.mounts).toHaveBeenCalledTimes(1);
    expect(projectViewLifecycle.unmounts).not.toHaveBeenCalled();
    expect(projectResourceRequests).toHaveLength(1);
  });

  it('waits for the scoped project list on refresh instead of probing a bound project headerless', async () => {
    const boundProject = { ...WORKSPACE_A_PROJECT, workspaceId: 'ws-a' };
    const projectList = deferred<Project[]>();
    const scopeRequests: Headers[] = [];
    vi.mocked(listProjects).mockImplementation(async (options) =>
      options?.workspaceContext ? projectList.promise : []);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname === `/api/projects/${boundProject.id}/workspace-scope`) {
        const headers = new Headers(init?.headers);
        scopeRequests.push(headers);
        return Response.json({ error: { code: 'WORKSPACE_CONTEXT_REQUIRED' } }, { status: 400 });
      }
      return Response.json(pathname.endsWith('/workspace/directory')
        ? workspaceDirectoryFixture([workspaceContext('ws-a')])
        : pathname.endsWith('/workspace/context')
          ? workspaceContextPayload('ws-a')
          : {});
    }));
    window.history.replaceState(null, '', `/projects/${boundProject.id}`);

    render(<App />);
    await waitFor(() => expect(vi.mocked(listProjects).mock.calls.some(
      ([options]) => options?.workspaceContext?.workspaceId === 'ws-a',
    )).toBe(true));
    expect(scopeRequests).toEqual([]);
    expect(screen.queryByTestId('project-view')).toBeNull();

    await act(async () => {
      projectList.resolve([boundProject]);
      await projectList.promise;
    });
    await waitFor(() => expect(screen.getByTestId('project-view')).toBeTruthy());
    expect(scopeRequests).toEqual([]);
    expect(projectViewLifecycle.renders.mock.lastCall?.[0]).toMatchObject({
      workspaceContextOverride: { workspaceId: 'ws-a', workspaceMemberId: 'member-ws-a' },
    });
  });

  it('bootstraps a fresh A deep link under ambient B without any headerless project-data read', async () => {
    const boundProjectA: Project = {
      ...WORKSPACE_A_PROJECT,
      workspaceId: 'ws-a',
    };
    const boundProjectB: Project = {
      ...WORKSPACE_B_PROJECT,
      workspaceId: 'ws-b',
    };
    const projectDataRequests: Array<{ url: string; headers: Headers }> = [];
    const rejectedHeaderlessReads: string[] = [];
    const scopeResponse = deferred<Response>();
    let scopeReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const pathname = new URL(url, 'http://d.local').pathname;
        const headers = new Headers(init?.headers);
        if (pathname === `/api/projects/${boundProjectA.id}/workspace-scope`) {
          scopeReads += 1;
          if (scopeReads === 1) return scopeResponse.promise;
          expect(headers.get('x-od-workspace-id')).toBe('ws-a');
          expect(headers.get('x-od-workspace-member-id')).toBe('member-ws-a');
          return new Response(JSON.stringify({
            scope: {
              kind: 'team',
              projectId: boundProjectA.id,
              workspaceId: 'ws-a',
              visibility: 'team',
              context: workspaceContext('ws-a'),
            },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (
          pathname === `/api/projects/${boundProjectA.id}`
          || pathname.endsWith('/mock-project-resource')
        ) {
          projectDataRequests.push({ url: pathname, headers });
          if (
            headers.get('x-od-workspace-id') !== 'ws-a'
            || headers.get('x-od-workspace-member-id') !== 'member-ws-a'
          ) {
            rejectedHeaderlessReads.push(pathname);
            return new Response('{}', { status: 400 });
          }
          return new Response(JSON.stringify(
            pathname === `/api/projects/${boundProjectA.id}`
              ? { project: boundProjectA }
              : {},
          ), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(
          pathname.endsWith('/workspace/directory')
            ? workspaceDirectoryFixture([
                workspaceContext('ws-a'),
                workspaceContext('ws-b'),
              ])
            : pathname.endsWith('/workspace/context')
              ? workspaceContextPayload('ws-a')
              : pathname.endsWith('/integrations/vela/status')
                ? {
                    loggedIn: true,
                    profile: 'default',
                    user: { id: 'user-1', email: 'owner@example.com' },
                    configPath: '/test/config.json',
                  }
              : {},
        ), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    vi.mocked(listProjects).mockResolvedValue([boundProjectB]);
    window.history.replaceState(null, '', `/projects/${boundProjectA.id}`);

    render(<App />);

    await waitFor(() => expect(scopeReads).toBe(1));
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: workspaceContext('ws-b') });
      await Promise.resolve();
    });
    await act(async () => {
      scopeResponse.resolve(new Response(JSON.stringify({
        scope: {
          kind: 'team',
          projectId: boundProjectA.id,
          workspaceId: 'ws-a',
          visibility: 'team',
          context: workspaceContext('ws-a'),
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      await scopeResponse.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('project-view')).toBeTruthy();
      expect(projectViewLifecycle.mounts).toHaveBeenCalledTimes(1);
    });
    expect(window.location.pathname).toBe(`/projects/${boundProjectA.id}`);
    expect(scopeReads).toBe(2);
    expect(rejectedHeaderlessReads).toEqual([]);
    expect(
      projectDataRequests.filter(
        (request) => request.url === `/api/projects/${boundProjectA.id}`,
      ),
    ).toHaveLength(1);
    expect(projectDataRequests.every(
      (request) =>
        request.headers.get('x-od-workspace-id') === 'ws-a'
        && request.headers.get('x-od-workspace-member-id') === 'member-ws-a',
    )).toBe(true);
    expect(projectViewLifecycle.renders.mock.lastCall?.[0]).toMatchObject({
      project: { id: boundProjectA.id, workspaceId: 'ws-a' },
      workspaceContextOverride: {
        workspaceId: 'ws-a',
        workspaceMemberId: 'member-ws-a',
      },
    });

    fireEvent.click(screen.getByTestId('project-back'));
    await waitFor(() => expect(screen.getByTestId('entry-home-surface')).toBeTruthy());
    expect(screen.queryByTestId(`entry-project-${boundProjectA.id}`)).toBeNull();
    expect(screen.getByTestId(`entry-project-${boundProjectB.id}`)).toBeTruthy();
  });

  it('waits for directory authority before mounting a deep link after the startup catalog settles', async () => {
    const boundProjectA: Project = {
      ...WORKSPACE_A_PROJECT,
      workspaceId: 'ws-a',
    };
    const directory = deferred<Response>();
    let scopeReads = 0;
    let detailReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname === '/api/workspace/directory') return directory.promise.then((response) => response.clone());
      if (pathname === `/api/projects/${boundProjectA.id}/workspace-scope`) {
        scopeReads += 1;
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: boundProjectA.id,
            workspaceId: 'ws-a',
            visibility: 'team',
            context: workspaceContext('ws-a'),
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (pathname === `/api/projects/${boundProjectA.id}`) {
        detailReads += 1;
        const headers = new Headers(init?.headers);
        expect(headers.get('x-od-workspace-id')).toBe('ws-a');
        expect(headers.get('x-od-workspace-member-id')).toBe('member-ws-a');
        return new Response(JSON.stringify({
          project: boundProjectA,
          resolvedDir: '/tmp/project-in-a',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));
    vi.mocked(listProjects).mockResolvedValue([]);
    window.history.replaceState(null, '', `/projects/${boundProjectA.id}`);

    render(<App />);

    await waitFor(() => expect(vi.mocked(listProjects)).toHaveBeenCalled());
    expect(scopeReads).toBe(0);
    expect(detailReads).toBe(0);
    expect(screen.queryByTestId('project-view')).toBeNull();
    await act(async () => {
      directory.resolve(new Response(JSON.stringify(workspaceDirectoryFixture([workspaceContext('ws-a')]))));
    });

    await waitFor(() => {
      expect(scopeReads).toBe(2);
      expect(detailReads).toBe(1);
      expect(screen.getByTestId('project-view')).toBeTruthy();
    });
    expect(vi.mocked(listProjects)).toHaveBeenCalled();
    expect(projectViewLifecycle.renders.mock.lastCall?.[0]).toMatchObject({
      project: boundProjectA,
      workspaceContextOverride: {
        workspaceId: 'ws-a',
        workspaceMemberId: 'member-ws-a',
      },
      initialWorkspaceScope: {
        projectId: boundProjectA.id,
        workspaceId: 'ws-a',
      },
      initialProjectDetail: {
        project: boundProjectA,
        resolvedDir: '/tmp/project-in-a',
      },
    });

    fireEvent.click(screen.getByTestId('project-rename'));
    await waitFor(() => {
      expect(screen.getByTestId('project-title').textContent).toBe('Renamed from deep link');
      expect(
        screen.getAllByRole('tab').some((tab) =>
          tab.textContent?.includes('Renamed from deep link')),
      ).toBe(true);
    });

    fireEvent.click(screen.getByTestId('project-foreign-update'));
    await act(async () => Promise.resolve());
    expect(screen.getByTestId('project-title').textContent).toBe('Renamed from deep link');
    expect(
      screen.getAllByRole('tab').some((tab) =>
        tab.textContent?.includes('Foreign workspace title')),
    ).toBe(false);
  });

  it('adopts an in-flight bootstrap after a workspace selection change', async () => {
    const boundProjectA: Project = {
      ...WORKSPACE_A_PROJECT,
      workspaceId: 'ws-a',
    };
    const directory = deferred<Response>();
    const scopeResponse = deferred<Response>();
    let scopeReads = 0;
    let detailReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname === '/api/workspace/directory') return directory.promise.then((response) => response.clone());
      if (pathname === `/api/projects/${boundProjectA.id}/workspace-scope`) {
        scopeReads += 1;
        if (scopeReads === 1) return scopeResponse.promise;
        const headers = new Headers(init?.headers);
        expect(headers.get('x-od-workspace-id')).toBe('ws-a');
        expect(headers.get('x-od-workspace-member-id')).toBe('member-ws-a');
        return new Response(JSON.stringify({
          scope: {
            kind: 'team',
            projectId: boundProjectA.id,
            workspaceId: 'ws-a',
            visibility: 'team',
            context: workspaceContext('ws-a'),
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (pathname === `/api/projects/${boundProjectA.id}`) {
        detailReads += 1;
        const headers = new Headers(init?.headers);
        expect(headers.get('x-od-workspace-id')).toBe('ws-a');
        expect(headers.get('x-od-workspace-member-id')).toBe('member-ws-a');
        return new Response(JSON.stringify({
          project: boundProjectA,
          resolvedDir: '/tmp/project-in-a',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));
    vi.mocked(listProjects).mockResolvedValue([]);
    window.history.replaceState(null, '', `/projects/${boundProjectA.id}`);

    render(<App />);

    await act(async () => {
      directory.resolve(new Response(JSON.stringify(workspaceDirectoryFixture([workspaceContext('ws-a')]))));
    });
    await waitFor(() => expect(scopeReads).toBe(1));
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: workspaceContext('ws-b') });
      await Promise.resolve();
    });
    await act(async () => {
      scopeResponse.resolve(new Response(JSON.stringify({
        scope: {
          kind: 'team',
          projectId: boundProjectA.id,
          workspaceId: 'ws-a',
          visibility: 'team',
          context: workspaceContext('ws-a'),
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
      await scopeResponse.promise;
    });

    await waitFor(() => {
      expect(scopeReads).toBe(2);
      expect(detailReads).toBe(1);
      expect(screen.getByTestId('project-view')).toBeTruthy();
    });
    expect(projectViewLifecycle.renders.mock.lastCall?.[0]).toMatchObject({
      project: boundProjectA,
      workspaceContextOverride: {
        workspaceId: 'ws-a',
        workspaceMemberId: 'member-ws-a',
      },
    });
  });
  it.each(['before-send', 'during-write'] as const)('preserves send recency against a stale list issued %s', async (timing) => {
    const original = { ...WORKSPACE_A_PROJECT, workspaceId: 'ws-a', lastUserQueryAt: 100 };
    const oldRead = deferred<Project[]>();
    const write = deferred<Project | null>();
    vi.mocked(patchProject).mockReturnValue(write.promise);
    vi.mocked(listProjects).mockResolvedValue([original]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      const body = pathname.endsWith('/workspace/directory')
        ? workspaceDirectoryFixture([workspaceContext('ws-a')])
        : pathname.endsWith('/workspace/context') ? workspaceContextPayload('ws-a')
        : pathname.endsWith('/workspace-scope') ? { scope: {
          kind: 'team', projectId: original.id, workspaceId: 'ws-a', visibility: 'team', context: workspaceContext('ws-a'),
        } }
        : pathname === `/api/projects/${original.id}` ? { project: original }
        : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    window.history.replaceState(null, '', `/projects/${original.id}`);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('project-view')).toBeTruthy());
    const sendOwner = projectViewLifecycle.renders.mock.lastCall![0];
    if (timing === 'during-write') fireEvent.click(screen.getByTestId('project-send'));
    vi.mocked(listProjects).mockReturnValueOnce(oldRead.promise);
    await act(async () => fireEvent.click(screen.getByTestId('project-refresh')));
    if (timing === 'before-send') fireEvent.click(screen.getByTestId('project-send'));
    await waitFor(() => expect(screen.getByTestId('project-recency').textContent).toBe('5000'));
    await act(async () => write.resolve({ ...original, lastUserQueryAt: 5000 }));
    await act(async () => oldRead.resolve([original]));
    expect(screen.getByTestId('project-recency').textContent).toBe('5000');
    // OPEND-4040: the first-send closure still holds the pre-send project.
    await act(async () => sendOwner.onProjectChange({ ...original, name: 'Automatic title' }));
    expect(screen.getByTestId('project-title').textContent).toBe('Automatic title');
    expect(screen.getByTestId('project-recency').textContent).toBe('5000');
    // Fresh post-write reads remain authoritative, including newer remote sends.
    vi.mocked(listProjects).mockResolvedValue([{ ...original, lastUserQueryAt: 6000 }]);
    await act(async () => fireEvent.click(screen.getByTestId('project-refresh')));
    await waitFor(() => expect(screen.getByTestId('project-recency').textContent).toBe('6000'));
    fireEvent.click(screen.getByTestId('project-back'));
    await waitFor(() => expect(screen.getByTestId(`entry-project-${original.id}`).getAttribute('data-recency')).toBe('6000'));
  });

  it('OPEND-4067 keeps a delayed A receipt scoped to A after opening workspace B', async () => {
    const a = { ...WORKSPACE_A_PROJECT, workspaceId: 'ws-a', lastUserQueryAt: 100 };
    const b = { ...WORKSPACE_B_PROJECT, workspaceId: 'ws-b', lastUserQueryAt: 200 };
    let current = 'ws-a';
    vi.mocked(listProjects).mockImplementation(async (options) =>
      options?.workspaceContext?.workspaceId === 'ws-b' ? [b] : [a]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://d.local').pathname;
      const project = path.includes(b.id) ? b : a;
      return Response.json(path.endsWith('/workspace/directory')
        ? { ...workspaceDirectoryFixture([workspaceContext('ws-a'), workspaceContext('ws-b')]), activeWorkspaceId: current }
        : path.endsWith('/workspace/context') ? workspaceContextPayload(current)
        : path.endsWith('/workspace-scope') ? { scope: { kind: 'team', projectId: project.id,
          workspaceId: project.workspaceId, visibility: 'team', context: workspaceContext(project.workspaceId) } }
        : { project });
    }));
    window.history.replaceState(null, '', `/projects/${a.id}`);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('project-recency').textContent).toBe('100'));
    const oldSend = projectViewLifecycle.renders.mock.lastCall![0].onTouchProject;
    await act(async () => navigate({ kind: 'home', view: 'home' }));
    current = 'ws-b';
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: workspaceContext('ws-b') });
    });
    await waitFor(() => expect(screen.getByTestId(`entry-project-${b.id}`)).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText(`Open ${b.id}`));
    });
    await waitFor(() => expect(projectViewLifecycle.renders.mock.calls.some(([props]) => props.project.id === b.id)).toBe(true));
    vi.mocked(patchProject).mockClear();
    await act(async () => oldSend(5000));
    expect(projectViewLifecycle.renders.mock.calls.filter(([props]) => props.project.id === b.id).at(-1)![0].project.lastUserQueryAt).toBe(200);
    // The receipt is already persisted: no late PATCH can borrow B's identity.
    expect(patchProject).not.toHaveBeenCalled();
  });

  it('keeps a rejected list distinct from an empty success and clears failure after retry', async () => {
    vi.mocked(listProjects).mockRejectedValue(new Error('projects 403'));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('entry-projects-failed').textContent).toBe('true'));
    expect(screen.queryByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeNull();
    vi.mocked(listProjects).mockResolvedValue([]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry projects' })));
    expect(screen.getByTestId('entry-projects-failed').textContent).toBe('false');
  });

  it('does not let an older success clear a newer failed refresh', async () => {
    vi.mocked(listProjects).mockResolvedValue([]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('entry-projects-loading').textContent).toBe('false'));
    const olderRead = deferred<Project[]>();
    vi.mocked(listProjects).mockReturnValueOnce(olderRead.promise);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry projects' })));
    vi.mocked(listProjects).mockRejectedValueOnce(new Error('projects 403'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry projects' })));
    expect(screen.getByTestId('entry-projects-failed').textContent).toBe('true');
    await act(async () => olderRead.resolve([]));
    expect(screen.getByTestId('entry-projects-failed').textContent).toBe('true');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry projects' })));
    expect(screen.getByTestId('entry-projects-failed').textContent).toBe('false');
  });

});
