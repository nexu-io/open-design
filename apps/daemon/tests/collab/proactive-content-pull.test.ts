import { describe, expect, it, vi } from 'vitest';
import {
  activeTeamWorkspaceIdentity,
  createProactiveContentPull,
  isAuthorizedProactivePullInvocation,
  isFreshProactivePullAuthorizationWitness,
  type ProactiveContentPull,
  type ProactiveContentPullDeps,
  type ProactiveContentPullTarget,
} from '../../src/collab/proactive-content-pull.js';

// Hub push-channel consumer for 'project-content-changed' (recvqmKQRiIlYf):
// when a teammate publishes a new version of a shared project, the member's
// daemon pulls the content proactively — no open tab required — instead of
// leaving freshness to the member web's ~5s status polling. These tests pin
// the guard boundary: the pull must NEVER touch a project this daemon owns
// (the owner's local copy is the single writer), may bootstrap a teammate's
// newly-shared project from a workspace-scoped event before a local binding
// exists, must dedupe repeated/racing events, and must degrade silently on
// failure so the web polling fallback stays authoritative.

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
      return { status: 'pulled', version: 3 };
    },
    ...overrides,
  };
  return deps;
}

const baseEvent = { projectId: 'proj-1', workspaceId: 'ws-1', version: 3 };

function makeRetryScheduler() {
  type Task = {
    callback: () => void | Promise<void>;
    delayMs: number;
    handle: { id: number; unref: ReturnType<typeof vi.fn> };
  };
  let nextId = 1;
  const tasks = new Map<number, Task>();
  const delays: number[] = [];
  const cleared: number[] = [];
  const scheduler = {
    setTimeout(callback: () => void | Promise<void>, delayMs: number) {
      const handle = { id: nextId, unref: vi.fn() };
      nextId += 1;
      tasks.set(handle.id, { callback, delayMs, handle });
      delays.push(delayMs);
      return handle;
    },
    clearTimeout(handle: unknown) {
      const id = (handle as { id: number }).id;
      cleared.push(id);
      tasks.delete(id);
    },
  };
  return {
    scheduler,
    delays,
    cleared,
    tasks,
    async runNext() {
      const task = [...tasks.values()].sort((a, b) => a.handle.id - b.handle.id)[0];
      if (!task) throw new Error('expected a scheduled retry');
      tasks.delete(task.handle.id);
      await task.callback();
    },
    async runDelay(delayMs: number) {
      const task = [...tasks.values()]
        .sort((a, b) => a.handle.id - b.handle.id)
        .find((candidate) => candidate.delayMs === delayMs);
      if (!task) throw new Error(`expected a scheduled ${delayMs}ms retry`);
      tasks.delete(task.handle.id);
      await task.callback();
    },
  };
}

describe('proactive content pull (hub project-content-changed consumer)', () => {
  it.each([
    ['billing_past_due'],
    ['locked'],
    ['deleting'],
    ['deleted'],
  ])('rejects %s workspace lifecycle before pull authorization', (lifecycleState) => {
    expect(activeTeamWorkspaceIdentity({
      workspaceId: 'ws-1',
      teamId: 'team-1',
      workspaceMemberId: 'wm-member',
      workspaceType: 'team',
      memberStatus: 'active',
      lifecycleState,
    })).toBeNull();
  });

  it('rejects missing resource-team or member identities before authorization', () => {
    expect(activeTeamWorkspaceIdentity({
      workspaceId: '',
      teamId: '',
      workspaceMemberId: '',
      workspaceType: 'team',
      memberStatus: 'active',
      lifecycleState: 'active',
    })).toBeNull();
  });

  it('pulls a locally-bound team project owned by a teammate', async () => {
    const deps = makeDeps();
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('resolves identity from the event Workspace instead of mutable global selection', async () => {
    const globallySelectedWorkspaceId = 'ws-other';
    const getWorkspaceIdentity = vi.fn(async (workspaceId: string) =>
      workspaceId === 'ws-1'
        ? {
            workspaceId,
            resourceTeamId: 'team-1',
            workspaceMemberId: 'wm-member',
          }
        : null,
    );
    const deps = makeDeps({ getWorkspaceIdentity });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({
      ...baseEvent,
      workspaceId: 'ws-1',
    });

    expect(globallySelectedWorkspaceId).toBe('ws-other');
    expect(getWorkspaceIdentity).toHaveBeenCalledWith('ws-1');
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('issues the pull target a fresh witness bound to the guarded event version', async () => {
    const receivedTargets: ProactiveContentPullTarget[] = [];
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        receivedTargets.push(target);
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);

    const receivedTarget = receivedTargets[0];
    expect(receivedTarget).toBeDefined();
    expect(receivedTarget!.authorizationWitness).toMatchObject({
      kind: 'proactive-content-pull',
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'wm-member',
      ownerMemberId: 'wm-owner',
      version: 3,
    });
    expect(isFreshProactivePullAuthorizationWitness(
      receivedTarget!.authorizationWitness,
      receivedTarget!,
      3,
    )).toBe(true);
  });

  it('does not re-sign a catalog owner hint as a fresh authorization witness', async () => {
    const receivedTargets: ProactiveContentPullTarget[] = [];
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        receivedTargets.push(target);
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'proj-1');

    expect(receivedTargets[0]).toBeDefined();
    expect(receivedTargets[0]!.authorizationWitness).toBeUndefined();
  });

  it('reports queue, invoke, and completion timing for a profiled hub event', async () => {
    const onTiming = vi.fn();
    const deps = makeDeps({ onTiming });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({
      ...baseEvent,
      profileReceivedAtMs: 100,
    });

    expect(onTiming.mock.calls.map(([event]) => event.phase)).toEqual([
      'queued',
      'guard-started',
      'guard-completed',
      'invoke',
      'completed',
    ]);
    expect(onTiming).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'guard-completed',
      projectId: 'proj-1',
      status: 'target',
    }));
    expect(onTiming).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'invoke',
      projectId: 'proj-1',
      version: 3,
      receivedAtMs: 100,
    }));
  });

  it('starts the independent identity and owner guards concurrently', async () => {
    let releaseIdentity!: () => void;
    let identityStarted!: () => void;
    const identityGate = new Promise<void>((resolve) => {
      releaseIdentity = resolve;
    });
    const identityStart = new Promise<void>((resolve) => {
      identityStarted = resolve;
    });
    const resolveSharedProjectOwner = vi.fn(async () => 'wm-owner');
    const deps = makeDeps({
      getWorkspaceIdentity: async () => {
        identityStarted();
        await identityGate;
        return {
          workspaceId: 'ws-1',
          resourceTeamId: 'team-1',
          workspaceMemberId: 'wm-member',
        };
      },
      resolveSharedProjectOwner,
    });
    const pull = createProactiveContentPull(deps);

    const pending = pull.handleContentChanged(baseEvent);
    await identityStart;
    await Promise.resolve();
    const ownerStartedBeforeIdentityFinished =
      resolveSharedProjectOwner.mock.calls.length;
    releaseIdentity();
    await pending;

    expect(ownerStartedBeforeIdentityFinished).toBe(1);
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('skips an event without a projectId', async () => {
    const deps = makeDeps();
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged({ workspaceId: 'ws-1', version: 3 });
    expect(deps.pullCalls).toEqual([]);
  });

  it('pulls a newly-shared teammate project before this daemon has a local binding', async () => {
    const onPulled = vi.fn();
    const deps = makeDeps({ getLocalBinding: () => null, onPulled });
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(onPulled).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'wm-member',
      ownerMemberId: 'wm-owner',
    }), 3);
  });

  it('skips an unbound project when the event carries no workspace scope', async () => {
    const deps = makeDeps({ getLocalBinding: () => null });
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged({ projectId: 'proj-1', version: 3 });
    expect(deps.pullCalls).toEqual([]);
  });

  it('skips an unbound project whose event workspace is not the active team', async () => {
    const deps = makeDeps({ getLocalBinding: () => null });
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged({ ...baseEvent, workspaceId: 'ws-other' });
    expect(deps.pullCalls).toEqual([]);
  });

  it('skips a project whose local binding is personal, not team', async () => {
    const deps = makeDeps({
      getLocalBinding: () => ({ workspaceId: 'ws-1', visibility: 'personal' }),
    });
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual([]);
  });

  it('skips an event whose workspace does not match the local binding', async () => {
    const deps = makeDeps();
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged({ ...baseEvent, workspaceId: 'ws-other' });
    expect(deps.pullCalls).toEqual([]);
  });

  it('skips when the active identity is in a different workspace than the binding', async () => {
    const deps = makeDeps({
      getWorkspaceIdentity: async () => ({
        workspaceId: 'ws-other',
        resourceTeamId: 'team-other',
        workspaceMemberId: 'wm-member',
      }),
    });
    const pull = createProactiveContentPull(deps);
    // Event carries no workspaceId: the binding/identity cross-check alone
    // must still refuse to pull under a foreign-workspace principal.
    await pull.handleContentChanged({ projectId: 'proj-1', version: 3 });
    expect(deps.pullCalls).toEqual([]);
  });

  it('skips when there is no team workspace identity (signed out / personal)', async () => {
    const deps = makeDeps({ getWorkspaceIdentity: async () => null });
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual([]);
  });

  it('fails closed when the owner cannot be resolved', async () => {
    const deps = makeDeps({ resolveSharedProjectOwner: async () => null });
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual([]);
  });

  it('fails closed when the owner lookup throws', async () => {
    const deps = makeDeps({
      resolveSharedProjectOwner: async () => {
        throw new Error('hub unavailable');
      },
    });
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual([]);
  });

  it('never pulls a project this daemon member owns (single-writer protection)', async () => {
    const deps = makeDeps({ resolveSharedProjectOwner: async () => 'wm-member' });
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual([]);
  });

  it('dedupes a repeated event for an already-pulled version, and pulls again for a newer one', async () => {
    const deps = makeDeps();
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({ ...baseEvent, version: 3 });
    expect(deps.pullCalls).toEqual(['proj-1']);

    // Duplicate (and older) events are no-ops once version 3 materialized.
    await pull.handleContentChanged({ ...baseEvent, version: 3 });
    await pull.handleContentChanged({ ...baseEvent, version: 2 });
    expect(deps.pullCalls).toEqual(['proj-1']);

    // A genuinely newer head pulls again.
    deps.pullSharedProject = async (target) => {
      deps.pullCalls.push(target.projectId);
      return { status: 'pulled', version: 4 };
    };
    await pull.handleContentChanged({ ...baseEvent, version: 4 });
    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
  });

  it('keeps the version cursor independent per project', async () => {
    const deps = makeDeps();
    const pull = createProactiveContentPull(deps);
    await pull.handleContentChanged({ ...baseEvent, version: 3 });
    await pull.handleContentChanged({ ...baseEvent, projectId: 'proj-2', version: 3 });
    expect(deps.pullCalls).toEqual(['proj-1', 'proj-2']);
  });

  it('settles only the exact covered intent when another lane durably materializes', async () => {
    const retry = makeRetryScheduler();
    const onPulled = vi.fn();
    const deps = makeDeps({
      scheduler: retry.scheduler,
      onPulled,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        return { status: 'register_failed' };
      },
    });
    const pull = createProactiveContentPull(deps);
    const target: ProactiveContentPullTarget = {
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      resourceTeamId: 'team-1',
      viewerMemberId: 'wm-member',
      ownerMemberId: 'wm-owner',
    };

    await pull.handleContentChanged({ ...baseEvent, version: 5 });
    expect(retry.tasks.size).toBe(1);

    await pull.observeMaterialized(
      { ...target, workspaceId: 'ws-other' },
      5,
    );
    await pull.observeMaterialized(target, 4);
    expect(retry.tasks.size).toBe(1);

    await pull.observeMaterialized(target, 5);
    expect(retry.tasks.size).toBe(0);

    deps.pullSharedProject = async (nextTarget) => {
      deps.pullCalls.push(nextTarget.projectId);
      return { status: 'pulled', version: 6 };
    };
    await pull.handleContentChanged({ ...baseEvent, version: 6 });

    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
    expect(onPulled).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
      }),
      5,
    );
  });

  it('coalesces events that race an in-flight pull for the same head', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        await gate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.handleContentChanged(baseEvent);
    const second = pull.handleContentChanged(baseEvent);
    release();
    await Promise.all([first, second]);

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('serializes v2 behind an in-flight v1 pull, then materializes v2', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let call = 0;
    let active = 0;
    let maxActive = 0;
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        call += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          if (call === 1) {
            await gate;
            return { status: 'pulled', version: 1 };
          }
          return { status: 'pulled', version: 2 };
        } finally {
          active -= 1;
        }
      },
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.handleContentChanged({ ...baseEvent, version: 1 });
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['proj-1']));
    const second = pull.handleContentChanged({ ...baseEvent, version: 2 });
    expect(maxActive).toBe(1);
    release();
    await Promise.all([first, second]);

    // The v2 event waited out the v1 pull, saw the cursor still behind, and
    // pulled once more — exactly one trailing pull, not a loop.
    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
    expect(maxActive).toBe(1);
  });

  it('degrades silently on pull failure and leaves the cursor behind so a retry is allowed', async () => {
    const retry = makeRetryScheduler();
    const onError = vi.fn();
    let fail = true;
    const deps = makeDeps({
      onError,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (fail) throw new Error('vela transport down');
        return { status: 'pulled', version: 3 };
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await expect(pull.handleContentChanged(baseEvent)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);

    // Cursor did not advance on failure: the scheduled same-version retry is
    // still allowed, without a duplicate event resetting its backoff.
    fail = false;
    await retry.runNext();
    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
  });

  it('settles lifecycle observation only when no retry remains', async () => {
    const retry = makeRetryScheduler();
    const onEventSettled = vi.fn();
    let fail = true;
    const deps = makeDeps({
      onEventSettled,
      scheduler: retry.scheduler,
      random: () => 1,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (fail) throw new Error('temporary transport failure');
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    expect(onEventSettled).not.toHaveBeenCalled();

    fail = false;
    await retry.runNext();
    // Retry completion is observed through `onPulled`; the original-event
    // terminal callback is intentionally only for its synchronous decision.
    expect(onEventSettled).not.toHaveBeenCalled();

    await pull.handleContentChanged(baseEvent);
    expect(onEventSettled).toHaveBeenCalledWith(baseEvent);
  });

  it('lets a v2 catch-up retry after a failed v1 pull without advancing the cursor', async () => {
    const onError = vi.fn();
    let attempt = 0;
    const deps = makeDeps({
      onError,
      getLocalBinding: () => null,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        attempt += 1;
        if (attempt === 1) throw new Error('v1 transport failed');
        return { status: 'pulled', version: 2 };
      },
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 2,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({ ...baseEvent, version: 1 });
    await pull.catchUpPublishedHeads('ws-1');
    await pull.handleContentChanged({ ...baseEvent, version: 2 });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
  });

  it('does not advance the cursor on a revoked outcome', async () => {
    const onPulled = vi.fn();
    let revoked = true;
    const deps = makeDeps({
      onPulled,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        return revoked ? { status: 'revoked' } : { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    // A later re-share of the same head must be able to pull again.
    revoked = false;
    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
    expect(onPulled).toHaveBeenCalledTimes(1);
  });

  it('does not emit ready or advance the cursor when durable registration fails', async () => {
    const onPulled = vi.fn();
    const retry = makeRetryScheduler();
    let registerFailed = true;
    const deps = makeDeps({
      onPulled,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        return registerFailed
          ? { status: 'register_failed' }
          : { status: 'pulled', version: 3 };
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    expect(onPulled).not.toHaveBeenCalled();
    expect(retry.tasks.size).toBe(1);

    registerFailed = false;
    await retry.runNext();
    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
    expect(onPulled).toHaveBeenCalledTimes(1);
    expect(retry.tasks.size).toBe(0);
  });

  it('never rejects, even when an identity read throws', async () => {
    const onError = vi.fn();
    const deps = makeDeps({
      onError,
      getWorkspaceIdentity: async () => {
        throw new Error('context provider crashed');
      },
    });
    const pull = createProactiveContentPull(deps);
    await expect(pull.handleContentChanged(baseEvent)).resolves.toBeUndefined();
    expect(deps.pullCalls).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('catches up a published head that already existed before the first hub connection', async () => {
    const deps = makeDeps({ getLocalBinding: () => null });
    const listSharedProjects = vi.fn(async () => [
      { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
    ]);
    const publishedHead = vi.fn(async () => 3);
    Object.assign(deps, { listSharedProjects, publishedHead });
    const pull = createProactiveContentPull(deps);

    await pull.catchUpPublishedHeads('ws-1');

    expect(listSharedProjects).toHaveBeenCalledTimes(1);
    expect(publishedHead).toHaveBeenCalledTimes(1);
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('dedupes an unchanged reconnect sweep, then pulls once when the missed head advanced', async () => {
    let head = 3;
    const deps = makeDeps();
    const listSharedProjects = vi.fn(async () => [
      { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
    ]);
    const publishedHead = vi.fn(async () => head);
    Object.assign(deps, { listSharedProjects, publishedHead });
    const pull = createProactiveContentPull(deps);

    await pull.catchUpPublishedHeads('ws-1');
    await pull.catchUpPublishedHeads('ws-1');
    expect(deps.pullCalls).toEqual(['proj-1']);

    // The v4 signal was missed while disconnected. The reconnect sweep sees
    // the authoritative head and routes it through the same version cursor.
    head = 4;
    deps.pullSharedProject = async (target) => {
      deps.pullCalls.push(target.projectId);
      return { status: 'pulled', version: 4 };
    };
    await pull.catchUpPublishedHeads('ws-1');

    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
    expect(listSharedProjects).toHaveBeenCalledTimes(3);
  });

  it('materializes a placeholder row whose project content is still missing when the healthy-stream floor observes it', async () => {
    let materialized = false;
    const deps = makeDeps({
      getLocalBinding: () => null,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        materialized = true;
        return { status: 'pulled', version: 3 };
      },
    });
    const listSharedProjects = vi.fn(async () => [
      { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
    ]);
    const publishedHead = vi.fn(async () => 3);
    Object.assign(deps, {
      listSharedProjects,
      publishedHead,
      // getLocalBinding above proves the placeholder DB row/team binding
      // exists; the materialization probe must look through that shell.
      hasMaterializedProject: () => materialized,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');
    await pull.materializeMissingProjects('ws-1');

    expect(listSharedProjects).toHaveBeenCalledTimes(2);
    expect(publishedHead).toHaveBeenCalledTimes(1);
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('does not read a head for a project owned by this daemon member', async () => {
    const deps = makeDeps();
    const publishedHead = vi.fn(async () => 3);
    Object.assign(deps, {
      listSharedProjects: async () => [
        { projectId: 'mine', ownerMemberId: 'wm-member' },
      ],
      publishedHead,
    });
    const pull = createProactiveContentPull(deps);

    await pull.catchUpPublishedHeads('ws-1');

    expect(publishedHead).not.toHaveBeenCalled();
    expect(deps.pullCalls).toEqual([]);
  });

  it('retries a catch-up after the active team identity was temporarily unavailable', async () => {
    let identityAvailable = false;
    const deps = makeDeps({
      getWorkspaceIdentity: async () => identityAvailable
        ? {
            workspaceId: 'ws-1',
            resourceTeamId: 'team-1',
            workspaceMemberId: 'wm-member',
          }
        : null,
    });
    const listSharedProjects = vi.fn(async () => [
      { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
    ]);
    Object.assign(deps, {
      listSharedProjects,
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.catchUpPublishedHeads('ws-1');
    identityAvailable = true;
    await pull.catchUpPublishedHeads('ws-1');

    expect(listSharedProjects).toHaveBeenCalledTimes(1);
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('isolates one published-head failure and continues the sequential sweep', async () => {
    const onError = vi.fn();
    let active = 0;
    let maxActive = 0;
    const deps = makeDeps({ onError });
    Object.assign(deps, {
      listSharedProjects: async () => [
        { projectId: 'broken', ownerMemberId: 'wm-owner' },
        { projectId: 'healthy', ownerMemberId: 'wm-owner' },
        { projectId: 'healthy-2', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async (target: { projectId: string }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        if (target.projectId === 'broken') throw new Error('head unavailable');
        return 3;
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.catchUpPublishedHeads('ws-1');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(maxActive).toBe(1);
    expect(deps.pullCalls).toEqual(['healthy', 'healthy-2']);
  });

  it('coalesces a live event with the same catch-up head onto one pull', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        await gate;
        return { status: 'pulled', version: 3 };
      },
    });
    Object.assign(deps, {
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    const catchUp = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['proj-1']));
    const liveEvent = pull.handleContentChanged(baseEvent);
    release();
    await Promise.all([catchUp, liveEvent]);

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('lets a missing-project sweep overtake a full sweep blocked on historical work', async () => {
    let releaseHistoricalHead!: () => void;
    const historicalHeadGate = new Promise<void>((resolve) => {
      releaseHistoricalHead = resolve;
    });
    let catalogReads = 0;
    let signalNewProjectPulled!: () => void;
    const newProjectPulled = new Promise<void>((resolve) => {
      signalNewProjectPulled = resolve;
    });
    const publishedHead = vi.fn(async (target: { projectId: string }) => {
      if (target.projectId === 'historical') await historicalHeadGate;
      return 3;
    });
    const deps = makeDeps({
      getLocalBinding: () => null,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'new-project') signalNewProjectPulled();
        return { status: 'pulled', version: 3 };
      },
      listSharedProjects: async () => {
        catalogReads += 1;
        return catalogReads === 1
          ? [{ projectId: 'historical', ownerMemberId: 'wm-owner' }]
          : [{ projectId: 'new-project', ownerMemberId: 'wm-owner' }];
      },
      hasMaterializedProject: (projectId) => projectId !== 'new-project',
      publishedHead,
    });
    const pull = createProactiveContentPull(deps);

    const full = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => {
      expect(publishedHead).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'historical' }),
      );
    });
    const missing = pull.materializeMissingProjects('ws-1');

    try {
      await newProjectPulled;
      expect(deps.pullCalls).toContain('new-project');
      expect(deps.pullCalls).not.toContain('historical');
    } finally {
      releaseHistoricalHead();
      await Promise.all([full, missing]);
    }
  });

  it('reuses a full-sweep pull when missing-only races the same project', async () => {
    let releasePull!: () => void;
    const pullGate = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    let materialized = false;
    let materializationProbes = 0;
    const deps = makeDeps({
      getLocalBinding: () => null,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        await pullGate;
        materialized = true;
        return { status: 'pulled', version: 3 };
      },
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => {
        materializationProbes += 1;
        return materialized;
      },
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    const full = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['proj-1']));
    const missing = pull.materializeMissingProjects('ws-1');
    await vi.waitFor(() => expect(materializationProbes).toBeGreaterThan(0));
    releasePull();
    await Promise.all([full, missing]);

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('does not duplicate a full-sweep pull when the missing probe returns a stale false', async () => {
    let releaseFullPull!: () => void;
    const fullPullGate = new Promise<void>((resolve) => {
      releaseFullPull = resolve;
    });
    let releaseStaleProbe!: () => void;
    const staleProbeGate = new Promise<void>((resolve) => {
      releaseStaleProbe = resolve;
    });
    let signalStaleProbeStarted!: () => void;
    const staleProbeStarted = new Promise<void>((resolve) => {
      signalStaleProbeStarted = resolve;
    });
    let probeCalls = 0;
    const deps = makeDeps({
      getLocalBinding: () => null,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (deps.pullCalls.length === 1) await fullPullGate;
        return { status: 'pulled', version: 3 };
      },
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: async () => {
        probeCalls += 1;
        if (probeCalls === 1) return false;
        const staleResult = false;
        signalStaleProbeStarted();
        await staleProbeGate;
        return staleResult;
      },
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    const full = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['proj-1']));
    const missing = pull.materializeMissingProjects('ws-1');
    await staleProbeStarted;

    releaseFullPull();
    await full;
    releaseStaleProbe();
    await missing;

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('coalesces repeated missing-only triggers into one trailing sweep', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let catalogReads = 0;
    const deps = makeDeps({
      listSharedProjects: async () => {
        catalogReads += 1;
        if (catalogReads === 1) await firstGate;
        return [];
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => null,
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.materializeMissingProjects('ws-1');
    await vi.waitFor(() => expect(catalogReads).toBe(1));
    const second = pull.materializeMissingProjects('ws-1');
    const third = pull.materializeMissingProjects('ws-1');
    releaseFirst();
    await Promise.all([first, second, third]);

    expect(catalogReads).toBe(2);
  });

  it('retries a missing-only sweep when the first catalog read is temporarily unavailable', async () => {
    const retry = makeRetryScheduler();
    let catalogReads = 0;
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => {
        catalogReads += 1;
        if (catalogReads === 1) {
          throw new Error('catalog has not propagated yet');
        }
        return [{ projectId: 'proj-1', ownerMemberId: 'wm-owner' }];
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');

    expect(catalogReads).toBe(1);
    expect(deps.pullCalls).toEqual([]);
    expect(retry.delays).toEqual([1_000]);
    expect(retry.tasks.size).toBe(1);

    await retry.runNext();

    expect(catalogReads).toBe(2);
    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('retries a missing-only sweep until its newly-shared project reaches the catalog', async () => {
    const retry = makeRetryScheduler();
    let catalogReads = 0;
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => {
        catalogReads += 1;
        return catalogReads === 1
          ? []
          : [{ projectId: 'proj-1', ownerMemberId: 'wm-owner' }];
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'proj-1');

    expect(deps.pullCalls).toEqual([]);
    expect(retry.delays).toEqual([1_000]);

    await retry.runNext();

    expect(catalogReads).toBe(2);
    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('does not scan unrelated projects while a targeted first share is absent', async () => {
    const retry = makeRetryScheduler();
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'visible-project', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'still-propagating');

    expect(deps.pullCalls).toEqual([]);
    expect(retry.delays).toEqual([1_000]);
    expect(retry.tasks.size).toBe(1);
  });

  it('limits targeted recovery to the requested first share', async () => {
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'unrelated-history', ownerMemberId: 'wm-owner' },
        { projectId: 'fresh-share', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'fresh-share');

    expect(deps.pullCalls).toEqual(['fresh-share']);
  });

  it('starts a first-share event recovery while broad missing-only is blocked', async () => {
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'unrelated-history', ownerMemberId: 'wm-owner' },
        { projectId: 'fresh-share', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
      resolveSharedProjectOwner: async () => null,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'unrelated-history') await historyGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.materializeMissingProjects('ws-1');
    await vi.waitFor(() =>
      expect(deps.pullCalls).toEqual(['unrelated-history']),
    );
    const targeted = pull.handleContentChanged({
      projectId: 'fresh-share',
      workspaceId: 'ws-1',
      version: 3,
    });

    await vi.waitFor(() =>
      expect(deps.pullCalls).toContain('fresh-share'),
    );
    releaseHistory();
    await Promise.all([broad, targeted]);
  });

  it('runs a normal owner-resolved event ahead of a pending full rerun', async () => {
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    const deps = makeDeps({
      getLocalBinding: () => ({
        workspaceId: 'ws-1',
        visibility: 'team',
      }),
      listSharedProjects: async () => [
        { projectId: 'unrelated-history', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'unrelated-history') await historyGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const full = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() =>
      expect(deps.pullCalls).toEqual(['unrelated-history']),
    );
    const pendingFull = pull.catchUpPublishedHeads('ws-1');
    const event = pull.handleContentChanged({
      projectId: 'fresh-event',
      workspaceId: 'ws-1',
      version: 3,
    });

    await vi.waitFor(() =>
      expect(deps.pullCalls).toContain('fresh-event'),
    );
    releaseHistory();
    await Promise.all([full, pendingFull, event]);
  });

  it('stops a broad sweep before its next project when a different live event arrives, then resumes after a quiet delay', async () => {
    const retry = makeRetryScheduler();
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    const deps = makeDeps({
      scheduler: retry.scheduler,
      listSharedProjects: async () => [
        { projectId: 'history-a', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'history-a') await historyGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['history-a']));
    const event = pull.handleContentChanged({
      projectId: 'live-project',
      workspaceId: 'ws-1',
      version: 3,
    });
    await vi.waitFor(() =>
      expect(deps.pullCalls).toContain('live-project'),
    );

    releaseHistory();
    await Promise.all([broad, event]);

    expect(deps.pullCalls).toEqual(['history-a', 'live-project']);
    expect(retry.tasks.size).toBe(1);

    await retry.runNext();

    expect(deps.pullCalls).toEqual([
      'history-a',
      'live-project',
      'history-b',
    ]);
  });

  it('budgets broad remote heads and rotates fairly without scheduling retries', async () => {
    const retry = makeRetryScheduler();
    const projects = Array.from({ length: 80 }, (_, index) => ({
      projectId: `history-${String(index).padStart(2, '0')}`,
      ownerMemberId: 'wm-owner',
    }));
    const headCalls: string[] = [];
    const onCatchUp = vi.fn();
    const deps = makeDeps({
      scheduler: retry.scheduler,
      onCatchUp,
      listSharedProjects: async () => projects,
      hasMaterializedProject: () => false,
      publishedHead: async (target) => {
        headCalls.push(target.projectId);
        return null;
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');
    expect(headCalls).toEqual([
      'history-00',
      'history-01',
      'history-02',
      'history-03',
    ]);
    expect(onCatchUp).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'completed',
      lane: 'broad',
      headChecks: 4,
      heads: 0,
      complete: false,
    }));
    expect(retry.tasks.size).toBe(0);

    await pull.materializeMissingProjects('ws-1');
    expect(headCalls.slice(4)).toEqual([
      'history-04',
      'history-05',
      'history-06',
      'history-07',
    ]);
    expect(new Set(headCalls).size).toBe(8);
    expect(retry.tasks.size).toBe(0);

    // Project-specific first-share recovery bypasses the broad round budget.
    await pull.materializeMissingProjects('ws-1', 'history-79');
    expect(headCalls.at(-1)).toBe('history-79');

    // The stable safety floor eventually visits every broad candidate instead
    // of repeatedly spending its budget on the first catalog page.
    for (let round = 2; round < 20; round += 1) {
      await pull.materializeMissingProjects('ws-1');
    }
    expect(new Set(headCalls).size).toBe(80);
    expect(retry.tasks.size).toBe(0);
  });

  it('isolates broad rotation cursors by workspace and recovery mode', async () => {
    const projects = Array.from({ length: 8 }, (_, index) => ({
      projectId: `history-${index}`,
      ownerMemberId: 'wm-owner',
    }));
    let activeWorkspaceId = 'ws-1';
    const headCalls: string[] = [];
    const deps = makeDeps({
      getWorkspaceIdentity: async () => ({
        workspaceId: activeWorkspaceId,
        resourceTeamId: `team-${activeWorkspaceId}`,
        workspaceMemberId: 'wm-member',
      }),
      getLocalBinding: () => ({
        workspaceId: activeWorkspaceId,
        visibility: 'team',
      }),
      listSharedProjects: async () => projects,
      hasMaterializedProject: () => false,
      publishedHead: async (target) => {
        headCalls.push(`${target.workspaceId}:${target.projectId}`);
        return null;
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');
    expect(headCalls).toEqual([
      'ws-1:history-0',
      'ws-1:history-1',
      'ws-1:history-2',
      'ws-1:history-3',
    ]);

    // Full reconnect owns an independent position from the missing-only floor.
    await pull.catchUpPublishedHeads('ws-1');
    expect(headCalls.slice(4)).toEqual([
      'ws-1:history-0',
      'ws-1:history-1',
      'ws-1:history-2',
      'ws-1:history-3',
    ]);

    activeWorkspaceId = 'ws-2';
    await pull.materializeMissingProjects('ws-2');
    expect(headCalls.slice(8)).toEqual([
      'ws-2:history-0',
      'ws-2:history-1',
      'ws-2:history-2',
      'ws-2:history-3',
    ]);

    activeWorkspaceId = 'ws-1';
    await pull.materializeMissingProjects('ws-1');
    expect(headCalls.slice(12)).toEqual([
      'ws-1:history-4',
      'ws-1:history-5',
      'ws-1:history-6',
      'ws-1:history-7',
    ]);
  });

  it('continues broad rotation when the catalog changes and a candidate materializes', async () => {
    let projects = Array.from({ length: 9 }, (_, index) => ({
      projectId: `history-${index}`,
      ownerMemberId: 'wm-owner',
    }));
    const materialized = new Set<string>();
    const headCalls: string[] = [];
    const deps = makeDeps({
      listSharedProjects: async () => projects,
      hasMaterializedProject: (projectId) => materialized.has(projectId),
      publishedHead: async (target) => {
        headCalls.push(target.projectId);
        return null;
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');
    expect(headCalls).toEqual([
      'history-0',
      'history-1',
      'history-2',
      'history-3',
    ]);

    projects = projects.filter((candidate) => candidate.projectId !== 'history-3');
    materialized.add('history-4');
    await pull.materializeMissingProjects('ws-1');

    expect(headCalls.slice(4)).toEqual([
      'history-5',
      'history-6',
      'history-7',
      'history-8',
    ]);
  });

  it('yields broad recovery after the current remote head when foreground work arrives', async () => {
    const retry = makeRetryScheduler();
    let releaseHead!: () => void;
    let headStarted!: () => void;
    const headGate = new Promise<void>((resolve) => {
      releaseHead = resolve;
    });
    const headStart = new Promise<void>((resolve) => {
      headStarted = resolve;
    });
    const headCalls: string[] = [];
    const deps = makeDeps({
      scheduler: retry.scheduler,
      listSharedProjects: async () => [
        { projectId: 'history-a', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async (target) => {
        headCalls.push(target.projectId);
        if (target.projectId === 'history-a') {
          headStarted();
          await headGate;
        }
        return 3;
      },
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await headStart;
    const event = pull.handleContentChanged({
      projectId: 'live-project',
      workspaceId: 'ws-1',
      version: 3,
    });
    await vi.waitFor(() =>
      expect(deps.pullCalls).toContain('live-project'),
    );
    releaseHead();
    await Promise.all([broad, event]);

    expect(headCalls).toEqual(['history-a']);
    expect(deps.pullCalls).toEqual(['live-project']);
    pull.dispose();
  });

  it('does not turn broad missing-project failures into permanent per-project retry timers', async () => {
    const retry = makeRetryScheduler();
    const projects = Array.from({ length: 8 }, (_, index) => ({
      projectId: `history-${index}`,
      ownerMemberId: 'wm-owner',
    }));
    const publishedVersions = new Map(
      projects.map((project) => [project.projectId, 3]),
    );
    const recoverable = new Set<string>();
    const materialized = new Set<string>();
    const headCalls: string[] = [];
    const onCatchUp = vi.fn();
    let clock = 0;
    const deps = makeDeps({
      scheduler: retry.scheduler,
      now: () => clock,
      onCatchUp,
      listSharedProjects: async () => projects,
      hasMaterializedProject: (projectId) => materialized.has(projectId),
      publishedHead: async (target) => {
        headCalls.push(target.projectId);
        return publishedVersions.get(target.projectId) ?? null;
      },
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (!recoverable.has(target.projectId)) {
          return { status: 'register_failed' };
        }
        materialized.add(target.projectId);
        return {
          status: 'pulled',
          version: publishedVersions.get(target.projectId) ?? null,
        };
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');

    expect(deps.pullCalls).toHaveLength(4);
    expect(headCalls).toHaveLength(4);
    expect(retry.tasks.size).toBe(0);

    // The next heartbeat rotates to the second bounded batch.
    await pull.materializeMissingProjects('ws-1');
    expect(deps.pullCalls).toHaveLength(8);
    expect(headCalls).toHaveLength(8);
    expect(retry.tasks.size).toBe(0);

    // Once the exact scopes cool down, the low-frequency safety floor neither
    // reads their heads nor allocates one retry timer per unavailable project.
    await pull.materializeMissingProjects('ws-1');
    expect(deps.pullCalls).toHaveLength(8);
    expect(headCalls).toHaveLength(8);
    expect(onCatchUp).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'completed',
      headChecks: 0,
      heads: 0,
      suppressed: 8,
      complete: false,
    }));

    // A targeted/live event bypasses the floor cooldown for the same head.
    recoverable.add('history-0');
    await pull.handleContentChanged({
      projectId: 'history-0',
      workspaceId: 'ws-1',
      version: 3,
    });
    expect(deps.pullCalls).toHaveLength(9);
    expect(deps.pullCalls.at(-1)).toBe('history-0');
    expect(retry.tasks.size).toBe(0);

    // A newer head discovered only by the low-frequency floor may wait for
    // the bounded cooldown; unlike targeted/live work it does not spawn an
    // extra head CLI during the cooldown window.
    recoverable.add('history-1');
    publishedVersions.set('history-1', 4);
    await pull.materializeMissingProjects('ws-1');
    expect(deps.pullCalls).toHaveLength(9);
    expect(headCalls).toHaveLength(8);
    expect(retry.tasks.size).toBe(0);

    // The next low-frequency floor retries the remaining transient failures
    // after cooldown, still without allocating one timer per project.
    clock = 15_001;
    await pull.materializeMissingProjects('ws-1');
    expect(deps.pullCalls).toHaveLength(13);
    expect(headCalls).toHaveLength(12);
    expect(deps.pullCalls).toContain('history-1');
    expect(retry.tasks.size).toBe(0);
  });

  it('stops a broad sweep before its next project when the live event coalesces with its current project', async () => {
    const retry = makeRetryScheduler();
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    const deps = makeDeps({
      scheduler: retry.scheduler,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'proj-1') await historyGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['proj-1']));
    const event = pull.handleContentChanged(baseEvent);
    releaseHistory();
    await Promise.all([broad, event]);

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.tasks.size).toBe(1);

    await retry.runNext();

    expect(deps.pullCalls).toEqual(['proj-1', 'history-b']);
  });

  it('keeps a targeted first-share recovery runnable while a live event suppresses broad work', async () => {
    const retry = makeRetryScheduler();
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    let releaseEvent!: () => void;
    const eventGate = new Promise<void>((resolve) => {
      releaseEvent = resolve;
    });
    const deps = makeDeps({
      scheduler: retry.scheduler,
      getLocalBinding: (projectId) =>
        projectId === 'fresh-share'
          ? null
          : { workspaceId: 'ws-1', visibility: 'team' },
      listSharedProjects: async () => [
        { projectId: 'history-a', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
        { projectId: 'fresh-share', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'history-a') await historyGate;
        if (target.projectId === 'live-project') await eventGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['history-a']));
    const event = pull.handleContentChanged({
      projectId: 'live-project',
      workspaceId: 'ws-1',
      version: 3,
    });
    await vi.waitFor(() =>
      expect(deps.pullCalls).toContain('live-project'),
    );
    releaseHistory();
    await broad;

    const targeted = pull.materializeMissingProjects('ws-1', 'fresh-share');
    await vi.waitFor(() =>
      expect(deps.pullCalls).toContain('fresh-share'),
    );

    releaseEvent();
    await Promise.all([event, targeted]);
  });

  it('extends one broad-resume delay across overlapping live events and clears it on dispose', async () => {
    const retry = makeRetryScheduler();
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    let releaseFirstEvent!: () => void;
    const firstEventGate = new Promise<void>((resolve) => {
      releaseFirstEvent = resolve;
    });
    let releaseSecondEvent!: () => void;
    const secondEventGate = new Promise<void>((resolve) => {
      releaseSecondEvent = resolve;
    });
    const deps = makeDeps({
      scheduler: retry.scheduler,
      listSharedProjects: async () => [
        { projectId: 'history-a', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'history-a') await historyGate;
        if (target.projectId === 'live-a') await firstEventGate;
        if (target.projectId === 'live-b') await secondEventGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['history-a']));
    const firstEvent = pull.handleContentChanged({
      projectId: 'live-a',
      workspaceId: 'ws-1',
      version: 3,
    });
    const secondEvent = pull.handleContentChanged({
      projectId: 'live-b',
      workspaceId: 'ws-1',
      version: 3,
    });
    await vi.waitFor(() =>
      expect(deps.pullCalls).toEqual([
        'history-a',
        'live-a',
        'live-b',
      ]),
    );

    releaseHistory();
    await broad;
    expect(retry.tasks.size).toBe(0);

    releaseFirstEvent();
    await firstEvent;
    expect(retry.tasks.size).toBe(0);

    releaseSecondEvent();
    await secondEvent;
    expect(retry.tasks.size).toBe(1);

    pull.dispose();
    expect(retry.tasks.size).toBe(0);
    expect(retry.cleared).toHaveLength(1);
  });

  it('restarts the quiet delay for a later live event without starving deferred broad work', async () => {
    const retry = makeRetryScheduler();
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    let releaseLaterEvent!: () => void;
    const laterEventGate = new Promise<void>((resolve) => {
      releaseLaterEvent = resolve;
    });
    const deps = makeDeps({
      scheduler: retry.scheduler,
      listSharedProjects: async () => [
        { projectId: 'history-a', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'history-a') await historyGate;
        if (target.projectId === 'later-live') await laterEventGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['history-a']));
    await pull.handleContentChanged({
      projectId: 'first-live',
      workspaceId: 'ws-1',
      version: 3,
    });
    releaseHistory();
    await broad;
    expect(retry.tasks.size).toBe(1);

    const laterEvent = pull.handleContentChanged({
      projectId: 'later-live',
      workspaceId: 'ws-1',
      version: 3,
    });
    await vi.waitFor(() =>
      expect(deps.pullCalls).toContain('later-live'),
    );
    expect(retry.tasks.size).toBe(0);
    expect(retry.cleared).toHaveLength(1);

    releaseLaterEvent();
    await laterEvent;
    expect(retry.tasks.size).toBe(1);

    await retry.runNext();

    expect(deps.pullCalls).toContain('history-b');
    expect(retry.tasks.size).toBe(0);
  });

  it('keeps broad work deferred while a live event is waiting for its transport retry', async () => {
    const retry = makeRetryScheduler();
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    let liveAttempts = 0;
    const deps = makeDeps({
      scheduler: retry.scheduler,
      random: () => 1,
      listSharedProjects: async () => [
        { projectId: 'history-a', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'history-a') await historyGate;
        if (target.projectId === 'live-project') {
          liveAttempts += 1;
          if (liveAttempts === 1) throw new Error('transient transport failure');
        }
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['history-a']));
    await pull.handleContentChanged({
      projectId: 'live-project',
      workspaceId: 'ws-1',
      version: 3,
    });
    expect(retry.delays).toEqual([1_000]);

    releaseHistory();
    await broad;

    expect(deps.pullCalls).toEqual(['history-a', 'live-project']);
    expect(retry.delays).toEqual([1_000]);
    expect(retry.tasks.size).toBe(1);

    await retry.runNext();

    expect(deps.pullCalls).toEqual([
      'history-a',
      'live-project',
      'live-project',
    ]);
    expect(retry.delays).toEqual([1_000, 250]);
    expect(retry.tasks.size).toBe(1);

    await retry.runNext();

    expect(deps.pullCalls).toEqual([
      'history-a',
      'live-project',
      'live-project',
      'history-b',
    ]);
    expect(retry.tasks.size).toBe(0);
  });

  it('transfers foreground priority when a provisional retry merges into a scoped pull', async () => {
    const retry = makeRetryScheduler();
    let identityAvailable = true;
    let releaseScopedPull!: () => void;
    const scopedPullGate = new Promise<void>((resolve) => {
      releaseScopedPull = resolve;
    });
    const deps = makeDeps({
      scheduler: retry.scheduler,
      random: () => 1,
      getWorkspaceIdentity: async () =>
        identityAvailable
          ? {
              workspaceId: 'ws-1',
              resourceTeamId: 'team-1',
              workspaceMemberId: 'wm-member',
            }
          : null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'proj-1') await scopedPullGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const targeted = pull.materializeMissingProjects('ws-1', 'proj-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['proj-1']));

    identityAvailable = false;
    await pull.handleContentChanged(baseEvent);
    expect(retry.delays).toEqual([1_000]);
    identityAvailable = true;

    const broad = pull.catchUpPublishedHeads('ws-1');
    await broad;
    expect(deps.pullCalls).toEqual(['proj-1']);

    const foregroundRetry = retry.runNext();
    await vi.waitFor(() =>
      expect(deps.pullCalls).toEqual(['proj-1']),
    );
    releaseScopedPull();
    await Promise.all([targeted, foregroundRetry]);

    expect(retry.delays).toEqual([1_000, 250]);
    expect(retry.tasks.size).toBe(1);

    await retry.runNext();

    expect(deps.pullCalls).toEqual(['proj-1', 'history-b']);
    expect(retry.tasks.size).toBe(0);
  });

  it('keeps first-share recovery ahead of broad work through its first catalog retry and pull', async () => {
    const retry = makeRetryScheduler();
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    let releaseFirstShare!: () => void;
    const firstShareGate = new Promise<void>((resolve) => {
      releaseFirstShare = resolve;
    });
    let catalogReads = 0;
    const deps = makeDeps({
      scheduler: retry.scheduler,
      random: () => 1,
      getLocalBinding: () => null,
      resolveSharedProjectOwner: async (projectId) =>
        projectId === 'first-share' ? null : 'wm-owner',
      listSharedProjects: async () => {
        catalogReads += 1;
        if (catalogReads === 1) {
          return [
            { projectId: 'history-a', ownerMemberId: 'wm-owner' },
            { projectId: 'history-b', ownerMemberId: 'wm-owner' },
          ];
        }
        if (catalogReads === 2) return [];
        return [
          { projectId: 'history-a', ownerMemberId: 'wm-owner' },
          { projectId: 'history-b', ownerMemberId: 'wm-owner' },
          { projectId: 'first-share', ownerMemberId: 'wm-owner' },
        ];
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'history-a') await historyGate;
        if (target.projectId === 'first-share') await firstShareGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['history-a']));
    await pull.handleContentChanged({
      projectId: 'first-share',
      workspaceId: 'ws-1',
      version: 3,
    });
    expect(retry.delays).toEqual([1_000]);

    releaseHistory();
    await broad;
    expect(deps.pullCalls).toEqual(['history-a']);
    expect(retry.delays).toEqual([1_000]);

    const firstShareRetry = retry.runDelay(1_000);
    await vi.waitFor(() =>
      expect(deps.pullCalls).toEqual(['history-a', 'first-share']),
    );
    expect(
      [...retry.tasks.values()].map((task) => task.delayMs),
    ).not.toContain(250);

    releaseFirstShare();
    await firstShareRetry;
    expect(retry.delays.at(-1)).toBe(250);

    await retry.runDelay(250);
    expect(deps.pullCalls).toEqual([
      'history-a',
      'first-share',
      'history-b',
    ]);
  });

  it('lets broad work resume after one priority retry while a failing live intent keeps backing off', async () => {
    const retry = makeRetryScheduler();
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    const deps = makeDeps({
      scheduler: retry.scheduler,
      random: () => 1,
      listSharedProjects: async () => [
        { projectId: 'history-a', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'history-a') await historyGate;
        if (target.projectId === 'live-project') {
          throw new Error('persistent transport failure');
        }
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['history-a']));
    await pull.handleContentChanged({
      projectId: 'live-project',
      workspaceId: 'ws-1',
      version: 3,
    });
    releaseHistory();
    await broad;

    expect(retry.delays).toEqual([1_000]);
    await retry.runDelay(1_000);

    // The second transport retry remains scheduled, but its persistent
    // failure may no longer starve unrelated catch-up work.
    expect(retry.delays).toEqual([1_000, 2_000, 250]);
    await retry.runDelay(250);
    expect(deps.pullCalls).toEqual([
      'history-a',
      'live-project',
      'live-project',
      'history-b',
    ]);
    expect(
      [...retry.tasks.values()].map((task) => task.delayMs),
    ).toEqual([2_000]);
  });

  it('refreshes the one-retry priority budget when a new event arrives', async () => {
    const retry = makeRetryScheduler();
    let releaseHistoryA!: () => void;
    const historyAGate = new Promise<void>((resolve) => {
      releaseHistoryA = resolve;
    });
    let releaseHistoryB!: () => void;
    const historyBGate = new Promise<void>((resolve) => {
      releaseHistoryB = resolve;
    });
    const deps = makeDeps({
      scheduler: retry.scheduler,
      random: () => 1,
      listSharedProjects: async () => [
        { projectId: 'history-a', ownerMemberId: 'wm-owner' },
        { projectId: 'history-b', ownerMemberId: 'wm-owner' },
        { projectId: 'history-c', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'history-a') await historyAGate;
        if (target.projectId === 'history-b') await historyBGate;
        if (target.projectId === 'live-project') {
          throw new Error('persistent transport failure');
        }
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const broad = pull.catchUpPublishedHeads('ws-1');
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['history-a']));
    await pull.handleContentChanged({
      projectId: 'live-project',
      workspaceId: 'ws-1',
      version: 3,
    });
    releaseHistoryA();
    await broad;
    await retry.runDelay(1_000);
    const firstResume = retry.runDelay(250);
    await vi.waitFor(() => expect(deps.pullCalls).toContain('history-b'));

    // A repeated event gives the still-pending intent one fresh priority
    // retry, even though the content version did not change.
    await pull.handleContentChanged({
      projectId: 'live-project',
      workspaceId: 'ws-1',
      version: 3,
    });
    releaseHistoryB();
    await firstResume;
    await vi.waitFor(() =>
      expect(deps.pullCalls).not.toContain('history-c'),
    );

    await retry.runDelay(2_000);
    expect(deps.pullCalls).not.toContain('history-c');
    await retry.runDelay(250);
    expect(deps.pullCalls).toContain('history-c');
  });

  it('keeps concurrent first-share catalog retries independent', async () => {
    const retry = makeRetryScheduler();
    let releaseCatalog!: () => void;
    const catalogGate = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    let reads = 0;
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => {
        reads += 1;
        if (reads === 1) await catalogGate;
        return [];
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.materializeMissingProjects('ws-1', 'project-a');
    await vi.waitFor(() => expect(reads).toBe(1));
    const second = pull.materializeMissingProjects('ws-1', 'project-b');
    releaseCatalog();
    await Promise.all([first, second]);

    expect(reads).toBe(1);
    expect(retry.delays).toEqual([1_000, 1_000]);
    expect(retry.tasks.size).toBe(2);
  });

  it('cancels targeted catalog retries from the previous workspace', async () => {
    const retry = makeRetryScheduler();
    let activeWorkspaceId = 'ws-1';
    const deps = makeDeps({
      getLocalBinding: () => null,
      getWorkspaceIdentity: async () => ({
        workspaceId: activeWorkspaceId,
        resourceTeamId: `team-${activeWorkspaceId}`,
        workspaceMemberId: 'wm-member',
      }),
      listSharedProjects: async () => [],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'project-a');
    activeWorkspaceId = 'ws-2';
    await pull.materializeMissingProjects('ws-2', 'project-b');

    expect(retry.cleared).toHaveLength(1);
    expect(retry.tasks.size).toBe(1);
  });

  it('does not let an in-flight old-workspace sweep restore a stale retry', async () => {
    const retry = makeRetryScheduler();
    let activeWorkspaceId = 'ws-1';
    let releaseOldCatalog!: () => void;
    const oldCatalogGate = new Promise<void>((resolve) => {
      releaseOldCatalog = resolve;
    });
    const deps = makeDeps({
      getLocalBinding: () => null,
      getWorkspaceIdentity: async () => ({
        workspaceId: activeWorkspaceId,
        resourceTeamId: `team-${activeWorkspaceId}`,
        workspaceMemberId: 'wm-member',
      }),
      listSharedProjects: async (workspaceId) => {
        if (workspaceId === 'ws-1') await oldCatalogGate;
        return [];
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    const oldSweep = pull.materializeMissingProjects('ws-1', 'project-a');
    await Promise.resolve();
    activeWorkspaceId = 'ws-2';
    const newSweep = pull.materializeMissingProjects('ws-2', 'project-b');
    releaseOldCatalog();
    await Promise.all([oldSweep, newSweep]);

    expect(retry.delays).toEqual([1_000]);
    expect(retry.cleared).toHaveLength(0);
    expect(retry.tasks.size).toBe(1);
  });

  it('does not drop a third sweep requested while the trailing sweep is running', async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let lists = 0;
    const deps = makeDeps();
    Object.assign(deps, {
      listSharedProjects: async () => {
        lists += 1;
        if (lists === 1) await firstGate;
        if (lists === 2) await secondGate;
        return [];
      },
      publishedHead: async () => null,
      hasMaterializedProject: () => false,
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.catchUpPublishedHeads('ws-1');
    const second = pull.materializeMissingProjects('ws-1');
    releaseFirst();
    await vi.waitFor(() => expect(lists).toBe(2));
    const third = pull.catchUpPublishedHeads('ws-1');
    releaseSecond();
    await Promise.all([first, second, third]);

    expect(lists).toBe(3);
  });

  it('seeds the event cursor from the durable materialized version on cold start', async () => {
    const deps = makeDeps();
    const publishedHead = vi.fn(async () => 3);
    Object.assign(deps, {
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      publishedHead,
      materializedVersion: () => '3',
    });
    const pull = createProactiveContentPull(deps);

    await pull.catchUpPublishedHeads('ws-1');
    await pull.handleContentChanged(baseEvent);

    expect(publishedHead).toHaveBeenCalledTimes(1);
    expect(deps.pullCalls).toEqual([]);
  });

  it('does not reuse a durable cursor after the shared project owner changes', async () => {
    const deps = makeDeps();
    Object.assign(deps, {
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-new-owner' },
      ],
      publishedHead: async () => 1,
      // Version 10 belonged to the previous owner's resource scope.
      materializedVersion: (target: { ownerMemberId: string }) =>
        target.ownerMemberId === 'wm-old-owner' ? '10' : null,
    });
    const pull = createProactiveContentPull(deps);

    await pull.catchUpPublishedHeads('ws-1');

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('forces a missing-only pull when the manifest is absent even if the durable cursor equals head', async () => {
    const deps = makeDeps({ getLocalBinding: () => null });
    Object.assign(deps, {
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: async () => false,
      publishedHead: async () => 3,
      materializedVersion: () => '3',
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('does not repeat an authorized remote mirror that has exact receipt and live bytes but no local project manifest', async () => {
    let projectRowExists = false;
    let liveDirectoryExists = false;
    let receipt:
      | {
          workspaceId: string;
          resourceTeamId: string;
          viewerMemberId: string;
          ownerMemberId: string;
          version: number;
        }
      | null = null;
    const materializedVersion = (target: ProactiveContentPullTarget) =>
      receipt &&
      receipt.workspaceId === target.workspaceId &&
      receipt.resourceTeamId === target.resourceTeamId &&
      receipt.viewerMemberId === target.viewerMemberId &&
      receipt.ownerMemberId === target.ownerMemberId
        ? String(receipt.version)
        : null;
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      // Authorized mirrors intentionally contain shared files, not the local
      // `.open-design/project.json`. Presence must use the guarded target's
      // exact receipt plus the promoted live directory instead.
      hasMaterializedProject: (
        _projectId,
        target: ProactiveContentPullTarget,
      ) =>
        Boolean(
          projectRowExists &&
          liveDirectoryExists &&
          materializedVersion(target) != null,
        ),
      materializedVersion,
      publishedHead: async () => 3,
      pullSharedProject: async (target, expectedVersion) => {
        deps.pullCalls.push(target.projectId);
        projectRowExists = true;
        liveDirectoryExists = true;
        receipt = {
          workspaceId: target.workspaceId,
          resourceTeamId: target.resourceTeamId,
          viewerMemberId: target.viewerMemberId,
          ownerMemberId: target.ownerMemberId,
          version: expectedVersion ?? 3,
        };
        return { status: 'pulled', version: expectedVersion ?? 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    await pull.materializeMissingProjects('ws-1', 'proj-1');

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('repairs a missing live directory even when its exact receipt equals head', async () => {
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      materializedVersion: () => '3',
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'proj-1');

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  const mismatchedReceiptCases: Array<[
    string,
    {
      workspaceId: string;
      resourceTeamId: string;
      viewerMemberId: string;
      ownerMemberId: string;
      version: number;
    } | null,
  ]> = [
    ['missing receipt', null],
    [
      'wrong workspace receipt',
      {
        workspaceId: 'ws-other',
        resourceTeamId: 'team-1',
        viewerMemberId: 'wm-member',
        ownerMemberId: 'wm-owner',
        version: 3,
      },
    ],
    [
      'wrong owner receipt',
      {
        workspaceId: 'ws-1',
        resourceTeamId: 'team-1',
        viewerMemberId: 'wm-member',
        ownerMemberId: 'wm-other-owner',
        version: 3,
      },
    ],
    [
      'wrong resource team receipt',
      {
        workspaceId: 'ws-1',
        resourceTeamId: 'team-other',
        viewerMemberId: 'wm-member',
        ownerMemberId: 'wm-owner',
        version: 3,
      },
    ],
    [
      'wrong viewer receipt',
      {
        workspaceId: 'ws-1',
        resourceTeamId: 'team-1',
        viewerMemberId: 'wm-other-viewer',
        ownerMemberId: 'wm-owner',
        version: 3,
      },
    ],
  ];

  it.each(mismatchedReceiptCases)(
    'forces targeted recovery for %s',
    async (_label, receipt) => {
      const materializedVersion = (target: ProactiveContentPullTarget) =>
        receipt &&
        receipt.workspaceId === target.workspaceId &&
        receipt.resourceTeamId === target.resourceTeamId &&
        receipt.viewerMemberId === target.viewerMemberId &&
        receipt.ownerMemberId === target.ownerMemberId
          ? String(receipt.version)
          : null;
      const deps = makeDeps({
        getLocalBinding: () => null,
        listSharedProjects: async () => [
          { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
        ],
        hasMaterializedProject: (
          _projectId,
          target: ProactiveContentPullTarget,
        ) => Boolean(materializedVersion(target) != null),
        materializedVersion,
        publishedHead: async () => 3,
      });
      const pull = createProactiveContentPull(deps);

      await pull.materializeMissingProjects('ws-1', 'proj-1');

      expect(deps.pullCalls).toEqual(['proj-1']);
    },
  );

  it('pulls a targeted mirror whose exact materialized version is below head', async () => {
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => true,
      materializedVersion: () => '2',
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'proj-1');

    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('does not repeat an exact materialized head during a cold full-heal pass', async () => {
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: (
        _projectId,
        _target: ProactiveContentPullTarget,
      ) => true,
      materializedVersion: () => '3',
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.advanceRecoveryFloor('ws-1');

    expect(deps.pullCalls).toEqual([]);
  });

  it('still materializes an initial first share with no project row, live directory, or receipt', async () => {
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => false,
      materializedVersion: () => null,
      publishedHead: async () => 3,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'proj-1');

    expect(deps.pullCalls).toEqual(['proj-1']);
  });
});

describe('proactive content pull retry coordinator', () => {
  it.each(['missing', 'error'] as const)(
    'transfers an identity-%s retry into bounded catalog recovery when owner propagation becomes the blocker',
    async (initialIdentityFailure) => {
      const retry = makeRetryScheduler();
      let identityReads = 0;
      const onCatchUp = vi.fn();
      const deps = makeDeps({
        getLocalBinding: () => null,
        getWorkspaceIdentity: async () => {
          identityReads += 1;
          if (identityReads === 1) {
            if (initialIdentityFailure === 'error') {
              throw new Error('identity unavailable');
            }
            return null;
          }
          return {
            workspaceId: 'ws-1',
            resourceTeamId: 'team-1',
            workspaceMemberId: 'wm-member',
          };
        },
        resolveSharedProjectOwner: async () => null,
        listSharedProjects: async () => [],
        hasMaterializedProject: () => false,
        publishedHead: async () => 3,
        onCatchUp,
      });
      Object.assign(deps, {
        scheduler: retry.scheduler,
        random: () => 1,
      });
      const pull = createProactiveContentPull(deps);

      await pull.handleContentChanged(baseEvent);
      expect(retry.delays).toEqual([1_000]);

      // The generic identity retry now observes owner-missing and transfers to
      // the dedicated project catalog lane instead of retaining both owners.
      await retry.runNext();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await retry.runNext();
      }

      expect(retry.delays).toEqual([
        1_000,
        1_000,
        2_000,
        4_000,
        8_000,
        16_000,
      ]);
      expect(retry.tasks.size).toBe(0);
      expect(onCatchUp).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'retry-exhausted',
        mode: 'missing-only',
        lane: 'targeted',
        projectId: 'proj-1',
        attempt: 5,
      }));
    },
  );

  it('clears a same-version provisional timer when an external event starts catalog recovery', async () => {
    const retry = makeRetryScheduler();
    let identityReads = 0;
    const deps = makeDeps({
      getLocalBinding: () => null,
      getWorkspaceIdentity: async () => {
        identityReads += 1;
        return identityReads === 1
          ? null
          : {
              workspaceId: 'ws-1',
              resourceTeamId: 'team-1',
              workspaceMemberId: 'wm-member',
            };
      },
      resolveSharedProjectOwner: async () => null,
      listSharedProjects: async () => [],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    await pull.handleContentChanged(baseEvent);

    expect(retry.cleared).toEqual([1]);
    expect(retry.delays).toEqual([1_000, 1_000]);
    expect(retry.tasks.size).toBe(1);
  });

  it('retries a first-share content event while the owner catalog row is still propagating', async () => {
    const retry = makeRetryScheduler();
    let ownerReads = 0;
    let catalogReads = 0;
    const deps = makeDeps({
      getLocalBinding: () => null,
      resolveSharedProjectOwner: async () => {
        ownerReads += 1;
        return null;
      },
      listSharedProjects: async () => {
        catalogReads += 1;
        return catalogReads === 1
          ? []
          : [{ projectId: 'proj-1', ownerMemberId: 'wm-owner' }];
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);

    expect(deps.pullCalls).toEqual([]);
    expect(retry.delays).toEqual([1_000]);

    await retry.runNext();

    expect(ownerReads).toBe(1);
    expect(catalogReads).toBe(2);
    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('bounds retries for a first-share event whose catalog owner never appears', async () => {
    const retry = makeRetryScheduler();
    const onCatchUp = vi.fn();
    const deps = makeDeps({
      getLocalBinding: () => null,
      resolveSharedProjectOwner: async () => null,
      listSharedProjects: async () => [],
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
      onCatchUp,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await retry.runNext();
    }

    expect(retry.delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
    expect(retry.tasks.size).toBe(0);
    expect(deps.pullCalls).toEqual([]);
    expect(onCatchUp).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'retry-exhausted',
      mode: 'missing-only',
      lane: 'targeted',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      attempt: 5,
    }));

    await pull.handleContentChanged(baseEvent);

    expect(retry.delays).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      1_000,
    ]);
    expect(retry.tasks.size).toBe(1);
    expect(onCatchUp).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'retry-scheduled',
      mode: 'missing-only',
      lane: 'targeted',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      attempt: 1,
      delayMs: 1_000,
    }));
  });

  it('does not retry authoritative owner absence for an already-bound project', async () => {
    const retry = makeRetryScheduler();
    const deps = makeDeps({
      resolveSharedProjectOwner: async () => null,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);

    expect(retry.delays).toEqual([]);
    expect(retry.tasks.size).toBe(0);
    expect(deps.pullCalls).toEqual([]);
  });

  it.each([
    ['missing identity', 'null'],
    ['throwing identity lookup', 'throw'],
  ] as const)(
    'does not let an in-flight provisional guard with %s erase a freshly guarded same-version event',
    async (_label, staleResult) => {
      const retry = makeRetryScheduler();
      let identityCalls = 0;
      let signalStaleGuardStarted!: () => void;
      const staleGuardStarted = new Promise<void>((resolve) => {
        signalStaleGuardStarted = resolve;
      });
      let resolveStaleGuard!: () => void;
      let rejectStaleGuard!: (error: Error) => void;
      const staleGuard = new Promise<void>((resolve, reject) => {
        resolveStaleGuard = resolve;
        rejectStaleGuard = reject;
      });
      const deps = makeDeps({
        getWorkspaceIdentity: async () => {
          identityCalls += 1;
          if (identityCalls === 1) return null;
          if (identityCalls === 2) {
            signalStaleGuardStarted();
            await staleGuard;
            if (staleResult === 'throw') {
              throw new Error('stale context read failed');
            }
            return null;
          }
          return {
            workspaceId: 'ws-1',
            resourceTeamId: 'team-1',
            workspaceMemberId: 'wm-member',
          };
        },
      });
      Object.assign(deps, {
        scheduler: retry.scheduler,
        random: () => 1,
      });
      const pull = createProactiveContentPull(deps);

      await pull.handleContentChanged(baseEvent);
      expect(retry.tasks.size).toBe(1);

      const staleRetry = retry.runNext();
      await staleGuardStarted;
      const freshEvent = pull.handleContentChanged(baseEvent);
      await vi.waitFor(() => expect(identityCalls).toBe(3));

      if (staleResult === 'throw') {
        rejectStaleGuard(new Error('release rejected stale guard'));
      } else {
        resolveStaleGuard();
      }
      await Promise.all([staleRetry, freshEvent]);

      expect(deps.pullCalls).toEqual(['proj-1']);
      expect(retry.tasks.size).toBe(0);
    },
  );

  it('wakes immediately when a same-version event resolves a provisional guard retry', async () => {
    const retry = makeRetryScheduler();
    let identityAvailable = false;
    const deps = makeDeps({
      getWorkspaceIdentity: async () => identityAvailable
        ? {
            workspaceId: 'ws-1',
            resourceTeamId: 'team-1',
            workspaceMemberId: 'wm-member',
          }
        : null,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    expect(deps.pullCalls).toEqual([]);
    expect(retry.delays).toEqual([1_000]);
    expect(retry.tasks.size).toBe(1);

    identityAvailable = true;
    await pull.handleContentChanged(baseEvent);

    expect(retry.cleared).toHaveLength(1);
    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('merges live and full-sweep failures after both guard to the same final scope', async () => {
    const retry = makeRetryScheduler();
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        throw new Error('transport down');
      },
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    await pull.catchUpPublishedHeads('ws-1');

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.delays).toEqual([1_000]);
    expect(retry.tasks.size).toBe(1);
  });

  it('treats an inner manifest hit as removing force, not as satisfying a newer head', async () => {
    let probes = 0;
    let pullAttempt = 0;
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        pullAttempt += 1;
        return { status: 'pulled', version: pullAttempt };
      },
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => {
        probes += 1;
        return probes === 2;
      },
      publishedHead: async () => 2,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({ ...baseEvent, version: 1 });
    await pull.materializeMissingProjects('ws-1');

    expect(probes).toBe(2);
    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
  });

  it('clears an established retry when the active team identity disappears', async () => {
    const retry = makeRetryScheduler();
    let identityAvailable = true;
    const deps = makeDeps({
      getWorkspaceIdentity: async () => identityAvailable
        ? {
            workspaceId: 'ws-1',
            resourceTeamId: 'team-1',
            workspaceMemberId: 'wm-member',
          }
        : null,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        throw new Error('transport down');
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    identityAvailable = false;
    await retry.runNext();

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('clears an established retry when owner resolution confirms the project is gone', async () => {
    const retry = makeRetryScheduler();
    let owner: string | null = 'wm-owner';
    const deps = makeDeps({
      resolveSharedProjectOwner: async () => owner,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        throw new Error('transport down');
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    owner = null;
    await retry.runNext();

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('keeps an established retry when owner resolution throws transiently', async () => {
    const retry = makeRetryScheduler();
    let ownerLookupThrows = false;
    const deps = makeDeps({
      resolveSharedProjectOwner: async () => {
        if (ownerLookupThrows) throw new Error('hub unavailable');
        return 'wm-owner';
      },
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        throw new Error('transport down');
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    ownerLookupThrows = true;
    await retry.runNext();

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.delays).toEqual([1_000, 2_000]);
    expect(retry.tasks.size).toBe(1);
  });

  it('retries an unknown-version event when pull reports an unknown version', async () => {
    const retry = makeRetryScheduler();
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        return { status: 'pulled', version: null };
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
    });

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.delays).toEqual([1_000]);
    expect(retry.tasks.size).toBe(1);
  });

  it.each([
    ['thrown transport failure', 'throw'],
    ['null transport result', 'null'],
    ['register failure', 'register_failed'],
    ['unknown materialized version', 'version_null'],
    ['materialized version below the desired head', 'version_low'],
  ] as const)('retries after %s and eventually covers the desired version', async (_label, firstResult) => {
    const retry = makeRetryScheduler();
    let attempt = 0;
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        attempt += 1;
        if (attempt > 1) return { status: 'pulled', version: 3 };
        if (firstResult === 'throw') throw new Error('transport down');
        if (firstResult === 'null') return null as never;
        if (firstResult === 'register_failed') return { status: 'register_failed' };
        if (firstResult === 'version_null') return { status: 'pulled', version: null };
        return { status: 'pulled', version: 2 };
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.delays).toEqual([1_000]);
    expect([...retry.tasks.values()][0]?.handle.unref).toHaveBeenCalledTimes(1);

    await retry.runNext();
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']));
    expect(retry.tasks.size).toBe(0);
  });

  it('keeps backoff for same/older events but wakes immediately for a higher version', async () => {
    const retry = makeRetryScheduler();
    let succeedAtVersion = 4;
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (deps.pullCalls.length < succeedAtVersion) throw new Error('still down');
        return { status: 'pulled', version: 2 };
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged({ ...baseEvent, version: 1 });
    await retry.runNext();
    expect(retry.delays).toEqual([1_000, 2_000]);
    expect(deps.pullCalls).toHaveLength(2);

    await pull.handleContentChanged({ ...baseEvent, version: 1 });
    await pull.handleContentChanged({ ...baseEvent, version: 0 });
    expect(deps.pullCalls).toHaveLength(2);
    expect(retry.delays).toEqual([1_000, 2_000]);

    succeedAtVersion = 3;
    await pull.handleContentChanged({ ...baseEvent, version: 2 });
    expect(deps.pullCalls).toHaveLength(3);
    expect(retry.cleared).toHaveLength(1);
    expect(retry.tasks.size).toBe(0);
  });

  it('caps equal-jitter retry backoff at 30 seconds', async () => {
    const retry = makeRetryScheduler();
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        throw new Error('still down');
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    for (let index = 0; index < 7; index += 1) {
      await retry.runNext();
    }

    expect(retry.delays).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      30_000,
      30_000,
      30_000,
    ]);
  });

  it('runs different projects independently while one transport is blocked', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        if (target.projectId === 'proj-1') await firstGate;
        return { status: 'pulled', version: 3 };
      },
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.handleContentChanged(baseEvent);
    await vi.waitFor(() => expect(deps.pullCalls).toEqual(['proj-1']));
    await pull.handleContentChanged({ ...baseEvent, projectId: 'proj-2' });

    expect(deps.pullCalls).toEqual(['proj-1', 'proj-2']);
    releaseFirst();
    await first;
  });

  it.each([
    ['workspace scope changes', 'scope'],
    ['binding becomes personal', 'personal'],
    ['viewer becomes the owner', 'self-owner'],
    ['resource owner changes', 'owner-drift'],
  ] as const)('stops retries when %s', async (_label, change) => {
    const retry = makeRetryScheduler();
    let workspaceId = 'ws-1';
    let visibility: 'personal' | 'team' = 'team';
    let owner = 'wm-owner';
    const deps = makeDeps({
      getLocalBinding: () => ({ workspaceId: 'ws-1', visibility }),
      getWorkspaceIdentity: async () => ({
        workspaceId,
        resourceTeamId: `team-${workspaceId}`,
        workspaceMemberId: 'wm-member',
      }),
      resolveSharedProjectOwner: async () => owner,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        throw new Error('retry me');
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    if (change === 'scope') workspaceId = 'ws-other';
    if (change === 'personal') visibility = 'personal';
    if (change === 'self-owner') owner = 'wm-member';
    if (change === 'owner-drift') owner = 'wm-new-owner';
    await retry.runNext();

    expect(deps.pullCalls).toEqual(['proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('stops retrying after the resource is revoked', async () => {
    const retry = makeRetryScheduler();
    let attempt = 0;
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        attempt += 1;
        if (attempt === 1) throw new Error('retry me');
        return { status: 'revoked' };
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    await retry.runNext();

    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('dispose cancels pending retry timers', async () => {
    const retry = makeRetryScheduler();
    const deps = makeDeps({
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        throw new Error('retry me');
      },
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.handleContentChanged(baseEvent);
    (pull as ProactiveContentPull & { dispose(): void }).dispose();

    expect(retry.cleared).toHaveLength(1);
    expect(retry.tasks.size).toBe(0);
    expect(deps.pullCalls).toEqual(['proj-1']);
  });

  it('dispose cancels a pending catalog-sweep retry timer', async () => {
    const retry = makeRetryScheduler();
    const deps = makeDeps({
      listSharedProjects: async () => {
        throw new Error('catalog unavailable');
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1');
    pull.dispose();

    expect(retry.cleared).toHaveLength(1);
    expect(retry.tasks.size).toBe(0);
  });

  it('does not schedule a catalog retry after dispose wins an in-flight sweep race', async () => {
    const retry = makeRetryScheduler();
    let catalogStarted!: () => void;
    let releaseCatalog!: () => void;
    const started = new Promise<void>((resolve) => {
      catalogStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    const deps = makeDeps({
      getLocalBinding: () => null,
      listSharedProjects: async () => {
        catalogStarted();
        await gate;
        return [];
      },
      hasMaterializedProject: () => false,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    const sweep = pull.materializeMissingProjects('ws-1', 'project-a');
    await started;
    pull.dispose();
    releaseCatalog();
    await sweep;

    expect(retry.delays).toEqual([]);
    expect(retry.tasks.size).toBe(0);
  });

  it('does not treat a manifest appearing before retry as proof of the desired version', async () => {
    const retry = makeRetryScheduler();
    let materialized = false;
    let attempt = 0;
    const deps = makeDeps({
      getLocalBinding: () => null,
      pullSharedProject: async (target) => {
        deps.pullCalls.push(target.projectId);
        attempt += 1;
        if (attempt === 1) throw new Error('retry me');
        return { status: 'pulled', version: 3 };
      },
      listSharedProjects: async () => [
        { projectId: 'proj-1', ownerMemberId: 'wm-owner' },
      ],
      hasMaterializedProject: () => materialized,
      publishedHead: async () => 3,
    });
    Object.assign(deps, {
      scheduler: retry.scheduler,
      random: () => 1,
    });
    const pull = createProactiveContentPull(deps);

    await pull.materializeMissingProjects('ws-1', 'proj-1');
    materialized = true;
    await retry.runNext();

    expect(deps.pullCalls).toEqual(['proj-1', 'proj-1']);
    expect(retry.tasks.size).toBe(0);
  });

  it('serializes different scopes for one project and re-guards after waiting', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let activeWorkspaceId = 'ws-1';
    let identityReads = 0;
    let active = 0;
    let maxActive = 0;
    const scopes: string[] = [];
    const deps = makeDeps({
      getLocalBinding: () => null,
      getWorkspaceIdentity: async () => {
        identityReads += 1;
        return {
          workspaceId: activeWorkspaceId,
          resourceTeamId: `team-${activeWorkspaceId}`,
          workspaceMemberId: 'wm-member',
        };
      },
      pullSharedProject: async (target) => {
        scopes.push(target.workspaceId);
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          if (target.workspaceId === 'ws-1') await firstGate;
          return { status: 'pulled', version: 1 };
        } finally {
          active -= 1;
        }
      },
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.handleContentChanged({
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      version: 1,
    });
    await vi.waitFor(() => expect(scopes).toEqual(['ws-1']));
    activeWorkspaceId = 'ws-2';
    const second = pull.handleContentChanged({
      projectId: 'proj-1',
      workspaceId: 'ws-2',
      version: 1,
    });
    await vi.waitFor(() => expect(identityReads).toBe(2));

    expect(scopes).toEqual(['ws-1']);
    expect(maxActive).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);

    expect(scopes).toEqual(['ws-1', 'ws-2']);
    expect(maxActive).toBe(1);
    // The second scope guarded once before waiting, then guarded again after
    // the foreign-scope completion instead of trusting that outcome.
    expect(identityReads).toBe(3);
  });

  it('brands the exact in-flight version and invalidates it when a newer event arrives', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const targets: ProactiveContentPullTarget[] = [];
    const deps = makeDeps({
      pullSharedProject: async (target, expectedVersion) => {
        targets.push(target);
        if (expectedVersion === 3) await firstGate;
        return { status: 'pulled', version: expectedVersion ?? null };
      },
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.handleContentChanged(baseEvent);
    await vi.waitFor(() => expect(targets).toHaveLength(1));
    const firstInvocation = targets[0]!.authorizedStageInvocation;
    expect(isAuthorizedProactivePullInvocation(
      firstInvocation,
      targets[0]!,
      3,
    )).toBe(true);

    const second = pull.handleContentChanged({ ...baseEvent, version: 4 });
    await vi.waitFor(() => {
      expect(firstInvocation?.isStillExpected()).toBe(false);
    });
    releaseFirst();
    await Promise.all([first, second]);

    expect(targets.map((target) => target.authorizedStageInvocation?.expectedVersion))
      .toEqual([3, 4]);
    expect(isAuthorizedProactivePullInvocation(
      { ...targets[1]!.authorizedStageInvocation! },
      targets[1]!,
      4,
    )).toBe(false);
  });

  it('aborts an in-flight authorized stage immediately when a newer version arrives', async () => {
    const versions: number[] = [];
    let firstSignal: AbortSignal | undefined;
    const deps = makeDeps({
      pullSharedProject: async (target, expectedVersion) => {
        versions.push(expectedVersion!);
        if (expectedVersion === 3) {
          firstSignal = target.authorizedStageInvocation?.signal;
          await new Promise<void>((resolve) => {
            firstSignal?.addEventListener('abort', () => resolve(), {
              once: true,
            });
          });
          return { status: 'register_failed' };
        }
        return { status: 'pulled', version: expectedVersion! };
      },
    });
    const pull = createProactiveContentPull(deps);

    const first = pull.handleContentChanged(baseEvent);
    await vi.waitFor(() => expect(versions).toEqual([3]));
    const second = pull.handleContentChanged({ ...baseEvent, version: 4 });

    await vi.waitFor(() => expect(firstSignal?.aborted).toBe(true));
    await Promise.all([first, second]);
    expect(versions).toEqual([3, 4]);
  });
});
