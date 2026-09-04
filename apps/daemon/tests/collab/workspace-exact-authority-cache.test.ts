import { describe, expect, it } from 'vitest';
import type { WorkspaceDirectoryItem } from '@open-design/contracts';

import { createWorkspaceExactAuthorityCache } from '../../src/collab/workspace-exact-authority-cache.js';

const item = (
  workspaceId: string,
  workspaceMemberId = `member-${workspaceId}`,
): WorkspaceDirectoryItem => ({
  workspaceId,
  workspaceName: workspaceId,
  workspaceType: 'team',
  workspaceMemberId,
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
});

describe('workspace exact authority cache', () => {
  it('reuses only a directory-observed row with a healthy exact-scope grant', () => {
    const cache = createWorkspaceExactAuthorityCache({
      identity: () => 'account-a',
    });
    cache.observe('account-a', [item('w1'), item('w2')]);

    expect(cache.cached('w1', 'member-w1')).toBeNull();
    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1', 'member-w1')).toMatchObject({ workspaceId: 'w1' });
    expect(cache.cached('w2', 'member-w2')).toBeNull();
  });

  it('expires, invalidates, and never crosses credential identity', () => {
    let identity = 'account-a';
    let now = 0;
    const cache = createWorkspaceExactAuthorityCache({
      identity: () => identity,
      ttlMs: 100,
      now: () => now,
    });
    cache.observe('account-a', [item('w1')]);
    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1', 'member-w1')).not.toBeNull();

    identity = 'account-b';
    expect(cache.cached('w1', 'member-w1')).toBeNull();
    cache.observe('account-a', [item('w1')]);
    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1', 'member-w1')).toBeNull();
    identity = 'account-a';
    expect(cache.cached('w1', 'member-w1')).toBeNull();
    cache.setRealtimeHealthy('w1', true);
    now = 100;
    expect(cache.cached('w1', 'member-w1')).toBeNull();

    now = 0;
    cache.observe('account-a', [item('w1')]);
    expect(cache.cached('w1', 'member-w1')).not.toBeNull();
    cache.invalidate('w1');
    expect(cache.cached('w1', 'member-w1')).toBeNull();
  });

  it('retires rows omitted by a later complete directory snapshot', () => {
    const cache = createWorkspaceExactAuthorityCache({
      identity: () => 'account-a',
    });
    cache.observe('account-a', [item('w1'), item('w2')]);
    cache.setRealtimeHealthy('w1', true);
    cache.observe('account-a', [item('w2')]);

    expect(cache.cached('w1', 'member-w1')).toBeNull();
  });

  it('does not revive account A after an A to B to A identity reset with no intervening read', () => {
    let identity = 'account-a';
    const cache = createWorkspaceExactAuthorityCache({
      identity: () => identity,
    });
    cache.observe(identity, [item('w1')]);
    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1', 'member-w1')).not.toBeNull();

    identity = 'account-b';
    cache.resetIdentity();
    identity = 'account-a';
    cache.resetIdentity();

    cache.setRealtimeHealthy('w1', true);
    expect(cache.cached('w1', 'member-w1')).toBeNull();
  });
});
