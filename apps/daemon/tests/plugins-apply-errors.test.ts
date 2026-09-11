import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InternalBundledStrategyApplyError } from '../src/plugins/apply.js';
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
    ['/api/plugins/sample-plugin/apply', { inputs: {} }, ['workspace_name'], true],
    ['/api/plugins/sample-plugin/apply-local', {
      source: 'bundled:sample-plugin',
      inputs: {},
    }, ['workspace_name'], true],
    ['/api/plugins/sample-plugin/apply', { inputs: {} }, ['../../private-key'], true],
    ['/api/plugins/sample-plugin/apply-local', {
      source: 'bundled:sample-plugin',
      inputs: {},
    }, Array.from({ length: 11 }, (_, index) => `input_${index}`), true],
    ['/api/plugins/sample-plugin/apply', { inputs: {} }, ['workspace_name'], false],
  ] as const)('returns bounded JSON when required plugin inputs are missing at %s', async (
    path,
    body,
    fields,
    versioned,
  ) => {
    class MissingInputError extends Error {
      fields = [...fields];
    }
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
      headers: {
        'content-type': 'application/json',
        ...(versioned ? { 'x-od-plugin-apply-error-contract': '2' } : {}),
      },
      body: JSON.stringify(body),
    });

    const safeFields = fields.length <= 10 && fields.every(
      (field) => /^[A-Za-z0-9._-]{1,64}$/u.test(field),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(!versioned
      ? { error: 'missing_inputs', fields }
      : safeFields
      ? {
          error: {
            code: 'PLUGIN_INPUTS_MISSING',
            message: 'Missing required plugin inputs.',
            details: { kind: 'missing_inputs', fields },
          },
        }
      : {
          error: {
            code: 'PLUGIN_CONFIGURATION_INVALID',
            message: 'Plugin configuration is invalid. Reinstall or update the plugin and try again.',
            details: { reason: 'manifest_invalid' },
          },
        });
    expect(consoleError).toHaveBeenCalledTimes(safeFields ? 0 : 1);
  });

  it.each([
    ['resource', '/api/plugins/sample-plugin/apply', { inputs: {} }, true],
    ['resource', '/api/plugins/sample-plugin/apply-local', {
      source: 'bundled:sample-plugin',
      inputs: {},
    }, true],
    ['configuration', '/api/plugins/sample-plugin/apply', { inputs: {} }, true],
    ['configuration', '/api/plugins/sample-plugin/apply-local', {
      source: 'bundled:sample-plugin',
      inputs: {},
    }, true],
    ['unknown', '/api/plugins/sample-plugin/apply', { inputs: {} }, true],
    ['unknown', '/api/plugins/sample-plugin/apply-local', {
      source: 'bundled:sample-plugin',
      inputs: {},
    }, true],
    ['resource', '/api/plugins/sample-plugin/apply', { inputs: {} }, false],
  ] as const)('returns a bounded %s diagnosis at %s', async (kind, path, body, versioned) => {
    const secretError = kind === 'resource'
      ? Object.assign(
          new Error('ENOENT: open /Volumes/PortableSSD/private-plugin/open-design.json'),
          { code: 'ENOENT' },
        )
      : kind === 'configuration'
        ? new InternalBundledStrategyApplyError('sample-plugin')
        : new Error('Unexpected failure at /Volumes/PortableSSD/private-plugin/open-design.json');
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
      headers: {
        'content-type': 'application/json',
        ...(versioned ? { 'x-od-plugin-apply-error-contract': '2' } : {}),
      },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(kind === 'configuration' ? 422 : 500);
    expect(await response.json()).toEqual(!versioned
      ? { error: 'plugin_apply_failed' }
      : kind === 'resource'
      ? {
          error: {
            code: 'PLUGIN_RESOURCE_UNAVAILABLE',
            message: 'A required plugin resource is unavailable. Reinstall or update the plugin and try again.',
            details: { reason: 'required_resource_missing' },
          },
        }
      : kind === 'configuration'
        ? {
            error: {
              code: 'PLUGIN_CONFIGURATION_INVALID',
              message: 'Plugin configuration is invalid. Reinstall or update the plugin and try again.',
              details: { reason: 'internal_strategy_invalid' },
            },
          }
        : {
            error: {
              code: 'PLUGIN_APPLY_FAILED',
              message: 'Plugin application failed. Try again.',
            },
          });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('failed to apply plugin sample-plugin'),
      secretError,
    );
  });
});
