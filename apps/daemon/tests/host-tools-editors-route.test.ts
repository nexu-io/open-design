// Route-level coverage for GET /api/editors `canRevealFolder` (#787 / Plane
// open-design#787).
//
// "Can the daemon reveal a local folder to the user sitting in front of the
// web UI?" is only answerable by the daemon itself: it knows whether a
// directory opener (open / explorer / xdg-open) is on $PATH, whether sandbox
// mode is on, and whether it was started headless (`od daemon start
// --headless/--serve-web`) — the container/Web deployment shape where the
// user cannot see the daemon host's desktop. The open-in failure shapes are
// not a usable client signal (they drift between 409 / 500 / silent 200
// depending on which opener conjunct fails), so the route must publish the
// verdict explicitly and the assertions anchor on it.
//
// The $PATH probe is mocked at the node:fs/promises boundary so both opener
// outcomes are reachable on any CI platform.

import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import express from 'express';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerHostToolsRoutes } from '../src/routes/host-tools.js';
import type { RegisterHostToolsRoutesDeps } from '../src/routes/host-tools.js';

const probeState = vi.hoisted(() => ({ openerOnPath: true }));

// Deterministic $PATH / bundle probe: every `access` succeeds (opener found)
// or fails (bare container image) depending on probeState.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    access: async () => {
      if (!probeState.openerOnPath) throw new Error('ENOENT');
    },
  };
});

const servers: http.Server[] = [];

async function startEditorsApp(
  extraDeps: Partial<RegisterHostToolsRoutesDeps> = {},
): Promise<string> {
  const app = express();
  app.use(express.json());
  registerHostToolsRoutes(app, {
    db: {},
    http: {
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { PROJECTS_DIR: tmpdir() },
    projectStore: { getProject: () => null },
    projectFiles: { resolveProjectDir: () => tmpdir() },
    ...extraDeps,
  } as unknown as RegisterHostToolsRoutesDeps);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function fetchEditors(baseUrl: string): Promise<{ canRevealFolder?: boolean }> {
  const resp = await fetch(`${baseUrl}/api/editors`);
  expect(resp.status).toBe(200);
  return (await resp.json()) as { canRevealFolder?: boolean };
}

afterEach(async () => {
  probeState.openerOnPath = true;
  delete process.env.OD_SANDBOX_MODE;
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

describe('GET /api/editors canRevealFolder (#787)', () => {
  it('reports false for a headless / --serve-web daemon even when an opener is on $PATH', async () => {
    // The known heuristic blind spot inverted: an opener probe alone is not
    // enough. A container with xdg-open installed but started via
    // `od daemon start --serve-web` must still report false — the user in
    // the browser cannot see the daemon host's desktop.
    probeState.openerOnPath = true;
    const baseUrl = await startEditorsApp({ revealFolderCapable: false });

    const body = await fetchEditors(baseUrl);

    expect(body.canRevealFolder).toBe(false);
  });

  it('reports false when no directory opener is on $PATH (bare container image)', async () => {
    probeState.openerOnPath = false;
    const baseUrl = await startEditorsApp();

    const body = await fetchEditors(baseUrl);

    expect(body.canRevealFolder).toBe(false);
  });

  it('reports false when sandbox mode is enabled', async () => {
    probeState.openerOnPath = true;
    process.env.OD_SANDBOX_MODE = '1';
    const baseUrl = await startEditorsApp();

    const body = await fetchEditors(baseUrl);

    expect(body.canRevealFolder).toBe(false);
  });

  it('reports true for the local desktop shape (opener present, no sandbox, not headless)', async () => {
    // Local no-regression guard: desktop / `pnpm tools-dev` localhost
    // browsing keeps the native Open Folder button.
    probeState.openerOnPath = true;
    const baseUrl = await startEditorsApp();

    const body = await fetchEditors(baseUrl);

    expect(body.canRevealFolder).toBe(true);
  });
});
