import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CollabClient,
  type CollabPresenceMember,
  type CollabSnapshot,
} from '../src/collab/collab-client.js';
import { workspaceContextFixture } from './helpers/workspace-context';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-viewer',
});

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
}

interface FakeFetchOptions {
  present?: CollabPresenceMember[];
  publishedVersion?: number | null;
  syncState?: string | null;
  failPath?: string;
}

const PRESENCE_TEST_NOW = Date.parse('2026-08-05T00:00:00.000Z');
const presenceTime = (offsetMs = 0) =>
  new Date(PRESENCE_TEST_NOW + offsetMs).toISOString();

function makeFetch(options: FakeFetchOptions = {}) {
  const calls: RecordedCall[] = [];
  const state = {
    present: options.present ?? [{ memberId: 'm1', name: 'Author' }],
    publishedVersion: options.publishedVersion ?? null,
    syncState: options.syncState ?? 'synced',
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    const pathname = new URL(url, 'http://daemon.local').pathname;
    if (options.failPath && pathname.endsWith(options.failPath)) {
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }
    let payload: unknown = { ok: true };
    if (
      pathname.endsWith('/presence')
      || pathname.endsWith('/presence/heartbeat')
    ) {
      payload = { present: state.present };
    }
    else if (pathname.endsWith('/collab/status')) {
      payload = { publishedVersion: state.publishedVersion, syncState: state.syncState };
    }
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }) as typeof fetch;
  return { fetchImpl, calls, state };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(PRESENCE_TEST_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CollabClient', () => {
  it('binds status and pull to the captured workspace identity', async () => {
    const { fetchImpl, calls } = makeFetch();
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
      workspaceContext: TEAM_CONTEXT,
    });

    await client.pollStatus();
    await client.pull();

    const status = calls.find((call) => call.url.endsWith('/collab/status'));
    const pull = calls.find((call) => call.url.endsWith('/collab/pull'));
    for (const call of [status, pull]) {
      expect(call?.headers.get('x-od-workspace-id')).toBe(
        TEAM_CONTEXT.workspaceId,
      );
      expect(call?.headers.get('x-od-workspace-member-id')).toBe(
        TEAM_CONTEXT.workspaceMemberId,
      );
    }
  });

  it('applies content-transfer SSE state in timestamp order', () => {
    const { fetchImpl } = makeFetch();
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });

    client.applyContentTransferState({
      status: 'downloading',
      version: 8,
      startedAt: 100,
      updatedAt: 100,
    });
    client.applyContentTransferState({
      status: 'idle',
      version: 8,
      startedAt: 100,
      updatedAt: 200,
    });
    client.applyContentTransferState({
      status: 'downloading',
      version: 8,
      startedAt: 100,
      updatedAt: 150,
    });

    expect(client.getSnapshot().contentTransferState).toMatchObject({
      status: 'idle',
      updatedAt: 200,
    });
  });

  it('clears a stale downloading snapshot when the current daemon reports no transfer', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        publishedVersion: 8,
        materializedVersion: 8,
        contentTransferState: null,
        syncState: 'synced',
      }),
    })) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });
    client.applyContentTransferState({
      status: 'downloading',
      version: 8,
      startedAt: 100,
      updatedAt: 100,
    });

    await client.pollStatus();

    expect(client.getSnapshot().contentTransferState).toBeNull();
  });

  it('does not let an older null status response clear a newer SSE transfer', async () => {
    let resolveStatus!: (response: Response) => void;
    const statusResponse = new Promise<Response>((resolve) => {
      resolveStatus = resolve;
    });
    const fetchImpl = vi.fn(async () => statusResponse) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });

    const polling = client.pollStatus();
    client.applyContentTransferState({
      status: 'downloading',
      version: 9,
      startedAt: 200,
      updatedAt: 200,
    });
    resolveStatus({
      ok: true,
      status: 200,
      json: async () => ({
        publishedVersion: 8,
        materializedVersion: 8,
        contentTransferState: null,
        syncState: 'synced',
      }),
    } as Response);
    await polling;

    expect(client.getSnapshot().contentTransferState).toMatchObject({
      status: 'downloading',
      version: 9,
    });
  });

  it('does not let an older concrete poll overwrite a restart null and newer SSE transfer', async () => {
    let resolveOldStatus!: (response: Response) => void;
    const oldStatusResponse = new Promise<Response>((resolve) => {
      resolveOldStatus = resolve;
    });
    let statusCall = 0;
    const fetchImpl = vi.fn(async () => {
      statusCall += 1;
      if (statusCall === 1) return oldStatusResponse;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          publishedVersion: 8,
          materializedVersion: 8,
          contentTransferState: null,
          syncState: 'synced',
        }),
      } as Response;
    }) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });

    const oldPolling = client.pollStatus();
    await client.pollStatus();
    client.applyContentTransferState({
      status: 'downloading',
      version: 9,
      startedAt: 1,
      updatedAt: 1,
    });
    resolveOldStatus({
      ok: true,
      status: 200,
      json: async () => ({
        publishedVersion: 8,
        materializedVersion: 8,
        contentTransferState: {
          status: 'downloading',
          version: 8,
          startedAt: 10_000,
          updatedAt: 10_000,
        },
        syncState: 'synced',
      }),
    } as Response);
    await oldPolling;

    expect(client.getSnapshot().contentTransferState).toMatchObject({
      status: 'downloading',
      version: 9,
    });
  });

  it('polls status on start, then heartbeats once the project is shared', async () => {
    const { fetchImpl, calls, state } = makeFetch({
      present: [{ memberId: 'm1', name: 'Author' }],
      publishedVersion: 4,
    });
    const updates: CollabSnapshot[] = [];
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1', name: 'Author', role: 'owner' },
      fetch: fetchImpl,
      onUpdate: (snapshot) => updates.push(snapshot),
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    const heartbeat = calls.find((c) => c.url.endsWith('/presence/heartbeat'));
    expect(heartbeat?.method).toBe('POST');
    expect(heartbeat?.body).toMatchObject({ memberId: 'm1', name: 'Author', role: 'owner' });
    expect(calls.some((c) => c.method === 'GET' && c.url.endsWith('/collab/status'))).toBe(true);

    const snapshot = client.getSnapshot();
    expect(snapshot.present).toEqual(state.present);
    expect(snapshot.publishedVersion).toBe(4);
    expect(updates.length).toBeGreaterThanOrEqual(2);

    client.stop();
  });

  it('does not launch a stopped lifecycle\'s queued cold status read after restart', async () => {
    const { fetchImpl, calls } = makeFetch({ publishedVersion: 4 });
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });

    client.start();
    client.stop();
    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(
      calls.filter(
        ({ method, url }) =>
          method === 'GET' && url.endsWith('/collab/status'),
      ),
    ).toHaveLength(1);

    client.stop();
  });

  it('does not duplicate the queued cold read when the same client is polled explicitly', async () => {
    const { fetchImpl, calls } = makeFetch({ publishedVersion: 4 });
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });

    client.start();
    await client.pollStatus();
    await vi.advanceTimersByTimeAsync(0);

    expect(
      calls.filter(
        ({ method, url }) =>
          method === 'GET' && url.endsWith('/collab/status'),
      ),
    ).toHaveLength(1);

    client.stop();
  });

  it('starts a scoped Team heartbeat without waiting for a slow status response', async () => {
    let resolveStatus!: (response: Response) => void;
    const fetchMock = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) {
          return new Promise<Response>((resolve) => {
            resolveStatus = resolve;
          });
        }
        if (pathname.endsWith('/presence/heartbeat')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                present: [
                  { memberId: 'member-viewer' },
                  { memberId: 'member-peer' },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        throw new Error(`unexpected request: ${pathname}`);
      },
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p-slow-status',
      member: { memberId: 'member-viewer' },
      workspaceContext: TEAM_CONTEXT,
      fetch: fetchImpl,
      heartbeatMs: 10_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(resolveStatus).toBeTypeOf('function');
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input).endsWith('/presence/heartbeat'))).toBe(true);
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'member-viewer' },
      { memberId: 'member-peer' },
    ]);

    client.stop();
    resolveStatus(
      new Response(
        JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
  });

  it('shows the daemon cached roster before a slow Team heartbeat settles', async () => {
    let resolveStatus!: (response: Response) => void;
    let resolveHeartbeat!: (response: Response) => void;
    const requestPaths: string[] = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        requestPaths.push(pathname);
        if (pathname.endsWith('/collab/status')) {
          return new Promise<Response>((resolve) => {
            resolveStatus = resolve;
          });
        }
        if (pathname.endsWith('/presence/heartbeat')) {
          return new Promise<Response>((resolve) => {
            resolveHeartbeat = resolve;
          });
        }
        if (pathname.endsWith('/presence')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                present: [
                  { memberId: 'member-viewer' },
                  { memberId: 'member-peer' },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        throw new Error(`unexpected request: ${pathname}`);
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p-cached-presence',
      member: { memberId: 'member-viewer' },
      workspaceContext: TEAM_CONTEXT,
      fetch: fetchImpl,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(requestPaths.indexOf('/api/projects/p-cached-presence/presence'))
      .toBeGreaterThanOrEqual(0);
    expect(requestPaths.indexOf('/api/projects/p-cached-presence/presence'))
      .toBeLessThan(
        requestPaths.indexOf('/api/projects/p-cached-presence/presence/heartbeat'),
      );
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'member-viewer' },
      { memberId: 'member-peer' },
    ]);

    client.stop();
    resolveHeartbeat(
      new Response(JSON.stringify({ present: [] }), { status: 200 }),
    );
    resolveStatus(
      new Response(
        JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
  });

  it('does not let a slow cached start read overwrite the heartbeat roster', async () => {
    let resolveStatus!: (response: Response) => void;
    let resolveCachedPresence!: (response: Response) => void;
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) {
          return new Promise<Response>((resolve) => {
            resolveStatus = resolve;
          });
        }
        if (pathname.endsWith('/presence/heartbeat')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                present: [
                  { memberId: 'member-viewer' },
                  { memberId: 'authoritative-peer' },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        if (pathname.endsWith('/presence')) {
          return new Promise<Response>((resolve) => {
            resolveCachedPresence = resolve;
          });
        }
        throw new Error(`unexpected request: ${pathname}`);
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p-ordered-presence',
      member: { memberId: 'member-viewer' },
      workspaceContext: TEAM_CONTEXT,
      fetch: fetchImpl,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'member-viewer' },
      { memberId: 'authoritative-peer' },
    ]);

    resolveCachedPresence(
      new Response(
        JSON.stringify({
          present: [
            { memberId: 'member-viewer' },
            { memberId: 'stale-peer' },
          ],
        }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'member-viewer' },
      { memberId: 'authoritative-peer' },
    ]);

    client.stop();
    resolveStatus(
      new Response(
        JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
  });

  it('does not optimistically heartbeat a Personal or unscoped session', async () => {
    const pendingStatus = new Promise<Response>(() => {});
    const fetchMock = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) return pendingStatus;
        throw new Error(`unexpected request: ${pathname}`);
      },
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const personalContext = {
      ...TEAM_CONTEXT,
      workspaceType: 'personal' as const,
      teamId: undefined,
    };
    const personal = new CollabClient({
      projectId: 'p-personal',
      member: { memberId: 'member-viewer' },
      workspaceContext: personalContext,
      fetch: fetchImpl,
      heartbeatMs: 10_000,
    });
    const unscoped = new CollabClient({
      projectId: 'p-unscoped',
      member: { memberId: 'member-viewer' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
    });

    personal.start();
    unscoped.start();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith('/presence/heartbeat'))).toHaveLength(0);
    personal.stop();
    unscoped.stop();
  });

  it('keeps the local roster empty when optimistic Team heartbeat authority is rejected', async () => {
    const errors: unknown[] = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) {
          return new Promise<Response>(() => {});
        }
        if (pathname.endsWith('/presence/heartbeat')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ error: 'WORKSPACE_ACCESS_DENIED' }),
              { status: 403 },
            ),
          );
        }
        throw new Error(`unexpected request: ${pathname}`);
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p-denied',
      member: { memberId: 'member-viewer' },
      workspaceContext: TEAM_CONTEXT,
      fetch: fetchImpl,
      onError: (error) => errors.push(error),
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(errors).toHaveLength(1);
    expect(client.getSnapshot().present).toEqual([]);
    client.stop();
  });

  it('does not heartbeat for a local-only project', async () => {
    const { fetchImpl, calls } = makeFetch({ syncState: 'local_only' });
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1', name: 'Author', role: 'owner' },
      fetch: fetchImpl,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls.some((c) => c.url.endsWith('/collab/status'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/presence/heartbeat'))).toBe(false);

    client.stop();
  });

  it('re-heartbeats and re-polls on their own intervals', async () => {
    const { fetchImpl, calls } = makeFetch();
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
      statusPollMs: 5_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    const initialHeartbeats = calls.filter((c) => c.url.endsWith('/presence/heartbeat')).length;
    const initialStatus = calls.filter((c) => c.url.endsWith('/collab/status')).length;

    // One full heartbeat window: status polls twice more (5s each), heartbeat once more.
    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls.filter((c) => c.url.endsWith('/presence/heartbeat')).length).toBe(initialHeartbeats + 1);
    expect(calls.filter((c) => c.url.endsWith('/collab/status')).length).toBe(initialStatus + 2);

    client.stop();
  });

  it('retains a peer for the upstream lease window when self-bearing rosters briefly omit it', async () => {
    const { fetchImpl, state } = makeFetch({
      present: [
        { memberId: 'viewer', name: 'Viewer', heartbeatAt: presenceTime() },
        { memberId: 'peer', name: 'Peer', heartbeatAt: presenceTime() },
      ],
    });
    const client = new CollabClient({
      projectId: 'p-transient-roster',
      member: { memberId: 'viewer', name: 'Viewer' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
      statusPollMs: 5_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().present).toHaveLength(2);

    state.present = [{
      memberId: 'viewer',
      name: 'Viewer',
      heartbeatAt: presenceTime(10_000),
    }];
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['viewer', 'peer']);

    // The Vela presence lease is authoritative for 30 seconds from the last
    // roster that actually contained the peer. A delayed heartbeat can make
    // the peer absent from the 10s and 20s reads without making that last-good
    // evidence stale. Dropping it after one interval makes the non-owner side
    // flicker while the owner's local self witness hides the same upstream gap.
    await vi.advanceTimersByTimeAsync(19_999);
    expect(client.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['viewer', 'peer']);

    // At the exact upstream TTL boundary the peer is no longer retained.
    await vi.advanceTimersByTimeAsync(1);
    expect(client.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['viewer']);

    client.stop();
  });

  it('never flashes a known peer when it returns before the upstream lease window ends', async () => {
    const { fetchImpl, state } = makeFetch({
      present: [
        { memberId: 'viewer', name: 'Viewer', heartbeatAt: presenceTime() },
        { memberId: 'owner', name: 'Owner', heartbeatAt: presenceTime() },
      ],
    });
    const snapshots: CollabPresenceMember[][] = [];
    const client = new CollabClient({
      projectId: 'p-owner-transient-gap',
      member: { memberId: 'viewer', name: 'Viewer' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
      onUpdate: (snapshot) => snapshots.push(snapshot.present),
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['viewer', 'owner']);
    snapshots.length = 0;
    state.present = [{
      memberId: 'viewer',
      name: 'Viewer',
      heartbeatAt: presenceTime(10_000),
    }];
    await vi.advanceTimersByTimeAsync(20_000);
    state.present = [
      { memberId: 'viewer', name: 'Viewer', heartbeatAt: presenceTime(30_000) },
      { memberId: 'owner', name: 'Owner', heartbeatAt: presenceTime(30_000) },
    ];
    await vi.advanceTimersByTimeAsync(10_000);

    expect(snapshots.every((present) =>
      present.some(({ memberId }) => memberId === 'owner'))).toBe(true);
    expect(client.getSnapshot().present).toHaveLength(2);
    client.stop();
  });

  it('does not extend a nearly expired backend lease from the local observation time', async () => {
    vi.setSystemTime(PRESENCE_TEST_NOW + 29_000);
    const { fetchImpl, state } = makeFetch({
      present: [
        { memberId: 'viewer', heartbeatAt: presenceTime(29_000) },
        { memberId: 'owner', heartbeatAt: presenceTime() },
      ],
    });
    const client = new CollabClient({
      projectId: 'p-nearly-expired-owner',
      member: { memberId: 'viewer' },
      fetch: fetchImpl,
      heartbeatMs: 1_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    state.present = [{
      memberId: 'viewer',
      heartbeatAt: presenceTime(30_000),
    }];
    await vi.advanceTimersByTimeAsync(999);
    expect(client.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['viewer', 'owner']);

    await vi.advanceTimersByTimeAsync(1);
    expect(client.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['viewer']);
    client.stop();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'not-a-date'],
  ])('retains a peer with %s heartbeatAt for only one fallback heartbeat window', async (_label, heartbeatAt) => {
    const { fetchImpl, state } = makeFetch({
      present: [
        { memberId: 'viewer' },
        { memberId: 'legacy-peer', heartbeatAt },
      ],
    });
    const client = new CollabClient({
      projectId: 'p-legacy-presence',
      member: { memberId: 'viewer' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    state.present = [{ memberId: 'viewer' }];
    await vi.advanceTimersByTimeAsync(19_999);
    expect(client.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['viewer', 'legacy-peer']);

    await vi.advanceTimersByTimeAsync(1);
    expect(client.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['viewer']);
    client.stop();
  });

  it('applies an event-driven fresh roster exactly so explicit leaves stay immediate', async () => {
    const { fetchImpl, state } = makeFetch({
      present: [
        { memberId: 'viewer', name: 'Viewer' },
        { memberId: 'peer', name: 'Peer' },
      ],
    });
    const client = new CollabClient({
      projectId: 'p-explicit-leave',
      member: { memberId: 'viewer', name: 'Viewer' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    state.present = [{ memberId: 'viewer', name: 'Viewer' }];
    await client.refreshPresence();

    expect(client.getSnapshot().present).toEqual([
      { memberId: 'viewer', name: 'Viewer' },
    ]);
    client.stop();
  });

  it.each([
    ['an empty roster', []],
    ['a caller-less roster', [{ memberId: 'other-peer' }]],
  ])('clears retained peers immediately for %s', async (_label, present) => {
    const { fetchImpl, state } = makeFetch({
      present: [{ memberId: 'viewer' }, { memberId: 'peer' }],
    });
    const client = new CollabClient({
      projectId: 'p-fail-closed-roster',
      member: { memberId: 'viewer' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    state.present = [{ memberId: 'viewer' }];
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'viewer' },
      { memberId: 'peer' },
    ]);

    state.present = present;
    await client.refreshPresence();
    expect(client.getSnapshot().present).toEqual(present);
    client.stop();
  });

  it('clears the roster immediately when heartbeat authority is revoked', async () => {
    let heartbeatCount = 0;
    const errors: unknown[] = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) {
          return Promise.resolve(Response.json({ syncState: 'synced' }));
        }
        if (pathname.endsWith('/presence/heartbeat')) {
          heartbeatCount += 1;
          if (heartbeatCount === 1) {
            return Promise.resolve(Response.json({
              present: [{ memberId: 'viewer' }, { memberId: 'peer' }],
            }));
          }
          return Promise.resolve(Response.json(
            { error: 'WORKSPACE_ACCESS_DENIED' },
            { status: 403 },
          ));
        }
        if (pathname.endsWith('/presence/leave')) {
          return Promise.resolve(Response.json({ ok: true }));
        }
        throw new Error(`unexpected request: ${pathname}`);
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p-revoked-roster',
      member: { memberId: 'viewer' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
      onError: (error) => errors.push(error),
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().present).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getSnapshot().present).toEqual([]);
    expect(errors).toHaveLength(1);

    client.stop();
  });

  it('does not carry a retained roster across member identities or projects', async () => {
    const projectA = makeFetch({
      present: [{ memberId: 'member-a' }, { memberId: 'peer-a' }],
    });
    const projectB = makeFetch({
      present: [{ memberId: 'member-b' }, { memberId: 'peer-b' }],
    });
    const clientA = new CollabClient({
      projectId: 'project-a',
      member: { memberId: 'member-a' },
      fetch: projectA.fetchImpl,
      heartbeatMs: 10_000,
    });
    const clientB = new CollabClient({
      projectId: 'project-b',
      member: { memberId: 'member-b' },
      fetch: projectB.fetchImpl,
      heartbeatMs: 10_000,
    });

    clientA.start();
    clientB.start();
    await vi.advanceTimersByTimeAsync(0);
    projectA.state.present = [{ memberId: 'member-a' }];
    projectB.state.present = [{ memberId: 'member-b' }];
    await vi.advanceTimersByTimeAsync(10_000);
    expect(clientA.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['member-a', 'peer-a']);
    expect(clientB.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['member-b', 'peer-b']);

    projectA.state.present = [{ memberId: 'member-a-2' }];
    clientA.setMember({ memberId: 'member-a-2' });
    expect(clientA.getSnapshot().present).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);

    expect(clientA.getSnapshot().present).toEqual([
      { memberId: 'member-a-2' },
    ]);
    expect(clientB.getSnapshot().present.map(({ memberId }) => memberId))
      .toEqual(['member-b', 'peer-b']);

    clientA.stop();
    clientB.stop();
  });

  it('keeps heartbeats and roster convergence alive while hidden, then refreshes fresh on visibility', async () => {
    const visibilityListeners = new Set<() => void>();
    const fakeDocument = {
      visibilityState: 'hidden',
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'visibilitychange') visibilityListeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'visibilitychange') visibilityListeners.delete(listener);
      }),
    };
    vi.stubGlobal('document', fakeDocument);
    const { fetchImpl, calls, state } = makeFetch({
      present: [{ memberId: 'm1' }],
    });
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
      statusPollMs: 5_000,
    });

    try {
      client.start();
      await vi.advanceTimersByTimeAsync(0);

      state.present = [{ memberId: 'm1' }, { memberId: 'joined' }];
      await vi.advanceTimersByTimeAsync(10_000);
      expect(client.getSnapshot().present).toEqual([
        { memberId: 'm1' },
        { memberId: 'joined' },
      ]);

      state.present = [{ memberId: 'm1' }];
      await vi.advanceTimersByTimeAsync(20_000);
      expect(client.getSnapshot().present).toEqual([{ memberId: 'm1' }]);

      expect(calls.filter((call) =>
        call.url.endsWith('/presence/heartbeat'))).toHaveLength(4);
      expect(calls.filter((call) =>
        call.url.endsWith('/collab/status'))).toHaveLength(1);

      fakeDocument.visibilityState = 'visible';
      for (const listener of visibilityListeners) listener();
      await vi.advanceTimersByTimeAsync(0);

      // Presence has the same semantics in foreground and background. The
      // visibility transition adds a fresh read only as a convergence
      // accelerator; it does not clear the last roster first.
      expect(calls.filter((call) =>
        call.url.endsWith('/presence/heartbeat'))).toHaveLength(4);
      expect(calls.filter((call) =>
        call.url.endsWith('/presence?fresh=1'))).toHaveLength(1);
      expect(calls.filter((call) =>
        call.url.endsWith('/collab/status'))).toHaveLength(2);
      expect(client.getSnapshot().present).toEqual([{ memberId: 'm1' }]);

      client.stop();
      const afterStop = calls.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toHaveLength(afterStop);
      expect(visibilityListeners.size).toBe(0);
    } finally {
      client.stop();
      vi.unstubAllGlobals();
    }
  });

  it('applies a correct slow heartbeat while a newer request is still pending', async () => {
    const pendingHeartbeats: Array<(response: Response) => void> = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
              { status: 200 },
            ),
          );
        }
        if (pathname.endsWith('/presence/heartbeat')) {
          return new Promise<Response>((resolve) => {
            pendingHeartbeats.push(resolve);
          });
        }
        throw new Error(`unexpected request: ${pathname}`);
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'viewer' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pendingHeartbeats).toHaveLength(2);

    pendingHeartbeats[0]!(
      new Response(
        JSON.stringify({
          present: [{ memberId: 'viewer' }, { memberId: 'teammate' }],
        }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);

    // Merely issuing heartbeat #2 must not suppress heartbeat #1's valid
    // response on a 10s+ network. The newer response can still supersede it
    // once that newer request actually settles.
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'viewer' },
      { memberId: 'teammate' },
    ]);

    pendingHeartbeats[1]!(
      new Response(
        JSON.stringify({ present: [{ memberId: 'viewer' }] }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'viewer' },
      { memberId: 'teammate' },
    ]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(pendingHeartbeats).toHaveLength(3);
    pendingHeartbeats[2]!(
      new Response(
        JSON.stringify({ present: [{ memberId: 'viewer' }] }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().present).toEqual([{ memberId: 'viewer' }]);
    client.stop();
  });

  it('refreshes presence with a read instead of emitting another heartbeat', async () => {
    const { fetchImpl, calls, state } = makeFetch({
      present: [{ memberId: 'm2', name: 'Teammate' }],
    });
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1' },
      fetch: fetchImpl,
      workspaceContext: TEAM_CONTEXT,
    });

    await client.refreshPresence();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: '/api/projects/p1/presence?fresh=1',
      method: 'GET',
    });
    expect(calls[0]!.headers.get('x-od-workspace-id')).toBe(
      TEAM_CONTEXT.workspaceId,
    );
    expect(client.getSnapshot().present).toEqual(state.present);
    expect(calls.some((call) => call.url.endsWith('/presence/heartbeat'))).toBe(false);
  });

  it('converges when an event refresh races a correct heartbeat with a stale SWR roster', async () => {
    let resolveHeartbeat!: (response: Response) => void;
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const url = new URL(String(input), 'http://daemon.local');
        if (url.pathname.endsWith('/collab/status')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
              { status: 200 },
            ),
          );
        }
        if (url.pathname.endsWith('/presence/heartbeat')) {
          return new Promise<Response>((resolve) => {
            resolveHeartbeat = resolve;
          });
        }
        expect(url.pathname).toBe('/api/projects/p1/presence');
        const present = url.searchParams.get('fresh') === '1'
          ? [{ memberId: 'viewer' }, { memberId: 'teammate' }]
          : [{ memberId: 'viewer' }];
        return Promise.resolve(
          new Response(JSON.stringify({ present }), { status: 200 }),
        );
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'viewer' },
      fetch: fetchImpl,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveHeartbeat).toBeTypeOf('function');

    // The hub event arrives while the authoritative heartbeat is in flight.
    // An ordinary daemon GET would return its stale-while-revalidate cache and
    // the shared generation fence would then discard the heartbeat response.
    await client.refreshPresence();
    resolveHeartbeat(
      new Response(
        JSON.stringify({
          present: [{ memberId: 'viewer' }, { memberId: 'teammate' }],
        }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(client.getSnapshot().present).toEqual([
      { memberId: 'viewer' },
      { memberId: 'teammate' },
    ]);
    client.stop();
  });

  it('keeps known display metadata only for members retained by a sparse roster', async () => {
    const rosters = [
      [
        {
          memberId: 'viewer',
          name: 'Viewer',
          role: 'admin',
          avatarUrl: 'https://example.test/viewer.png',
        },
        {
          memberId: 'teammate',
          name: 'Teammate',
          role: 'member',
          avatarUrl: 'https://example.test/teammate.png',
        },
        {
          memberId: 'departed',
          name: 'Departed',
          role: 'member',
        },
      ],
      [{ memberId: 'viewer' }, { memberId: 'teammate' }],
    ];
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ present: rosters.shift() }), {
        status: 200,
      })) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });

    await client.refreshPresence();
    await client.refreshPresence();

    expect(client.getSnapshot().present).toEqual([
      {
        memberId: 'viewer',
        name: 'Viewer',
        role: 'admin',
        avatarUrl: 'https://example.test/viewer.png',
      },
      {
        memberId: 'teammate',
        name: 'Teammate',
        role: 'member',
        avatarUrl: 'https://example.test/teammate.png',
      },
    ]);
  });

  it('does not let an older presence read overwrite a newer roster', async () => {
    const presenceReads: Array<(response: Response) => void> = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        expect(pathname).toBe('/api/projects/p1/presence');
        return new Promise<Response>((resolve) => {
          presenceReads.push(resolve);
        });
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });

    const olderRefresh = client.refreshPresence();
    const newerRefresh = client.refreshPresence();
    expect(presenceReads).toHaveLength(2);

    presenceReads[1]!(
      new Response(
        JSON.stringify({ present: [{ memberId: 'new-member' }] }),
        { status: 200 },
      ),
    );
    await newerRefresh;
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'new-member' },
    ]);

    presenceReads[0]!(
      new Response(
        JSON.stringify({ present: [{ memberId: 'stale-member' }] }),
        { status: 200 },
      ),
    );
    await olderRefresh;
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'new-member' },
    ]);
  });

  it('does not let an older heartbeat response overwrite a newer presence read', async () => {
    let resolveHeartbeat!: (response: Response) => void;
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
              { status: 200 },
            ),
          );
        }
        if (pathname.endsWith('/presence/heartbeat')) {
          return new Promise<Response>((resolve) => {
            resolveHeartbeat = resolve;
          });
        }
        expect(pathname).toBe('/api/projects/p1/presence');
        return Promise.resolve(
          new Response(
            JSON.stringify({ present: [{ memberId: 'new-member' }] }),
            { status: 200 },
          ),
        );
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1' },
      fetch: fetchImpl,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolveHeartbeat).toBeTypeOf('function');

    await client.refreshPresence();
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'new-member' },
    ]);

    resolveHeartbeat(
      new Response(
        JSON.stringify({ present: [{ memberId: 'stale-member' }] }),
        { status: 200 },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().present).toEqual([
      { memberId: 'new-member' },
    ]);

    client.stop();
  });

  it('does not apply a presence read that resolves after stop', async () => {
    let resolvePresence!: (response: Response) => void;
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
              { status: 200 },
            ),
          );
        }
        expect(pathname).toBe('/api/projects/p1/presence');
        return new Promise<Response>((resolve) => {
          resolvePresence = resolve;
        });
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: null,
      fetch: fetchImpl,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    const refresh = client.refreshPresence();
    client.stop();
    resolvePresence(
      new Response(
        JSON.stringify({ present: [{ memberId: 'late-member' }] }),
        { status: 200 },
      ),
    );
    await refresh;

    expect(client.getSnapshot().present).toEqual([]);
  });

  it('does not let a stopped session leave remove a replacement session for the same member', async () => {
    const leases = new Map<string, string>();
    const heartbeatBodies: Array<Record<string, unknown>> = [];
    const pendingLeaves: Array<() => void> = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        if (pathname.endsWith('/collab/status')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
              { status: 200 },
            ),
          );
        }
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const memberId = String(body.memberId);
        const clientId =
          typeof body.clientId === 'string' ? body.clientId : memberId;
        if (pathname.endsWith('/presence/heartbeat')) {
          heartbeatBodies.push(body);
          leases.set(clientId, memberId);
          return Promise.resolve(
            new Response(JSON.stringify({ present: [{ memberId }] }), {
              status: 200,
            }),
          );
        }
        expect(pathname).toBe('/api/projects/p1/presence/leave');
        return new Promise<Response>((resolve) => {
          pendingLeaves.push(() => {
            leases.delete(clientId);
            resolve(
              new Response(JSON.stringify({ ok: true, present: [] }), {
                status: 200,
              }),
            );
          });
        });
      },
    ) as unknown as typeof fetch;
    const member = { memberId: 'member-1' };
    const oldClient = new CollabClient({
      projectId: 'p1',
      member,
      fetch: fetchImpl,
    });
    const replacementClient = new CollabClient({
      projectId: 'p1',
      member,
      fetch: fetchImpl,
    });

    oldClient.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeatBodies).toHaveLength(1);

    oldClient.stop();
    expect(pendingLeaves).toHaveLength(1);
    replacementClient.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeatBodies).toHaveLength(2);

    pendingLeaves.shift()!();
    await vi.advanceTimersByTimeAsync(0);

    expect(heartbeatBodies[0]!.clientId).not.toBe(
      heartbeatBodies[1]!.clientId,
    );
    expect(leases.size).toBe(1);

    replacementClient.stop();
    pendingLeaves.shift()!();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('reports author changes and requests a publish through the sync routes', async () => {
    const { fetchImpl, calls } = makeFetch();
    const client = new CollabClient({ projectId: 'p9', member: { memberId: 'm1' }, fetch: fetchImpl });

    await client.reportChange();
    await client.requestPublish();

    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/p9/collab/changed'))).toBe(true);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/p9/collab/publish'))).toBe(true);
  });

  it('sends leave and stops polling on stop', async () => {
    const { fetchImpl, calls } = makeFetch();
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1' },
      fetch: fetchImpl,
      heartbeatMs: 10_000,
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    client.stop();
    await vi.advanceTimersByTimeAsync(0);

    const heartbeat = calls.find((call) =>
      call.url.endsWith('/presence/heartbeat'),
    );
    const leave = calls.find((call) => call.url.endsWith('/presence/leave'));
    expect(leave?.method).toBe('POST');
    expect(leave?.body).toMatchObject({
      memberId: 'm1',
      clientId: expect.any(String),
      sequence: 2,
    });
    expect((leave?.body as { clientId: string }).clientId).toBe(
      (heartbeat?.body as { clientId: string }).clientId,
    );
    expect(heartbeat?.body).toMatchObject({ sequence: 1 });

    const afterStop = calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.length).toBe(afterStop); // timers cleared — no further polling
  });

  it('does not send leave when stop happens before any heartbeat attempt', async () => {
    const paths: string[] = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        paths.push(pathname);
        return Promise.resolve(
          new Response(
            JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
            { status: 200 },
          ),
        );
      },
    ) as unknown as typeof fetch;
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1' },
      fetch: fetchImpl,
    });

    client.start();
    client.stop();
    await vi.advanceTimersByTimeAsync(0);

    expect(paths.some((path) => path.endsWith('/presence/heartbeat'))).toBe(false);
    expect(paths.some((path) => path.endsWith('/presence/leave'))).toBe(false);
  });

  it('leaveBeacon delivers the same session lease via sendBeacon so it survives page unload', async () => {
    const { fetchImpl, calls } = makeFetch();
    const beacons: Array<{ url: string; body: Promise<string> }> = [];
    const sendBeacon = vi.fn((url: string, blob: Blob) => {
      beacons.push({ url, body: blob.text() });
      return true;
    });
    vi.stubGlobal('navigator', { sendBeacon });
    const client = new CollabClient({ projectId: 'p1', member: { memberId: 'm1' }, fetch: fetchImpl });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    client.leaveBeacon();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(beacons[0]!.url).toBe('/api/projects/p1/presence/leave');
    const heartbeat = calls.find((call) =>
      call.url.endsWith('/presence/heartbeat'),
    );
    expect(JSON.parse(await beacons[0]!.body)).toEqual({
      memberId: 'm1',
      clientId: (heartbeat?.body as { clientId: string }).clientId,
      sequence: 2,
    });
    // Beacon path used — no keepalive fetch fallback.
    expect(calls.some((c) => c.url.endsWith('/presence/leave'))).toBe(false);
    client.stop();
    await vi.advanceTimersByTimeAsync(0);
    vi.unstubAllGlobals();
  });

  it('leaveBeacon falls back to a keepalive fetch when sendBeacon is unavailable', async () => {
    const { fetchImpl, calls } = makeFetch();
    vi.stubGlobal('navigator', {});
    const client = new CollabClient({ projectId: 'p1', member: { memberId: 'm-x' }, fetch: fetchImpl });

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    client.leaveBeacon();

    const heartbeat = calls.find((c) => c.url.endsWith('/presence/heartbeat'));
    const leave = calls.find((c) => c.url.endsWith('/presence/leave'));
    expect(leave?.method).toBe('POST');
    expect(leave?.body).toMatchObject({
      memberId: 'm-x',
      clientId: (heartbeat?.body as { clientId: string }).clientId,
      sequence: 2,
    });
    vi.unstubAllGlobals();
  });

  it('surfaces status failures through onError without starting presence', async () => {
    const { fetchImpl } = makeFetch({ failPath: '/collab/status' });
    const errors: unknown[] = [];
    const client = new CollabClient({
      projectId: 'p1',
      member: { memberId: 'm1' },
      fetch: fetchImpl,
      onError: (error) => errors.push(error),
    });

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    // Without an authoritative shared-project status, presence must stay off.
    expect(client.getSnapshot().present).toEqual([]);

    client.stop();
  });

  // GET /collab/status is a plain project-keyed read — the daemon resolves the
  // caller's own identity server-side from request headers/cookies, not from
  // this payload — so a client can run status polling before it has a
  // presence identity at all. Presence (heartbeat/leave) must stay off the
  // whole time.
  describe('member-less status polling (setMember)', () => {
    it('polls status with no identity; presence starts only once setMember supplies one', async () => {
      const { fetchImpl, calls } = makeFetch({ syncState: 'synced', publishedVersion: 5 });
      const client = new CollabClient({ projectId: 'p1', member: null, fetch: fetchImpl });

      client.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(calls.some((c) => c.method === 'GET' && c.url.endsWith('/collab/status'))).toBe(true);
      expect(calls.some((c) => c.url.endsWith('/presence/heartbeat'))).toBe(false);
      expect(client.getSnapshot().publishedVersion).toBe(5);
      expect(client.getSnapshot().syncState).toBe('synced');

      client.setMember({ memberId: 'm1', name: 'Author' });
      await vi.advanceTimersByTimeAsync(0);

      const heartbeat = calls.find((c) => c.url.endsWith('/presence/heartbeat'));
      expect(heartbeat?.method).toBe('POST');
      expect(heartbeat?.body).toMatchObject({ memberId: 'm1', name: 'Author' });

      client.stop();
    });

    it('does not send a leave POST on stop when no identity was ever supplied', async () => {
      const { fetchImpl, calls } = makeFetch();
      const client = new CollabClient({ projectId: 'p1', member: null, fetch: fetchImpl });

      client.start();
      await vi.advanceTimersByTimeAsync(0);
      client.stop();
      await vi.advanceTimersByTimeAsync(0);

      expect(calls.some((c) => c.url.endsWith('/presence/leave'))).toBe(false);
    });

    it('leaveBeacon no-ops when no identity was ever supplied', () => {
      const { fetchImpl, calls } = makeFetch();
      const sendBeacon = vi.fn(() => true);
      vi.stubGlobal('navigator', { sendBeacon });
      const client = new CollabClient({ projectId: 'p1', member: null, fetch: fetchImpl });

      client.leaveBeacon();

      expect(sendBeacon).not.toHaveBeenCalled();
      expect(calls.some((c) => c.url.endsWith('/presence/leave'))).toBe(false);
      vi.unstubAllGlobals();
    });

    it('setMember(null) clears the identity and stops future heartbeats', async () => {
      const { fetchImpl, calls } = makeFetch();
      const client = new CollabClient({
        projectId: 'p1',
        member: { memberId: 'm1' },
        fetch: fetchImpl,
        heartbeatMs: 10_000,
      });

      client.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.some((c) => c.url.endsWith('/presence/heartbeat'))).toBe(true);

      client.setMember(null);
      const afterClear = calls.length;
      await vi.advanceTimersByTimeAsync(10_000);

      expect(calls.slice(afterClear).some((c) => c.url.endsWith('/presence/heartbeat'))).toBe(false);

      client.stop();
    });

    it('does not re-heartbeat same-member metadata updates but announces a new identity', async () => {
      const { fetchImpl, calls } = makeFetch({ syncState: 'synced' });
      const client = new CollabClient({
        projectId: 'p1',
        member: { memberId: 'm1', filePath: 'index.html' },
        fetch: fetchImpl,
      });

      client.start();
      await vi.advanceTimersByTimeAsync(0);
      const afterInitial = calls.filter(
        (call) => call.url.endsWith('/presence/heartbeat'),
      ).length;

      client.setMember({ memberId: 'm1', filePath: 'preview.html' });
      await vi.advanceTimersByTimeAsync(0);
      expect(
        calls.filter((call) => call.url.endsWith('/presence/heartbeat')),
      ).toHaveLength(afterInitial);

      client.setMember({ memberId: 'm2', filePath: 'preview.html' });
      await vi.advanceTimersByTimeAsync(0);
      const heartbeats = calls.filter(
        (call) => call.url.endsWith('/presence/heartbeat'),
      );
      expect(heartbeats).toHaveLength(afterInitial + 1);
      expect(heartbeats.at(-1)?.body).toMatchObject({ memberId: 'm2' });

      client.stop();
    });
  });
});
