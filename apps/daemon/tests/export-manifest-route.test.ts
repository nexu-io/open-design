import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('project export manifest route', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];

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
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject(): Promise<string> {
    const id = `export-manifest-${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Export manifest project',
        metadata: { kind: 'prototype', entryFile: 'index.html' },
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

  it('rejects invalid project ids before listing files', async () => {
    const response = await fetch(`${baseUrl}/api/projects/bad:id/export/manifest`);
    expect(response.status).toBe(400);
  });
});
