// HTTP-layer test for `POST /api/projects/:id/figma/import` — spins up the
// real daemon via `startServer({ port: 0 })`, uploads a synthetic `.fig`
// through the multipart boundary (multer → importFigmaFromBytes), and asserts
// the canonical `figma/` snapshot lands in the project cwd. Mirrors the
// pattern in `handoff-route.test.ts`.

import fs from 'node:fs';
import * as http from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSampleFig } from './helpers/fig-fixture.js';

const PROJECT_ID = 'figma-import-route-fixture';

type FigmaImportResponse = {
  inventory: {
    decoded: boolean;
    nodeCount: number;
    colors: string[];
  };
  snapshotDir: string;
  files: string[];
  suggestedPrompt: string;
  error?: { code?: string } | string;
};

describe('POST /api/projects/:id/figma/import — HTTP layer', () => {
  let server: http.Server;
  let baseUrl: string;
  let dataDir: string;

  beforeAll(async () => {
    const { startServer } = await import('../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as unknown as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    const configuredDataDir = process.env.OD_DATA_DIR;
    if (!configuredDataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    dataDir = configuredDataDir;

    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PROJECT_ID, name: 'Figma import fixture' }),
    });
  }, 30_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('decodes an uploaded .fig and stages the figma/ snapshot in the project', async () => {
    const figBytes = await buildSampleFig();
    const form = new FormData();
    form.append('file', new Blob([figBytes]), 'Button kit.fig');
    form.append('notes', 'warm landing page');

    const resp = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/figma/import`, {
      method: 'POST',
      body: form,
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as FigmaImportResponse;

    expect(body.inventory.decoded).toBe(true);
    expect(body.inventory.nodeCount).toBe(4);
    expect(body.inventory.colors).toContain('#3366ff');
    expect(body.snapshotDir).toBe('figma');
    expect(body.files).toContain('figma/tree.json');
    expect(body.suggestedPrompt).toMatch(/Button kit\.fig/);
    expect(body.suggestedPrompt).toMatch(/warm landing page/);

    // The snapshot really landed on disk under the project cwd.
    const treePath = path.join(dataDir, 'projects', PROJECT_ID, 'figma', 'tree.json');
    expect(fs.existsSync(treePath)).toBe(true);
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
    expect(Array.isArray(tree)).toBe(true);
    expect(tree).toHaveLength(4);
    expect(fs.existsSync(path.join(dataDir, 'projects', PROJECT_ID, 'figma', 'thumbnail.png'))).toBe(true);
  });

  it('rejects a request with neither a file nor a Figma URL', async () => {
    const form = new FormData();
    const resp = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/figma/import`, {
      method: 'POST',
      body: form,
    });
    expect(resp.status).toBe(400);
  });

  it('routes a Figma URL to the migration flow (409)', async () => {
    const form = new FormData();
    form.append('figmaUrl', 'https://figma.com/design/abc123/Test');
    const resp = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/figma/import`, {
      method: 'POST',
      body: form,
    });
    expect(resp.status).toBe(409);
    const body = (await resp.json()) as FigmaImportResponse;
    const errorCode = typeof body.error === 'string' ? body.error : body.error?.code;
    expect(errorCode ?? body.error).toMatch(/FIGMA_URL_NEEDS_MIGRATION/);
  });
});
