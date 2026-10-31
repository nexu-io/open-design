import { describe, expect, it } from 'vitest';
import { buildWorkspacePermissions } from '../src/api/collab.js';

describe('workspace invite permissions', () => {
  it.each(['owner', 'admin', 'member'] as const)('allows active %s to invite', (role) => {
    expect(buildWorkspacePermissions({ role, lifecycleState: 'active' }).canInviteMembers).toBe(true);
  });

  it.each(['locked', 'deleted'] as const)('does not invite from a %s workspace', (lifecycleState) => {
    expect(buildWorkspacePermissions({ role: 'member', lifecycleState }).canInviteMembers).toBe(false);
  });

  it('does not invite with a removed membership', () => {
    expect(buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active', memberStatus: 'removed' }).canInviteMembers).toBe(false);
  });
});
