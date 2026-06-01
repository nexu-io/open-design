import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile as writeFsFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('project export manifest route', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];
  const tempDirs: string[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      await fetch(`${baseUrl}/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeFolder(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-export-manifest-'));
    tempDirs.push(dir);
    return dir;
  }

  async function withSandboxMode<T>(run: () => Promise<T>): Promise<T> {
    const previous = process.env.OD_SANDBOX_MODE;
    process.env.OD_SANDBOX_MODE = '1';
    try {
      return await run();
    } finally {
      if (previous == null) delete process.env.OD_SANDBOX_MODE;
      else process.env.OD_SANDBOX_MODE = previous;
    }
  }

  async function createProject(
    metadata: Record<string, unknown> = { kind: 'prototype', entryFile: 'index.html' },
  ): Promise<string> {
    const id = `export-manifest-${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Export manifest project',
        metadata,
      }),
    });
    expect(response.ok).toBe(true);
    projectsToClean.push(id);
    return id;
  }

  async function writeFile(projectId: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.ok).toBe(true);
  }

  async function renameFile(projectId: string, from: string, to: string): Promise<void> {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files/rename`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    expect(response.ok).toBe(true);
  }

  it('lists exportable project files and artifact sidecar metadata without exposing sidecars', async () => {
    const projectId = await createProject();
    await writeFile(projectId, {
      name: 'styles.css',
      content: 'body { color: black; }',
    });
    await writeFile(projectId, {
      name: 'assets/logo.svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    await writeFile(projectId, {
      name: 'index.html',
      content: '<!doctype html><link rel="stylesheet" href="styles.css">',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Reviewed prototype',
        entry: 'index.html',
        renderer: 'html',
        status: 'complete',
        exports: ['html', 'zip'],
        primary: true,
        supportingFiles: ['styles.css', 'assets/logo.svg', 'missing.png'],
        updatedAt: '2026-05-28T00:00:00.000Z',
      },
    });

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/export/manifest`);
    expect(response.ok).toBe(true);
    const body = await response.json() as {
      schema: string;
      projectId: string;
      entryFile: string;
      files: Array<{ name: string; role: string; reasons: string[]; artifactManifest?: unknown }>;
      artifacts: Array<{ file: string; title: string; supportingFiles: string[] }>;
    };

    expect(body).toMatchObject({
      schema: 'open-design.project-export-manifest.v1',
      projectId,
      entryFile: 'index.html',
    });
    expect(body.files.map((file) => file.name)).toEqual([
      'assets/logo.svg',
      'index.html',
      'styles.css',
    ]);
    expect(body.files.find((file) => file.name === 'index.html')).toMatchObject({
      role: 'entry',
      reasons: expect.arrayContaining(['artifact-manifest', 'project-entry-file']),
    });
    expect(body.files.find((file) => file.name === 'styles.css')).toMatchObject({
      role: 'supporting',
      reasons: ['artifact-supporting-file'],
    });
    expect(body.artifacts).toMatchObject([
      {
        file: 'index.html',
        title: 'Reviewed prototype',
        supportingFiles: ['assets/logo.svg', 'styles.css'],
      },
    ]);
    expect(body.files.some((file) => file.name.endsWith('.artifact.json'))).toBe(false);
  });

  it('uses artifact primary strings as project-relative entry refs', async () => {
    const projectId = await createProject({ kind: 'prototype' });
    await writeFile(projectId, {
      name: 'reviewed.html',
      content: '<!doctype html><main>reviewed</main>',
    });
    await writeFile(projectId, {
      name: 'preview/wrapper.html',
      content: '<!doctype html><iframe src="../reviewed.html"></iframe>',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Review wrapper',
        renderer: 'html',
        status: 'complete',
        exports: ['html'],
        primary: 'reviewed.html',
      },
    });

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/export/manifest`);
    expect(response.ok).toBe(true);
    const body = await response.json() as {
      entryFile: string;
      files: Array<{ name: string; role: string; reasons: string[] }>;
    };

    expect(body.entryFile).toBe('reviewed.html');
    expect(body.files.find((file) => file.name === 'reviewed.html')).toMatchObject({
      role: 'entry',
      reasons: expect.arrayContaining(['artifact-primary', 'project-entry-file']),
    });
  });

  it('uses artifact entry strings as project-relative entry refs without primary hints', async () => {
    const projectId = await createProject({ kind: 'prototype' });
    await writeFile(projectId, {
      name: 'index.html',
      content: '<!doctype html><main>fallback</main>',
    });
    await writeFile(projectId, {
      name: 'reviewed.html',
      content: '<!doctype html><main>reviewed</main>',
    });
    await writeFile(projectId, {
      name: 'preview/wrapper.html',
      content: '<!doctype html><iframe src="../reviewed.html"></iframe>',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Review wrapper',
        entry: 'reviewed.html',
        renderer: 'html',
        status: 'complete',
        exports: ['html'],
      },
    });

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/export/manifest`);
    expect(response.ok).toBe(true);
    const body = await response.json() as {
      entryFile: string;
      files: Array<{ name: string; role: string; reasons: string[] }>;
    };

    expect(body.entryFile).toBe('reviewed.html');
    expect(body.files.find((file) => file.name === 'reviewed.html')).toMatchObject({
      role: 'entry',
      reasons: expect.arrayContaining(['artifact-entry', 'project-entry-file']),
    });
  });

  it('keeps artifact entry refs current when a referenced file is renamed', async () => {
    const projectId = await createProject({ kind: 'prototype' });
    await writeFile(projectId, {
      name: 'index.html',
      content: '<!doctype html><main>fallback</main>',
    });
    await writeFile(projectId, {
      name: 'reviewed.html',
      content: '<!doctype html><main>reviewed</main>',
    });
    await writeFile(projectId, {
      name: 'preview/wrapper.html',
      content: '<!doctype html><iframe src="../reviewed.html"></iframe>',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Review wrapper',
        entry: 'reviewed.html',
        renderer: 'html',
        status: 'complete',
        exports: ['html'],
        primary: 'reviewed.html',
        supportingFiles: ['reviewed.html'],
      },
    });

    await renameFile(projectId, 'reviewed.html', 'reviewed-renamed.html');

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/export/manifest`);
    expect(response.ok).toBe(true);
    const body = await response.json() as {
      entryFile: string;
      files: Array<{ name: string; role: string; reasons: string[] }>;
    };

    expect(body.entryFile).toBe('reviewed-renamed.html');
    expect(body.files.find((file) => file.name === 'reviewed-renamed.html')).toMatchObject({
      role: 'entry',
      reasons: expect.arrayContaining(['artifact-entry', 'artifact-primary', 'project-entry-file']),
    });

    const filesResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    expect(filesResponse.ok).toBe(true);
    const filesBody = await filesResponse.json() as {
      files: Array<{
        name: string;
        artifactManifest?: {
          entry?: string;
          primary?: string | boolean;
          supportingFiles?: string[];
        };
      }>;
    };
    expect(filesBody.files.find((file) => file.name === 'preview/wrapper.html')?.artifactManifest)
      .toMatchObject({
        entry: 'reviewed-renamed.html',
        primary: 'reviewed-renamed.html',
        supportingFiles: ['reviewed-renamed.html'],
      });
  });

  it('keeps artifact entry refs current when a referenced file moves out of the wrapper directory', async () => {
    const projectId = await createProject({ kind: 'prototype' });
    await writeFile(projectId, {
      name: 'index.html',
      content: '<!doctype html><main>fallback</main>',
    });
    await writeFile(projectId, {
      name: 'preview/reviewed.html',
      content: '<!doctype html><main>reviewed</main>',
    });
    await writeFile(projectId, {
      name: 'preview/wrapper.html',
      content: '<!doctype html><iframe src="reviewed.html"></iframe>',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Review wrapper',
        entry: 'reviewed.html',
        renderer: 'html',
        status: 'complete',
        exports: ['html'],
        primary: 'reviewed.html',
        supportingFiles: ['reviewed.html'],
      },
    });

    await renameFile(projectId, 'preview/reviewed.html', 'reviewed.html');

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/export/manifest`);
    expect(response.ok).toBe(true);
    const body = await response.json() as {
      entryFile: string;
      files: Array<{ name: string; role: string; reasons: string[] }>;
      artifacts: Array<{ file: string; supportingFiles: string[] }>;
    };

    expect(body.entryFile).toBe('reviewed.html');
    expect(body.files.find((file) => file.name === 'reviewed.html')).toMatchObject({
      role: 'entry',
      reasons: expect.arrayContaining([
        'artifact-entry',
        'artifact-primary',
        'artifact-supporting-file',
        'project-entry-file',
      ]),
    });
    expect(body.artifacts.find((artifact) => artifact.file === 'preview/wrapper.html'))
      .toMatchObject({
        supportingFiles: ['reviewed.html'],
      });
  });

  it('rejects invalid project ids before listing files', async () => {
    const response = await fetch(`${baseUrl}/api/projects/bad:id/export/manifest`);
    expect(response.status).toBe(400);
  });

  it('rejects imported-folder projects in sandbox mode instead of returning an empty manifest', async () => {
    const folder = makeFolder();
    await writeFsFile(path.join(folder, 'index.html'), '<!doctype html>');

    const importResponse = await fetch(`${baseUrl}/api/import/folder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseDir: folder }),
    });
    expect(importResponse.status).toBe(200);
    const importBody = (await importResponse.json()) as { project: { id: string } };
    projectsToClean.push(importBody.project.id);

    await withSandboxMode(async () => {
      const response = await fetch(`${baseUrl}/api/projects/${importBody.project.id}/export/manifest`);
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/imported-folder projects.*OD_SANDBOX_MODE/i);
    });
  });
});
