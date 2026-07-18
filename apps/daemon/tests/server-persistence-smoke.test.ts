import type { Server } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};
type ServerModule = {
  startServer: (options: {
    port: number;
    returnServer: boolean;
  }) => Promise<StartedServer>;
};

let started: StartedServer | null = null;
let dataDir: string | null = null;
let serverModule: ServerModule | null = null;
const originalDataDir = process.env.OD_DATA_DIR;

afterEach(async () => {
  await stopServer();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
  dataDir = null;
  if (originalDataDir === undefined) delete process.env.OD_DATA_DIR;
  else process.env.OD_DATA_DIR = originalDataDir;
  serverModule = null;
  vi.resetModules();
}, 30_000);

it('[P0] starts on an existing data dir with legacy app config and persisted projects', async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'od-server-persistence-smoke-'));
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'app-config.json'), JSON.stringify({
    agentId: 'claude',
    agentModels: { claude: { model: 'claude-legacy-config-smoke' } },
    onboardingCompleted: true,
    legacyUnknownPreference: { migratedFrom: '0.9.x' },
  }), 'utf8');

  started = await startIsolatedServer(dataDir);
  const firstConfig = await fetchJson<{ config: Record<string, unknown> }>(
    `${started.url}/api/app-config`,
  );
  expect(firstConfig.config).toMatchObject({
    agentId: 'claude',
    agentModels: { claude: { model: 'claude-legacy-config-smoke' } },
  });

  const projectId = `persisted-project-${Date.now()}`;
  const projectResponse = await fetch(`${started.url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Persisted startup smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);

  await stopServer();
  started = await startIsolatedServer(dataDir);

  const health = await fetchJson<{ ok: boolean }>(`${started.url}/api/health`);
  expect(health).toMatchObject({ ok: true });

  const projects = await fetchJson<{ projects: Array<{ id: string; name: string }> }>(
    `${started.url}/api/projects`,
  );
  expect(projects.projects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: projectId, name: 'Persisted startup smoke' }),
    ]),
  );

  const secondConfig = await fetchJson<{ config: Record<string, unknown> }>(
    `${started.url}/api/app-config`,
  );
  expect(secondConfig.config).toMatchObject({
    agentId: 'claude',
    agentModels: { claude: { model: 'claude-legacy-config-smoke' } },
  });
}, 60_000);

async function startIsolatedServer(root: string): Promise<StartedServer> {
  process.env.OD_DATA_DIR = root;
  if (!serverModule) {
    vi.resetModules();
    serverModule = await loadServerModule();
  }
  const module = serverModule;
  return await module.startServer({ port: 0, returnServer: true });
}

async function loadServerModule(): Promise<ServerModule> {
  return await import('../src/server.js') as unknown as ServerModule;
}

async function stopServer(): Promise<void> {
  const current = started;
  started = null;
  if (!current) return;
  await withTimeout(Promise.resolve(current.shutdown?.()), 8_000);
  if (current.server) {
    current.server.closeAllConnections?.();
    current.server.closeIdleConnections?.();
    await withTimeout(
      new Promise<void>((resolve) => current.server.close(() => resolve())),
      8_000,
    );
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return await response.json() as T;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
