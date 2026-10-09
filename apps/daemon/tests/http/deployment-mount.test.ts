import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { mountDeploymentApp } from '../../src/server.js';
import { registerStaticSpaFallback } from '../../src/static-spa.js';

const servers: http.Server[] = [];
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  })));
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function listen(app: express.Express): Promise<{ server: http.Server; origin: string }> {
  const server = http.createServer(app);
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        reject(new Error('expected a TCP listener'));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

describe('daemon deployment mount', () => {
  it('serves the same API/artifact/frame routes through the fixed prefix and root compatibility mount', async () => {
    const routeApp = express();
    routeApp.get('/api/health', (_req, res) => res.json({ ok: true }));
    routeApp.get('/artifacts/example.html', (_req, res) => res.type('html').send('artifact'));
    routeApp.get('/frames/example.html', (_req, res) => res.type('html').send('frame'));
    routeApp.get('/dashboard', (_req, res) => res.send('dashboard'));

    const listenerApp = express();
    mountDeploymentApp(listenerApp, routeApp, '/open-design');
    const { origin } = await listen(listenerApp);

    for (const prefix of ['/open-design', '']) {
      for (const path of ['/api/health', '/artifacts/example.html', '/frames/example.html', '/dashboard']) {
        const response = await fetch(`${origin}${prefix}${path}`);
        expect(response.status, `${prefix}${path}`).toBe(200);
      }
    }

    expect((await fetch(`${origin}/open-design/api/health`)).url).toBe(`${origin}/open-design/api/health`);
    expect((await fetch(`${origin}/open-designx/api/health`)).status).toBe(404);
  });

  it('does not pass missing prefixed API or asset requests through the root SPA fallback', async () => {
    const staticDirectory = mkdtempSync(join(tmpdir(), 'open-design-deployment-mount-'));
    tempDirectories.push(staticDirectory);
    writeFileSync(join(staticDirectory, 'index.html'), '<!doctype html><div>shell</div>');

    const routeApp = express();
    routeApp.get('/api/health', (_req, res) => res.json({ ok: true }));
    registerStaticSpaFallback(routeApp, staticDirectory);

    const listenerApp = express();
    mountDeploymentApp(listenerApp, routeApp, '/open-design');
    const { origin } = await listen(listenerApp);

    const missingApi = await fetch(`${origin}/open-design/api/does-not-exist`, {
      headers: { accept: 'text/html' },
    });
    expect(missingApi.status).toBe(404);

    const missingAsset = await fetch(`${origin}/open-design/_next/static/missing.js`);
    expect(missingAsset.status).toBe(404);

    const rootDeepLink = await fetch(`${origin}/dashboard`);
    expect(rootDeepLink.status).toBe(200);
    expect(await rootDeepLink.text()).toContain('shell');
  });
});
