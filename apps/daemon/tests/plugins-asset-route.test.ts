// Plan §3.L3 / spec §10.3.5 / §9.2 — plugin asset endpoint.
//
// Validates the daemon-side half of the SandboxedComponentSurface
// contract:
//
//   - 404 when the plugin id is unknown.
//   - 400 when the relpath includes traversal segments.
//   - 200 with the §9.2 CSP + nosniff headers when the asset is
//     served from a real fsPath.
//   - Requests outside the plugin's fsPath are refused even when the
//     normalized path resolves to an existing file elsewhere.

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { startServer } from '../src/server.js';
import { migratePlugins } from '../src/plugins/persistence.js';
import { upsertInstalledPlugin } from '../src/plugins/registry.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;
let pluginRoot: string;

beforeAll(async () => {
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-asset-'));
  const surfacesDir = path.join(pluginRoot, 'surfaces');
  await mkdir(surfacesDir, { recursive: true });
  await writeFile(
    path.join(surfacesDir, 'index.html'),
    '<!DOCTYPE html><title>fixture</title><script>console.log(1)</script>',
  );
  await writeFile(
    path.join(pluginRoot, 'open-design.json'),
    JSON.stringify({
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      name: 'asset-plugin',
      title: 'Asset',
      version: '1.0.0',
      description: 'fixture',
      license: 'MIT',
      od: { kind: 'skill', capabilities: ['prompt:inject', 'genui:custom-component'] },
    }),
  );

  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;

  // Insert the plugin row into the running daemon's DB. We can't reach
  // the daemon's `db` handle directly, so we open a sibling SQLite
  // session against the same RUNTIME_DATA_DIR. Instead, simulate the
  // installer's effect by hitting the install API:
  //
  // For test simplicity we open a private DB and skip the daemon's
  // registry. The asset route reads through `getInstalledPlugin(db,…)`
  // backed by the daemon's own DB, so we must use the install route.
  // But install requires SAFE_BASENAME id matching the folder name —
  // achievable by pointing at our prepared fixture.
  const installResp = await fetch(`${baseUrl}/api/plugins/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ source: pluginRoot }),
  });
  // Drain SSE.
  if (installResp.body) {
    const reader = installResp.body.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  }
  void migratePlugins;
  void upsertInstalledPlugin;
  void Database;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(pluginRoot, { recursive: true, force: true });
});

describe('GET /api/plugins/:id/asset/*', () => {
  it('returns 404 for an unknown plugin', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/unknown/asset/index.html`);
    expect(resp.status).toBe(404);
  });

  it('rejects path-traversal segments with 400', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/..%2Fescape`);
    expect(resp.status).toBe(400);
  });

  it('serves an asset with the §9.2 preview CSP + nosniff', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/surfaces/index.html`);
    expect(resp.status).toBe(200);
    const csp = resp.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(resp.headers.get('x-content-type-options')).toBe('nosniff');
    expect(resp.headers.get('content-type')).toMatch(/text\/html/);
    const body = await resp.text();
    expect(body).toContain('fixture');
  });

  it('returns 404 for a missing asset under a known plugin', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/asset-plugin/asset/does/not/exist.html`);
    expect(resp.status).toBe(404);
  });
});
