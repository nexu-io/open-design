import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDesktopPdfExportInput } from '../src/pdf-export.js';
import { startServer } from '../src/server.js';

describe('buildDesktopPdfExportInput', () => {
  let projectsRoot = '';
  const projectId = 'proj-pdf-test';

  beforeEach(async () => {
    projectsRoot = mkdtempSync(path.join(tmpdir(), 'od-pdf-export-'));
    await mkdir(path.join(projectsRoot, projectId, 'deck', 'assets'), { recursive: true });
    await writeFile(
      path.join(projectsRoot, projectId, 'deck', 'index.html'),
      '<!doctype html><section class="slide">One</section>',
    );
  });

  afterEach(() => {
    if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
  });

  it('reads the project file and derives a raw-route baseHref from the file directory', async () => {
    const input = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: true,
      fileName: 'deck/index.html',
      projectId,
      projectsRoot,
      title: 'Seed Deck',
    });

    expect(input).toEqual({
      baseHref: 'http://127.0.0.1:7456/api/projects/proj-pdf-test/raw/deck/',
      deck: true,
      defaultFilename: 'Seed-Deck.pdf',
      html: '<!doctype html><section class="slide">One</section>',
      title: 'Seed Deck',
    });
  });

  it('falls back to the file basename when the caller omits a title', async () => {
    const input = await buildDesktopPdfExportInput({
      daemonUrl: 'http://127.0.0.1:7456',
      deck: false,
      fileName: 'deck/index.html',
      projectId,
      projectsRoot,
    });

    expect(input.title).toBe('index');
    expect(input.defaultFilename).toBe('index.pdf');
  });
});

describe('POST /api/projects/:id/export/pdf', () => {
  const userHeaders = (email: string) => ({
    'content-type': 'application/json',
    'cf-access-authenticated-user-email': email,
  });

  it('forwards the project HTML file to the configured desktop PDF exporter', async () => {
    const projectId = `proj-pdf-route-${Date.now()}`;
    const calls: unknown[] = [];
    const started = await startServer({
      port: 0,
      returnServer: true,
      desktopPdfExporter: async (input: unknown) => {
        calls.push(input);
        return { ok: true, path: '/tmp/seed.pdf' };
      },
    }) as { server: { close(cb: () => void): void }; url: string };

    try {
      const create = await fetch(`${started.url}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'PDF route project',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(create.status).toBe(200);

      await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/files`, {
        body: JSON.stringify({
          content: '<!doctype html><section class="slide">One</section>',
          name: 'deck/index.html',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const response = await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/export/pdf`, {
        body: JSON.stringify({ deck: true, fileName: 'deck/index.html', title: 'Seed Deck' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, path: '/tmp/seed.pdf' });
      expect(calls).toEqual([
        {
          baseHref: `${started.url}/api/projects/${encodeURIComponent(projectId)}/raw/deck/`,
          deck: true,
          defaultFilename: 'Seed-Deck.pdf',
          html: '<!doctype html><section class="slide">One</section>',
          title: 'Seed Deck',
        },
      ]);
    } finally {
      await new Promise<void>((resolve) => started.server.close(resolve));
    }
  });

  it('rejects PDF export for projects outside the caller owner scope before reading files', async () => {
    const projectId = `proj-pdf-owner-${Date.now()}`;
    const calls: unknown[] = [];
    const started = await startServer({
      port: 0,
      returnServer: true,
      desktopPdfExporter: async (input: unknown) => {
        calls.push(input);
        return { ok: true, path: '/tmp/seed.pdf' };
      },
    }) as { server: { close(cb: () => void): void }; url: string };

    try {
      const create = await fetch(`${started.url}/api/projects`, {
        method: 'POST',
        headers: userHeaders('bob@example.com'),
        body: JSON.stringify({
          id: projectId,
          name: 'Bob PDF project',
          skillId: null,
          designSystemId: null,
        }),
      });
      expect(create.status).toBe(200);

      const write = await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/files`, {
        body: JSON.stringify({
          content: '<!doctype html><section class="slide">Bob only</section>',
          name: 'deck/index.html',
        }),
        headers: userHeaders('bob@example.com'),
        method: 'POST',
      });
      expect(write.status).toBe(200);

      const response = await fetch(`${started.url}/api/projects/${encodeURIComponent(projectId)}/export/pdf`, {
        body: JSON.stringify({ deck: true, fileName: 'deck/index.html', title: 'Bob Deck' }),
        headers: userHeaders('alice@example.com'),
        method: 'POST',
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'PROJECT_NOT_FOUND' },
      });
      expect(calls).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => started.server.close(resolve));
    }
  });
});
