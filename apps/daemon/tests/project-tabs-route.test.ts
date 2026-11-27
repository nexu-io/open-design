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
let serverModule: ServerModule | null = null;

describe('project tabs route', () => {
  afterEach(async () => {
    await stopServer();
    register.clear();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = null;
    if (originalDataDir === undefined) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
    serverModule = null;
    vi.resetModules();
  }, 30_000);

  it('persists designFilesTabHidden through PUT then GET', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-project-tabs-route-'));
    started = await startIsolatedServer(dataDir);

    const projectId = `tabs-${Date.now()}`;
    await postJson(`${started.url}/api/projects`, {
      id: projectId,
      name: 'Tabs Project',
      metadata: { kind: 'prototype' },
      pendingPrompt: null,
    });

    const put = await fetch(`${started.url}/api/projects/${projectId}/tabs`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tabs: ['index.html'],
        active: 'index.html',
        browserTabs: [],
        designFilesTabHidden: true,
      }),
    });
    expect(put.status).toBe(200);
    const putBody = await put.json() as { designFilesTabHidden?: boolean };
    expect(putBody.designFilesTabHidden).toBe(true);

    const get = await fetchJson<{ tabs: string[]; active: string | null; designFilesTabHidden?: boolean }>(
      `${started.url}/api/projects/${projectId}/tabs`,
    );
    expect(get.tabs).toEqual(['index.html']);
    expect(get.designFilesTabHidden).toBe(true);
  }, 60_000);

  it('clears designFilesTabHidden when a later PUT sends false', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-project-tabs-route-'));
    started = await startIsolatedServer(dataDir);

    const projectId = `tabs-${Date.now()}`;
    await postJson(`${started.url}/api/projects`, {
      id: projectId,
      name: 'Tabs Project',
      metadata: { kind: 'prototype' },
      pendingPrompt: null,
    });

    for (const designFilesTabHidden of [true, false]) {
      const response = await fetch(`${started.url}/api/projects/${projectId}/tabs`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tabs: [], active: null, browserTabs: [], designFilesTabHidden }),
      });
      expect(response.status).toBe(200);
    }

    const get = await fetchJson<{ designFilesTabHidden?: boolean }>(
      `${started.url}/api/projects/${projectId}/tabs`,
    );
    expect(get.designFilesTabHidden).toBeUndefined();
  }, 60_000);

  it('rejects a non-boolean designFilesTabHidden', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-project-tabs-route-'));
    started = await startIsolatedServer(dataDir);

    const projectId = `tabs-${Date.now()}`;
    await postJson(`${started.url}/api/projects`, {
      id: projectId,
      name: 'Tabs Project',
      metadata: { kind: 'prototype' },
      pendingPrompt: null,
    });

    const response = await fetch(`${started.url}/api/projects/${projectId}/tabs`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabs: [], active: null, browserTabs: [], designFilesTabHidden: 'yes' }),
    });
    expect(response.status).toBe(400);
  }, 60_000);
});

async function startIsolatedServer(root: string): Promise<StartedServer> {
  process.env.OD_DATA_DIR = root;
  if (!serverModule) {
    vi.resetModules();
    serverModule = await import('../src/server.js') as unknown as ServerModule;
  }
  return await serverModule.startServer({ port: 0, returnServer: true });
}

async function stopServer(): Promise<void> {
  const current = started;
  started = null;
  if (!current) return;
  await Promise.resolve(current.shutdown?.());
  current.server.closeAllConnections?.();
  current.server.closeIdleConnections?.();
  await new Promise<void>((resolve) => current.server.close(() => resolve()));
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return await response.json() as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return await response.json() as T;
}
