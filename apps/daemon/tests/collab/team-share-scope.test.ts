import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  ensureWorkspaceProject,
  findTeamWorkspaceIdForProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  listTeamWorkspaceProjectShares,
  openDatabase,
  rebindWorkspaceProject,
  updateWorkspaceProject,
} from '../../src/db.js';
import {
  createWorkspaceTypeRegistry,
  projectCollabScope,
} from '../../src/collab/team-share-scope.js';

// The reporter's real ids, kept verbatim: `OD Feature Team` (a TEAM workspace)
// and the owner's PERSONAL workspace, which is what their `workspace_projects`
// row for `Simple Deck` was pinned to.
const PERSONAL_WS = 'eh0z7baa1w6jjgyed3v32y0j';
const TEAM_WS = 'vp44mftzknedrrqgy05oqpv9';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'od-team-share-scope-'));
});

afterEach(async () => {
  closeDatabase();
  await rm(tmp, { recursive: true, force: true });
});

function seedPersonalSharedProject(projectId: string) {
  const db = openDatabase(tmp, { dataDir: tmp });
  const now = Date.now();
  insertProject(db, { id: projectId, name: 'Simple Deck', createdAt: now, updatedAt: now });
  ensureWorkspaceProject(db, {
    projectId,
    // Explicitly shared in a Personal workspace.
    workspaceId: PERSONAL_WS,
    visibility: 'team',
    resourceState: 'active',
    syncState: 'pending_upload',
    resourceHubResourceId: 'resource-keyed-on-the-personal-workspace',
    createdByWorkspaceMemberId: 'member-owner',
    updatedByWorkspaceMemberId: 'member-owner',
    createdAt: now,
    updatedAt: now,
  });
  return db;
}

function registryKnowing(...facts: Array<{ workspaceId: string; workspaceType: string }>) {
  const registry = createWorkspaceTypeRegistry();
  registry.learn(facts);
  return registry;
}

describe('shared project workspace pinning', () => {
  it('pins a shared Personal project to its own Workspace after the user switches elsewhere', () => {
    const projectId = 'project-personal-shared';
    const db = seedPersonalSharedProject(projectId);
    const scope = projectCollabScope({
      projectWorkspaceId: findTeamWorkspaceIdForProject(db, projectId),
      localSelection: TEAM_WS,
    });
    expect(scope).toEqual({ workspaceId: PERSONAL_WS, source: 'project' });
    expect(getWorkspaceProject(db, PERSONAL_WS, projectId)).toMatchObject({ visibility: 'team' });
  });

  it('pins a shared Team project after a workspace switch', () => {
    expect(projectCollabScope({
      projectWorkspaceId: TEAM_WS,
      localSelection: PERSONAL_WS,
    })).toEqual({ workspaceId: TEAM_WS, source: 'project' });
  });

  it('leaves unknown project workspace bindings pinned', () => {
    expect(projectCollabScope({
      projectWorkspaceId: 'ws-never-seen',
      localSelection: TEAM_WS,
    })).toEqual({ workspaceId: 'ws-never-seen', source: 'project' });
  });

  it('never treats Personal shares as impossible rows to demote', () => {
    const db = seedPersonalSharedProject('project-shared');
    const registry = registryKnowing({ workspaceId: PERSONAL_WS, workspaceType: 'personal' });
    expect(registry.typeOf(PERSONAL_WS)).toBe('personal');
    expect(listTeamWorkspaceProjectShares(db)).toMatchObject([{ workspaceId: PERSONAL_WS, visibility: 'team' }]);
  });

  // The mirror-image bug: not a team row stuck in a personal workspace, but a
  // PERSONAL row that predates a real share and now needs to become the
  // team's row when the share event arrives. `Simple Deck` reproduced this
  // live in the owner/member feature-test dogfood on 2026-07-22: the owner's
  // local row for a project Lee shared into `OD Feature Team` stayed pinned
  // to the owner's own personal workspace forever, so edits/renames Lee made
  // never synced — the viewer just kept re-rendering the stale file.
  describe('rebinding a stale personal row onto a real team share', () => {
    function seedPersonalDraft(projectId: string) {
      const db = openDatabase(tmp, { dataDir: tmp });
      const now = Date.now();
      insertProject(db, { id: projectId, name: 'Simple Deck', createdAt: now, updatedAt: now });
      ensureWorkspaceProject(db, {
        projectId,
        // Bound to the owner's OWN personal workspace, from before this
        // project was ever shared — the exact shape a viewer's daemon has for
        // a project it drafted locally, then someone else shared it TO them
        // under a different id (or it round-tripped through a personal
        // workspace the owner has since switched away from).
        workspaceId: PERSONAL_WS,
        visibility: 'personal',
        resourceState: 'active',
        syncState: 'local_only',
        createdAt: now,
        updatedAt: now,
      });
      return db;
    }

    it('updateWorkspaceProject alone cannot migrate the row (documents the bug)', () => {
      const projectId = 'project-stale-personal-row';
      const db = seedPersonalDraft(projectId);

      // This is exactly what `persistWorkspaceProjectVisibility` used to call:
      // an update scoped to the NEW (team) workspace, on a row that is still
      // sitting under the OLD (personal) one.
      const result = updateWorkspaceProject(db, TEAM_WS, projectId, {
        visibility: 'team',
        syncState: 'synced',
      });

      expect(result).toBeNull();
      // The row never moved — still personal, still under the stale workspace.
      expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
        workspaceId: PERSONAL_WS,
        visibility: 'personal',
        syncState: 'local_only',
      });
    });

    it('rebindWorkspaceProject migrates the row to the real team workspace', () => {
      const projectId = 'project-stale-personal-row-fixed';
      const db = seedPersonalDraft(projectId);

      const result = rebindWorkspaceProject(db, projectId, {
        workspaceId: TEAM_WS,
        visibility: 'team',
        createdByWorkspaceMemberId: 'member-owner',
        updatedByWorkspaceMemberId: 'member-owner',
        resourceHubResourceId: 'resource-under-the-real-team-workspace',
        cloudTombstonedAt: null,
        syncState: 'synced',
      });

      expect(result).toMatchObject({
        workspaceId: TEAM_WS,
        visibility: 'team',
        syncState: 'synced',
      });
      // Reading by project id alone finds the single row, now under the team
      // workspace — a subsequent open of this project pulls the sharer's
      // updates instead of replaying the stale personal-draft snapshot.
      expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
        workspaceId: TEAM_WS,
        visibility: 'team',
        syncState: 'synced',
      });
      // The two-key form scoped to the OLD workspace no longer finds anything
      // — there is exactly one row, and it moved.
      expect(getWorkspaceProject(db, PERSONAL_WS, projectId)).toBeUndefined();
    });
  });
});
