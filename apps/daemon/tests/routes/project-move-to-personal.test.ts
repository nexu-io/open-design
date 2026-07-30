// Regression coverage for recvqfNnRETNtM ("提取的设计系统,移回仅自己可见失败") and
// recvqgejeqK2OJ ("移动到团队空间后,没有办法移回了").
//
// Root cause: `/api/workspaces/:workspaceId/projects/:projectId/move` binds a
// project with NO existing `workspace_projects` row via
// `ensureWorkspaceProjection(project, ctx, 'personal')`, hard-coding
// `visibility: 'personal'` regardless of what the caller actually requested.
// `canMoveToPersonal` then requires the row to ALREADY be `visibility: 'team'`
// — a requirement the route itself just made impossible to satisfy — so the
// very first "move to personal" ever attempted on an unbound project always
// 403s with `PROJECT_DELETE_FORBIDDEN`, no matter how privileged the caller
// is. See `reconcileUnboundProjectBeforeMove` in
// `apps/daemon/src/routes/project/index.ts` for the fix and its full
// reasoning.
//
// Two real, independently-producible sources of an unbound project are
// exercised here, matching the two Feishu reports:
//   1. `startBrandExtraction` (the real "extract design system" backing
//      pipeline, `apps/daemon/src/brands/index.ts`) never calls
//      `ensureWorkspaceProject` for the project it creates — confirmed by
//      calling the real function and asserting the row is absent, not by
//      hand-writing a database row.
//   2. `POST /api/projects` with no workspace headers (the same "legacy /
//      orphan project" shape the rest of this test directory already relies
//      on) — the ordinary-project case behind recvqgejeqK2OJ.
import express from 'express';
import type http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerProjectRoutes } from '../../src/routes/project/index.js';
import { registerCollabContextRoutes } from '../../src/routes/collab-context.js';
import { startBrandExtraction } from '../../src/brands/index.js';
import {
  closeDatabase,
  deleteWorkspaceProject,
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

// Real repo skills root so the bundled brand-kit template resolves, exactly
// like brand-extraction-engine.test.ts.
const SKILLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../skills');

const NO_LOGO_FALLBACK = async () => ({ changed: false });
const NO_IMAGERY_FALLBACK = async () => ({ changed: false });
const NO_SEED_FALLBACK = async () => ({ changed: false });

// The reporter's real ids from recvqfNnRETNtM, kept verbatim.
const TEAM_WORKSPACE_ID = 'i05lx8ufnrrhloo8qxrpetwt';
const OWNER_MEMBER_ID = 'eu7o99459dcojtv2osoprr5k';

const DESIGN_MD_INPUT = `---
name: Heritage
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
---

# Heritage

## Overview
A minimal reference brand used to drive brand extraction fully offline.
`;

function ownerTeamHeaders(extra: Record<string, string> = {}) {
  // Mirrors the real curl from recvqfNnRETNtM byte-for-byte where it matters:
  // owner role, active member, every permission bit granted.
  return {
    'content-type': 'application/json',
    'x-od-workspace-id': TEAM_WORKSPACE_ID,
    'x-od-workspace-member-id': OWNER_MEMBER_ID,
    'x-od-workspace-role': 'owner',
    'x-od-workspace-type': 'team',
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
    ...extra,
  };
}

function teamHeaders(input: {
  memberId: string;
  role: 'owner' | 'admin' | 'member';
}) {
  return ownerTeamHeaders({
    'x-od-workspace-member-id': input.memberId,
    'x-od-workspace-role': input.role,
  });
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

describe('project move to personal on an unbound (never-locally-shared) project', () => {
  let tempDir: string;
  let projectsRoot: string;
  let brandsRoot: string;
  let userDesignSystemsRoot: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'od-move-to-personal-'));
    projectsRoot = path.join(tempDir, 'projects');
    brandsRoot = path.join(tempDir, 'brands');
    userDesignSystemsRoot = path.join(tempDir, 'user-design-systems');
    db = openDatabase(projectsRoot, { dataDir: tempDir });
  });

  afterEach(async () => {
    closeDatabase();
    await rm(tempDir, { recursive: true, force: true });
  });

  // Real deps object for `registerProjectRoutes`, wired to the SAME real
  // sqlite db the brand extraction call above writes into — every
  // `projectStore` function is the genuine `db.ts` implementation, not a
  // fixed-snapshot stub, so the route exercises real read-modify-write
  // behavior end to end.
  function buildDeps(overrides: {
    teamProjectCatalog?: unknown;
    collabSync?: Record<string, unknown>;
  } = {}) {
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
        SKILLS_DIR: '',
        BRANDS_DIR: brandsRoot,
        USER_DESIGN_SYSTEMS_DIR: userDesignSystemsRoot,
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
        deleteWorkspaceProject: (_db: unknown, workspaceId: string, projectId: string) =>
          deleteWorkspaceProject(db, workspaceId, projectId),
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
      collabSync: overrides.collabSync ?? {
        requestTeamShare: noop,
        requestTeamUnshare: noop,
        invalidateTeamProjectCatalog: noop,
      },
      teamProjectCatalog: overrides.teamProjectCatalog,
    } as unknown as Parameters<typeof registerProjectRoutes>[1];
  }

  it('never locally binds the backing project a real design-system extraction creates', async () => {
    // Real production call, no hand-written database rows: this is exactly
    // `POST /api/brands` → `startBrandExtraction` (apps/daemon/src/brand-routes.ts).
    // Deliberately omits `userDesignSystemsRoot` so the pipeline takes its
    // synchronous, non-programmatic path (no backgrounded network-touching
    // work left dangling past this call) — the exact line under test
    // (brands/index.ts's unconditional `insertProject` with no workspace
    // binding) runs on BOTH paths, so this stays a faithful real-code repro
    // of the root cause without the flakiness of a real font/network fetch.
    const result = await startBrandExtraction({
      designMd: DESIGN_MD_INPUT,
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
      seedFallback: NO_SEED_FALLBACK,
    });

    expect(getProject(db, result.projectId)).toBeTruthy();
    // The actual bug precondition, produced by real code: the backing
    // project has no `workspace_projects` row at all.
    expect(getWorkspaceProjectByProjectId(db, result.projectId)).toBeUndefined();
  });

  it('closes the causal gap: the real endpoint the web client reads for "is this shared" reports the unbound project as shared', async () => {
    // Sharpest objection to this whole diagnosis: if the project's local
    // workspace_projects row genuinely never existed, why would the web
    // client ever have shown it as team-shared in the first place (the
    // precondition for a user to see, and click, "move out of team")?
    //
    // Verified answer, from the REAL client + REAL daemon code (not
    // assumption): the web client does NOT read `workspace_projects` to
    // decide this. Both real UI surfaces that gate the "move to personal"
    // affordance —
    //   - `RecentProjectsStrip.tsx`'s "共享" badge / "移出团队" menu item, via
    //     `createSharedProjectPredicate({ teamProjects })`
    //     (apps/web/src/collab/all-projects-list.ts)
    //   - `FileWorkspace.tsx`'s in-project Share toggle, via
    //     `projectIsSharedWithWorkspace(projectId)`, which falls back to the
    //     exact same source
    // both resolve `teamProjects` from `GET /api/workspace/projects/team`
    // (apps/daemon/src/routes/collab-context.ts), which is backed by the
    // resource hub's OWN team-project catalog — an external system this
    // daemon's local sqlite does not control and is not the same store as
    // `workspace_projects`. `apps/daemon/src/collab/team-projects.ts`
    // confirms it: `createTeamProjectsLister` calls
    // `teamProjectCatalog.list()` directly, the identical client instance
    // (`velaCliTeamProjectCatalog`, wired in server.ts) `/move`'s own
    // `teamProjectCatalog` reconciliation reads.
    //
    // So: whenever the hub genuinely lists a project (for whatever external
    // reason — this codebase's own brand-extraction pipeline never
    // registers one, so that registration is not something this repo's code
    // performs; it is either the hub's own cross-referencing of the
    // extraction's linked, team-claimed design system, or a share taken from
    // a different device/session), a user opening this project SEES it as
    // team-shared and "move to personal" is a live, meaningful action — with
    // or without a matching LOCAL `workspace_projects` row. This test proves
    // that half of the chain with the real route, not a guess: inject the
    // exact same hub record `/move`'s tests use directly into
    // `registerCollabContextRoutes`'s `listTeamProjects` seam (the
    // documented test injection point for this exact external dependency)
    // and confirm the endpoint the client actually calls echoes it back.
    const result = await startBrandExtraction({
      designMd: DESIGN_MD_INPUT,
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
      seedFallback: NO_SEED_FALLBACK,
    });
    expect(getWorkspaceProjectByProjectId(db, result.projectId)).toBeUndefined();

    const app = express();
    app.use(express.json());
    registerCollabContextRoutes(app, {
      workspaceContext: { current: async () => null },
      fetchWorkspaceDirectory: async () => ({
        ok: true,
        items: [
          {
            workspaceId: TEAM_WORKSPACE_ID,
            workspaceMemberId: OWNER_MEMBER_ID,
            workspaceType: 'team',
            workspaceName: 'Heritage Team',
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
            resourceTeamId: TEAM_WORKSPACE_ID,
            permissions: {
              canManageBilling: true,
              canManageMembers: true,
              canInviteMembers: true,
              canShareProjects: true,
              canWriteSyncedFiles: true,
            },
          },
        ],
      }),
      listTeamProjects: async () => [
        {
          projectId: result.projectId,
          ownerMemberId: 'some-other-member-id',
          sharedAt: new Date(10).toISOString(),
          name: 'Heritage Design System',
        },
      ],
    });
    const routeServer = await listen(app);
    try {
      const resp = await fetch(`${routeServer.url}/api/workspace/projects/team`, {
        headers: ownerTeamHeaders(),
      });
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as { projects: Array<{ projectId: string }> };
      expect(body.projects.some((project) => project.projectId === result.projectId)).toBe(true);
    } finally {
      await close(routeServer.server);
    }
  });

  it.each(['owner', 'admin'] as const)(
    'lets a Workspace %s use the one-request catalog witness to recover a real unbound extraction project (recvqfNnRETNtM)',
    async (role) => {
      const result = await startBrandExtraction({
        designMd: DESIGN_MD_INPUT,
        brandsRoot,
        projectsRoot,
        skillsRoot: SKILLS_ROOT,
        db,
        logoFallback: NO_LOGO_FALLBACK,
        imageryFallback: NO_IMAGERY_FALLBACK,
        seedFallback: NO_SEED_FALLBACK,
      });
      // Precondition, from real code: still unbound.
      expect(getWorkspaceProjectByProjectId(db, result.projectId)).toBeUndefined();

      const resourceId = `project-${result.projectId}`;
      const teamProjectCatalog = {
        list: vi.fn(async () => [
          {
            id: `catalog-${result.projectId}`,
            workspaceId: TEAM_WORKSPACE_ID,
            projectId: result.projectId,
            resourceId,
            // The hub never learned an owner for this project either — nothing
            // in the brand-extraction pipeline ever registers one. The fix must
            // NOT require this to equal the caller's own member id.
            ownerMemberId: 'some-other-member-id',
            displayName: 'Heritage Design System',
            syncState: 'synced',
            lastSyncedVersionId: 'v1',
            createdAt: new Date(10).toISOString(),
            updatedAt: new Date(20).toISOString(),
            access: { canView: true, canComment: true, canEdit: true, frozen: false },
          },
        ]),
        upsert: vi.fn(),
      };

      const app = express();
      app.use(express.json());
      registerProjectRoutes(app, buildDeps({ teamProjectCatalog }));
      const routeServer = await listen(app);
      try {
        const resp = await fetch(
          `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${result.projectId}/move`,
          {
            method: 'POST',
            headers: teamHeaders({ memberId: OWNER_MEMBER_ID, role }),
            body: JSON.stringify({ visibility: 'personal' }),
          },
        );
        const body = await resp.json() as any;
        expect(resp.status, `expected 200, got ${resp.status}: ${JSON.stringify(body)}`).toBe(200);
        expect(body.project).toMatchObject({
          id: result.projectId,
          visibility: 'personal',
          syncState: 'local_only',
          resourceHubResourceId: null,
        });

        const row = getWorkspaceProjectByProjectId(db, result.projectId);
        expect(row).toMatchObject({ workspaceId: TEAM_WORKSPACE_ID, visibility: 'personal' });
      } finally {
        await close(routeServer.server);
      }
    },
  );

  it('removes a privileged orphan recovery binding after unshare fails so owner/admin can retry', async () => {
    const projectId = `retryable-orphan-${Date.now()}`;
    insertProject(db, {
      id: projectId,
      name: 'Retryable privileged orphan',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toBeUndefined();

    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${projectId}`,
          workspaceId: TEAM_WORKSPACE_ID,
          projectId,
          resourceId: `project-${projectId}`,
          ownerMemberId: 'historical-project-creator',
          displayName: 'Retryable privileged orphan',
          syncState: 'synced',
          lastSyncedVersionId: 'v1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: { canView: true, canComment: true, canEdit: true, frozen: false },
        },
      ]),
      upsert: vi.fn(),
    };
    const requestTeamUnshare = vi.fn()
      .mockRejectedValueOnce(new Error('temporary resource hub failure'))
      .mockResolvedValueOnce(undefined);
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildDeps({
      teamProjectCatalog,
      collabSync: {
        requestTeamShare: vi.fn(),
        requestTeamUnshare,
        invalidateTeamProjectCatalog: vi.fn(),
      },
    }));
    const routeServer = await listen(app);
    try {
      const move = () => fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: teamHeaders({ memberId: OWNER_MEMBER_ID, role: 'admin' }),
          body: JSON.stringify({ visibility: 'personal' }),
        },
      );

      const failed = await move();
      expect(failed.status).toBe(400);
      expect(getWorkspaceProjectByProjectId(db, projectId)).toBeUndefined();

      const retried = await move();
      expect(retried.status).toBe(200);
      expect(requestTeamUnshare).toHaveBeenCalledTimes(2);
      expect(getWorkspaceProjectByProjectId(db, projectId)).toMatchObject({
        workspaceId: TEAM_WORKSPACE_ID,
        visibility: 'personal',
      });
    } finally {
      await close(routeServer.server);
    }
  });

  it('403s PROJECT_DELETE_FORBIDDEN for the same orphan project when the fix is bypassed (documents the pre-fix failure)', async () => {
    // Same setup as above, but WITHOUT a teamProjectCatalog wired up — the
    // exact condition `reconcileUnboundProjectBeforeMove` early-returns on
    // (`if (!teamProjectCatalog) return;`). This is what production looked
    // like before the fix for every caller, and is still the real, correct
    // behavior today when the hub genuinely has no opinion (e.g. catalog
    // unconfigured) — the code must fall back to reporting "not currently
    // team" rather than guessing.
    const result = await startBrandExtraction({
      designMd: DESIGN_MD_INPUT,
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
      seedFallback: NO_SEED_FALLBACK,
    });

    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildDeps({ teamProjectCatalog: undefined }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${result.projectId}/move`,
        {
          method: 'POST',
          headers: ownerTeamHeaders(),
          body: JSON.stringify({ visibility: 'personal' }),
        },
      );
      expect(resp.status).toBe(403);
      const body = await resp.json() as any;
      expect(body.error.code).toBe('PROJECT_DELETE_FORBIDDEN');
    } finally {
      await close(routeServer.server);
    }
  });

  it('moves an ordinary orphaned project back to personal once the team hub confirms it is shared (recvqgejeqK2OJ)', async () => {
    // No brand/design-system involved at all — a plain project created with
    // no workspace headers (`POST /api/projects` without headers), the same
    // orphan shape the rest of this directory's suite already relies on
    // (see "projects legacy rows into a workspace list ..." above).
    const projectId = `plain-clone-${Date.now()}`;
    insertProject(db, {
      id: projectId,
      name: 'Cloned website',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(getWorkspaceProjectByProjectId(db, projectId)).toBeUndefined();

    const resourceId = `project-${projectId}`;
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${projectId}`,
          workspaceId: TEAM_WORKSPACE_ID,
          projectId,
          resourceId,
          ownerMemberId: OWNER_MEMBER_ID,
          displayName: 'Cloned website',
          syncState: 'synced',
          lastSyncedVersionId: 'v1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: { canView: true, canComment: true, canEdit: true, frozen: false },
        },
      ]),
      upsert: vi.fn(),
    };

    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildDeps({ teamProjectCatalog }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: ownerTeamHeaders(),
          body: JSON.stringify({ visibility: 'personal' }),
        },
      );
      const body = await resp.json() as any;
      expect(resp.status, `expected 200, got ${resp.status}: ${JSON.stringify(body)}`).toBe(200);
      expect(body.project).toMatchObject({ id: projectId, visibility: 'personal' });
    } finally {
      await close(routeServer.server);
    }
  });

  it('does not let a non-creator member consume the catalog recovery witness', async () => {
    const projectId = `orphan-non-creator-${Date.now()}`;
    insertProject(db, {
      id: projectId,
      name: 'Orphan owned by another member',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const teamProjectCatalog = {
      list: vi.fn(async () => [
        {
          id: `catalog-${projectId}`,
          workspaceId: TEAM_WORKSPACE_ID,
          projectId,
          resourceId: `project-${projectId}`,
          ownerMemberId: 'actual-project-creator',
          displayName: 'Orphan owned by another member',
          syncState: 'synced',
          lastSyncedVersionId: 'v1',
          createdAt: new Date(10).toISOString(),
          updatedAt: new Date(20).toISOString(),
          access: { canView: true, canComment: true, canEdit: false, frozen: false },
        },
      ]),
      upsert: vi.fn(),
    };
    const requestTeamUnshare = vi.fn();
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildDeps({
      teamProjectCatalog,
      collabSync: {
        requestTeamShare: vi.fn(),
        requestTeamUnshare,
        invalidateTeamProjectCatalog: vi.fn(),
      },
    }));
    const routeServer = await listen(app);
    try {
      const response = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: teamHeaders({ memberId: 'another-member', role: 'member' }),
          body: JSON.stringify({ visibility: 'personal' }),
        },
      );

      expect(response.status).toBe(403);
      expect(requestTeamUnshare).not.toHaveBeenCalled();
      // A rejected reader must not consume the orphan state by leaving a
      // sticky binding that prevents a later owner/admin recovery request.
      expect(getWorkspaceProjectByProjectId(db, projectId)).toBeUndefined();
    } finally {
      await close(routeServer.server);
    }
  });

  it('keeps an ordinary bound Team project creator-only for move-to-personal', async () => {
    const projectId = `bound-team-project-${Date.now()}`;
    insertProject(db, {
      id: projectId,
      name: 'Ordinary shared project',
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
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'project-creator',
      updatedByWorkspaceMemberId: 'project-creator',
      resourceHubResourceId: `project-${projectId}`,
      cloudTombstonedAt: null,
      syncState: 'synced',
    });
    const teamProjectCatalog = { list: vi.fn(async () => []), upsert: vi.fn() };
    const requestTeamUnshare = vi.fn(async () => undefined);
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildDeps({
      teamProjectCatalog,
      collabSync: {
        requestTeamShare: vi.fn(),
        requestTeamUnshare,
        invalidateTeamProjectCatalog: vi.fn(),
      },
    }));
    const routeServer = await listen(app);
    try {
      for (const role of ['owner', 'admin'] as const) {
        const denied = await fetch(
          `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
          {
            method: 'POST',
            headers: teamHeaders({ memberId: `${role}-non-creator`, role }),
            body: JSON.stringify({ visibility: 'personal' }),
          },
        );
        expect(denied.status).toBe(403);
      }

      const creator = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: teamHeaders({ memberId: 'project-creator', role: 'member' }),
          body: JSON.stringify({ visibility: 'personal' }),
        },
      );
      expect(creator.status).toBe(200);
      expect(requestTeamUnshare).toHaveBeenCalledTimes(1);
      expect(teamProjectCatalog.list).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });

  it('still 403s move-to-personal for a project the hub has never heard of (no over-grant)', async () => {
    // Guards against the fix over-relaxing the check: a project that really
    // is only ever personal (never shared anywhere) must keep 403ing a
    // redundant "move to personal" — this is existing, correct behavior
    // (see "projects legacy rows for batch operations..." in
    // workspace-projects.test.ts) and must not regress.
    const projectId = `never-shared-${Date.now()}`;
    insertProject(db, {
      id: projectId,
      name: 'Never shared',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const teamProjectCatalog = { list: vi.fn(async () => []), upsert: vi.fn() };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildDeps({ teamProjectCatalog }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: ownerTeamHeaders(),
          body: JSON.stringify({ visibility: 'personal' }),
        },
      );
      expect(resp.status).toBe(403);
      const body = await resp.json() as any;
      expect(body.error.code).toBe('PROJECT_DELETE_FORBIDDEN');
      expect(teamProjectCatalog.list).toHaveBeenCalled();

      // And the row this defaulted to stays a normal, genuinely personal
      // local draft — not silently promoted to team.
      const row = getWorkspaceProjectByProjectId(db, projectId);
      expect(row).toMatchObject({ visibility: 'personal' });
    } finally {
      await close(routeServer.server);
    }
  });

  it('does not touch the move-to-team direction for an unbound project (canMoveToTeam unaffected)', async () => {
    const projectId = `fresh-orphan-${Date.now()}`;
    insertProject(db, {
      id: projectId,
      name: 'Fresh orphan',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: null,
      customInstructions: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const teamProjectCatalog = { list: vi.fn(async () => []), upsert: vi.fn() };
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, buildDeps({ teamProjectCatalog }));
    const routeServer = await listen(app);
    try {
      const resp = await fetch(
        `${routeServer.url}/api/workspaces/${TEAM_WORKSPACE_ID}/projects/${projectId}/move`,
        {
          method: 'POST',
          headers: ownerTeamHeaders(),
          body: JSON.stringify({ visibility: 'team' }),
        },
      );
      const body = await resp.json() as any;
      expect(resp.status, `expected 200, got ${resp.status}: ${JSON.stringify(body)}`).toBe(200);
      expect(body.project).toMatchObject({ id: projectId, visibility: 'team' });
      // The reconciliation guard is scoped to the 'personal' direction only —
      // it must not even consult the catalog for a 'team' request.
      expect(teamProjectCatalog.list).not.toHaveBeenCalled();
    } finally {
      await close(routeServer.server);
    }
  });
});
