// Plan §3.F2 / spec §11.7 — daemon lifecycle endpoints.
//
// `od daemon status` and `od daemon stop` (both Phase 1.5) talk to the
// new /api/daemon/status + /api/daemon/shutdown routes. This suite spins
// the real Express app via `startServer` and asserts the public shape so
// the CLI can rely on it without re-checking each release.

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/daemon/status', () => {
  it('returns a runtime snapshot covering version + bindHost + port + pid + installedPlugins', async () => {
    const resp = await fetch(`${baseUrl}/api/daemon/status`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      version: unknown;
      bindHost: unknown;
      port: unknown;
      pid: unknown;
      installedPlugins: unknown;
      shuttingDown: boolean;
      namespace?: unknown;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.version === 'string' || typeof body.version === 'object').toBe(true);
    expect(typeof body.bindHost).toBe('string');
    expect(typeof body.port).toBe('number');
    expect(typeof body.pid).toBe('number');
    expect(typeof body.installedPlugins).toBe('number');
    expect(body.shuttingDown).toBe(false);
    expect(body).not.toHaveProperty('namespace');
  });
});

describe('POST /api/daemon/shutdown', () => {
  it('only accepts requests from local-daemon-allowed origins', async () => {
    // Without the local-daemon header, the route is rejected. The
    // exact rejection mode is owned by `requireLocalDaemonRequest`;
    // we just check that a default test client gets a non-2xx.
    const resp = await fetch(`${baseUrl}/api/daemon/shutdown`, {
      method:  'POST',
      headers: { origin: 'https://example.com' },
    });
    expect([401, 403, 404]).toContain(resp.status);
  });
});
