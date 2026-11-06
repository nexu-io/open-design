import type http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMediaRoutes } from '../../src/routes/media.js';
import { HYPERFRAMES_SCAFFOLD_TOOL_ENDPOINT } from '../../src/tool-tokens.js';

const servers: http.Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function noop() {}

function functionProxy(overrides: Record<string, unknown> = {}) {
  return new Proxy(overrides, {
    get(target, property) {
      return property in target ? target[property as string] : noop;
    },
  });
}

async function startServer() {
  const projectDir = await mkdtemp(path.join(tmpdir(), 'od-hyperframes-route-'));
  roots.push(projectDir);
  const authorizeToolRequest = vi.fn(() => ({
    token: 'tool-token',
    runId: 'run-1',
    projectId: 'project-1',
    allowedEndpoints: [HYPERFRAMES_SCAFFOLD_TOOL_ENDPOINT],
    allowedOperations: ['media:scaffold'],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }));
  const deps = {
    db: {},
    design: functionProxy(),
    http: {
      sendApiError: (res: express.Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
      requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) => next(),
      isLocalSameOrigin: () => true,
      resolvedPortRef: { current: 0 },
    },
    paths: {
      PROJECT_ROOT: projectDir,
      PROJECTS_DIR: path.dirname(projectDir),
      RUNTIME_DATA_DIR: projectDir,
    },
    ids: { randomUUID: () => 'unused' },
    auth: functionProxy({ authorizeToolRequest }),
    media: functionProxy(),
    appConfig: functionProxy(),
    orbit: functionProxy({ orbitService: functionProxy() }),
    nativeDialogs: functionProxy(),
    projectStore: functionProxy({
      getProject: (_db: unknown, projectId: string) => ({ id: projectId, metadata: {} }),
    }),
    projectFiles: functionProxy({ resolveProjectDir: () => projectDir }),
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
  return {
    authorizeToolRequest,
    projectDir,
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe('HyperFrames scaffold routes', () => {
  it('creates project and tool-token compositions through the same daemon helper', async () => {
    const started = await startServer();
    const projectResponse = await fetch(
      `${started.url}/api/projects/project-1/media/hyperframes/scaffold`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ compositionDir: '.hyperframes-cache/project-route' }),
      },
    );
    expect(projectResponse.status).toBe(201);

    const toolResponse = await fetch(`${started.url}${HYPERFRAMES_SCAFFOLD_TOOL_ENDPOINT}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer tool-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ compositionDir: '.hyperframes-cache/tool-route' }),
    });
    expect(toolResponse.status).toBe(201);
    expect(started.authorizeToolRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'media:scaffold',
      { endpoint: HYPERFRAMES_SCAFFOLD_TOOL_ENDPOINT },
    );
    await expect(readFile(
      path.join(started.projectDir, '.hyperframes-cache/tool-route/hyperframes.json'),
      'utf8',
    )).resolves.toContain('hyperframes.heygen.com/schema');
  });
});
