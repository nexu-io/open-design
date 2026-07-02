import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('project upload filenames', () => {
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

  async function createProject(): Promise<string> {
    const id = `upload-names-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { project: { id: string } };
    return body.project.id;
  }

  async function upload(projectId: string, files: Array<{ name: string; body: string }>) {
    const form = new FormData();
    for (const file of files) {
      form.append('files', new Blob([file.body], { type: 'text/plain' }), file.name);
    }
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(200);
    return (await response.json()) as {
      files: Array<{ name: string; path: string; originalName: string }>;
    };
  }

  it('preserves uploaded source filenames and suffixes only duplicates', async () => {
    const projectId = await createProject();

    const first = await upload(projectId, [
      { name: 'deck.html', body: 'first' },
      { name: 'deck.html', body: 'second' },
    ]);
    expect(first.files.map((file) => file.name)).toEqual(['deck.html', 'deck-1.html']);
    expect(first.files.map((file) => file.originalName)).toEqual(['deck.html', 'deck.html']);

    const second = await upload(projectId, [
      { name: 'deck.html', body: 'third' },
    ]);
    expect(second.files.map((file) => file.name)).toEqual(['deck-2.html']);

    await expect(fetch(`${baseUrl}/api/projects/${projectId}/raw/deck.html`).then((res) => res.text()))
      .resolves.toBe('first');
    await expect(fetch(`${baseUrl}/api/projects/${projectId}/raw/deck-1.html`).then((res) => res.text()))
      .resolves.toBe('second');
    await expect(fetch(`${baseUrl}/api/projects/${projectId}/raw/deck-2.html`).then((res) => res.text()))
      .resolves.toBe('third');
  });
});
