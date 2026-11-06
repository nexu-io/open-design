import { describe, expect, it, vi } from 'vitest';
import { createShouldPublish } from '../src/collab/should-publish.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

const ACTIVE_OWNER_PRINCIPAL: ResourceHubPrincipal = {
  teamId: 't1',
  memberId: 'owner-1',
  role: 'owner',
  lifecycleState: 'active',
  workspaceType: 'team',
};

describe('createShouldPublish', () => {
  it('watches an owned, team-shared project when the owner is an active member', async () => {
    const rememberTeamShare = vi.fn();
    const resolveProjectPrincipal = vi.fn(async () => ACTIVE_OWNER_PRINCIPAL);
    const shouldPublish = createShouldPublish({
      resolveSharedProjectOwner: async () => 'owner-1',
      resolveProjectPrincipal,
      rememberTeamShare,
      hasUnmaterializedPlaceholder: () => false,
    });

    expect(await shouldPublish('p1')).toEqual(ACTIVE_OWNER_PRINCIPAL);
    expect(resolveProjectPrincipal).toHaveBeenCalledWith('p1');
    expect(rememberTeamShare).toHaveBeenCalledTimes(1);
    const [projectId, principal] = rememberTeamShare.mock.calls[0] as [string, ResourceHubPrincipal];
    expect(projectId).toBe('p1');
    expect(principal.memberId).toBe('owner-1');
  });

  it('refuses to watch once exact project scope no longer resolves an active member', async () => {
    const rememberTeamShare = vi.fn();
    const shouldPublish = createShouldPublish({
      resolveSharedProjectOwner: async () => 'owner-1',
      resolveProjectPrincipal: async () => null,
      rememberTeamShare,
      hasUnmaterializedPlaceholder: () => false,
    });

    expect(await shouldPublish('p1')).toBe(false);
    expect(rememberTeamShare).not.toHaveBeenCalled();
  });

  it('refuses when the project has no shared-project owner at all', async () => {
    const shouldPublish = createShouldPublish({
      resolveSharedProjectOwner: async () => null,
      resolveProjectPrincipal: async () => ACTIVE_OWNER_PRINCIPAL,
      rememberTeamShare: vi.fn(),
      hasUnmaterializedPlaceholder: () => false,
    });

    expect(await shouldPublish('p1')).toBe(false);
  });

  it('refuses when this daemon is not the project owner (a member’s read-only pull)', async () => {
    const rememberTeamShare = vi.fn();
    const shouldPublish = createShouldPublish({
      resolveSharedProjectOwner: async () => 'someone-else',
      resolveProjectPrincipal: async () => ACTIVE_OWNER_PRINCIPAL,
      rememberTeamShare,
      hasUnmaterializedPlaceholder: () => false,
    });

    expect(await shouldPublish('p1')).toBe(false);
    expect(rememberTeamShare).not.toHaveBeenCalled();
  });

  it('refuses when the project principal cannot be resolved at all (signed out)', async () => {
    const shouldPublish = createShouldPublish({
      resolveSharedProjectOwner: async () => 'owner-1',
      resolveProjectPrincipal: async () => null,
      rememberTeamShare: vi.fn(),
      hasUnmaterializedPlaceholder: () => false,
    });

    expect(await shouldPublish('p1')).toBe(false);
  });

  it('refuses an unmaterialized shared-project placeholder even when the hub names this member as owner (recvqzaDvUU6B3)', async () => {
    const rememberTeamShare = vi.fn();
    const resolveSharedProjectOwner = vi.fn(async () => 'owner-1');
    const shouldPublish = createShouldPublish({
      resolveSharedProjectOwner,
      resolveProjectPrincipal: async () => ACTIVE_OWNER_PRINCIPAL,
      rememberTeamShare,
      hasUnmaterializedPlaceholder: (projectId) => projectId === 'placeholder-1',
    });

    expect(await shouldPublish('placeholder-1')).toBe(false);
    expect(rememberTeamShare).not.toHaveBeenCalled();
    // The guard answers before any hub round-trip.
    expect(resolveSharedProjectOwner).not.toHaveBeenCalled();
  });
});
