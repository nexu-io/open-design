import { describe, expect, it, vi } from 'vitest';

import {
  buildPersistedConfig,
  isAutosaveDraftOnlyChange,
  hydrateReadyTeamProject,
  mergeAgentModelChoice,
  persistComposioConfigChange,
  projectViewAuthorizationLifetimeKey,
  projectRouteSurfaceState,
  resolveDeepLinkedTeamSharedProject,
  resolveSettingsCloseConfig,
  shouldRouteToFirstRunOnboarding,
  shouldSyncMediaProvidersOnSave,
} from '../src/App';
import type { AppConfig, Project } from '../src/types';
import type {
  WorkspaceCollabContext,
  WorkspaceProjectSummary,
} from '@open-design/contracts';

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
