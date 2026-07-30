import { describe, expect, it } from 'vitest';

import {
  resolveProjectWorkspaceScope,
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

  it('fails closed while the exact workspace lifecycle is not active', () => {
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

    expect(scope).toEqual({
      kind: 'unavailable',
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      visibility: 'personal',
      context: null,
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
