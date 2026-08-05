import express from 'express';
import type http from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeDatabase,
  ensureWorkspaceResource,
  getWorkspaceResourceByResourceId,
  openDatabase,
} from '../../src/db.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';
import { registerDesignSystemRoutes } from '../../src/routes/design-systems.js';
import { registerStaticResourceRoutes } from '../../src/routes/static-resource.js';
import { registerBrandRoutes } from '../../src/brand-routes.js';
import type { DesignSystemSummary } from '../../src/design-systems/index.js';
import * as designSystems from '../../src/design-systems/index.js';
import { createWorkspaceOwnedDesignSystem } from '../../src/design-systems/workspace-owned-create.js';

let server: http.Server | null = null;
let tempDir: string | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
  closeDatabase();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function listen(app: express.Express): Promise<string> {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server?.address() as { port: number };
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function workspaceHeaders(): Record<string, string> {
  return {
    'x-od-workspace-id': 'workspace-a',
    'x-od-workspace-member-id': 'member-a',
    'x-od-workspace-type': 'team',
    'x-od-workspace-role': 'owner',
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
  };
}

function scopeError(status: 400 | 403 | 503) {
  const code = status === 400
    ? 'WORKSPACE_CONTEXT_REQUIRED'
    : status === 403
      ? 'WORKSPACE_ACCESS_DENIED'
      : 'WORKSPACE_AUTHORITY_UNAVAILABLE';
  return Object.assign(new Error(code), {
    status,
    code,
    ...(status === 503 ? { retryable: true } : {}),
  });
}

const summary: DesignSystemSummary = {
  id: 'user:workspace-a-system',
  title: 'Workspace A',
  category: 'Custom',
  summary: 'Workspace-scoped test system.',
  swatches: [],
  surface: 'web',
  body: '# Workspace A',
  source: 'user',
  status: 'draft',
  isEditable: true,
};

function commonPaths(root: string) {
  return {
    ARTIFACTS_DIR: path.join(root, 'artifacts'),
    BRANDS_DIR: path.join(root, 'brands'),
    BUNDLED_PETS_DIR: path.join(root, 'pets'),
    CRAFT_DIR: path.join(root, 'craft'),
    DESIGN_SYSTEMS_DIR: path.join(root, 'design-systems'),
    DESIGN_TEMPLATES_DIR: path.join(root, 'design-templates'),
    LIBRARY_DIR: path.join(root, 'library'),
    OD_BIN: path.join(root, 'od'),
    PROJECT_ROOT: root,
    PROJECTS_DIR: path.join(root, 'projects'),
    PROMPT_TEMPLATES_DIR: path.join(root, 'prompt-templates'),
    RUNTIME_DATA_DIR: path.join(root, 'data'),
    RUNTIME_DATA_DIR_CANONICAL: path.join(root, 'data'),
    SKILLS_DIR: path.join(root, 'skills'),
    USER_DESIGN_SYSTEMS_DIR: path.join(root, 'user-design-systems'),
    USER_DESIGN_TEMPLATES_DIR: path.join(root, 'user-design-templates'),
    USER_SKILLS_DIR: path.join(root, 'user-skills'),
  };
}

async function startListRoute(input: {
  resolveWorkspaceScope: (req?: express.Request) => Promise<string | null>;
  listAllDesignSystems: any;
  exactMemberCatalog?: boolean;
}) {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-ds-explicit-list-'));
  const db = input.exactMemberCatalog
    ? openDatabase(tempDir, { dataDir: tempDir })
    : ({} as never);
  if (input.exactMemberCatalog) {
    ensureWorkspaceResource(db, 'design_system', 'workspace-a', summary.id, {
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    });
    ensureWorkspaceResource(db, 'design_system', 'workspace-a', 'team-mirror:workspace-a:user%3Ateam-system', {
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    });
    ensureWorkspaceResource(db, 'design_system', 'workspace-b', 'team-mirror:workspace-b:user%3Ateam-system', {
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-b',
    });
  }
  const app = express();
  app.use(express.json());
  registerStaticResourceRoutes(app, {
    db,
    ...(input.exactMemberCatalog
      ? {
          verifyWorkspaceRequestAuthority: async (req: any) => ({
            ok: true as const,
            context: workspaceContextFromDirectoryItem({
              workspaceId: req.get('x-od-workspace-id'),
              workspaceName: 'Workspace A',
              workspaceType: 'team',
              workspaceMemberId: req.get('x-od-workspace-member-id'),
              role: 'owner',
              memberStatus: 'active',
              lifecycleState: 'active',
            }),
          }),
        }
      : {}),
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
    paths: commonPaths(tempDir),
    resources: {
      listAllDesignSystems: input.listAllDesignSystems,
      resolveWorkspaceScope: input.resolveWorkspaceScope,
      listAllSkills: async () => [],
      listAllDesignTemplates: async () => [],
      listAllSkillLikeEntries: async () => [],
      mimeFor: () => 'application/octet-stream',
    },
  });
  return listen(app);
}

function registerCreateRoute(
  app: express.Express,
  createUserDesignSystem: (
    root: string,
    input: unknown,
    req?: express.Request,
  ) => Promise<DesignSystemSummary>,
) {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-ds-explicit-create-'));
  const db = openDatabase(tempDir, { dataDir: tempDir });
  registerDesignSystemRoutes(app, {
    db,
    paths: commonPaths(tempDir),
    projectFiles: {} as never,
    projectStore: {} as never,
    verifyWorkspaceRequestAuthority: async () => {
      throw new Error('unbound fixture must not verify Workspace authority');
    },
    workspaceResources: {
      getWorkspaceResource: () => undefined,
      getWorkspaceResourceByResourceId: () => undefined,
    },
    designSystems: {
      buildUserDesignSystemArchive: async () => null,
      canMutateUserDesignSystem: async () => true,
      createUserDesignSystem,
      deleteUserDesignSystem: async () => false,
      ensureUserDesignSystemWorkspaceProject: async () => null,
      listAllDesignSystems: async () => [],
      listUserDesignSystemFiles: async () => null,
      listUserDesignSystemRevisions: async () => null,
      prepareDesignTokenContractRebuild: async () => ({ decision: { available: false } }) as never,
      readAvailableDesignSystem: async () => null,
      readAvailableDesignSystemPackageInfo: async () => null,
      readAvailableDesignSystemStaticFile: async () => null,
      readDesignSystemWorkspaceTextFile: async () => null,
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
  });
}

describe('design-system explicit Workspace request scope', () => {
  it('lists a scoped brand draft immediately only for its exact Workspace member', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-brand-draft-catalog-'));
    const routePaths = commonPaths(tempDir);
    mkdirSync(routePaths.BRANDS_DIR, { recursive: true });
    mkdirSync(routePaths.PROJECTS_DIR, { recursive: true });
    mkdirSync(routePaths.SKILLS_DIR, { recursive: true });
    mkdirSync(routePaths.USER_DESIGN_SYSTEMS_DIR, { recursive: true });
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const requestContext = (request: unknown) => {
      const req = request as express.Request;
      return workspaceContextFromDirectoryItem({
      workspaceId: req.get('x-od-workspace-id') ?? '',
      workspaceName: 'Workspace fixture',
      workspaceType: 'team',
      workspaceMemberId: req.get('x-od-workspace-member-id') ?? '',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
      });
    };
    const requestResourceContext = (request: unknown) => {
      const context = requestContext(request);
      return {
        workspaceId: context.workspaceId,
        workspaceType: context.workspaceType,
        workspaceTypeAsserted: context.workspaceType,
        appUserId: context.workspaceMemberId,
        workspaceMemberId: context.workspaceMemberId,
        role: context.role,
        memberStatus: context.memberStatus,
        lifecycleState: context.lifecycleState,
        canShareProjects: context.permissions.canShareProjects,
        canWriteSyncedFiles: context.permissions.canWriteSyncedFiles,
      };
    };
    const app = express();
    app.use(express.json());
    registerStaticResourceRoutes(app, {
      db,
      verifyWorkspaceRequestAuthority: async (req: unknown) => ({
        ok: true as const,
        context: requestContext(req),
      }),
      http: {
        createSseResponse: () => undefined,
        getPublicBaseUrl: () => '',
        isLocalSameOrigin: () => true,
        requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) => next(),
        resolvedPortRef: { current: 0 },
        sendApiError: (res: express.Response, status: number, code: string, message: string) =>
          res.status(status).json({ error: code, message }),
        sendLiveArtifactRouteError: () => undefined,
        sendMulterError: () => undefined,
      },
      paths: routePaths,
      resources: {
        listAllDesignSystems: async (options?: { workspaceId?: string | null }) =>
          designSystems.listDesignSystems(routePaths.USER_DESIGN_SYSTEMS_DIR, {
            idPrefix: 'user:',
            source: 'user',
            isEditable: true,
            defaultStatus: 'draft',
            ...(options?.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
          }),
        resolveWorkspaceScope: async (req?: express.Request) =>
          req?.get('x-od-workspace-id') ?? null,
        listAllSkills: async () => [],
        listAllDesignTemplates: async () => [],
        listAllSkillLikeEntries: async () => [],
        mimeFor: () => 'application/octet-stream',
      },
    });
    registerBrandRoutes(app, {
      brandsRoot: routePaths.BRANDS_DIR,
      userDesignSystemsRoot: routePaths.USER_DESIGN_SYSTEMS_DIR,
      projectsRoot: routePaths.PROJECTS_DIR,
      skillsRoot: routePaths.SKILLS_DIR,
      dataDir: routePaths.RUNTIME_DATA_DIR,
      db,
      resolveCreatedProjectHome: async (req) => requestResourceContext(req),
      resolveDesignSystemWorkspaceId: async (req) => requestContext(req).workspaceId,
      createWorkspaceOwnedDesignSystem: (root, input, context) =>
        createWorkspaceOwnedDesignSystem(root, input, context, {
          ensureWorkspaceResource: (resourceType, workspaceId, resourceId, envelope) =>
            ensureWorkspaceResource(db, resourceType, workspaceId, resourceId, envelope),
        }),
      prefetch: async () => null,
      logoFallback: async () => ({ changed: false }),
      imageryFallback: async () => ({ changed: false }),
    });
    const baseUrl = await listen(app);
    const created = await fetch(`${baseUrl}/api/brands`, {
      method: 'POST',
      headers: { ...workspaceHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://catalog.example.com' }),
    });
    expect(created.status).toBe(200);
    const createdBody = await created.json() as { designSystemId: string };

    const listIds = async (headers: Record<string, string>) => {
      const response = await fetch(`${baseUrl}/api/design-systems`, { headers });
      expect(response.status).toBe(200);
      const body = await response.json() as { designSystems: Array<{ id: string }> };
      return body.designSystems.map((system) => system.id);
    };
    await expect(listIds(workspaceHeaders())).resolves.toContain(createdBody.designSystemId);
    await expect(listIds({
      ...workspaceHeaders(),
      'x-od-workspace-member-id': 'member-b',
    })).resolves.not.toContain(createdBody.designSystemId);
    await expect(listIds({
      ...workspaceHeaders(),
      'x-od-workspace-id': 'workspace-b',
      'x-od-workspace-member-id': 'member-b',
    })).resolves.not.toContain(createdBody.designSystemId);
  });

  it('rejects an install id already bound to another member before writing any directory entry', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-ds-install-conflict-'));
    const routePaths = commonPaths(tempDir);
    const source = path.join(tempDir, 'source', 'owned-system');
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, 'DESIGN.md'), '# Original\n', 'utf8');
    const db = openDatabase(tempDir, { dataDir: tempDir });
    ensureWorkspaceResource(db, 'design_system', 'workspace-a', 'team-mirror:workspace-a:user%3Aowned-system', {
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    });
    const app = express();
    app.use(express.json());
    registerStaticResourceRoutes(app, {
      db,
      verifyWorkspaceRequestAuthority: async (req: any) => ({
        ok: true as const,
        context: workspaceContextFromDirectoryItem({
          workspaceId: req.get('x-od-workspace-id'),
          workspaceName: 'Workspace A',
          workspaceType: 'team',
          workspaceMemberId: req.get('x-od-workspace-member-id'),
          role: 'owner',
          memberStatus: 'active',
          lifecycleState: 'active',
        }),
      }),
      http: {
        createSseResponse: () => undefined,
        getPublicBaseUrl: () => '',
        isLocalSameOrigin: () => true,
        requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) => next(),
        resolvedPortRef: { current: 0 },
        sendApiError: (res: express.Response, status: number, code: string, message: string) =>
          res.status(status).json({ error: code, message }),
        sendLiveArtifactRouteError: () => undefined,
        sendMulterError: () => undefined,
      },
      paths: routePaths,
      resources: {
        listAllDesignSystems: async () => [],
        resolveWorkspaceScope: async () => 'workspace-a',
        listAllSkills: async () => [],
        listAllDesignTemplates: async () => [],
        listAllSkillLikeEntries: async () => [],
        mimeFor: () => 'application/octet-stream',
      },
    });
    const baseUrl = await listen(app);
    const response = await fetch(`${baseUrl}/api/design-systems/install`, {
      method: 'POST',
      headers: {
        ...workspaceHeaders(),
        'x-od-workspace-member-id': 'member-b',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ source: 'local', path: source }),
    });

    expect(response.status).toBe(409);
    expect(readFileSync(path.join(source, 'DESIGN.md'), 'utf8')).toBe('# Original\n');
    expect(existsSync(path.join(routePaths.USER_DESIGN_SYSTEMS_DIR, 'owned-system'))).toBe(false);
    expect(getWorkspaceResourceByResourceId(
      db,
      'design_system',
      'team-mirror:workspace-a:user%3Aowned-system',
    )).toMatchObject({
      workspaceId: 'workspace-a',
      visibility: 'team',
      createdByWorkspaceMemberId: 'member-a',
    });
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:owned-system'))
      .toBeUndefined();
  });

  it('hides another member Personal system but keeps the exact Team catalog visible', async () => {
    const teamSummary = { ...summary, id: 'user:team-system', title: 'Team' };
    const baseUrl = await startListRoute({
      resolveWorkspaceScope: async () => 'workspace-a',
      listAllDesignSystems: async () => [summary, teamSummary],
      exactMemberCatalog: true,
    });
    const response = await fetch(`${baseUrl}/api/design-systems`, {
      headers: {
        ...workspaceHeaders(),
        'x-od-workspace-member-id': 'member-b',
      },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { designSystems: Array<{ id: string }> };
    expect(body.designSystems.map((item) => item.id))
      .toEqual(['user:team-system']);

    const workspaceB = await fetch(`${baseUrl}/api/design-systems`, {
      headers: {
        ...workspaceHeaders(),
        'x-od-workspace-id': 'workspace-b',
        'x-od-workspace-member-id': 'member-b',
      },
    });
    expect(workspaceB.status).toBe(200);
    const bodyB = await workspaceB.json() as { designSystems: Array<{ id: string }> };
    expect(bodyB.designSystems.map((item) => item.id)).toEqual(['user:team-system']);
  });

  it('allocates a new Personal import id when a Team mirror owns the raw slug', async () => {
    const baseUrl = await startListRoute({
      resolveWorkspaceScope: async () => 'workspace-a',
      exactMemberCatalog: true,
      listAllDesignSystems: async (options?: { workspaceId?: string | null }) =>
        designSystems.listDesignSystems(path.join(tempDir!, 'user-design-systems'), {
          idPrefix: 'user:',
          source: 'user',
          isEditable: true,
          defaultStatus: 'draft',
          ...(options?.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
        }),
    });
    const source = path.join(tempDir!, 'import-source');
    mkdirSync(source, { recursive: true });
    writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({ name: 'team-system' }),
      'utf8',
    );
    writeFileSync(path.join(source, 'README.md'), '# Team system\n', 'utf8');

    const response = await fetch(`${baseUrl}/api/design-systems/import/local`, {
      method: 'POST',
      headers: { ...workspaceHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ path: source }),
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { designSystem: { id: string } };
    expect(body.designSystem.id).toBe('user:team-system-2');
    expect(existsSync(path.join(tempDir!, 'user-design-systems', 'team-system'))).toBe(false);
    const db = openDatabase(tempDir!, { dataDir: tempDir! });
    expect(getWorkspaceResourceByResourceId(
      db,
      'design_system',
      'team-mirror:workspace-a:user%3Ateam-system',
    )).toMatchObject({ workspaceId: 'workspace-a', visibility: 'team' });
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:team-system'))
      .toBeUndefined();
    expect(getWorkspaceResourceByResourceId(db, 'design_system', 'user:team-system-2'))
      .toMatchObject({
        workspaceId: 'workspace-a',
        visibility: 'personal',
        createdByWorkspaceMemberId: 'member-a',
      });
  });

  it('passes the list request into scope resolution and lists only that Workspace', async () => {
    const listAllDesignSystems = vi.fn(async (options?: {
      workspaceId?: string | null;
      workspaceMemberId?: string | null;
    }) =>
      options?.workspaceId === 'workspace-a' ? [summary] : []);
    const baseUrl = await startListRoute({
      resolveWorkspaceScope: async (req) =>
        req?.get('x-od-workspace-id') === 'workspace-a' ? 'workspace-a' : null,
      listAllDesignSystems,
    });

    const response = await fetch(`${baseUrl}/api/design-systems`, {
      headers: workspaceHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      designSystems: [expect.objectContaining({ id: summary.id })],
    });
    expect(listAllDesignSystems).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      workspaceMemberId: null,
    });
  });

  it.each([400, 403, 503] as const)(
    'preserves list scope resolution status %s and performs no catalog read',
    async (status) => {
      const listAllDesignSystems = vi.fn(async () => [summary]);
      const baseUrl = await startListRoute({
        resolveWorkspaceScope: async () => {
          throw scopeError(status);
        },
        listAllDesignSystems,
      });

      const response = await fetch(`${baseUrl}/api/design-systems`, {
        headers: workspaceHeaders(),
      });

      expect(response.status).toBe(status);
      expect(listAllDesignSystems).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({
        error: scopeError(status).code,
        ...(status === 503 ? { retryable: true } : {}),
      });
    },
  );

  it('passes the create request to the scoped creator before any write', async () => {
    const create = vi.fn(async () => summary);
    const scopedCreate = async (
      _root: string,
      _input: unknown,
      req?: express.Request,
    ): Promise<DesignSystemSummary> => {
      if (req?.get('x-od-workspace-id') !== 'workspace-a') throw scopeError(400);
      return create();
    };
    const app = express();
    app.use(express.json());
    registerCreateRoute(app, scopedCreate);
    const baseUrl = await listen(app);

    const response = await fetch(`${baseUrl}/api/design-systems`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...workspaceHeaders(),
      },
      body: JSON.stringify({ title: 'Workspace A' }),
    });

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
  });

  it.each([400, 403, 503] as const)(
    'preserves create scope resolution status %s and performs no write',
    async (status) => {
      const create = vi.fn(async () => summary);
      const app = express();
      app.use(express.json());
      registerCreateRoute(app, async () => {
        throw scopeError(status);
      });
      const baseUrl = await listen(app);

      const response = await fetch(`${baseUrl}/api/design-systems`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...workspaceHeaders(),
        },
        body: JSON.stringify({ title: 'Workspace A' }),
      });

      expect(response.status).toBe(status);
      expect(create).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({
        error: scopeError(status).code,
        ...(status === 503 ? { retryable: true } : {}),
      });
    },
  );
});
