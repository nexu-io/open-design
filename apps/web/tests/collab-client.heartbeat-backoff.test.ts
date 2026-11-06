// Red spec for the packaged-client presence 502 storm (heartbeat half).
//
// A packaged client left open on a shared project whose collab upstream is in
// a persistent rejection state used to fire a heartbeat POST every 10 seconds
// forever — several hours of that is ~2050 DevTools errors plus a spawned CLI
// process per beat on the daemon side. Presence heartbeats must keep retrying
// (the upstream can recover at any time), but consecutive failures have to
// widen the interval instead of hammering a dead endpoint at full cadence.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollabClient } from '../src/collab/collab-client.js';
import { workspaceContextFixture } from './helpers/workspace-context';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-viewer',
});

const TEST_NOW = Date.parse('2026-08-05T00:00:00.000Z');

interface HeartbeatFetchState {
  /** Heartbeat responses fail while callCount < failFirst (Infinity = always). */
  failFirst: number;
  heartbeatTimes: number[];
}

function makeHeartbeatFetch(failFirst: number) {
  const state: HeartbeatFetchState = { failFirst, heartbeatTimes: [] };
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://daemon.local').pathname;
    if (pathname.endsWith('/presence/heartbeat')) {
      state.heartbeatTimes.push(Date.now() - TEST_NOW);
      if (state.heartbeatTimes.length <= state.failFirst) {
        return {
          ok: false,
          status: 502,
          json: async () => ({ error: 'collab_presence_unavailable' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ present: [{ memberId: 'member-viewer' }] }),
      } as unknown as Response;
    }
    if (pathname.endsWith('/collab/status')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ publishedVersion: 1, syncState: 'synced' }),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, present: [] }),
    } as unknown as Response;
  }) as typeof fetch;
  return { fetchImpl, state };
}

function startClient(fetchImpl: typeof fetch): CollabClient {
  const client = new CollabClient({
    projectId: 'p1',
    member: { memberId: 'member-viewer', name: 'Viewer' },
    workspaceContext: TEAM_CONTEXT,
    fetch: fetchImpl,
  });
  client.start();
  return client;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TEST_NOW);
  // Pin backoff jitter to its midpoint so scheduled beats are deterministic.
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('CollabClient heartbeat backoff', () => {
  it('backs off instead of heartbeating every 10s against a persistently failing upstream', async () => {
    const { fetchImpl, state } = makeHeartbeatFetch(Number.POSITIVE_INFINITY);
    const client = startClient(fetchImpl);

    // Ten minutes of a persistently failing upstream. The fixed 10s interval
    // produced ~61 failed heartbeats here; exponential backoff capped at five
    // minutes must keep it to a handful.
    await vi.advanceTimersByTimeAsync(600_000);
    client.stop();

    expect(state.heartbeatTimes.length).toBeLessThanOrEqual(12);
  });

  it('returns to the base cadence after one successful heartbeat', async () => {
    const { fetchImpl, state } = makeHeartbeatFetch(3);
    const client = startClient(fetchImpl);

    await vi.advanceTimersByTimeAsync(600_000);
    client.stop();

    // Recovery must not stay stuck at the backed-off interval: once a beat
    // succeeds, the next beats run at (roughly) the 10s base again.
    const firstSuccessIndex = 3; // the fourth beat succeeds by construction
    const afterRecovery = state.heartbeatTimes.slice(firstSuccessIndex);
    expect(afterRecovery.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < Math.min(afterRecovery.length, 4); i += 1) {
      const gap = afterRecovery[i]! - afterRecovery[i - 1]!;
      expect(gap).toBeLessThanOrEqual(12_000);
    }
  });
});
