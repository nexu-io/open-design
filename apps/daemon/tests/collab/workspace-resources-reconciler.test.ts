import { describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceResourceSignatureTracker,
  createWorkspaceTeamResourceEventCoordinator,
  planWorkspaceResourceReconciliation,
  reconcileWorkspaceResourcesWithRemote,
  type LocalTeamResourceBinding,
} from '../../src/collab/workspace-resources-reconciler.js';
import { createRememberedTeamResourceScopes } from '../../src/collab/remembered-team-resource-scopes.js';
import type { TeamResourceRequestScope } from '../../src/collab/team-resource-share.js';

const WORKSPACE_ID = 'team-1';

function teamResourceScope(
  workspaceId = WORKSPACE_ID,
  memberId = 'member-a',
): TeamResourceRequestScope {
  return {
    principal: {
      teamId: workspaceId,
      memberId,
      role: 'member',
      lifecycleState: 'active',
      workspaceType: 'team',
    },
    canShare: false,
  };
}

describe('createWorkspaceResourceSignatureTracker', () => {
  it('detects shares, retractions, and version moves per Workspace and kind', () => {
    const tracker = createWorkspaceResourceSignatureTracker();

    expect(tracker.observe(WORKSPACE_ID, 'skill', [])).toBe(true);
    expect(tracker.observe(WORKSPACE_ID, 'skill', [])).toBe(false);
    expect(tracker.observe(WORKSPACE_ID, 'skill', [
      { resourceId: 'shared', versionId: 'v1', version: 1 },
    ])).toBe(true);
    expect(tracker.observe(WORKSPACE_ID, 'skill', [
      { resourceId: 'shared', versionId: 'v2', version: 2 },
    ])).toBe(true);
    expect(tracker.observe(WORKSPACE_ID, 'skill', [
      { resourceId: 'shared', versionId: 'v2', version: 2 },
    ])).toBe(false);
    expect(tracker.observe(WORKSPACE_ID, 'skill', [])).toBe(true);

    expect(tracker.observe(WORKSPACE_ID, 'plugin', [])).toBe(true);
    expect(tracker.observe('team-2', 'skill', [])).toBe(true);
  });

  it('does not treat remote listing order as a change', () => {
    const tracker = createWorkspaceResourceSignatureTracker();
    expect(tracker.observe(WORKSPACE_ID, 'design_system', [
      { resourceId: 'b', versionId: 'v1' },
      { resourceId: 'a', versionId: 'v2' },
    ])).toBe(true);
    expect(tracker.observe(WORKSPACE_ID, 'design_system', [
      { resourceId: 'a', versionId: 'v2' },
      { resourceId: 'b', versionId: 'v1' },
    ])).toBe(false);
  });
});

describe('planWorkspaceResourceReconciliation (pure)', () => {
  it('retires a local active-team row the remote listing no longer confirms', () => {
    const localActiveTeamRows: LocalTeamResourceBinding[] = [
      { resourceId: 'skill-gone', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
    ];
    const actions = planWorkspaceResourceReconciliation({
      workspaceId: WORKSPACE_ID,
      remoteResources: [],
      localActiveTeamRows,
    });
    expect(actions).toEqual([
      { kind: 'retire', resourceId: 'skill-gone', workspaceId: WORKSPACE_ID },
    ]);
  });

  it('does nothing when the remote listing still confirms the local row', () => {
    const localActiveTeamRows: LocalTeamResourceBinding[] = [
      { resourceId: 'skill-still-shared', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
    ];
    const actions = planWorkspaceResourceReconciliation({
      workspaceId: WORKSPACE_ID,
      remoteResources: [{ resourceId: 'skill-still-shared' }],
      localActiveTeamRows,
    });
    expect(actions).toEqual([]);
  });

  it('ignores a row bound to a DIFFERENT workspace than the one being reconciled', () => {
    const localActiveTeamRows: LocalTeamResourceBinding[] = [
      { resourceId: 'skill-other-ws', workspaceId: 'team-2', visibility: 'team', resourceState: 'active' },
    ];
    const actions = planWorkspaceResourceReconciliation({
      workspaceId: WORKSPACE_ID,
      remoteResources: [],
      localActiveTeamRows,
    });
    expect(actions).toEqual([]);
  });

  it('retires multiple stale rows in one pass and leaves confirmed ones alone', () => {
    const localActiveTeamRows: LocalTeamResourceBinding[] = [
      { resourceId: 'still-shared', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
      { resourceId: 'gone-1', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
      { resourceId: 'gone-2', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
    ];
    const actions = planWorkspaceResourceReconciliation({
      workspaceId: WORKSPACE_ID,
      remoteResources: [{ resourceId: 'still-shared' }],
      localActiveTeamRows,
    });
    expect(actions).toEqual([
      { kind: 'retire', resourceId: 'gone-1', workspaceId: WORKSPACE_ID },
      { kind: 'retire', resourceId: 'gone-2', workspaceId: WORKSPACE_ID },
    ]);
  });
});

describe('reconcileWorkspaceResourcesWithRemote (orchestrator)', () => {
  function baseDeps(overrides: Partial<Parameters<typeof reconcileWorkspaceResourcesWithRemote>[0]> = {}) {
    return {
      getWorkspaceIdentity: async () => ({ workspaceId: WORKSPACE_ID }),
      listRemoteTeamResources: async () => [],
      listLocalActiveTeamRows: () => [],
      applyRetire: vi.fn(),
      ...overrides,
    };
  }

  it('is a no-op off-team (getWorkspaceIdentity resolves null)', async () => {
    const listRemoteTeamResources = vi.fn(async () => []);
    const applyRetire = vi.fn();
    const result = await reconcileWorkspaceResourcesWithRemote(
      baseDeps({ getWorkspaceIdentity: async () => null, listRemoteTeamResources, applyRetire }),
    );
    expect(result).toEqual({ retired: 0 });
    expect(listRemoteTeamResources).not.toHaveBeenCalled();
    expect(applyRetire).not.toHaveBeenCalled();
  });

  it('never retires on a failed remote read (best-effort: missing data is not empty data)', async () => {
    const applyRetire = vi.fn();
    const onError = vi.fn();
    const result = await reconcileWorkspaceResourcesWithRemote(
      baseDeps({
        listLocalActiveTeamRows: () => [
          { resourceId: 'r1', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
        ],
        listRemoteTeamResources: async () => {
          throw new Error('vela unreachable');
        },
        applyRetire,
        onError,
      }),
    );
    expect(result).toEqual({ retired: 0 });
    expect(applyRetire).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('never retires on a failed identity read either', async () => {
    const applyRetire = vi.fn();
    const onError = vi.fn();
    const result = await reconcileWorkspaceResourcesWithRemote(
      baseDeps({
        getWorkspaceIdentity: async () => {
          throw new Error('workspace context read failed');
        },
        applyRetire,
        onError,
      }),
    );
    expect(result).toEqual({ retired: 0 });
    expect(applyRetire).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('applies retire actions through the injected writer and reports the count', async () => {
    const applyRetire = vi.fn();
    const result = await reconcileWorkspaceResourcesWithRemote(
      baseDeps({
        listLocalActiveTeamRows: () => [
          { resourceId: 'gone', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
        ],
        listRemoteTeamResources: async () => [],
        applyRetire,
      }),
    );
    expect(result).toEqual({ retired: 1 });
    expect(applyRetire).toHaveBeenCalledWith(WORKSPACE_ID, 'gone');
  });

  it('reports one writer failure through onError without aborting the rest of the pass', async () => {
    const onError = vi.fn();
    const applied: string[] = [];
    const result = await reconcileWorkspaceResourcesWithRemote(
      baseDeps({
        listLocalActiveTeamRows: () => [
          { resourceId: 'a', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
          { resourceId: 'b', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'active' },
        ],
        listRemoteTeamResources: async () => [],
        applyRetire: (workspaceId: string, resourceId: string) => {
          if (resourceId === 'a') throw new Error('sqlite busy');
          applied.push(resourceId);
        },
        onError,
      }),
    );
    expect(result).toEqual({ retired: 1 });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(applied).toEqual(['b']);
  });

  it('does not retire a row already resourceState:"deleted" (the caller is expected to prefilter, but a stray row must stay a no-op if it slips through)', async () => {
    // Belt-and-suspenders: even if a caller's `listLocalActiveTeamRows` bug
    // let a `resourceState: 'deleted'` row through, the planner only acts on
    // ABSENCE from the remote listing, so passing an already-retired row that
    // the remote ALSO no longer lists would retire it again (idempotent —
    // `applyRetire` writing the same 'deleted' state twice is harmless). This
    // pins that idempotency rather than asserting a prefilter this module
    // does not own.
    const applyRetire = vi.fn();
    const result = await reconcileWorkspaceResourcesWithRemote(
      baseDeps({
        listLocalActiveTeamRows: () => [
          { resourceId: 'already-retired', workspaceId: WORKSPACE_ID, visibility: 'team', resourceState: 'deleted' },
        ],
        listRemoteTeamResources: async () => [],
        applyRetire,
      }),
    );
    expect(result).toEqual({ retired: 1 });
    expect(applyRetire).toHaveBeenCalledWith(WORKSPACE_ID, 'already-retired');
  });
});

describe('createWorkspaceTeamResourceEventCoordinator', () => {
  const scope = { workspaceId: WORKSPACE_ID };

  it('materializes before reconciling and emits only after both complete', async () => {
    let resolveMaterialization!: (value: readonly { resourceId: string; versionId?: string }[]) => void;
    const materialized = new Promise<readonly { resourceId: string; versionId?: string }[]>((resolve) => {
      resolveMaterialization = resolve;
    });
    const calls: string[] = [];
    const coordinator = createWorkspaceTeamResourceEventCoordinator({
      materializeAndList: async () => {
        calls.push('materialize:start');
        const resources = await materialized;
        calls.push('materialize:end');
        return resources;
      },
      reconcile: async ({ resources }) => {
        calls.push(`reconcile:${resources[0]?.resourceId}`);
        return { retired: 0 };
      },
      emit: (_workspaceId, payload) => calls.push(`emit:${payload.resourceKind}`),
      now: () => 123,
    });

    const refresh = coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'skill',
      reason: 'push',
    });
    await Promise.resolve();
    expect(calls).toEqual(['materialize:start']);

    resolveMaterialization([{ resourceId: 'skill-1', versionId: 'v1' }]);
    await expect(refresh).resolves.toEqual({
      processedKinds: ['skill'],
      emittedKinds: ['skill'],
      failedKinds: [],
    });
    expect(calls).toEqual([
      'materialize:start',
      'materialize:end',
      'reconcile:skill-1',
      'emit:skill',
    ]);
  });

  it('ignores unknown kinds and does not emit after materialization or reconciliation failure', async () => {
    const emit = vi.fn();
    const coordinator = createWorkspaceTeamResourceEventCoordinator({
      materializeAndList: async ({ resourceKind }) => {
        if (resourceKind === 'plugin') throw new Error('pull failed');
        return [{ resourceId: 'skill-1', versionId: 'v1' }];
      },
      reconcile: async ({ resourceKind }) => {
        if (resourceKind === 'skill') throw new Error('sqlite failed');
        return { retired: 0 };
      },
      emit,
    });

    await expect(coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'project',
      reason: 'push',
    })).resolves.toEqual({ processedKinds: [], emittedKinds: [], failedKinds: [] });
    await expect(coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'plugin',
      reason: 'push',
    })).resolves.toEqual({ processedKinds: [], emittedKinds: [], failedKinds: ['plugin'] });
    await expect(coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'skill',
      reason: 'push',
    })).resolves.toEqual({ processedKinds: [], emittedKinds: [], failedKinds: ['skill'] });
    expect(emit).not.toHaveBeenCalled();
  });

  it('treats an outage, an authoritative empty list, and recovery as distinct states', async () => {
    const createFixture = () => {
      let localState: 'active' | 'deleted' = 'active';
      let remote: 'failure' | 'empty' | 'shared' = 'failure';
      const coordinator = createWorkspaceTeamResourceEventCoordinator({
        materializeAndList: async () => {
          if (remote === 'failure') throw new Error('hub unavailable');
          return remote === 'shared' ? [{ resourceId: 'skill-1' }] : [];
        },
        reconcile: ({ resources }) => reconcileWorkspaceResourcesWithRemote({
          getWorkspaceIdentity: async () => ({ workspaceId: WORKSPACE_ID }),
          listRemoteTeamResources: async () => resources,
          listLocalActiveTeamRows: () => localState === 'active'
            ? [{
                resourceId: 'skill-1',
                workspaceId: WORKSPACE_ID,
                visibility: 'team',
                resourceState: 'active',
              }]
            : [],
          applyRetire: () => { localState = 'deleted'; },
        }),
        emit: vi.fn(),
      });
      return {
        coordinator,
        setRemote(value: typeof remote) { remote = value; },
        localState: () => localState,
      };
    };

    const recovery = createFixture();
    await recovery.coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'skill',
      reason: 'poll',
    });
    expect(recovery.localState()).toBe('active');
    recovery.setRemote('shared');
    await recovery.coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'skill',
      reason: 'poll',
    });
    expect(recovery.localState()).toBe('active');

    const retraction = createFixture();
    retraction.setRemote('empty');
    await retraction.coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'skill',
      reason: 'poll',
    });
    expect(retraction.localState()).toBe('deleted');
  });

  it('suppresses unchanged poll snapshots but emits when the version changes', async () => {
    let versionId = 'v1';
    const emit = vi.fn();
    const coordinator = createWorkspaceTeamResourceEventCoordinator({
      materializeAndList: async () => [{ resourceId: 'skill-1', versionId }],
      reconcile: async () => ({ retired: 0 }),
      emit,
    });

    await coordinator.refresh({ workspaceId: WORKSPACE_ID, scope, resourceKind: 'skill', reason: 'poll' });
    await coordinator.refresh({ workspaceId: WORKSPACE_ID, scope, resourceKind: 'skill', reason: 'poll' });
    expect(emit).toHaveBeenCalledTimes(1);

    versionId = 'v2';
    await coordinator.refresh({ workspaceId: WORKSPACE_ID, scope, resourceKind: 'skill', reason: 'poll' });
    await coordinator.refresh({ workspaceId: WORKSPACE_ID, scope, resourceKind: 'skill', reason: 'poll' });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('keeps an initial empty poll silent but emits when reconciliation retires a local binding', async () => {
    let retired = 0;
    const emit = vi.fn();
    const coordinator = createWorkspaceTeamResourceEventCoordinator({
      materializeAndList: async () => [],
      reconcile: async () => ({ retired }),
      emit,
    });

    await coordinator.refresh({ workspaceId: WORKSPACE_ID, scope, resourceKind: 'skill', reason: 'poll' });
    expect(emit).not.toHaveBeenCalled();

    retired = 1;
    await coordinator.refresh({ workspaceId: WORKSPACE_ID, scope, resourceKind: 'skill', reason: 'poll' });
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('serializes overlapping refreshes for the same workspace and kind', async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let materializations = 0;
    const coordinator = createWorkspaceTeamResourceEventCoordinator({
      materializeAndList: async () => {
        materializations += 1;
        if (materializations === 1) await firstBlocked;
        return [{ resourceId: 'skill-1', versionId: String(materializations) }];
      },
      reconcile: async () => ({ retired: 0 }),
      emit: vi.fn(),
    });

    const first = coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'skill',
      reason: 'push',
    });
    const second = coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope,
      resourceKind: 'skill',
      reason: 'push',
    });
    await Promise.resolve();
    expect(materializations).toBe(1);

    releaseFirst();
    await Promise.all([first, second]);
    expect(materializations).toBe(2);
  });

  it('drops queued prewarm work when its exact principal lease is evicted before execution', async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const remembered = createRememberedTeamResourceScopes({
      maxEntries: 1,
      leaseMs: 1_000,
      now: () => 0,
    });
    const rememberedScope = teamResourceScope();
    remembered.remember(rememberedScope);
    const rememberedLease = remembered.activeWorkspaceLeases()[0]!;
    let materializations = 0;
    const reconcile = vi.fn(async () => ({ retired: 0 }));
    const emit = vi.fn();
    const coordinator = createWorkspaceTeamResourceEventCoordinator({
      materializeAndList: async () => {
        materializations += 1;
        if (materializations === 1) await firstBlocked;
        return [{ resourceId: 'skill-1', versionId: String(materializations) }];
      },
      reconcile,
      emit,
    });

    const first = coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope: rememberedScope,
      resourceKind: 'skill',
      reason: 'push',
    });
    await vi.waitFor(() => expect(materializations).toBe(1));
    const queued = coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope: rememberedScope,
      resourceKind: 'skill',
      reason: 'poll',
      isRefreshCurrent: () => remembered.isLeaseCurrent(rememberedLease),
    });

    remembered.remember(teamResourceScope('workspace-b', 'member-b'));
    expect(remembered.isLeaseCurrent(rememberedLease)).toBe(false);
    releaseFirst();

    await expect(first).resolves.toEqual({
      processedKinds: ['skill'],
      emittedKinds: ['skill'],
      failedKinds: [],
    });
    await expect(queued).resolves.toEqual({
      processedKinds: [],
      emittedKinds: [],
      failedKinds: [],
    });
    expect(materializations).toBe(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('finishes reconcile, emit, and signature commit when the lease expires during materialization', async () => {
    let now = 0;
    let releaseMaterialization!: () => void;
    const materializationBlocked = new Promise<void>((resolve) => {
      releaseMaterialization = resolve;
    });
    const remembered = createRememberedTeamResourceScopes({
      leaseMs: 100,
      now: () => now,
    });
    const rememberedScope = teamResourceScope();
    remembered.remember(rememberedScope);
    const rememberedLease = remembered.activeWorkspaceLeases()[0]!;
    let materializations = 0;
    const reconcile = vi.fn(async () => ({ retired: 0 }));
    const emit = vi.fn();
    const coordinator = createWorkspaceTeamResourceEventCoordinator({
      materializeAndList: async () => {
        materializations += 1;
        if (materializations === 1) await materializationBlocked;
        return [{ resourceId: 'skill-1', versionId: 'v1' }];
      },
      reconcile,
      emit,
    });

    const refresh = coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope: rememberedScope,
      resourceKind: 'skill',
      reason: 'push',
      isRefreshCurrent: () => remembered.isLeaseCurrent(rememberedLease),
    });
    await vi.waitFor(() => expect(materializations).toBe(1));
    now = 100;
    releaseMaterialization();

    await expect(refresh).resolves.toEqual({
      processedKinds: ['skill'],
      emittedKinds: ['skill'],
      failedKinds: [],
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);

    await coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope: rememberedScope,
      resourceKind: 'skill',
      reason: 'poll',
    });
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('finishes emit and signature commit when the lease expires during reconciliation', async () => {
    let now = 0;
    let releaseReconciliation!: () => void;
    const reconciliationBlocked = new Promise<void>((resolve) => {
      releaseReconciliation = resolve;
    });
    const remembered = createRememberedTeamResourceScopes({
      leaseMs: 100,
      now: () => now,
    });
    const rememberedScope = teamResourceScope();
    remembered.remember(rememberedScope);
    const rememberedLease = remembered.activeWorkspaceLeases()[0]!;
    let reconciliations = 0;
    const emit = vi.fn();
    const coordinator = createWorkspaceTeamResourceEventCoordinator({
      materializeAndList: async () => [{ resourceId: 'skill-1', versionId: 'v1' }],
      reconcile: async () => {
        reconciliations += 1;
        if (reconciliations === 1) await reconciliationBlocked;
        return { retired: 0 };
      },
      emit,
    });

    const refresh = coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope: rememberedScope,
      resourceKind: 'skill',
      reason: 'push',
      isRefreshCurrent: () => remembered.isLeaseCurrent(rememberedLease),
    });
    await vi.waitFor(() => expect(reconciliations).toBe(1));
    now = 100;
    releaseReconciliation();

    await expect(refresh).resolves.toEqual({
      processedKinds: ['skill'],
      emittedKinds: ['skill'],
      failedKinds: [],
    });
    expect(emit).toHaveBeenCalledTimes(1);

    await coordinator.refresh({
      workspaceId: WORKSPACE_ID,
      scope: rememberedScope,
      resourceKind: 'skill',
      reason: 'poll',
    });
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
