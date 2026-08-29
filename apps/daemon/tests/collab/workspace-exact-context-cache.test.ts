import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

import { createWorkspaceExactContextCache } from '../../src/collab/workspace-exact-context-cache.js';

const context = (workspaceId: string): WorkspaceCollabContext =>
  ({ workspaceId, workspaceMemberId: `member-${workspaceId}` }) as WorkspaceCollabContext;

describe('workspace exact context cache', () => {
  it('never caches in legacy health and reuses only a healthy exact scope', async () => {
    let calls = 0;
    const cache = createWorkspaceExactContextCache({
      identity: () => 'account-a',
      provider: {
        current: async () => null,
        resolveExact: async ({ workspaceId }) => {
          calls += 1;
          return context(workspaceId);
        },
      },
    });

    await cache.provider.resolveExact?.({ workspaceId: 'w1' });
    await cache.provider.resolveExact?.({ workspaceId: 'w1' });
    expect(calls).toBe(2);

    cache.setRealtimeHealthy('w1', true);
    await cache.provider.resolveExact?.({ workspaceId: 'w1' });
    expect(calls).toBe(2);
    await cache.provider.resolveExact?.({ workspaceId: 'w2' });
    expect(calls).toBe(3);
  });

  it('invalidates on health loss and cannot cross a credential identity', async () => {
    let identity = 'account-a';
    let calls = 0;
    const cache = createWorkspaceExactContextCache({
      identity: () => identity,
      provider: {
        current: async () => null,
        resolveExact: async ({ workspaceId }) => {
          calls += 1;
          return context(workspaceId);
        },
      },
    });

    await cache.refresh({ workspaceId: 'w1' });
    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1')).toMatchObject({ workspaceId: 'w1' });

    identity = 'account-b';
    expect(cache.cached('w1')).toBeNull();
    await cache.provider.resolveExact?.({ workspaceId: 'w1' });
    expect(calls).toBe(2);

    cache.setRealtimeHealthy('w1', false);
    expect(cache.cached('w1')).toBeNull();
  });

  it('does not let a pre-invalidation response seed the next generation', async () => {
    let resolve!: (value: WorkspaceCollabContext) => void;
    const held = new Promise<WorkspaceCollabContext>((done) => {
      resolve = done;
    });
    const cache = createWorkspaceExactContextCache({
      identity: () => 'account-a',
      provider: {
        current: async () => null,
        resolveExact: async () => held,
      },
    });

    const old = cache.refresh({ workspaceId: 'w1' });
    cache.invalidate('w1');
    resolve(context('w1'));
    await old;
    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1')).toBeNull();
  });

  it('reports a healthy lease hit as one suppressed current request', async () => {
    let now = 1_000;
    const onDecision = vi.fn();
    const onSuppressedRequest = vi.fn();
    const cache = createWorkspaceExactContextCache({
      identity: () => 'account-a',
      now: () => now,
      onDecision,
      onSuppressedRequest,
      provider: {
        current: async () => null,
        resolveExact: async ({ workspaceId }) => context(workspaceId),
      },
    });

    await cache.refresh({ workspaceId: 'w1' });
    cache.setRealtimeHealthy('w1', true);
    now += 250;
    expect(cache.cached('w1')).toMatchObject({ workspaceId: 'w1' });
    expect(onDecision).toHaveBeenLastCalledWith({
      source: 'cache',
      reason: 'lease_hit',
      outcome: 'allow',
      ageMs: 250,
    });
    expect(onSuppressedRequest).toHaveBeenCalledOnce();
  });

  it('reseats a healthy lease after a routine event invalidation', async () => {
    let calls = 0;
    const cache = createWorkspaceExactContextCache({
      identity: () => 'account-a',
      provider: {
        current: async () => null,
        resolveExact: async ({ workspaceId }) => {
          calls += 1;
          return context(workspaceId);
        },
      },
    });

    cache.setRealtimeHealthy('w1', true);
    await cache.refresh({ workspaceId: 'w1' });
    expect(cache.cached('w1')).toMatchObject({ workspaceId: 'w1' });

    cache.invalidate('w1', 'event_dirty');
    expect(cache.cached('w1')).toBeNull();
    await cache.refresh({ workspaceId: 'w1' });

    expect(calls).toBe(2);
    expect(cache.cached('w1')).toMatchObject({ workspaceId: 'w1' });

    cache.invalidate('w1', 'auth_reject');
    await cache.refresh({ workspaceId: 'w1' });
    expect(calls).toBe(3);
    expect(cache.cached('w1')).toBeNull();
  });

  it('refetches account A after an A to B to A identity reset with no intervening read', async () => {
    let identity = 'account-a';
    let calls = 0;
    const cache = createWorkspaceExactContextCache({
      identity: () => identity,
      provider: {
        current: async () => null,
        resolveExact: async ({ workspaceId }) => {
          calls += 1;
          return context(workspaceId);
        },
      },
    });
    await cache.refresh({ workspaceId: 'w1' });
    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1')).not.toBeNull();

    identity = 'account-b';
    cache.resetIdentity();
    identity = 'account-a';
    cache.resetIdentity();

    cache.setRealtimeHealthy('w1', true);
    await expect(cache.provider.resolveExact?.({ workspaceId: 'w1' }))
      .resolves.toMatchObject({ workspaceId: 'w1' });
    expect(calls).toBe(2);
  });

  it('fences an account A response that settles after an A to B to A identity reset', async () => {
    let identity = 'account-a';
    let release!: (value: WorkspaceCollabContext) => void;
    const blocked = new Promise<WorkspaceCollabContext>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const cache = createWorkspaceExactContextCache({
      identity: () => identity,
      provider: {
        current: async () => null,
        resolveExact: async ({ workspaceId }) => {
          calls += 1;
          return calls === 1 ? blocked : context(workspaceId);
        },
      },
    });

    const staleAccountARead = cache.refresh({ workspaceId: 'w1' });
    cache.setRealtimeHealthy('w1', true);
    identity = 'account-b';
    cache.resetIdentity();
    identity = 'account-a';
    cache.resetIdentity();

    release(context('w1'));
    await staleAccountARead;
    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1')).toBeNull();

    await cache.provider.resolveExact?.({ workspaceId: 'w1' });
    expect(calls).toBe(2);
    expect(cache.cached('w1')).not.toBeNull();
  });
});
