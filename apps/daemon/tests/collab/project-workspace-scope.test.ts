import { describe, expect, it } from 'vitest';

import {
  resolveProjectWorkspaceScope,
  resolveProjectWorkspaceScopeBootstrap,
} from '../../src/collab/project-workspace-scope.js';

const directoryItems = [
  {
    workspaceId: 'workspace-b',
    workspaceName: 'Workspace B',
    workspaceType: 'team' as const,
    workspaceMemberId: 'member-b',
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
  },
  {
    workspaceId: 'workspace-a',
    workspaceName: 'Workspace A',
    workspaceType: 'team' as const,
    workspaceMemberId: 'member-a',
    role: 'owner' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
  },
];

describe('resolveProjectWorkspaceScope', () => {
  it('resolves the project binding rather than the first or active directory workspace', () => {
    const scope = resolveProjectWorkspaceScope({
      projectId: 'project-a',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'personal',
      },
      directory: { ok: true, items: directoryItems },
    });

    expect(scope).toMatchObject({
      kind: 'team',
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      visibility: 'personal',
      context: {
        workspaceId: 'workspace-a',
        workspaceType: 'team',
        workspaceMemberId: 'member-a',
      },
    });
  });

  it('tags a personal binding as account billing even though it has a workspace id', () => {
    const scope = resolveProjectWorkspaceScope({
      projectId: 'project-personal',
      binding: {
        workspaceId: 'workspace-personal',
        visibility: 'personal',
      },
      directory: {
        ok: true,
        items: [{
          workspaceId: 'workspace-personal',
          workspaceName: 'Personal',
          workspaceType: 'personal',
          workspaceMemberId: 'member-personal',
          role: 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        }],
      },
    });

    expect(scope).toMatchObject({
      kind: 'personal',
      workspaceId: 'workspace-personal',
      context: {
        workspaceType: 'personal',
        workspaceMemberId: 'member-personal',
      },
    });
  });

  it('does not fall back to another workspace when directory membership is unavailable', () => {
    const scope = resolveProjectWorkspaceScope({
      projectId: 'project-a',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'team',
      },
      directory: { ok: false, items: directoryItems },
    });

    expect(scope).toEqual({
      kind: 'unavailable',
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      visibility: 'team',
      context: null,
    });
  });

  it('keeps locked/frozen workspaces readable while write permissions stay disabled', () => {
    const scope = resolveProjectWorkspaceScope({
      projectId: 'project-a',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'personal',
      },
      directory: {
        ok: true,
        items: [{
          ...directoryItems[1]!,
          lifecycleState: 'locked',
        }],
      },
    });

    expect(scope).toMatchObject({
      kind: 'team',
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      visibility: 'personal',
      context: {
        lifecycleState: 'locked',
        permissions: {
          canShareProjects: false,
          canWriteSyncedFiles: false,
        },
      },
    });
  });

  it('reports a truly unbound legacy project without borrowing ambient scope', () => {
    const scope = resolveProjectWorkspaceScope({
      projectId: 'project-legacy',
      binding: null,
      directory: { ok: true, items: directoryItems },
    });

    expect(scope).toEqual({
      kind: 'unbound',
      projectId: 'project-legacy',
      workspaceId: null,
      context: null,
    });
  });
});

describe('resolveProjectWorkspaceScopeBootstrap', () => {
  it('returns project A from its exact membership even when ambient-order B is first', () => {
    expect(resolveProjectWorkspaceScopeBootstrap({
      projectId: 'project-a',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'active',
      },
      directory: { ok: true, items: directoryItems },
    })).toMatchObject({
      ok: true,
      scope: {
        kind: 'team',
        projectId: 'project-a',
        workspaceId: 'workspace-a',
        context: {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-a',
        },
      },
    });
  });

  it('fails closed when the current account is not a member of the persisted workspace', () => {
    expect(resolveProjectWorkspaceScopeBootstrap({
      projectId: 'project-a',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'active',
      },
      directory: { ok: true, items: [directoryItems[0]!] },
    })).toEqual({
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
      message: 'workspace project read is not allowed',
    });
  });

  it('distinguishes a directory outage from revoked membership', () => {
    expect(resolveProjectWorkspaceScopeBootstrap({
      projectId: 'project-a',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'active',
      },
      directory: { ok: false, items: [] },
    })).toEqual({
      ok: false,
      status: 503,
      code: 'WORKSPACE_DIRECTORY_UNAVAILABLE',
      message: 'workspace membership directory is unavailable',
    });
  });

  it.each([
    { memberStatus: 'removed' as const, lifecycleState: 'active' as const },
    { memberStatus: 'active' as const, lifecycleState: 'deleted' as const },
  ])('rejects a revoked or deleted membership: %o', (membership) => {
    expect(resolveProjectWorkspaceScopeBootstrap({
      projectId: 'project-a',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'active',
      },
      directory: {
        ok: true,
        items: [{ ...directoryItems[1]!, ...membership }],
      },
    })).toMatchObject({
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
    });
  });

  it('rejects a deleted persisted resource before returning its binding', () => {
    expect(resolveProjectWorkspaceScopeBootstrap({
      projectId: 'project-a',
      binding: {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'deleted',
      },
      directory: { ok: true, items: directoryItems },
    })).toMatchObject({
      ok: false,
      status: 403,
      code: 'WORKSPACE_PROJECT_PERMISSION_DENIED',
    });
  });

  it('preserves a genuinely unbound local project without requiring login', () => {
    expect(resolveProjectWorkspaceScopeBootstrap({
      projectId: 'legacy-local',
      binding: null,
      directory: { ok: false, items: [] },
    })).toEqual({
      ok: true,
      scope: {
        kind: 'unbound',
        projectId: 'legacy-local',
        workspaceId: null,
        context: null,
      },
    });
  });
});
