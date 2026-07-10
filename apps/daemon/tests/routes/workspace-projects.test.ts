import express from 'express';
import type http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../../src/server.js';
import { registerProjectRoutes } from '../../src/routes/project/index.js';
import { projectResourceIdFor } from '../../src/integrations/vela-team-projects.js';

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

  async function list(memberId: string, query = '') {
    return listInWorkspace(workspaceId, memberId, query);
  }

  async function listInWorkspace(targetWorkspaceId: string, memberId: string, query = '') {
    const resp = await fetch(`${baseUrl}/api/workspaces/${targetWorkspaceId}/projects${query}`, {
      headers: workspaceHeaders(targetWorkspaceId, memberId),
    });
    if (resp.status !== 200) {
      throw new Error(`GET workspace projects failed ${resp.status}: ${await resp.text()}`);
    }
    return resp.json() as Promise<{ projects: Array<any> }>;
  }

  async function waitForWorkspaceProjectSyncState(memberId: string, projectId: string, syncState: string) {
    let project: any;
    for (let i = 0; i < 40; i += 1) {
      const body = await list(memberId, '?view=all');
      project = body.projects.find((item) => item.id === projectId);
      if (project?.syncState === syncState) return project;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return project;
  }

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

  it('projects the same legacy project independently per workspace', async () => {
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
    expect(bodyB.projects.find((item) => item.id === projectId)).toMatchObject({
      id: projectId,
      workspaceId: workspaceB,
      createdByWorkspaceMemberId: null,
    });
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

    const stillExists = await fetch(`${baseUrl}/api/projects/${projectId}`);
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

    expect(deleteResp.status).toBe(401);
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
    await createProject(draftId, 'Draft view fixture');
    await list('member-view');
    await createProject(teamId, 'Team view fixture');
    await list('member-view');
    await createProject(otherId, 'Other member view fixture');
    await list('member-other');

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${teamId}/move`, {
      method: 'POST',
      headers: headers('member-view', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    const all = await list('member-view', '?view=all');
    const recent = await list('member-view', '?view=recent');
    const drafts = await list('member-view', '?view=drafts');
    const team = await list('member-view', '?view=team');

    expect(all.projects.some((item) => item.id === draftId)).toBe(true);
    expect(recent.projects.map((item) => item.id)).toContain(draftId);
    expect(recent.projects.map((item) => item.id)).toContain(otherId);
    expect(recent.projects.map((item) => item.id)).not.toContain(teamId);
    expect(drafts.projects.map((item) => item.id)).not.toContain(draftId);
    expect(drafts.projects.map((item) => item.id)).not.toContain(teamId);
    expect(drafts.projects.map((item) => item.id)).not.toContain(otherId);
    expect(team.projects.map((item) => item.id)).toContain(teamId);
    expect(team.projects.map((item) => item.id)).not.toContain(draftId);

    const invalid = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?view=personal`, {
      headers: headers('member-view'),
    });
    expect(invalid.status).toBe(400);
  });

  it('projects legacy rows for batch operations without requiring a prior list request', async () => {
    const suffix = Date.now();
    const moveProjectId = `workspace-batch-move-${suffix}`;
    const deleteProjectId = `workspace-batch-delete-${suffix}`;
    await createProject(moveProjectId, 'Direct batch move project');
    await createProject(deleteProjectId, 'Direct batch delete project');

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-move`, {
      method: 'POST',
      headers: headers('member-direct', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [moveProjectId], visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);
    const moved = await moveResp.json() as { projects: Array<any> };
    expect(moved.projects[0]).toMatchObject({
      id: moveProjectId,
      visibility: 'team',
      syncState: 'pending_upload',
      resourceHubResourceId: projectResourceIdFor(moveProjectId, workspacePrincipal('member-direct', workspaceId, 'admin')),
      cloudTombstonedAt: null,
      createdByWorkspaceMemberId: 'member-direct',
      pendingSyncIntent: {
        event: 'project_team_share_requested',
        projectId: moveProjectId,
        workspaceId,
      },
    });

    const invalidMoveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-move`, {
      method: 'POST',
      headers: headers('member-direct', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [deleteProjectId, 123], visibility: 'team' }),
    });
    expect(invalidMoveResp.status).toBe(400);

    const afterInvalidMove = await list('member-direct', '?view=all');
    const untouched = afterInvalidMove.projects.find((item: any) => item.id === deleteProjectId);
    expect(untouched).toMatchObject({
      visibility: 'personal',
      syncState: 'local_only',
      resourceHubResourceId: null,
    });

    const invalidDeleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-direct', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [deleteProjectId, 123] }),
    });
    expect(invalidDeleteResp.status).toBe(400);

    const afterInvalidDelete = await fetch(`${baseUrl}/api/projects/${deleteProjectId}`);
    expect(afterInvalidDelete.status).toBe(200);
    const batchShareStatus = await fetch(`${baseUrl}/api/projects/${moveProjectId}/collab/status`);
    expect(batchShareStatus.status).toBe(200);
    const batchShare = await batchShareStatus.json() as { syncState: string; ownerMemberId: string | null };
    expect(['pending_upload', 'synced']).toContain(batchShare.syncState);
    expect(batchShare.ownerMemberId).toBe('member-direct');
    const syncedProject = await waitForWorkspaceProjectSyncState('member-direct', moveProjectId, 'synced');
    expect(syncedProject).toMatchObject({
      id: moveProjectId,
      syncState: 'synced',
      resourceHubResourceId: projectResourceIdFor(moveProjectId, workspacePrincipal('member-direct', workspaceId, 'admin')),
      createdByWorkspaceMemberId: 'member-direct',
    });
    expect(syncedProject.pendingSyncIntent).toBeUndefined();

    const moveBackResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${moveProjectId}/move`, {
      method: 'POST',
      headers: headers('member-direct', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ visibility: 'personal' }),
    });
    expect(moveBackResp.status).toBe(403);

    const batchMoveBackResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-move`, {
      method: 'POST',
      headers: headers('member-direct', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [moveProjectId], visibility: 'personal' }),
    });
    expect(batchMoveBackResp.status).toBe(403);

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-direct', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [deleteProjectId] }),
    });
    expect(deleteResp.status).toBe(200);

    const deleted = await fetch(`${baseUrl}/api/projects/${deleteProjectId}`);
    expect(deleted.status).toBe(404);
  });

  it('stamps the sharing member as owner when a legacy project moves to team', async () => {
    const projectId = `workspace-share-owner-${Date.now()}`;
    await createProject(projectId, 'Share owner project');

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-share-owner', { 'x-od-workspace-role': 'admin' }),
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

    const memberStillExists = await fetch(`${baseUrl}/api/projects/${memberProjectId}`);
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

  it('keeps a project available in other workspaces when batch-delete removes one workspace projection', async () => {
    const suffix = Date.now();
    const projectId = `workspace-delete-shared-${suffix}`;
    const workspaceA = `${workspaceId}-delete-a`;
    const workspaceB = `${workspaceId}-delete-b`;
    await createProject(projectId, 'Shared delete fixture');

    const bodyA = await listInWorkspace(workspaceA, 'member-delete-a', '?view=all');
    const bodyB = await listInWorkspace(workspaceB, 'member-delete-b', '?view=all');
    expect(bodyA.projects.some((item) => item.id === projectId)).toBe(true);
    expect(bodyB.projects.some((item) => item.id === projectId)).toBe(true);

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceA}/projects/batch-delete`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceA, 'member-delete-a', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [projectId] }),
    });
    expect(deleteResp.status).toBe(200);

    const baseProject = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(baseProject.status).toBe(200);

    const afterB = await listInWorkspace(workspaceB, 'member-delete-b', '?view=all');
    expect(afterB.projects.some((item) => item.id === projectId)).toBe(true);
  });

  it('blocks deleting team-visible projects until the unshare seam exists', async () => {
    const projectId = `workspace-delete-team-${Date.now()}`;
    await createProject(projectId, 'Team delete fixture');

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-delete-team', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-delete-team', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ projectIds: [projectId] }),
    });

    expect(deleteResp.status).toBe(403);
    await expect(deleteResp.json()).resolves.toMatchObject({
      error: {
        code: 'PROJECT_UNSHARE_UNSUPPORTED',
      },
    });

    const stillExists = await fetch(`${baseUrl}/api/projects/${projectId}`);
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
        headers: headers('member-viewer'),
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
        headers: headers('member-viewer'),
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
        headers: headers('member-viewer'),
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
    }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?view=team`, {
        headers: headers('member-viewer'),
      });
      expect(resp.status).toBe(502);
      await expect(resp.json()).resolves.toMatchObject({
        error: {
          code: 'TEAM_PROJECT_CATALOG_UNAVAILABLE',
        },
      });

      teamProjectCatalog.list.mockClear();
      const personalResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects?visibility=personal`, {
        headers: headers('member-viewer'),
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
        headers: headers('member-viewer'),
      });
      expect(personalOwnerResp.status).toBe(200);
      expect(teamProjectCatalog.list).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });

  it('passes the authorized workspace principal into the team-share sync seam', async () => {
    const projectId = `workspace-share-principal-${Date.now()}`;
    const requestTeamShare = vi.fn();
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

  it('blocks moving frozen team projects back to personal', async () => {
    const projectId = `workspace-frozen-${Date.now()}`;
    await createProject(projectId, 'Frozen project');
    await list('member-frozen');

    const moveToTeam = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-frozen', { 'x-od-workspace-role': 'admin' }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveToTeam.status).toBe(200);
    const shareStatus = await fetch(`${baseUrl}/api/projects/${projectId}/collab/status`);
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

  it('honors workspace permission bits when sharing personal projects', async () => {
    const projectId = `workspace-share-permission-${Date.now()}`;
    await createProject(projectId, 'Share permission project');

    const bodyResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?visibility=personal`, {
      headers: headers('member-share-permission', { 'x-od-workspace-role': 'admin' }),
    });
    expect(bodyResp.status).toBe(200);
    const body = await bodyResp.json() as { projects: Array<any> };
    const project = body.projects.find((item: any) => item.id === projectId);
    expect(project.currentUserAccess.canRename).toBe(true);
    expect(project.currentUserAccess.canMoveToTeam).toBe(true);

    const restrictedList = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?visibility=personal`, {
      headers: headers('member-share-permission', {
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
        'x-od-workspace-role': 'admin',
        'x-od-workspace-can-share-projects': 'false',
      }),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(403);
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
  };
  const noop = vi.fn();
  return {
    db: {
      transaction: (fn: (ids: string[]) => void) => fn,
    },
    design: {},
    http: {
      createSseResponse: noop,
      sendApiError: (res: any, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
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
      getProject: () => project,
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
      listWorkspaceProjects: () => [workspaceRow],
      updateWorkspaceProject: noop,
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
