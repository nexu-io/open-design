// Plan §6 Phase 2B + spec §11.6 — `/api/plugins/:id/preview`
// fallback chain.
//
// Several bundled plugins (`example-guizang-ppt`, `example-html-ppt`)
// declare `od.preview.entry: "./index.html"` but ship the actual
// renderable HTML under `assets/example-slides.html`. The preview
// endpoint must try the declared entry first AND fall back to the
// plugin's `od.context.assets[]` HTMLs and `assets/*.html` so the
// home gallery never paints a blank tile because the manifest's
// declared entry is stale.
//
// This file ships its own fixture so it doesn't share a plugin row
// with `plugins-preview-route.test.ts`.

import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const serverRuntimeDataRoot = process.env.OD_DATA_DIR
  ? path.resolve(projectRoot, process.env.OD_DATA_DIR)
  : path.join(projectRoot, '.od');

const PLUGIN_ID = `phase2b-preview-fallback-${Date.now()}`;
let pluginRoot: string;
let server: http.Server | undefined;
let baseUrl: string;

async function bootInstall(folder: string): Promise<void> {
  const installResp = await fetch(`${baseUrl}/api/plugins/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ source: folder }),
  });
  if (!installResp.body) throw new Error('install: no SSE body');
  const reader = installResp.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value);
  }
  if (!raw.includes('event: success')) {
    throw new Error(`installer did not finalize:\n${raw}`);
  }
}

beforeEach(async () => {
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-preview-fallback-'));
  const folder = path.join(pluginRoot, PLUGIN_ID);
  await mkdir(path.join(folder, 'assets'), { recursive: true });
  // Deliberately omit ./index.html so the declared entry is stale.
  await writeFile(
    path.join(folder, 'assets', 'template.html'),
    '<!DOCTYPE html><title>template</title><main id="deck"><!-- SLIDES_HERE --></main>',
  );
  await writeFile(
    path.join(folder, 'assets', 'example-slides.html'),
    '<section class="slide hero dark"><p>fallback body via assets</p></section>',
  );
  await writeFile(
    path.join(folder, 'open-design.json'),
    JSON.stringify({
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      name: PLUGIN_ID,
      title: 'Preview fallback fixture',
      version: '1.0.0',
      description: 'fixture',
      license: 'MIT',
      od: {
        kind: 'scenario',
        capabilities: ['prompt:inject'],
        preview: { type: 'html', entry: './index.html' },
        context: {
          assets: ['./assets/example-slides.html'],
        },
      },
    }),
  );
  await writeFile(
    path.join(folder, 'SKILL.md'),
    `---\nname: ${PLUGIN_ID}\ndescription: fallback fixture\n---\n# fallback\n`,
  );

  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;
  await bootInstall(folder);
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
  try {
    const dbPath = path.join(serverRuntimeDataRoot, 'app.sqlite');
    const db = new Database(dbPath);
    db.prepare('DELETE FROM installed_plugins WHERE id = ?').run(PLUGIN_ID);
    db.close();
  } catch {
    // ignore
  }
  await rm(pluginRoot, { recursive: true, force: true });
});

describe('GET /api/plugins/:id/preview — fallback chain', () => {
  it('assembles example-slides fragments with the sibling template when the declared entry is missing', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/preview`);
    if (resp.status !== 200) {
      const text = await resp.text();
      throw new Error(`expected 200 from preview fallback, got ${resp.status}: ${text}`);
    }
    expect(resp.headers.get('content-type')).toMatch(/text\/html/);
    const body = await resp.text();
    expect(body).toContain('<main id="deck">');
    expect(body).toContain('fallback body via assets');
    expect(body).toContain('Preview fallback fixture | Open Design Example');
  });
});
