import { describe, expect, it } from 'vitest';

import { resolveLocalProjectWorkspaceScope } from '../../src/collab/project-workspace-scope.js';

describe('resolveLocalProjectWorkspaceScope', () => {
  it('resolves a Team project entirely from its persisted local binding', () => {
    expect(resolveLocalProjectWorkspaceScope({
      projectId: 'project-team',
      binding: {
        workspaceId: 'workspace-team',
        visibility: 'team',
        createdByWorkspaceMemberId: 'creator-member',
      },
    })).toMatchObject({
      kind: 'team',
      projectId: 'project-team',
      workspaceId: 'workspace-team',
      visibility: 'team',
      context: {
        workspaceId: 'workspace-team',
        workspaceType: 'team',
        workspaceMemberId: 'creator-member',
        memberStatus: 'active',
        lifecycleState: 'active',
      },
    });
  });

  it('uses an exact request member without trusting stale role or permission claims', () => {
    expect(resolveLocalProjectWorkspaceScope({
      projectId: 'project-team',
      binding: {
        workspaceId: 'workspace-team',
        visibility: 'team',
        createdByWorkspaceMemberId: 'creator-member',
      },
      requestWorkspaceMemberId: 'request-member',
      requestWorkspaceType: 'team',
    })).toMatchObject({
      kind: 'team',
      context: {
        workspaceMemberId: 'request-member',
        role: 'member',
        memberStatus: 'active',
        lifecycleState: 'active',
      },
    });
  });

  it('uses the daemon type registry for a private project in a known Team Workspace', () => {
    expect(resolveLocalProjectWorkspaceScope({
      projectId: 'project-private-team',
      binding: {
        workspaceId: 'workspace-team',
        visibility: 'personal',
        createdByWorkspaceMemberId: 'creator-member',
      },
      knownWorkspaceType: 'team',
    })).toMatchObject({
      kind: 'team',
      visibility: 'personal',
      context: { workspaceType: 'team' },
    });
  });

  it('falls back to Personal for an unknown historical private binding', () => {
    expect(resolveLocalProjectWorkspaceScope({
      projectId: 'project-private',
      binding: {
        workspaceId: 'workspace-private',
        visibility: 'personal',
      },
    })).toMatchObject({
      kind: 'personal',
      context: {
        workspaceType: 'personal',
        workspaceMemberId: 'local-user',
      },
    });
  });

  it('keeps a frozen project readable while local write permissions stay disabled', () => {
    expect(resolveLocalProjectWorkspaceScope({
      projectId: 'project-frozen',
      binding: {
        workspaceId: 'workspace-team',
        visibility: 'team',
        resourceState: 'frozen',
      },
    })).toMatchObject({
      kind: 'team',
      context: {
        lifecycleState: 'locked',
        permissions: {
          canShareProjects: false,
          canWriteSyncedFiles: false,
        },
      },
    });
  });

  it('preserves a genuinely unbound project without login or directory state', () => {
    expect(resolveLocalProjectWorkspaceScope({
      projectId: 'project-unbound',
      binding: null,
    })).toEqual({
      kind: 'unbound',
      projectId: 'project-unbound',
      workspaceId: null,
      context: null,
    });
  });
});
