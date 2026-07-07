import express from 'express';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  listError: null as unknown,
}));

vi.mock('../src/integrations/resource-hub.js', () => {
  class ResourceHubError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message?: string,
    ) {
      super(message ?? code);
      this.name = 'ResourceHubError';
    }
  }

  return {
    ResourceHubError,
    createResourceHubClient: vi.fn(() => ({
      isConfigured: () => true,
    })),
    readResourceHubPrincipal: vi.fn(() => ({
      memberId: 'member_1',
      teamId: 'team_1',
      role: 'member',
      lifecycleState: null,
    })),
  };
});

vi.mock('../src/resource-sharing/orchestrator.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/resource-sharing/orchestrator.js')
  >('../src/resource-sharing/orchestrator.js');

  return {
    SharingError: actual.SharingError,
    createSharingOrchestrator: vi.fn(() => ({
      list: vi.fn(async () => {
        if (routeState.listError) {
          throw routeState.listError;
        }
        return [];
      }),
    })),
  };
});

import { ResourceHubError } from '../src/integrations/resource-hub.js';
import { SharingError } from '../src/resource-sharing/orchestrator.js';
import { registerResourceSharingRoutes } from '../src/routes/resources/index.js';

describe('resource routes error handling', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeEach(
    () =>
      new Promise<void>((resolve) => {
        routeState.listError = null;
        const app = express();
        registerResourceSharingRoutes(app, {
          db: {} as never,
          paths: {
            RUNTIME_DATA_DIR: '',
            USER_DESIGN_SYSTEMS_DIR: '',
            SKILL_ROOTS: [],
          },
        });
        app.use(
          (
            error: unknown,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction,
          ) => {
            res.status(500).json({
              error: error instanceof Error ? error.message : 'unknown_error',
            });
          },
        );

        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  );

  it('preserves resource hub errors', async () => {
    routeState.listError = new ResourceHubError(503, 'resource_hub_unavailable');

    const res = await fetch(`${baseUrl}/api/resources`);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'resource_hub_unavailable',
    });
  });

  it('preserves sharing errors', async () => {
    routeState.listError = new SharingError(
      409,
      'consumer_mapping_conflict',
      'pulled resources cannot be promoted',
    );

    const res = await fetch(`${baseUrl}/api/resources`);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'consumer_mapping_conflict',
      detail: 'pulled resources cannot be promoted',
    });
  });

  it('lets unexpected local errors reach the normal error path', async () => {
    routeState.listError = new Error('SQLITE_CONSTRAINT: shared_resources');

    const res = await fetch(`${baseUrl}/api/resources`);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'SQLITE_CONSTRAINT: shared_resources',
    });
  });
});
