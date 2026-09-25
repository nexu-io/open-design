import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCloudflareRoutes } from '../src/routes/cloudflare.js';
import {
  cloudflareOAuthTokensDir,
  configureCloudflareWorkersDataDir,
} from '../src/deploy.js';
import { getCloudflareOAuthToken } from '../src/integrations/cloudflare-tokens.js';

// The loopback callback server binds :56122; stub it so the route test never
// opens a real socket (and never races the fixed redirect port).
vi.mock('../src/integrations/cloudflare-oauth-server.js', () => ({
  startCallbackListener: vi.fn(async () => ({
    address: { host: '127.0.0.1', port: 56122 },
    stop: async () => {},
  })),
}));

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
    configureCloudflareWorkersDataDir(dir);
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

  it('discards the token when manual completion is cancelled mid-exchange', async () => {
    let releaseToken!: (resp: Response) => void;
    let markExchangeStarted!: () => void;
    const exchangeStarted = new Promise<void>((resolve) => {
      markExchangeStarted = resolve;
    });

    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('oauth2/token')) {
        markExchangeStarted();
        return new Promise<Response>((resolve) => {
          releaseToken = resolve;
        });
      }
      return realFetch(input as never, init as never);
    });

    try {
      const startResp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: 'client-abc',
          redirectUri: 'http://127.0.0.1:56122/callback',
        }),
      });
      expect(startResp.status).toBe(200);
      const startBody = (await startResp.json()) as { state?: string };
      expect(startBody.state).toBeTruthy();

      const completePromise = fetch(`${app.baseUrl}/api/cloudflare/oauth/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: startBody.state, code: 'AUTHCODE' }),
      });

      // Wait until the token exchange is in flight, then cancel it.
      await exchangeStarted;
      const cancelResp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/cancel`, { method: 'POST' });
      expect(cancelResp.status).toBe(200);

      // Release the token endpoint; the fence must now abort the persist.
      releaseToken(
        new Response(
          JSON.stringify({
            access_token: 'acc',
            token_type: 'Bearer',
            refresh_token: 'ref',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const completeResp = await completePromise;
      expect(completeResp.status).toBe(409);

      const persisted = await getCloudflareOAuthToken(cloudflareOAuthTokensDir());
      expect(persisted).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
