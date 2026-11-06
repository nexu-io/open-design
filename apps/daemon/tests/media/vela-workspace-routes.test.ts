import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  mediaTaskErrorFromFailure,
  registerMediaRoutes,
} from '../../src/routes/media.js';
import { fetchVelaVideoModels } from '../../src/media/vela.js';
import { VIDEO_MODELS } from '../../src/media/models.js';

vi.mock('../../src/media/vela.js', () => ({ fetchVelaVideoModels: vi.fn() }));

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
  workspaceBinding: { workspaceId: string; visibility: 'personal' | 'team' } | null;
  denyAccess?: boolean;
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
      VIDEO_MODELS,
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
      getWorkspaceProjectByProjectId: () => options.workspaceBinding,
    }),
    projectFiles: functionProxy(),
    conversations: functionProxy(),
    research: functionProxy({ ResearchError: class ResearchError extends Error {} }),
    authorizeProjectRequest: async (_req: unknown, res: express.Response) => {
      if (options.denyAccess) { res.status(403).json({ error: 'denied' }); return false; }
      return true;
    },
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

async function postGenerate(
  url: string,
  route: string,
  surface: 'image' | 'video' = 'image',
) {
  const response = await fetch(`${url}${route}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer tool-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      surface,
      model:
        surface === 'image'
          ? 'vela/gpt-image-2'
          : 'vela/doubao-seedance-2-0-260128',
      prompt: 'test trusted workspace routing',
    }),
  });
  expect(response.status).toBe(202);
}

describe('Vela media route Workspace attribution', () => {
  it('filters the static catalogue using the same workspace as generation, including an empty catalogue', async () => {
    const catalogue = vi.mocked(fetchVelaVideoModels);
    catalogue.mockResolvedValueOnce(['doubao-seedance-2-0-260128']).mockResolvedValueOnce([]);
    const url = await startRouteServer({ generateMedia: vi.fn(), workspaceBinding: { workspaceId: 'workspace-from-database', visibility: 'personal' } });
    const first = await fetch(`${url}/api/media/models?cloud=true&projectId=team-project`);
    expect(first.status).toBe(200);
    expect((await first.json() as { video: { id: string }[] }).video.map((m: { id: string }) => m.id)).toEqual(['vela/doubao-seedance-2-0-260128']);
    expect(catalogue).toHaveBeenLastCalledWith('workspace-from-database');
    const empty = await fetch(`${url}/api/media/models?cloud=true&projectId=team-project`);
    expect((await empty.json() as { video: unknown[] }).video).toEqual([]);
  });

  it('reports a lookup failure separately from an empty catalogue and rejects denied project access', async () => {
    const catalogue = vi.mocked(fetchVelaVideoModels);
    catalogue.mockRejectedValueOnce(new Error('private upstream diagnostic'));
    const url = await startRouteServer({ generateMedia: vi.fn(), workspaceBinding: null });
    const failed = await fetch(`${url}/api/media/models?cloud=true&projectId=personal-project`);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('private upstream diagnostic');
    const calls = catalogue.mock.calls.length;
    const denied = await startRouteServer({ generateMedia: vi.fn(), workspaceBinding: null, denyAccess: true });
    expect((await fetch(`${denied}/api/media/models?cloud=true&projectId=personal-project`)).status).toBe(403);
    expect(catalogue).toHaveBeenCalledTimes(calls);
  });
	it('does not persist a numeric process exit code as a public media code', () => {
		const error = mediaTaskErrorFromFailure(
			Object.assign(new Error('renderer crashed'), { code: 1 }),
		);

		expect(error.message).toBe('renderer crashed');
		expect(error).not.toHaveProperty('code');
	});

  it('uses a team Workspace binding even when the project remains personal', async () => {
    const generateMedia = vi.fn(async (_args: { workspaceId?: string }) => ({
      name: 'result.png',
    }));
    const url = await startRouteServer({
      generateMedia,
      workspaceBinding: {
        workspaceId: 'workspace-from-database',
        visibility: 'personal',
      },
    });

    await postGenerate(url, '/api/projects/team-project/media/generate');
    await postGenerate(url, '/api/tools/media/generate');
    await vi.waitFor(() => expect(generateMedia).toHaveBeenCalledTimes(2));

    expect(generateMedia.mock.calls[0]![0].workspaceId).toBe('workspace-from-database');
    expect(generateMedia.mock.calls[1]![0].workspaceId).toBe('workspace-from-database');
  });

  it('uses the same Workspace binding for Vela video generation', async () => {
    const generateMedia = vi.fn(async (_args: { workspaceId?: string }) => ({
      name: 'result.mp4',
    }));
    const url = await startRouteServer({
      generateMedia,
      workspaceBinding: {
        workspaceId: 'workspace-from-database',
        visibility: 'personal',
      },
    });

    await postGenerate(url, '/api/projects/team-project/media/generate', 'video');
    await vi.waitFor(() => expect(generateMedia).toHaveBeenCalledOnce());
    expect(generateMedia.mock.calls[0]![0]).toMatchObject({
      surface: 'video',
      workspaceId: 'workspace-from-database',
    });
  });

  it('does not fabricate a Vela workspace for an unbound project', async () => {
    const generateMedia = vi.fn(async (_args: { workspaceId?: string }) => ({
      name: 'result.png',
    }));
    const url = await startRouteServer({ generateMedia, workspaceBinding: null });

    await postGenerate(url, '/api/projects/personal-project/media/generate');
    await vi.waitFor(() => expect(generateMedia).toHaveBeenCalledTimes(1));
    expect(generateMedia.mock.calls[0]![0].workspaceId).toBeUndefined();
  });
});
