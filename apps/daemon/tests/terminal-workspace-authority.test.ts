import express from 'express';
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerTerminalRoutes } from '../src/routes/terminal.js';

describe('terminal project authority', () => {
  let server: http.Server;
  let baseUrl = '';
  const session = { id: 'terminal-a', projectId: 'project-a' };
  const terminals = {
    list: vi.fn(() => [session]),
    statusBody: vi.fn((value) => value),
    create: vi.fn(async () => session),
    get: vi.fn(() => session),
    stream: vi.fn(),
    write: vi.fn(() => true),
    resize: vi.fn(() => true),
    kill: vi.fn(),
  };
  const resolveProjectDir = vi.fn(() => '/tmp/project-a');
  const authorizeProjectRequest = vi.fn(async (_req, res) => {
    res.status(503).json({
      error: {
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'unavailable',
        retryable: true,
      },
    });
    return false;
  });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerTerminalRoutes(app, {
      db: {},
      http: {
        sendApiError: (res: any, status: number, code: string, message: string) =>
          res.status(status).json({ error: { code, message } }),
        createSseResponse: vi.fn(),
      },
      paths: { PROJECTS_DIR: '/tmp/projects' },
      projectStore: {
        getProject: () => ({ id: 'project-a', metadata: null }),
      },
      projectFiles: { resolveProjectDir },
      terminals,
      authorizeProjectRequest,
    } as any);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('missing address');
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('denies list/create/stream/input/resize/kill before any terminal side effect', async () => {
    const requests = [
      fetch(`${baseUrl}/api/projects/project-a/terminals`),
      fetch(`${baseUrl}/api/projects/project-a/terminals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cols: 80, rows: 24 }),
      }),
      fetch(`${baseUrl}/api/projects/project-a/terminals/terminal-a/stream`),
      fetch(`${baseUrl}/api/projects/project-a/terminals/terminal-a/stdin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: 'whoami\n' }),
      }),
      fetch(`${baseUrl}/api/projects/project-a/terminals/terminal-a/resize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cols: 100, rows: 40 }),
      }),
      fetch(`${baseUrl}/api/projects/project-a/terminals/terminal-a/kill`, {
        method: 'POST',
      }),
      fetch(`${baseUrl}/api/projects/project-a/terminals/terminal-a`, {
        method: 'DELETE',
      }),
    ];
    const responses = await Promise.all(requests);

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: requests.length }, () => 503),
    );
    expect(terminals.list).not.toHaveBeenCalled();
    expect(terminals.create).not.toHaveBeenCalled();
    expect(terminals.get).not.toHaveBeenCalled();
    expect(terminals.stream).not.toHaveBeenCalled();
    expect(terminals.write).not.toHaveBeenCalled();
    expect(terminals.resize).not.toHaveBeenCalled();
    expect(terminals.kill).not.toHaveBeenCalled();
    expect(resolveProjectDir).not.toHaveBeenCalled();
  });
});
