import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { startServer } from '../src/server.js';

it('ships and serves the HTML previews for bundled live artifacts', async () => {
  const started = await startServer({ port: 0, returnServer: true }) as { server: Server; url: string };
  try {
    for (const folder of [
      'live-artifact',
      'live-dashboard',
      'social-media-matrix-tracker-template',
      'trading-analysis-dashboard-template',
    ]) {
      const pluginDir = path.resolve(import.meta.dirname, '../../../plugins/_official/examples', folder);
      const manifest = JSON.parse(await readFile(path.join(pluginDir, 'open-design.json'), 'utf8'));
      const response = await fetch(`${started.url}/api/plugins/${manifest.name}/preview`);
      expect(response.status, manifest.name).toBe(200);
      expect(response.headers.get('content-type'), manifest.name).toContain('text/html');
      expect(await response.text(), manifest.name).toContain('<body');
      // A runtime-generated project output is not a bundled gallery resource.
      const html = await readFile(path.join(pluginDir, manifest.od.preview.entry), 'utf8');
      expect(html, manifest.name).toMatch(/<!doctype html/i);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => error ? reject(error) : resolve());
    });
  }
});
