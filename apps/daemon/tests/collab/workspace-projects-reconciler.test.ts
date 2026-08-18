import { describe, expect, it, vi } from 'vitest';

import {
  reconcileWorkspaceProjectMetadataWithRemote,
  planWorkspaceProjectReconciliation,
  reconcileWorkspaceProjectsWithRemote,
  type LocalTeamProjectBinding,
} from '../../src/collab/workspace-projects-reconciler.js';

const WORKSPACE_ID = 'team-1';
const OWNER_MEMBER_ID = 'member-owner';
const READER_MEMBER_ID = 'member-reader';

describe('planWorkspaceProjectReconciliation (pure)', () => {
  it('binds a remote project this daemon has never locally bound, as a reader when someone else owns it', () => {
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: READER_MEMBER_ID,
      remoteProjects: [{ projectId: 'p1', ownerMemberId: OWNER_MEMBER_ID }],
      localBindings: new Map(),
    });
    expect(actions).toEqual([
      {
        kind: 'bind',
        projectId: 'p1',
        patch: {
          workspaceId: WORKSPACE_ID,
          visibility: 'team',
          resourceState: 'active',
          createdByWorkspaceMemberId: null,
          updatedByWorkspaceMemberId: READER_MEMBER_ID,
          resourceHubResourceId: null,
          cloudTombstonedAt: null,
          syncState: 'synced',
        },
      },
    ]);
  });

  it('binds a remote project as editable when the current member is its owner', () => {
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: OWNER_MEMBER_ID,
      remoteProjects: [{ projectId: 'p1', ownerMemberId: OWNER_MEMBER_ID }],
      localBindings: new Map(),
    });
    expect(actions).toEqual([
      expect.objectContaining({
        kind: 'bind',
        projectId: 'p1',
        patch: expect.objectContaining({ createdByWorkspaceMemberId: OWNER_MEMBER_ID }),
      }),
    ]);
  });

  it('preserves an already-known resourceHubResourceId when correcting a row', () => {
    const local: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'personal', // stale: remote says team
      createdByWorkspaceMemberId: null,
      resourceHubResourceId: 'resource-abc',
    };
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: OWNER_MEMBER_ID,
      remoteProjects: [{ projectId: 'p1', ownerMemberId: OWNER_MEMBER_ID }],
      localBindings: new Map([['p1', local]]),
    });
    expect(actions).toEqual([
      expect.objectContaining({
        kind: 'bind',
        patch: expect.objectContaining({ resourceHubResourceId: 'resource-abc' }),
      }),
    ]);
  });

  it('is a no-op when the local row already matches remote exactly', () => {
    const local: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceHubResourceId: 'resource-abc',
    };
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: OWNER_MEMBER_ID,
      remoteProjects: [{ projectId: 'p1', ownerMemberId: OWNER_MEMBER_ID }],
      localBindings: new Map([['p1', local]]),
    });
    expect(actions).toEqual([]);
  });

  it('corrects ownership when the local row wrongly claims edit rights on a project someone else now owns', () => {
    const local: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      createdByWorkspaceMemberId: READER_MEMBER_ID, // stale: I am no longer the owner
      resourceHubResourceId: 'resource-abc',
    };
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: READER_MEMBER_ID,
      remoteProjects: [{ projectId: 'p1', ownerMemberId: OWNER_MEMBER_ID }],
      localBindings: new Map([['p1', local]]),
    });
    expect(actions).toEqual([
      expect.objectContaining({
        kind: 'bind',
        patch: expect.objectContaining({ createdByWorkspaceMemberId: null }),
      }),
    ]);
  });

  // A pulled teammate mirror is not this member's personal project. Once the
  // authoritative catalog confirms the share is gone, quarantine the mirror
  // in place instead of misattributing its stale bytes to the reader.
  it('revokes a local teammate mirror the remote catalog no longer lists', () => {
    const local: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      createdByWorkspaceMemberId: null, // this member was a reader, not the owner
      resourceHubResourceId: 'resource-abc',
    };
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: READER_MEMBER_ID,
      remoteProjects: [], // owner unshared: the hub no longer reports this project at all
      localBindings: new Map([['p1', local]]),
    });
    expect(actions).toEqual([
      {
        kind: 'revoke',
        projectId: 'p1',
        workspaceId: WORKSPACE_ID,
        patch: {
          visibility: 'team',
          resourceState: 'deleted',
          createdByWorkspaceMemberId: null,
          resourceHubResourceId: 'resource-abc',
          cloudTombstonedAt: null,
          syncState: 'synced',
        },
      },
    ]);
  });

  it('still demotes the current member own project when another client unshares it', () => {
    const local: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceHubResourceId: 'resource-abc',
    };
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: OWNER_MEMBER_ID,
      remoteProjects: [],
      localBindings: new Map([['p1', local]]),
    });
    expect(actions).toEqual([
      expect.objectContaining({
        kind: 'demote',
        patch: expect.objectContaining({
          visibility: 'personal',
          createdByWorkspaceMemberId: OWNER_MEMBER_ID,
        }),
      }),
    ]);
  });

  it('does not touch a local row bound to a DIFFERENT workspace even if it is visibility team', () => {
    const local: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: 'some-other-workspace',
      visibility: 'team',
      createdByWorkspaceMemberId: null,
      resourceHubResourceId: 'resource-abc',
    };
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: READER_MEMBER_ID,
      remoteProjects: [],
      localBindings: new Map([['p1', local]]),
    });
    expect(actions).toEqual([]);
  });

  it('does not touch a local row that is already personal-visibility (nothing to demote)', () => {
    const local: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'personal',
      createdByWorkspaceMemberId: READER_MEMBER_ID,
      resourceHubResourceId: null,
    };
    const actions = planWorkspaceProjectReconciliation({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: READER_MEMBER_ID,
      remoteProjects: [],
      localBindings: new Map([['p1', local]]),
    });
    expect(actions).toEqual([]);
  });
});

describe('reconcileWorkspaceProjectsWithRemote (orchestrator, fake deps)', () => {
  function baseDeps(overrides: Partial<Parameters<typeof reconcileWorkspaceProjectsWithRemote>[0]> = {}) {
    return {
      getWorkspaceIdentity: async () => ({ workspaceId: WORKSPACE_ID, workspaceMemberId: READER_MEMBER_ID }),
      listRemoteTeamProjects: async () => [],
      // Materialized by default: these tests exercise binding/demoting logic,
      // not the materialization gate (covered by its own tests below).
      hasLocalProject: () => true,
      listLocalTeamRows: () => [] as LocalTeamProjectBinding[],
      getLocalBinding: () => null,
      applyBind: vi.fn(),
      applyDemote: vi.fn(),
      applyRevoke: vi.fn(),
      getLocalProjectMetadata: () => null,
      applyMetadataRefresh: vi.fn(),
      onError: vi.fn(),
      ...overrides,
    };
  }

  it('persists a newer owner rename only onto an active foreign read-only mirror', async () => {
    const binding: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      resourceHubResourceId: 'r1',
    };
    const applyMetadataRefresh = vi.fn();
    await reconcileWorkspaceProjectsWithRemote(baseDeps({
      listRemoteTeamProjects: async () => [{
        projectId: 'p1',
        ownerMemberId: OWNER_MEMBER_ID,
        displayName: 'Renamed by owner',
        catalogRevisionAt: 999_999,
        originProjectUpdatedAt: 200,
      }],
      listLocalTeamRows: () => [binding],
      getLocalBinding: () => binding,
      getLocalProjectMetadata: () => ({ name: 'Old name', updatedAt: 100 }),
      applyMetadataRefresh,
    }));

    expect(applyMetadataRefresh).toHaveBeenCalledWith('p1', {
      name: 'Renamed by owner',
      updatedAt: 200,
    });
  });

  it('never overwrites the owner local project or trusts the catalog revision as project time', async () => {
    const applyMetadataRefresh = vi.fn();
    const ownerBinding: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceHubResourceId: 'r1',
    };
    await reconcileWorkspaceProjectsWithRemote(baseDeps({
      getWorkspaceIdentity: async () => ({ workspaceId: WORKSPACE_ID, workspaceMemberId: OWNER_MEMBER_ID }),
      listRemoteTeamProjects: async () => [{
        projectId: 'p1',
        ownerMemberId: OWNER_MEMBER_ID,
        displayName: 'Stale catalog name',
        catalogRevisionAt: 999_999,
        originProjectUpdatedAt: null,
      }],
      listLocalTeamRows: () => [ownerBinding],
      getLocalBinding: () => ownerBinding,
      getLocalProjectMetadata: () => ({ name: 'Pending local rename', updatedAt: 300 }),
      applyMetadataRefresh,
    }));

    expect(applyMetadataRefresh).not.toHaveBeenCalled();
  });

  it('does not turn a newer catalog revision into a foreign mirror activity timestamp', async () => {
    const applyMetadataRefresh = vi.fn();
    const binding: LocalTeamProjectBinding = {
      projectId: 'p1',
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      resourceHubResourceId: 'r1',
    };
    await reconcileWorkspaceProjectsWithRemote(baseDeps({
      listRemoteTeamProjects: async () => [{
        projectId: 'p1',
        ownerMemberId: OWNER_MEMBER_ID,
        displayName: 'Catalog-only rename',
        catalogRevisionAt: 999_999,
        originProjectUpdatedAt: null,
      }],
      listLocalTeamRows: () => [binding],
      getLocalBinding: () => binding,
      getLocalProjectMetadata: () => ({ name: 'Local name', updatedAt: 100 }),
      applyMetadataRefresh,
    }));

    expect(applyMetadataRefresh).not.toHaveBeenCalled();
  });

  it('targeted metadata reconciliation updates exactly the event project', async () => {
    const binding: LocalTeamProjectBinding = {
      projectId: 'target',
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      resourceHubResourceId: 'r-target',
    };
    const applyMetadataRefresh = vi.fn();
    const changed = await reconcileWorkspaceProjectMetadataWithRemote(baseDeps({
      listRemoteTeamProjects: async () => [
        { projectId: 'other', ownerMemberId: OWNER_MEMBER_ID, displayName: 'Other', originProjectUpdatedAt: 300 },
        { projectId: 'target', ownerMemberId: OWNER_MEMBER_ID, displayName: 'Target new', originProjectUpdatedAt: 200 },
      ],
      listLocalTeamRows: () => [binding],
      getLocalBinding: (projectId) => projectId === 'target' ? binding : null,
      getLocalProjectMetadata: (projectId) => projectId === 'target'
        ? { name: 'Target old', updatedAt: 100 }
        : { name: 'Other old', updatedAt: 100 },
      applyMetadataRefresh,
    }), 'target');

    expect(changed).toBe(true);
    expect(applyMetadataRefresh).toHaveBeenCalledTimes(1);
    expect(applyMetadataRefresh).toHaveBeenCalledWith('target', {
      name: 'Target new',
      updatedAt: 200,
    });
  });

  it('is a total no-op off-team (null identity) — never reads or writes anything', async () => {
    const listRemoteTeamProjects = vi.fn(async () => []);
    const applyBind = vi.fn();
    const applyDemote = vi.fn();
    const result = await reconcileWorkspaceProjectsWithRemote(
      baseDeps({ getWorkspaceIdentity: async () => null, listRemoteTeamProjects, applyBind, applyDemote }),
    );
    expect(result).toEqual({ bound: 0, demoted: 0, revoked: 0 });
    expect(listRemoteTeamProjects).not.toHaveBeenCalled();
    expect(applyBind).not.toHaveBeenCalled();
    expect(applyDemote).not.toHaveBeenCalled();
  });

  it('never demotes on a failed remote read (best-effort: missing data is not empty data)', async () => {
    const applyDemote = vi.fn();
    const onError = vi.fn();
    const result = await reconcileWorkspaceProjectsWithRemote(
      baseDeps({
        listLocalTeamRows: () => [
          { projectId: 'p1', workspaceId: WORKSPACE_ID, visibility: 'team', createdByWorkspaceMemberId: null, resourceHubResourceId: 'r1' },
        ],
        listRemoteTeamProjects: async () => {
          throw new Error('vela unreachable');
        },
        applyDemote,
        onError,
      }),
    );
    expect(result).toEqual({ bound: 0, demoted: 0, revoked: 0 });
    expect(applyDemote).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('passes the once-captured workspace identity through the remote read when the ambient workspace switches', async () => {
    let ambientWorkspaceId = 'team-a';
    const capturedIdentity = {
      workspaceId: ambientWorkspaceId,
      workspaceMemberId: 'member-a',
    };
    const listRemoteTeamProjects = vi.fn(async (identity: typeof capturedIdentity) => {
      // Model the user switching to B while A's catalog request is in flight.
      ambientWorkspaceId = 'team-b';
      return identity.workspaceId === 'team-a'
        ? [{ projectId: 'project-a', ownerMemberId: 'member-a' }]
        : [{ projectId: 'project-b', ownerMemberId: 'member-b' }];
    });
    const applyBind = vi.fn();

    await reconcileWorkspaceProjectsWithRemote(
      baseDeps({
        getWorkspaceIdentity: async () => capturedIdentity,
        listRemoteTeamProjects,
        applyBind,
      }),
    );

    expect(ambientWorkspaceId).toBe('team-b');
    expect(listRemoteTeamProjects).toHaveBeenCalledWith(capturedIdentity);
    expect(applyBind).toHaveBeenCalledWith(
      'project-a',
      expect.objectContaining({ workspaceId: 'team-a' }),
    );
    expect(applyBind).not.toHaveBeenCalledWith(
      'project-b',
      expect.anything(),
    );
  });

  it('looks up getLocalBinding only for remote projects not already covered by listLocalTeamRows', async () => {
    const getLocalBinding = vi.fn(() => null);
    await reconcileWorkspaceProjectsWithRemote(
      baseDeps({
        listLocalTeamRows: () => [
          { projectId: 'p1', workspaceId: WORKSPACE_ID, visibility: 'team', createdByWorkspaceMemberId: READER_MEMBER_ID, resourceHubResourceId: 'r1' },
        ],
        listRemoteTeamProjects: async () => [
          { projectId: 'p1', ownerMemberId: READER_MEMBER_ID },
          { projectId: 'p2', ownerMemberId: OWNER_MEMBER_ID },
        ],
        getLocalBinding,
      }),
    );
    expect(getLocalBinding).toHaveBeenCalledTimes(1);
    expect(getLocalBinding).toHaveBeenCalledWith('p2');
  });

  it('applies bind and revoke actions through the injected writers and reports counts', async () => {
    const applyBind = vi.fn();
    const applyRevoke = vi.fn();
    const result = await reconcileWorkspaceProjectsWithRemote(
      baseDeps({
        listLocalTeamRows: () => [
          { projectId: 'gone', workspaceId: WORKSPACE_ID, visibility: 'team', createdByWorkspaceMemberId: null, resourceHubResourceId: 'r-gone' },
        ],
        listRemoteTeamProjects: async () => [{ projectId: 'new', ownerMemberId: READER_MEMBER_ID }],
        applyBind,
        applyRevoke,
      }),
    );
    expect(result).toEqual({ bound: 1, demoted: 0, revoked: 1 });
    expect(applyBind).toHaveBeenCalledWith('new', expect.objectContaining({ visibility: 'team' }));
    expect(applyRevoke).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'gone',
      expect.objectContaining({ visibility: 'team', resourceState: 'deleted' }),
    );
  });

  // recvqmnuxxKHaI: `workspace_projects.project_id` is a FOREIGN KEY into
  // `projects(id)`, so a bind for a project this daemon never materialized
  // (no `projects` row — e.g. a teammate's share the member never opened)
  // can never be written. The reconciler must skip it silently — the pull
  // path owns materialization — not throw SQLITE_CONSTRAINT_FOREIGNKEY on
  // every pass forever.
  it('skips the bind for a remote project with no local binding and no local projects row', async () => {
    const applyBind = vi.fn();
    const onError = vi.fn();
    const result = await reconcileWorkspaceProjectsWithRemote(
      baseDeps({
        listRemoteTeamProjects: async () => [
          { projectId: 'never-materialized', ownerMemberId: OWNER_MEMBER_ID },
          { projectId: 'materialized', ownerMemberId: OWNER_MEMBER_ID },
        ],
        hasLocalProject: (projectId) => projectId === 'materialized',
        applyBind,
        onError,
      }),
    );
    expect(result).toEqual({ bound: 1, demoted: 0, revoked: 0 });
    expect(applyBind).toHaveBeenCalledTimes(1);
    expect(applyBind).toHaveBeenCalledWith('materialized', expect.objectContaining({ visibility: 'team' }));
    expect(onError).not.toHaveBeenCalled();
  });

  it('still revokes a foreign mirror whose binding exists even when hasLocalProject is consulted for others only', async () => {
    // A bound row always implies a projects row (the FK guarantees it), so
    // the materialization gate must never suppress the demote direction: a
    // team row remote no longer lists still collapses back to personal.
    const hasLocalProject = vi.fn(() => false);
    const applyRevoke = vi.fn();
    const result = await reconcileWorkspaceProjectsWithRemote(
      baseDeps({
        listLocalTeamRows: () => [
          { projectId: 'gone-remote', workspaceId: WORKSPACE_ID, visibility: 'team', createdByWorkspaceMemberId: null, resourceHubResourceId: 'r1' },
        ],
        listRemoteTeamProjects: async () => [],
        hasLocalProject,
        applyRevoke,
      }),
    );
    expect(result).toEqual({ bound: 0, demoted: 0, revoked: 1 });
    expect(applyRevoke).toHaveBeenCalledWith(
      WORKSPACE_ID,
      'gone-remote',
      expect.objectContaining({ visibility: 'team', resourceState: 'deleted' }),
    );
  });

  it('reports one writer failure through onError without aborting the rest of the pass', async () => {
    const onError = vi.fn();
    const applyRevoke = vi.fn();
    const result = await reconcileWorkspaceProjectsWithRemote(
      baseDeps({
        listLocalTeamRows: () => [
          { projectId: 'a', workspaceId: WORKSPACE_ID, visibility: 'team', createdByWorkspaceMemberId: null, resourceHubResourceId: null },
          { projectId: 'b', workspaceId: WORKSPACE_ID, visibility: 'team', createdByWorkspaceMemberId: null, resourceHubResourceId: null },
        ],
        listRemoteTeamProjects: async () => [],
        applyRevoke: vi.fn((workspaceId: string, projectId: string) => {
          if (projectId === 'a') throw new Error('sqlite busy');
          applyRevoke(projectId);
        }),
        onError,
      }),
    );
    expect(result).toEqual({ bound: 0, demoted: 0, revoked: 2 });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(applyRevoke).toHaveBeenCalledWith('b');
  });
});
