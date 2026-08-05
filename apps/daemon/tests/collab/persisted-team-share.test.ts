import { describe, expect, it } from 'vitest';
import { recoverPersistedTeamShareOwnership } from '../../src/collab/persisted-team-share.js';

describe('recoverPersistedTeamShareOwnership', () => {
  it('does not restore a consumer mirror updater as the project owner after restart', () => {
    expect(
      recoverPersistedTeamShareOwnership({
        projectId: 'shared-project',
        workspaceId: 'team-workspace',
        createdByWorkspaceMemberId: null,
        updatedByWorkspaceMemberId: 'viewer-member',
      }),
    ).toBeNull();
  });

  it('restores the persisted creator without letting a later updater replace it', () => {
    expect(
      recoverPersistedTeamShareOwnership({
        projectId: 'owned-project',
        workspaceId: 'team-workspace',
        createdByWorkspaceMemberId: 'owner-member',
        updatedByWorkspaceMemberId: 'viewer-member',
      }),
    ).toEqual({
      projectId: 'owned-project',
      principal: {
        memberId: 'owner-member',
        teamId: 'team-workspace',
        role: 'member',
        lifecycleState: 'active',
      },
    });
  });
});
