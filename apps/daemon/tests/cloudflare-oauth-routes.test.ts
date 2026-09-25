import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerCloudflareRoutes } from '../src/routes/cloudflare.js';

async function startApp(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  const resolvedPortRef = { current: 56122 };
  registerCloudflareRoutes(app, {
    http: {
      isLocalSameOrigin: () => true,
      resolvedPortRef,
    },
    paths: {},
  } as never);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('cloudflare-oauth routes', () => {
  let dir: string;
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'od-cf-routes-'));
    process.env.OD_USER_STATE_DIR = dir;
    app = await startApp();
  });

  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects a non-loopback redirect URI before creating OAuth state', async () => {
    const resp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'client-abc', redirectUri: 'https://evil.example.com/callback' }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: string };
    expect(body.error).toContain('http://127.0.0.1:56122/callback');
  });

  it('rejects a wrong loopback port before creating OAuth state', async () => {
    const resp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:9999/callback' }),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error?: string };
    expect(body.error).toContain('http://127.0.0.1:56122/callback');
  });
});
