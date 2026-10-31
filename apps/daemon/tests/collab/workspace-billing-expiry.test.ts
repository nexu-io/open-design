import type { VelaWorkspaceBillingProjection } from '../../src/integrations/vela-billing.js';
import { fetchVelaWorkspaceBillingProjection } from '../../src/integrations/vela-billing.js';
import { createWorkspaceBillingRuntimeCoordinator } from '../../src/collab/workspace-billing-runtime.js';
import { createDevWorkspaceContextProvider } from '../../src/collab/workspace-context.js';
import { registerCollabContextRoutes } from '../../src/routes/collab-context.js';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
const KEY = { workspaceId: 'space', workspaceMemberId: 'member' };
function projection(balanceUsd: string, expiresAt: string | null): VelaWorkspaceBillingProjection {
  const wallet = { balanceUsd, expiresAt, updatedAt: '2026-10-21T00:00:00.000Z' };
  return {
    snapshot: {
      schemaVersion: 1,
      ...KEY,
      billingScopeVersion: 2,
      billing: { billingState: 'free', planId: null },
      wallet,
      revisions: { billing: '1', wallet: '1' },
    },
    workspaceBalance: { ...KEY, billingScopeVersion: 2, ...wallet },
  };
}
afterEach(() => vi.useRealTimers());
describe('known wallet expiry is a cache validity boundary, not a balance calculation', () => {
  it.each([
    ['40.30', '40.00'],
    ['0.30', '0.00'],
  ])(
    'reopens the same cached %s wallet after natural gift expiry and keeps remaining %s',
    async (before, after) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-21T00:00:00.000Z'));
      const expires = Date.now() + 1000;
      let reads = 0;
      const runtime = createWorkspaceBillingRuntimeCoordinator({
        fetchProjection: async () => {
          reads++;
          return Date.now() < expires
            ? projection(before, new Date(expires).toISOString())
            : projection(after, null);
        },
      });
      try {
        await runtime.read(KEY);
        runtime.setRealtimeHealthy(KEY.workspaceId, true);
        expect(runtime.peek(KEY)?.state.softExpiresAt).toBe(new Date(expires).toISOString());
        await vi.advanceTimersByTimeAsync(999);
        expect((await runtime.read(KEY)).projection.workspaceBalance?.balanceUsd).toBe(before);
        expect(reads).toBe(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(runtime.peek(KEY)?.state.status).not.toBe('fresh');
        const result = await runtime.read(KEY);
        expect(result.projection.workspaceBalance?.balanceUsd).toBe(after);
        expect(result.projection.snapshot?.billing).toEqual({ billingState: 'free', planId: null });
        expect(reads).toBe(2);
        runtime.invalidate({ domain: 'wallet', ...KEY, revision: '1' });
        await runtime.read(KEY);
        expect(reads).toBe(2);
        expect(runtime.peek(KEY)?.projection.workspaceBalance?.balanceUsd).toBe(after);
      } finally {
        runtime.dispose();
      }
    },
  );
  it.each(['snapshot', 'workspaceBalance'] as const)(
    'honors the earliest known expiry when only %s supplies it',
    async (source) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      let calls = 0;
      const runtime = createWorkspaceBillingRuntimeCoordinator({
        fetchProjection: async () => {
          calls++;
          const value = projection(calls === 1 ? '40.30' : '40.00', null);
          if (calls === 1) {
            if (source === 'snapshot' && value.snapshot)
              value.snapshot.wallet.expiresAt = new Date(1000).toISOString();
            else if (value.workspaceBalance)
              value.workspaceBalance.expiresAt = new Date(1000).toISOString();
          }
          return value;
        },
      });
      try {
        const first = await runtime.read(KEY);
        expect(first.state.hardExpiresAt).toBe(new Date(1000).toISOString());
        await vi.advanceTimersByTimeAsync(1000);
        expect((await runtime.read(KEY)).projection.workspaceBalance?.balanceUsd).toBe('40.00');
        expect(calls).toBe(2);
      } finally {
        runtime.dispose();
      }
    },
  );
  it('the existing realtime poll suppression never suppresses a known expired wallet', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let reads = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      pollIntervalMs: 1000,
      interestLeaseMs: 10000,
      fetchProjection: async () => {
        reads++;
        return reads === 1
          ? projection('40.30', new Date(1000).toISOString())
          : projection('40.00', null);
      },
    });
    try {
      await runtime.read(KEY);
      runtime.setRealtimeHealthy(KEY.workspaceId, true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(reads).toBe(2);
      expect(runtime.peek(KEY)?.projection.workspaceBalance?.balanceUsd).toBe('40.00');
    } finally {
      runtime.dispose();
    }
  });
  it('a failed expiry refresh never re-labels expired money as fresh or calculates away ordinary funds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let unavailable = false;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      retryDelaysMs: [],
      fetchProjection: async () => {
        if (unavailable) throw Error('upstream_unavailable');
        return Date.now() < 1000
          ? projection('40.30', new Date(1000).toISOString())
          : projection('40.00', null);
      },
    });
    try {
      await runtime.read(KEY);
      unavailable = true;
      await vi.advanceTimersByTimeAsync(1000);
      const failed = await runtime.read(KEY);
      expect(failed.state.status).toBe('error');
      expect(failed.projection).toEqual({ snapshot: null, workspaceBalance: null });
      await expect(runtime.read(KEY, { requireFresh: true })).rejects.toThrow(
        'upstream_unavailable',
      );
      unavailable = false;
      expect((await runtime.read(KEY)).projection.workspaceBalance?.balanceUsd).toBe('40.00');
    } finally {
      runtime.dispose();
    }
  });
  it('a read started before expiry cannot publish already-expired money when it finishes later', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let resolve!: (value: VelaWorkspaceBillingProjection) => void;
    let reads = 0;
    const delayed = new Promise<VelaWorkspaceBillingProjection>((r) => {
      resolve = r;
    });
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      retryDelaysMs: [],
      fetchProjection: async () => (++reads === 1 ? delayed : projection('40.00', null)),
    });
    try {
      const first = runtime.read(KEY);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1000);
      resolve(projection('40.30', new Date(1000).toISOString()));
      const old = await first;
      expect(old.state.status).toBe('error');
      expect(old.projection).toEqual({ snapshot: null, workspaceBalance: null });
      expect((await runtime.read(KEY)).projection.workspaceBalance?.balanceUsd).toBe('40.00');
    } finally {
      runtime.dispose();
    }
  });
  it('keeps normal TTLs before future expiry, including the legacy wallet-only projection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let reads = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      softTtlMs: 100,
      hardTtlMs: 200,
      retryDelaysMs: [],
      fetchProjection: async () => {
        reads++;
        if (reads === 2) throw Error('temporary');
        return {
          snapshot: null,
          workspaceBalance: projection('40.00', new Date(1000).toISOString()).workspaceBalance,
        };
      },
    });
    try {
      expect((await runtime.read(KEY)).state.softExpiresAt).toBe(new Date(100).toISOString());
      await vi.advanceTimersByTimeAsync(99);
      expect((await runtime.read(KEY)).projection.workspaceBalance?.balanceUsd).toBe('40.00');
      expect(reads).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      const stale = await runtime.read(KEY);
      expect(stale.state.status).toBe('error');
      expect(stale.projection.workspaceBalance?.balanceUsd).toBe('40.00');
      await vi.advanceTimersByTimeAsync(100);
      expect(runtime.peek(KEY)?.projection.workspaceBalance).toBeNull();
    } finally {
      runtime.dispose();
    }
  });
});
async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('owned port missing');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
it.each([
  ['40.30', '40.00'],
  ['0.30', '0.00'],
])(
  'actual daemon HTTP re-open reads %s → %s after a fixed source expires under the real clock',
  async (before, after) => {
    // This one deliberately crosses the real HTTP/Date.now boundary. The source
    // expires once; no test updates its deadline or advances a simulated DB clock.
    const funds = Object.freeze({
      recharge: after,
      gift: '0.30',
      expiresAt: new Date(Date.now() + 500).toISOString(),
    });
    const original = JSON.stringify(funds);
    let reads = 0;
    const upstream = createServer((_req, res) => {
      reads++;
      const active = Date.now() < Date.parse(funds.expiresAt);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          projection(active ? before : after, active ? funds.expiresAt : null).snapshot,
        ),
      );
    });
    const upstreamUrl = await listen(upstream);
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: () =>
        fetchVelaWorkspaceBillingProjection(KEY.workspaceId, {
          run: async (args) => {
            expect(args).toEqual([
              'workspace-snapshot',
              '--workspace-id',
              'space',
              '--format',
              'json',
            ]);
            const response = await fetch(upstreamUrl, { headers: { connection: 'close' } });
            return response.text();
          },
        }),
    });
    const app = express();
    app.use(express.json());
    registerCollabContextRoutes(app, {
      workspaceContext: createDevWorkspaceContextProvider(),
      billingRuntime: runtime,
      fetchBilling: async () => null,
      listWorkspaceDirectory: async () => [
        {
          ...KEY,
          workspaceName: 'Controlled source',
          workspaceType: 'personal',
          role: 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        },
      ],
    });
    const daemon = createServer(app);
    const daemonUrl = await listen(daemon);
    const read = async () => {
      const response = await fetch(
        `${daemonUrl}/api/workspace/billing?scope=workspace&workspaceId=space`,
        {
          headers: {
            connection: 'close',
            'x-od-workspace-runtime-client-id': 'same-renderer',
            'x-od-workspace-runtime-generation': '1',
          },
        },
      );
      expect(response.status).toBe(200);
      return response.json();
    };
    try {
      const initial = await read();
      expect(initial).toMatchObject({ workspaceBalance: { balanceUsd: before } });
      runtime.setRealtimeHealthy(KEY.workspaceId, true);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(0, Date.parse(funds.expiresAt) - Date.now())),
      );
      const reopened = await read();
      expect(reopened).toMatchObject({
        workspaceBalance: { balanceUsd: after },
        workspaceRuntime: { status: 'fresh' },
        workspaceSnapshot: { billing: { billingState: 'free', planId: null } },
      });
      expect(reads).toBe(2);
      expect(JSON.stringify(funds)).toBe(original);
    } finally {
      await close(daemon);
      runtime.dispose();
      await close(upstream);
    }
  },
);
