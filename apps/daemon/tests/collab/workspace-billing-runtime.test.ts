import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VelaWorkspaceBillingProjection } from '../../src/integrations/vela-billing.js';
import {
  createWorkspaceBillingRuntimeCoordinator,
  shouldEmitWorkspaceBillingRuntimeNudge,
} from '../../src/collab/workspace-billing-runtime.js';

const KEY_A = { workspaceId: 'workspace-a', workspaceMemberId: 'member-a' };
const KEY_B = { workspaceId: 'workspace-b', workspaceMemberId: 'member-b' };

afterEach(() => {
  vi.useRealTimers();
});

function projection(
  workspaceId: string,
  workspaceMemberId: string,
  balanceUsd: string,
  billingRevision = '1',
  walletRevision = '1',
  planId: string | null = 'team_plus',
  revisionClocks?: {
    billing: { epoch: string; counter: string };
    wallet: { epoch: string; counter: string };
  },
): VelaWorkspaceBillingProjection {
  return {
    snapshot: {
      schemaVersion: 1,
      workspaceId,
      workspaceMemberId,
      billingScopeVersion: 2,
      billing: { billingState: planId ? 'active' : 'free', planId },
      wallet: {
        balanceUsd,
        expiresAt: null,
        updatedAt: '2026-07-27T00:00:00.000Z',
      },
      revisions: { billing: billingRevision, wallet: walletRevision },
      ...(revisionClocks ? { revisionClocks } : {}),
    },
    workspaceBalance: {
      workspaceId,
      workspaceMemberId,
      billingScopeVersion: 2,
      balanceUsd,
      expiresAt: null,
      updatedAt: '2026-07-27T00:00:00.000Z',
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('WorkspaceBillingRuntimeCoordinator', () => {
  it('makes A → B → A generations wait for the newest trailing A read', async () => {
    const firstA = deferred<VelaWorkspaceBillingProjection>();
    let aCalls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) => {
        if (key.workspaceId === 'workspace-b') {
          return projection('workspace-b', 'member-b', '2.00');
        }
        aCalls += 1;
        return aCalls === 1
          ? firstA.promise
          : projection('workspace-a', 'member-a', '3.00', '3', '3');
      },
    });

    const oldA = runtime.read(KEY_A, {
      clientId: 'window-1',
      clientGeneration: '1',
    });
    await vi.waitFor(() => expect(aCalls).toBe(1));
    const b = await runtime.read(KEY_B, {
      clientId: 'window-1',
      clientGeneration: '2',
    });
    expect(b.projection.workspaceBalance?.balanceUsd).toBe('2.00');

    const latestA = runtime.read(KEY_A, {
      clientId: 'window-1',
      clientGeneration: '3',
    });
    firstA.resolve(projection('workspace-a', 'member-a', '1.00'));

    await expect(latestA).resolves.toMatchObject({
      projection: { workspaceBalance: { balanceUsd: '3.00' } },
      state: { workspaceId: 'workspace-a', status: 'fresh' },
    });
    await expect(oldA).resolves.toMatchObject({
      projection: { workspaceBalance: { balanceUsd: '3.00' } },
    });
    expect(aCalls).toBe(2);
    runtime.dispose();
  });

  it('dedupes duplicate and out-of-order revisions and catches up a gap', async () => {
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          String(calls),
          calls === 1 ? '1' : '4',
          '1',
        );
      },
    });
    await runtime.read(KEY_A);

    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: '1',
    });
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: '0',
    });
    await Promise.resolve();
    expect(calls).toBe(1);

    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: '4',
    });
    const caughtUp = await runtime.read(KEY_A);
    expect(calls).toBe(2);
    expect(caughtUp.state).toMatchObject({
      status: 'fresh',
      reason: 'revision-gap',
      sourceGapDetected: true,
    });
    runtime.dispose();
  });

  it('dedupes and detects gaps within one revision-clock epoch', async () => {
    let calls = 0;
    let counter = '1';
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          counter,
          `billing:v1:${counter}`,
          'wallet:v1:1',
          'team_plus',
          {
            billing: { epoch: 'billing-epoch-a', counter },
            wallet: { epoch: 'wallet-epoch-a', counter: '1' },
          },
        );
      },
    });
    await runtime.read(KEY_A);

    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: { epoch: 'billing-epoch-a', counter: '1' },
    });
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:0',
      revisionClock: { epoch: 'billing-epoch-a', counter: '0' },
    });
    await Promise.resolve();
    expect(calls).toBe(1);

    counter = '4';
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:4',
      revisionClock: { epoch: 'billing-epoch-a', counter: '4' },
    });
    const caughtUp = await runtime.read(KEY_A);
    expect(calls).toBe(2);
    expect(caughtUp.state).toMatchObject({
      status: 'fresh',
      reason: 'revision-gap',
      sourceGapDetected: true,
    });
    runtime.dispose();
  });

  it('accepts a counter reset after a revision-clock epoch change', async () => {
    let clock = { epoch: 'billing-epoch-a', counter: '9' };
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          String(calls),
          `billing:v1:${clock.counter}`,
          'wallet:v1:1',
          'team_plus',
          {
            billing: clock,
            wallet: { epoch: 'wallet-epoch-a', counter: '1' },
          },
        );
      },
    });
    await runtime.read(KEY_A);

    clock = { epoch: 'billing-epoch-b', counter: '1' };
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: clock,
    });
    const refreshed = await runtime.read(KEY_A);

    expect(calls).toBe(2);
    expect(refreshed.state).toMatchObject({
      status: 'fresh',
      reason: 'revision-epoch-change',
      sourceGapDetected: false,
    });
    runtime.dispose();
  });

  it('rebases to a fenced authoritative snapshot that has advanced beyond the event epoch', async () => {
    let clock = { epoch: 'billing-epoch-a', counter: '9' };
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          String(calls),
          `billing:v1:${clock.counter}`,
          'wallet:v1:1',
          'team_plus',
          {
            billing: clock,
            wallet: { epoch: 'wallet-epoch-a', counter: '1' },
          },
        );
      },
    });
    await runtime.read(KEY_A);

    // The producer's fenced snapshot has already crossed C by the time the B
    // event reaches this consumer.
    clock = { epoch: 'billing-epoch-c', counter: '1' };
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: { epoch: 'billing-epoch-b', counter: '1' },
    });
    const rebased = await runtime.read(KEY_A);

    expect(rebased).toMatchObject({
      projection: {
        snapshot: {
          revisionClocks: {
            billing: { epoch: 'billing-epoch-c', counter: '1' },
          },
        },
      },
      state: {
        status: 'fresh',
        errorCode: null,
        sourceGapDetected: false,
      },
    });

    // The legacy alias for the B write can arrive after the C snapshot has
    // already committed. B is now a retired fence and must not regress the
    // accepted C baseline or schedule another projection read.
    runtime.invalidate({
      domain: 'legacy',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: { epoch: 'billing-epoch-b', counter: '1' },
    });
    await Promise.resolve();
    expect(runtime.peek(KEY_A)?.state).toMatchObject({
      status: 'fresh',
      errorCode: null,
    });
    expect(calls).toBe(2);

    runtime.reconnect('workspace-a');
    const afterReconnect = await runtime.read(KEY_A);
    expect(afterReconnect.state).toMatchObject({
      status: 'fresh',
      errorCode: null,
      reason: 'reconnect',
    });
    expect(calls).toBe(3);
    runtime.dispose();
  });

  it('rejects an authoritative reconnect snapshot from a retired revision epoch', async () => {
    vi.useFakeTimers();
    let clock = { epoch: 'billing-epoch-a', counter: '9' };
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          String(calls),
          `billing:v1:${clock.counter}`,
          'wallet:v1:1',
          'team_plus',
          {
            billing: clock,
            wallet: { epoch: 'wallet-epoch-a', counter: '1' },
          },
        );
      },
    });

    await runtime.read(KEY_A);

    clock = { epoch: 'billing-epoch-b', counter: '1' };
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: clock,
    });
    await runtime.read(KEY_A);

    clock = { epoch: 'billing-epoch-c', counter: '1' };
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: clock,
    });
    const current = await runtime.read(KEY_A);
    expect(current).toMatchObject({
      projection: {
        snapshot: {
          revisionClocks: {
            billing: { epoch: 'billing-epoch-c', counter: '1' },
          },
        },
      },
      state: { status: 'fresh', errorCode: null },
    });

    // An authoritative reconnect can lag behind the already accepted C fence.
    // B is retired even though its counter is numerically newer, so it must
    // fail closed and preserve the last-good C projection.
    clock = { epoch: 'billing-epoch-b', counter: '99' };
    runtime.reconnect('workspace-a');
    const afterReconnect = await runtime.read(KEY_A);

    expect(afterReconnect).toMatchObject({
      projection: {
        snapshot: {
          revisionClocks: {
            billing: { epoch: 'billing-epoch-c', counter: '1' },
          },
        },
      },
      state: {
        status: 'error',
        errorCode: 'workspace_billing_revision_not_caught_up',
        reason: 'reconnect',
        retryAt: expect.any(String),
      },
    });
    expect(calls).toBe(4);

    clock = { epoch: 'billing-epoch-c', counter: '2' };
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(calls).toBe(5));
    expect(runtime.peek(KEY_A)).toMatchObject({
      projection: {
        snapshot: {
          revisionClocks: {
            billing: { epoch: 'billing-epoch-c', counter: '2' },
          },
        },
      },
      state: {
        status: 'fresh',
        errorCode: null,
        reason: 'bounded-retry',
        retryAt: null,
      },
    });
    runtime.dispose();
  });

  it('rejects a direct authoritative refresh from a retired revision epoch', async () => {
    let clock = { epoch: 'billing-epoch-a', counter: '9' };
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          String(calls),
          `billing:v1:${clock.counter}`,
          'wallet:v1:1',
          'team_plus',
          {
            billing: clock,
            wallet: { epoch: 'wallet-epoch-a', counter: '1' },
          },
        );
      },
      retryDelaysMs: [],
    });

    await runtime.read(KEY_A);

    clock = { epoch: 'billing-epoch-b', counter: '1' };
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: clock,
    });
    await runtime.read(KEY_A);

    clock = { epoch: 'billing-epoch-c', counter: '1' };
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: clock,
    });
    await runtime.read(KEY_A);

    clock = { epoch: 'billing-epoch-b', counter: '99' };
    runtime.refreshAll('authoritative-refresh');
    const afterRefresh = await runtime.read(KEY_A);

    expect(afterRefresh).toMatchObject({
      projection: {
        snapshot: {
          revisionClocks: {
            billing: { epoch: 'billing-epoch-c', counter: '1' },
          },
        },
      },
      state: {
        status: 'error',
        errorCode: 'workspace_billing_revision_not_caught_up',
        reason: 'authoritative-refresh',
      },
    });
    expect(calls).toBe(4);
    runtime.dispose();
  });

  it('rejects a fenced read that remains on the pre-event authoritative epoch', async () => {
    let clock = { epoch: 'billing-epoch-a', counter: '9' };
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          String(calls),
          `billing:v1:${clock.counter}`,
          'wallet:v1:1',
          'team_plus',
          {
            billing: clock,
            wallet: { epoch: 'wallet-epoch-a', counter: '1' },
          },
        );
      },
      retryDelaysMs: [],
    });
    await runtime.read(KEY_A);

    clock = { epoch: 'billing-epoch-a', counter: '10' };
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:1',
      revisionClock: { epoch: 'billing-epoch-b', counter: '1' },
    });
    const stale = await runtime.read(KEY_A);

    expect(stale).toMatchObject({
      projection: {
        snapshot: {
          revisionClocks: {
            billing: { epoch: 'billing-epoch-a', counter: '9' },
          },
        },
      },
      state: {
        status: 'error',
        errorCode: 'workspace_billing_revision_not_caught_up',
      },
    });
    runtime.reconnect('workspace-a');
    const afterReconnect = await runtime.read(KEY_A);
    expect(afterReconnect.state).toMatchObject({
      status: 'error',
      errorCode: 'workspace_billing_revision_not_caught_up',
    });
    expect(calls).toBe(3);
    runtime.dispose();
  });

  it('dedupes clocked subscription and legacy aliases across billing domains', async () => {
    for (const domains of [
      ['subscription', 'legacy'],
      ['legacy', 'subscription'],
    ] as const) {
      let clock = { epoch: 'billing-epoch-a', counter: '1' };
      let calls = 0;
      const runtime = createWorkspaceBillingRuntimeCoordinator({
        fetchProjection: async () => {
          calls += 1;
          return projection(
            'workspace-a',
            'member-a',
            String(calls),
            `billing:v1:${clock.counter}`,
            'wallet:v1:1',
            'team_plus',
            {
              billing: clock,
              wallet: { epoch: 'wallet-epoch-a', counter: '1' },
            },
          );
        },
      });
      await runtime.read(KEY_A);

      clock = { epoch: 'billing-epoch-b', counter: '1' };
      for (const domain of domains) {
        runtime.invalidate({
          domain,
          workspaceId: 'workspace-a',
          revision: 'billing:v1:1',
          revisionClock: clock,
        });
      }
      await runtime.read(KEY_A);

      expect(calls).toBe(2);
      runtime.dispose();
    }
  });

  it('keeps unclocked subscription and legacy aliases as independent compatibility invalidations', async () => {
    let revision = 'billing:v1:1';
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          String(calls),
          revision,
          'wallet:v1:1',
        );
      },
    });
    await runtime.read(KEY_A);

    revision = 'billing:v1:2';
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision,
    });
    runtime.invalidate({
      domain: 'legacy',
      workspaceId: 'workspace-a',
      revision,
    });
    await runtime.read(KEY_A);

    expect(calls).toBe(3);
    runtime.dispose();
  });

  it('requires a clocked snapshot to catch up to the accepted event clock', async () => {
    vi.useFakeTimers();
    let counter = '1';
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          counter,
          `billing:v1:${counter}`,
          'wallet:v1:1',
          'team_plus',
          {
            billing: { epoch: 'billing-epoch-a', counter },
            wallet: { epoch: 'wallet-epoch-a', counter: '1' },
          },
        );
      },
    });
    await runtime.read(KEY_A);

    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: 'billing:v1:2',
      revisionClock: { epoch: 'billing-epoch-a', counter: '2' },
    });
    const behind = await runtime.read(KEY_A);
    expect(behind.state).toMatchObject({
      status: 'error',
      errorCode: 'workspace_billing_revision_not_caught_up',
    });

    counter = '2';
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(calls).toBe(3));
    expect(runtime.peek(KEY_A)?.state.status).toBe('fresh');
    runtime.dispose();
  });

  it('keeps prefixed legacy revisions opaque when no valid clock is available', async () => {
    let revision = 'billing:v1:9';
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          String(calls),
          revision,
          'wallet:v1:1',
        );
      },
    });
    await runtime.read(KEY_A);

    revision = 'billing:v1:1';
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision,
      revisionClock: { epoch: '', counter: '-1' },
    });
    const refreshed = await runtime.read(KEY_A);

    expect(calls).toBe(2);
    expect(refreshed.state).toMatchObject({
      status: 'fresh',
      sourceGapDetected: false,
    });
    runtime.dispose();
  });

  it('uses the 30 second daemon floor to recover a lost SSE invalidation', async () => {
    vi.useFakeTimers();
    let balance = '1.00';
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection('workspace-a', 'member-a', balance);
      },
    });
    await runtime.read(KEY_A);
    balance = '2.00';

    await vi.advanceTimersByTimeAsync(29_999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(calls).toBe(2));
    expect(runtime.peek(KEY_A)?.projection.workspaceBalance?.balanceUsd).toBe('2.00');
    runtime.dispose();
  });

  it('polls only the exact workspace/member interests still owned by clients', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) => {
        calls.push(key.workspaceId);
        return projection(key.workspaceId, key.workspaceMemberId, '1.00');
      },
    });

    await runtime.read(KEY_A, {
      clientId: 'window-1',
      clientGeneration: '1',
    });
    await runtime.read(KEY_B, {
      clientId: 'window-1',
      clientGeneration: '2',
    });
    expect(calls).toEqual(['workspace-a', 'workspace-b']);

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls).toEqual(['workspace-a', 'workspace-b', 'workspace-b']);
    runtime.dispose();
  });

  it('forces an authoritative catch-up after reconnect', async () => {
    let balance = '1.00';
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection('workspace-a', 'member-a', balance);
      },
    });
    await runtime.read(KEY_A);
    balance = '2.00';

    runtime.reconnect('workspace-a');
    await runtime.read(KEY_A);
    expect(calls).toBe(2);
    expect(runtime.peek(KEY_A)?.projection.workspaceBalance?.balanceUsd).toBe('2.00');
    runtime.dispose();
  });

  it('retries when an event revision arrives before the read model catches up', async () => {
    vi.useFakeTimers();
    let revision = '1';
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection('workspace-a', 'member-a', revision, revision, revision);
      },
    });
    await runtime.read(KEY_A);

    runtime.invalidate({
      domain: 'wallet',
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      revision: '2',
    });
    const staleRead = await runtime.read(KEY_A);
    expect(staleRead.state).toMatchObject({
      status: 'error',
      errorCode: 'workspace_billing_revision_not_caught_up',
    });
    revision = '2';
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(calls).toBe(3));
    expect(runtime.peek(KEY_A)).toMatchObject({
      projection: { workspaceBalance: { balanceUsd: '2' } },
      state: { status: 'fresh' },
    });
    runtime.dispose();
  });

  it('starts a new daemon runtime stale-free after a long offline interval', async () => {
    vi.useFakeTimers();
    let balance = '1.00';
    let calls = 0;
    const createRuntime = () =>
      createWorkspaceBillingRuntimeCoordinator({
        fetchProjection: async () => {
          calls += 1;
          return projection('workspace-a', 'member-a', balance);
        },
      });

    const beforeOffline = createRuntime();
    await beforeOffline.read(KEY_A);
    beforeOffline.dispose();
    balance = '9.00';
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000);

    const afterOffline = createRuntime();
    const result = await afterOffline.read(KEY_A);
    expect(calls).toBe(2);
    expect(result.projection.workspaceBalance?.balanceUsd).toBe('9.00');
    expect(result.state.status).toBe('fresh');
    afterOffline.dispose();
  });

  it('does not serialize simultaneous windows interested in different workspaces', async () => {
    const heldA = deferred<VelaWorkspaceBillingProjection>();
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) =>
        key.workspaceId === 'workspace-a'
          ? heldA.promise
          : projection('workspace-b', 'member-b', '8.00'),
    });

    const a = runtime.read(KEY_A, {
      clientId: 'window-a',
      clientGeneration: '1',
    });
    const b = await runtime.read(KEY_B, {
      clientId: 'window-b',
      clientGeneration: '1',
    });
    expect(b.projection.workspaceBalance?.balanceUsd).toBe('8.00');

    heldA.resolve(projection('workspace-a', 'member-a', '7.00'));
    await expect(a).resolves.toMatchObject({
      projection: { workspaceBalance: { balanceUsd: '7.00' } },
    });
    runtime.dispose();
  });

  it('clears sensitive data on member removal and refreshes a plan invalidation', async () => {
    let planId: string | null = 'team_plus';
    let billingRevision = '1';
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection(
          'workspace-a',
          'member-a',
          '4.00',
          billingRevision,
          '1',
          planId,
        );
      },
    });
    await runtime.read(KEY_A);

    runtime.revokeWorkspace('workspace-a');
    expect(runtime.peek(KEY_A)).toMatchObject({
      projection: { snapshot: null, workspaceBalance: null },
      state: { status: 'access-revoked', errorCode: 'workspace_not_authorized' },
    });
    expect(runtime.interestedKeys()).toEqual([]);

    runtime.authorizeWorkspaceMember(KEY_A);
    await runtime.read(KEY_A);
    planId = 'team_max';
    billingRevision = '9';
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: '9',
    });
    const refreshed = await runtime.read(KEY_A);
    expect(refreshed.projection.snapshot?.billing.planId).toBe('team_max');
    expect(calls).toBe(3);
    runtime.dispose();
  });

  it('cannot commit an in-flight pre-revoke response after reauthorization', async () => {
    const stale = deferred<VelaWorkspaceBillingProjection>();
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return calls === 1
          ? stale.promise
          : projection('workspace-a', 'member-a', '8.00');
      },
    });
    const first = runtime.read(KEY_A);
    await vi.waitFor(() => expect(calls).toBe(1));

    runtime.revokeWorkspace('workspace-a');
    runtime.authorizeWorkspaceMember(KEY_A);
    const reauthorized = runtime.read(KEY_A);
    await vi.waitFor(() => expect(calls).toBe(2));
    stale.resolve(projection('workspace-a', 'member-a', '1.00'));

    await expect(reauthorized).resolves.toMatchObject({
      projection: { workspaceBalance: { balanceUsd: '8.00' } },
      state: { status: 'fresh' },
    });
    expect((await first).projection.workspaceBalance?.balanceUsd).not.toBe('1.00');
    runtime.dispose();
  });

  it('never revives access-revoked state from invalidation, reconnect, or poll', async () => {
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection('workspace-a', 'member-a', String(calls));
      },
    });
    await runtime.read(KEY_A);
    runtime.revokeWorkspace('workspace-a');

    runtime.invalidate({
      domain: 'wallet',
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      revision: '99',
    });
    runtime.reconnect('workspace-a');
    runtime.refreshAll('poll-floor');
    await Promise.resolve();

    expect(calls).toBe(1);
    expect(runtime.peek(KEY_A)).toMatchObject({
      projection: { snapshot: null, workspaceBalance: null },
      state: { status: 'access-revoked' },
    });
    runtime.dispose();
  });

  it('treats a snapshot-only projection as refreshable last-good data', async () => {
    const held = deferred<VelaWorkspaceBillingProjection>();
    let calls = 0;
    const snapshotOnly = {
      ...projection('workspace-a', 'member-a', '0.00'),
      workspaceBalance: null,
    };
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return calls === 1 ? snapshotOnly : held.promise;
      },
    });
    await runtime.read(KEY_A);
    runtime.invalidate({
      domain: 'subscription',
      workspaceId: 'workspace-a',
      revision: '2',
    });

    expect(runtime.peek(KEY_A)).toMatchObject({
      projection: { snapshot: { workspaceId: 'workspace-a' }, workspaceBalance: null },
      state: { status: 'refreshing' },
    });
    held.resolve({
      ...projection('workspace-a', 'member-a', '0.00', '2'),
      workspaceBalance: null,
    });
    await runtime.read(KEY_A);
    runtime.dispose();
  });

  it('retries transient failures with a bounded schedule and keeps the floor', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error('temporary outage'), { code: 'temporary' });
        return projection('workspace-a', 'member-a', '5.00');
      },
      retryDelaysMs: [5_000, 15_000, 30_000],
    });

    const first = await runtime.read(KEY_A);
    expect(first.state).toMatchObject({ status: 'error', errorCode: 'temporary' });
    expect(first.state.retryAt).not.toBeNull();
    const webReadAfterErrorSignal = await runtime.read(KEY_A);
    expect(webReadAfterErrorSignal.state.status).toBe('error');
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(calls).toBe(2));
    expect(runtime.peek(KEY_A)?.state.status).toBe('error');

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(calls).toBe(3));
    expect(runtime.peek(KEY_A)).toMatchObject({
      projection: { workspaceBalance: { balanceUsd: '5.00' } },
      state: { status: 'fresh', retryAt: null },
    });
    runtime.dispose();
  });

  it('requires a live authoritative projection for an execution read', async () => {
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        if (calls === 1) return projection('workspace-a', 'member-a', '9.00');
        throw Object.assign(new Error('temporary outage'), { code: 'temporary' });
      },
      retryDelaysMs: [],
    });

    await runtime.read(KEY_A);
    await expect(runtime.read(KEY_A, {
      reason: 'authoritative-action-read',
      requireFresh: true,
    })).rejects.toMatchObject({ code: 'temporary' });
    expect(runtime.peek(KEY_A)).toMatchObject({
      state: { status: 'error', errorCode: 'temporary' },
    });
    expect(runtime.peek(KEY_A)?.projection.workspaceBalance?.balanceUsd).toBe('9.00');
    expect(calls).toBe(2);
    runtime.dispose();
  });

  it('publishes every freshness transition and expires last-good data at the hard TTL', async () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    let calls = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        if (calls === 1) return projection('workspace-a', 'member-a', '9.00');
        throw Object.assign(new Error('temporary outage'), { code: 'temporary' });
      },
      retryDelaysMs: [],
      softTtlMs: 100,
      hardTtlMs: 200,
      onStateChange: (state) => statuses.push(state.status),
    });

    await runtime.read(KEY_A);
    await vi.advanceTimersByTimeAsync(101);
    const softExpired = await runtime.read(KEY_A);
    expect(softExpired).toMatchObject({
      projection: { workspaceBalance: { balanceUsd: '9.00' } },
      state: { status: 'error' },
    });
    expect(statuses).toEqual(expect.arrayContaining([
      'loading',
      'fresh',
      'stale',
      'refreshing',
      'error',
    ]));

    await vi.advanceTimersByTimeAsync(100);
    expect(runtime.peek(KEY_A)).toMatchObject({
      projection: { snapshot: null, workspaceBalance: null },
      state: { status: 'error' },
    });
    runtime.dispose();
  });

  it('does not turn a terminal-state nudge into an event-read-event loop', async () => {
    let calls = 0;
    let revision = '1';
    let runtime!: ReturnType<typeof createWorkspaceBillingRuntimeCoordinator>;
    const nudgeReads: Promise<unknown>[] = [];
    runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        calls += 1;
        return projection('workspace-a', 'member-a', revision, revision, revision);
      },
      onStateChange: (state) => {
        if (shouldEmitWorkspaceBillingRuntimeNudge(state)) {
          nudgeReads.push(runtime.read(KEY_A));
        }
      },
    });
    await runtime.read(KEY_A, { reason: 'explicit-read' });
    revision = '2';
    runtime.invalidate({
      domain: 'wallet',
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      revision: '2',
      reason: 'vela-wallet-balance-changed',
    });
    await runtime.read(KEY_A);
    await Promise.all(nudgeReads);

    expect(calls).toBe(2);
    expect(nudgeReads).toHaveLength(1);
    runtime.dispose();
  });

  it('does not double-nudge the web after one upstream billing event', async () => {
    let revision = '1';
    let projectionCalls = 0;
    let downstreamNudges = 0;
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => {
        projectionCalls += 1;
        return projection(
          'workspace-a',
          'member-a',
          revision,
          revision,
          revision,
        );
      },
      onStateChange: (state) => {
        if (shouldEmitWorkspaceBillingRuntimeNudge(state)) downstreamNudges += 1;
      },
    });
    await runtime.read(KEY_A, { reason: 'explicit-billing-read' });

    revision = '2';
    runtime.invalidate({
      domain: 'wallet',
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      revision,
      reason: 'vela-wallet-balance-changed',
    });
    // The hub event path already emits its compatibility nudge directly.
    downstreamNudges += 1;
    await runtime.read(KEY_A);

    expect(projectionCalls).toBe(2);
    expect(downstreamNudges).toBe(1);

    runtime.reconnect('workspace-a');
    await runtime.read(KEY_A);
    expect(downstreamNudges).toBe(2);
    runtime.dispose();
  });

  it('accepts the old CLI projection shape and enforces client generations', async () => {
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => ({
        snapshot: null,
        workspaceBalance: projection(
          'workspace-a',
          'member-a',
          '6.00',
        ).workspaceBalance,
      }),
    });
    const first = await runtime.read(KEY_A, {
      clientId: 'window-a',
      clientGeneration: '10',
    });
    expect(first).toMatchObject({
      projection: { snapshot: null, workspaceBalance: { balanceUsd: '6.00' } },
      state: { status: 'fresh' },
    });
    await expect(
      runtime.read(KEY_A, {
        clientId: 'window-a',
        clientGeneration: '9',
      }),
    ).rejects.toMatchObject({
      code: 'stale_generation',
      acceptedGeneration: '10',
    });
    await expect(
      runtime.read(KEY_B, {
        clientId: 'window-a',
        clientGeneration: '10',
      }),
    ).rejects.toMatchObject({
      code: 'generation_payload_mismatch',
      acceptedGeneration: '10',
    });
    runtime.dispose();
  });

  it('rejects a projection that returns another workspace or member', async () => {
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async () => projection('workspace-b', 'member-b', '999.00'),
      retryDelaysMs: [],
    });
    const result = await runtime.read(KEY_A);
    expect(result).toMatchObject({
      projection: { snapshot: null, workspaceBalance: null },
      state: {
        status: 'error',
        errorCode: 'workspace_billing_scope_mismatch',
      },
    });
    runtime.dispose();
  });

  it('retains a renderer full A + B interest set and replaces it atomically', async () => {
    const interestSets: string[][] = [];
    const calls: string[] = [];
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) => {
        calls.push(key.workspaceId);
        return projection(key.workspaceId, key.workspaceMemberId, '1.00');
      },
      onInterestSetChange: (interests) => {
        interestSets.push(interests.map((interest) => interest.workspaceId).sort());
      },
    });

    const lease = runtime.setClientInterests({
      clientId: 'renderer-1',
      clientGeneration: '1',
      interests: [KEY_A, KEY_B],
    });
    expect(lease).toMatchObject({
      clientId: 'renderer-1',
      acceptedGeneration: '1',
    });
    await runtime.read(KEY_A, {
      clientId: 'renderer-1',
      clientGeneration: '1',
    });
    await runtime.read(KEY_B, {
      clientId: 'renderer-1',
      clientGeneration: '1',
    });
    expect(calls).toEqual(['workspace-a', 'workspace-b']);

    runtime.setClientInterests({
      clientId: 'renderer-1',
      clientGeneration: '2',
      interests: [KEY_B],
    });
    expect(runtime.interestedKeys()).toEqual([KEY_B]);
    expect(interestSets).toContainEqual(['workspace-a', 'workspace-b']);
    expect(interestSets.at(-1)).toEqual(['workspace-b']);
    runtime.dispose();
  });

  it('expires a crashed renderer lease and evicts its inactive snapshot', async () => {
    vi.useFakeTimers();
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) =>
        projection(key.workspaceId, key.workspaceMemberId, '1.00'),
      interestLeaseMs: 100,
      interestSweepIntervalMs: 10,
      entryRetentionMs: 20,
    });
    runtime.setClientInterests({
      clientId: 'crashed-renderer',
      clientGeneration: '1',
      interests: [KEY_A],
    });
    await runtime.read(KEY_A, {
      clientId: 'crashed-renderer',
      clientGeneration: '1',
    });
    expect(runtime.interestedKeys()).toEqual([KEY_A]);

    await vi.advanceTimersByTimeAsync(121);
    expect(runtime.interestedKeys()).toEqual([]);
    expect(runtime.peek(KEY_A)).toBeNull();
    runtime.dispose();
  });

  it('bounds clients, per-client scopes, and retained runtime entries', () => {
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) =>
        projection(key.workspaceId, key.workspaceMemberId, '1.00'),
      maxClients: 1,
      maxInterestsPerClient: 1,
      maxEntries: 1,
    });
    runtime.setClientInterests({
      clientId: 'renderer-1',
      clientGeneration: '1',
      interests: [KEY_A],
    });
    expect(() =>
      runtime.setClientInterests({
        clientId: 'renderer-2',
        clientGeneration: '1',
        interests: [KEY_B],
      }),
    ).toThrowError(expect.objectContaining({ code: 'interest_capacity_exceeded' }));
    expect(() =>
      runtime.setClientInterests({
        clientId: 'renderer-1',
        clientGeneration: '2',
        interests: [KEY_A, KEY_B],
      }),
    ).toThrowError(expect.objectContaining({ code: 'interest_capacity_exceeded' }));
    runtime.dispose();
  });

  it('does not let empty full sets consume the client cap', () => {
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) =>
        projection(key.workspaceId, key.workspaceMemberId, '1.00'),
      maxClients: 1,
    });
    runtime.setClientInterests({
      clientId: 'empty-renderer',
      clientGeneration: '1',
      interests: [],
    });
    expect(() => runtime.setClientInterests({
      clientId: 'real-renderer',
      clientGeneration: '1',
      interests: [KEY_A],
    })).not.toThrow();
    expect(runtime.interestedKeys()).toEqual([KEY_A]);
    runtime.dispose();
  });

  it('resolves a queued read when its declared interest is released', async () => {
    const active = deferred<VelaWorkspaceBillingProjection>();
    const starts: string[] = [];
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) => {
        starts.push(key.workspaceId);
        return key.workspaceId === KEY_A.workspaceId
          ? active.promise
          : projection(key.workspaceId, key.workspaceMemberId, '2.00');
      },
      maxConcurrentRefreshes: 1,
    });
    runtime.setClientInterests({
      clientId: 'renderer',
      clientGeneration: '1',
      interests: [KEY_A, KEY_B],
    });
    const first = runtime.read(KEY_A, {
      clientId: 'renderer',
      clientGeneration: '1',
    });
    await vi.waitFor(() => expect(starts).toEqual(['workspace-a']));
    const queued = runtime.read(KEY_B, {
      clientId: 'renderer',
      clientGeneration: '1',
    });
    await Promise.resolve();
    expect(starts).toEqual(['workspace-a']);

    expect(runtime.releaseClientInterests('renderer', '1')).toBe(true);
    await expect(queued).resolves.toMatchObject({
      projection: { snapshot: null, workspaceBalance: null },
      state: { workspaceId: 'workspace-b', status: 'loading' },
    });
    active.resolve(projection('workspace-a', 'member-a', '1.00'));
    await first;
    runtime.dispose();
  });

  it('resolves a queued read when its declared interest lease expires', async () => {
    vi.useFakeTimers();
    const active = deferred<VelaWorkspaceBillingProjection>();
    const starts: string[] = [];
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) => {
        starts.push(key.workspaceId);
        return key.workspaceId === KEY_A.workspaceId
          ? active.promise
          : projection(key.workspaceId, key.workspaceMemberId, '2.00');
      },
      maxConcurrentRefreshes: 1,
      interestLeaseMs: 100,
      interestSweepIntervalMs: 10,
    });
    runtime.setClientInterests({
      clientId: 'renderer',
      clientGeneration: '1',
      interests: [KEY_A, KEY_B],
    });
    const first = runtime.read(KEY_A, {
      clientId: 'renderer',
      clientGeneration: '1',
    });
    await vi.waitFor(() => expect(starts).toEqual(['workspace-a']));
    const queued = runtime.read(KEY_B, {
      clientId: 'renderer',
      clientGeneration: '1',
    });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(101);
    await expect(queued).resolves.toMatchObject({
      projection: { snapshot: null, workspaceBalance: null },
      state: { workspaceId: 'workspace-b', status: 'loading' },
    });
    active.resolve(projection('workspace-a', 'member-a', '1.00'));
    await first;
    runtime.dispose();
  });

  it('caps global projection concurrency and refresh-start churn', async () => {
    vi.useFakeTimers();
    const held = new Map<string, ReturnType<typeof deferred<VelaWorkspaceBillingProjection>>>();
    let active = 0;
    let peak = 0;
    const starts: string[] = [];
    const runtime = createWorkspaceBillingRuntimeCoordinator({
      fetchProjection: async (key) => {
        starts.push(key.workspaceId);
        active += 1;
        peak = Math.max(peak, active);
        const gate = deferred<VelaWorkspaceBillingProjection>();
        held.set(key.workspaceId, gate);
        try {
          return await gate.promise;
        } finally {
          active -= 1;
        }
      },
      maxConcurrentRefreshes: 2,
      maxRefreshStartsPerWindow: 3,
      refreshStartWindowMs: 1_000,
    });
    const keys = ['a', 'b', 'c', 'd'].map((suffix) => ({
      workspaceId: `workspace-${suffix}`,
      workspaceMemberId: `member-${suffix}`,
    }));
    const reads = keys.map((key) => runtime.read(key));

    await vi.waitFor(() => expect(starts).toHaveLength(2));
    held.get('workspace-a')!.resolve(projection('workspace-a', 'member-a', '1'));
    held.get('workspace-b')!.resolve(projection('workspace-b', 'member-b', '1'));
    await vi.waitFor(() => expect(starts).toHaveLength(3));
    held.get('workspace-c')!.resolve(projection('workspace-c', 'member-c', '1'));
    await Promise.resolve();
    expect(starts).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(starts).toHaveLength(4));
    held.get('workspace-d')!.resolve(projection('workspace-d', 'member-d', '1'));
    await Promise.all(reads);
    expect(peak).toBeLessThanOrEqual(2);
    runtime.dispose();
  });
});
