// Real-HTTP-layer coverage for `reconcileWorkspaceProjectsWithRemote`
// (collab/workspace-projects-reconciler.ts), wired to the REAL sqlite
// `workspace_projects` CRUD (db.ts) and asserted through the REAL
// `GET /api/workspaces/:workspaceId/projects` endpoint
// (routes/project/index.ts) — not a shallow "the function was called" check.
//
// The concrete, repeatedly-reported scenario this closes: a member's local
// `workspace_projects` row keeps claiming `visibility: 'team'` forever after
// the owner unshares (or deletes) the project, because neither the hub-push
// nor the 15s poller ever re-examined the row — they only refreshed the
// DISPLAY cache. See that file's header comment for the full design.
import express from 'express';
import type http from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerProjectRoutes } from '../../src/routes/project/index.js';
import {
  closeDatabase,
  ensureWorkspaceProject,
  insertConversation,
  getProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  listConversations,
  listWorkspaceProjectBindings,
  listWorkspaceProjects,
  openDatabase,
  rebindWorkspaceProject,
  updateProject,
  updateWorkspaceProject,
} from '../../src/db.js';
import {
  reconcileWorkspaceProjectsWithRemote,
  type LocalTeamProjectBinding,
  type RemoteTeamProjectRef,
} from '../../src/collab/workspace-projects-reconciler.js';
import { materializePulledTeamMirror } from '../../src/collab/team-mirror-materializer.js';
import { createAuthorizeProjectRequest } from '../../src/collab/project-request-authority.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';

const TEAM_WORKSPACE_ID = 'ws-team-1';
const OWNER_MEMBER_ID = 'member-owner';
const READER_MEMBER_ID = 'member-reader';

function readerTeamHeaders(extra: Record<string, string> = {}) {
  return {
    'content-type': 'application/json',
    'x-od-workspace-id': TEAM_WORKSPACE_ID,
    'x-od-workspace-member-id': READER_MEMBER_ID,
    'x-od-workspace-role': 'member',
    'x-od-workspace-type': 'team',
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
    ...extra,
  };
}

async function listen(app: express.Express): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('reconcileWorkspaceProjectsWithRemote, verified through the real workspace projects HTTP endpoint', () => {
  let tempDir: string;
  let projectsRoot: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'od-workspace-projects-reconcile-'));
    projectsRoot = path.join(tempDir, 'projects');
    db = openDatabase(projectsRoot, { dataDir: tempDir });
  });

  afterEach(async () => {
    closeDatabase();
    await rm(tempDir, { recursive: true, force: true });
  });

  // Real deps for `registerProjectRoutes`, wired to the SAME real sqlite db
  // the reconciler under test writes into — every `projectStore` function is
  // the genuine `db.ts` implementation, matching
  // `tests/routes/project-move-to-personal.test.ts`'s established pattern.
  function buildProjectRoutesDeps(
    teamProjectCatalog: { list: () => Promise<unknown[]> } | undefined,
    overrides: {
      ensureWorkspaceProject?: (db: unknown, input: unknown) => unknown;
      appConfig?: Record<string, unknown>;
      validateLinkedDirs?: (dirs: string[]) => { dirs: string[]; error?: string };
    } = {},
  ) {
    const noop = vi.fn();
    const sendApiError = (
      res: any,
      status: number,
      code: string,
      message: string,
    ) => res.status(status).json({ error: { code, message } });
    const verifiedContext = workspaceContextFromDirectoryItem({
      workspaceId: TEAM_WORKSPACE_ID,
      workspaceName: 'Team',
      workspaceType: 'team',
      workspaceMemberId: READER_MEMBER_ID,
      role: 'member',
      memberStatus: 'active',
      lifecycleState: 'active',
    });
    const authorizeProjectRequest = createAuthorizeProjectRequest({
      db,
      getWorkspaceProject: (_db, workspaceId, projectId) =>
        getWorkspaceProject(db, workspaceId, projectId),
      getWorkspaceProjectByProjectId: (_db, projectId) =>
        getWorkspaceProjectByProjectId(db, projectId),
      verifyWorkspaceReadAuthority: async () => ({
        ok: true,
        context: verifiedContext,
      }),
      verifyWorkspaceRequestAuthority: async () => ({
        ok: true,
        context: verifiedContext,
      }),
      sendApiError,
    });
    return {
      db,
      design: {},
      http: {
        createSseResponse: noop,
        sendApiError,
      },
      paths: {
        DESIGN_SYSTEMS_DIR: '',
        PROJECTS_DIR: projectsRoot,
        RUNTIME_DATA_DIR: tempDir,
        RUNTIME_DATA_DIR_CANONICAL: tempDir,
        SKILLS_DIR: '',
        BRANDS_DIR: path.join(tempDir, 'brands'),
        USER_DESIGN_SYSTEMS_DIR: path.join(tempDir, 'user-design-systems'),
      },
      projectStore: {
        insertProject: (row: any) => insertProject(db, row),
        validateLinkedDirs:
          overrides.validateLinkedDirs ?? (() => ({ dirs: [] })),
        getProject: (_db: unknown, id: string) => getProject(db, id),
        updateProject: noop,
        dbDeleteProject: noop,
        removeProjectDir: noop,
        stageProjectDirsForDelete: vi.fn(async () => ({ rollback: vi.fn(async () => {}), commit: vi.fn(async () => {}) })),
        deleteWorkspaceProject: noop,
        countWorkspaceProjectRefs: vi.fn(() => 1),
        ensureWorkspaceProject:
          overrides.ensureWorkspaceProject
          ?? ((_db: unknown, input: any) => ensureWorkspaceProject(db, input)),
        getWorkspaceProject: (_db: unknown, workspaceId: string, projectId: string) =>
          getWorkspaceProject(db, workspaceId, projectId),
        getWorkspaceProjectByProjectId: (_db: unknown, projectId: string) =>
          getWorkspaceProjectByProjectId(db, projectId),
        listWorkspaceProjectBindings: () => listWorkspaceProjectBindings(db),
        listWorkspaceProjects: (_db: unknown, workspaceId: string) => listWorkspaceProjects(db, workspaceId),
        updateWorkspaceProject: (_db: unknown, workspaceId: string, projectId: string, patch: any) =>
          updateWorkspaceProject(db, workspaceId, projectId, patch),
        rebindWorkspaceProject: (_db: unknown, projectId: string, patch: any) =>
          rebindWorkspaceProject(db, projectId, patch),
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
      conversations: {
        insertConversation: (_db: unknown, input: any) => insertConversation(db, input),
      },
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
      events: { subscribeFileEvents: noop, activeProjectEventSinks: new Map() },
      ids: { randomId: () => `id-${Math.random().toString(36).slice(2)}` },
      telemetry: { reportFinalizedMessage: noop },
      appConfig: {
        readAppConfig: vi.fn(async () => overrides.appConfig ?? {}),
        writeAppConfig: noop,
      },
      agents: {},
      validation: {
        validateProjectDesignSystemId: async () => ({ ok: true, id: null }),
        validateProjectSkillId: async () => ({ ok: true, id: null }),
      },
      collabSync: { requestTeamShare: noop, requestTeamUnshare: noop, invalidateTeamProjectCatalog: noop },
      teamProjectCatalog,
      authorizeProjectRequest,
    } as unknown as Parameters<typeof registerProjectRoutes>[1];
  }

  function seedProject(id: string, name: string) {
    return insertProject(db, {
      id,
      name,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  function pulledProjectInput(id: string) {
    return {
      id,
      name: 'Pulled team project',
      skillId: null,
      designSystemId: null,
      createdAt: 10,
      updatedAt: 20,
    };
  }

  it('rolls back project and conversation rows when workspace binding fails', async () => {
    const projectId = 'create-bind-failure';
    const app = express();
    app.use(express.json());
    registerProjectRoutes(
      app,
      buildProjectRoutesDeps(
        { list: async () => [] },
        {
          ensureWorkspaceProject: () => {
            throw new Error('injected workspace bind failure');
          },
        },
      ),
    );
    const routeServer = await listen(app);
    try {
      const response = await fetch(`${routeServer.url}/api/projects`, {
        method: 'POST',
        headers: readerTeamHeaders(),
        body: JSON.stringify({
          id: projectId,
          name: 'Must roll back',
          skillId: null,
          designSystemId: null,
        }),
      });

      expect(response.status).toBe(400);
      expect(getProject(db, projectId)).toBeNull();
      expect(listConversations(db, projectId)).toEqual([]);
      expect(getWorkspaceProjectByProjectId(db, projectId)).toBeUndefined();
    } finally {
      await close(routeServer.server);
    }
  });

  it('removes an external project directory when workspace binding fails', async () => {
    const projectId = 'external-create-bind-failure';
    const externalRoot = await mkdtemp(
      path.join(tmpdir(), 'od-create-bind-external-'),
    );
    const app = express();
    app.use(express.json());
    registerProjectRoutes(
      app,
      buildProjectRoutesDeps(
        { list: async () => [] },
        {
          appConfig: {
            projectLocations: [
              {
                id: 'external-test',
                name: 'External test',
                path: externalRoot,
              },
            ],
          },
          validateLinkedDirs: (dirs) => ({ dirs }),
          ensureWorkspaceProject: () => {
            throw new Error('injected workspace bind failure');
          },
        },
      ),
    );
    const routeServer = await listen(app);
    try {
      const response = await fetch(`${routeServer.url}/api/projects`, {
        method: 'POST',
        headers: readerTeamHeaders(),
        body: JSON.stringify({
          id: projectId,
          name: 'Must clean external dir',
          skillId: null,
          designSystemId: null,
          projectLocationId: 'external-test',
        }),
      });

      expect(response.status).toBe(400);
      expect(getProject(db, projectId)).toBeNull();
      expect(listConversations(db, projectId)).toEqual([]);
      expect(await readdir(externalRoot)).toEqual([]);
    } finally {
      await close(routeServer.server);
      await rm(externalRoot, { recursive: true, force: true });
    }
  });

  it('atomically materializes a read-only team mirror that rejects headerless PATCH and DELETE', async () => {
    const projectId = 'fresh-pulled-mirror';
    materializePulledTeamMirror(db, pulledProjectInput(projectId), {
      workspaceId: TEAM_WORKSPACE_ID,
      resourceTeamId: TEAM_WORKSPACE_ID,
      viewerMemberId: READER_MEMBER_ID,
      ownerMemberId: OWNER_MEMBER_ID,
    });

    expect(getProject(db, projectId)).toMatchObject({ id: projectId, name: 'Pulled team project' });
    expect(getWorkspaceProject(db, TEAM_WORKSPACE_ID, projectId)).toMatchObject({
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      updatedByWorkspaceMemberId: READER_MEMBER_ID,
      cloudTombstonedAt: null,
      syncState: 'synced',
    });

    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildProjectRoutesDeps({ list: async () => [] }));
    const routeServer = await listen(app);
    try {
      const patch = await fetch(`${routeServer.url}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Illicit rename' }),
      });
      expect(patch.status).toBe(400);
      const deletion = await fetch(`${routeServer.url}/api/projects/${projectId}`, {
        method: 'DELETE',
      });
      expect(deletion.status).toBe(400);
      expect(getProject(db, projectId)).toMatchObject({ name: 'Pulled team project' });
    } finally {
      await close(routeServer.server);
    }
  });

  it.each([
    {
      label: 'personal binding',
      patch: { workspaceId: TEAM_WORKSPACE_ID, visibility: 'personal', resourceState: 'active' },
    },
    {
      label: 'other workspace',
      patch: { workspaceId: 'ws-other', visibility: 'team', resourceState: 'active' },
    },
    {
      label: 'tombstoned mirror',
      patch: {
        workspaceId: TEAM_WORKSPACE_ID,
        visibility: 'team',
        resourceState: 'active',
        cloudTombstonedAt: 123,
      },
    },
    {
      label: 'deleted mirror',
      patch: { workspaceId: TEAM_WORKSPACE_ID, visibility: 'team', resourceState: 'deleted' },
    },
    {
      label: 'owner conflict',
      patch: {
        workspaceId: TEAM_WORKSPACE_ID,
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'someone-else',
      },
    },
  ])('fails closed without rewriting an existing $label', ({ patch }) => {
    const projectId = `conflict-${String(patch.visibility)}-${String(patch.workspaceId)}-${String(patch.resourceState)}-${String(patch.cloudTombstonedAt ?? 'none')}-${String(patch.createdByWorkspaceMemberId ?? 'none')}`;
    seedProject(projectId, 'Original local project');
    ensureWorkspaceProject(db, {
      projectId,
      updatedByWorkspaceMemberId: READER_MEMBER_ID,
      resourceHubResourceId: null,
      syncState: 'local_only',
      cloudTombstonedAt: null,
      createdByWorkspaceMemberId: null,
      ...patch,
    });
    const before = getWorkspaceProjectByProjectId(db, projectId);

    expect(() => materializePulledTeamMirror(db, pulledProjectInput(projectId), {
      workspaceId: TEAM_WORKSPACE_ID,
      resourceTeamId: TEAM_WORKSPACE_ID,
      viewerMemberId: READER_MEMBER_ID,
      ownerMemberId: OWNER_MEMBER_ID,
    })).toThrow(/binding conflict/);
    expect(getProject(db, projectId)).toMatchObject({ name: 'Original local project' });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toEqual(before);
  });

  // Real db.ts wiring for the reconciler under test — the same functions
  // `server.ts` itself calls, not a re-implementation. `getWorkspaceIdentity`
  // is fixed to the reader's identity for these tests; the identity-gating
  // behavior itself is covered by the fake-deps unit tests in
  // `workspace-projects-reconciler.test.ts`.
  function reconcileAsReader(
    remoteProjects: RemoteTeamProjectRef[],
    options: { onError?: (error: unknown) => void } = {},
  ) {
    return reconcileWorkspaceProjectsWithRemote({
      getWorkspaceIdentity: async () => ({ workspaceId: TEAM_WORKSPACE_ID, workspaceMemberId: READER_MEMBER_ID }),
      listRemoteTeamProjects: async () => remoteProjects,
      hasLocalProject: (projectId) => getProject(db, projectId) != null,
      listLocalTeamRows: (workspaceId): LocalTeamProjectBinding[] =>
        listWorkspaceProjects(db, workspaceId)
          .filter((row: any) => row.workspaceVisibility === 'team')
          .map((row: any) => ({
            projectId: row.id,
            workspaceId: row.workspaceId,
            visibility: row.workspaceVisibility,
            resourceState: row.resourceState ?? null,
            createdByWorkspaceMemberId: row.createdByWorkspaceMemberId ?? null,
            resourceHubResourceId: row.resourceHubResourceId ?? null,
          })),
      getLocalBinding: (projectId): LocalTeamProjectBinding | null => {
        const row = getWorkspaceProjectByProjectId(db, projectId) as any;
        if (!row) return null;
        return {
          projectId,
          workspaceId: row.workspaceId,
          visibility: row.visibility,
          resourceState: row.resourceState ?? null,
          createdByWorkspaceMemberId: row.createdByWorkspaceMemberId ?? null,
          resourceHubResourceId: row.resourceHubResourceId ?? null,
        };
      },
      getLocalProjectMetadata: (projectId) => {
        const project = getProject(db, projectId);
        return project ? { name: project.name, updatedAt: project.updatedAt } : null;
      },
      applyMetadataRefresh: (projectId, patch) => {
        updateProject(db, projectId, patch);
      },
      applyBind: (projectId, patch) => {
        // Mirrors server.ts's real wiring: `rebindWorkspaceProject` only
        // corrects an existing row (see db.ts), so a project this daemon has
        // never locally bound needs `ensureWorkspaceProject` instead.
        if (rebindWorkspaceProject(db, projectId, patch)) return;
        ensureWorkspaceProject(db, { projectId, ...patch });
      },
      applyDemote: (workspaceId, projectId, patch) => updateWorkspaceProject(db, workspaceId, projectId, patch),
      applyRevoke: (workspaceId, projectId, patch) => {
        updateWorkspaceProject(db, workspaceId, projectId, patch);
        const project = getProject(db, projectId);
        updateProject(db, projectId, {
          metadata: {
            ...((project?.metadata as Record<string, unknown> | null) ?? {}),
            teamMirrorRevokedAt: Date.now(),
          },
        });
      },
      ...(options.onError ? { onError: options.onError } : {}),
    });
  }

  it('persists an owner rename for both team and recent-project HTTP projections', async () => {
    const projectId = 'renamed-foreign-mirror';
    insertProject(db, {
      id: projectId,
      name: 'Old local name',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: 50,
      updatedAt: 100,
    });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      updatedByWorkspaceMemberId: READER_MEMBER_ID,
      resourceHubResourceId: `project-${projectId}`,
      syncState: 'synced',
      updatedAt: 100,
    });

    await reconcileAsReader([{
      projectId,
      ownerMemberId: OWNER_MEMBER_ID,
      displayName: 'Renamed by owner',
      catalogRevisionAt: 999_999,
      originProjectUpdatedAt: 200,
    }]);

    expect(getProject(db, projectId)).toMatchObject({
      name: 'Renamed by owner',
      updatedAt: 200,
    });

    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildProjectRoutesDeps({ list: async () => [] }));
    const routeServer = await listen(app);
    try {
      for (const suffix of ['?view=team', '']) {
        const response = await fetch(
          `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects${suffix}`,
          { headers: readerTeamHeaders() },
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
          projects: Array<{ id: string; name: string; updatedAt: number }>;
        };
        expect(body.projects.find((project) => project.id === projectId)).toMatchObject({
          name: 'Renamed by owner',
          updatedAt: 200,
        });
      }
    } finally {
      await close(routeServer.server);
    }
  });

  it('quarantines a member mirror once the owner unshares it and denies stale direct reads', async () => {
    const projectId = 'shared-then-unshared';
    seedProject(projectId, 'Shared then unshared');
    // Simulates the state right after this member pulled a project the owner
    // shared: a local `visibility: 'team'` row, read-only (not the creator).
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      updatedByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceHubResourceId: `project-${projectId}`,
      syncState: 'synced',
    });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({ visibility: 'team' });

    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildProjectRoutesDeps({ list: async () => [] }));
    const routeServer = await listen(app);
    const detailUrl = `${routeServer.url}/api/projects/${projectId}`;
    const scopeUrl = `${routeServer.url}/api/projects/${projectId}/workspace-scope`;
    const filesUrl = `${routeServer.url}/api/projects/${projectId}/files`;
    const rawUrl = `${routeServer.url}/api/projects/${projectId}/raw/index.html`;
    const previewUrl = `${routeServer.url}/api/projects/${projectId}/preview-url`;
    expect((await fetch(detailUrl, { headers: readerTeamHeaders() })).status).toBe(200);

    // The owner has since unshared (or deleted) the project: the hub's team
    // catalog no longer reports it at all.
    const result = await reconcileAsReader([]);
    expect(result).toEqual({ bound: 0, demoted: 0, revoked: 1 });

    // The binding remains Team-scoped but is quarantined. Stale bytes remain
    // on disk for safe re-share recovery and are no longer readable.
    const row = getWorkspaceProjectByProjectId(db, projectId);
    expect(row).toMatchObject({
      visibility: 'team',
      resourceState: 'deleted',
      createdByWorkspaceMemberId: null,
      resourceHubResourceId: `project-${projectId}`,
      syncState: 'synced',
    });
    expect(getProject(db, projectId)?.metadata).toMatchObject({
      teamMirrorRevokedAt: expect.any(Number),
    });
    expect((await fetch(detailUrl, { headers: readerTeamHeaders() })).status).toBe(403);
    expect((await fetch(scopeUrl, { headers: readerTeamHeaders() })).status).toBe(403);
    expect((await fetch(filesUrl, { headers: readerTeamHeaders() })).status).toBe(404);
    expect((await fetch(rawUrl, { headers: readerTeamHeaders() })).status).toBe(404);
    expect((await fetch(previewUrl, { headers: readerTeamHeaders() })).status).toBe(404);

    try {
      const teamResp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects?view=team`,
        { headers: readerTeamHeaders() },
      );
      expect(teamResp.status).toBe(200);
      const teamBody = (await teamResp.json()) as { projects: Array<{ id: string }> };
      expect(teamBody.projects.some((p) => p.id === projectId)).toBe(false);

      const allResp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects`,
        { headers: readerTeamHeaders() },
      );
      const allBody = (await allResp.json()) as { projects: Array<{ id: string; visibility: string }> };
      const found = allBody.projects.find((p) => p.id === projectId);
      expect(found, 'revoked mirror must not become a personal draft').toBeUndefined();
    } finally {
      await close(routeServer.server);
    }
  });

  it('reactivates a quarantined mirror only after an authoritative re-share is materialized', async () => {
    const projectId = 'shared-unshared-reshared';
    materializePulledTeamMirror(db, pulledProjectInput(projectId), {
      workspaceId: TEAM_WORKSPACE_ID,
      resourceTeamId: TEAM_WORKSPACE_ID,
      viewerMemberId: READER_MEMBER_ID,
      ownerMemberId: OWNER_MEMBER_ID,
    });

    expect(await reconcileAsReader([])).toEqual({
      bound: 0,
      demoted: 0,
      revoked: 1,
    });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
      visibility: 'team',
      resourceState: 'deleted',
    });

    // The catalog row reappearing is only a discovery signal. It must not
    // unlock stale local bytes before the fresh hub version is pulled.
    expect(await reconcileAsReader([
      { projectId, ownerMemberId: OWNER_MEMBER_ID },
    ])).toEqual({
      bound: 0,
      demoted: 0,
      revoked: 0,
    });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
      resourceState: 'deleted',
    });

    materializePulledTeamMirror(
      db,
      {
        ...pulledProjectInput(projectId),
        name: 'Re-shared project',
        updatedAt: 30,
      },
      {
        workspaceId: TEAM_WORKSPACE_ID,
        resourceTeamId: TEAM_WORKSPACE_ID,
        viewerMemberId: READER_MEMBER_ID,
        ownerMemberId: OWNER_MEMBER_ID,
      },
    );
    expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
    });
    expect(getProject(db, projectId)?.metadata ?? {}).not.toHaveProperty(
      'teamMirrorRevokedAt',
    );

    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildProjectRoutesDeps({ list: async () => [] }));
    const routeServer = await listen(app);
    try {
      expect(
        (
          await fetch(`${routeServer.url}/api/projects/${projectId}`, {
            headers: readerTeamHeaders(),
          })
        ).status,
      ).toBe(200);
    } finally {
      await close(routeServer.server);
    }
  });

  it('binds a brand-new remote share this daemon has never locally bound, visible immediately over real HTTP', async () => {
    const projectId = 'freshly-shared';
    seedProject(projectId, 'Freshly shared');
    expect(getWorkspaceProjectByProjectId(db, projectId)).toBeUndefined();

    const result = await reconcileAsReader([{ projectId, ownerMemberId: OWNER_MEMBER_ID }]);
    expect(result).toEqual({ bound: 1, demoted: 0, revoked: 0 });

    const row = getWorkspaceProjectByProjectId(db, projectId);
    expect(row).toMatchObject({ workspaceId: TEAM_WORKSPACE_ID, visibility: 'team', createdByWorkspaceMemberId: null });

    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildProjectRoutesDeps({ list: async () => [] }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects?view=team`,
        { headers: readerTeamHeaders() },
      );
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as { projects: Array<{ id: string; visibility: string }> };
      const found = body.projects.find((p) => p.id === projectId);
      expect(found, 'expected the newly-bound project to show under the team view immediately').toBeTruthy();
      expect(found?.visibility).toBe('team');
    } finally {
      await close(routeServer.server);
    }
  });

  // The production P1 this encodes (recvqmnuxxKHaI): a member daemon whose
  // team catalog lists projects the member has NEVER opened or pulled. Those
  // projects have no local `projects` row, and `workspace_projects.project_id`
  // is a FOREIGN KEY into `projects(id)` (db.ts), so the bind fallback's
  // INSERT threw SQLITE_CONSTRAINT_FOREIGNKEY on every single reconciliation
  // pass (hub push + ~15s poller), forever — 4700+ log lines across restarts
  // on the live member instance. Materializing a project is the open/pull
  // path's job (`ensureSharedProjectPlaceholder` / `registerPulledProject` in
  // routes/collab-sync.ts); the reconciler must SKIP what has never been
  // materialized here, exactly like its request-scoped sibling
  // `reconcileLocalRowWithRemoteTeamAccess` (rebind-only, never inserts).
  it('skips a remote team project this daemon never materialized locally instead of failing the FK, without disturbing the rest of the pass', async () => {
    // A materialized project the same pass must still bind…
    const materializedId = 'materialized-but-unbound';
    seedProject(materializedId, 'Materialized but unbound');
    // …and a stale foreign team mirror the same pass must still revoke.
    const unsharedId = 'unshared-during-outage';
    seedProject(unsharedId, 'Unshared during outage');
    ensureWorkspaceProject(db, {
      projectId: unsharedId,
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      updatedByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceHubResourceId: `project-${unsharedId}`,
      syncState: 'synced',
    });
    // The culprit: on the remote catalog, never seen locally — no `projects`
    // row, no `workspace_projects` row.
    const neverMaterializedId = 'never-materialized-remote-share';
    expect(getProject(db, neverMaterializedId)).toBeFalsy();

    const onError = vi.fn();
    const result = await reconcileAsReader(
      [
        { projectId: neverMaterializedId, ownerMemberId: OWNER_MEMBER_ID },
        { projectId: materializedId, ownerMemberId: OWNER_MEMBER_ID },
      ],
      { onError },
    );

    // No FOREIGN KEY error — the unmaterialized project is not an error, it
    // is simply not this daemon's row to write yet.
    expect(onError).not.toHaveBeenCalled();
    expect(getWorkspaceProjectByProjectId(db, neverMaterializedId)).toBeUndefined();
    // The skip is not counted as work done, and the rest of the pass ran.
    expect(result).toEqual({ bound: 1, demoted: 0, revoked: 1 });
    expect(getWorkspaceProjectByProjectId(db, materializedId)).toMatchObject({
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'team',
    });
    expect(getWorkspaceProjectByProjectId(db, unsharedId)).toMatchObject({
      visibility: 'team',
      resourceState: 'deleted',
    });
  });

  it('does not demote on a failed remote read, leaving the row (and the HTTP-visible list) untouched', async () => {
    const projectId = 'still-shared';
    seedProject(projectId, 'Still shared');
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      updatedByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceHubResourceId: `project-${projectId}`,
      syncState: 'synced',
    });

    const result = await reconcileWorkspaceProjectsWithRemote({
      getWorkspaceIdentity: async () => ({ workspaceId: TEAM_WORKSPACE_ID, workspaceMemberId: READER_MEMBER_ID }),
      listRemoteTeamProjects: async () => {
        throw new Error('vela unreachable');
      },
      hasLocalProject: (id) => getProject(db, id) != null,
      listLocalTeamRows: (workspaceId): LocalTeamProjectBinding[] =>
        listWorkspaceProjects(db, workspaceId)
          .filter((row: any) => row.workspaceVisibility === 'team')
          .map((row: any) => ({
            projectId: row.id,
            workspaceId: row.workspaceId,
            visibility: row.workspaceVisibility,
            resourceState: row.resourceState ?? null,
            createdByWorkspaceMemberId: row.createdByWorkspaceMemberId ?? null,
            resourceHubResourceId: row.resourceHubResourceId ?? null,
          })),
      getLocalBinding: () => null,
      applyBind: (projectId, patch) => rebindWorkspaceProject(db, projectId, patch),
      applyDemote: (workspaceId, projectId, patch) => updateWorkspaceProject(db, workspaceId, projectId, patch),
      applyRevoke: (workspaceId, projectId, patch) => updateWorkspaceProject(db, workspaceId, projectId, patch),
    });
    expect(result).toEqual({ bound: 0, demoted: 0, revoked: 0 });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({ visibility: 'team' });
  });
});
