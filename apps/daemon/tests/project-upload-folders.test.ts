import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('project folder upload route', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function createProject() {
    const id = `folder-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project: { id: string } };
    return body.project.id;
  }

  it('preserves browser folder relative paths in the project', async () => {
    const projectId = await createProject();
    const form = new FormData();
    form.append('paths', 'demo/src/Button.tsx');
    form.append('files', new File(['component'], 'Button.tsx', { type: 'text/plain' }));

    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: form,
    });

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      files: Array<{ name: string; path?: string; originalName?: string }>;
    };
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({
      name: 'demo/src/Button.tsx',
      path: 'demo/src/Button.tsx',
      originalName: 'Button.tsx',
    });

    const raw = await fetch(`${baseUrl}/api/projects/${projectId}/raw/demo/src/Button.tsx`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe('component');
  });

  it('rejects sensitive folder paths before exposing them as project files', async () => {
    const projectId = await createProject();
    const form = new FormData();
    form.append('paths', 'demo/.env.local');
    form.append('files', new File(['placeholder=value'], '.env.local', { type: 'text/plain' }));

    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: form,
    });

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(JSON.stringify(body)).toContain('sensitive or generated folder files are not accepted');

    const raw = await fetch(`${baseUrl}/api/projects/${projectId}/raw/demo/.env.local`);
    expect(raw.status).toBe(404);
  });
});
