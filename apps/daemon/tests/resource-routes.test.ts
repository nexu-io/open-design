import express from 'express';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  listError: null as unknown,
  listResponse: [] as Array<unknown>,
  allowLocalRequest: true,
  hasExplicitResourceHubConfig: true,
  publishCalls: [] as Array<{
    principal: unknown;
    resourceId: string;
    input: unknown;
  }>,
  publicSnapshotCalls: [] as string[],
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
      publishSnapshot: vi.fn(
        async (principal: unknown, resourceId: string, input: unknown) => {
          routeState.publishCalls.push({ principal, resourceId, input });
          return {
            slug: 'snap-1',
            name: 'Launch review',
            kind: 'design_system',
            versionId: 'version-1',
            createdAt: '2026-07-08T06:00:00.000Z',
          };
        },
      ),
      getPublicSnapshot: vi.fn(async (slug: string) => {
        routeState.publicSnapshotCalls.push(slug);
        return {
          slug,
          name: 'Launch review',
          kind: 'design_system',
          createdAt: '2026-07-08T06:00:00.000Z',
          manifest: {
            digest: 'sha256:abc',
            entries: [
              {
                path: 'tokens.json',
                type: 'file',
                executable: false,
                blobDigest: 'sha256:def',
                symlinkTarget: null,
              },
            ],
          },
        };
      }),
    })),
    hasExplicitResourceHubConfig: vi.fn(
      () => routeState.hasExplicitResourceHubConfig,
    ),
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
        return routeState.listResponse;
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
        routeState.listResponse = [];
        routeState.allowLocalRequest = true;
        routeState.hasExplicitResourceHubConfig = true;
        routeState.publishCalls = [];
        routeState.publicSnapshotCalls = [];
        const app = express();
        registerResourceSharingRoutes(app, {
          db: {} as never,
          requireLocalDaemonRequest: (_req, res, next) => {
            if (!routeState.allowLocalRequest) {
              res.status(403).json({ error: 'local_origin_required' });
              return;
            }
            next();
          },
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

  it('applies the local daemon request guard before listing resources', async () => {
    routeState.allowLocalRequest = false;

    const res = await fetch(`${baseUrl}/api/resources`);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'local_origin_required',
    });
  });

  it('returns pulled resource list mappings without internal storage prefixes', async () => {
    routeState.listResponse = [
      {
        id: 'hub-1',
        teamId: 'team_1',
        kind: 'design_system',
        ownerMemberId: 'member_1',
        createdAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
        local: {
          kind: 'design_system',
          localId: 'hub-1',
          hubResourceId: 'hub-1',
          hubTeamId: 'team_1',
          role: 'consumer',
          lastSyncedVersion: 1,
          updatedAt: '2026-01-01T00:01:00.000Z',
        },
      },
    ];

    const res = await fetch(`${baseUrl}/api/resources`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      resources: routeState.listResponse,
    });
  });

  it('reports the resource hub as unconfigured without explicit hub config', async () => {
    routeState.hasExplicitResourceHubConfig = false;

    const res = await fetch(`${baseUrl}/api/resources/_status`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      configured: false,
      principalAvailable: true,
    });
  });

  it('publishes public snapshots through the hub client with the workspace principal', async () => {
    const res = await fetch(
      `${baseUrl}/api/resources/hub-1/snapshot?name=Launch%20review`,
      { method: 'POST' },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      slug: 'snap-1',
      name: 'Launch review',
      kind: 'design_system',
      versionId: 'version-1',
    });
    expect(routeState.publishCalls).toEqual([
      {
        principal: {
          memberId: 'member_1',
          teamId: 'team_1',
          role: 'member',
          lifecycleState: null,
        },
        resourceId: 'hub-1',
        input: { name: 'Launch review', ref: 'latest' },
      },
    ]);
  });

  it('reads public snapshots through the unauthenticated hub public plane', async () => {
    const res = await fetch(`${baseUrl}/api/public-snapshots/snap-1`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      slug: 'snap-1',
      name: 'Launch review',
      manifest: {
        digest: 'sha256:abc',
        entries: [{ path: 'tokens.json', blobDigest: 'sha256:def' }],
      },
    });
    expect(routeState.publicSnapshotCalls).toEqual(['snap-1']);
  });
});
