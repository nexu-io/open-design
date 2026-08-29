import { describe, expect, it, vi } from 'vitest';
import {
  createProactiveContentPull,
  type ProactiveContentPullDeps,
} from '../../src/collab/proactive-content-pull.js';

// Size guardrail for BACKGROUND shared-project content pulls (issue #6518,
// incident #6512): when a teammate publishes an oversized project (e.g. 7442
// files), the hub 'project-content-changed' push and the daemon's catch-up
// sweeps must NOT materialize the whole tree onto every member's disk. The
// module consults an injected `assessBackgroundContentPull` policy right
// before executing the content pull; 'defer' settles the work item without
// downloading, leaving materialization to the foreground open-project lane
// (routes/collab-sync.ts POST /collab/pull), which never consults the policy.
//
// Fail-closed direction is INVERTED for this policy relative to the module's
// other guards: "closed" here means PULL AS BEFORE — skipping is the new
// behavior, so any uncertainty (policy throws, no version) degrades to the
// existing pull rather than leaving a project permanently unmaterialized.

type Deps = ProactiveContentPullDeps;

function makeDeps(overrides: Partial<Deps> = {}): Deps & {
  pullCalls: string[];
} {
  const pullCalls: string[] = [];
  const deps: Deps & { pullCalls: string[] } = {
    pullCalls,
    getLocalBinding: () => ({ workspaceId: 'ws-1', visibility: 'team' }),
    getWorkspaceIdentity: async () => ({
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      workspaceMemberId: 'wm-member',
    }),
    resolveSharedProjectOwner: async () => 'wm-owner',
    pullSharedProject: async (target) => {
      pullCalls.push(target.projectId);
      return { status: 'pulled', version: target.authorizedStageInvocation?.expectedVersion ?? 3 };
    },
    ...overrides,
  };
  return deps;
}

const baseEvent = { projectId: 'proj-1', workspaceId: 'ws-1', version: 3 };

describe('proactive content pull background size policy', () => {
  it('skips the content pull and settles the hub event when the policy defers', async () => {
    const assessBackgroundContentPull = vi.fn(async () => 'defer' as const);
    const onEventSettled = vi.fn();
    const deps = makeDeps({ assessBackgroundContentPull, onEventSettled });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);

    expect(assessBackgroundContentPull).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        resourceTeamId: 'team-1',
        viewerMemberId: 'wm-member',
        ownerMemberId: 'wm-owner',
      }),
      3,
    );
    expect(deps.pullCalls).toEqual([]);
    // Deferral is a terminal decision for the background lane: the event is
    // settled, no retry timer may keep re-driving the oversized download.
    expect(onEventSettled).toHaveBeenCalledTimes(1);
  });

  it('pulls exactly as before when the policy allows', async () => {
    const assessBackgroundContentPull = vi.fn(async () => 'pull' as const);
    const deps = makeDeps({ assessBackgroundContentPull });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('missing-only catch-up sweep defers an oversized head without pulling', async () => {
    const assessBackgroundContentPull = vi.fn(async () => 'defer' as const);
    const deps = makeDeps({
      assessBackgroundContentPull,
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'proj-1');

    expect(assessBackgroundContentPull).toHaveBeenCalled();
    expect(deps.pullCalls).toEqual([]);
  });

  it('full catch-up sweep defers an oversized head without pulling', async () => {
    const assessBackgroundContentPull = vi.fn(async () => 'defer' as const);
    const deps = makeDeps({
      assessBackgroundContentPull,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.catchUpPublishedHeads('ws-1');

    expect(assessBackgroundContentPull).toHaveBeenCalled();
    expect(deps.pullCalls).toEqual([]);
  });

  it('repeated sweeps over a deferred head never execute the content pull', async () => {
    const assessBackgroundContentPull = vi.fn(async () => 'defer' as const);
    const deps = makeDeps({
      assessBackgroundContentPull,
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');
    await pull.materializeMissingProjects('ws-1');
    await pull.catchUpPublishedHeads('ws-1');

    expect(deps.pullCalls).toEqual([]);
  });

  it('fails open to the existing pull when the policy itself throws', async () => {
    const onError = vi.fn();
    const deps = makeDeps({
      onError,
      assessBackgroundContentPull: async () => {
        throw new Error('size probe transport down');
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(onError).toHaveBeenCalled();
  });

  it('does not consult the policy for versionless events and pulls as before', async () => {
    const assessBackgroundContentPull = vi.fn(async () => 'defer' as const);
    const deps = makeDeps({ assessBackgroundContentPull });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({ projectId: 'proj-1', workspaceId: 'ws-1' });

    expect(assessBackgroundContentPull).not.toHaveBeenCalled();
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('deferral does not advance the cursor: a newer allowed version still pulls', async () => {
    const assessBackgroundContentPull = vi.fn(
      async (_target: unknown, version: number) =>
        version >= 4 ? ('pull' as const) : ('defer' as const),
    );
    const deps = makeDeps({ assessBackgroundContentPull });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual([]);

    await pull.handleContentChanged({ ...baseEvent, version: 4 });
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('a foreground materialization settles the deferred version without re-consulting the policy', async () => {
    const assessBackgroundContentPull = vi.fn(async () => 'defer' as const);
    let persisted: string | null = null;
    const deps = makeDeps({
      assessBackgroundContentPull,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      materializedVersion: () => persisted,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual([]);
    expect(assessBackgroundContentPull).toHaveBeenCalledTimes(1);

    // The user opens the project: the foreground lane (POST /collab/pull)
    // materializes version 3 and reports it back exactly the way server.ts
    // wires onLegacyPullMaterialized -> observeMaterialized.
    persisted = '3';
    await pull.observeMaterialized(
      {
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        resourceTeamId: 'team-1',
        viewerMemberId: 'wm-member',
        ownerMemberId: 'wm-owner',
      },
      3,
    );

    await pull.catchUpPublishedHeads('ws-1');
    await pull.handleContentChanged(baseEvent);

    // Cursor satisfaction wins before the policy: no new probe, no pull.
    expect(assessBackgroundContentPull).toHaveBeenCalledTimes(1);
    expect(deps.pullCalls).toEqual([]);
  });
});
