import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { PROJECT_MANIFEST_RELATIVE_PATH } from '../src/project-locations.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

interface ProjectLocationsBody {
  locations: Array<{ id: string; name: string; builtIn?: boolean; path: string }>;
}

const dataDir = process.env.OD_DATA_DIR as string;

function authHeaders(email: string): Record<string, string> {
  return { [DEFAULT_TRUSTED_EMAIL_HEADER]: email };
}

function jsonAuthHeaders(email: string): Record<string, string> {
  return {
    ...authHeaders(email),
    'content-type': 'application/json',
  };
}

async function readProjectLocations(baseUrl: string, email: string): Promise<ProjectLocationsBody> {
  const response = await fetch(`${baseUrl}/api/project-locations`, {
    headers: authHeaders(email),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as ProjectLocationsBody;
}

describe('project locations auth context', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalMultitenant: string | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    originalMultitenant = process.env.OD_MULTITENANT;
    process.env.OD_MULTITENANT = '1';
    const started = (await startServer({
      port: 0,
      returnServer: true,
    })) as StartedServer;
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    if (originalMultitenant === undefined) delete process.env.OD_MULTITENANT;
    else process.env.OD_MULTITENANT = originalMultitenant;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
    await fsp.rm(path.join(dataDir, 'app-config.json'), { force: true });
  });

  function makeTempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-project-loc-auth-'));
    tempDirs.push(dir);
    return dir;
  }

  function uniqueId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function writeLocationProject(locationDir: string, projectId: string, name: string): Promise<void> {
    const projectDir = path.join(locationDir, projectId);
    await fsp.mkdir(path.dirname(path.join(projectDir, PROJECT_MANIFEST_RELATIVE_PATH)), { recursive: true });
    await fsp.writeFile(
      path.join(projectDir, PROJECT_MANIFEST_RELATIVE_PATH),
      JSON.stringify({
        schemaVersion: 1,
        id: projectId,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      'utf8',
    );
  }

  it('stores external project locations under the authenticated user data dir', async () => {
    const aliceDir = makeTempDir();
    const bobDir = makeTempDir();

    const aliceWrite = await fetch(`${baseUrl}/api/project-locations`, {
      method: 'PUT',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({
        locations: [{ id: 'alice-ext', name: 'Alice external', path: aliceDir }],
      }),
    });
    expect(aliceWrite.status).toBe(200);

    const bobBefore = await readProjectLocations(baseUrl, 'bob@example.com');
    expect(bobBefore.locations.map((location) => location.id)).toEqual(['default']);

    const bobWrite = await fetch(`${baseUrl}/api/project-locations`, {
      method: 'PUT',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({
        locations: [{ id: 'bob-ext', name: 'Bob external', path: bobDir }],
      }),
    });
    expect(bobWrite.status).toBe(200);

    const aliceAfter = await readProjectLocations(baseUrl, 'alice@example.com');
    expect(aliceAfter.locations.map((location) => location.id)).toEqual(['default', 'alice-ext']);

    const bobAfter = await readProjectLocations(baseUrl, 'bob@example.com');
    expect(bobAfter.locations.map((location) => location.id)).toEqual(['default', 'bob-ext']);
  });

  it('allows different authenticated owners to create the same requested project id', async () => {
    const requestedId = uniqueId('shared-project');

    const aliceCreate = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({ id: requestedId, name: 'Shared client id' }),
    });
    expect(aliceCreate.status).toBe(200);
    const aliceBody = (await aliceCreate.json()) as { project: { id: string } };

    const bobCreate = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({ id: requestedId, name: 'Shared client id' }),
    });
    expect(bobCreate.status).toBe(200);
    const bobBody = (await bobCreate.json()) as { project: { id: string } };

    expect(aliceBody.project.id).not.toBe(bobBody.project.id);

    const aliceProjects = await fetch(`${baseUrl}/api/projects`, {
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceProjects.status).toBe(200);
    const aliceProjectsBody = (await aliceProjects.json()) as { projects: Array<{ id: string }> };
    expect(aliceProjectsBody.projects.map((project) => project.id)).toContain(aliceBody.project.id);
    expect(aliceProjectsBody.projects.map((project) => project.id)).not.toContain(bobBody.project.id);
  });

  it('allows different authenticated owners to scan the same manifest project id', async () => {
    const manifestId = uniqueId('shared-scan-project');
    const aliceDir = makeTempDir();
    const bobDir = makeTempDir();
    await writeLocationProject(aliceDir, manifestId, 'Alice shared manifest');
    await writeLocationProject(bobDir, manifestId, 'Bob shared manifest');

    const aliceLocation = await fetch(`${baseUrl}/api/project-locations`, {
      method: 'PUT',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({
        locations: [{ id: 'alice-scan-ext', name: 'Alice scan', path: aliceDir }],
      }),
    });
    expect(aliceLocation.status).toBe(200);

    const bobLocation = await fetch(`${baseUrl}/api/project-locations`, {
      method: 'PUT',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({
        locations: [{ id: 'bob-scan-ext', name: 'Bob scan', path: bobDir }],
      }),
    });
    expect(bobLocation.status).toBe(200);

    const aliceScan = await fetch(`${baseUrl}/api/project-locations/scan`, {
      method: 'POST',
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceScan.status).toBe(200);
    const aliceScanBody = (await aliceScan.json()) as { imported: Array<{ id: string }> };
    expect(aliceScanBody.imported).toHaveLength(1);

    const bobScan = await fetch(`${baseUrl}/api/project-locations/scan`, {
      method: 'POST',
      headers: authHeaders('bob@example.com'),
    });
    expect(bobScan.status).toBe(200);
    const bobScanBody = (await bobScan.json()) as { imported: Array<{ id: string }> };
    expect(bobScanBody.imported).toHaveLength(1);
    expect(bobScanBody.imported[0]?.id).not.toBe(aliceScanBody.imported[0]?.id);
  });

  it('hides imported-folder project files from other authenticated owners', async () => {
    const bobFolder = makeTempDir();
    await fsp.writeFile(path.join(bobFolder, 'secret.txt'), 'bob external secret');

    const importResponse = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({ baseDir: bobFolder }),
    });
    expect(importResponse.status).toBe(200);
    const importBody = (await importResponse.json()) as {
      project: { id: string; metadata?: { baseDir?: string } };
    };
    expect(importBody.project.metadata?.baseDir).toBeTruthy();

    const bobRead = await fetch(`${baseUrl}/api/projects/${importBody.project.id}/raw/secret.txt`, {
      headers: authHeaders('bob@example.com'),
    });
    expect(bobRead.status).toBe(200);
    await expect(bobRead.text()).resolves.toBe('bob external secret');

    const aliceRead = await fetch(`${baseUrl}/api/projects/${importBody.project.id}/raw/secret.txt`, {
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceRead.status).toBe(404);
    await expect(aliceRead.json()).resolves.toMatchObject({
      error: { code: 'PROJECT_NOT_FOUND' },
    });
  });
});
