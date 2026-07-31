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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

function postOpenIn(projectId: string, editorId = 'cursor') {
  return fetch(`${baseUrl}/api/projects/${projectId}/open-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editorId }),
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

// The darwin gate on the Kiro entry has to be enforced on the *launch* path,
// not just filtered out of `GET /api/editors`. A client can POST any
// `editorId` — it does not have to be one the list offered — so if the route
// stopped consulting applicableForPlatform, a non-macOS POST for `kiro` would
// fall through to the probe. That is the exact "editor tile launches the
// terminal agent" hazard the bundle-only entry exists to prevent (#6313), so
// the refusal is pinned here at the HTTP boundary.
//
// The 400/BAD_REQUEST pair matters: with the gate removed the request is still
// refused, but as 409 EDITOR_NOT_AVAILABLE from the probe. Asserting the code
// (not just a non-2xx status) keeps the two failure modes distinguishable.
describe('POST /api/projects/:id/open-in platform gate — kiro is darwin-only (#6313)', () => {
  const ORIGINAL_PLATFORM = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM, configurable: true });
  });

  it.each(['linux', 'win32'] as const)(
    'refuses editorId=kiro with 400 BAD_REQUEST on %s',
    async (platform) => {
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });

      const resp = await postOpenIn('p1', 'kiro');

      expect(resp.status).toBe(400);
      const body = (await resp.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toBe(`Kiro is not available on ${platform}`);
    },
  );
});
