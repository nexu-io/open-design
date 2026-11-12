import { describe, expect, it } from 'vitest';
import { resolveLocalProjectCommentWorkspaceContext } from '../../src/collab/project-comment-workspace-context.js';
import { resolveOptionalLocalWorkspaceRequestAuthority } from '../../src/collab/workspace-resource-mutation.js';

const binding = { workspaceId: 'workspace-a', visibility: 'team', resourceState: 'active', createdByWorkspaceMemberId: 'creator' };
function local(workspaceId?: string, memberId?: string, workspaceType?: 'personal' | 'team') {
  return resolveOptionalLocalWorkspaceRequestAuthority({
    get: (name: string) => ({ 'x-od-workspace-id': workspaceId, 'x-od-workspace-member-id': memberId, 'x-od-workspace-type': workspaceType }[name]),
  });
}

describe('MEM-5276CF5002 local comment caller identity', () => {
  it.each(['creator', null])('never invents the %s author when request identity is absent', (creator) => {
    expect(resolveLocalProjectCommentWorkspaceContext({
      binding: { ...binding, createdByWorkspaceMemberId: creator }, revoked: false,
      local: local(),
    })).toMatchObject({ ok: false, status: 400, code: 'WORKSPACE_CONTEXT_REQUIRED' });
  });

  it('keeps unbound local-only projects available without a member identity', () => {
    expect(resolveLocalProjectCommentWorkspaceContext({
      binding: undefined, revoked: false, local: local(),
    })).toEqual({ ok: true, context: null });
  });

  it('attributes a team mirror to the actual caller without adopting project creation', () => {
    expect(resolveLocalProjectCommentWorkspaceContext({
      binding: { ...binding, createdByWorkspaceMemberId: null }, revoked: false,
      local: local('workspace-a', 'member-b', 'team'),
    })).toMatchObject({ ok: true, context: { workspaceId: 'workspace-a', workspaceMemberId: 'member-b', workspaceType: 'team' } });
  });

  it('keeps a shared Personal project in its actual workspace type', () => {
    expect(resolveLocalProjectCommentWorkspaceContext({
      binding: { ...binding, createdByWorkspaceMemberId: null }, revoked: false,
      local: local('workspace-a', 'member-b', 'personal'),
    })).toMatchObject({ ok: true, context: { workspaceId: 'workspace-a', workspaceMemberId: 'member-b', workspaceType: 'personal' } });
  });

  it('denies cross-space and private-project identities', () => {
    for (const input of [
      { binding, local: local('workspace-b', 'member-b') },
      { binding: { ...binding, visibility: 'personal' }, local: local('workspace-a', 'member-b') },
    ]) {
      expect(resolveLocalProjectCommentWorkspaceContext({ ...input, revoked: false }))
        .toMatchObject({ ok: false, status: 403 });
    }
    expect(resolveLocalProjectCommentWorkspaceContext({
      binding: { ...binding, visibility: 'personal' }, revoked: false,
      local: local('workspace-a', 'creator'),
    })).toMatchObject({ ok: true, context: { workspaceMemberId: 'creator', workspaceType: 'personal' } });
  });
});
