// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectCollab } from '../src/collab/useProjectCollab';

const MEMBER_CONTEXT: WorkspaceCollabContext = {
  workspaceId: 'ws-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-member',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
  permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  displayName: 'Member',
};

function response(payload: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useProjectCollab member auto-pull retry', () => {
  it('shows daemon-observed downloading even before the published cursor trails', async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) {
        return response({ context: MEMBER_CONTEXT });
      }
      if (pathname.endsWith('/collab/status')) {
        return response({
          publishedVersion: 8,
          materializedVersion: 8,
          contentTransferState: {
            status: 'downloading',
            version: 9,
            startedAt: 100,
            updatedAt: 100,
          },
          syncState: 'synced',
          ownerMemberId: 'wm-owner',
        });
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return response({ present: [{ memberId: 'wm-member' }] });
      }
      return response({ ok: true });
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 30_000,
        workspaceContext: MEMBER_CONTEXT,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.downloadPending).toBe(true);
  });

  it('does not hide local files while the first status is still proving an equal durable cursor', async () => {
    const firstStatus = deferred<Response>();
    let pullCalls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) return response({ context: MEMBER_CONTEXT });
      if (pathname.endsWith('/collab/status')) return firstStatus.promise;
      if (pathname.endsWith('/presence/heartbeat')) {
        return response({ present: [{ memberId: 'wm-member' }] });
      }
      if (pathname.endsWith('/collab/pull')) {
        pullCalls += 1;
        return response({ ok: true, version: 2 });
      }
      return response({ ok: true });
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 30_000,
        workspaceContext: MEMBER_CONTEXT,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // The daemon status can be a slow hub-backed round-trip. Unknown is not
    // proof that local files are stale, so reopening must keep them visible
    // instead of replacing every row with a download skeleton.
    expect(result.current.syncState).toBeNull();
    expect(result.current.downloadPending).toBe(false);
    expect(pullCalls).toBe(0);

    await act(async () => {
      firstStatus.resolve(response({
        publishedVersion: 2,
        materializedVersion: 2,
        syncState: 'synced',
        ownerMemberId: 'wm-owner',
      }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.downloadPending).toBe(false);
    expect(pullCalls).toBe(0);
  });

  it('does not report a download when shared status has no published head to compare', async () => {
    let pullCalls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) return response({ context: MEMBER_CONTEXT });
      if (pathname.endsWith('/collab/status')) {
        return response({
          publishedVersion: null,
          materializedVersion: null,
          syncState: 'synced',
          ownerMemberId: 'wm-owner',
        });
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return response({ present: [{ memberId: 'wm-member' }] });
      }
      if (pathname.endsWith('/collab/pull')) {
        pullCalls += 1;
        return response({ ok: true, version: null });
      }
      return response({ ok: true });
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 30_000,
        workspaceContext: MEMBER_CONTEXT,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.syncState).toBe('synced');
    expect(result.current.publishedVersion).toBeNull();
    expect(result.current.downloadPending).toBe(false);
    expect(pullCalls).toBe(0);
  });

  it('does not pull or show loading when the daemon says the published head is already materialized', async () => {
    let pullCalls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) return response({ context: MEMBER_CONTEXT });
      if (pathname.endsWith('/collab/status')) {
        return response({
          publishedVersion: 7,
          materializedVersion: 7,
          syncState: 'synced',
          ownerMemberId: 'wm-owner',
        });
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return response({ present: [{ memberId: 'wm-member' }] });
      }
      if (pathname.endsWith('/collab/pull')) {
        pullCalls += 1;
        return response({ ok: true, version: 7 });
      }
      return response({ ok: true });
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 1_000,
        workspaceContext: MEMBER_CONTEXT,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pullCalls).toBe(0);
    expect(result.current.downloadPending).toBe(false);
  });

  it('retries the same published version on the next status poll after a failed pull', async () => {
    let pullCalls = 0;
    let materializedVersion = 6;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) return response({ context: MEMBER_CONTEXT });
      if (pathname.endsWith('/collab/status')) {
        return response({
          publishedVersion: 7,
          materializedVersion,
          syncState: 'synced',
          ownerMemberId: 'wm-owner',
        });
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return response({ present: [{ memberId: 'wm-member' }] });
      }
      if (pathname.endsWith('/collab/pull')) {
        pullCalls += 1;
        if (pullCalls === 1) return response({ error: 'temporary' }, false);
        materializedVersion = 7;
        return response({ ok: true, version: 7 });
      }
      return response({ ok: true });
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 1_000,
        workspaceContext: MEMBER_CONTEXT,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pullCalls).toBe(1);
    expect(result.current.downloadPending).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(pullCalls).toBe(2);
    expect(result.current.downloadPending).toBe(false);
  });

  it('pulls a newer published version that arrives while the prior pull is in flight', async () => {
    let publishedVersion = 1;
    let materializedVersion = 0;
    let pullCalls = 0;
    const firstPull = deferred<Response>();
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) return response({ context: MEMBER_CONTEXT });
      if (pathname.endsWith('/collab/status')) {
        return response({
          publishedVersion,
          materializedVersion,
          syncState: 'synced',
          ownerMemberId: 'wm-owner',
        });
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return response({ present: [{ memberId: 'wm-member' }] });
      }
      if (pathname.endsWith('/collab/pull')) {
        pullCalls += 1;
        if (pullCalls === 1) return firstPull.promise;
        materializedVersion = 2;
        return response({ ok: true, version: 2 });
      }
      return response({ ok: true });
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        statusPollMs: 1_000,
        workspaceContext: MEMBER_CONTEXT,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pullCalls).toBe(1);

    publishedVersion = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(pullCalls).toBe(1);

    await act(async () => {
      materializedVersion = 1;
      firstPull.resolve(response({ ok: true, version: 1 }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pullCalls).toBe(2);
    expect(result.current.publishedVersion).toBe(2);
    expect(result.current.downloadPending).toBe(false);
  });

  it('waits for the new project status instead of inheriting a higher old project cursor', async () => {
    let p1StatusCalls = 0;
    let p2PullCalls = 0;
    const lateP1Status = deferred<Response>();
    const p2Status = deferred<Response>();
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) return response({ context: MEMBER_CONTEXT });
      const projectId = pathname.match(/\/api\/projects\/([^/]+)\//)?.[1];
      if (pathname.endsWith('/collab/status') && projectId === 'p1') {
        p1StatusCalls += 1;
        return p1StatusCalls === 1
          ? response({
              publishedVersion: 9,
              materializedVersion: 9,
              syncState: 'synced',
              ownerMemberId: 'wm-owner',
            })
          : lateP1Status.promise;
      }
      if (pathname.endsWith('/collab/status') && projectId === 'p2') {
        return p2Status.promise;
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return response({ present: [{ memberId: 'wm-member' }] });
      }
      if (pathname.endsWith('/collab/pull') && projectId === 'p2') {
        p2PullCalls += 1;
        return response({ ok: true, version: 2 });
      }
      return response({ ok: true });
    }) as typeof fetch;

    const { result, rerender } = renderHook(
      ({ projectId }) =>
        useProjectCollab(projectId, {
          fetch: fetchImpl,
          statusPollMs: 1_000,
          workspaceContext: MEMBER_CONTEXT,
        }),
      { initialProps: { projectId: 'p1' } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.publishedVersion).toBe(9);
    expect(result.current.downloadPending).toBe(false);

    // Leave one old-project status request in flight across the switch.
    act(() => result.current.checkStatusNow());
    rerender({ projectId: 'p2' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(p2PullCalls).toBe(0);

    await act(async () => {
      lateP1Status.resolve(response({
        publishedVersion: 10,
        materializedVersion: 10,
        syncState: 'synced',
        ownerMemberId: 'wm-owner',
      }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(p2PullCalls).toBe(0);

    await act(async () => {
      p2Status.resolve(response({
        publishedVersion: 2,
        materializedVersion: 0,
        syncState: 'synced',
        ownerMemberId: 'wm-owner',
      }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(p2PullCalls).toBe(1);
    expect(result.current.publishedVersion).toBe(2);
    expect(result.current.downloadPending).toBe(false);
  });

  it('ignores a late pull completion from the project that was switched away from', async () => {
    const versions = new Map([
      ['p1', 9],
      ['p2', 2],
    ]);
    const materializedVersions = new Map([
      ['p1', 0],
      ['p2', 0],
    ]);
    const pullPaths: string[] = [];
    const firstProjectPull = deferred<Response>();
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) return response({ context: MEMBER_CONTEXT });
      const projectId = pathname.match(/\/api\/projects\/([^/]+)\//)?.[1];
      if (pathname.endsWith('/collab/status')) {
        return response({
          publishedVersion: projectId ? versions.get(projectId) : null,
          materializedVersion: projectId ? materializedVersions.get(projectId) : null,
          syncState: 'synced',
          ownerMemberId: 'wm-owner',
        });
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return response({ present: [{ memberId: 'wm-member' }] });
      }
      if (pathname.endsWith('/collab/pull')) {
        pullPaths.push(pathname);
        if (projectId === 'p1') return firstProjectPull.promise;
        const version = projectId ? versions.get(projectId) ?? null : null;
        if (projectId && version != null) materializedVersions.set(projectId, version);
        return response({ ok: true, version });
      }
      return response({ ok: true });
    }) as typeof fetch;

    const { result, rerender } = renderHook(
      ({ projectId }) =>
        useProjectCollab(projectId, {
          fetch: fetchImpl,
          statusPollMs: 1_000,
          workspaceContext: MEMBER_CONTEXT,
        }),
      { initialProps: { projectId: 'p1' } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pullPaths.filter((path) => path.includes('/p1/'))).toHaveLength(1);

    rerender({ projectId: 'p2' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pullPaths.filter((path) => path.includes('/p2/'))).toHaveLength(1);
    expect(result.current.downloadPending).toBe(false);

    await act(async () => {
      materializedVersions.set('p1', 9);
      firstProjectPull.resolve(response({ ok: true, version: 9 }));
      await vi.advanceTimersByTimeAsync(0);
    });

    versions.set('p2', 3);
    await act(async () => {
      result.current.checkStatusNow();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(pullPaths.filter((path) => path.includes('/p2/'))).toHaveLength(2);
    expect(result.current.downloadPending).toBe(false);
  });
});
