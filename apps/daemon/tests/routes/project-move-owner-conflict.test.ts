// Red-spec coverage for the error half of recvqzjnshIlOe: when the hub
// refuses a "move to team space" because the project is already registered
// under ANOTHER member's ownership (vela `team_project_owner_conflict`,
// surfaced through the CLI transport's stderr), the daemon must answer with
// the discriminable contract code `TEAM_PROJECT_OWNER_CONFLICT` — not the
// generic 400 BAD_REQUEST the web can only render as "try again later".
// An owner conflict is permanent until the registered owner unshares, so a
// retry hint is a lie.
import express from 'express';
import type http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerProjectRoutes } from '../../src/routes/project/index.js';
import {
  closeDatabase,
  ensureWorkspaceProject,
  getProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  listWorkspaceProjectBindings,
  listWorkspaceProjects,
  openDatabase,
  rebindWorkspaceProject,
  updateWorkspaceProject,
} from '../../src/db.js';

const TEAM_WORKSPACE_ID = 'ws-team-1';
const READER_MEMBER_ID = 'member-reader';

// The real shape observed in the live incident: the vela CLI rethrows the
// hub's 403 body through execFile stderr, so the daemon-side error text
// embeds the hub's stable error token.
const OWNER_CONFLICT_ERROR = new Error(
  'Error: Command failed: vela team-projects upsert … 403: {"error":"team_project_owner_conflict"}',
);

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

describe('project move refused by the hub with team_project_owner_conflict', () => {
  let tempDir: string;
  let projectsRoot: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'od-move-owner-conflict-'));
    projectsRoot = path.join(tempDir, 'projects');
    db = openDatabase(projectsRoot, { dataDir: tempDir });
  });

  afterEach(async () => {
    closeDatabase();
    await rm(tempDir, { recursive: true, force: true });
  });

  function buildDeps(collabSync: Record<string, unknown>) {
    const noop = vi.fn();
    return {
      db,
      design: {},
      http: {
        createSseResponse: noop,
        sendApiError: (res: any, status: number, code: string, message: string) =>
          res.status(status).json({ error: { code, message } }),
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
        validateLinkedDirs: () => ({ dirs: [] }),
        getProject: (_db: unknown, id: string) => getProject(db, id),
        updateProject: noop,
        dbDeleteProject: noop,
        removeProjectDir: noop,
        stageProjectDirsForDelete: vi.fn(async () => ({
          rollback: vi.fn(async () => {}),
          commit: vi.fn(async () => {}),
        })),
        deleteWorkspaceProject: noop,
        countWorkspaceProjectRefs: vi.fn(() => 1),
        ensureWorkspaceProject: (_db: unknown, input: any) => ensureWorkspaceProject(db, input),
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
      events: { subscribeFileEvents: noop, activeProjectEventSinks: new Map() },
      ids: { randomId: () => `id-${Math.random().toString(36).slice(2)}` },
      telemetry: { reportFinalizedMessage: noop },
      appConfig: { readAppConfig: vi.fn(async () => ({})), writeAppConfig: noop },
      agents: {},
      validation: {
        validateProjectDesignSystemId: async () => ({ ok: true, id: null }),
        validateProjectSkillId: async () => ({ ok: true, id: null }),
      },
      collabSync,
    } as unknown as Parameters<typeof registerProjectRoutes>[1];
  }

  function seedSelfDraft(projectId: string) {
    insertProject(db, {
      id: projectId,
      name: 'Looks like my own draft',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: READER_MEMBER_ID,
      updatedByWorkspaceMemberId: READER_MEMBER_ID,
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      syncState: 'local_only',
    });
  }

  it('answers 409 TEAM_PROJECT_OWNER_CONFLICT (not the retryable 400 BAD_REQUEST) and restores the local row', async () => {
    const projectId = 'conflicted-draft';
    seedSelfDraft(projectId);
    const app = express();
    app.use(express.json());
    registerProjectRoutes(
      app,
      buildDeps({
        requestTeamShare: vi.fn(async () => {
          throw OWNER_CONFLICT_ERROR;
        }),
        requestTeamUnshare: vi.fn(),
        invalidateTeamProjectCatalog: vi.fn(),
      }),
    );
    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: readerTeamHeaders(),
          body: JSON.stringify({ visibility: 'team' }),
        },
      );
      expect(resp.status).toBe(409);
      const body = (await resp.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('TEAM_PROJECT_OWNER_CONFLICT');
      expect(body.error.message).toMatch(/team_project_owner_conflict/);
      // The optimistic local flip must have been rolled back.
      expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
        visibility: 'personal',
        syncState: 'local_only',
      });
    } finally {
      await close(routeServer.server);
    }
  });

  it('keeps mapping unrelated share failures to the generic BAD_REQUEST', async () => {
    const projectId = 'transient-failure';
    seedSelfDraft(projectId);
    const app = express();
    app.use(express.json());
    registerProjectRoutes(
      app,
      buildDeps({
        requestTeamShare: vi.fn(async () => {
          throw new Error('Error: Command failed: vela team-projects upsert … network timeout');
        }),
        requestTeamUnshare: vi.fn(),
        invalidateTeamProjectCatalog: vi.fn(),
      }),
    );
    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: readerTeamHeaders(),
          body: JSON.stringify({ visibility: 'team' }),
        },
      );
      expect(resp.status).toBe(400);
      const body = (await resp.json()) as { error: { code: string } };
      expect(body.error.code).toBe('BAD_REQUEST');
    } finally {
      await close(routeServer.server);
    }
  });
});

describe('owner_conflict unreachability through the normal UI path', () => {
  // Product ruling on recvqzjnshIlOe: a user's own drafts can never
  // legitimately collide with another member's hub registration, so the
  // owner-conflict error must be unreachable through normal clicks. With the
  // reconciler membership fix, a teammate's project only ever exists locally
  // as a `visibility: 'team'` mirror — and for that shape the move route's
  // own `canMoveToTeam` gate (requires `visibility === 'personal'`) refuses
  // BEFORE any hub call. This pins that ordering: the hub transport must not
  // even be consulted.
  let tempDir: string;
  let projectsRoot: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'od-move-owner-unreachable-'));
    projectsRoot = path.join(tempDir, 'projects');
    db = openDatabase(projectsRoot, { dataDir: tempDir });
  });

  afterEach(async () => {
    closeDatabase();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("refuses move-to-team on a teammate's team mirror at the local gate, without calling the hub", async () => {
    const projectId = 'foreign-team-mirror';
    insertProject(db, {
      id: projectId,
      name: 'Teammate mirror',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // The healthy mirror shape the reconciler now preserves for a teammate's
    // project (including one whose hub row is merely sync-failed).
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      updatedByWorkspaceMemberId: READER_MEMBER_ID,
      resourceHubResourceId: `project-${projectId}`,
      cloudTombstonedAt: null,
      syncState: 'synced',
    });

    const requestTeamShare = vi.fn(async () => {
      throw new Error('the hub must not be consulted for a refused move');
    });
    const noop = vi.fn();
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, {
      db,
      design: {},
      http: {
        createSseResponse: noop,
        sendApiError: (res: any, status: number, code: string, message: string) =>
          res.status(status).json({ error: { code, message } }),
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
        validateLinkedDirs: () => ({ dirs: [] }),
        getProject: (_db: unknown, id: string) => getProject(db, id),
        updateProject: noop,
        dbDeleteProject: noop,
        removeProjectDir: noop,
        stageProjectDirsForDelete: vi.fn(async () => ({
          rollback: vi.fn(async () => {}),
          commit: vi.fn(async () => {}),
        })),
        deleteWorkspaceProject: noop,
        countWorkspaceProjectRefs: vi.fn(() => 1),
        ensureWorkspaceProject: (_db: unknown, input: any) => ensureWorkspaceProject(db, input),
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
      events: { subscribeFileEvents: noop, activeProjectEventSinks: new Map() },
      ids: { randomId: () => `id-${Math.random().toString(36).slice(2)}` },
      telemetry: { reportFinalizedMessage: noop },
      appConfig: { readAppConfig: vi.fn(async () => ({})), writeAppConfig: noop },
      agents: {},
      validation: {
        validateProjectDesignSystemId: async () => ({ ok: true, id: null }),
        validateProjectSkillId: async () => ({ ok: true, id: null }),
      },
      collabSync: { requestTeamShare, requestTeamUnshare: noop, invalidateTeamProjectCatalog: noop },
    } as unknown as Parameters<typeof registerProjectRoutes>[1]);

    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: readerTeamHeaders(),
          body: JSON.stringify({ visibility: 'team' }),
        },
      );
      expect(resp.status).toBe(403);
      const body = (await resp.json()) as { error: { code: string } };
      expect(body.error.code).toBe('PROJECT_DELETE_FORBIDDEN');
      expect(requestTeamShare).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });
});
