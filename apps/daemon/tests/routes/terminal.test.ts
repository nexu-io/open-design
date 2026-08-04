import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { ensureProject, resolveProjectDir } from '../../src/projects.js';
import { registerTerminalRoutes } from '../../src/routes/terminal.js';

describe('terminal routes', () => {
  let server: Server | null = null;
  let tempRoot: string | null = null;

  afterEach(async () => {
    if (server != null) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    if (tempRoot != null) {
      await rm(tempRoot, { force: true, recursive: true });
      tempRoot = null;
    }
  });

  it('creates a managed project directory before spawning its first terminal', async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'od-terminal-route-'));
    const projectsRoot = path.join(tempRoot, 'projects');
    await mkdir(projectsRoot, { recursive: true });
    const project = { id: 'new-empty-project', metadata: null };
    const expectedCwd = path.join(projectsRoot, project.id);
    let terminalCwd: string | null = null;
    let ensureCalls = 0;

    const app = express();
    app.use(express.json());
    registerTerminalRoutes(app, {
      db: {},
      http: {
        createSseResponse: () => {
          throw new Error('not used');
        },
        sendApiError: (res: express.Response, status: number, code: string, message: string) =>
          res.status(status).json({ error: { code, message } }),
      },
      paths: { PROJECTS_DIR: projectsRoot },
      projectFiles: {
        ensureProject: async (...args: Parameters<typeof ensureProject>) => {
          ensureCalls += 1;
          return await ensureProject(...args);
        },
        resolveProjectDir,
      },
      projectStore: {
        getProject: (_db: unknown, id: string) => (id === project.id ? project : null),
      },
      terminals: {
        create: async ({ cwd }: { cwd: string }) => {
          // ConPTY returns Windows error 267 when this directory does not
          // exist. Check it explicitly so the regression stays reproducible
          // on every test host.
          const cwdStat = await stat(cwd);
          if (!cwdStat.isDirectory()) throw new Error('terminal cwd is not a directory');
          terminalCwd = cwd;
          return { id: 'terminal-1', projectId: project.id };
        },
        get: () => null,
        list: () => [],
        statusBody: (session: unknown) => session,
      },
    } as any);

    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('failed to bind terminal route test server');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/projects/${project.id}/terminals`,
      {
        body: JSON.stringify({ cols: 80, rows: 24 }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );

    expect(response.status).toBe(200);
    expect(ensureCalls).toBe(1);
    expect(terminalCwd).toBe(expectedCwd);
    expect((await stat(expectedCwd)).isDirectory()).toBe(true);
  });
});
