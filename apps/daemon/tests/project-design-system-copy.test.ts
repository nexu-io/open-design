import type { Server } from 'node:http';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
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

describe('project design-system copy route', () => {
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

  it('duplicates a regular project into a design-system workspace with source context', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-project-ds-copy-'));
    started = await startIsolatedServer(dataDir);

    const sourceId = `source-${Date.now()}`;
    const created = await postJson<{ project: { id: string } }>(`${started.url}/api/projects`, {
      id: sourceId,
      name: 'Landing Experiment',
      metadata: { kind: 'prototype' },
      pendingPrompt: 'Original project prompt',
    });
    expect(created.project.id).toBe(sourceId);

    await postJson(`${started.url}/api/projects/${sourceId}/files`, {
      name: 'index.html',
      content: '<!doctype html><title>Landing</title><main>Real source artifact</main>',
    });
    await postJson(`${started.url}/api/projects/${sourceId}/files`, {
      name: 'refs/brand.md',
      content: '# Brand reference\nUse quiet work surfaces.',
    });

    const copied = await postJson<{
      project: {
        id: string;
        name: string;
        designSystemId: string;
        pendingPrompt: string;
        metadata: Record<string, unknown>;
      };
      conversationId: string;
      designSystemId: string;
      copiedFiles: string[];
    }>(`${started.url}/api/projects/${sourceId}/design-system-copy`, {
      name: 'Landing Experiment Design System',
    });

    expect(copied.project.id).not.toBe(sourceId);
    expect(copied.project.name).toBe('Landing Experiment Design System');
    expect(copied.project.designSystemId).toMatch(/^user:/);
    expect(copied.designSystemId).toBe(copied.project.designSystemId);
    expect(copied.conversationId).toBeTruthy();
    expect(copied.project.pendingPrompt).toContain('complete Open Design design system');
    expect(copied.project.pendingPrompt).toContain('context/source-context.md');
    expect(copied.project.pendingPrompt).toContain('refs/brand.md');
    expect(copied.project.metadata).toMatchObject({
      kind: 'other',
      importedFrom: 'design-system',
      entryFile: 'DESIGN.md',
      sourceProjectId: sourceId,
      sourceProjectName: 'Landing Experiment',
    });
    expect(copied.copiedFiles).toEqual(expect.arrayContaining(['index.html', 'refs/brand.md']));

    const copiedHtml = await fetchText(`${started.url}/api/projects/${copied.project.id}/raw/index.html`);
    expect(copiedHtml).toContain('Real source artifact');

    const sourceContext = await fetchText(
      `${started.url}/api/projects/${copied.project.id}/raw/context/source-context.md`,
    );
    expect(sourceContext).toContain(`Source project id: ${sourceId}`);
    expect(sourceContext).toContain('- index.html');
    expect(sourceContext).toContain('- refs/brand.md');

    const systems = await fetchJson<{
      designSystems: Array<{ id: string; projectId?: string }>;
    }>(`${started.url}/api/design-systems`);
    expect(systems.designSystems).toContainEqual(
      expect.objectContaining({
        id: copied.designSystemId,
        projectId: copied.project.id,
      }),
    );
  }, 60_000);

  it('fails design-system workspace creation when a source file cannot be copied', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-project-ds-copy-fail-'));
    started = await startIsolatedServer(dataDir);

    const sourceId = `source-fail-${Date.now()}`;
    await postJson(`${started.url}/api/projects`, {
      id: sourceId,
      name: 'Broken Evidence Project',
      metadata: { kind: 'prototype' },
      pendingPrompt: 'Original project prompt',
    });
    await postJson(`${started.url}/api/projects/${sourceId}/files`, {
      name: 'index.html',
      content: '<!doctype html><title>Landing</title><main>Readable source artifact</main>',
    });
    await postJson(`${started.url}/api/projects/${sourceId}/files`, {
      name: 'refs/unreadable.md',
      content: '# Hidden evidence\nThis file must not be silently skipped.',
    });
    await chmod(join(dataDir, 'projects', sourceId, 'refs', 'unreadable.md'), 0o000);

    const response = await fetch(`${started.url}/api/projects/${sourceId}/design-system-copy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Broken Evidence Design System' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: { message?: string } };
    expect(body.error?.message).toContain('unreadable.md');

    const projects = await fetchJson<{ projects: Array<{ id: string; name: string }> }>(
      `${started.url}/api/projects`,
    );
    expect(projects.projects).toContainEqual(expect.objectContaining({ id: sourceId }));
    expect(projects.projects).not.toContainEqual(
      expect.objectContaining({ name: 'Broken Evidence Design System' }),
    );

    const systems = await fetchJson<{ designSystems: Array<{ title: string }> }>(
      `${started.url}/api/design-systems`,
    );
    expect(systems.designSystems).not.toContainEqual(
      expect.objectContaining({ title: 'Broken Evidence Design System' }),
    );
  }, 60_000);

  it('duplicates a project without replaying the source pending prompt', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-project-copy-'));
    started = await startIsolatedServer(dataDir);

    const sourceId = `source-copy-${Date.now()}`;
    await postJson(`${started.url}/api/projects`, {
      id: sourceId,
      name: 'Dashboard Draft',
      metadata: { kind: 'prototype' },
      pendingPrompt: 'Run this only in the original project',
      customInstructions: 'Keep density high.',
    });
    await postJson(`${started.url}/api/projects/${sourceId}/files`, {
      name: 'index.html',
      content: '<!doctype html><title>Dashboard</title><main>Metrics</main>',
    });
    await postJson(`${started.url}/api/projects/${sourceId}/files`, {
      name: 'notes/context.md',
      content: '# Context\nOperational dashboard.',
    });
    await fetch(`${started.url}/api/projects/${sourceId}/tabs`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tabs: ['index.html'], active: 'index.html', browserTabs: [] }),
    }).then((response) => expect(response.status).toBe(200));

    const copied = await postJson<{
      project: {
        id: string;
        name: string;
        pendingPrompt?: string | null;
        metadata: Record<string, unknown>;
        customInstructions?: string | null;
      };
      conversationId: string;
      copiedFiles: string[];
    }>(`${started.url}/api/projects/${sourceId}/duplicate`, {});

    expect(copied.project.id).not.toBe(sourceId);
    expect(copied.project.name).toBe('Dashboard Draft Copy');
    expect(copied.project.pendingPrompt).toBeFalsy();
    expect(copied.project.customInstructions).toBe('Keep density high.');
    expect(copied.project.metadata).toMatchObject({
      kind: 'prototype',
      sourceProjectId: sourceId,
      sourceProjectName: 'Dashboard Draft',
    });
    expect(copied.project.metadata).not.toHaveProperty('baseDir');
    expect(copied.copiedFiles).toEqual(expect.arrayContaining(['index.html', 'notes/context.md']));

    const copiedHtml = await fetchText(`${started.url}/api/projects/${copied.project.id}/raw/index.html`);
    expect(copiedHtml).toContain('Metrics');
    const copiedTabs = await fetchJson<{ tabs: string[]; active: string | null }>(
      `${started.url}/api/projects/${copied.project.id}/tabs`,
    );
    expect(copiedTabs.tabs).toEqual(['index.html']);
    expect(copiedTabs.active).toBe('index.html');
  }, 60_000);

  it('rejects generic duplication for design-system-like projects', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-project-copy-brand-'));
    started = await startIsolatedServer(dataDir);

    const sourceId = `source-brand-${Date.now()}`;
    await postJson(`${started.url}/api/projects`, {
      id: sourceId,
      name: 'Brand Workspace',
      metadata: {
        kind: 'brand',
        importedFrom: 'brand-extraction',
        brandId: 'brand-workspace',
        brandDesignSystemId: 'user:brand-workspace',
      },
      pendingPrompt: null,
    });
    await postJson(`${started.url}/api/projects/${sourceId}/files`, {
      name: 'brand.html',
      content: '<!doctype html><title>Brand workspace</title>',
    });

    const response = await fetch(`${started.url}/api/projects/${sourceId}/duplicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Brand Workspace Copy' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('PROJECT_ALREADY_DESIGN_SYSTEM');
    expect(body.error?.message).toContain('design-system workspace');

    const projects = await fetchJson<{ projects: Array<{ id: string; name: string }> }>(
      `${started.url}/api/projects`,
    );
    expect(projects.projects).toContainEqual(expect.objectContaining({ id: sourceId }));
    expect(projects.projects).not.toContainEqual(expect.objectContaining({ name: 'Brand Workspace Copy' }));
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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return await response.text();
}
