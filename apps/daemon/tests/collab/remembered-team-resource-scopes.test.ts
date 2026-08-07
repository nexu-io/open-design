import { describe, expect, it, vi } from 'vitest';

import { createRememberedTeamResourceScopes } from '../../src/collab/remembered-team-resource-scopes.js';
import type { TeamResourceRequestScope } from '../../src/collab/team-resource-share.js';

function scope(
  workspaceId: string,
  memberId: string,
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

describe('remembered Team resource scopes', () => {
  it('uses lease pruning without allocating a timer per principal', () => {
    vi.useFakeTimers();
    try {
      const remembered = createRememberedTeamResourceScopes();
      remembered.remember(scope('workspace-a', 'member-a'));
      remembered.remember(scope('workspace-b', 'member-b'));

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds the production default to 64 remembered principals', () => {
    const remembered = createRememberedTeamResourceScopes({ now: () => 0 });
    const scopes = Array.from({ length: 65 }, (_, index) =>
      scope(`workspace-${index}`, `member-${index}`));

    for (const principalScope of scopes) remembered.remember(principalScope);

    expect(remembered.has(scopes[0]!)).toBe(false);
    expect(remembered.has(scopes[64]!)).toBe(true);
    expect(remembered.activeWorkspaceLeases()).toHaveLength(64);
  });

  it('bounds remembered principals with LRU eviction while de-duplicating workspace polls', () => {
    let now = 0;
    const remembered = createRememberedTeamResourceScopes({
      maxEntries: 2,
      leaseMs: 1_000,
      now: () => now,
    });
    const first = scope('workspace-a', 'member-a');
    const second = scope('workspace-a', 'member-b');
    const third = scope('workspace-b', 'member-c');

    remembered.remember(first);
    now += 1;
    remembered.remember(second);
    now += 1;
    remembered.remember(third);

    expect(remembered.has(first)).toBe(false);
    expect(remembered.has(second)).toBe(true);
    expect(remembered.has(third)).toBe(true);
    expect(remembered.activeWorkspaceLeases().map((lease) => lease.workspaceId))
      .toEqual(['workspace-a', 'workspace-b']);
  });

  it('renews a warm principal lease and cold-loads it again after expiry', () => {
    let now = 0;
    const remembered = createRememberedTeamResourceScopes({
      leaseMs: 100,
      now: () => now,
    });
    const principalScope = scope('workspace-a', 'member-a');

    remembered.remember(principalScope);
    now = 99;
    remembered.remember(principalScope);
    now = 198;
    expect(remembered.activeWorkspaceLeases()).toHaveLength(1);

    now = 199;
    expect(remembered.activeWorkspaceLeases()).toEqual([]);

    remembered.remember(principalScope);
    expect(remembered.activeWorkspaceLeases()).toHaveLength(1);
  });

  it('invalidates an in-flight lease token when the scope expires or is evicted', () => {
    let now = 0;
    const remembered = createRememberedTeamResourceScopes({
      maxEntries: 1,
      leaseMs: 100,
      now: () => now,
    });
    const first = scope('workspace-a', 'member-a');
    remembered.remember(first);
    const expiredLease = remembered.activeWorkspaceLeases()[0]!;

    now = 100;
    expect(remembered.isLeaseCurrent(expiredLease)).toBe(false);
    expect(remembered.has(first)).toBe(false);

    remembered.remember(first);
    const evictedLease = remembered.activeWorkspaceLeases()[0]!;
    remembered.remember(scope('workspace-b', 'member-b'));
    expect(remembered.isLeaseCurrent(evictedLease)).toBe(false);

    // Re-access is a new foreground lease; neither late token becomes current.
    remembered.remember(first);
    expect(remembered.isLeaseCurrent(expiredLease)).toBe(false);
    expect(remembered.isLeaseCurrent(evictedLease)).toBe(false);
    expect(remembered.activeWorkspaceLeases()[0]?.workspaceId).toBe('workspace-a');
  });
});
