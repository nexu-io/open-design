import express from 'express';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../../src/server.js';
import { registerProjectRoutes } from '../../src/routes/project/index.js';

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

  it('projects legacy rows into a workspace list with self-created ownership', async () => {
    const projectId = `workspace-list-${Date.now()}`;
    await createProject(projectId, 'Workspace list fixture');

    const body = await list('member-list', '?view=all');

    const project = body.projects.find((item) => item.id === projectId);
    expect(project).toMatchObject({
      id: projectId,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-list',
    });
    expect(project.currentUserAccess.canDelete).toBe(true);
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
      createdByWorkspaceMemberId: 'member-a',
    });
    expect(bodyB.projects.find((item) => item.id === projectId)).toMatchObject({
      id: projectId,
      workspaceId: workspaceB,
      createdByWorkspaceMemberId: 'member-b',
    });
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
      headers: headers('member-view'),
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);

    const all = await list('member-view', '?view=all');
    const drafts = await list('member-view', '?view=drafts');
    const team = await list('member-view', '?view=team');

    expect(all.projects.some((item) => item.id === draftId)).toBe(true);
    expect(drafts.projects.map((item) => item.id)).toContain(draftId);
    expect(drafts.projects.map((item) => item.id)).not.toContain(teamId);
    expect(drafts.projects.map((item) => item.id)).not.toContain(otherId);
    expect(team.projects.map((item) => item.id)).toContain(teamId);
    expect(team.projects.map((item) => item.id)).not.toContain(draftId);

    const recent = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?view=recent`, {
      headers: headers('member-view'),
    });
    expect(recent.status).toBe(400);

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
      headers: headers('member-direct'),
      body: JSON.stringify({ projectIds: [moveProjectId], visibility: 'team' }),
    });
    expect(moveResp.status).toBe(200);
    const moved = await moveResp.json() as { projects: Array<any> };
    expect(moved.projects[0]).toMatchObject({
      id: moveProjectId,
      visibility: 'team',
      syncState: 'pending_upload',
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      createdByWorkspaceMemberId: 'member-direct',
      pendingSyncIntent: {
        event: 'project_team_share_requested',
        projectId: moveProjectId,
        workspaceId,
      },
    });
    const batchShareStatus = await fetch(`${baseUrl}/api/projects/${moveProjectId}/collab/status`);
    expect(batchShareStatus.status).toBe(200);
    const batchShare = await batchShareStatus.json() as { syncState: string; ownerMemberId: string | null };
    expect(['pending_upload', 'synced']).toContain(batchShare.syncState);
    expect(batchShare.ownerMemberId).toBe('member-direct');

    const moveBackResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${moveProjectId}/move`, {
      method: 'POST',
      headers: headers('member-direct'),
      body: JSON.stringify({ visibility: 'personal' }),
    });
    expect(moveBackResp.status).toBe(200);
    const movedBack = await moveBackResp.json() as { project: any };
    expect(movedBack.project).toMatchObject({
      id: moveProjectId,
      visibility: 'personal',
      syncState: 'local_only',
      resourceHubResourceId: null,
    });
    expect(typeof movedBack.project.cloudTombstonedAt).toBe('number');

    const deleteResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-direct'),
      body: JSON.stringify({ projectIds: [deleteProjectId] }),
    });
    expect(deleteResp.status).toBe(200);

    const deleted = await fetch(`${baseUrl}/api/projects/${deleteProjectId}`);
    expect(deleted.status).toBe(404);
  });

  it('rejects mixed member batch-delete all-or-nothing and deletes self-created selections', async () => {
    const suffix = Date.now();
    const selfProjectId = `workspace-delete-self-${suffix}`;
    const otherProjectId = `workspace-delete-other-${suffix}`;
    await createProject(selfProjectId, 'Self project');
    await list('member-a');
    await createProject(otherProjectId, 'Other project');
    await list('member-b');

    const mixedResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-a'),
      body: JSON.stringify({ projectIds: [selfProjectId, otherProjectId] }),
    });
    expect(mixedResp.status).toBe(403);

    const selfStillExists = await fetch(`${baseUrl}/api/projects/${selfProjectId}`);
    const otherStillExists = await fetch(`${baseUrl}/api/projects/${otherProjectId}`);
    expect(selfStillExists.status).toBe(200);
    expect(otherStillExists.status).toBe(200);

    const selfOnlyResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/batch-delete`, {
      method: 'POST',
      headers: headers('member-a'),
      body: JSON.stringify({ projectIds: [selfProjectId] }),
    });
    expect(selfOnlyResp.status).toBe(200);
    const deleted = await selfOnlyResp.json() as { deletedProjectIds: string[] };
    expect(deleted.deletedProjectIds).toEqual([selfProjectId]);

    const selfGone = await fetch(`${baseUrl}/api/projects/${selfProjectId}`);
    const otherRemains = await fetch(`${baseUrl}/api/projects/${otherProjectId}`);
    expect(selfGone.status).toBe(404);
    expect(otherRemains.status).toBe(200);
  });

  it('fails batch-delete when project directory cleanup fails', async () => {
    const projectId = `workspace-delete-cleanup-fails-${Date.now()}`;
    const dbDeleteProject = vi.fn();
    const removeProjectDir = vi.fn(async () => {
      throw new Error('cleanup failed');
    });
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, workspaceProjectRouteDeps({
      workspaceId,
      projectId,
      dbDeleteProject,
      removeProjectDir,
    }));
    const routeServer = await listen(app);
    try {
      const deleteResp = await fetch(`${routeServer.url}/api/workspaces/${workspaceId}/projects/batch-delete`, {
        method: 'POST',
        headers: headers('member-cleanup-fail'),
        body: JSON.stringify({ projectIds: [projectId] }),
      });
      expect(deleteResp.status).toBe(400);
      expect(removeProjectDir).toHaveBeenCalledWith('projects', projectId);
      expect(dbDeleteProject).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });

  it('merges Vela team-project catalog entries as read-only member-discovery projects', async () => {
    const localProjectId = `workspace-local-${Date.now()}`;
    const remoteProjectId = `workspace-remote-${Date.now()}`;
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${remoteProjectId}`,
          workspaceId,
          projectId: remoteProjectId,
          resourceId: `project-${remoteProjectId}`,
          ownerMemberId: 'member-owner',
          displayName: 'Remote shared project',
          syncState: 'synced',
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
        id: remoteProjectId,
        name: 'Remote shared project',
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'member-owner',
        resourceHubResourceId: `project-${remoteProjectId}`,
        syncState: 'synced',
        currentUserAccess: {
          canOpen: true,
          canRename: false,
          canDelete: false,
          canMoveToPersonal: false,
          canExport: true,
        },
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
      headers: headers('member-frozen'),
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

    const body = await list('member-share-permission', '?visibility=personal');
    const project = body.projects.find((item: any) => item.id === projectId);
    expect(project.currentUserAccess.canRename).toBe(true);
    expect(project.currentUserAccess.canMoveToTeam).toBe(true);

    const restrictedList = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects?visibility=personal`, {
      headers: headers('member-share-permission', { 'x-od-workspace-can-share-projects': 'false' }),
    });
    expect(restrictedList.status).toBe(200);
    const restrictedBody = await restrictedList.json() as { projects: Array<any> };
    const restrictedProject = restrictedBody.projects.find((item: any) => item.id === projectId);
    expect(restrictedProject.currentUserAccess.canRename).toBe(true);
    expect(restrictedProject.currentUserAccess.canMoveToTeam).toBe(false);

    const moveResp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/move`, {
      method: 'POST',
      headers: headers('member-share-permission', { 'x-od-workspace-can-share-projects': 'false' }),
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
  teamProjectCatalog,
}: {
  workspaceId: string;
  projectId: string;
  dbDeleteProject: ReturnType<typeof vi.fn>;
  removeProjectDir: ReturnType<typeof vi.fn>;
  teamProjectCatalog?: unknown;
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
    appConfig: { readAppConfig: noop, writeAppConfig: noop },
    agents: {},
    validation: {
      validateProjectDesignSystemId: async () => ({ ok: true, id: null }),
      validateProjectSkillId: async () => ({ ok: true, id: null }),
    },
    collabSync: { requestTeamShare: noop },
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
