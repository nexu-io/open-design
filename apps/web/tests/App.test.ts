import { describe, expect, it, vi } from 'vitest';

import {
  buildPersistedConfig,
  clearAmrLiveModelsFromAgents,
  isAutosaveDraftOnlyChange,
  hydrateReadyTeamProject,
  mergeAgentModelChoice,
  mergeAmrModelsIntoAgents,
  persistComposioConfigChange,
  projectViewAuthorizationLifetimeKey,
  projectRouteSurfaceState,
  resolveAmrModelsCatalogScope,
  resolveDeepLinkedTeamSharedProject,
  resolveSettingsCloseConfig,
  shouldRouteToFirstRunOnboarding,
  shouldSyncMediaProvidersOnSave,
} from '../src/App';
import type { AgentInfo, AppConfig, Project } from '../src/types';
import type {
  AmrModelsResponse,
  WorkspaceCollabContext,
  WorkspaceProjectSummary,
} from '@open-design/contracts';
import { workspaceIdentityCacheKey } from '../src/collab/workspace-identity';

describe('projectRouteSurfaceState', () => {
  it('only shows an unbounded loader while the initial project list is loading', () => {
    expect(projectRouteSurfaceState({
      projectsLoading: true,
      hasActiveProject: false,
      daemonLive: false,
    })).toBe('loading-projects');
  });

  it('makes an absent project terminal when the daemon is unavailable', () => {
    expect(projectRouteSurfaceState({
      projectsLoading: false,
      hasActiveProject: false,
      daemonLive: false,
    })).toBe('daemon-unavailable');
  });

  it('exposes bounded deep-link failures instead of leaving the route loading forever', () => {
    expect(projectRouteSurfaceState({
      projectsLoading: false,
      hasActiveProject: false,
      daemonLive: true,
      resolutionFailure: 'missing',
    })).toBe('missing');
    expect(projectRouteSurfaceState({
      projectsLoading: false,
      hasActiveProject: false,
      daemonLive: true,
      resolutionFailure: 'materialization-failed',
    })).toBe('materialization-failed');
  });

  it('renders a loaded project regardless of stale failure metadata', () => {
    expect(projectRouteSurfaceState({
      projectsLoading: false,
      hasActiveProject: true,
      daemonLive: true,
      resolutionFailure: 'missing',
    })).toBe('ready');
  });
});

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

describe('shouldRouteToFirstRunOnboarding', () => {
  it('never hijacks an explicit project deep link while daemon config is hydrating', () => {
    const unfinished = { ...baseConfig, onboardingCompleted: false };

    expect(shouldRouteToFirstRunOnboarding(unfinished, '/projects/project-a')).toBe(false);
    expect(shouldRouteToFirstRunOnboarding(unfinished, '/')).toBe(true);
  });
});

describe('hydrateReadyTeamProject', () => {
  const project: Project = {
    id: 'shared-ready',
    name: 'Ready project',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    workspaceId: 'ws-1',
  };
  const teamContext = {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    memberStatus: 'active',
    lifecycleState: 'active',
    teamId: 'team-1',
  } as WorkspaceCollabContext;
  const summary: WorkspaceProjectSummary = {
    id: project.id,
    name: project.name,
    workspaceId: 'ws-1',
    visibility: 'team',
    resourceState: 'active',
    createdByWorkspaceMemberId: null,
    resourceHubResourceId: 'resource-shared-ready',
    cloudTombstonedAt: null,
    currentUserAccess: {
      canOpen: true,
      canRename: false,
      canDelete: false,
      canDuplicate: false,
      canMoveToTeam: false,
      canMoveToPersonal: false,
      canExport: true,
      canSendTo: true,
      canRestoreVersion: false,
    },
    syncState: 'synced',
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    project,
  };

  it('fetches and applies only the ready project with the validated workspace scope', async () => {
    const listWorkspaceProjects = vi.fn(async () => [summary]);
    const applyProject = vi.fn();
    const result = await hydrateReadyTeamProject('shared-ready', 'ws-1', {
      getWorkspaceContext: () => teamContext,
      listWorkspaceProjects,
      applyProject,
    });

    expect(listWorkspaceProjects).toHaveBeenCalledWith(teamContext);
    expect(applyProject).toHaveBeenCalledWith(project);
    expect(result).toEqual(project);
  });

  it('invalidates the exact file authority before publishing readiness', async () => {
    const order: string[] = [];
    const onReady = vi.fn((_project: Project, context: WorkspaceCollabContext) => {
      expect(context).toBe(teamContext);
      order.push('invalidate');
    });
    const applyProject = vi.fn(() => order.push('apply'));

    await expect(hydrateReadyTeamProject(project.id, 'ws-1', {
      getWorkspaceContext: () => teamContext,
      listWorkspaceProjects: async () => [summary],
      onReady,
      applyProject,
    })).resolves.toEqual(project);

    expect(onReady).toHaveBeenCalledWith(project, teamContext);
    expect(order).toEqual(['invalidate', 'apply']);
  });

  it('drops a hydration result when the workspace changes while the scoped list is in flight', async () => {
    let resolveProjects!: (value: WorkspaceProjectSummary[]) => void;
    const pending = new Promise<WorkspaceProjectSummary[]>((resolve) => {
      resolveProjects = resolve;
    });
    let context: WorkspaceCollabContext = teamContext;
    const applyProject = vi.fn();
    const hydration = hydrateReadyTeamProject('shared-ready', 'ws-1', {
      getWorkspaceContext: () => context,
      listWorkspaceProjects: async () => pending,
      applyProject,
    });
    context = { ...teamContext, workspaceId: 'ws-other' };
    resolveProjects([summary]);

    await expect(hydration).resolves.toBeNull();
    expect(applyProject).not.toHaveBeenCalled();
  });

  it('rejects a remote-only catalog card that has no materialized local binding', async () => {
    const applyProject = vi.fn();
    const remoteOnly = {
      ...summary,
      id: 'resource-shared-ready',
      project: { ...project, workspaceId: undefined },
    };

    await expect(hydrateReadyTeamProject('shared-ready', 'ws-1', {
      getWorkspaceContext: () => teamContext,
      listWorkspaceProjects: async () => [remoteOnly],
      applyProject,
    })).resolves.toBeNull();
    expect(applyProject).not.toHaveBeenCalled();
  });
});

describe('projectViewAuthorizationLifetimeKey', () => {
  const projectId = 'same-project';
  const baseContext = {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: 'member-a',
    memberStatus: 'active',
    lifecycleState: 'active',
    teamId: 'team-a',
  } as WorkspaceCollabContext;

  it('changes when any Workspace authorization field changes', () => {
    const initial = projectViewAuthorizationLifetimeKey(projectId, baseContext);

    expect(projectViewAuthorizationLifetimeKey(projectId, {
      ...baseContext,
      workspaceId: 'workspace-b',
    })).not.toBe(initial);
    expect(projectViewAuthorizationLifetimeKey(projectId, {
      ...baseContext,
      workspaceMemberId: 'member-b',
    })).not.toBe(initial);
    expect(projectViewAuthorizationLifetimeKey(projectId, {
      ...baseContext,
      role: 'admin',
    })).not.toBe(initial);
    expect(projectViewAuthorizationLifetimeKey(projectId, {
      ...baseContext,
      lifecycleState: 'locked',
    })).not.toBe(initial);
    expect(projectViewAuthorizationLifetimeKey(projectId, {
      ...baseContext,
      permissions: {
        ...baseContext.permissions,
        canShareProjects: true,
        canWriteSyncedFiles: false,
      },
    })).not.toBe(initial);
    expect(projectViewAuthorizationLifetimeKey(projectId, null)).not.toBe(initial);
  });
});

describe('mergeAgentModelChoice', () => {
  it('preserves serviceTier when an unrelated update omits the key', () => {
    expect(
      mergeAgentModelChoice(
        { model: 'gpt-5.5', reasoning: 'default', serviceTier: 'priority' },
        { reasoning: 'high' },
      ),
    ).toEqual({
      model: 'gpt-5.5',
      reasoning: 'high',
      serviceTier: 'priority',
    });
  });

  it('removes serviceTier only when the update explicitly clears it', () => {
    const merged = mergeAgentModelChoice(
      { model: 'gpt-5.5', reasoning: 'default', serviceTier: 'priority' },
      { serviceTier: undefined },
    );

    expect(merged).toEqual({
      model: 'gpt-5.5',
      reasoning: 'default',
    });
    expect(Object.prototype.hasOwnProperty.call(merged, 'serviceTier')).toBe(false);
  });
});

describe('persistComposioConfigChange', () => {
  it('does not update local saved state when the daemon save fails', async () => {
    await expect(
      persistComposioConfigChange(
        baseConfig,
        { apiKey: 'cmp_new_key', apiKeyConfigured: false },
        vi.fn(async () => false),
      ),
    ).rejects.toThrow('Composio config save failed');
  });

  it('normalizes the saved Composio key after a successful daemon save', async () => {
    await expect(
      persistComposioConfigChange(
        baseConfig,
        { apiKey: 'cmp_new_key', apiKeyConfigured: false },
        vi.fn(async () => true),
      ),
    ).resolves.toMatchObject({
      composio: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '_key',
      },
    });
  });
});

describe('shouldSyncMediaProvidersOnSave', () => {
  it('keeps bootstrap-style empty media maps from syncing by default', () => {
    expect(shouldSyncMediaProvidersOnSave({})).toBe(false);
  });

  it('syncs an explicit empty media map when the user save should force a clear', () => {
    expect(shouldSyncMediaProvidersOnSave({}, { force: true })).toBe(true);
  });
});

describe('buildPersistedConfig', () => {
  it('preserves onboarding completion when a stale autosave snapshot says false', () => {
    expect(
      buildPersistedConfig(
        { ...baseConfig, onboardingCompleted: false },
        { ...baseConfig, onboardingCompleted: true },
      ),
    ).toMatchObject({ onboardingCompleted: true });
  });

  it('preserves a current privacy decision when settings autosaves a stale pre-consent snapshot', () => {
    expect(
      buildPersistedConfig(
        {
          ...baseConfig,
          apiProtocol: 'google',
          privacyDecisionAt: null,
          telemetry: { metrics: true, content: true, artifactManifest: false },
        },
        {
          ...baseConfig,
          installationId: 'inst-current',
          privacyDecisionAt: 12345,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      ),
    ).toMatchObject({
      apiProtocol: 'google',
      installationId: 'inst-current',
      privacyDecisionAt: 12345,
      telemetry: { metrics: false, content: false, artifactManifest: false },
    });
  });
});

describe('isAutosaveDraftOnlyChange', () => {
  const savedComposio: AppConfig = {
    ...baseConfig,
    composio: { apiKey: '', apiKeyConfigured: true, apiKeyTail: 'beef' },
  };

  it('treats an in-flight Composio API key edit as draft-only', () => {
    const typing: AppConfig = {
      ...savedComposio,
      composio: { ...savedComposio.composio, apiKey: '111' },
    };
    expect(isAutosaveDraftOnlyChange(typing, savedComposio)).toBe(true);
  });

  it('flags a real change (non-draft field) as persist-worthy', () => {
    const flipped: AppConfig = { ...savedComposio, model: 'claude-opus-4-7' };
    expect(isAutosaveDraftOnlyChange(flipped, savedComposio)).toBe(false);
  });

  it('flags apiKeyConfigured / tail flips as persist-worthy', () => {
    const cleared: AppConfig = {
      ...savedComposio,
      composio: { apiKey: '', apiKeyConfigured: false, apiKeyTail: '' },
    };
    expect(isAutosaveDraftOnlyChange(cleared, savedComposio)).toBe(false);
  });

  it('returns true for an identical snapshot (no-op autosave tick)', () => {
    expect(isAutosaveDraftOnlyChange(savedComposio, savedComposio)).toBe(true);
  });
});

describe('resolveSettingsCloseConfig', () => {
  it('marks onboarding complete without discarding the latest persisted draft', () => {
    expect(
      resolveSettingsCloseConfig(
        {
          ...baseConfig,
          onboardingCompleted: false,
          orbit: { enabled: false, time: '09:00', templateSkillId: 'stale-template' },
        },
        {
          ...baseConfig,
          onboardingCompleted: false,
          orbit: { enabled: true, time: '11:30', templateSkillId: 'fresh-template' },
        },
      ),
    ).toMatchObject({
      onboardingCompleted: true,
      orbit: { enabled: true, time: '11:30', templateSkillId: 'fresh-template' },
    });
  });
});

// Regression coverage for the deep-link bootstrap effect's team-share race
// (App.tsx's "Deep-linked route to a project we don't have yet" effect). A
// team member's FIRST open of a project the owner just shared with them
// arrives as a deep link before the daemon has materialized any local sqlite
// row for that project. The effect used to treat a single immediate miss as
// "this project doesn't exist" and navigate the member straight back to Home
// mid-sync — even when the hub-backed `/api/workspace/projects/team` catalog
// already confirmed the project belongs to their team. These tests exercise
// the extracted decision function directly (no React, no timers) so the
// retry/backoff and the found vs. still-materializing vs. not-found
// classification stay pinned without a flaky fake-timer + RTL harness.
describe('resolveDeepLinkedTeamSharedProject', () => {
  const sharedProject: Project = {
    id: 'shared-1',
    name: 'Owner Shared Project',
    skillId: null,
    designSystemId: null,
    createdAt: 1778244000000,
    updatedAt: 1778244000000,
  };
  const noopDelay = async () => {};

  it('resolves as found immediately when the local project already exists', async () => {
    const getProject = vi.fn(async () => sharedProject);
    const pullTeamSharedProjectIfAvailable = vi.fn(async () => ({ isTeamShared: false, pulled: false }));

    const resolution = await resolveDeepLinkedTeamSharedProject('shared-1', {
      getProject,
      pullTeamSharedProjectIfAvailable,
      delay: noopDelay,
    });

    expect(resolution).toEqual({ kind: 'found', project: sharedProject });
    expect(getProject).toHaveBeenCalledTimes(1);
    expect(pullTeamSharedProjectIfAvailable).not.toHaveBeenCalled();
  });

  it('resolves as found once local materialization catches up mid-retry', async () => {
    const getProject = vi
      .fn<(id: string) => Promise<Project | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sharedProject);
    const pullTeamSharedProjectIfAvailable = vi.fn(async () => ({ isTeamShared: true, pulled: true }));

    const resolution = await resolveDeepLinkedTeamSharedProject('shared-1', {
      getProject,
      pullTeamSharedProjectIfAvailable,
      delay: noopDelay,
      retryAttempts: 4,
    });

    expect(resolution).toEqual({ kind: 'found', project: sharedProject });
    // 1st attempt: getProject miss + pull's post-pull re-check miss (2 calls).
    // 2nd attempt: getProject hit (3rd call) — no pull needed once found.
    expect(getProject).toHaveBeenCalledTimes(3);
  });

  // This is the exact regression: the hub confirms the project belongs to the
  // member's team (isTeamShared: true) on every attempt, but local
  // materialization never lands within the bounded retry window (e.g. a slow
  // first-ever content pull, or the daemon's ensureSharedProjectPlaceholder
  // firing through a different code path than this one polls). The member
  // must NOT be told "not found" here — the caller's not-found/navigate-home
  // path must not run for a project the hub says they can see.
  it('resolves as still-materializing (never not-found) when the hub confirms sharing but local sync is still catching up', async () => {
    const getProject = vi.fn(async () => null);
    const pullTeamSharedProjectIfAvailable = vi.fn(async () => ({ isTeamShared: true, pulled: true }));

    const resolution = await resolveDeepLinkedTeamSharedProject('shared-1', {
      getProject,
      pullTeamSharedProjectIfAvailable,
      delay: noopDelay,
      retryAttempts: 3,
    });

    expect(resolution).toEqual({ kind: 'still-materializing' });
    expect(pullTeamSharedProjectIfAvailable).toHaveBeenCalledTimes(3);
  });

  // The safety net: a project genuinely absent from the team catalog (never
  // shared, revoked, or a real typo'd/unauthorized id) must still resolve as
  // not-found so the caller's existing list-based fallback and
  // navigate-home behavior keeps firing exactly as before this fix.
  it('resolves as not-found when the hub never confirms team membership', async () => {
    const getProject = vi.fn(async () => null);
    const pullTeamSharedProjectIfAvailable = vi.fn(async () => ({ isTeamShared: false, pulled: false }));

    const resolution = await resolveDeepLinkedTeamSharedProject('missing-1', {
      getProject,
      pullTeamSharedProjectIfAvailable,
      delay: noopDelay,
      retryAttempts: 3,
    });

    expect(resolution).toEqual({ kind: 'not-found' });
    expect(pullTeamSharedProjectIfAvailable).toHaveBeenCalledTimes(3);
  });

  it('stops retrying once the caller reports cancellation', async () => {
    let calls = 0;
    const getProject = vi.fn(async () => {
      calls += 1;
      return null;
    });
    const pullTeamSharedProjectIfAvailable = vi.fn(async () => ({ isTeamShared: true, pulled: false }));

    const resolution = await resolveDeepLinkedTeamSharedProject('shared-1', {
      getProject,
      pullTeamSharedProjectIfAvailable,
      delay: noopDelay,
      retryAttempts: 10,
      // Cancel right after the very first getProject call, as an unmount mid
      // retry would — the loop must not keep spinning through every attempt.
      isCancelled: () => calls >= 1,
    });

    expect(resolution).toEqual({ kind: 'still-materializing' });
    expect(getProject).toHaveBeenCalledTimes(1);
    expect(pullTeamSharedProjectIfAvailable).not.toHaveBeenCalled();
  });
});

describe('clearAmrLiveModelsFromAgents', () => {
  const agents: AgentInfo[] = [
    {
      id: 'amr',
      name: 'AMR',
      bin: 'vela',
      available: true,
      models: [
        { id: 'locked-model', label: 'locked-model', enabled: false },
      ],
      modelsSource: 'live',
    },
    {
      id: 'claude',
      name: 'Claude',
      bin: 'claude',
      available: true,
      models: [{ id: 'claude-sonnet', label: 'claude-sonnet' }],
      modelsSource: 'live',
    },
  ];

  it('clears the AMR catalog so a workspace switch cannot keep stale locks', () => {
    const next = clearAmrLiveModelsFromAgents(agents);
    expect(next[0]).toMatchObject({
      id: 'amr',
      models: [],
      modelsSource: undefined,
    });
    expect(next[1]).toEqual(agents[1]);
  });

  it('also strips headerless /api/agents fallback AMR models', () => {
    const fallbackAgents: AgentInfo[] = [
      {
        id: 'amr',
        name: 'AMR',
        bin: 'vela',
        available: true,
        models: [{ id: 'preset-model', label: 'preset-model' }],
        modelsSource: 'fallback',
      },
    ];
    const next = clearAmrLiveModelsFromAgents(fallbackAgents);
    expect(next[0]).toMatchObject({
      id: 'amr',
      models: [],
      modelsSource: undefined,
    });
  });

  it('is a no-op when AMR already has no models', () => {
    const empty: AgentInfo[] = [
      {
        id: 'amr',
        name: 'AMR',
        bin: 'vela',
        available: true,
        models: [],
      },
    ];
    expect(clearAmrLiveModelsFromAgents(empty)).toBe(empty);
  });
});

describe('mergeAmrModelsIntoAgents', () => {
  const unscopedAgentModels = [
    { id: 'personal-free-model', label: 'personal-free-model', enabled: true },
    { id: 'team-only-model', label: 'team-only-model', enabled: false },
  ];
  const scopedPresetModels = [
    { id: 'personal-free-model', label: 'personal-free-model', enabled: true },
    { id: 'team-only-model', label: 'team-only-model', enabled: true },
  ];
  const agents: AgentInfo[] = [
    {
      id: 'amr',
      name: 'AMR',
      bin: 'vela',
      available: true,
      // Non-empty models from headerless `/api/agents` discovery (personal shape).
      models: unscopedAgentModels,
      modelsSource: 'fallback',
    },
    {
      id: 'claude',
      name: 'Claude',
      bin: 'claude',
      available: true,
      models: [{ id: 'claude-sonnet', label: 'claude-sonnet' }],
    },
  ];

  it('applies a scoped Path A preset over non-empty unscoped agent models', () => {
    const scopedPreset: AmrModelsResponse = {
      source: 'preset',
      models: scopedPresetModels,
      refreshing: true,
    };
    const next = mergeAmrModelsIntoAgents(agents, scopedPreset);
    expect(next[0]).toMatchObject({
      id: 'amr',
      models: scopedPresetModels,
      modelsSource: 'live',
    });
    expect(next[1]).toEqual(agents[1]);
  });

  it('applies a remote Path A catalog the same way', () => {
    const remote: AmrModelsResponse = {
      source: 'remote',
      models: scopedPresetModels,
      refreshing: false,
    };
    const next = mergeAmrModelsIntoAgents(agents, remote);
    expect(next[0]?.models).toEqual(scopedPresetModels);
    expect(next[0]?.modelsSource).toBe('live');
  });

  it('strips unscoped AMR models when Path A is unresolved or empty', () => {
    // Concurrent fetchAgentsStream callbacks merge with amrModelsRef=null after
    // an identity clear; fail closed so personal free/lock shape cannot stick.
    const clearedNull = mergeAmrModelsIntoAgents(agents, null);
    expect(clearedNull[0]).toMatchObject({
      id: 'amr',
      models: [],
      modelsSource: undefined,
    });
    expect(clearedNull[1]).toEqual(agents[1]);

    const clearedEmpty = mergeAmrModelsIntoAgents(agents, {
      source: 'preset',
      models: [],
      refreshing: true,
    });
    expect(clearedEmpty[0]).toMatchObject({
      id: 'amr',
      models: [],
      modelsSource: undefined,
    });
  });

  it('is the catalog refreshAgents must return so Settings retries stay on Path A', () => {
    // Settings stops its signed-in empty-models retry loop when the returned
    // AMR agent has models. Returning raw headerless `/api/agents` agents
    // (non-empty personal fallback) while state was fail-closed empty made
    // that loop exit early and left the picker loading until an unrelated
    // focus refresh. refreshAgents must return this same merge result.
    const headerlessAgents = agents;
    const returned = mergeAmrModelsIntoAgents(headerlessAgents, null);
    const amr = returned.find((agent) => agent.id === 'amr');
    expect(amr?.models ?? []).toEqual([]);
    // Non-empty fallback would have stopped Settings; empty keeps it retrying.
    expect((amr?.models?.length ?? 0) > 0).toBe(false);
  });
});

describe('resolveAmrModelsCatalogScope', () => {
  const workspaceA: WorkspaceCollabContext = {
    workspaceId: 'ws-a',
    workspaceType: 'team',
    workspaceMemberId: 'member-a',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_pro',
    providerMode: 'platform_credits',
    seatSummary: { seatLimit: 5, usedSeats: 1, availableSeats: 4, isSeatFull: false },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: false,
      canManageSharedResources: false,
    },
  };
  const workspaceB: WorkspaceCollabContext = {
    ...workspaceA,
    workspaceId: 'ws-b',
    workspaceMemberId: 'member-b',
  };

  it('uses the open project workspace on project routes even when ambient rail is B', () => {
    const scope = resolveAmrModelsCatalogScope({
      routeKind: 'project',
      projectId: 'proj-a',
      activeProject: { id: 'proj-a', workspaceId: 'ws-a' },
      activeProjectWorkspaceContext: workspaceA,
      ambientWorkspaceContext: workspaceB,
      identityChangePending: false,
      accountGeneration: 3,
    });
    expect(scope.pending).toBe(false);
    expect(scope.context).toBe(workspaceA);
    expect(scope.identity).toBe(JSON.stringify([
      'workspace-account',
      3,
      workspaceIdentityCacheKey(workspaceA),
    ]));
  });

  it('falls back to ambient workspace context off project routes', () => {
    const scope = resolveAmrModelsCatalogScope({
      routeKind: 'home',
      activeProject: null,
      activeProjectWorkspaceContext: null,
      ambientWorkspaceContext: workspaceB,
      identityChangePending: false,
      accountGeneration: 1,
    });
    expect(scope.pending).toBe(false);
    expect(scope.context).toBe(workspaceB);
  });

  it('marks account transitions pending so retained ambient context is not fetched', () => {
    const scope = resolveAmrModelsCatalogScope({
      routeKind: 'home',
      activeProject: null,
      activeProjectWorkspaceContext: null,
      ambientWorkspaceContext: workspaceA,
      identityChangePending: true,
      accountGeneration: 4,
    });
    expect(scope.pending).toBe(true);
    expect(scope.context).toBe(workspaceA);
    expect(scope.identity).toBe(JSON.stringify([
      'pending-account',
      4,
      null,
      null,
    ]));
  });

  it('stays pending while a project-bound workspace authority is still unresolved', () => {
    const scope = resolveAmrModelsCatalogScope({
      routeKind: 'project',
      projectId: 'proj-a',
      activeProject: { id: 'proj-a', workspaceId: 'ws-a' },
      activeProjectWorkspaceContext: null,
      ambientWorkspaceContext: workspaceB,
      identityChangePending: false,
      accountGeneration: 2,
    });
    expect(scope.pending).toBe(true);
    expect(scope.context).toBeNull();
    expect(scope.identity).toBe(JSON.stringify([
      'pending-project-workspace',
      2,
      'proj-a',
      'ws-a',
    ]));
  });

  it('stays pending when a bound project workspace lookup settles without exact context', () => {
    // forbidden / unavailable leave context null after loading finishes.
    // Catalog must not fall through to a headerless personal fetch.
    const scope = resolveAmrModelsCatalogScope({
      routeKind: 'project',
      projectId: 'proj-a',
      activeProject: { id: 'proj-a', workspaceId: 'ws-a' },
      activeProjectWorkspaceContext: null,
      ambientWorkspaceContext: workspaceB,
      identityChangePending: false,
      accountGeneration: 2,
    });
    expect(scope.pending).toBe(true);
    expect(scope.context).toBeNull();
  });

  it('allows unscoped personal catalog for projects without a pinned workspace', () => {
    const scope = resolveAmrModelsCatalogScope({
      routeKind: 'project',
      projectId: 'proj-personal',
      activeProject: { id: 'proj-personal', workspaceId: null },
      activeProjectWorkspaceContext: null,
      ambientWorkspaceContext: workspaceB,
      identityChangePending: false,
      accountGeneration: 1,
    });
    expect(scope.pending).toBe(false);
    expect(scope.context).toBeNull();
  });
});
