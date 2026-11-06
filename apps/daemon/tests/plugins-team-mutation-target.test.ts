import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceTeamPluginBindingResourceId } from '../src/plugins/registry.js';
import { registerPluginRoutes } from '../src/routes/plugins/index.js';

const servers: Array<ReturnType<express.Express['listen']>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })),
  );
});

const workspaceId = 'workspace-team';
const pluginId = 'shared-plugin';
const teamBindingId = workspaceTeamPluginBindingResourceId(workspaceId, pluginId);

function registerMutationFixture(options: { hasSameIdPersonal: boolean }) {
  const app = express();
  app.use(express.json());
  const installOrUpgradePlugin = vi.fn(async (_req, res: express.Response) => {
    res.status(200).json({ ok: true });
  });
  const handleShareProject = vi.fn(async (_req, res: express.Response) => {
    res.status(200).json({ ok: true });
  });
  const middleware: express.RequestHandler = (_req, _res, next) => next();

  registerPluginRoutes(app, {
    db: {
      prepare: () => ({ all: () => [], get: () => null, run: () => undefined }),
      transaction: (run: () => unknown) => () => run(),
    },
    paths: { PROJECTS_DIR: '', PLUGIN_REGISTRY_ROOTS: [], PLUGIN_LOCKFILE_PATH: '' },
    ids: { randomId: () => 'unused' },
    projectStore: {},
    conversations: {},
    verifyWorkspaceRequestAuthority: async () => ({
      ok: true,
      context: {
        workspaceId,
        workspaceMemberId: 'member-owner',
      },
    }),
    workspaceResources: {
      getWorkspaceResource: (
        _db: unknown,
        resourceType: string,
        requestedWorkspaceId: string,
        resourceId: string,
      ) =>
        resourceType === 'plugin'
          && requestedWorkspaceId === workspaceId
          && resourceId === teamBindingId
          ? { visibility: 'team', resourceState: 'active' }
          : null,
      getWorkspaceResourceByResourceId: () => null,
    },
    plugins: {
      getInstalledPlugin: () => options.hasSameIdPersonal
        ? { id: pluginId, source: '/personal/shared-plugin', fsPath: '/personal/shared-plugin' }
        : null,
      // This models the production resolver while the Team materialization is
      // absent: it falls back to the same-id Personal plugin when one exists.
      getWorkspacePlugin: async () => options.hasSameIdPersonal
        ? { id: pluginId, source: '/personal/shared-plugin', fsPath: '/personal/shared-plugin' }
        : null,
      listInstalledPlugins: () => [],
    },
    helpers: {
      requireLocalDaemonRequest: middleware,
      pluginUpload: {
        single: () => middleware,
        array: () => middleware,
      },
      installOrUpgradePlugin,
      handleShareProject,
      sendApiError: (res: express.Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
  } as unknown as Parameters<typeof registerPluginRoutes>[1]);

  return { app, installOrUpgradePlugin, handleShareProject };
}

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function requestHeaders() {
  return {
    'content-type': 'application/json',
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-type': 'team',
    'x-od-workspace-member-id': 'member-owner',
    'x-od-workspace-role': 'owner',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active',
  };
}

describe('Team plugin mutation targets', () => {
  for (const hasSameIdPersonal of [true, false]) {
    const personalLabel = hasSameIdPersonal ? 'with' : 'without';

    it(`rejects Team mirror upgrade ${personalLabel} a same-id Personal plugin`, async () => {
      const fixture = registerMutationFixture({ hasSameIdPersonal });
      const baseUrl = await listen(fixture.app);

      const response = await fetch(`${baseUrl}/api/plugins/${pluginId}/upgrade`, {
        method: 'POST',
        headers: requestHeaders(),
        body: '{}',
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'WORKSPACE_RESOURCE_MANAGE_DENIED',
      });
      expect(fixture.installOrUpgradePlugin).not.toHaveBeenCalled();
    });

    it(`rejects Team mirror share-project ${personalLabel} a same-id Personal plugin`, async () => {
      const fixture = registerMutationFixture({ hasSameIdPersonal });
      const baseUrl = await listen(fixture.app);

      const response = await fetch(`${baseUrl}/api/plugins/${pluginId}/share-project`, {
        method: 'POST',
        headers: requestHeaders(),
        body: JSON.stringify({ action: 'publish-github' }),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'WORKSPACE_RESOURCE_MANAGE_DENIED',
      });
      expect(fixture.handleShareProject).not.toHaveBeenCalled();
    });
  }
});
