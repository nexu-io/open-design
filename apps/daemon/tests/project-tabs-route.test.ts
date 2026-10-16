import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from 'prom-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type ServerModule = {
  startServer: (options: { port: number; returnServer: boolean }) => Promise<StartedServer>;
};

const originalDataDir = process.env.OD_DATA_DIR;
let started: StartedServer | null = null;
let dataDir: string | null = null;

describe('PUT /api/projects/:id/tabs', () => {
  afterEach(async () => {
    const current = started;
    started = null;
    if (current) {
      await Promise.resolve(current.shutdown?.());
      current.server.closeAllConnections?.();
      current.server.closeIdleConnections?.();
      await new Promise<void>((resolve) => current.server.close(() => resolve()));
    }
    register.clear();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = null;
    if (originalDataDir === undefined) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
    vi.resetModules();
  }, 30_000);

  // The web client restores whichever of its local tab cache and the daemon
  // copy has the larger `updatedAt`, and stamps the cache with the change
  // time. A state whose debounced write arrives late must keep its change
  // time here; stamping it on arrival lets it outrank a newer local change.
  it('keeps the change time the client sent, so a late older write cannot outrank a newer local change', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-project-tabs-route-'));
    process.env.OD_DATA_DIR = dataDir;
    vi.resetModules();
    const serverModule = await import('../src/server.js') as unknown as ServerModule;
    started = await serverModule.startServer({ port: 0, returnServer: true });

    const projectId = `tabs-${Date.now()}`;
    const created = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Tabs', metadata: { kind: 'prototype' } }),
    });
    expect(created.status).toBe(200);

    // The older state was changed first; the newer change (cached locally,
    // its daemon write never sent) happened before this older write arrived.
    const olderChangeAt = Date.now() - 2_000;
    const newerLocalChangeAt = olderChangeAt + 500;

    const put = await fetch(`${started.url}/api/projects/${projectId}/tabs`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tabs: ['beta-secondary.png'],
        active: 'beta-secondary.png',
        updatedAt: olderChangeAt,
      }),
    });
    expect(put.status).toBe(200);

    const saved = await fetch(`${started.url}/api/projects/${projectId}/tabs`)
      .then((response) => response.json() as Promise<{ updatedAt: number; active: string | null }>);
    expect(saved.active).toBe('beta-secondary.png');
    expect(saved.updatedAt).toBe(olderChangeAt);
    expect(saved.updatedAt).toBeLessThan(newerLocalChangeAt);
  });
});
