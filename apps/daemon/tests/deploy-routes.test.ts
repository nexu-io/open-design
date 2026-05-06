import type http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLOUDFLARE_PAGES_PROVIDER_ID,
  deployConfigPath,
  SAVED_CLOUDFLARE_TOKEN_MASK,
} from '../src/deploy.js';
import { ensureProject } from '../src/projects.js';
import { startServer } from '../src/server.js';

describe('deploy provider routes', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('dispatches deploy config reads and writes by providerId', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'od-deploy-route-config-'));
    const priorStateRoot = process.env.OD_USER_STATE_DIR;
    process.env.OD_USER_STATE_DIR = stateRoot;
    try {
      const saveResp = await fetch(`${baseUrl}/api/deploy/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
          token: 'cloudflare-token-secret',
          accountId: 'account_123',
          projectName: 'demo-pages',
        }),
      });
      expect(saveResp.status).toBe(200);
      expect(await saveResp.json()).toMatchObject({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_123',
        projectName: 'demo-pages',
      });

      const getResp = await fetch(
        `${baseUrl}/api/deploy/config?providerId=${CLOUDFLARE_PAGES_PROVIDER_ID}`,
      );
      expect(getResp.status).toBe(200);
      expect(await getResp.json()).toMatchObject({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        configured: true,
        tokenMask: SAVED_CLOUDFLARE_TOKEN_MASK,
        accountId: 'account_123',
        projectName: 'demo-pages',
      });
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8'))).toEqual({
        token: 'cloudflare-token-secret',
        accountId: 'account_123',
        projectName: 'demo-pages',
      });
    } finally {
      if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
      else process.env.OD_USER_STATE_DIR = priorStateRoot;
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it('dispatches deploy preflight by providerId', async () => {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const projectId = `deploy-route-${Date.now()}`;
    const dir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    await writeFile(
      path.join(dir, 'index.html'),
      '<!doctype html><meta name="viewport" content="width=device-width"><h1>Hello</h1>',
    );

    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/deploy/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      }),
    });

    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      entry: 'index.html',
      totalFiles: 1,
    });
  });
});
