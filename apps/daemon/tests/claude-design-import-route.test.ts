import type http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('POST /api/import/claude-design', () => {
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

  afterEach(async () => {
    await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectLocations: [], defaultProjectLocationId: null }),
    }).catch(() => {});
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  function makeTempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-claude-import-route-'));
    tempDirs.push(dir);
    return dir;
  }

  async function makeClaudeDesignZip(): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file('index.html', '<!doctype html><h1>Imported</h1>');
    zip.file('styles/app.css', 'body { color: #123456; }');
    return zip.generateAsync({ type: 'uint8array' });
  }

  async function putProjectLocations(locations: Array<{ id: string; name: string; path: string }>): Promise<void> {
    const resp = await fetch(`${baseUrl}/api/project-locations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
    expect(resp.status).toBe(200);
  }

  async function putDefaultProjectLocation(locationId: string): Promise<void> {
    const resp = await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultProjectLocationId: locationId }),
    });
    expect(resp.status).toBe(200);
  }

  it('imports Claude ZIP projects into the configured default project location', async () => {
    const externalRoot = makeTempDir();
    const locationId = 'claude-import-default';
    await putProjectLocations([{ id: locationId, name: 'Claude imports', path: externalRoot }]);
    await putDefaultProjectLocation(locationId);

    const form = new FormData();
    const zipBytes = await makeClaudeDesignZip();
    form.append('file', new Blob([zipBytes], { type: 'application/zip' }), 'Claude Export.zip');

    const resp = await fetch(`${baseUrl}/api/import/claude-design`, {
      method: 'POST',
      body: form,
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      project: {
        id: string;
        metadata?: {
          baseDir?: string;
          entryFile?: string;
          importedFrom?: string;
          projectLocationId?: string;
        };
      };
      entryFile: string;
    };

    const expectedProjectDir = await realpath(path.join(externalRoot, body.project.id));
    expect(body.entryFile).toBe('index.html');
    expect(body.project.metadata?.baseDir).toBe(expectedProjectDir);
    expect(body.project.metadata?.importedFrom).toBe('claude-design');
    expect(body.project.metadata?.projectLocationId).toBe(locationId);
    await expect(readFile(path.join(expectedProjectDir, 'index.html'), 'utf8')).resolves.toContain('Imported');

    const manifest = JSON.parse(await readFile(path.join(expectedProjectDir, '.open-design', 'project.json'), 'utf8'));
    expect(manifest.id).toBe(body.project.id);
    await expect(stat(path.join(expectedProjectDir, 'styles', 'app.css'))).resolves.toMatchObject({ size: expect.any(Number) });
  });
});
