import { describe, expect, it } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  isSameWorkspacePrincipal,
  workspacePrincipalKey,
  type CollabMemberRole,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import { workspaceIdentityCacheKey } from '../../src/collab/workspace-identity';

/**
 * One member of one workspace, resolved the way production resolves it.
 *
 * Both sources build the context through `workspaceContextFromDirectoryItem` +
 * {@link buildWorkspacePermissions}, so the only input that varies between them
 * is `role`:
 *
 * - the shell (`GET /api/workspace/context`) supplies the member's real role;
 * - the project scope fast path
 *   (`GET /api/projects/:id/workspace-scope` → `resolveLocalProjectWorkspaceScope`)
 *   hardcodes `'member'` on its single branch, on purpose, because it resolves
 *   without consulting the membership directory.
 *
 * Deriving the permissions here rather than spelling them out is what keeps this
 * fixture honest: a hand-written `role: 'owner'` scope response — the shape the
 * daemon cannot produce — is what let this defect class hide behind green tests
 * six times.
 */
function contextForRole(role: CollabMemberRole): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: 'member-a',
    role,
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({
      role,
      lifecycleState: 'active',
      memberStatus: 'active',
    }),
  };
}

/** What the daemon's project scope endpoint returns, for any role whatsoever. */
const SCOPE_CONTEXT = contextForRole('member');
/** What `/api/workspace/context` returns for the same person, who owns the workspace. */
const SHELL_CONTEXT = contextForRole('owner');
/** …and for the same person when they are a plain member. */
const SHELL_CONTEXT_PLAIN_MEMBER = contextForRole('member');

describe('workspace principal identity', () => {
  // The premise. If this ever stops holding, the defect class below has changed
  // shape and every fix built on it needs re-reading.
  it('forks the two sources on role and on nothing else', () => {
    const fields = [
      'workspaceId',
      'workspaceType',
      'workspaceMemberId',
      'role',
      'memberStatus',
      'lifecycleState',
    ] as const;
    const differing = fields.filter(
      (field) => SCOPE_CONTEXT[field] !== SHELL_CONTEXT[field],
    );
    expect(differing).toEqual(['role']);
    // `canShareProjects` / `canWriteSyncedFiles` are the only permission bits in
    // the cache key, and they derive from memberStatus + lifecycleState alone —
    // so role really is the whole difference on the wire too.
    expect(SCOPE_CONTEXT.permissions.canShareProjects)
      .toBe(SHELL_CONTEXT.permissions.canShareProjects);
    expect(SCOPE_CONTEXT.permissions.canWriteSyncedFiles)
      .toBe(SHELL_CONTEXT.permissions.canWriteSyncedFiles);
  });

  // Why an identity comparison may not be written with the cache key: it is a
  // request partition, and the request genuinely differs.
  it('gives the same person two different cache keys once they are not a plain member', () => {
    expect(workspaceIdentityCacheKey(SCOPE_CONTEXT))
      .not.toBe(workspaceIdentityCacheKey(SHELL_CONTEXT));
    // …and exactly this is why the bug only ever reproduced for owners/admins.
    expect(workspaceIdentityCacheKey(SCOPE_CONTEXT))
      .toBe(workspaceIdentityCacheKey(SHELL_CONTEXT_PLAIN_MEMBER));
  });

  // The invariant every one of the four defects violated.
  it('reads both sources as the same person in the same workspace', () => {
    expect(isSameWorkspacePrincipal(SCOPE_CONTEXT, SHELL_CONTEXT)).toBe(true);
    expect(isSameWorkspacePrincipal(SHELL_CONTEXT, SCOPE_CONTEXT)).toBe(true);
    expect(workspacePrincipalKey(SCOPE_CONTEXT))
      .toBe(workspacePrincipalKey(SHELL_CONTEXT));
  });

  it('still separates a different member, workspace, or workspace type', () => {
    expect(isSameWorkspacePrincipal(
      SHELL_CONTEXT,
      { ...SCOPE_CONTEXT, workspaceMemberId: 'member-b' },
    )).toBe(false);
    expect(isSameWorkspacePrincipal(
      SHELL_CONTEXT,
      { ...SCOPE_CONTEXT, workspaceId: 'workspace-b' },
    )).toBe(false);
    expect(isSameWorkspacePrincipal(
      SHELL_CONTEXT,
      { ...SCOPE_CONTEXT, workspaceType: 'personal' },
    )).toBe(false);
  });

  // Fail-closed: two unknowns are not a person, so nothing downstream can
  // accidentally treat "no identity" as a match.
  it('never calls an absent or incomplete identity the same person', () => {
    expect(isSameWorkspacePrincipal(null, null)).toBe(false);
    expect(isSameWorkspacePrincipal(SHELL_CONTEXT, null)).toBe(false);
    expect(isSameWorkspacePrincipal(null, SHELL_CONTEXT)).toBe(false);
    expect(isSameWorkspacePrincipal(
      { ...SHELL_CONTEXT, workspaceMemberId: '  ' },
      { ...SCOPE_CONTEXT, workspaceMemberId: '  ' },
    )).toBe(false);
    expect(workspacePrincipalKey(null)).toBeNull();
    expect(workspacePrincipalKey({ ...SHELL_CONTEXT, workspaceId: '' })).toBeNull();
  });
});
