import http from 'node:http';
import path from 'node:path';
import { stat, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  closeDatabase,
  ensureWorkspaceProject,
  insertProject,
  openDatabase,
} from '../../src/db.js';
import { insertMediaTask, listMediaTasksByProject } from '../../src/media/tasks.js';
import { ensureProject, renameProjectFile } from '../../src/projects.js';
import { startServer } from '../../src/server.js';
import { resolveMediaTaskProjectFile } from '../../src/routes/media.js';
import { toolTokenRegistry } from '../../src/tool-tokens.js';

describe('media task route recovery', () => {
  let server: http.Server | null = null;
  let authorityServer: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    if (authorityServer) {
      await new Promise<void>((resolve) => authorityServer?.close(() => resolve()));
      authorityServer = null;
    }
    vi.unstubAllEnvs();
    toolTokenRegistry.clear();
    closeDatabase();
  });

  it('lists image tasks with persisted run ownership for ChatPanel progress', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), dataDir === undefined ? {} : { dataDir });
    const projectId = `project_${randomUUID()}`;
    const runId = `run_${randomUUID()}`;
    const now = Date.now();
    insertProject(db, {
      id: projectId,
      name: 'ChatPanel media project',
      createdAt: now,
      updatedAt: now,
    });
    const projectDir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(path.join(projectDir, 'generated.png'), Buffer.from('png'));
    insertMediaTask(db, {
      id: `task_${randomUUID()}`,
      projectId,
      runId,
      status: 'done',
      surface: 'image',
      progress: ['done'],
      file: { name: 'generated.png', size: 3, kind: 'image', mime: 'image/png' },
      startedAt: now - 500,
      endedAt: now,
    });

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;
    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/media/tasks?includeDone=1`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [{ runId, status: 'done', surface: 'image', file: { name: 'generated.png' } }],
    });
  });

  it('fails closed when generation metadata matches more than one moved file', () => {
    expect(resolveMediaTaskProjectFile(
      { name: 'missing.png', size: 3, mtime: 1234 },
      [
        { name: 'a.png', size: 3, mtime: 1234, kind: 'image', mime: 'image/png' },
        { name: 'b.png', size: 3, mtime: 1234, kind: 'image', mime: 'image/png' },
      ],
    )).toBeNull();
  });

  it('reconciles a completed media task to the uniquely renamed project file', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    const projectId = `project_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const now = Date.now();
    insertProject(db, {
      id: projectId,
      name: 'Renamed media project',
      createdAt: now,
      updatedAt: now,
    });

    const projectsRoot = path.join(dataDir, 'projects');
    const projectDir = await ensureProject(projectsRoot, projectId);
    const originalName = 'generated.png';
    const originalPath = path.join(projectDir, originalName);
    await writeFile(originalPath, Buffer.from('generated-image-bytes'));
    const originalStat = await stat(originalPath);
    insertMediaTask(db, {
      id: taskId,
      projectId,
      runId: `run_${randomUUID()}`,
      status: 'done',
      surface: 'image',
      progress: ['done'],
      file: {
        name: originalName,
        size: originalStat.size,
        mtime: originalStat.mtimeMs,
        kind: 'image',
        mime: 'image/png',
      },
      startedAt: now - 500,
      endedAt: now,
    });
    await renameProjectFile(
      projectsRoot,
      projectId,
      originalName,
      'final/generated-renamed.png',
    );

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    const response = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/media/tasks?includeDone=1`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [{
        taskId,
        status: 'done',
        file: { name: 'final/generated-renamed.png' },
      }],
    });
    expect(listMediaTasksByProject(db, projectId, { includeTerminal: true })[0]?.file)
      .toMatchObject({ name: 'final/generated-renamed.png' });
  });

  it('accepts only a same-project token explicitly allowed to poll media tasks', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    const db = openDatabase(process.cwd(), dataDir === undefined ? {} : { dataDir });
    const projectId = `project_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const runId = `run_${randomUUID()}`;
    const now = Date.now();

    insertProject(db, {
      id: projectId,
      name: 'Token-polled Team media project',
      createdAt: now,
      updatedAt: now,
    });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: 'workspace-team',
      visibility: 'team',
      createdByWorkspaceMemberId: 'member-creator',
    });
    insertMediaTask(db, {
      id: taskId,
      projectId,
      status: 'done',
      surface: 'image',
      model: 'fixture-model',
      progress: ['done'],
      file: { name: 'generated.png', size: 3 },
      startedAt: now,
      endedAt: now,
      updatedAt: now,
    });
    const token = toolTokenRegistry.mint({
      projectId,
      runId,
      allowedEndpoints: ['/api/media/tasks/:id/wait'],
      allowedOperations: ['media:generate'],
    }).token;

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    const response = await fetch(
      `${started.url}/api/media/tasks/${encodeURIComponent(taskId)}/wait`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ since: 0, timeoutMs: 0 }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'done',
      file: { name: 'generated.png' },
    });

    const endpointDeniedToken = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
      allowedEndpoints: ['/api/tools/media/generate'],
      allowedOperations: ['media:generate'],
    }).token;
    const endpointDenied = await fetch(
      `${started.url}/api/media/tasks/${encodeURIComponent(taskId)}/wait`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${endpointDeniedToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ since: 0, timeoutMs: 0 }),
      },
    );
    expect(endpointDenied.status).toBe(403);
    await expect(endpointDenied.json()).resolves.toMatchObject({
      error: { code: 'TOOL_ENDPOINT_DENIED' },
    });

    const otherProjectToken = toolTokenRegistry.mint({
      projectId: 'different-project',
      runId: `run_${randomUUID()}`,
      allowedEndpoints: ['/api/media/tasks/:id/wait'],
      allowedOperations: ['media:generate'],
    }).token;
    const crossProject = await fetch(
      `${started.url}/api/media/tasks/${encodeURIComponent(taskId)}/wait`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${otherProjectToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ since: 0, timeoutMs: 0 }),
      },
    );
    expect(crossProject.status).toBe(403);
    await expect(crossProject.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });

  it('fails closed when a media wait request presents an invalid or expired bearer token', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    const db = openDatabase(process.cwd(), dataDir === undefined ? {} : { dataDir });
    const projectId = `project_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const now = Date.now();

    insertProject(db, {
      id: projectId,
      name: 'Unbound legacy media project',
      createdAt: now,
      updatedAt: now,
    });
    insertMediaTask(db, {
      id: taskId,
      projectId,
      status: 'done',
      surface: 'image',
      model: 'fixture-model',
      progress: ['done'],
      file: { name: 'generated.png', size: 3 },
      startedAt: now,
      endedAt: now,
      updatedAt: now,
    });
    const expiredToken = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
      allowedEndpoints: ['/api/media/tasks/:id/wait'],
      allowedOperations: ['media:generate'],
      nowMs: now - 120_000,
      ttlMs: 60_000,
    }).token;

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    for (const [token, expectedCode] of [
      ['forged-token', 'TOOL_TOKEN_INVALID'],
      [expiredToken, 'TOOL_TOKEN_EXPIRED'],
    ] as const) {
      const response = await fetch(
        `${started.url}/api/media/tasks/${encodeURIComponent(taskId)}/wait`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ since: 0, timeoutMs: 0 }),
        },
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: expectedCode },
      });
    }
  });

  it('uses the tool grant and persisted project binding without querying Workspace authority', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    const db = openDatabase(process.cwd(), dataDir === undefined ? {} : { dataDir });
    const projectId = `project_${randomUUID()}`;
    const workspaceId = `workspace_${randomUUID()}`;
    const now = Date.now();

    insertProject(db, {
      id: projectId,
      name: 'Fresh-authority Team media project',
      createdAt: now,
      updatedAt: now,
    });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId,
      visibility: 'team',
      createdByWorkspaceMemberId: 'member-creator',
    });
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
      allowedEndpoints: ['/api/media/tasks/:id/wait'],
      allowedOperations: ['media:generate'],
    }).token;
    let authorityMode: 'active' | 'outage' | 'removed' = 'removed';
    let authorityRequests = 0;
    authorityServer = http.createServer((_req, res) => {
      authorityRequests += 1;
      res.setHeader('content-type', 'application/json');
      if (authorityMode === 'outage') {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'authority unavailable' }));
        return;
      }
      res.end(JSON.stringify({
        items: [{
          workspaceId,
          workspaceName: 'Fresh authority workspace',
          workspaceType: 'team',
          workspaceMemberId: 'member-creator',
          role: 'owner',
          memberStatus: authorityMode === 'removed' ? 'removed' : 'active',
          lifecycleState: 'active',
        }],
      }));
    });
    await new Promise<void>((resolve) => {
      authorityServer?.listen(0, '127.0.0.1', resolve);
    });
    const authorityAddress = authorityServer.address();
    if (!authorityAddress || typeof authorityAddress === 'string') {
      throw new Error('authority server did not bind to a TCP port');
    }
    vi.stubEnv('OD_WORKSPACE_CONTEXT_SOURCE', 'vela');
    vi.stubEnv('VELA_CONTROL_KEY', 'test-control-key');
    vi.stubEnv('VELA_API_URL', `http://127.0.0.1:${authorityAddress.port}`);

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;
    await vi.waitFor(() => expect(authorityRequests).toBeGreaterThanOrEqual(1));
    const startupAuthorityRequests = authorityRequests;
    const waitForMissingTask = () => fetch(
      `${started.url}/api/media/tasks/missing-task/wait`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ since: 0, timeoutMs: 0 }),
      },
    );

    const removed = await waitForMissingTask();
    expect(removed.status).toBe(404);

    authorityMode = 'outage';
    const unavailable = await waitForMissingTask();
    expect(unavailable.status).toBe(404);

    authorityMode = 'active';
    const authorized = await waitForMissingTask();
    expect(authorized.status).toBe(404);
    expect(authorityRequests).toBe(startupAuthorityRequests);
  });

  it('recovers a pre-restart running task so wait returns interrupted instead of 404', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    const db = openDatabase(process.cwd(), dataDir === undefined ? {} : { dataDir });
    const projectId = `project_${randomUUID()}`;
    const taskId = `task_${randomUUID()}`;
    const now = Date.now() - 5_000;

    insertProject(db, {
      id: projectId,
      name: 'Recovered media project',
      createdAt: now,
      updatedAt: now,
    });
    insertMediaTask(db, {
      id: taskId,
      projectId,
      status: 'running',
      surface: 'video',
      model: 'seedance-2',
      progress: ['provider task accepted'],
      startedAt: now,
      updatedAt: now,
    });

    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    const response = await fetch(`${started.url}/api/media/tasks/${encodeURIComponent(taskId)}/wait`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: 0, timeoutMs: 0 }),
    });
    const body = await response.json() as {
      status?: string;
      progress?: string[];
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe('interrupted');
    expect(body.progress).toEqual(['provider task accepted']);
    expect(body.error).toMatchObject({
      code: 'DAEMON_RESTART',
      message: 'media task interrupted by daemon restart',
    });
  });

  it('marks the media task failed when proxy setup throws before generation starts', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    const originalHttpProxy = process.env.HTTP_PROXY;
    const originalHttpsProxy = process.env.HTTPS_PROXY;
    const originalAllProxy = process.env.ALL_PROXY;
    const db = openDatabase(process.cwd(), dataDir === undefined ? {} : { dataDir });
    const projectId = `project_${randomUUID()}`;
    const now = Date.now() - 5_000;

    insertProject(db, {
      id: projectId,
      name: 'Proxy failure media project',
      createdAt: now,
      updatedAt: now,
    });

    process.env.HTTP_PROXY = 'not a valid proxy url';
    delete process.env.HTTPS_PROXY;
    delete process.env.ALL_PROXY;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    server = started.server;

    try {
      const response = await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/media/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          surface: 'image',
          model: 'custom-image',
          prompt: 'A proxy failure should not leave a stuck task',
          output: 'proxy-failure.png',
        }),
      });
      const body = await response.json() as { error?: string };

      expect(response.status).toBe(400);
      expect(body.error).toBeTruthy();
      const failedTasks = listMediaTasksByProject(db, projectId, { includeTerminal: true });
      expect(failedTasks).toMatchObject([
        {
          error: { status: 400 },
          file: null,
          model: 'custom-image',
          progress: [],
          projectId,
          status: 'failed',
          surface: 'image',
        },
      ]);
      const taskId = failedTasks[0]?.id;
      expect(taskId).toBeTruthy();
      const diagnostic = errorSpy.mock.calls
        .flatMap((args) => args.map(String))
        .find((line) => line.includes(`"task_id":"${taskId}"`) && line.includes('"event":"failed"'));
      expect(diagnostic).toContain(`"project_id":"${projectId}"`);
      expect(diagnostic).toContain('"model_id":"custom-image"');
      expect(diagnostic).toContain('"provider_id":"custom-image"');
      expect(diagnostic).toContain('"run_id":null');
    } finally {
      errorSpy.mockRestore();
      if (originalHttpProxy === undefined) delete process.env.HTTP_PROXY;
      else process.env.HTTP_PROXY = originalHttpProxy;
      if (originalHttpsProxy === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = originalHttpsProxy;
      if (originalAllProxy === undefined) delete process.env.ALL_PROXY;
      else process.env.ALL_PROXY = originalAllProxy;
    }
  });
});
