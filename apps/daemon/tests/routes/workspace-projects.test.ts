import express from 'express';
import type http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../../src/server.js';
import { registerProjectRoutes } from '../../src/routes/project/index.js';
import { projectResourceIdFor } from '../../src/integrations/vela-team-projects.js';
import { verifyWorkspaceRequestContext } from '../../src/collab/request-workspace-context.js';
import {
  createWorkspaceDirectoryAuthorityBroker,
  type WorkspaceDirectoryFetchResult,
} from '../../src/collab/vela-workspace-context.js';
import { recoverPersistedTeamShareOwnership } from '../../src/collab/persisted-team-share.js';

describe('workspace project routes', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const workspaceId = `ws-${Date.now()}`;

  function headers(memberId: string, extra: Record<string, string> = {}) {
    return workspaceHeaders(workspaceId, memberId, extra);
  }

  function workspaceHeaders(targetWorkspaceId: string, memberId: string, extra: Record<string, string> = {}) {
    return {
      'content-type': 'application/json',
      'x-od-workspace-id': targetWorkspaceId,
      'x-od-workspace-member-id': memberId,
      'x-od-workspace-role': 'member',
      ...extra,
    };
  }
  function workspacePrincipal(memberId: string, targetWorkspaceId = workspaceId, role: 'owner' | 'admin' | 'member' = 'member') {
    return {
      memberId,
      teamId: targetWorkspaceId,
      role,
      lifecycleState: 'active' as const,
    };
  }

  async function createProject(id: string, name: string) {
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name, skillId: null, designSystemId: null }),
    });
    expect(resp.status).toBe(200);
  }

  async function createProjectInWorkspace(
    id: string,
    name: string,
    memberId: string,
    extra: Record<string, string> = {},
  ) {
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: headers(memberId, extra),
      body: JSON.stringify({ id, name, skillId: null, designSystemId: null }),
    });
    expect(resp.status).toBe(200);
  }

  async function list(memberId: string, query = '', extra: Record<string, string> = {}) {
    return listInWorkspace(workspaceId, memberId, query, extra);
  }

  async function listInWorkspace(
    targetWorkspaceId: string,
    memberId: string,
    query = '',
    extra: Record<string, string> = {},
  ) {
    const resp = await fetch(`${baseUrl}/api/workspaces/${targetWorkspaceId}/projects${query}`, {
      headers: workspaceHeaders(targetWorkspaceId, memberId, extra),
    });
    if (resp.status !== 200) {
      throw new Error(`GET workspace projects failed ${resp.status}: ${await resp.text()}`);
    }
    return resp.json() as Promise<{ projects: Array<any> }>;
  }

  async function waitForWorkspaceProjectSyncState(
    memberId: string,
    projectId: string,
    syncState: string,
    extra: Record<string, string> = {},
  ) {
    let project: any;
    for (let i = 0; i < 40; i += 1) {
      const body = await list(memberId, '?view=all', extra);
      project = body.projects.find((item) => item.id === projectId);
      if (project?.syncState === syncState) return project;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return project;
  }

  it('rejects a project list when the route Workspace conflicts with the explicit request scope', async () => {
    const suffix = Date.now();
    const workspaceA = `${workspaceId}-route-a-${suffix}`;
    const workspaceB = `${workspaceId}-header-b-${suffix}`;
    const projectId = `workspace-route-scope-${suffix}`;
    await createProjectInWorkspace(
      projectId,
      'Workspace route scope fixture',
      'member-route-a',
      { 'x-od-workspace-id': workspaceA },
    );

    const response = await fetch(
      `${baseUrl}/api/workspaces/${workspaceA}/projects?view=all`,
      { headers: workspaceHeaders(workspaceB, 'member-header-b') },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'WORKSPACE_ACCESS_DENIED' },
    });
  });

  it('projects legacy rows into a workspace list without assigning ownership to the reader', async () => {
    const projectId = `workspace-list-${Date.now()}`;
    await createProject(projectId, 'Workspace list fixture');

    const body = await list('member-list', '?view=all');

    const project = body.projects.find((item) => item.id === projectId);
    expect(project).toMatchObject({
      id: projectId,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
    });
    expect(project.currentUserAccess.canDelete).toBe(false);
  });

  // RED LINE — losing a user's pre-workspace ("legacy") projects across the
  // upgrade is data loss. The adoption model must be: every legacy project is
  // lazily projected into the personal workspace on first read (regardless of
  // how long after the upgrade that read happens), projection is idempotent,
  // and a team view SUPPRESSING an ownerless personal row must never translate
  // into that row disappearing from the personal workspace.
  it('never loses legacy projects across workspace views (upgrade adoption red line)', async () => {
    const stamp = Date.now();
    const legacyIds = [0, 1, 2].map((n) => `redline-${stamp}-${n}`);
    for (const id of legacyIds) await createProject(id, `Legacy ${id}`);

    // First personal-workspace read after "upgrade": every legacy project is
    // adopted, visible, and personal — none skipped, none re-owned.
    const first = await list('redline-reader', '?view=all');
    for (const id of legacyIds) {
      expect(first.projects.find((item) => item.id === id)).toMatchObject({
        id,
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: null,
      });
    }

    // Idempotent: a second read neither drops nor duplicates rows.
    const second = await list('redline-reader', '?view=all');
    for (const id of legacyIds) {
      expect(second.projects.filter((item) => item.id === id)).toHaveLength(1);
    }

    // A TEAM workspace view suppresses ownerless personal rows (they belong to
    // the person, not the team)…
    const teamWorkspaceId = `${workspaceId}-redline-team`;
    const teamResp = await fetch(`${baseUrl}/api/workspaces/${teamWorkspaceId}/projects?view=all`, {
      headers: workspaceHeaders(teamWorkspaceId, 'redline-reader', {
        'x-od-workspace-type': 'team',
      }),
    });
    expect(teamResp.status).toBe(200);
    const teamBody = (await teamResp.json()) as { projects: Array<any> };
    for (const id of legacyIds) {
      expect(teamBody.projects.find((item) => item.id === id)).toBeUndefined();
    }

    // …but suppression is a FILTER, not a deletion: the personal workspace
    // still lists every legacy project afterwards.
    const after = await list('redline-reader', '?view=all');
    for (const id of legacyIds) {
      expect(after.projects.find((item) => item.id === id)).toMatchObject({
        id,
        visibility: 'personal',
      });
    }
  });

  // Product ruling (2026-07-21): 「草稿和分享的方案都是和 workspace 绑定的」. A
  // project belongs to exactly ONE workspace. This test used to assert the
  // opposite — that the same legacy project is projected independently into
  // every workspace that reads it — which is precisely the back-fill bug: with
  // a row everywhere, every workspace rendered the same 草稿 grid and switching
  // workspaces changed nothing.
  it('binds a legacy project to the first workspace that adopts it, and only that one', async () => {
    const projectId = `workspace-multi-${Date.now()}`;
    const workspaceA = `${workspaceId}-a`;
    const workspaceB = `${workspaceId}-b`;
    await createProject(projectId, 'Multi workspace fixture');

    const bodyA = await listInWorkspace(workspaceA, 'member-a', '?view=all');
    const bodyB = await listInWorkspace(workspaceB, 'member-b', '?view=all');

    expect(bodyA.projects.find((item) => item.id === projectId)).toMatchObject({
      id: projectId,
      workspaceId: workspaceA,
      createdByWorkspaceMemberId: null,
    });
    // Workspace B reading the same daemon does NOT get a copy.
    expect(bodyB.projects.find((item) => item.id === projectId)).toBeUndefined();

    // …and adoption is stable: re-reading B does not steal it from A.
    const againA = await listInWorkspace(workspaceA, 'member-a', '?view=all');
    expect(againA.projects.some((item) => item.id === projectId)).toBe(true);
  });

  // THE BUG, at the draft grid. A draft created inside workspace A must not
  // appear in workspace B's 草稿 — that is the whole product ruling.
  it('keeps a draft created in one workspace out of another workspace’s drafts', async () => {
    const suffix = Date.now();
    const projectId = `workspace-draft-scope-${suffix}`;
    const workspaceA = `${workspaceId}-draft-a-${suffix}`;
    const workspaceB = `${workspaceId}-draft-b-${suffix}`;

    // Created THROUGH workspace A's context, so the row records the act.
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceA, 'member-draft-a'),
      body: JSON.stringify({ id: projectId, name: 'Draft in A', skillId: null, designSystemId: null }),
    });
    expect(createResp.status).toBe(200);
    await expect(createResp.json()).resolves.toMatchObject({
      project: {
        id: projectId,
        workspaceId: workspaceA,
      },
    });

    const draftsA = await listInWorkspace(workspaceA, 'member-draft-a', '?view=drafts');
    expect(draftsA.projects.map((item) => item.id)).toContain(projectId);

    const draftsB = await listInWorkspace(workspaceB, 'member-draft-b', '?view=drafts');
    expect(draftsB.projects.map((item) => item.id)).not.toContain(projectId);
    const allB = await listInWorkspace(workspaceB, 'member-draft-b', '?view=all');
    expect(allB.projects.map((item) => item.id)).not.toContain(projectId);
  });

  it('rejects partial or revoked workspace-aware creates without leaving an unbound project', async () => {
    const suffix = Date.now();
    const partialId = `workspace-create-partial-${suffix}`;
    const partial = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-workspace-id': `${workspaceId}-partial`,
      },
      body: JSON.stringify({
        id: partialId,
        name: 'Must not become unbound',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(partial.status).toBe(400);
    expect(await fetch(`${baseUrl}/api/projects/${partialId}`).then((response) => response.status))
      .toBe(404);

    const revokedId = `workspace-create-revoked-${suffix}`;
    const revoked = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: workspaceHeaders(`${workspaceId}-revoked`, 'member-revoked', {
        'x-od-workspace-member-status': 'removed',
      }),
      body: JSON.stringify({
        id: revokedId,
        name: 'Must fail closed',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(revoked.status).toBe(403);
    expect(await fetch(`${baseUrl}/api/projects/${revokedId}`).then((response) => response.status))
      .toBe(404);
  });

  it('keeps the persisted workspace binding on the project detail read model', async () => {
    const suffix = Date.now();
    const projectId = `workspace-detail-scope-${suffix}`;
    const workspaceA = `${workspaceId}-detail-a-${suffix}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceA, 'member-detail-a'),
      body: JSON.stringify({
        id: projectId,
        name: 'Project detail scope fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: workspaceHeaders(workspaceA, 'member-detail-a'),
    });
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as {
      project: { id: string; workspaceId?: string | null };
    };
    expect(detail.project).toMatchObject({
      id: projectId,
      workspaceId: workspaceA,
    });
  });

  // Adoption must never mint a second row for a project that already has one.
  // The narrowed primary key would reject it, so a regression here surfaces as a
  // 500 rather than a silent duplicate — but the read path must not get there.
  it('does not re-bind a project that already belongs to a workspace', async () => {
    const suffix = Date.now();
    const projectId = `workspace-rebind-${suffix}`;
    const workspaceA = `${workspaceId}-rebind-a-${suffix}`;
    const workspaceB = `${workspaceId}-rebind-b-${suffix}`;
    await createProject(projectId, 'Rebind fixture');

    await listInWorkspace(workspaceA, 'member-rebind-a', '?view=all');
    for (let i = 0; i < 3; i += 1) {
      const resp = await fetch(`${baseUrl}/api/workspaces/${workspaceB}/projects?view=all`, {
        headers: workspaceHeaders(workspaceB, 'member-rebind-b'),
      });
      expect(resp.status).toBe(200);
    }

    const stillInA = await listInWorkspace(workspaceA, 'member-rebind-a', '?view=all');
    expect(stillInA.projects.filter((item) => item.id === projectId)).toHaveLength(1);
  });

  it('does not let the first workspace reader become the legacy project owner', async () => {
    const projectId = `workspace-owner-read-${Date.now()}`;
    await createProject(projectId, 'Ownership read fixture');

    const firstRead = await list('member-b', '?view=all');
    const afterRead = firstRead.projects.find((item) => item.id === projectId);
    expect(afterRead).toMatchObject({
      id: projectId,
      createdByWorkspaceMemberId: null,
    });
    expect(afterRead.currentUserAccess.canDelete).toBe(false);

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-b'),
      body: JSON.stringify({ projectIds: [projectId] }),
    });
    expect(deleteResp.status).toBe(403);

    const stillExists = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: headers('member-b'),
    });
    expect(stillExists.status).toBe(200);
  });

  it('does not expose removed-location projects through workspace project routes', async () => {
    const locationId = `workspace-hidden-location-${Date.now()}`;
    const projectId = `workspace-hidden-project-${Date.now()}`;
    const extDir = await mkdtemp(path.join(tmpdir(), 'od-workspace-hidden-'));
    try {
      const putLocation = await fetch(`${baseUrl}/api/project-locations`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locations: [{ id: locationId, name: 'Hidden workspace location', path: extDir }] }),
      });
      expect(putLocation.status).toBe(200);

      const createResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Hidden workspace project',
          skillId: null,
          designSystemId: null,
          projectLocationId: locationId,
        }),
      });
      expect(createResp.status).toBe(200);

      const removeLocation = await fetch(`${baseUrl}/api/project-locations`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locations: [] }),
      });
      expect(removeLocation.status).toBe(200);

      const listResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?view=all`, {
        headers: headers('member-hidden-location'),
      });
      expect(listResp.status).toBe(200);
      const listBody = await listResp.json() as { projects: Array<any> };
      expect(listBody.projects.some((item: any) => item.id === projectId)).toBe(false);

      const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
        method: 'POST',
        headers: headers('member-hidden-location', { 'x-od-workspace-role': 'admin' }),
        body: JSON.stringify({ projectIds: [projectId] }),
      });
      expect(deleteResp.status).toBe(404);
    } finally {
      await rm(extDir, { recursive: true, force: true });
    }
  });

  it('rejects workspace project mutations without workspace identity', async () => {
    const projectId = `workspace-missing-context-${Date.now()}`;
    await createProject(projectId, 'Missing context fixture');

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectIds: [projectId] }),
    });

    expect(deleteResp.status).toBe(400);
    await expect(deleteResp.json()).resolves.toMatchObject({
      error: {
        code: 'WORKSPACE_CONTEXT_REQUIRED',
      },
    });

    const stillExists = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(stillExists.status).toBe(200);
  });

  it('validates workspace project views and applies each accepted view', async () => {
    const suffix = Date.now();
    const draftId = `workspace-view-draft-${suffix}`;
    const teamId = `workspace-view-team-${suffix}`;
    const otherId = `workspace-view-other-${suffix}`;
    const otherWorkspaceId = `${workspaceId}-other-${suffix}`;
    const otherWorkspaceProjectId = `workspace-view-cross-workspace-${suffix}`;
    await createProjectInWorkspace(draftId, 'Draft view fixture', 'member-view', {
      'x-od-workspace-type': 'team',
    });
    await createProjectInWorkspace(teamId, 'Team view fixture', 'member-view', {
      'x-od-workspace-type': 'team',
    });
    await createProjectInWorkspace(otherId, 'Other member view fixture', 'member-other', {
      'x-od-workspace-type': 'team',
    });
    await createProjectInWorkspace(otherWorkspaceProjectId, 'Other Workspace fixture', 'member-view', {
      'x-od-workspace-id': otherWorkspaceId,
      'x-od-workspace-type': 'team',
    });

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${teamId}/move`, {
      method: 'POST',
      headers: headers('member-view', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    const all = await list('member-view', '?view=all');
    const recent = await list('member-view', '?view=recent');
    const drafts = await list('member-view', '?view=drafts');
    const team = await list('member-view', '?view=team');
    const otherPersonal = await list(
      'member-view',
      '?view=all&owner=others&visibility=personal',
    );

    expect(all.projects.some((item) => item.id === draftId)).toBe(true);
    expect(recent.projects.map((item) => item.id)).toContain(draftId);
    expect(recent.projects.map((item) => item.id)).toContain(teamId);
    expect(drafts.projects.map((item) => item.id)).toContain(draftId);
    expect(drafts.projects.map((item) => item.id)).not.toContain(teamId);
    expect(team.projects.map((item) => item.id)).toContain(teamId);
    expect(team.projects.map((item) => item.id)).not.toContain(draftId);
    for (const response of [all, recent, drafts, team, otherPersonal]) {
      expect(response.projects.map((item) => item.id)).not.toContain(otherId);
      expect(response.projects.map((item) => item.id)).not.toContain(otherWorkspaceProjectId);
    }

    const invalid = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?view=personal`, {
      headers: headers('member-view'),
    });
    expect(invalid.status).toBe(400);
  });

  // A team share recorded against a PERSONAL workspace is self-contradictory:
  // B has no standalone team id, so the workspace id IS the team identity and a
  // personal workspace has no team plane to act on. Every project-scoped collab
  // call the resulting row pins (presence, comments, publish) is answered
  // `403 missing_principal` — forever, and silently. The share must fail loudly
  // at the moment it is requested instead of persisting an impossible row.
  it('refuses a team share requested from a personal workspace', async () => {
    const suffix = Date.now();
    const projectId = `workspace-personal-share-${suffix}`;
    const personalWorkspaceId = `${workspaceId}-personal-${suffix}`;
    await createProject(projectId, 'Personal workspace share fixture');

    const personalHeaders = workspaceHeaders(personalWorkspaceId, 'member-personal-sharer', {
      'x-od-workspace-type': 'personal',
      'x-od-workspace-role': 'admin',
    });

    const moveResp = await fetch(
      `${baseUrl}/api/workspaces/${personalWorkspaceId}/projects/${projectId}/move`,
      {
        method: 'POST',
        headers: personalHeaders,
        body: JSON.stringify({ visibility: 'team' }),
      },
    );
    expect(moveResp.status).toBe(409);
    expect(await moveResp.json()).toMatchObject({
      error: { code: 'WORKSPACE_TEAM_SHARE_REQUIRES_TEAM_WORKSPACE' },
    });

    const batchResp = await fetch(
      `${baseUrl}/api/workspaces/${personalWorkspaceId}/projects/batch-move`,
      {
        method: 'POST',
        headers: personalHeaders,
        body: JSON.stringify({ projectIds: [projectId], visibility: 'team' }),
      },
    );
    expect(batchResp.status).toBe(409);

    // The row must still be personal — a refused share leaves nothing behind.
    const listResp = await fetch(
      `${baseUrl}/api/workspaces/${personalWorkspaceId}/projects?view=all`,
      { headers: personalHeaders },
    );
    expect(listResp.status).toBe(200);
    const body = (await listResp.json()) as { projects: Array<any> };
    const row = body.projects.find((item) => item.id === projectId);
    expect(row).toMatchObject({ id: projectId, visibility: 'personal' });
    // …and the UI affordance that offers the impossible action is gone.
    expect(row.currentUserAccess.canMoveToTeam).toBe(false);
  });

  it('supports batch operations on explicitly scoped projects without requiring a prior list request', async () => {
    const suffix = Date.now();
    const moveProjectId = `workspace-batch-move-${suffix}`;
    const deleteProjectId = `workspace-batch-delete-${suffix}`;
    const teamHeaders = {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'admin',
    };
    await createProjectInWorkspace(moveProjectId, 'Direct batch move project', 'member-direct', teamHeaders);
    await createProjectInWorkspace(deleteProjectId, 'Direct batch delete project', 'member-direct', teamHeaders);

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-move`, {
      method: 'POST',
      headers: headers('member-direct', teamHeaders),
      body: JSON.stringify({ projectIds: [moveProjectId], visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);
    const moved = await moveResp.json() as { projects: Array<any> };
    expect(moved.projects[0]).toMatchObject({
      id: moveProjectId,
      visibility: 'team',
      syncState: 'synced',
      resourceHubResourceId: projectResourceIdFor(moveProjectId, workspacePrincipal('member-direct', workspaceId, 'admin')),
      cloudTombstonedAt: null,
      createdByWorkspaceMemberId: 'member-direct',
    });

    const invalidMoveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-move`, {
      method: 'POST',
      headers: headers('member-direct', teamHeaders),
      body: JSON.stringify({ projectIds: [deleteProjectId, 123], visibility: 'team' }),
    });
    expect(invalidMoveResp.status).toBe(400);

    const afterInvalidMove = await list('member-direct', '?view=all', teamHeaders);
    const untouched = afterInvalidMove.projects.find((item: any) => item.id === deleteProjectId);
    expect(untouched).toMatchObject({
      visibility: 'personal',
      syncState: 'local_only',
      resourceHubResourceId: null,
    });

    const invalidDeleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-direct', teamHeaders),
      body: JSON.stringify({ projectIds: [deleteProjectId, 123] }),
    });
    expect(invalidDeleteResp.status).toBe(400);

    const afterInvalidDelete = await fetch(`${baseUrl}/api/projects/${deleteProjectId}`, {
      headers: headers('member-direct', teamHeaders),
    });
    expect(afterInvalidDelete.status).toBe(200);
    const batchShareStatus = await fetch(`${baseUrl}/api/projects/${moveProjectId}/collab/status`, {
      headers: headers('member-direct', teamHeaders),
    });
    expect(batchShareStatus.status).toBe(200);
    const batchShare = await batchShareStatus.json() as { syncState: string; ownerMemberId: string | null };
    expect(['pending_upload', 'synced']).toContain(batchShare.syncState);
    expect(batchShare.ownerMemberId).toBe('member-direct');
    const syncedProject = await waitForWorkspaceProjectSyncState(
      'member-direct',
      moveProjectId,
      'synced',
      teamHeaders,
    );
    expect(syncedProject).toMatchObject({
      id: moveProjectId,
      syncState: 'synced',
      resourceHubResourceId: projectResourceIdFor(moveProjectId, workspacePrincipal('member-direct', workspaceId, 'admin')),
      createdByWorkspaceMemberId: 'member-direct',
    });
    expect(syncedProject.pendingSyncIntent).toBeUndefined();

    const moveBackResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${moveProjectId}/move`, {
      method: 'POST',
      headers: headers('member-direct', teamHeaders),
      body: JSON.stringify({ visibility: 'personal' }),
    });
    // An admin who shared the project can move it back out of the team; the
    // project returns to personal/local-only and drops its resource binding.
    expect(moveBackResp.status).toBe(200);
    const movedBack = await moveBackResp.json() as { project: any };
    expect(movedBack.project).toMatchObject({
      id: moveProjectId,
      visibility: 'personal',
      syncState: 'local_only',
      resourceHubResourceId: null,
    });

    // It is already personal now, so moving it to personal again is rejected
    // (canMoveToPersonal requires the project to currently be team-shared).
    const batchMoveBackResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-move`, {
      method: 'POST',
      headers: headers('member-direct', teamHeaders),
      body: JSON.stringify({ projectIds: [moveProjectId], visibility: 'personal' }),
    });
    expect(batchMoveBackResp.status).toBe(403);

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-direct', teamHeaders),
      body: JSON.stringify({ projectIds: [deleteProjectId] }),
    });
    expect(deleteResp.status).toBe(200);

    const deleted = await fetch(`${baseUrl}/api/projects/${deleteProjectId}`);
    expect(deleted.status).toBe(404);
  });

  it('lets a plain member share their unattributed local project to the team', async () => {
    // A lazily-projected local row carries createdByWorkspaceMemberId=null
    // (projection never assigns ownership to the reader — see the adoption
    // red line above). But the project physically lives only on this user's
    // machine, so SHARING it must not require prior attribution: the share
    // itself stamps the sharer as owner. A plain member (canShareProjects)
    // was 403ed here, which dead-ended every member's own drafts.
    const projectId = `workspace-member-share-${Date.now()}`;
    await createProject(projectId, 'Member share project');

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-plain-sharer', { 'x-od-workspace-type': 'team' }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);
    const moved = await moveResp.json() as { project: any };
    expect(moved.project).toMatchObject({
      id: projectId,
      visibility: 'team',
      createdByWorkspaceMemberId: 'member-plain-sharer',
    });

    // Destructive actions stay strict: a DIFFERENT member still cannot
    // delete or unshare what this member now owns.
    const strangerMove = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-other'),
      body: JSON.stringify({ visibility: 'personal' }),
    });
    expect(strangerMove.status).toBe(403);
  });

  it('keeps Team shared-project access flags and unshare single-writer for workspace owners', async () => {
    const suffix = Date.now();
    const projectOwnerId = `member-project-owner-${suffix}`;
    const workspaceOwnerId = `member-workspace-owner-${suffix}`;
    const singleProjectId = `workspace-single-unshare-${suffix}`;
    const batchProjectId = `workspace-batch-unshare-${suffix}`;
    const projectOwnerHeaders = headers(projectOwnerId, {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'member',
    });
    const workspaceOwnerHeaders = headers(workspaceOwnerId, {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'owner',
    });

    for (const projectId of [singleProjectId, batchProjectId]) {
      await createProjectInWorkspace(
        projectId,
        `Shared by ${projectOwnerId}`,
        projectOwnerId,
        { 'x-od-workspace-type': 'team' },
      );
      const share = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: projectOwnerHeaders,
          body: JSON.stringify({ visibility: 'team' }),
        },
      );
      expect(share.status).toBe(200);
    }

    const workspaceOwnerList = await list(
      workspaceOwnerId,
      '?view=team',
      {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'owner',
      },
    );
    for (const projectId of [singleProjectId, batchProjectId]) {
      const project = workspaceOwnerList.projects.find(
        (item: any) => item.id === projectId,
      );
      expect(project).toMatchObject({
        visibility: 'team',
        createdByWorkspaceMemberId: projectOwnerId,
        currentUserAccess: {
          canRename: false,
          canDelete: false,
          canDuplicate: false,
          canMoveToPersonal: false,
          canRestoreVersion: false,
        },
      });
    }

    const singleUnshare = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/projects/${singleProjectId}/move`,
      {
        method: 'POST',
        headers: workspaceOwnerHeaders,
        body: JSON.stringify({ visibility: 'personal' }),
      },
    );
    expect(singleUnshare.status).toBe(403);

    const batchUnshare = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/projects/batch-move`,
      {
        method: 'POST',
        headers: workspaceOwnerHeaders,
        body: JSON.stringify({
          projectIds: [batchProjectId],
          visibility: 'personal',
        }),
      },
    );
    expect(batchUnshare.status).toBe(403);

    const projectOwnerList = await list(
      projectOwnerId,
      '?view=team',
      { 'x-od-workspace-type': 'team' },
    );
    for (const projectId of [singleProjectId, batchProjectId]) {
      const project = projectOwnerList.projects.find(
        (item: any) => item.id === projectId,
      );
      expect(project).toMatchObject({
        visibility: 'team',
        createdByWorkspaceMemberId: projectOwnerId,
        currentUserAccess: {
          canRename: true,
          canDelete: true,
          canDuplicate: true,
          canMoveToPersonal: true,
          canRestoreVersion: true,
        },
      });
    }
  });

  it('stamps the sharing member as owner when a legacy project moves to team', async () => {
    const projectId = `workspace-share-owner-${Date.now()}`;
    await createProject(projectId, 'Share owner project');

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-share-owner', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);
    const moved = await moveResp.json() as { project: any };
    expect(moved.project).toMatchObject({
      id: projectId,
      visibility: 'team',
      createdByWorkspaceMemberId: 'member-share-owner',
    });

    const mine = await list('member-share-owner', '?owner=mine');
    expect(mine.projects.map((item) => item.id)).toContain(projectId);

    const others = await list('member-share-owner', '?owner=others');
    expect(others.projects.map((item) => item.id)).not.toContain(projectId);

    const mineTeam = await list('member-share-owner', '?owner=mine&visibility=team');
    expect(mineTeam.projects.map((item) => item.id)).toContain(projectId);

    const othersTeam = await list('member-share-owner', '?owner=others&visibility=team');
    expect(othersTeam.projects.map((item) => item.id)).not.toContain(projectId);
  });

  it('enforces workspace project permissions on direct project and file write routes', async () => {
    const projectId = `workspace-direct-write-${Date.now()}`;
    await createProject(projectId, 'Direct write project');

    const ownerHeaders = headers('member-write-owner', {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'admin',
    });
    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    const seedResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'index.html', content: '<h1>original</h1>' }),
    });
    expect(seedResp.status).toBe(200);

    // Workspace governance does not transfer the shared project's single
    // writer. Even a Workspace owner remains a read-only viewer when the
    // catalog names another member as this project's owner.
    const workspaceOwnerHeaders = headers('member-workspace-owner', {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'owner',
    });
    const privilegedWriteResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: workspaceOwnerHeaders,
      body: JSON.stringify({ name: 'owner-escalation.txt', content: 'must not land' }),
    });
    expect(privilegedWriteResp.status).toBe(403);

    const versionResp = await fetch(`${baseUrl}/api/projects/${projectId}/files/index.html/versions`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ source: 'manual', label: 'seed' }),
    });
    expect(versionResp.status).toBe(200);
    const versionBody = await versionResp.json() as { version: { id: string } };

    const readOnlyHeaders = headers('member-write-viewer');
    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: readOnlyHeaders,
      body: JSON.stringify({ name: 'Illicit rename' }),
    });
    expect(patchResp.status).toBe(403);

    const duplicateResp = await fetch(`${baseUrl}/api/projects/${projectId}/duplicate`, {
      method: 'POST',
      headers: readOnlyHeaders,
      body: JSON.stringify({ name: 'Illicit duplicate' }),
    });
    expect(duplicateResp.status).toBe(403);

    const designSystemCopyResp = await fetch(`${baseUrl}/api/projects/${projectId}/design-system-copy`, {
      method: 'POST',
      headers: readOnlyHeaders,
      body: JSON.stringify({ name: 'Illicit design-system copy' }),
    });
    expect(designSystemCopyResp.status).toBe(403);

    const writeResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: readOnlyHeaders,
      body: JSON.stringify({ name: 'blocked.txt', content: 'blocked' }),
    });
    expect(writeResp.status).toBe(403);

    // The multi-file batch route (chat composer paste/drop/picker) is a
    // separate handler from the single-file POST above and used to carry no
    // enforceWorkspaceProjectMutation call at all — not even the ctx-present
    // path this whole test exercises for its siblings.
    const uploadForm = new FormData();
    uploadForm.append('files', new Blob(['blocked'], { type: 'text/plain' }), 'blocked-upload.txt');
    const { 'content-type': _uploadContentType, ...uploadHeaders } = readOnlyHeaders;
    const uploadResp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      headers: uploadHeaders,
      body: uploadForm,
    });
    expect(uploadResp.status).toBe(403);

    const folderCreateResp = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'POST',
      headers: readOnlyHeaders,
      body: JSON.stringify({ name: 'blocked-folder' }),
    });
    expect(folderCreateResp.status).toBe(403);

    const renameResp = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: readOnlyHeaders,
      body: JSON.stringify({ from: 'index.html', to: 'renamed.html' }),
    });
    expect(renameResp.status).toBe(403);

    const restoreResp = await fetch(`${baseUrl}/api/projects/${projectId}/files/index.html/versions/${versionBody.version.id}/restore`, {
      method: 'POST',
      headers: readOnlyHeaders,
      body: JSON.stringify({}),
    });
    expect(restoreResp.status).toBe(403);

    const deleteResp = await fetch(`${baseUrl}/api/projects/${projectId}/files/index.html`, {
      method: 'DELETE',
      headers: readOnlyHeaders,
    });
    expect(deleteResp.status).toBe(403);

    const rawDeleteResp = await fetch(`${baseUrl}/api/projects/${projectId}/raw/index.html`, {
      method: 'DELETE',
      headers: readOnlyHeaders,
    });
    expect(rawDeleteResp.status).toBe(403);

    const folderDeleteResp = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
      method: 'DELETE',
      headers: readOnlyHeaders,
      body: JSON.stringify({ path: 'blocked-folder' }),
    });
    expect(folderDeleteResp.status).toBe(403);

    const projectDeleteResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: readOnlyHeaders,
    });
    expect(projectDeleteResp.status).toBe(403);

    const blockedFile = await fetch(`${baseUrl}/api/projects/${projectId}/raw/blocked.txt`, {
      headers: readOnlyHeaders,
    });
    expect(blockedFile.status).toBe(404);
    const privilegedBlockedFile = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/owner-escalation.txt`,
      { headers: ownerHeaders },
    );
    expect(privilegedBlockedFile.status).toBe(404);
    const projectResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: readOnlyHeaders,
    });
    const projectBody = await projectResp.json() as { project: { name: string } };
    expect(projectBody.project.name).toBe('Direct write project');
  });

  // recvqbklNGDqYY — a fully logged-out request (no x-od-workspace-* headers
  // at all, exactly what the frontend sends once workspaceContext goes null)
  // used to hit the ctx===null branch of enforceWorkspaceProjectMutation and
  // be granted the mutation unconditionally, regardless of whether the
  // project was actually team-shared. A team-shared project must require
  // real workspace identity; an untouched personal/local project must still
  // work headerless (the legacy pre-workspace callers this branch exists for).
  it('rejects headerless direct-route mutations against a team-shared project, but still allows them for a personal project', async () => {
    const suffix = Date.now();
    const teamProjectId = `workspace-headerless-team-${suffix}`;
    const personalProjectId = `workspace-headerless-personal-${suffix}`;
    await createProject(teamProjectId, 'Headerless team fixture');
    await createProject(personalProjectId, 'Headerless personal fixture');

    const ownerHeaders = headers('member-headerless-owner', {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'admin',
    });
    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${teamProjectId}/move`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    // No x-od-workspace-* headers at all — the post-logout / legacy shape.
    const teamPatchResp = await fetch(`${baseUrl}/api/projects/${teamProjectId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Illicit headerless rename' }),
    });
    expect(teamPatchResp.status).toBe(400);
    await expect(teamPatchResp.json()).resolves.toMatchObject({
      error: { code: 'WORKSPACE_CONTEXT_REQUIRED' },
    });

    // A project this daemon never bound to any workspace (or bound personal)
    // must keep working for a headerless caller — this is the pre-workspace
    // legacy path the null-context branch exists for in the first place.
    const personalPatchResp = await fetch(`${baseUrl}/api/projects/${personalProjectId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed personal fixture' }),
    });
    expect(personalPatchResp.status).toBe(200);

    const stillNamed = await fetch(`${baseUrl}/api/projects/${teamProjectId}`, {
      headers: ownerHeaders,
    });
    const stillNamedBody = await stillNamed.json() as { project: { name: string } };
    expect(stillNamedBody.project.name).toBe('Headerless team fixture');
  });

  // recvqbjbudBS9r — a duplicated project used to leave the daemon with NO
  // `workspace_projects` row at all for the copy: `POST /api/projects/:id/duplicate`
  // inserted the new project row but never bound it anywhere. It stayed an
  // unbound orphan until whichever workspace's project list was read NEXT
  // (`bindUnboundProjectsToPersonalWorkspace` sweeps every orphan into the
  // workspace it is reading for), which could be a workspace the user never
  // touched. The fix binds the copy into the duplicating request's own
  // workspace immediately, so no later read — for ANY workspace — can steal it.
  it('binds a duplicated project into the workspace it was duplicated from, not wherever a project list is read next', async () => {
    const projectId = `dup-workspace-bind-${Date.now()}`;
    await createProject(projectId, 'Duplicate workspace-bind fixture');

    const ownerHeaders = headers('member-dup-owner', {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'admin',
    });
    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    const duplicateResp = await fetch(`${baseUrl}/api/projects/${projectId}/duplicate`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Duplicate workspace-bind copy' }),
    });
    expect(duplicateResp.status).toBe(200);
    const duplicateBody = await duplicateResp.json() as {
      project: { id: string; workspaceId?: string };
    };
    const targetId = duplicateBody.project.id;
    expect(duplicateBody.project.workspaceId).toBe(workspaceId);

    // Read a DIFFERENT workspace's project list first. Before the fix this
    // greedily adopted the still-unbound copy (any personal-workspace read
    // sweeps every orphan project into itself), so the copy would show up
    // here instead of in the workspace it was actually duplicated from.
    const otherWorkspaceId = `ws-other-${Date.now()}`;
    const otherList = await listInWorkspace(otherWorkspaceId, 'member-other-reader', '?view=all');
    expect(otherList.projects.some((item) => item.id === targetId)).toBe(false);

    // The workspace the duplicate actually happened in has it immediately —
    // no dependency on a later list read to adopt it.
    const ownList = await list('member-dup-owner', '?view=all');
    expect(ownList.projects.find((item) => item.id === targetId)).toMatchObject({
      id: targetId,
      createdByWorkspaceMemberId: 'member-dup-owner',
    });

    const designSystemCopyResp = await fetch(
      `${baseUrl}/api/projects/${projectId}/design-system-copy`,
      {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ name: 'Design-system workspace-bind copy' }),
      },
    );
    expect(designSystemCopyResp.status).toBe(200);
    const designSystemCopyBody = await designSystemCopyResp.json() as {
      project: { id: string; workspaceId?: string };
      designSystemId: string;
    };
    expect(designSystemCopyBody.project.workspaceId).toBe(workspaceId);
    expect(
      (await list('member-dup-owner', '?view=all')).projects.find(
        (item) => item.id === designSystemCopyBody.project.id,
      ),
    ).toMatchObject({
      id: designSystemCopyBody.project.id,
      createdByWorkspaceMemberId: 'member-dup-owner',
    });

    const ownDesignSystemsResp = await fetch(`${baseUrl}/api/design-systems`, {
      headers: ownerHeaders,
    });
    expect(ownDesignSystemsResp.status).toBe(200);
    const ownDesignSystemsBody = await ownDesignSystemsResp.json() as {
      designSystems: Array<{ id: string; workspaceId?: string }>;
    };
    expect(
      ownDesignSystemsBody.designSystems.find(
        (item) => item.id === designSystemCopyBody.designSystemId,
      ),
    ).toMatchObject({
      id: designSystemCopyBody.designSystemId,
      workspaceId,
    });

    const otherHeaders = workspaceHeaders(otherWorkspaceId, 'member-other-reader', {
      'x-od-workspace-type': 'team',
    });
    const otherDesignSystemsResp = await fetch(`${baseUrl}/api/design-systems`, {
      headers: otherHeaders,
    });
    expect(otherDesignSystemsResp.status).toBe(200);
    const otherDesignSystemsBody = await otherDesignSystemsResp.json() as {
      designSystems: Array<{ id: string }>;
    };
    expect(
      otherDesignSystemsBody.designSystems.some(
        (item) => item.id === designSystemCopyBody.designSystemId,
      ),
    ).toBe(false);

    const ownDirectRead = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemCopyBody.designSystemId)}`,
      { headers: ownerHeaders },
    );
    expect(ownDirectRead.status).toBe(200);

    const crossWorkspaceDirectRead = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemCopyBody.designSystemId)}`,
      { headers: otherHeaders },
    );
    expect(crossWorkspaceDirectRead.status).toBe(403);

    const crossWorkspaceMutation = await fetch(
      `${baseUrl}/api/design-systems/${encodeURIComponent(designSystemCopyBody.designSystemId)}`,
      {
        method: 'PATCH',
        headers: otherHeaders,
        body: JSON.stringify({ title: 'Cross-workspace overwrite' }),
      },
    );
    expect(crossWorkspaceMutation.status).toBe(403);
  });

  // recvqbhor3pai2 — duplicating an already-duplicated project (a "copy of a
  // copy") 403'd with WORKSPACE_PROJECT_PERMISSION_DENIED / "workspace project
  // mutation is not allowed". Before recvqbjbudBS9r's fix (the test above),
  // the first duplicate left NO `workspace_projects` row for the copy, so
  // `workspaceProjectMutationAllowed` hit its `if (!row) return false;` guard
  // the moment anyone tried to duplicate THAT copy. This test exercises the
  // exact reported shape (two duplicates back to back, real owner headers
  // matching the bug report's curl repro) end to end to confirm
  // `bindDuplicateIntoRequestWorkspace` closes this specific case too — the
  // copy's own binding row now exists by the time it is duplicated again.
  it('allows duplicating a project that is itself already a duplicate', async () => {
    const suffix = Date.now();
    const projectId = `dup-of-dup-source-${suffix}`;
    await createProject(projectId, 'Duplicate-of-duplicate fixture');

    const ownerHeaders = headers('member-dup-of-dup-owner', {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'owner',
    });
    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    // First duplicate: source -> copy1 (mirrors the "Mobile App Copy" project
    // in the bug report, which was itself a duplicate).
    const firstDuplicateResp = await fetch(`${baseUrl}/api/projects/${projectId}/duplicate`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Duplicate-of-duplicate copy 1' }),
    });
    expect(firstDuplicateResp.status).toBe(200);
    const firstDuplicateBody = (await firstDuplicateResp.json()) as { project: { id: string } };
    const copy1Id = firstDuplicateBody.project.id;

    // Second duplicate: duplicate the COPY itself — this is exactly what the
    // report's curl reproduced against and got "workspace project mutation is
    // not allowed" for.
    const secondDuplicateResp = await fetch(`${baseUrl}/api/projects/${copy1Id}/duplicate`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ name: 'Duplicate-of-duplicate copy 2' }),
    });
    expect(secondDuplicateResp.status).toBe(200);
    const secondDuplicateBody = (await secondDuplicateResp.json()) as { project: { id: string } };
    const copy2Id = secondDuplicateBody.project.id;

    const ownList = await list('member-dup-of-dup-owner', '?view=all');
    expect(ownList.projects.find((item) => item.id === copy2Id)).toMatchObject({
      id: copy2Id,
      createdByWorkspaceMemberId: 'member-dup-of-dup-owner',
    });
  });

  // recvqbhor3pai2 (remaining gap) — `bindDuplicateIntoRequestWorkspace`'s own
  // doc comment admits a headerless duplicate (no `x-od-workspace-*` headers —
  // a legitimate legacy/pre-context caller, e.g. the web client's
  // `workspaceContext` has not resolved yet on the very first click) leaves
  // the copy permanently UNBOUND, "same as before" its fix. Before
  // `reconcileUnboundProjectBeforeMutation`, the first LATER mutation that DID
  // carry real headers — duplicating that same still-unbound copy again once
  // the client's workspace context settled — hit
  // `workspaceResourceMutationAllowed`'s `if (!row) return false;` guard and
  // 403'd with "workspace project mutation is not allowed", even though no
  // other workspace had ever claimed the project. This reproduces the exact
  // reported shape end to end and confirms the copy gets claimed into the
  // duplicating member's own workspace instead of staying stuck.
  it('allows duplicating a copy that a prior headerless duplicate left unbound', async () => {
    const suffix = Date.now();
    const projectId = `dup-unbound-source-${suffix}`;
    await createProject(projectId, 'Duplicate-of-unbound-copy fixture');

    // First duplicate: no workspace headers at all (legacy / pre-context
    // caller). Source is itself unbound, so this is allowed today — but it
    // leaves the COPY unbound too.
    const firstDuplicateResp = await fetch(`${baseUrl}/api/projects/${projectId}/duplicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Duplicate-of-unbound-copy copy 1' }),
    });
    expect(firstDuplicateResp.status).toBe(200);
    const firstDuplicateBody = (await firstDuplicateResp.json()) as { project: { id: string } };
    const copy1Id = firstDuplicateBody.project.id;

    // Second duplicate: this time with real workspace headers, as if the
    // client's workspace context has since resolved — exactly what the
    // report's repro (open the copy, "···" → duplicate again) exercised.
    const memberHeaders = headers('member-dup-unbound-owner', { 'x-od-workspace-role': 'owner' });
    const secondDuplicateResp = await fetch(`${baseUrl}/api/projects/${copy1Id}/duplicate`, {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({ name: 'Duplicate-of-unbound-copy copy 2' }),
    });
    expect(secondDuplicateResp.status).toBe(200);
    const secondDuplicateBody = (await secondDuplicateResp.json()) as { project: { id: string } };
    const copy2Id = secondDuplicateBody.project.id;

    // The reconciliation claimed copy1 (the source of the second duplicate)
    // into the duplicating member's own workspace rather than leaving it — or
    // copy2 — unbound.
    const ownList = await list('member-dup-unbound-owner', '?view=all');
    expect(ownList.projects.find((item) => item.id === copy1Id)).toMatchObject({
      id: copy1Id,
      createdByWorkspaceMemberId: 'member-dup-unbound-owner',
    });
    expect(ownList.projects.find((item) => item.id === copy2Id)).toMatchObject({
      id: copy2Id,
      createdByWorkspaceMemberId: 'member-dup-unbound-owner',
    });
  });

  it('blocks direct project and file writes when the workspace is locked', async () => {
    const projectId = `workspace-direct-locked-${Date.now()}`;
    await createProject(projectId, 'Locked direct write project');

    const ownerHeaders = headers('member-locked-owner', {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'admin',
    });
    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    const lockedHeaders = headers('member-locked-owner', {
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'admin',
      'x-od-workspace-lifecycle-state': 'locked',
    });
    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: lockedHeaders,
      body: JSON.stringify({ name: 'Locked rename' }),
    });
    expect(patchResp.status).toBe(403);

    const duplicateResp = await fetch(`${baseUrl}/api/projects/${projectId}/duplicate`, {
      method: 'POST',
      headers: lockedHeaders,
      body: JSON.stringify({ name: 'Locked duplicate' }),
    });
    expect(duplicateResp.status).toBe(403);

    const writeResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: lockedHeaders,
      body: JSON.stringify({ name: 'locked.txt', content: 'locked' }),
    });
    expect(writeResp.status).toBe(403);

    const uploadForm = new FormData();
    uploadForm.append('files', new Blob(['locked'], { type: 'text/plain' }), 'locked-upload.txt');
    const { 'content-type': _uploadContentType, ...uploadHeaders } = lockedHeaders;
    const uploadResp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      headers: uploadHeaders,
      body: uploadForm,
    });
    expect(uploadResp.status).toBe(403);
  });

  it('rejects member batch-delete for unknown legacy ownership and allows privileged delete', async () => {
    const suffix = Date.now();
    const memberProjectId = `workspace-delete-member-${suffix}`;
    const adminProjectId = `workspace-delete-admin-${suffix}`;
    await createProject(memberProjectId, 'Member project');
    await list('member-a');
    await createProject(adminProjectId, 'Admin project');
    await list('member-admin');

    const memberResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-a'),
      body: JSON.stringify({ projectIds: [memberProjectId] }),
    });
    expect(memberResp.status).toBe(403);

    const memberStillExists = await fetch(`${baseUrl}/api/projects/${memberProjectId}`, {
      headers: headers('member-a'),
    });
    expect(memberStillExists.status).toBe(200);

    const adminResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-admin', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [adminProjectId] }),
    });
    expect(adminResp.status).toBe(200);
    const deleted = await adminResp.json() as { deletedProjectIds: string[] };
    expect(deleted.deletedProjectIds).toEqual([adminProjectId]);

    const adminGone = await fetch(`${baseUrl}/api/projects/${adminProjectId}`);
    expect(adminGone.status).toBe(404);
  });

  // A project has ONE workspace, so deleting it from that workspace deletes it
  // outright — there is no second projection left holding it alive. This used to
  // assert the opposite (that workspace B still listed it), which only held
  // because the back-fill had put a copy of every project in every workspace.
  it('deletes the project outright when its one workspace deletes it', async () => {
    const suffix = Date.now();
    const projectId = `workspace-delete-shared-${suffix}`;
    const workspaceA = `${workspaceId}-delete-a-${suffix}`;
    const workspaceB = `${workspaceId}-delete-b-${suffix}`;
    await createProject(projectId, 'Shared delete fixture');

    const bodyA = await listInWorkspace(workspaceA, 'member-delete-a', '?view=all');
    expect(bodyA.projects.some((item) => item.id === projectId)).toBe(true);
    const bodyB = await listInWorkspace(workspaceB, 'member-delete-b', '?view=all');
    expect(bodyB.projects.some((item) => item.id === projectId)).toBe(false);

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceA}/projects/batch-delete`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceA, 'member-delete-a', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [projectId] }),
    });
    expect(deleteResp.status).toBe(200);

    const baseProject = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(baseProject.status).toBe(404);
  });

  it('blocks deleting team-visible projects until the unshare seam exists', async () => {
    const projectId = `workspace-delete-team-${Date.now()}`;
    await createProject(projectId, 'Team delete fixture');

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-delete-team', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-delete-team', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      }),
      body: JSON.stringify({ projectIds: [projectId] }),
    });

    expect(deleteResp.status).toBe(403);
    await expect(deleteResp.json()).resolves.toMatchObject({
      error: {
        code: 'PROJECT_UNSHARE_UNSUPPORTED',
      },
    });

    const stillExists = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: headers('member-delete-team', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      }),
    });
    expect(stillExists.status).toBe(200);
  });

  it('fails batch-delete when project directory cleanup fails', async () => {
    const projectId = `workspace-delete-cleanup-fails-${Date.now()}`;
    const dbDeleteProject = vi.fn();
    const removeProjectDir = vi.fn(async () => {
      throw new Error('cleanup failed');
    });
    const stageProjectDirsForDelete = vi.fn(async () => {
      throw new Error('cleanup failed');
    });
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject,
      removeProjectDir,
      stageProjectDirsForDelete,
      countWorkspaceProjectRefs: vi.fn(() => 1),
    }));
    const routeServer = await listen(app);
    try {
      const deleteResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/batch-delete`, {
        method: 'POST',
        headers: headers('member-cleanup-fail'),
        body: JSON.stringify({ projectIds: [projectId] }),
      });
      expect(deleteResp.status).toBe(400);
      expect(stageProjectDirsForDelete).toHaveBeenCalledWith('projects', [projectId], 'id');
      expect(removeProjectDir).not.toHaveBeenCalled();
      expect(dbDeleteProject).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });

  it('merges Vela team-project catalog entries as read-only member-discovery projects', async () => {
    const localProjectId = `workspace-local-${Date.now()}`;
    const remoteProjectId = `workspace-remote-${Date.now()}`;
    const remoteResourceId = `project-remote-${remoteProjectId}`;
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${remoteProjectId}`,
          workspaceId,
          projectId: remoteProjectId,
          resourceId: remoteResourceId,
          ownerMemberId: 'member-owner',
          displayName: 'Remote shared project',
          syncState: 'synced',
          lastSyncedVersionId: 'version-1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: {
            canView: true,
            canComment: true,
            canEdit: true,
            frozen: false,
          },
        },
      ]),
      upsert: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId: localProjectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      teamProjectCatalog,
    }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?view=team`, {
        headers: headers('member-viewer', { 'x-od-workspace-type': 'team' }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json() as { projects: Array<any> };
      expect(teamProjectCatalog.list).toHaveBeenCalledWith({
        memberId: 'member-viewer',
        teamId: workspaceId,
        role: 'member',
        lifecycleState: 'active',
      });
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0]).toMatchObject({
        id: remoteResourceId,
        name: 'Remote shared project',
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-owner',
        resourceHubResourceId: remoteResourceId,
        syncState: 'synced',
        currentUserAccess: {
          canOpen: true,
          canRename: false,
          canDelete: false,
          canMoveToPersonal: false,
          canRestoreVersion: false,
          canExport: true,
        },
      });
      expect(body.projects[0].project.id).toBe(remoteProjectId);
      expect(body.projects[0].project.workspaceId).toBe(workspaceId);
      expect(body.projects[0].project.metadata).toEqual({
        sharedProjectPlaceholderAt: 20,
      });
    } finally {
      await close(routeServer.server);
    }
  });

  it.each([
    ['syncing', 'pending_upload'],
    ['failed', 'sync_failed'],
  ] as const)(
    'uses the catalog title without persisting a foreign mirror as locally owned (%s)',
    async (remoteSyncState, expectedSyncState) => {
    const projectId = `workspace-materialized-placeholder-${Date.now()}`;
    const adminMemberId = 'member-admin-viewer';
    const ownerMemberId = 'member-project-owner';
    const resourceId = `project-resource-${projectId}`;
    const rebindWorkspaceProject = vi.fn();
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-wrong-workspace-${projectId}`,
          workspaceId: 'ws-other',
          projectId,
          resourceId,
          ownerMemberId,
          displayName: 'Wrong workspace title',
          syncState: 'synced',
          lastSyncedVersionId: 'version-wrong-workspace',
          createdAt: new Date(1).toISOString(),
          updatedAt: new Date(2).toISOString(),
          access: {
            canView: true,
            canComment: true,
            canEdit: false,
            frozen: false,
          },
        },
        {
          id: `catalog-${projectId}`,
          workspaceId,
          projectId,
          resourceId,
          ownerMemberId,
          displayName: 'Owner project title',
          syncState: remoteSyncState,
          lastSyncedVersionId: 'version-1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: {
            canView: true,
            canComment: true,
            canEdit: false,
            frozen: false,
          },
        },
      ]),
      upsert: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      teamProjectCatalog,
      rebindWorkspaceProject,
      workspaceRowOverrides: {
        name: '共享项目',
        visibility: 'team',
        workspaceVisibility: 'team',
        resourceHubResourceId: resourceId,
        createdByWorkspaceMemberId: null,
        updatedByWorkspaceMemberId: adminMemberId,
        syncState: 'synced',
      },
    }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?view=team`, {
        headers: headers(adminMemberId, {
          'x-od-workspace-type': 'team',
          'x-od-workspace-role': 'admin',
        }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json() as { projects: Array<any> };
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0]).toMatchObject({
        id: projectId,
        name: 'Owner project title',
        createdByWorkspaceMemberId: ownerMemberId,
        updatedByWorkspaceMemberId: adminMemberId,
        resourceHubResourceId: resourceId,
        currentUserAccess: {
          canRename: false,
          canDelete: false,
          canMoveToPersonal: false,
        },
        project: {
          id: projectId,
          name: 'Owner project title',
        },
        syncState: expectedSyncState,
      });
      expect(rebindWorkspaceProject).toHaveBeenCalledWith(
        expect.anything(),
        projectId,
        expect.objectContaining({
          workspaceId,
          visibility: 'team',
          createdByWorkspaceMemberId: null,
          updatedByWorkspaceMemberId: adminMemberId,
          resourceHubResourceId: resourceId,
          syncState: expectedSyncState,
        }),
      );
      const persistedPatch = rebindWorkspaceProject.mock.calls[0]?.[2] as {
        createdByWorkspaceMemberId?: string | null;
      };
      expect(recoverPersistedTeamShareOwnership({
        projectId,
        workspaceId,
        createdByWorkspaceMemberId: persistedPatch.createdByWorkspaceMemberId ?? null,
        updatedByWorkspaceMemberId: adminMemberId,
      })).toBeNull();
      expect(teamProjectCatalog.list).toHaveBeenCalledTimes(1);
      expect(teamProjectCatalog.list).toHaveBeenCalledWith({
        memberId: adminMemberId,
        teamId: workspaceId,
        role: 'admin',
        lifecycleState: 'active',
      });
    } finally {
      await close(routeServer.server);
    }
    },
  );

  it('does not merge remote team projects into a personal workspace list (isolation)', async () => {
    const remoteProjectId = `workspace-personal-leak-${Date.now()}`;
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${remoteProjectId}`,
          workspaceId,
          projectId: remoteProjectId,
          resourceId: `project-remote-${remoteProjectId}`,
          ownerMemberId: 'member-owner',
          displayName: 'Team project that must not leak',
          syncState: 'synced',
          lastSyncedVersionId: 'version-1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: { canView: true, canComment: true, canEdit: true, frozen: false },
        },
      ]),
      upsert: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId: `workspace-personal-local-${Date.now()}`,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      teamProjectCatalog,
    }));
    const routeServer = await listen(app);
    try {
      // Personal workspace context (no team type header). The Vela team catalog
      // lister is scoped to the active team, so without the workspace-type guard
      // the team project would leak into — and duplicate within — the personal
      // list. A personal workspace must never fetch or merge team projects.
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?view=all`, {
        headers: headers('member-personal'),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json() as { projects: Array<any> };
      expect(body.projects.some((item) => item.id === remoteProjectId)).toBe(false);
      expect(teamProjectCatalog.list).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });

  it('keeps remote team-project discovery entries distinct from local-id collisions', async () => {
    const collidingProjectId = `workspace-collide-${Date.now()}`;
    const remoteA = `resource-a-${collidingProjectId}`;
    const remoteB = `resource-b-${collidingProjectId}`;
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-a-${collidingProjectId}`,
          workspaceId,
          projectId: collidingProjectId,
          resourceId: remoteA,
          ownerMemberId: 'member-owner-a',
          displayName: 'Remote A',
          syncState: 'synced',
          lastSyncedVersionId: 'version-a',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: {
            canView: true,
            canComment: true,
            canEdit: true,
            frozen: false,
          },
        },
        {
          id: `catalog-b-${collidingProjectId}`,
          workspaceId,
          projectId: collidingProjectId,
          resourceId: remoteB,
          ownerMemberId: 'member-owner-b',
          displayName: 'Remote B',
          syncState: 'synced',
          lastSyncedVersionId: 'version-b',
          createdAt: new Date(11).toISOString(),
          updatedAt: new Date(21).toISOString(),
          access: {
            canView: true,
            canComment: true,
            canEdit: true,
            frozen: false,
          },
        },
      ]),
      upsert: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId: collidingProjectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      teamProjectCatalog,
    }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?view=team`, {
        headers: headers('member-viewer', { 'x-od-workspace-type': 'team' }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json() as { projects: Array<any> };
      expect(body.projects.map((project: any) => project.id)).toEqual(
        expect.arrayContaining([remoteA, remoteB]),
      );
      expect(new Set(body.projects.map((project: any) => project.id)).size).toBe(body.projects.length);
      expect(body.projects.every((project: any) => project.project.id === collidingProjectId)).toBe(true);
    } finally {
      await close(routeServer.server);
    }
  });

  // RED LINE — "move back to 仅自己" must stick. The move route deletes the hub
  // catalog row in the same request, but the team catalog is read through a
  // stale-while-revalidate cache, so the next list can still carry the row that
  // was just removed. The move also nulls `resourceHubResourceId` — the key the
  // remote merge dedupes on — so before the fix that stale row came back as a
  // `visibility: 'team'` card and the project re-shared itself a moment after
  // the user unshared it, with no way to undo (a remote summary is never
  // `canMoveToPersonal`). The local `cloudTombstonedAt` is the truth here.
  it('does not resurrect a project the member just unshared from a stale team catalog', async () => {
    const projectId = `workspace-unshare-tombstone-${Date.now()}`;
    const memberId = 'member-unshare-tombstone';
    const staleResourceId = projectResourceIdFor(projectId, workspacePrincipal(memberId, workspaceId, 'admin'));
    // The catalog still reports the project as shared — exactly what the SWR
    // cache serves for a few seconds after the hub row has been deleted.
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${projectId}`,
          workspaceId,
          projectId,
          resourceId: staleResourceId,
          ownerMemberId: memberId,
          displayName: 'Just unshared',
          syncState: 'synced',
          lastSyncedVersionId: 'version-1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: { canView: true, canComment: true, canEdit: true, frozen: false },
        },
      ]),
      upsert: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      teamProjectCatalog,
      // The state the move route leaves behind after a successful unshare.
      workspaceRowOverrides: {
        workspaceVisibility: 'personal',
        resourceHubResourceId: null,
        cloudTombstonedAt: 1_700_000_000_000,
        createdByWorkspaceMemberId: memberId,
        updatedByWorkspaceMemberId: memberId,
      },
    }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?view=all`, {
        headers: headers(memberId, { 'x-od-workspace-type': 'team', 'x-od-workspace-role': 'admin' }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json() as { projects: Array<any> };
      const entries = body.projects.filter((item: any) => item.project?.id === projectId);
      expect(entries).toHaveLength(1);
      expect(entries[0].visibility).toBe('personal');
      // The stale catalog row must not come back as a second, team-visible card.
      expect(body.projects.some((item: any) => item.id === staleResourceId)).toBe(false);
    } finally {
      await close(routeServer.server);
    }
  });

  // The tombstone gate must stay owner-scoped: unsharing my own copy cannot
  // hide a teammate's share of the same project id.
  it('still shows a teammate share of a project id the reader has tombstoned', async () => {
    const projectId = `workspace-unshare-teammate-${Date.now()}`;
    const memberId = 'member-unshare-teammate';
    const teammateResourceId = `resource-teammate-${projectId}`;
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${projectId}`,
          workspaceId,
          projectId,
          resourceId: teammateResourceId,
          ownerMemberId: 'member-someone-else',
          displayName: 'Teammate share',
          syncState: 'synced',
          lastSyncedVersionId: 'version-1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: { canView: true, canComment: true, canEdit: true, frozen: false },
        },
      ]),
      upsert: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      teamProjectCatalog,
      workspaceRowOverrides: {
        workspaceVisibility: 'personal',
        resourceHubResourceId: null,
        cloudTombstonedAt: 1_700_000_000_000,
        createdByWorkspaceMemberId: memberId,
        updatedByWorkspaceMemberId: memberId,
      },
    }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?view=all`, {
        headers: headers(memberId, { 'x-od-workspace-type': 'team', 'x-od-workspace-role': 'admin' }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json() as { projects: Array<any> };
      expect(body.projects.some((item: any) => item.id === teammateResourceId)).toBe(true);
    } finally {
      await close(routeServer.server);
    }
  });

  it('includes remote team-project catalog entries in owner-scoped lists', async () => {
    const localProjectId = `workspace-local-owner-${Date.now()}`;
    const remoteProjectId = `workspace-remote-owner-${Date.now()}`;
    const remoteResourceId = `project-remote-${remoteProjectId}`;
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${remoteProjectId}`,
          workspaceId,
          projectId: remoteProjectId,
          resourceId: remoteResourceId,
          ownerMemberId: 'member-owner',
          displayName: 'Remote owned project',
          syncState: 'synced',
          lastSyncedVersionId: 'version-1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: {
            canView: true,
            canComment: true,
            canEdit: true,
            frozen: false,
          },
        },
      ]),
      upsert: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId: localProjectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      teamProjectCatalog,
    }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?owner=others`, {
        headers: headers('member-viewer', { 'x-od-workspace-type': 'team' }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json() as { projects: Array<any> };
      expect(teamProjectCatalog.list).toHaveBeenCalled();
      expect(body.projects.some((item: any) => item.id === remoteResourceId)).toBe(true);
    } finally {
      await close(routeServer.server);
    }
  });

  it('fails workspace project listing when the remote team catalog is unavailable', async () => {
    const projectId = `workspace-catalog-fails-${Date.now()}`;
    const teamProjectCatalog = {
      list: vi.fn(async () => {
        throw new Error('catalog unavailable');
      }),
      upsert: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      teamProjectCatalog,
      workspaceRowOverrides: {
        createdByWorkspaceMemberId: 'member-viewer',
        updatedByWorkspaceMemberId: 'member-viewer',
      },
    }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?view=team`, {
        headers: headers('member-viewer', { 'x-od-workspace-type': 'team' }),
      });
      expect(resp.status).toBe(502);
      await expect(resp.json()).resolves.toMatchObject({
        error: {
          code: 'TEAM_PROJECT_CATALOG_UNAVAILABLE',
        },
      });

      teamProjectCatalog.list.mockClear();
      const personalResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?visibility=personal`, {
        headers: headers('member-viewer', { 'x-od-workspace-type': 'team' }),
      });
      expect(personalResp.status).toBe(200);
      await expect(personalResp.json()).resolves.toMatchObject({
        projects: [
          {
            id: projectId,
            visibility: 'personal',
          },
        ],
      });
      expect(teamProjectCatalog.list).not.toHaveBeenCalled();

      const personalOwnerResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?owner=mine&visibility=personal`, {
        headers: headers('member-viewer', { 'x-od-workspace-type': 'team' }),
      });
      expect(personalOwnerResp.status).toBe(200);
      expect(teamProjectCatalog.list).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });

  // Acceptance #53: a project the user had just shared did not show up in
  // 全部项目 for ~17s. The client refetches as soon as the move responds, but
  // that read was served the pre-move list out of the daemon's SWR cache, so
  // the new row waited for a later poll — up to 60s once SSE lowers the
  // client's cadence. The move has to drop the cache it just invalidated.
  it('drops the cached team-project catalog after a visibility change', async () => {
    const projectId = `workspace-share-invalidate-${Date.now()}`;
    const invalidateTeamProjectCatalog = vi.fn();
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      collabSync: {
        requestTeamShare: vi.fn(async () => ({ version: 1 })),
        requestTeamUnshare: vi.fn(async () => {}),
        invalidateTeamProjectCatalog,
      },
    }));
    const routeServer = await listen(app);
    try {
      const moveResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
        method: 'POST',
        headers: headers('member-share-principal', {
          'x-od-workspace-role': 'admin',
          'x-od-workspace-lifecycle-state': 'active',
        }),
        body: JSON.stringify({ visibility: 'team' }),
      });
      expect(moveResp.status).toBe(200);
      expect(invalidateTeamProjectCatalog).toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });

  // The invalidation is an optimization layered on top of a write that already
  // landed. A seam that throws must not turn a successful share into a failure.
  it('still reports the move as succeeded when catalog invalidation throws', async () => {
    const projectId = `workspace-share-invalidate-throws-${Date.now()}`;
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      collabSync: {
        requestTeamShare: vi.fn(async () => ({ version: 1 })),
        requestTeamUnshare: vi.fn(async () => {}),
        invalidateTeamProjectCatalog: vi.fn(() => {
          throw new Error('cache seam exploded');
        }),
      },
    }));
    const routeServer = await listen(app);
    try {
      const moveResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
        method: 'POST',
        headers: headers('member-share-principal', {
          'x-od-workspace-role': 'admin',
          'x-od-workspace-lifecycle-state': 'active',
        }),
        body: JSON.stringify({ visibility: 'team' }),
      });
      expect(moveResp.status).toBe(200);
    } finally {
      await close(routeServer.server);
    }
  });

  it('passes the authorized workspace principal into the team-share sync seam', async () => {
    const projectId = `workspace-share-principal-${Date.now()}`;
    const requestTeamShare = vi.fn(async () => ({ version: 1 }));
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      collabSync: { requestTeamShare },
    }));
    const routeServer = await listen(app);
    try {
      const moveResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
        method: 'POST',
        headers: headers('member-share-principal', {
          'x-od-workspace-role': 'admin',
          'x-od-workspace-lifecycle-state': 'active',
        }),
        body: JSON.stringify({ visibility: 'team' }),
      });
      expect(moveResp.status).toBe(200);
      expect(requestTeamShare).toHaveBeenCalledWith(projectId, {
        memberId: 'member-share-principal',
        teamId: workspaceId,
        role: 'admin',
        lifecycleState: 'active',
      });
    } finally {
      await close(routeServer.server);
    }
  });

  it('does not mark workspace projects as team-visible when durable team share publishing fails', async () => {
    const projectId = `workspace-share-rejected-${Date.now()}`;
    const requestTeamShare = vi.fn(async () => {
      throw new Error('resource hub unavailable');
    });
    const updateWorkspaceProject = vi.fn();
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      collabSync: { requestTeamShare },
      updateWorkspaceProject,
    }));
    const routeServer = await listen(app);
    try {
      const moveResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
        method: 'POST',
        headers: headers('member-share-rejected', {
          'x-od-workspace-role': 'admin',
          'x-od-workspace-lifecycle-state': 'active',
        }),
        body: JSON.stringify({ visibility: 'team' }),
      });
      expect(moveResp.status).toBe(503);
      expect(requestTeamShare).toHaveBeenCalledWith(projectId, {
        memberId: 'member-share-rejected',
        teamId: workspaceId,
        role: 'admin',
        lifecycleState: 'active',
      });
      expect(updateWorkspaceProject).toHaveBeenCalledTimes(2);
      expect(updateWorkspaceProject.mock.calls[0]?.[3]).toMatchObject({
        visibility: 'team',
        syncState: 'pending_upload',
      });
      expect(updateWorkspaceProject.mock.calls[1]?.[3]).toMatchObject({
        visibility: 'personal',
        syncState: 'local_only',
        resourceHubResourceId: null,
      });
      updateWorkspaceProject.mockClear();
      requestTeamShare.mockClear();

      const batchResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/batch-move`, {
        method: 'POST',
        headers: headers('member-share-rejected', {
          'x-od-workspace-role': 'admin',
          'x-od-workspace-lifecycle-state': 'active',
        }),
        body: JSON.stringify({ projectIds: [projectId], visibility: 'team' }),
      });
      expect(batchResp.status).toBe(503);
      expect(updateWorkspaceProject).toHaveBeenCalledTimes(2);
      expect(updateWorkspaceProject.mock.calls[0]?.[3]).toMatchObject({
        visibility: 'team',
        syncState: 'pending_upload',
      });
      expect(updateWorkspaceProject.mock.calls[1]?.[3]).toMatchObject({
        visibility: 'personal',
        syncState: 'local_only',
        resourceHubResourceId: null,
      });
    } finally {
      await close(routeServer.server);
    }
  });

  it('retries a failed Team publish only for the exact recorded owner and Workspace', async () => {
    const projectId = `workspace-share-retry-${Date.now()}`;
    const memberId = 'member-share-retry';
    const requestTeamShare = vi.fn(async () => ({ version: 7 }));
    const updateWorkspaceProject = vi.fn();
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      collabSync: { requestTeamShare },
      updateWorkspaceProject,
      workspaceRowOverrides: {
        workspaceVisibility: 'team',
        createdByWorkspaceMemberId: memberId,
        updatedByWorkspaceMemberId: memberId,
        resourceHubResourceId: `resource-${projectId}`,
        syncState: 'sync_failed',
      },
    }));
    const routeServer = await listen(app);
    try {
      const retry = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
        method: 'POST',
        headers: headers(memberId, {
          'x-od-workspace-type': 'team',
          'x-od-workspace-role': 'member',
          'x-od-workspace-lifecycle-state': 'active',
        }),
        body: JSON.stringify({ visibility: 'team' }),
      });

      expect(retry.status).toBe(200);
      expect(requestTeamShare).toHaveBeenCalledTimes(1);
      expect(requestTeamShare).toHaveBeenCalledWith(projectId, {
        memberId,
        teamId: workspaceId,
        role: 'member',
        lifecycleState: 'active',
      });
      expect(updateWorkspaceProject).toHaveBeenCalledWith(
        expect.anything(),
        workspaceId,
        projectId,
        expect.objectContaining({
          visibility: 'team',
          createdByWorkspaceMemberId: memberId,
          resourceHubResourceId: expect.any(String),
          syncState: 'pending_upload',
        }),
      );
    } finally {
      await close(routeServer.server);
    }
  });

  it('does not let another member retry a failed Team publish', async () => {
    const projectId = `workspace-share-retry-foreign-${Date.now()}`;
    const requestTeamShare = vi.fn(async () => ({ version: 7 }));
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      collabSync: { requestTeamShare },
      workspaceRowOverrides: {
        workspaceVisibility: 'team',
        createdByWorkspaceMemberId: 'member-recorded-owner',
        updatedByWorkspaceMemberId: 'member-recorded-owner',
        resourceHubResourceId: `resource-${projectId}`,
        syncState: 'sync_failed',
      },
    }));
    const routeServer = await listen(app);
    try {
      const retry = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
        method: 'POST',
        headers: headers('member-other', {
          'x-od-workspace-type': 'team',
          'x-od-workspace-role': 'admin',
          'x-od-workspace-lifecycle-state': 'active',
        }),
        body: JSON.stringify({ visibility: 'team' }),
      });

      expect(retry.status).toBe(403);
      expect(requestTeamShare).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });

  it('preserves the failed Team binding when an exact-owner retry is still unavailable', async () => {
    const projectId = `workspace-share-retry-unavailable-${Date.now()}`;
    const memberId = 'member-share-retry-unavailable';
    const requestTeamShare = vi.fn(async () => {
      throw new Error('TLS handshake timeout');
    });
    const updateWorkspaceProject = vi.fn();
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      collabSync: { requestTeamShare },
      updateWorkspaceProject,
      workspaceRowOverrides: {
        workspaceVisibility: 'team',
        createdByWorkspaceMemberId: memberId,
        updatedByWorkspaceMemberId: memberId,
        resourceHubResourceId: `resource-${projectId}`,
        syncState: 'sync_failed',
      },
    }));
    const routeServer = await listen(app);
    try {
      const retry = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
        method: 'POST',
        headers: headers(memberId, {
          'x-od-workspace-type': 'team',
          'x-od-workspace-role': 'member',
          'x-od-workspace-lifecycle-state': 'active',
        }),
        body: JSON.stringify({ visibility: 'team' }),
      });

      expect(retry.status).toBe(503);
      await expect(retry.json()).resolves.toMatchObject({
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          retryable: true,
        },
      });
      expect(updateWorkspaceProject).toHaveBeenCalledTimes(2);
      expect(updateWorkspaceProject.mock.calls[1]?.[3]).toMatchObject({
        visibility: 'team',
        createdByWorkspaceMemberId: memberId,
        resourceHubResourceId: `resource-${projectId}`,
        syncState: 'sync_failed',
      });
    } finally {
      await close(routeServer.server);
    }
  });

  it('blocks moving frozen team projects back to personal', async () => {
    const projectId = `workspace-frozen-${Date.now()}`;
    await createProject(projectId, 'Frozen project');
    await list('member-frozen');

    const moveToTeam = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-frozen', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveToTeam.status).toBe(200);
    const shareStatus = await fetch(`${baseUrl}/api/projects/${projectId}/collab/status`, {
      headers: headers('member-frozen', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      }),
    });
    expect(shareStatus.status).toBe(200);
    const share = await shareStatus.json() as { syncState: string; ownerMemberId: string | null };
    expect(['pending_upload', 'synced']).toContain(share.syncState);
    expect(share.ownerMemberId).toBe('member-frozen');

    const lockedList = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?view=team`, {
      headers: headers('member-frozen', { 'x-od-workspace-lifecycle-state': 'locked' }),
    });
    expect(lockedList.status).toBe(200);
    const lockedBody = await lockedList.json() as { projects: Array<any> };
    const frozen = lockedBody.projects.find((item: any) => item.id === projectId);
    expect(frozen.resourceState).toBe('frozen');
    expect(frozen.currentUserAccess.canMoveToPersonal).toBe(false);
    expect(frozen.currentUserAccess.canDuplicate).toBe(false);

    const moveToPersonal = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-frozen', { 'x-od-workspace-lifecycle-state': 'locked' }),
      body: JSON.stringify({ visibility: 'personal' }),
    });
    expect(moveToPersonal.status).toBe(403);
  });

  it('derives sharing authority from verified role instead of caller-supplied permission bits', async () => {
    const projectId = `workspace-share-permission-${Date.now()}`;
    await createProjectInWorkspace(
      projectId,
      'Share permission project',
      'member-share-permission',
      {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      },
    );

    const bodyResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?visibility=personal`, {
      headers: headers('member-share-permission', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
      }),
    });
    expect(bodyResp.status).toBe(200);
    const body = await bodyResp.json() as { projects: Array<any> };
    const project = body.projects.find((item: any) => item.id === projectId);
    expect(project.currentUserAccess.canRename).toBe(true);
    expect(project.currentUserAccess.canMoveToTeam).toBe(true);

    const restrictedList = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?visibility=personal`, {
      headers: headers('member-share-permission', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
        'x-od-workspace-can-share-projects': 'false',
      }),
    });
    expect(restrictedList.status).toBe(200);
    const restrictedBody = await restrictedList.json() as { projects: Array<any> };
    const restrictedProject = restrictedBody.projects.find((item: any) => item.id === projectId);
    expect(restrictedProject.currentUserAccess.canRename).toBe(true);
    expect(restrictedProject.currentUserAccess.canMoveToTeam).toBe(false);

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-share-permission', {
        'x-od-workspace-type': 'team',
        'x-od-workspace-role': 'admin',
        'x-od-workspace-can-share-projects': 'false',
      }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);
  });
});

function workspaceProjectRouteDeps({
  workspaceId,
  projectId,
  dbDeleteProject,
  removeProjectDir,
  stageProjectDirsForDelete,
  deleteWorkspaceProject,
  countWorkspaceProjectRefs,
  teamProjectCatalog,
  collabSync,
  updateWorkspaceProject,
  rebindWorkspaceProject,
  workspaceRowOverrides,
}: {
  workspaceId: string;
  projectId: string;
  dbDeleteProject: ReturnType<typeof vi.fn>;
  removeProjectDir: ReturnType<typeof vi.fn>;
  stageProjectDirsForDelete?: ReturnType<typeof vi.fn>;
  deleteWorkspaceProject?: ReturnType<typeof vi.fn>;
  countWorkspaceProjectRefs?: ReturnType<typeof vi.fn>;
  teamProjectCatalog?: unknown;
  collabSync?: unknown;
  updateWorkspaceProject?: ReturnType<typeof vi.fn>;
  rebindWorkspaceProject?: ReturnType<typeof vi.fn>;
  workspaceRowOverrides?: Record<string, unknown>;
}) {
  const now = 1;
  const project = {
    id: projectId,
    name: 'Cleanup failure project',
    skillId: null,
    designSystemId: null,
    pendingPrompt: null,
    metadataJson: null,
    createdAt: now,
    updatedAt: now,
  };
  const workspaceRow = {
    ...project,
    workspaceProjectId: projectId,
    workspaceId,
    workspaceVisibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: 'member-cleanup-fail',
    updatedByWorkspaceMemberId: 'member-cleanup-fail',
    resourceHubResourceId: null,
    cloudTombstonedAt: null,
    syncState: 'local_only',
    workspaceVersion: 1,
    workspaceCreatedAt: now,
    workspaceUpdatedAt: now,
    ...workspaceRowOverrides,
  };
  const noop = vi.fn();
  return {
    db: {
      transaction: (fn: (ids: string[]) => void) => fn,
      // Successful Team shares now preserve the comment foreign-key invariant
      // by ensuring one local conversation after the visibility write. These
      // route tests isolate share/catalog behavior behind a synthetic project
      // store rather than a real SQLite database, so model the pre-existing
      // anchor that is unrelated to their assertions. Keep the SQL surface
      // deliberately narrow: an unexpected direct database query must still
      // fail instead of being silently accepted by an all-purpose stub.
      prepare: (sql: string) => {
        if (/FROM conversations\b/.test(sql)) {
          return {
            get: () => ({ id: `comment-anchor-${projectId}` }),
          };
        }
        throw new Error(`unexpected direct SQLite query in workspace route fixture: ${sql}`);
      },
    },
    design: {},
    http: {
      createSseResponse: noop,
      sendApiError: (res: any, status: number, code: string, message: string, init: Record<string, unknown> = {}) =>
        res.status(status).json({ error: { code, message, ...init } }),
    },
    paths: {
      DESIGN_SYSTEMS_DIR: '',
      PROJECTS_DIR: 'projects',
      SKILLS_DIR: '',
      BRANDS_DIR: '',
      USER_DESIGN_SYSTEMS_DIR: '',
    },
    projectStore: {
      insertProject: noop,
      validateLinkedDirs: () => ({ dirs: [] }),
      getProject: (_db: unknown, requestedProjectId: string) =>
        requestedProjectId === projectId ? project : null,
      updateProject: noop,
      dbDeleteProject,
      removeProjectDir,
      stageProjectDirsForDelete: stageProjectDirsForDelete ?? vi.fn(async () => ({
        rollback: vi.fn(async () => {}),
        commit: vi.fn(async () => {}),
      })),
      deleteWorkspaceProject: deleteWorkspaceProject ?? noop,
      countWorkspaceProjectRefs: countWorkspaceProjectRefs ?? vi.fn(() => 1),
      ensureWorkspaceProject: () => workspaceRow,
      getWorkspaceProject: () => workspaceRow,
      // A project belongs to one workspace, so the routes look its binding up by
      // project id alone (see collab/workspace-project-home.ts).
      getWorkspaceProjectByProjectId: () => workspaceRow,
      listWorkspaceProjectBindings: () => new Map([[projectId, workspaceId]]),
      listWorkspaceProjects: () => [workspaceRow],
      updateWorkspaceProject: updateWorkspaceProject ?? noop,
      rebindWorkspaceProject: rebindWorkspaceProject ?? noop,
    },
    projectFiles: {
      writeProjectFile: noop,
      readProjectFile: noop,
      ensureProject: noop,
      listFiles: () => [],
      listTabs: () => [],
      setTabs: noop,
      resolveProjectDir: () => '',
    },
    conversations: { insertConversation: noop },
    templates: {
      getTemplate: noop,
      listTemplates: () => [],
      deleteTemplate: noop,
      insertTemplate: noop,
      findTemplateByNameAndProject: noop,
      updateTemplate: noop,
    },
    status: {
      listLatestProjectRunStatuses: () => new Map(),
      listProjectsAwaitingInput: () => new Set(),
      normalizeProjectDisplayStatus: (status: string) => status,
      composeProjectDisplayStatus: (status: unknown) => status,
      listProjects: () => [],
    },
    events: {
      subscribeFileEvents: noop,
      activeProjectEventSinks: new Map(),
    },
    ids: { randomId: () => 'id' },
    telemetry: { reportFinalizedMessage: noop },
    appConfig: { readAppConfig: vi.fn(async () => ({})), writeAppConfig: noop },
    agents: {},
    validation: {
      validateProjectDesignSystemId: async () => ({ ok: true, id: null }),
      validateProjectSkillId: async () => ({ ok: true, id: null }),
    },
    collabSync: collabSync ?? { requestTeamShare: noop },
    teamProjectCatalog,
  } as unknown as Parameters<typeof registerProjectRoutes>[1];
}

async function listen(app: express.Express): Promise<{ server: http.Server; url: string }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe('workspace project list authority cache boundary', () => {
  it('reuses the bounded read witness while mutations still require fresh authority', async () => {
    const workspaceId = 'project-list-read-workspace';
    const projectId = 'project-list-read-project';
    const memberId = 'project-list-read-member';
    const fetchDirectory = vi.fn(async (): Promise<WorkspaceDirectoryFetchResult> => ({
      ok: true,
      items: [{
        workspaceId,
        workspaceName: 'Project list read workspace',
        workspaceType: 'team',
        workspaceMemberId: memberId,
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      }],
    }));
    const authority = createWorkspaceDirectoryAuthorityBroker({
      fetchDirectory,
      identityKey: () => 'project-list-read-session',
      ttlMs: 15_000,
    });
    const verifyWith = (
      fetchWorkspaceDirectory: () => Promise<WorkspaceDirectoryFetchResult>,
    ) => (req: express.Request) => verifyWorkspaceRequestContext({
      req,
      fetchWorkspaceDirectory,
    });
    const deps = workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
    }) as any;
    deps.verifyWorkspaceReadAuthority = verifyWith(authority.read);
    deps.verifyWorkspaceRequestAuthority = verifyWith(authority.fresh);

    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, deps);
    const routeServer = await listen(app);
    const headers = {
      'content-type': 'application/json',
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-member-id': memberId,
      'x-od-workspace-type': 'team',
      'x-od-workspace-role': 'owner',
    };

    try {
      for (let index = 0; index < 2; index += 1) {
        const response = await fetch(
          `${routeServer.url}/api/workspaces/${workspaceId}/projects?view=drafts`,
          { headers },
        );
        expect(response.status, await response.text()).toBe(200);
      }
      expect(fetchDirectory).toHaveBeenCalledTimes(1);

      const mutation = await fetch(
        `${routeServer.url}/api/workspaces/${workspaceId}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      );
      expect(mutation.status).toBe(400);
      expect(fetchDirectory).toHaveBeenCalledTimes(2);
    } finally {
      await close(routeServer.server);
    }
  });
});

describe('GET /api/projects/:id/workspace-scope route bootstrap', () => {
  const projectId = 'route-bootstrap-project-a';
  const workspaceId = 'route-bootstrap-workspace-a';
  const memberId = 'route-bootstrap-member-a';
  const activeMembership = {
    workspaceId,
    workspaceName: 'Workspace A',
    workspaceType: 'team' as const,
    workspaceMemberId: memberId,
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
  };

  async function startBootstrapRoute(options: {
    directory?: () => Promise<WorkspaceDirectoryFetchResult>;
    resourceState?: string;
    unbound?: boolean;
  } = {}) {
    const deps = workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject: vi.fn(),
      removeProjectDir: vi.fn(),
      workspaceRowOverrides: {
        workspaceVisibility: 'team',
        ...(options.resourceState ? { resourceState: options.resourceState } : {}),
      },
    }) as any;
    if (options.unbound) {
      deps.projectStore.getWorkspaceProject = () => null;
      deps.projectStore.getWorkspaceProjectByProjectId = () => null;
    }
    deps.fetchWorkspaceDirectory =
      options.directory
      ?? (async () => ({ ok: true, items: [activeMembership] }));
    deps.authorizeProjectRequest = vi.fn(async (
      req: express.Request,
      res: express.Response,
    ) => {
      if (options.unbound) return true;
      const claimedWorkspaceId = req.get('x-od-workspace-id');
      const claimedMemberId = req.get('x-od-workspace-member-id');
      if (!claimedWorkspaceId || !claimedMemberId) {
        res.status(400).json({
          error: { code: 'WORKSPACE_CONTEXT_INCOMPLETE' },
        });
        return false;
      }
      if (claimedWorkspaceId !== workspaceId || claimedMemberId !== memberId) {
        res.status(403).json({
          error: { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED' },
        });
        return false;
      }
      return true;
    });
    deps.http.sendApiError = (
      res: express.Response,
      status: number,
      code: string,
      message: string,
      details?: Record<string, unknown>,
    ) => res.status(status).json({ error: { code, message, ...details } });
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, deps);
    return listen(app);
  }

  it('returns exact A scope headerlessly while keeping project content behind explicit A headers', async () => {
    const routeServer = await startBootstrapRoute();
    try {
      const scope = await fetch(
        `${routeServer.url}/api/projects/${projectId}/workspace-scope`,
      );
      expect(scope.status).toBe(200);
      await expect(scope.json()).resolves.toMatchObject({
        scope: {
          kind: 'team',
          projectId,
          workspaceId,
          context: {
            workspaceId,
            workspaceMemberId: memberId,
          },
        },
      });

      const headerlessDetail = await fetch(
        `${routeServer.url}/api/projects/${projectId}`,
      );
      expect(headerlessDetail.status).toBe(400);
      const headerlessFiles = await fetch(
        `${routeServer.url}/api/projects/${projectId}/files`,
      );
      expect(headerlessFiles.status).not.toBe(200);

      const scopedDetail = await fetch(
        `${routeServer.url}/api/projects/${projectId}`,
        {
          headers: {
            'x-od-workspace-id': workspaceId,
            'x-od-workspace-member-id': memberId,
          },
        },
      );
      expect(scopedDetail.status).toBe(200);
    } finally {
      await close(routeServer.server);
    }
  });

  it('keeps partial and wrong explicit claims on the ordinary fail-closed gate', async () => {
    const routeServer = await startBootstrapRoute();
    try {
      const partial = await fetch(
        `${routeServer.url}/api/projects/${projectId}/workspace-scope`,
        { headers: { 'x-od-workspace-id': workspaceId } },
      );
      expect(partial.status).toBe(400);
      const wrong = await fetch(
        `${routeServer.url}/api/projects/${projectId}/workspace-scope`,
        {
          headers: {
            'x-od-workspace-id': workspaceId,
            'x-od-workspace-member-id': 'wrong-member',
          },
        },
      );
      expect(wrong.status).toBe(403);
    } finally {
      await close(routeServer.server);
    }
  });

  it('does not disclose scope for nonmembers, removed/deleted memberships, or deleted resources', async () => {
    const deniedCases = [
      {
        directory: async () => ({
          ok: true,
          items: [{ ...activeMembership, workspaceId: 'workspace-b' }],
        }),
      },
      {
        directory: async () => ({
          ok: true,
          items: [{ ...activeMembership, memberStatus: 'removed' as const }],
        }),
      },
      {
        directory: async () => ({
          ok: true,
          items: [{ ...activeMembership, lifecycleState: 'deleted' as const }],
        }),
      },
      {
        resourceState: 'deleted',
      },
    ];
    for (const denied of deniedCases) {
      const routeServer = await startBootstrapRoute(denied);
      try {
        const response = await fetch(
          `${routeServer.url}/api/projects/${projectId}/workspace-scope`,
        );
        expect(response.status).toBe(403);
        const text = await response.text();
        expect(text).not.toContain(workspaceId);
        expect(text).not.toContain(memberId);
      } finally {
        await close(routeServer.server);
      }
    }
  });

  it('returns retryable 503 on directory outage and 404 for a missing project', async () => {
    const routeServer = await startBootstrapRoute({
      directory: async () => {
        throw new Error('directory down');
      },
    });
    try {
      const outage = await fetch(
        `${routeServer.url}/api/projects/${projectId}/workspace-scope`,
      );
      expect(outage.status).toBe(503);
      await expect(outage.json()).resolves.toMatchObject({
        error: {
          code: 'WORKSPACE_DIRECTORY_UNAVAILABLE',
          retryable: true,
        },
      });
      const missing = await fetch(
        `${routeServer.url}/api/projects/missing-project/workspace-scope`,
      );
      expect(missing.status).toBe(404);
    } finally {
      await close(routeServer.server);
    }
  });

  it('keeps locked/frozen project reads available but read-only', async () => {
    const routeServer = await startBootstrapRoute({
      resourceState: 'frozen',
      directory: async () => ({
        ok: true,
        items: [{ ...activeMembership, lifecycleState: 'locked' as const }],
      }),
    });
    try {
      const response = await fetch(
        `${routeServer.url}/api/projects/${projectId}/workspace-scope`,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        scope: {
          kind: 'team',
          workspaceId,
          context: {
            lifecycleState: 'locked',
            permissions: {
              canShareProjects: false,
              canWriteSyncedFiles: false,
            },
          },
        },
      });
    } finally {
      await close(routeServer.server);
    }
  });

  it('preserves signed-out headerless scope and detail for an unbound local project', async () => {
    const routeServer = await startBootstrapRoute({
      unbound: true,
      directory: async () => {
        throw new Error('signed out');
      },
    });
    try {
      const scope = await fetch(
        `${routeServer.url}/api/projects/${projectId}/workspace-scope`,
      );
      expect(scope.status).toBe(200);
      await expect(scope.json()).resolves.toEqual({
        scope: {
          kind: 'unbound',
          projectId,
          workspaceId: null,
          context: null,
        },
      });
      expect(
        (await fetch(`${routeServer.url}/api/projects/${projectId}`)).status,
      ).toBe(200);
    } finally {
      await close(routeServer.server);
    }
  });
});
