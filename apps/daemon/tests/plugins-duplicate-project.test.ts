import express from 'express';
import type http from 'node:http';
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  InstalledPluginRecord,
  Project,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { sendApiError } from '../src/http/api-errors.js';
import {
  closeDatabase,
  deleteProject,
  getConversation,
  getProject,
  insertConversation,
  insertProject,
  openDatabase,
} from '../src/db.js';
import { duplicatePluginExampleIntoProject } from '../src/plugins/duplicate-project.js';
import { removeProjectDir } from '../src/projects.js';
import { registerPluginRoutes } from '../src/routes/plugins/index.js';

const tempRoots: string[] = [];

afterEach(async () => {
  closeDatabase();
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempRoot(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

async function makePreviewPlugin(root: string, id = 'duplicate-fixture'): Promise<InstalledPluginRecord> {
  const pluginRoot = path.join(root, id);
  await mkdir(path.join(pluginRoot, 'preview'), { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'preview', 'index.html'),
    '<!doctype html><html><body><h1>Duplicable</h1></body></html>',
    'utf8',
  );
  return {
    id,
    title: 'Duplicate Fixture',
    fsPath: pluginRoot,
    manifest: {
      name: id,
      title: 'Duplicate Fixture',
      od: { preview: { entry: 'preview/index.html' } },
    },
  } as InstalledPluginRecord;
}

async function expectMissing(pathname: string): Promise<void> {
  await expect(access(pathname)).rejects.toMatchObject({ code: 'ENOENT' });
}

async function verifyWorkspaceRequestAuthority(req: express.Request) {
  const workspaceId = req.get('x-od-workspace-id')?.trim() ?? '';
  const workspaceMemberId =
    req.get('x-od-workspace-member-id')?.trim() ?? '';
  return {
    ok: true as const,
    context: {
      workspaceId,
      workspaceName: workspaceId,
      workspaceType: 'team',
      workspaceMemberId,
      role: 'member',
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: null,
      providerMode: 'platform_credits',
      seatSummary: {
        seatLimit: 5,
        usedSeats: 1,
        availableSeats: 4,
        isSeatFull: false,
      },
      permissions: {
        canManageMembers: false,
        canManageBilling: false,
        canInviteMembers: false,
        canManageAutoRecharge: false,
        canShareProjects: true,
        canWriteSyncedFiles: true,
        canViewWorkspaceSettings: true,
        canManageSharedResources: false,
      },
    } as WorkspaceCollabContext,
  };
}

describe('plugin project duplication', () => {
  it.skipIf(process.platform === 'win32')(
    'rejects duplicates that would skip a required symlinked file',
    async () => {
      const root = await makeTempRoot('od-plugin-duplicate-helper-');
      const projectsRoot = path.join(root, 'projects');
      const plugin = await makePreviewPlugin(root);
      await writeFile(path.join(plugin.fsPath, 'preview', 'target.txt'), 'asset', 'utf8');
      await symlink('target.txt', path.join(plugin.fsPath, 'preview', 'linked.txt'));

      await expect(
        duplicatePluginExampleIntoProject({
          plugin,
          projectsRoot,
          projectId: 'symlink-project',
          metadata: { kind: 'prototype' },
          assembleExample: (templateHtml) => templateHtml,
        }),
      ).rejects.toMatchObject({
        status: 422,
        code: 'DUPLICATE_COPY_INCOMPLETE',
      });
    },
  );

  it('returns a canonical retryable 503 when workspace authority is unavailable', async () => {
    const root = await makeTempRoot('od-plugin-duplicate-authority-');
    const projectsRoot = path.join(root, 'projects');
    const plugin = await makePreviewPlugin(root, 'authority-plugin-fixture');
    const randomId = vi.fn();
    const app = express();
    app.use(express.json());
    registerPluginRoutes(app, {
      db: {
        prepare: () => ({
          all: () => [],
          get: () => null,
          run: () => undefined,
        }),
        transaction: (run: () => unknown) => () => run(),
      },
      paths: {
        PROJECTS_DIR: projectsRoot,
        PLUGIN_REGISTRY_ROOTS: [],
        PLUGIN_LOCKFILE_PATH: path.join(root, 'plugins.lock'),
      },
      ids: { randomId },
      projectStore: {
        insertProject: vi.fn(),
        getProject: vi.fn(),
        ensureWorkspaceProject: vi.fn(),
        dbDeleteProject: vi.fn(),
        removeProjectDir: vi.fn(),
      },
      conversations: { insertConversation: vi.fn() },
      plugins: {
        getInstalledPlugin: vi.fn(() => plugin),
        listInstalledPlugins: vi.fn(() => []),
      },
      verifyWorkspaceRequestAuthority,
      fetchProjectCreationWorkspaceDirectory: async () => ({ ok: false, items: [] }),
      helpers: {
        requireLocalDaemonRequest: ((_req, _res, next) => next()) as express.RequestHandler,
        assembleExample: (templateHtml: string) => templateHtml,
        applyBakedPreviews: (records: unknown[]) => records,
        sendApiError,
      },
    } as unknown as Parameters<typeof registerPluginRoutes>[1]);
    const server = await listen(app);
    try {
      const resp = await fetch(
        `${server.url}/api/plugins/${encodeURIComponent(plugin.id)}/duplicate-project`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-od-workspace-id': 'workspace-authority',
            'x-od-workspace-type': 'team',
            'x-od-workspace-member-id': 'member-authority',
            'x-od-workspace-role': 'member',
            'x-od-workspace-lifecycle-state': 'active',
            'x-od-workspace-member-status': 'active',
            'x-od-workspace-can-share-projects': 'true',
            'x-od-workspace-can-write-synced-files': 'true',
          },
          body: JSON.stringify({}),
        },
      );

      expect(resp.status).toBe(503);
      await expect(resp.json()).resolves.toEqual({
        error: {
          code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
          message: 'workspace membership authority is temporarily unavailable',
          retryable: true,
        },
      });
      expect(randomId).not.toHaveBeenCalled();
      await expectMissing(projectsRoot);
    } finally {
      await close(server.server);
    }
  });

  it('binds Plugin Remix to the exact request workspace inside the DB transaction', async () => {
    const root = await makeTempRoot('od-plugin-duplicate-workspace-');
    const projectsRoot = path.join(root, 'projects');
    const plugin = await makePreviewPlugin(root, 'workspace-plugin-fixture');
    const projectId = 'workspace-plugin-project';
    const project = {
      id: projectId,
      name: 'Workspace Plugin Fixture',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Project;
    const transactionSteps: string[] = [];
    const db = {
      prepare: () => ({
        all: () => [],
        get: () => null,
        run: () => undefined,
      }),
      transaction: (run: () => unknown) => () => {
        transactionSteps.push('transaction:start');
        const result = run();
        transactionSteps.push('transaction:commit');
        return result;
      },
    };
    const ensureWorkspaceProject = vi.fn((_db: unknown, input: unknown) => {
      transactionSteps.push('workspace:bind');
      return input;
    });
    const app = express();
    app.use(express.json());
    registerPluginRoutes(app, {
      db,
      paths: {
        PROJECTS_DIR: projectsRoot,
        PLUGIN_REGISTRY_ROOTS: [],
        PLUGIN_LOCKFILE_PATH: path.join(root, 'plugins.lock'),
      },
      ids: {
        randomId: vi.fn()
          .mockReturnValueOnce(projectId)
          .mockReturnValueOnce('workspace-plugin-conversation'),
      },
      projectStore: {
        insertProject: vi.fn(() => {
          transactionSteps.push('project:insert');
          return project;
        }),
        getProject: vi.fn(() => project),
        ensureWorkspaceProject,
        dbDeleteProject: vi.fn(),
        removeProjectDir: async (rootDir: string, id: string) => {
          await rm(path.join(rootDir, id), { recursive: true, force: true });
        },
      },
      conversations: {
        insertConversation: vi.fn(() => {
          transactionSteps.push('conversation:insert');
        }),
      },
      plugins: {
        getInstalledPlugin: vi.fn(() => plugin),
        listInstalledPlugins: vi.fn(() => []),
      },
      verifyWorkspaceRequestAuthority,
      helpers: {
        requireLocalDaemonRequest: ((_req, _res, next) => next()) as express.RequestHandler,
        assembleExample: (templateHtml: string) => templateHtml,
        applyBakedPreviews: (records: unknown[]) => records,
        sendApiError,
      },
    } as unknown as Parameters<typeof registerPluginRoutes>[1]);
    const server = await listen(app);
    try {
      const resp = await fetch(
        `${server.url}/api/plugins/${encodeURIComponent(plugin.id)}/duplicate-project`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-od-workspace-id': 'workspace-plugin-a',
            'x-od-workspace-type': 'team',
            'x-od-workspace-member-id': 'member-plugin-a',
            'x-od-workspace-role': 'member',
            'x-od-workspace-lifecycle-state': 'active',
            'x-od-workspace-member-status': 'active',
            'x-od-workspace-can-share-projects': 'true',
            'x-od-workspace-can-write-synced-files': 'true',
          },
          body: JSON.stringify({ name: 'Workspace Plugin Fixture' }),
        },
      );
      expect(resp.status).toBe(201);
      expect(ensureWorkspaceProject).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          projectId,
          workspaceId: 'workspace-plugin-a',
          createdByWorkspaceMemberId: 'member-plugin-a',
          updatedByWorkspaceMemberId: 'member-plugin-a',
        }),
      );
      expect(transactionSteps).toEqual([
        'transaction:start',
        'project:insert',
        'conversation:insert',
        'workspace:bind',
        'transaction:commit',
      ]);
    } finally {
      await close(server.server);
    }
  });

  it.each([
    { label: 'when DB compensation succeeds', dbDeleteThrows: false },
    { label: 'even when DB compensation throws', dbDeleteThrows: true },
  ])('rolls back project rows and files when workspace binding fails $label', async ({
    dbDeleteThrows,
  }) => {
    const root = await makeTempRoot('od-plugin-duplicate-route-');
    const projectsRoot = path.join(root, 'projects');
    const plugin = await makePreviewPlugin(root, 'route-duplicate-fixture');
    const projectId = 'route-duplicate-project';
    const project = {
      id: projectId,
      name: 'Route Duplicate Fixture',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
      lastOpenedAt: null,
      order: 0,
      conversationCount: 0,
      hasActiveRun: false,
    } as unknown as Project;
    const db = {
      prepare: () => ({
        all: () => [],
        get: () => null,
        run: () => undefined,
      }),
      transaction: (run: () => unknown) => () => run(),
    };
    const dbDeleteProject = vi.fn(() => {
      if (dbDeleteThrows) throw new Error('DB compensation failed');
    });
    const app = express();
    app.use(express.json());
    registerPluginRoutes(app, {
      db,
      paths: {
        PROJECTS_DIR: projectsRoot,
        PLUGIN_REGISTRY_ROOTS: [],
        PLUGIN_LOCKFILE_PATH: path.join(root, 'plugins.lock'),
      },
      ids: {
        randomId: vi.fn()
          .mockReturnValueOnce(projectId)
          .mockReturnValueOnce('route-duplicate-conversation'),
      },
      projectStore: {
        insertProject: vi.fn(() => project),
        getProject: vi.fn(() => project),
        ensureWorkspaceProject: vi.fn(() => {
          throw new Error('workspace binding failed');
        }),
        dbDeleteProject,
        removeProjectDir: async (rootDir: string, id: string) => {
          await rm(path.join(rootDir, id), { recursive: true, force: true });
        },
      },
      conversations: {
        insertConversation: vi.fn(),
      },
      plugins: {
        getInstalledPlugin: vi.fn(() => plugin),
        listInstalledPlugins: vi.fn(() => []),
      },
      verifyWorkspaceRequestAuthority,
      helpers: {
        requireLocalDaemonRequest: ((_req, _res, next) => next()) as express.RequestHandler,
        assembleExample: (templateHtml: string) => templateHtml,
        applyBakedPreviews: (records: unknown[]) => records,
        sendApiError,
      },
    } as unknown as Parameters<typeof registerPluginRoutes>[1]);
    const server = await listen(app);
    try {
      const resp = await fetch(
        `${server.url}/api/plugins/${encodeURIComponent(plugin.id)}/duplicate-project`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-od-workspace-id': 'workspace-bind-failure',
            'x-od-workspace-type': 'team',
            'x-od-workspace-member-id': 'member-bind-failure',
            'x-od-workspace-role': 'member',
            'x-od-workspace-lifecycle-state': 'active',
            'x-od-workspace-member-status': 'active',
            'x-od-workspace-can-share-projects': 'true',
            'x-od-workspace-can-write-synced-files': 'true',
          },
          body: JSON.stringify({ name: 'Route Duplicate Fixture' }),
        },
      );
      expect(resp.status).toBe(500);
      if (!dbDeleteThrows) {
        const body = (await resp.json()) as { error?: { code?: string; message?: string } };
        expect(body.error?.code).toBe('plugin-duplicate-failed');
        expect(body.error?.message).toContain('workspace binding failed');
      }
      expect(dbDeleteProject).toHaveBeenCalledWith(db, projectId);
      await expectMissing(path.join(projectsRoot, projectId));
    } finally {
      await close(server.server);
    }
  });

  it('rolls back real SQLite rows and removes managed files when workspace binding fails', async () => {
    const root = await makeTempRoot('od-plugin-duplicate-sqlite-');
    const projectsRoot = path.join(root, 'projects');
    const plugin = await makePreviewPlugin(root, 'sqlite-plugin-fixture');
    const projectId = 'sqlite-plugin-project';
    const conversationId = 'sqlite-plugin-conversation';
    const db = openDatabase(root, { dataDir: path.join(root, 'data') });
    const app = express();
    app.use(express.json());
    registerPluginRoutes(app, {
      db,
      paths: {
        PROJECTS_DIR: projectsRoot,
        PLUGIN_REGISTRY_ROOTS: [],
        PLUGIN_LOCKFILE_PATH: path.join(root, 'plugins.lock'),
      },
      ids: {
        randomId: vi.fn()
          .mockReturnValueOnce(projectId)
          .mockReturnValueOnce(conversationId),
      },
      projectStore: {
        insertProject,
        getProject,
        ensureWorkspaceProject: vi.fn(() => {
          throw new Error('real SQLite workspace binding failed');
        }),
        dbDeleteProject: deleteProject,
        removeProjectDir,
      },
      conversations: { insertConversation },
      plugins: {
        getInstalledPlugin: vi.fn(() => plugin),
        listInstalledPlugins: vi.fn(() => []),
      },
      verifyWorkspaceRequestAuthority,
      helpers: {
        requireLocalDaemonRequest: ((_req, _res, next) => next()) as express.RequestHandler,
        assembleExample: (templateHtml: string) => templateHtml,
        applyBakedPreviews: (records: unknown[]) => records,
        sendApiError,
      },
    } as unknown as Parameters<typeof registerPluginRoutes>[1]);
    const server = await listen(app);
    try {
      const resp = await fetch(
        `${server.url}/api/plugins/${encodeURIComponent(plugin.id)}/duplicate-project`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-od-workspace-id': 'workspace-sqlite',
            'x-od-workspace-type': 'team',
            'x-od-workspace-member-id': 'member-sqlite',
            'x-od-workspace-role': 'member',
            'x-od-workspace-lifecycle-state': 'active',
            'x-od-workspace-member-status': 'active',
            'x-od-workspace-can-share-projects': 'true',
            'x-od-workspace-can-write-synced-files': 'true',
          },
          body: JSON.stringify({ name: 'SQLite Plugin Fixture' }),
        },
      );

      expect(resp.status).toBe(500);
      expect(getProject(db, projectId)).toBeNull();
      expect(getConversation(db, conversationId)).toBeNull();
      await expectMissing(path.join(projectsRoot, projectId));
    } finally {
      await close(server.server);
    }
  });
});

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
