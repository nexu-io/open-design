import { describe, expect, it } from 'vitest';

import {
  resolveProjectWorkspaceScope,
  resolveProjectWorkspaceScopeForCaller,
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

describe('resolveProjectWorkspaceScopeForCaller', () => {
  it('resolves an unbound project against the caller current workspace', () => {
    const scope = resolveProjectWorkspaceScopeForCaller({
      projectId: 'project-unbound',
      binding: null,
      directory: { ok: true, items: directoryItems },
      callerWorkspaceId: 'workspace-b',
    });

    expect(scope).toMatchObject({
      kind: 'team',
      projectId: 'project-unbound',
      workspaceId: 'workspace-b',
      // An unbound project is a private local draft even inside a team.
      visibility: 'personal',
      context: {
        workspaceId: 'workspace-b',
        workspaceType: 'team',
        workspaceMemberId: 'member-b',
      },
    });
  });

  it('never lets the caller workspace override a project already pinned elsewhere', () => {
    const scope = resolveProjectWorkspaceScopeForCaller({
      projectId: 'project-pinned',
      binding: { workspaceId: 'workspace-gone', visibility: 'team' },
      directory: { ok: true, items: directoryItems },
      callerWorkspaceId: 'workspace-b',
    });

    // `workspaceMemberId` is the billing subject, so borrowing the caller's
    // would bill their wallet for another workspace's project.
    expect(scope).toEqual({
      kind: 'unavailable',
      projectId: 'project-pinned',
      workspaceId: 'workspace-gone',
      visibility: 'team',
      context: null,
    });
  });

  it('leaves a pinned project unavailable when the directory could not be read either', () => {
    const scope = resolveProjectWorkspaceScopeForCaller({
      projectId: 'project-pinned',
      binding: { workspaceId: 'workspace-b', visibility: 'personal' },
      directory: { ok: false, items: [] },
      callerWorkspaceId: 'workspace-b',
    });

    // The caller names the very workspace the project is pinned to, but nothing
    // confirmed it. `unavailable` keeps its exact pre-existing behavior; the
    // caller's claim is not a substitute for the membership directory.
    expect(scope).toEqual({
      kind: 'unavailable',
      projectId: 'project-pinned',
      workspaceId: 'workspace-b',
      visibility: 'personal',
      context: null,
    });
  });

  it('keeps an unbound project unbound when the caller has no workspace identity', () => {
    const scope = resolveProjectWorkspaceScopeForCaller({
      projectId: 'project-anonymous',
      binding: null,
      directory: { ok: true, items: directoryItems },
      callerWorkspaceId: null,
    });

    expect(scope).toEqual({
      kind: 'unbound',
      projectId: 'project-anonymous',
      workspaceId: null,
      context: null,
    });
  });

  it('keeps an unbound project unbound when the claimed workspace is not an active membership', () => {
    const unconfirmed = resolveProjectWorkspaceScopeForCaller({
      projectId: 'project-unconfirmed',
      binding: null,
      directory: { ok: true, items: directoryItems },
      callerWorkspaceId: 'workspace-not-mine',
    });
    const outage = resolveProjectWorkspaceScopeForCaller({
      projectId: 'project-outage',
      binding: null,
      directory: { ok: false, items: [] },
      callerWorkspaceId: 'workspace-b',
    });

    // The fallback resolves THROUGH the directory, so the member id it returns
    // is always B's and never the request header's. An unconfirmable claim must
    // degrade to "no workspace", never to `unavailable` on a workspace the
    // project was never bound to.
    expect(unconfirmed.kind).toBe('unbound');
    expect(unconfirmed.workspaceId).toBeNull();
    expect(outage.kind).toBe('unbound');
    expect(outage.workspaceId).toBeNull();
  });

  it('keeps an unbound project unbound when the caller membership is revoked', () => {
    const scope = resolveProjectWorkspaceScopeForCaller({
      projectId: 'project-revoked',
      binding: null,
      directory: {
        ok: true,
        items: [{ ...directoryItems[0]!, memberStatus: 'removed' as const }],
      },
      callerWorkspaceId: 'workspace-b',
    });

    expect(scope.kind).toBe('unbound');
  });
});
