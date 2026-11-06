// Red-spec coverage for recvqzjnshIlOe: a teammate's team project whose hub
// catalog row is `syncState: 'failed'` must NOT be demoted into a personal
// draft attributed to the local viewer.
//
// The failure chain this encodes: the display catalog read (`toTeamProject`
// in collab/vela-cli-team-projects.ts) deliberately drops every non-`synced`
// row so teammates never open empty project shells. The realtime reconciler
// (collab/workspace-projects-reconciler.ts) was fed exactly that
// display-filtered list as its "remote membership" — so a mere publish
// failure on the owner's side became indistinguishable from a real unshare,
// and the demote direction rewrote the viewer's read-only mirror into
// `visibility: 'personal'` + `createdByWorkspaceMemberId: <viewer>` +
// `syncState: 'local_only'`. That row then passed the drafts view's
// "personal AND created by me" filter, rendered as "created by me", offered
// "move to team space", and the move could only ever fail with the hub's
// `team_project_owner_conflict` (the failed row still occupies the
// ownership slot; see vela services/api/src/team-projects/postgres.ts).
//
// The remote payloads below run through the REAL vela CLI wire parsers —
// `createVelaCliTeamProjectCatalog` (display, drops non-synced) and
// `createVelaCliTeamProjectCatalogClient` (raw membership, keeps them) —
// composed by the REAL `reconcilerRemoteTeamProjects` source selector, so
// this suite fails against the display-filtered wiring and passes against
// the membership wiring without mimicking either parser.
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
  getWorkspaceProjectByProjectId,
  insertProject,
  listWorkspaceProjectBindings,
  listWorkspaceProjects,
  getWorkspaceProject,
  openDatabase,
  rebindWorkspaceProject,
  updateProject,
  updateWorkspaceProject,
} from '../../src/db.js';
import {
  reconcileWorkspaceProjectsWithRemote,
  reconcilerRemoteTeamProjects,
  type LocalTeamProjectBinding,
  type RemoteTeamProjectRef,
} from '../../src/collab/workspace-projects-reconciler.js';
import {
  createVelaCliTeamProjectCatalog,
  createVelaCliTeamProjectCatalogClient,
} from '../../src/collab/vela-cli-team-projects.js';

const TEAM_WORKSPACE_ID = 'ws-team-1';
const OWNER_MEMBER_ID = 'member-owner';
const READER_MEMBER_ID = 'member-reader';

interface HubCatalogRow {
  projectId: string;
  ownerMemberId: string;
  syncState: 'pending_upload' | 'syncing' | 'synced' | 'failed';
}

/** One raw hub catalog row, shaped like `vela team-projects list` output —
 *  satisfying BOTH real wire parsers (`toTeamProject` needs
 *  projectId/ownerMemberId/createdAt, `toVelaTeamProjectRecord` additionally
 *  needs id/workspaceId/resourceId/syncState/updatedAt). */
function hubWireRow(row: HubCatalogRow) {
  return {
    id: `row-${row.projectId}`,
    workspaceId: TEAM_WORKSPACE_ID,
    projectId: row.projectId,
    resourceId: `project-${row.projectId}`,
    ownerMemberId: row.ownerMemberId,
    displayName: row.projectId,
    syncState: row.syncState,
    createdAt: '2026-07-24T09:02:40.747Z',
    updatedAt: '2026-07-25T13:15:20.689Z',
  };
}

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

describe('reconciler remote membership vs the display-filtered catalog (recvqzjnshIlOe)', () => {
  let tempDir: string;
  let projectsRoot: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'od-reconcile-membership-'));
    projectsRoot = path.join(tempDir, 'projects');
    db = openDatabase(projectsRoot, { dataDir: tempDir });
  });

  afterEach(async () => {
    closeDatabase();
    await rm(tempDir, { recursive: true, force: true });
  });

  function seedProject(id: string, name: string) {
    insertProject(db, {
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

  /** The healthy shape `materializePulledTeamMirror` writes for a teammate's
   *  shared project this viewer pulled. */
  function seedForeignTeamMirror(projectId: string) {
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
  }

  /** Compose the two REAL catalog reads exactly the way server.ts wires the
   *  reconciler's `listRemoteTeamProjects` dep. */
  function remoteMembershipReader(hubRows: HubCatalogRow[]) {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] !== 'list') throw new Error(`unexpected vela args: ${args.join(' ')}`);
      return JSON.stringify({
        workspaceId: TEAM_WORKSPACE_ID,
        projects: hubRows.map(hubWireRow),
      });
    });
    const displayCatalog = createVelaCliTeamProjectCatalog({
      run,
      supportsTeamProjects: () => true,
    });
    const membershipCatalog = createVelaCliTeamProjectCatalogClient({
      run,
      supportsTeamProjects: () => true,
    });
    return () =>
      reconcilerRemoteTeamProjects({
        listCatalogMembership: async () =>
          (await membershipCatalog.list({
            memberId: READER_MEMBER_ID,
            teamId: TEAM_WORKSPACE_ID,
            role: 'member',
            lifecycleState: 'active',
          })).map((record) => ({
            projectId: record.projectId,
            ownerMemberId: record.ownerMemberId,
          })),
        listDisplayTeamProjects: async () =>
          (await displayCatalog.list(TEAM_WORKSPACE_ID)).map((project) => ({
            projectId: project.projectId,
            ownerMemberId: project.ownerMemberId,
          })),
      });
  }

  /** Real db.ts wiring for the reconciler — the same functions server.ts
   *  itself calls (mirrors workspace-projects-reconcile-http.test.ts). */
  function reconcileAsReader(listRemoteTeamProjects: () => Promise<readonly RemoteTeamProjectRef[]>) {
    return reconcileWorkspaceProjectsWithRemote({
      getWorkspaceIdentity: async () => ({
        workspaceId: TEAM_WORKSPACE_ID,
        workspaceMemberId: READER_MEMBER_ID,
      }),
      listRemoteTeamProjects,
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
      applyBind: (projectId, patch) => {
        if (rebindWorkspaceProject(db, projectId, patch)) return;
        ensureWorkspaceProject(db, { projectId, ...patch });
      },
      applyDemote: (workspaceId, projectId, patch) =>
        updateWorkspaceProject(db, workspaceId, projectId, patch),
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
    });
  }

  function buildProjectRoutesDeps() {
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
      collabSync: { requestTeamShare: noop, requestTeamUnshare: noop, invalidateTeamProjectCatalog: noop },
      teamProjectCatalog: undefined,
    } as unknown as Parameters<typeof registerProjectRoutes>[1];
  }

  async function draftsProjectIds(): Promise<string[]> {
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildProjectRoutesDeps());
    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects?view=drafts`,
        { headers: readerTeamHeaders() },
      );
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as { projects: Array<{ id: string }> };
      return body.projects.map((p) => p.id);
    } finally {
      await close(routeServer.server);
    }
  }

  it("keeps a teammate's sync-failed catalog row bound as a team mirror instead of demoting it into the viewer's drafts", async () => {
    const projectId = 'wsclone-visual-verify';
    seedProject(projectId, 'Website Clone Visual Verify');
    seedForeignTeamMirror(projectId);

    // The hub still registers the row to its owner — only its latest publish
    // failed. The display read drops it; membership must not.
    const result = await reconcileAsReader(
      remoteMembershipReader([
        { projectId, ownerMemberId: OWNER_MEMBER_ID, syncState: 'failed' },
      ]),
    );

    expect(result).toMatchObject({ demoted: 0, revoked: 0 });
    const row = getWorkspaceProjectByProjectId(db, projectId);
    expect(row).toMatchObject({
      visibility: 'team',
      createdByWorkspaceMemberId: null,
    });
    // The observable symptom: it must not surface in the viewer's drafts.
    expect(await draftsProjectIds()).not.toContain(projectId);
  });

  it('heals an already-leaked self-attributed draft back into a team mirror once membership confirms the foreign owner', async () => {
    const projectId = 'wsclone-visual-verify';
    seedProject(projectId, 'Website Clone Visual Verify');
    // The exact corrupted row from the live incident (owner client,
    // od-owner-data app.sqlite): the earlier display-filtered pass demoted
    // the mirror into the viewer's own personal draft.
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: TEAM_WORKSPACE_ID,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: READER_MEMBER_ID,
      updatedByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      syncState: 'local_only',
    });
    expect(await draftsProjectIds()).toContain(projectId);

    const result = await reconcileAsReader(
      remoteMembershipReader([
        { projectId, ownerMemberId: OWNER_MEMBER_ID, syncState: 'failed' },
      ]),
    );

    expect(result.bound).toBe(1);
    const row = getWorkspaceProjectByProjectId(db, projectId);
    expect(row).toMatchObject({
      visibility: 'team',
      createdByWorkspaceMemberId: null,
    });
    expect(await draftsProjectIds()).not.toContain(projectId);
  });

  it('quarantines a mirror whose hub row is genuinely gone without turning it into the viewer personal draft', async () => {
    const projectId = 'genuinely-unshared';
    seedProject(projectId, 'Genuinely unshared');
    seedForeignTeamMirror(projectId);

    const result = await reconcileAsReader(remoteMembershipReader([]));

    expect(result).toMatchObject({ demoted: 0, revoked: 1 });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
      visibility: 'team',
      resourceState: 'deleted',
      createdByWorkspaceMemberId: null,
      syncState: 'synced',
    });
    expect(getProject(db, projectId)?.metadata).toMatchObject({
      teamMirrorRevokedAt: expect.any(Number),
    });
    expect(await draftsProjectIds()).not.toContain(projectId);
  });

  it('does not revoke on a partially parseable catalog response', async () => {
    const projectId = 'must-survive-partial-catalog';
    seedProject(projectId, 'Must survive partial catalog');
    seedForeignTeamMirror(projectId);
    const client = createVelaCliTeamProjectCatalogClient({
      supportsTeamProjects: () => true,
      run: async () => JSON.stringify({
        projects: [
          hubWireRow({
            projectId: 'some-other-project',
            ownerMemberId: OWNER_MEMBER_ID,
            syncState: 'synced',
          }),
          {
            id: 'malformed-row',
            workspaceId: TEAM_WORKSPACE_ID,
            projectId,
          },
        ],
      }),
    });

    const result = await reconcileAsReader(async () =>
      (await client.list({
        memberId: READER_MEMBER_ID,
        teamId: TEAM_WORKSPACE_ID,
        role: 'member',
        lifecycleState: 'active',
      })).map((record) => ({
        projectId: record.projectId,
        ownerMemberId: record.ownerMemberId,
      })),
    );

    expect(result).toEqual({ bound: 0, demoted: 0, revoked: 0 });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
      visibility: 'team',
      resourceState: 'active',
    });
    expect(getProject(db, projectId)?.metadata ?? {}).not.toHaveProperty(
      'teamMirrorRevokedAt',
    );
  });
});
