// Route-level coverage for POST /api/projects/:id/open-in (#3871).
//
// The helper-level tests in host-tools-routes.test.ts pin launchHostTool's
// contract, but not the route's translation of a refused launch into an HTTP
// response — if the route regressed back to swallowing `!launch.ok` (or mapped
// it to `200 { ok: true }`), those tests would stay green. Here the spawn is
// mocked at the node:child_process boundary so the full route path runs, and
// the assertions lock the observable behavior: HTTP status + error code/body.

import { EventEmitter } from 'node:events';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import type { Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { registerHostToolsRoutes } from '../src/routes/host-tools.js';
import type { RegisterHostToolsRoutesDeps } from '../src/routes/host-tools.js';

const spawnState = vi.hoisted(() => ({ fail: false, error: 'spawn cursor ENOENT' }));

// Deterministic spawn: emits `error` or `spawn` on the next tick depending on
// spawnState, so both launch outcomes are reachable on any CI platform.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = () => {};
      setImmediate(() => {
        if (spawnState.fail) child.emit('error', new Error(spawnState.error));
        else child.emit('spawn');
      });
      return child;
    }),
  };
});

// Make the $PATH probe succeed everywhere so resolveHostToolLaunchPlan
// reports the editor as available and the route reaches the launch step.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, access: async () => undefined };
});

// Absolute baseDir short-circuits projectHostOpenDir, so resolveProjectDir is
// never consulted and no real project layout is needed.
const PROJECT_DIR = path.join(tmpdir(), 'od-3871-project');

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerHostToolsRoutes(app, {
    db: {},
    http: {
      // Mirrors the compat shape of server.ts sendApiError: status + { error: { code, message } }.
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { PROJECTS_DIR: tmpdir() },
    projectStore: {
      getProject: (_db: unknown, id: string) =>
        id === 'p1' ? { id, metadata: { baseDir: PROJECT_DIR } } : null,
    },
    projectFiles: { resolveProjectDir: () => PROJECT_DIR },
  } as unknown as RegisterHostToolsRoutesDeps);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function postOpenIn(projectId: string) {
  return fetch(`${baseUrl}/api/projects/${projectId}/open-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editorId: 'cursor' }),
  });
}

describe('POST /api/projects/:id/open-in launch reporting (#3871)', () => {
  it('returns 500 EDITOR_LAUNCH_FAILED when the OS refuses the launch', async () => {
    spawnState.fail = true;

    const resp = await postOpenIn('p1');

    expect(resp.status).toBe(500);
    const body = (await resp.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('EDITOR_LAUNCH_FAILED');
    expect(body.error.message).toContain('Failed to launch Cursor');
    expect(body.error.message).toContain('spawn cursor ENOENT');
  });

  it('returns 200 ok:true once the OS confirms the launch', async () => {
    spawnState.fail = false;

    const resp = await postOpenIn('p1');

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true, editorId: 'cursor', path: PROJECT_DIR });
  });
});
