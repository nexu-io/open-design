// Regression: a local install that never signed into a Workspace lost its
// personal design system from EVERY catalog lane after the 0.21.x
// `workspace_resources` envelope regime shipped.
//
// The install's normal state: the web/desktop shell always sends the local
// personal Workspace scope (`x-od-workspace-id` + `x-od-workspace-member-id`,
// type `personal`), while its legacy `workspace_projects` rows carry NO
// `created_by_workspace_member_id` — lazy orphan adoption deliberately writes
// them unattributed (`ensureWorkspaceProjection`, routes/project/index.ts).
// On startup, `backfillDesignSystemWorkspaceResources` infers a design
// system's claim from such a row and writes an equally unattributed
// `visibility: 'personal'` binding. The read gate then rejected that binding
// in the scoped lane (creator-member mismatch) AND hid the system from the
// headerless lane (any binding is "positive evidence" of Workspace
// ownership) — a catch-22 with no lane left that could ever show the system.
//
// The projects layer already rules on this exact state: an unattributed
// personal row in a non-team workspace belongs to the local user
// (`workspaceProjectCreatedByCurrentMember`, routes/project/index.ts). These
// specs pin the same ruling for the design-system catalog and read gates,
// plus the backfill invariant that it must never manufacture a binding the
// read gate categorically rejects.

import express from 'express';
import type http from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  ensureWorkspaceProject,
  ensureWorkspaceResource,
  getProject,
  getWorkspaceResource,
  getWorkspaceResourceByResourceId,
  insertProject,
  openDatabase,
  updateProject,
} from '../../src/db.js';
import {
  backfillDesignSystemWorkspaceResources,
  LEGACY_DESIGN_SYSTEM_ARTIFACTS,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readDesignSystemStaticFile,
  readUserDesignSystemFile,
  readUserDesignSystemFileBytes,
  syncUserDesignSystemAssetsFromFiles,
} from '../../src/design-systems/index.js';
import { createDesignSystemServerServices } from '../../src/design-systems/server-services.js';
import { verifyLocalWorkspaceRequestContext } from '../../src/collab/request-workspace-context.js';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';
import { registerStaticResourceRoutes } from '../../src/routes/static-resource.js';
import {
  isSafeId,
  listFiles,
  readProjectFile,
  resolveProjectDir,
  writeProjectFile,
} from '../../src/projects.js';

const WORKSPACE = 'ytzcr6qaq2ko4z8q8q8p14zf';
const OTHER_WORKSPACE = 'jg63to8cbic0kzbczbu95a4g';
const LOCAL_MEMBER = 'local-member-1';

let server: http.Server | null = null;
let root: string | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
  closeDatabase();
  vi.restoreAllMocks();
  if (root) {
    rmSync(root, { recursive: true, force: true });
    root = null;
  }
});

function commonPaths(base: string) {
  return {
    ARTIFACTS_DIR: path.join(base, 'artifacts'),
    BRANDS_DIR: path.join(base, 'brands'),
    BUNDLED_PETS_DIR: path.join(base, 'pets'),
    CRAFT_DIR: path.join(base, 'craft'),
    DESIGN_SYSTEMS_DIR: path.join(base, 'design-systems'),
    DESIGN_TEMPLATES_DIR: path.join(base, 'design-templates'),
    LIBRARY_DIR: path.join(base, 'library'),
    OD_BIN: path.join(base, 'od'),
    PROJECT_ROOT: base,
    PROJECTS_DIR: path.join(base, 'projects'),
    PROMPT_TEMPLATES_DIR: path.join(base, 'prompt-templates'),
    RUNTIME_DATA_DIR: path.join(base, 'data'),
    RUNTIME_DATA_DIR_CANONICAL: path.join(base, 'data'),
    SKILLS_DIR: path.join(base, 'skills'),
    USER_DESIGN_SYSTEMS_DIR: path.join(base, 'user-design-systems'),
    USER_DESIGN_TEMPLATES_DIR: path.join(base, 'user-design-templates'),
    USER_SKILLS_DIR: path.join(base, 'user-skills'),
  };
}

function seedUserSystem(base: string, dirId: string, metadata: Record<string, unknown>): void {
  const dir = path.join(base, 'user-design-systems', dirId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'DESIGN.md'), `# ${dirId}\n\nA local personal system.\n`, 'utf8');
  writeFileSync(
    path.join(dir, 'metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Reproduce the exact on-disk + DB state of the reported install, then run
 * the same startup backfill `server.ts` runs, and build the REAL server
 * services over that state (no stubbed catalog).
 */
async function seedLocalInstall() {
  root = mkdtempSync(path.join(os.tmpdir(), 'od-ds-local-install-'));
  const paths = commonPaths(root);
  seedUserSystem(root, 'skyfarm', { title: 'Skyfarm', projectId: 'ds-skyfarm' });
  const db = openDatabase(paths.RUNTIME_DATA_DIR, { dataDir: paths.RUNTIME_DATA_DIR });
  insertProject(db, { id: 'ds-skyfarm', name: 'Skyfarm', createdAt: 1, updatedAt: 1 });
  // Legacy orphan adoption shape: bound to the personal workspace with NO
  // creator member (`ensureWorkspaceProjection` writes exactly this).
  ensureWorkspaceProject(db, {
    workspaceId: WORKSPACE,
    projectId: 'ds-skyfarm',
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: null,
  });
  await backfillDesignSystemWorkspaceResources(db, paths.USER_DESIGN_SYSTEMS_DIR);
  const services = createDesignSystemServerServices({
    getDb: () => db,
    roots: { SKILL_ROOTS: [], DESIGN_TEMPLATE_ROOTS: [], ALL_SKILL_LIKE_ROOTS: [] },
    paths: {
      PROJECTS_DIR: paths.PROJECTS_DIR,
      DESIGN_SYSTEMS_DIR: paths.DESIGN_SYSTEMS_DIR,
      USER_DESIGN_SYSTEMS_DIR: paths.USER_DESIGN_SYSTEMS_DIR,
    },
    skills: {
      listSkills: async () => [],
      findSkillById: () => undefined,
    },
    designSystems: {
      listDesignSystems,
      readDesignSystem,
      readDesignSystemPackageInfo,
      readDesignSystemStaticFile,
      listUserDesignSystemFiles,
      readUserDesignSystemFile,
      readUserDesignSystemFileBytes,
      linkUserDesignSystemProject,
      syncUserDesignSystemAssetsFromFiles,
      LEGACY_DESIGN_SYSTEM_ARTIFACTS,
    } as never,
    projects: {
      getProject,
      insertProject,
      updateProject,
      readProjectFile,
      writeProjectFile,
      listFiles,
      resolveProjectDir,
      isSafeId,
    },
  });
  return { db, paths, services };
}

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address() as { port: number };
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function startCatalogRoute(
  seeded: Awaited<ReturnType<typeof seedLocalInstall>>,
): Promise<string> {
  const app = express();
  app.use(express.json());
  registerStaticResourceRoutes(app, {
    db: seeded.db,
    // The list route resolves identity through the local header authority,
    // like production. The legacy allowance's witness is the daemon's own
    // request verifier, which on a local/dev install (no signed membership
    // directory) is the production local verifier: the explicit headers are
    // the complete, static authority there.
    verifyWorkspaceRequestAuthority: async (req: unknown) => verifyLocalWorkspaceRequestContext(req),
    http: {
      createSseResponse: () => undefined,
      getPublicBaseUrl: () => '',
      isLocalSameOrigin: () => true,
      requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) => next(),
      resolvedPortRef: { current: 0 },
      sendApiError: () => undefined,
      sendLiveArtifactRouteError: () => undefined,
      sendMulterError: () => undefined,
    },
    paths: seeded.paths,
    resources: {
      listAllDesignSystems: seeded.services.listAllDesignSystems,
      resolveWorkspaceScope: async () => null,
      listAllSkills: async () => [],
      listAllDesignTemplates: async () => [],
      listAllSkillLikeEntries: async () => [],
      mimeFor: () => 'application/octet-stream',
    },
  } as never);
  return listen(app);
}

async function startDetailRoute(
  seeded: Awaited<ReturnType<typeof seedLocalInstall>>,
): Promise<string> {
  const app = express();
  app.use(express.json());
  registerDesignSystemRoutes(app, {
    db: seeded.db,
    paths: seeded.paths,
    projectFiles: {} as never,
    projectStore: {} as never,
    // Same witness as the catalog fixture above: the production local verifier.
    verifyWorkspaceRequestAuthority: async (req: unknown) => verifyLocalWorkspaceRequestContext(req),
    workspaceResources: {
      getWorkspaceResource: getWorkspaceResource as never,
      getWorkspaceResourceByResourceId: getWorkspaceResourceByResourceId as never,
    },
    designSystems: {
      buildUserDesignSystemArchive: async () => null,
      canMutateUserDesignSystem: async () => true,
      createUserDesignSystem: async () => {
        throw new Error('not exercised');
      },
      deleteUserDesignSystem: async () => false,
      ensureUserDesignSystemWorkspaceProject: async () => null,
      listAllDesignSystems: seeded.services.listAllDesignSystems,
      listUserDesignSystemFiles: async () => null,
      listUserDesignSystemRevisions: async () => null,
      prepareDesignTokenContractRebuild: async () => ({ decision: { available: false } }) as never,
      readAvailableDesignSystem: seeded.services.readAvailableDesignSystem,
      readAvailableDesignSystemPackageInfo: seeded.services.readAvailableDesignSystemPackageInfo,
      readAvailableDesignSystemStaticFile: seeded.services.readAvailableDesignSystemStaticFile,
      readDesignSystemWorkspaceTextFile: seeded.services.readDesignSystemWorkspaceTextFile,
      readUserDesignSystemFile: async () => null,
      renderDesignSystemPreview: () => '',
      renderDesignSystemShowcase: () => '',
      syncUserDesignSystemAssetsFromWorkspace: async () => ({ ok: false, reason: 'not-found' }),
      unshareTeamDesignSystemIfShared: async () => false,
      updateUserDesignSystem: async () => null,
      updateUserDesignSystemRevisionStatus: async () => null,
    },
    generationJobs: {
      get: () => null,
      rebuildTokenContract: () => ({}) as never,
      revise: () => ({}) as never,
      start: () => ({}) as never,
    },
  } as never);
  return listen(app);
}

function personalScopeHeaders(): Record<string, string> {
  return {
    'x-od-workspace-id': WORKSPACE,
    'x-od-workspace-member-id': LOCAL_MEMBER,
    'x-od-workspace-type': 'personal',
  };
}

async function listCatalogIds(
  baseUrl: string,
  headers?: Record<string, string>,
): Promise<string[]> {
  const resp = await fetch(`${baseUrl}/api/design-systems`, headers ? { headers } : {});
  expect(resp.status).toBe(200);
  const body = (await resp.json()) as { designSystems: Array<{ id: string }> };
  return body.designSystems.map((system) => system.id);
}

describe('local install without a Workspace sign-in keeps its personal design system', () => {
  it('lists the backfilled system for the local personal-workspace scope (the lane the UI uses)', async () => {
    const seeded = await seedLocalInstall();
    const baseUrl = await startCatalogRoute(seeded);

    const ids = await listCatalogIds(baseUrl, personalScopeHeaders());

    expect(ids).toContain('user:skyfarm');
  });

  it('lists the backfilled system for the headerless local lane (the lane the CLI uses)', async () => {
    const seeded = await seedLocalInstall();
    const baseUrl = await startCatalogRoute(seeded);

    const ids = await listCatalogIds(baseUrl);

    expect(ids).toContain('user:skyfarm');
  });

  it('still hides the unattributed personal binding from team and foreign-workspace scopes', async () => {
    const seeded = await seedLocalInstall();
    const baseUrl = await startCatalogRoute(seeded);

    const teamScope = await listCatalogIds(baseUrl, {
      ...personalScopeHeaders(),
      'x-od-workspace-type': 'team',
    });
    const foreignScope = await listCatalogIds(baseUrl, {
      'x-od-workspace-id': OTHER_WORKSPACE,
      'x-od-workspace-member-id': 'member-elsewhere',
      'x-od-workspace-type': 'personal',
    });

    expect(teamScope).not.toContain('user:skyfarm');
    expect(foreignScope).not.toContain('user:skyfarm');
  });

  it('keeps the strict gate for a same-workspace scope that does not assert its type', async () => {
    // The `x-od-workspace-type` header is optional on the wire, and a missing
    // header is NOT an assertion of a personal workspace: a Team client that
    // simply omits the optional header must not inherit the personal-only
    // legacy allowance. The allowance keys on the caller's EXPLICIT
    // `personal` assertion confirmed by membership verification
    // (`workspaceTypeVerified`), so an unasserted scope stays on the strict
    // pre-existing behavior (fail-closed). The Vela-mode counterpart — a
    // directory that says Team while the request claims personal — lives in
    // local-install-personal-verified-workspace.test.ts.
    const seeded = await seedLocalInstall();
    const catalogUrl = await startCatalogRoute(seeded);

    const unasserted = await listCatalogIds(catalogUrl, {
      'x-od-workspace-id': WORKSPACE,
      'x-od-workspace-member-id': LOCAL_MEMBER,
    });

    expect(unasserted).not.toContain('user:skyfarm');
  });

  it('rejects the detail read for a same-workspace scope that does not assert its type', async () => {
    const seeded = await seedLocalInstall();
    const baseUrl = await startDetailRoute(seeded);

    const resp = await fetch(`${baseUrl}/api/design-systems/user%3Askyfarm`, {
      headers: {
        'x-od-workspace-id': WORKSPACE,
        'x-od-workspace-member-id': LOCAL_MEMBER,
      },
    });

    expect(resp.status).toBe(403);
  });

  it('serves navigation reads whose URL carries the asserted personal scope', async () => {
    // iframe/img navigations cannot attach headers; the web shell preserves
    // the exact scope in query parameters (`workspaceResourceUrl`), including
    // the asserted workspace type.
    const seeded = await seedLocalInstall();
    const baseUrl = await startDetailRoute(seeded);

    const query = `workspaceId=${WORKSPACE}&workspaceMemberId=${LOCAL_MEMBER}&workspaceType=personal`;
    const resp = await fetch(
      `${baseUrl}/api/design-systems/user%3Askyfarm/preview?${query}`,
    );

    expect(resp.status).toBe(200);
  });

  it('rejects navigation reads whose URL does not assert the personal scope', async () => {
    const seeded = await seedLocalInstall();
    const baseUrl = await startDetailRoute(seeded);

    const query = `workspaceId=${WORKSPACE}&workspaceMemberId=${LOCAL_MEMBER}`;
    const resp = await fetch(
      `${baseUrl}/api/design-systems/user%3Askyfarm/preview?${query}`,
    );

    expect(resp.status).toBe(403);
  });

  it('serves the detail read for the local personal-workspace scope', async () => {
    const seeded = await seedLocalInstall();
    const baseUrl = await startDetailRoute(seeded);

    const resp = await fetch(`${baseUrl}/api/design-systems/user%3Askyfarm`, {
      headers: personalScopeHeaders(),
    });

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { body?: string };
    expect(body.body).toContain('A local personal system.');
  });

  it('backfill never manufactures a binding the catalog gate categorically rejects', async () => {
    // The invariant, pinned at the service layer independent of route
    // plumbing: whatever the backfill writes for a local legacy system must
    // be readable through at least the lanes a local caller actually has —
    // the personal-workspace scope and the headerless lane.
    const seeded = await seedLocalInstall();

    const binding = getWorkspaceResourceByResourceId(seeded.db, 'design_system', 'user:skyfarm');
    expect(binding?.workspaceId).toBe(WORKSPACE);

    const scoped = await seeded.services.listAllDesignSystems({
      workspaceId: WORKSPACE,
      workspaceMemberId: LOCAL_MEMBER,
      workspaceTypeVerified: 'personal',
    } as never);
    const headerless = await seeded.services.listAllDesignSystems({
      workspaceId: null,
      workspaceMemberId: null,
    });
    // The lane run-prompt composition uses: scope derived from the legacy
    // project's persisted binding, whose creator member is equally empty.
    const memberlessProjectScope = await seeded.services.listAllDesignSystems({
      workspaceId: WORKSPACE,
      workspaceMemberId: null,
    });

    expect(scoped.map((system) => system.id)).toContain('user:skyfarm');
    expect(headerless.map((system) => system.id)).toContain('user:skyfarm');
    expect(memberlessProjectScope.map((system) => system.id)).toContain('user:skyfarm');
  });

  it('logs a reason instead of silently hiding a system from the scoped catalog', async () => {
    const seeded = await seedLocalInstall();
    // A system genuinely owned by ANOTHER member must stay hidden — but not
    // silently: diagnosing this class of bug must not require
    // reverse-engineering the filter.
    seedUserSystem(root!, 'foreign', { title: 'Foreign', workspaceId: WORKSPACE });
    ensureWorkspaceResource(seeded.db, 'design_system', WORKSPACE, 'user:foreign', {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-someone-else',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const scoped = await seeded.services.listAllDesignSystems({
      workspaceId: WORKSPACE,
      workspaceMemberId: LOCAL_MEMBER,
      workspaceTypeVerified: 'personal',
    } as never);

    expect(scoped.map((system) => system.id)).not.toContain('user:foreign');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[design-systems]'),
    );
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((message) => message.includes('user:foreign'))).toBe(true);
  });
});
