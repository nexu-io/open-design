/**
 * Coverage for `GET /api/projects/:id`. The route was extended (#451) to
 * include a derived `resolvedDir` field so the web client can address the
 * on-disk working directory directly without reconstructing it from the
 * daemon's internal projects root. Two cases:
 *   1. Folder-imported project — `resolvedDir === metadata.baseDir`.
 *   2. Native project — `resolvedDir === path.join(<projects root>, id)`.
 *
 * Pre-existing daemon test files cover specific subdomains
 * (folder-import-projects, project-status, project-watchers, ...);
 * none own this route, so a dedicated `projects-routes` file is cleaner
 * than expanding any of them.
 */
import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('GET /api/projects/:id resolvedDir', () => {
  let server: http.Server;
  let baseUrl: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeFolder(): string {
    const d = mkdtempSync(path.join(tmpdir(), 'od-projects-routes-'));
    tempDirs.push(d);
    return d;
  }

  it('returns resolvedDir === metadata.baseDir for an imported-folder project', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResp = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDir: folder }),
    });
    expect(importResp.status).toBe(200);
    const importBody = (await importResp.json()) as {
      project: { id: string; metadata?: { baseDir?: string } };
    };
    const projectId = importBody.project.id;
    const baseDir = importBody.project.metadata?.baseDir;
    expect(baseDir).toBeTruthy();

    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as {
      project: { id: string };
      resolvedDir: string;
    };
    expect(detail.project.id).toBe(projectId);
    expect(detail.resolvedDir).toBe(baseDir);
  });

  it('returns resolvedDir under <projects root>/<id> for a native project', async () => {
    const projectId = `proj-routes-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const detailResp = await fetch(`${baseUrl}/api/projects/${projectId}`);
    expect(detailResp.status).toBe(200);
    const detail = (await detailResp.json()) as {
      project: { id: string; metadata?: { baseDir?: string } };
      resolvedDir: string;
    };
    expect(detail.project.metadata?.baseDir).toBeUndefined();

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const expected = path.join(dataDir, 'projects', projectId);
    expect(detail.resolvedDir).toBe(expected);
    expect(path.isAbsolute(detail.resolvedDir)).toBe(true);
  });

  it('returns 404 with PROJECT_NOT_FOUND for unknown ids', async () => {
    const resp = await fetch(`${baseUrl}/api/projects/does-not-exist-${Date.now()}`);
    expect(resp.status).toBe(404);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('PROJECT_NOT_FOUND');
  });

  // PR #974: `fromTrustedPicker` is privileged the same way `baseDir`
  // is — only the HMAC-gated POST /api/import/folder may set it. POST
  // /api/projects (the generic create endpoint) and PATCH
  // /api/projects/:id must reject any client-supplied attempt to
  // acquire or flip the marker, otherwise a compromised renderer could
  // mark a previously-untrusted folder-imported project as trusted and
  // re-open the openPath bypass.
  it('rejects fromTrustedPicker on POST /api/projects', async () => {
    const projectId = `proj-trusted-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Smuggled trust',
        skillId: null,
        designSystemId: null,
        metadata: { kind: 'prototype', fromTrustedPicker: true },
      }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/fromTrustedPicker/i);
  });

  it('rejects fromTrustedPicker on PATCH /api/projects/:id', async () => {
    // Create a vanilla native project, then try to PATCH the
    // trusted-picker marker onto it. The handler must refuse —
    // PATCHing privileged metadata fields is the same threat surface
    // as setting them on creation.
    const projectId = `proj-trusted-patch-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Native fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createResp.status).toBe(200);

    const patchResp = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { kind: 'prototype', fromTrustedPicker: true } }),
    });
    expect(patchResp.status).toBe(400);
    const body = (await patchResp.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('BAD_REQUEST');
    expect(body.error?.message).toMatch(/fromTrustedPicker/i);
  });
});
