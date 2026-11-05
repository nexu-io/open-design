import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

const directoryOrder = vi.hoisted(() => ({
  reversed: false,
  calls: 0,
  secondReady: Promise.resolve(),
  releaseFirst: () => {},
}));

vi.mock('../src/projects.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/projects.js')>();
  return {
    ...actual,
    ensureProjectSubdir: async (...args: Parameters<typeof actual.ensureProjectSubdir>) => {
      const order = directoryOrder.reversed ? ++directoryOrder.calls : 0;
      const result = await actual.ensureProjectSubdir(...args);
      // Real filesystem preparation stays intact. Only resolve the second
      // multipart file's destination first, without sleeping or changing names.
      if (order === 1) await directoryOrder.secondReady;
      if (order === 2) directoryOrder.releaseFirst();
      return result;
    },
  };
});

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

  it.each(['normal', 'reversed'] as const)('preserves source filenames and contents with %s directory completion', async (order) => {
    const projectId = await createProject();
    directoryOrder.calls = 0;
    directoryOrder.reversed = order === 'reversed';
    directoryOrder.secondReady = new Promise<void>((resolve) => { directoryOrder.releaseFirst = resolve; });

    try {
      const first = await upload(projectId, [
        { name: 'deck.html', body: 'first' },
        { name: 'deck.html', body: 'second' },
      ]);
      if (order === 'reversed') expect(directoryOrder.calls).toBe(2);
      directoryOrder.reversed = false;
      const stored = {
        names: first.files.map((file) => file.name),
        deck: await fetch(`${baseUrl}/api/projects/${projectId}/raw/deck.html`).then((res) => res.text()),
        suffixedDeck: await fetch(`${baseUrl}/api/projects/${projectId}/raw/deck-1.html`).then((res) => res.text()),
      };
      expect(stored, JSON.stringify(stored)).toEqual({ names: ['deck.html', 'deck-1.html'], deck: 'first', suffixedDeck: 'second' });
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
    } finally {
      directoryOrder.releaseFirst();
      directoryOrder.reversed = false;
    }
  });
});
