import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollabClient, type CollabSnapshot } from '../src/collab/collab-client.js';
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
  present?: Array<{ memberId: string; name?: string }>;
  publishedVersion?: number | null;
  syncState?: string | null;
  failPath?: string;
}

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
      url: '/api/projects/p1/presence',
      method: 'GET',
    });
    expect(calls[0]!.headers.get('x-od-workspace-id')).toBe(
      TEAM_CONTEXT.workspaceId,
    );
    expect(client.getSnapshot().present).toEqual(state.present);
    expect(calls.some((call) => call.url.endsWith('/presence/heartbeat'))).toBe(false);
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

    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/presence/leave'))).toBe(true);

    const afterStop = calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.length).toBe(afterStop); // timers cleared — no further polling
  });

  it('leaveBeacon delivers the leave via sendBeacon so it survives page unload', () => {
    const { fetchImpl, calls } = makeFetch();
    const beacons: Array<{ url: string; body: string }> = [];
    const sendBeacon = vi.fn((url: string, blob: Blob) => {
      // Blob.text() is async; the daemon parses the JSON body, so record the URL
      // and mark it delivered. Body shape is asserted via the fallback test.
      beacons.push({ url, body: String((blob as unknown as { type: string }).type) });
      return true;
    });
    vi.stubGlobal('navigator', { sendBeacon });
    const client = new CollabClient({ projectId: 'p1', member: { memberId: 'm1' }, fetch: fetchImpl });

    client.leaveBeacon();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(beacons[0]!.url).toBe('/api/projects/p1/presence/leave');
    // Beacon path used — no keepalive fetch fallback.
    expect(calls.some((c) => c.url.endsWith('/presence/leave'))).toBe(false);
    vi.unstubAllGlobals();
  });

  it('leaveBeacon falls back to a keepalive fetch when sendBeacon is unavailable', () => {
    const { fetchImpl, calls } = makeFetch();
    vi.stubGlobal('navigator', {});
    const client = new CollabClient({ projectId: 'p1', member: { memberId: 'm-x' }, fetch: fetchImpl });

    client.leaveBeacon();

    const leave = calls.find((c) => c.url.endsWith('/presence/leave'));
    expect(leave?.method).toBe('POST');
    expect(leave?.body).toEqual({ memberId: 'm-x' });
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
