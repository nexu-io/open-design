import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerPluginRoutes } from '../src/routes/plugins/index.js';

const servers: Array<ReturnType<express.Express['listen']>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })),
  );
});

describe('Team plugin apply retraction gate', () => {
  it('does not apply a Team plugin retired while registry loading is pending', async () => {
    const app = express();
    app.use(express.json());
    let bindingLive = true;
    let finishRegistryLoad!: (value: Record<string, never>) => void;
    const registryGate = new Promise<Record<string, never>>((resolve) => {
      finishRegistryLoad = resolve;
    });
    let registryLoadStarted!: () => void;
    const registryStarted = new Promise<void>((resolve) => {
      registryLoadStarted = resolve;
    });
    const applyPlugin = vi.fn(() => ({
      result: { capabilitiesGranted: [], appliedPlugin: { capabilitiesGranted: [] } },
      warnings: [],
    }));
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
        context: { workspaceId: 'ws-team' },
      }),
      workspaceResources: {
        getWorkspaceResource: () => null,
        getWorkspaceResourceByResourceId: () => null,
        workspaceTeamPluginBindingAllowsRead: () => bindingLive,
      },
      plugins: {
        getInstalledPlugin: () => null,
        getWorkspacePlugin: async () => ({
          id: 'team-plugin',
          source: 'team:plugin:ws-team:team-plugin',
        }),
        listInstalledPlugins: () => [],
        applyPlugin,
        MissingInputError: class MissingInputError extends Error {
          fields: string[] = [];
        },
      },
      helpers: {
        requireLocalDaemonRequest: middleware,
        pluginUpload: {
          single: () => middleware,
          array: () => middleware,
        },
        loadPluginRegistryView: async () => {
          registryLoadStarted();
          return registryGate;
        },
        buildConnectorProbe: () => ({}),
        connectorService: {},
        sendApiError: (res: express.Response, status: number, code: string, message: string) =>
          res.status(status).json({ error: { code, message } }),
      },
    } as unknown as Parameters<typeof registerPluginRoutes>[1]);

    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const responsePromise = fetch(`http://127.0.0.1:${port}/api/plugins/team-plugin/apply`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-workspace-id': 'ws-team',
        'x-od-workspace-type': 'team',
        'x-od-workspace-member-id': 'member-team',
        'x-od-workspace-role': 'member',
        'x-od-workspace-lifecycle-state': 'active',
        'x-od-workspace-member-status': 'active',
      },
      body: '{}',
    });
    await registryStarted;
    bindingLive = false;
    finishRegistryLoad({});

    const response = await responsePromise;
    expect(response.status).toBe(404);
    expect(applyPlugin).not.toHaveBeenCalled();
  });
});
