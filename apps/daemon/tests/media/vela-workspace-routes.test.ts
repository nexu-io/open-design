import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerMediaRoutes } from '../../src/routes/media.js';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

function noop() {}

function functionProxy(overrides: Record<string, unknown> = {}) {
  return new Proxy(overrides, {
    get(target, property) {
      return property in target ? target[property as string] : noop;
    },
  });
}

function task(id: string, projectId: string) {
  return {
    id,
    projectId,
    status: 'queued',
    progress: [],
    startedAt: Date.now(),
    endedAt: null,
    file: null,
    error: null,
  };
}

async function startRouteServer(options: {
  generateMedia: ReturnType<typeof vi.fn>;
  teamWorkspaceId: string | null;
}) {
  const toolGrant = {
    token: 'tool-token',
    runId: 'run-1',
    projectId: 'team-project',
    allowedEndpoints: ['/api/tools/media/generate'],
    allowedOperations: ['media:generate'],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const deps = {
    db: {},
    design: functionProxy({
      readAnalyticsContext: () => null,
      runs: { get: () => ({ mediaExecution: { mode: 'enabled' } }) },
    }),
    http: {
      sendApiError: (
        res: express.Response,
        status: number,
        code: string,
        message: string,
      ) => res.status(status).json({ error: { code, message } }),
      requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) => next(),
      isLocalSameOrigin: () => true,
      resolvedPortRef: { current: 0 },
    },
    paths: {
      PROJECT_ROOT: '/tmp/od-route-project-root',
      PROJECTS_DIR: '/tmp/od-route-projects',
      RUNTIME_DATA_DIR: '/tmp/od-route-data',
    },
    ids: { randomUUID: () => `task-${Math.random()}` },
    auth: functionProxy({
      authorizeToolRequest: () => toolGrant,
      optionalToolGrantFromRequest: () => null,
      requestProjectOverride: (left: string, right: string) => left !== right,
    }),
    media: functionProxy({
      generateMedia: options.generateMedia,
      createMediaTask: task,
      persistMediaTask: noop,
      appendTaskProgress: noop,
      notifyTaskWaiters: noop,
    }),
    appConfig: functionProxy({ readAppConfig: async () => ({}) }),
    orbit: functionProxy({ orbitService: functionProxy() }),
    nativeDialogs: functionProxy(),
    projectStore: functionProxy({
      getProject: (_db: unknown, projectId: string) => ({ id: projectId }),
      findTeamWorkspaceIdForProject: () => options.teamWorkspaceId,
    }),
    projectFiles: functionProxy(),
    conversations: functionProxy(),
    research: functionProxy({ ResearchError: class ResearchError extends Error {} }),
    authorizeProjectRequest: async () => true,
    authorizeProjectToolRequest: async () => true,
  } as unknown as Parameters<typeof registerMediaRoutes>[1];

  const app = express();
  app.use(express.json());
  registerMediaRoutes(app, deps);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

async function postGenerate(url: string, route: string) {
  const response = await fetch(`${url}${route}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer tool-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      surface: 'image',
      model: 'vela/gpt-image-2',
      prompt: 'test trusted workspace routing',
    }),
  });
  expect(response.status).toBe(202);
}

describe('Vela media route Workspace attribution', () => {
  it('passes the persisted team workspace through both project and tool-token routes', async () => {
    const generateMedia = vi.fn(async (_args: { workspaceId?: string }) => ({
      name: 'result.png',
    }));
    const url = await startRouteServer({
      generateMedia,
      teamWorkspaceId: 'workspace-from-database',
    });

    await postGenerate(url, '/api/projects/team-project/media/generate');
    await postGenerate(url, '/api/tools/media/generate');
    await vi.waitFor(() => expect(generateMedia).toHaveBeenCalledTimes(2));

    expect(generateMedia.mock.calls[0]![0].workspaceId).toBe('workspace-from-database');
    expect(generateMedia.mock.calls[1]![0].workspaceId).toBe('workspace-from-database');
  });

  it('does not fabricate a Vela workspace for a personal project', async () => {
    const generateMedia = vi.fn(async (_args: { workspaceId?: string }) => ({
      name: 'result.png',
    }));
    const url = await startRouteServer({ generateMedia, teamWorkspaceId: null });

    await postGenerate(url, '/api/projects/personal-project/media/generate');
    await vi.waitFor(() => expect(generateMedia).toHaveBeenCalledTimes(1));
    expect(generateMedia.mock.calls[0]![0].workspaceId).toBeUndefined();
  });
});
