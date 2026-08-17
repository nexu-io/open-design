import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerPluginRoutes } from '../src/routes/plugins/index.js';

const servers: Array<ReturnType<express.Express['listen']>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })),
  );
});

describe('plugin apply errors', () => {
  it.each([
    ['/api/plugins/sample-plugin/apply', { inputs: {} }],
    ['/api/plugins/sample-plugin/apply-local', {
      source: 'bundled:sample-plugin',
      inputs: {},
    }],
  ])('returns bounded JSON when a required plugin input is missing at %s', async (path, body) => {
    class MissingInputError extends Error {
      fields = ['workspace_name'];
    }
    const app = express();
    app.use(express.json());
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
      plugins: {
        getInstalledPlugin: async () => ({ id: 'sample-plugin' }),
        getWorkspacePlugin: async () => ({ id: 'sample-plugin' }),
        getLocalPluginBySource: async () => ({
          id: 'sample-plugin',
          source: 'bundled:sample-plugin',
        }),
        listInstalledPlugins: () => [],
        applyPlugin: () => {
          throw new MissingInputError('Missing required plugin input');
        },
        MissingInputError,
      },
      helpers: {
        requireLocalDaemonRequest: middleware,
        pluginUpload: { single: () => middleware, array: () => middleware },
        loadPluginRegistryView: async () => ({}),
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
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: 'missing_inputs',
      fields: ['workspace_name'],
    });
  });

  it.each([
    ['/api/plugins/sample-plugin/apply', { inputs: {} }],
    ['/api/plugins/sample-plugin/apply-local', {
      source: 'bundled:sample-plugin',
      inputs: {},
    }],
  ])('logs an unexpected apply error without exposing its details at %s', async (path, body) => {
    const secretError = new Error(
      'ENOENT: open /Volumes/PortableSSD/private-plugin/open-design.json',
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.use(express.json());
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
      plugins: {
        getInstalledPlugin: async () => ({ id: 'sample-plugin' }),
        getWorkspacePlugin: async () => ({ id: 'sample-plugin' }),
        getLocalPluginBySource: async () => ({
          id: 'sample-plugin',
          source: 'bundled:sample-plugin',
        }),
        listInstalledPlugins: () => [],
        applyPlugin: () => {
          throw secretError;
        },
        MissingInputError: class MissingInputError extends Error { fields: string[] = []; },
      },
      helpers: {
        requireLocalDaemonRequest: middleware,
        pluginUpload: { single: () => middleware, array: () => middleware },
        loadPluginRegistryView: async () => ({}),
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
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'plugin_apply_failed' });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('failed to apply plugin sample-plugin'),
      secretError,
    );
  });
});
