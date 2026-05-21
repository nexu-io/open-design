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

  it('does not overwrite an existing project file when the same folder path is uploaded again', async () => {
    const projectId = await createProject();
    const firstForm = new FormData();
    firstForm.append('paths', 'demo/src/App.tsx');
    firstForm.append('files', new File(['first'], 'App.tsx', { type: 'text/plain' }));

    const firstResp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: firstForm,
    });
    expect(firstResp.status).toBe(200);

    const secondForm = new FormData();
    secondForm.append('paths', 'demo/src/App.tsx');
    secondForm.append('files', new File(['second'], 'App.tsx', { type: 'text/plain' }));

    const secondResp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: secondForm,
    });

    expect(secondResp.status).toBe(409);
    const body = (await secondResp.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(body.error?.code).toBe('CONFLICT');
    expect(body.error?.message).toContain('demo/src/App.tsx');

    const raw = await fetch(`${baseUrl}/api/projects/${projectId}/raw/demo/src/App.tsx`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe('first');

    const filesResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    expect(filesResp.status).toBe(200);
    const filesBody = (await filesResp.json()) as {
      files: Array<{ name: string; path?: string }>;
    };
    expect(filesBody.files.map((file) => file.path ?? file.name).sort()).toEqual(['demo/src/App.tsx']);
  });

  it('rejects a conflicting folder batch before writing later files', async () => {
    const projectId = await createProject();
    const firstForm = new FormData();
    firstForm.append('paths', 'demo/src/App.tsx');
    firstForm.append('files', new File(['first'], 'App.tsx', { type: 'text/plain' }));

    const firstResp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: firstForm,
    });
    expect(firstResp.status).toBe(200);

    const secondForm = new FormData();
    secondForm.append('paths', 'demo/src/App.tsx');
    secondForm.append('paths', 'demo/src/Later.tsx');
    secondForm.append('files', new File(['second'], 'App.tsx', { type: 'text/plain' }));
    secondForm.append('files', new File(['later'], 'Later.tsx', { type: 'text/plain' }));

    const secondResp = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: secondForm,
    });

    expect(secondResp.status).toBe(409);
    const error = (await secondResp.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(error.error?.code).toBe('CONFLICT');
    expect(error.error?.message).toContain('demo/src/App.tsx');

    const original = await fetch(`${baseUrl}/api/projects/${projectId}/raw/demo/src/App.tsx`);
    expect(original.status).toBe(200);
    expect(await original.text()).toBe('first');

    const later = await fetch(`${baseUrl}/api/projects/${projectId}/raw/demo/src/Later.tsx`);
    expect(later.status).toBe(404);

    const filesResp = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
    expect(filesResp.status).toBe(200);
    const filesBody = (await filesResp.json()) as {
      files: Array<{ name: string; path?: string }>;
    };
    expect(filesBody.files.map((file) => file.path ?? file.name).sort()).toEqual(['demo/src/App.tsx']);
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
