// spec 04 §11: before this fix, `DELETE /api/projects/:id` never called
// `collabSync.requestTeamUnshare` for a team-visible project — unlike the
// `/move` route's `visibility: 'personal'` branch, which already knows how to
// take a project out of the team space via the exact same helper
// (`requestTeamVisibility` in routes/project/index.ts). `dbDeleteProject`'s
// `ON DELETE CASCADE` only ever drops the DELETER's own `workspace_projects`
// row — the resource hub's published entry (and every other member's own,
// separately-stored, already-bound row) never learned the project was gone,
// so a deleted team project kept surfacing for teammates.
//
// This spec drives the REAL `registerProjectRoutes` DELETE handler over real
// HTTP, wired to a REAL `createCollabRuntime` instance with an injected fake
// `ResourcePublishAdapter` + team-project-catalog sink that hold actual
// mutable "hub" state (a shared/unshared map), not a spy. Assertions check
// the state transition on that fake hub (published → unpublished, catalog
// entry removed) rather than "was requestTeamUnshare called" — the shallow
// mock-call assertion the bug review explicitly ruled insufficient.

import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  deleteProject as dbDeleteProject,
  ensureWorkspaceProject,
  getProject,
  getWorkspaceProject,
  getWorkspaceProjectByProjectId,
  insertProject,
  listWorkspaceProjects,
  openDatabase,
} from '../../src/db.js';
import { removeProjectDir } from '../../src/projects.js';
import { registerProjectRoutes } from '../../src/routes/project/index.js';
import { createCollabRuntime } from '../../src/collab/runtime.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';
import type { ResourcePublishAdapter, ResourcePublishInput } from '../../src/collab/publish-scheduler.js';
import type { ResourceHubPrincipal } from '../../src/collab/resource-principal.js';

let server: http.Server | null = null;
let tempDir: string | null = null;
let projectsDir: string | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (projectsDir) fs.rmSync(projectsDir, { recursive: true, force: true });
  tempDir = null;
  projectsDir = null;
});

const WORKSPACE_ID = 'ws-delete-unshare';
const OWNER_MEMBER_ID = 'member-owner';

function sendApiError(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function ownerHeaders() {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-member-id': OWNER_MEMBER_ID,
    'x-od-workspace-role': 'owner',
  };
}

/** In-memory stand-in for the resource hub: a mutable map keyed on
 *  `teamId:projectId`, plus call logs so assertions can check BOTH the real
 *  state transition and the exact args the route passed through. */
function fakeHub() {
  const published = new Map<string, { version: number }>();
  const catalog = new Map<string, unknown>();
  const publishCalls: Array<ResourcePublishInput & { reason: string }> = [];
  const unpublishCalls: ResourcePublishInput[] = [];
  const catalogRemoveCalls: Array<{ projectId: string; principal: ResourceHubPrincipal | null | undefined }> = [];

  const key = (projectId: string, principal?: ResourceHubPrincipal | null) =>
    principal ? `${principal.teamId}:${projectId}` : projectId;

  const adapter: ResourcePublishAdapter = {
    async publish(input) {
      publishCalls.push(input);
      published.set(key(input.projectId, input.principal), { version: 1 });
      return { version: 1, versionId: 'v1' };
    },
    async unpublish(input) {
      unpublishCalls.push(input);
      published.delete(key(input.projectId, input.principal));
    },
  };

  const teamProjectCatalog = {
    async upsert(input: { projectId: string }, principal?: ResourceHubPrincipal | null) {
      catalog.set(key(input.projectId, principal), input);
    },
    async remove(projectId: string, principal?: ResourceHubPrincipal | null) {
      catalogRemoveCalls.push({ projectId, principal });
      catalog.delete(key(projectId, principal));
    },
  };

  return { adapter, teamProjectCatalog, published, catalog, publishCalls, unpublishCalls, catalogRemoveCalls, key };
}

async function startServer(
  hub: ReturnType<typeof fakeHub>,
) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-project-delete-unshare-'));
  projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-project-delete-unshare-dir-'));
  const db = openDatabase(tempDir);

  const collab = createCollabRuntime({
    adapter: hub.adapter,
    teamProjectCatalog: hub.teamProjectCatalog,
  });

  const app = express();
  app.use(express.json());
  registerProjectRoutes(app, {
    db,
    design: { runs: { list: () => [], cancel: async () => {} } },
    http: { sendApiError, createSseResponse: () => ({ send: () => {} }) },
    paths: { PROJECTS_DIR: projectsDir },
    projectStore: {
      getProject,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      dbDeleteProject,
      removeProjectDir,
      insertProject,
      ensureWorkspaceProject,
    },
    projectFiles: {},
    conversations: {},
    templates: {},
    status: {},
    events: {},
    ids: { randomId: () => 'unused' },
    appConfig: {},
    agents: {},
    validation: {},
    verifyWorkspaceRequestAuthority: async (req: any) => {
      const workspaceId = req.get('x-od-workspace-id');
      const memberId = req.get('x-od-workspace-member-id');
      if (!workspaceId || !memberId) {
        return {
          ok: false,
          status: 400,
          code: 'WORKSPACE_CONTEXT_REQUIRED',
          message: 'an explicit workspace context is required',
        };
      }
      if (workspaceId !== WORKSPACE_ID || memberId !== OWNER_MEMBER_ID) {
        return {
          ok: false,
          status: 403,
          code: 'WORKSPACE_ACCESS_DENIED',
          message: 'workspace access denied',
        };
      }
      return {
        ok: true,
        context: workspaceContextFromDirectoryItem({
          workspaceId,
          workspaceName: workspaceId,
          workspaceType: 'team',
          workspaceMemberId: memberId,
          role: 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      };
    },
    collabSync: {
      requestTeamShare: (projectId: string, share?: string | ResourceHubPrincipal) =>
        collab.requestTeamShare(projectId, share),
      requestTeamUnshare: (projectId: string, share?: ResourceHubPrincipal | null) =>
        collab.requestTeamUnshare(projectId, share),
      refreshTeamProjectMetadata: (projectId: string) => collab.refreshTeamProjectMetadata(projectId),
      invalidateTeamProjectCatalog: () => {},
    },
  } as any);

  const created = http.createServer(app);
  server = created;
  await new Promise<void>((resolve) => created.listen(0, resolve));
  const address = created.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}`, db };
}

describe('DELETE /api/projects/:id unshares a team-visible project from the hub first', () => {
  it('unpublishes and drops the catalog entry BEFORE the local delete, for a project the caller shared', async () => {
    const hub = fakeHub();
    const { baseUrl, db } = await startServer(hub);
    const now = Date.now();
    const projectId = 'p-team-shared';
    insertProject(db, { id: projectId, name: 'Team shared', createdAt: now, updatedAt: now });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceState: 'active',
      syncState: 'synced',
    });

    // Seed the "hub" as ALREADY reporting the project shared — the exact
    // "hub still says shared" scenario the bug review asked to simulate,
    // modeling a resource published from an earlier `/move` or the initial
    // share (not something this test drives through `share()` itself).
    const principal: ResourceHubPrincipal = {
      memberId: OWNER_MEMBER_ID,
      teamId: WORKSPACE_ID,
      role: 'owner',
      lifecycleState: 'active',
    };
    hub.published.set(hub.key(projectId, principal), { version: 1 });
    hub.catalog.set(hub.key(projectId, principal), { projectId });
    expect(hub.published.has(hub.key(projectId, principal))).toBe(true);

    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: ownerHeaders(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // The real hub state actually transitioned — not just "a function was
    // called". This is the fix for the reported bug #1 pattern applied to
    // projects: the hub no longer reports the project as shared.
    expect(hub.published.has(hub.key(projectId, principal))).toBe(false);
    expect(hub.catalog.has(hub.key(projectId, principal))).toBe(false);
    expect(hub.unpublishCalls).toHaveLength(1);
    expect(hub.unpublishCalls[0]).toMatchObject({
      projectId,
      principal: { memberId: OWNER_MEMBER_ID, teamId: WORKSPACE_ID },
    });
    expect(hub.catalogRemoveCalls).toHaveLength(1);
    expect(hub.catalogRemoveCalls[0]).toMatchObject({
      projectId,
      principal: { memberId: OWNER_MEMBER_ID, teamId: WORKSPACE_ID },
    });

    // AND the local delete actually proceeded (unshare-then-delete, not
    // unshare-instead-of-delete).
    expect(getProject(db, projectId)).toBeFalsy();
    expect(getWorkspaceProjectByProjectId(db, projectId)).toBeFalsy();
  });

  it('does not touch the hub at all when deleting a personal (never-shared) project', async () => {
    const hub = fakeHub();
    const { baseUrl, db } = await startServer(hub);
    const now = Date.now();
    const projectId = 'p-personal';
    insertProject(db, { id: projectId, name: 'Personal', createdAt: now, updatedAt: now });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: WORKSPACE_ID,
      visibility: 'personal',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
    });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: ownerHeaders(),
    });
    expect(res.status).toBe(200);

    // No unshare traffic at all for a project that was never team-visible —
    // regression guard against always calling unpublish regardless of
    // visibility (which `TeamResourceShareService.unshare` itself does for
    // an unknown id, per the design-system module's own doc comment).
    expect(hub.unpublishCalls).toHaveLength(0);
    expect(hub.catalogRemoveCalls).toHaveLength(0);
    expect(getProject(db, projectId)).toBeFalsy();
  });
});

// spec 04 §11 explicitly parks the deeper gap — "already-bound rows are never
// re-verified against the hub" — as out of scope for this fix, but asks for
// empirical confirmation of whether "delete triggers unshare" alone is
// enough to make a MEMBER's own regular project list converge. Each daemon
// is a separate process with its OWN local SQLite `workspace_projects`
// table (see AGENTS.md's daemon data directory contract and
// `getWorkspaceProjectByProjectId`'s doc comment: "a project has exactly one
// workspace" — one row PER LOCAL DATABASE, not a shared cross-member table),
// so this models the member side as a second, independent `openDatabase`
// call with its own already-bound row for the SAME project id, exactly as it
// would look after the member previously opened/synced the team project.
//
// `GET /api/workspaces/:workspaceId/projects` (routes/project/index.ts)
// builds its response as
//   `[...rows.map(normalizeWorkspaceProjectRow), ...(needsRemoteTeamProjects
//   ? await listRemoteTeamProjectSummaries(rows, ctx) : [])]`
// where `rows = listWorkspaceProjects(db, ctx.workspaceId)` is read
// UNCONDITIONALLY from the LOCAL table, and `listRemoteTeamProjectSummaries`
// only ever ADDS remote entries with NO local match
// (`.filter((project) => !localResourceIds.has(project.resourceId))`) — it
// never removes an already-matched local row when the hub stops reporting
// it. `reconcileLocalRowWithRemoteTeamAccess`'s own doc comment says the same
// thing directly: it only reaches "a row that predates this project's
// current team binding", never an already-correctly-bound one. This test
// exercises that exact `listWorkspaceProjects` read (the literal query the
// route embeds verbatim) on the member's own database after the owner's
// hub-side unshare above, to confirm the row survives untouched.
describe('member-side convergence after an owner unshare (spec 04 §11, known gap — not fixed here)', () => {
  it('leaves the member\'s own already-bound workspace_projects row untouched after the owner unshares from the hub', async () => {
    // `openDatabase` is a module-level singleton (db.ts: opening a second
    // path closes whatever is currently open) — exactly like two real
    // daemons, which are separate PROCESSES with separate SQLite files, so
    // "owner" and "member" cannot be two simultaneously-open connections in
    // one test process either. The two phases below are run strictly in
    // sequence (owner phase fully closes its db before the member phase
    // opens its own), which is representative: this test isn't claiming the
    // member "watches" the delete live, only that the member's own row,
    // wherever/whenever it is read, is never touched by the owner's unshare.
    const hub = fakeHub();
    const { baseUrl, db: ownerDb } = await startServer(hub);
    const now = Date.now();
    const projectId = 'p-team-shared-member-view';
    insertProject(ownerDb, { id: projectId, name: 'Team shared', createdAt: now, updatedAt: now });
    ensureWorkspaceProject(ownerDb, {
      projectId,
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceState: 'active',
      syncState: 'synced',
    });
    const principal: ResourceHubPrincipal = {
      memberId: OWNER_MEMBER_ID,
      teamId: WORKSPACE_ID,
      role: 'owner',
      lifecycleState: 'active',
    };
    hub.published.set(hub.key(projectId, principal), { version: 1 });

    // Owner deletes — the SAME hub-state-transition already asserted in the
    // describe block above (real unpublish, real catalog removal).
    const ownerRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: ownerHeaders(),
    });
    expect(ownerRes.status).toBe(200);
    expect(hub.published.has(hub.key(projectId, principal))).toBe(false);

    // Owner's server/db phase is done — close it before opening the
    // member's own, separate local database (see comment above).
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    closeDatabase();

    // The MEMBER's own separate local database, already carrying a
    // synced-and-bound row for the exact same project — as it would look
    // after the member previously opened/synced the team project once. This
    // is created AFTER the owner's hub-side unshare above has already
    // completed, so the hub is provably already in the "unshared" state by
    // the time the member's row is read below.
    const memberTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-project-delete-unshare-member-'));
    const memberDb = openDatabase(memberTempDir);
    try {
      insertProject(memberDb, { id: projectId, name: 'Team shared', createdAt: now, updatedAt: now });
      ensureWorkspaceProject(memberDb, {
        projectId,
        workspaceId: WORKSPACE_ID,
        visibility: 'team',
        createdByWorkspaceMemberId: OWNER_MEMBER_ID,
        resourceState: 'active',
        syncState: 'synced',
      });

      // `listWorkspaceProjects` is the exact call the production list route
      // embeds unconditionally (`rows = listWorkspaceProjects(db,
      // ctx.workspaceId)` — see the module doc comment above), so this reads
      // the real function the route calls rather than reimplementing its
      // logic. The row survives untouched: nothing reconciles an
      // already-bound row against the hub's now-unshared state.
      const memberRows = listWorkspaceProjects(memberDb, WORKSPACE_ID);
      const memberRow = memberRows.find((row: any) => row.id === projectId);
      expect(memberRow).toBeTruthy();
      expect(memberRow?.workspaceVisibility).toBe('team');
    } finally {
      fs.rmSync(memberTempDir, { recursive: true, force: true });
    }
  });

  // Review regression (mrcfps, #6216). Once a headerless caller was allowed to
  // mutate a project the daemon's own identity owns, this handler's side effect
  // still re-derived its context from REQUEST HEADERS — which are absent — so
  // `requestTeamVisibility` was skipped and `dbDeleteProject` ran anyway. The
  // owner's local row and directory disappeared while the hub kept serving the
  // resource, so teammates went on seeing a project that no longer existed.
  //
  // Drives the real route with NO request headers and `workspaceContext.lastKnown()`
  // populated — the `od project delete` shape on a signed-in daemon — and asserts
  // the hub transition, not a spy call count. Ordering matters as much as
  // occurrence: a local delete that lands while the hub call is skipped leaves
  // exactly the inconsistency this guards, so the hub state is asserted to be
  // clean at the same moment the project is gone locally.
  it('unshares from the hub for an explicitly-scoped authoritative owner', async () => {
    const hub = fakeHub();
    const { baseUrl, db } = await startServer(hub);
    const now = Date.now();
    const projectId = 'p-team-shared-headerless';
    insertProject(db, { id: projectId, name: 'Team shared headerless', createdAt: now, updatedAt: now });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceState: 'active',
      syncState: 'synced',
    });

    const principal: ResourceHubPrincipal = {
      memberId: OWNER_MEMBER_ID,
      teamId: WORKSPACE_ID,
      role: 'owner',
      lifecycleState: 'active',
    };
    hub.published.set(hub.key(projectId, principal), { version: 1 });
    hub.catalog.set(hub.key(projectId, principal), { projectId });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: ownerHeaders(),
    });
    expect(res.status).toBe(200);

    // The hub learned about it...
    expect(
      hub.unpublishCalls.length,
      'an authorized delete must unpublish the shared resource',
    ).toBeGreaterThan(0);
    expect(hub.published.has(hub.key(projectId, principal))).toBe(false);
    expect(
      hub.catalogRemoveCalls.map((call) => call.projectId),
      'the catalog entry must be removed too',
    ).toContain(projectId);
    expect(hub.catalog.has(hub.key(projectId, principal))).toBe(false);

    // ...and the unshare was attributed to the verified explicit identity.
    expect(hub.unpublishCalls[0]?.principal?.teamId).toBe(WORKSPACE_ID);
    expect(hub.unpublishCalls[0]?.principal?.memberId).toBe(OWNER_MEMBER_ID);

    // Only then is it gone locally.
    expect(getProject(db, projectId)).toBeFalsy();
    expect(getWorkspaceProjectByProjectId(db, projectId)).toBeFalsy();
  });

  // The other half of the same invariant: with NO ambient identity either, the
  // gate refuses before anything is destroyed. A team-bound project must never be
  // deletable by a caller nothing can vouch for.
  it('refuses a headerless delete of a team-bound project when the daemon has no identity', async () => {
    const hub = fakeHub();
    const { baseUrl, db } = await startServer(hub);
    const now = Date.now();
    const projectId = 'p-team-shared-no-identity';
    insertProject(db, { id: projectId, name: 'Team shared no identity', createdAt: now, updatedAt: now });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: WORKSPACE_ID,
      visibility: 'team',
      createdByWorkspaceMemberId: OWNER_MEMBER_ID,
      resourceState: 'active',
      syncState: 'synced',
    });

    const res = await fetch(`${baseUrl}/api/projects/${projectId}`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(hub.unpublishCalls.length).toBe(0);
    expect(getProject(db, projectId), 'nothing may be destroyed locally either').toBeTruthy();
  });
});
