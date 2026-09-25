import http from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCloudflareRoutes } from '../src/routes/cloudflare.js';
import { startCallbackListener } from '../src/integrations/cloudflare-oauth-server.js';
import {
  CLOUDFLARE_WORKERS_PROVIDER_ID,
  cloudflareOAuthTokensDir,
  configureCloudflareWorkersDataDir,
  deployConfigPath,
  readCloudflareWorkersConfig,
} from '../src/deploy.js';
import {
  clearCloudflareOAuthToken,
  getCloudflareOAuthToken,
  setCloudflareOAuthToken,
} from '../src/integrations/cloudflare-tokens.js';

// The loopback callback server binds :56122; stub it so the route test never
// opens a real socket (and never races the fixed redirect port). `listenerStop`
// is shared so a test can assert whether a listener was torn down.
const listenerStop = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../src/integrations/cloudflare-oauth-server.js', () => ({
  startCallbackListener: vi.fn(async () => ({
    address: { host: '127.0.0.1', port: 56122 },
    stop: listenerStop,
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

  it('honors a requested scope set instead of always requesting the full default', async () => {
    const resp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: 'client-abc',
        redirectUri: 'http://127.0.0.1:56122/callback',
        scopes: ['workers-scripts.write'],
      }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { authorizeUrl?: string };
    expect(body.authorizeUrl).toContain('workers-scripts.write');
    expect(body.authorizeUrl).toContain('offline_access');
    // A default scope that was NOT requested must not be asked for.
    expect(body.authorizeUrl).not.toContain('access.write');
  });

  it('rejects an unsupported or malformed explicit scope set with 400 before creating state or a listener', async () => {
    vi.mocked(startCallbackListener).mockClear();
    const post = (scopes: unknown) =>
      fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:56122/callback', scopes }),
      });

    // A typo must not silently widen to the full default grant.
    const typo = await post(['workers-scripts.write', 'acess.write']);
    expect(typo.status).toBe(400);
    expect(((await typo.json()) as { error: string }).error).toContain('acess.write');

    // An explicit empty selection and a non-array are malformed, not "use defaults".
    expect((await post([])).status).toBe(400);
    expect((await post('workers-scripts.write')).status).toBe(400);
    expect((await post(['workers-scripts.write', ''])).status).toBe(400);

    // No attempt was created: the listener for the earlier (valid) start is
    // still the active one and no new bind was requested.
    expect(startCallbackListener).not.toHaveBeenCalled();
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

  it('records the connected account email at connect time and reports it on auth/status', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const realFetch = globalThis.fetch;
    let userCalls = 0;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'acc-connect', token_type: 'Bearer', refresh_token: 'ref', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/client/v4/user')) {
        userCalls += 1;
        // The email lookup must run with the token that just authorized.
        const auth = ((init as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.Authorization;
        expect(auth).toBe('Bearer acc-connect');
        return new Response(JSON.stringify({ success: true, result: { email: 'me@example.com' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input as never, init as never);
    });
    try {
      const startResp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:56122/callback' }),
      });
      expect(startResp.status).toBe(200);
      const { state } = (await startResp.json()) as { state: string };
      const completeResp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state, code: 'AUTHCODE' }),
      });
      expect(completeResp.status).toBe(200);
      expect(userCalls).toBe(1);
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ accessToken: 'acc-connect', email: 'me@example.com' });
      const status = await (await fetch(`${app.baseUrl}/api/cloudflare/auth/status`)).json() as Record<string, unknown>;
      expect(status).toMatchObject({ connected: true, email: 'me@example.com' });
    } finally {
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      // The completed connect committed OAuth mode into the deploy config; the
      // later "/start that fails" case needs that path to be absent again.
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('auth/status reports refreshable + savedAt so the client can tell an expiry from a reconnect', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    try {
      await setCloudflareOAuthToken(dataDir, {
        accessToken: 'acc',
        tokenType: 'Bearer',
        refreshToken: 'ref',
        expiresAt: Date.now() - 1000,
        generation: 0,
        savedAt: 1_700_000_000_000,
      });
      const withRefresh = await (await fetch(`${app.baseUrl}/api/cloudflare/auth/status`)).json() as Record<string, unknown>;
      expect(withRefresh).toMatchObject({ connected: true, refreshable: true, savedAt: 1_700_000_000_000 });
      expect(typeof withRefresh.expiresAt).toBe('number');

      await setCloudflareOAuthToken(dataDir, {
        accessToken: 'acc-2',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000,
        generation: 0,
        savedAt: 1_700_000_000_001,
      });
      const noRefresh = await (await fetch(`${app.baseUrl}/api/cloudflare/auth/status`)).json() as Record<string, unknown>;
      expect(noRefresh).toMatchObject({ connected: true, refreshable: false, savedAt: 1_700_000_000_001 });

      await clearCloudflareOAuthToken(dataDir);
      const cleared = await (await fetch(`${app.baseUrl}/api/cloudflare/auth/status`)).json() as Record<string, unknown>;
      expect(cleared).toMatchObject({ connected: false, refreshable: false });
    } finally {
      await clearCloudflareOAuthToken(dataDir);
    }
  });

  it('a loopback callback that loses the race to /disconnect persists nothing and reports failure to the browser', async () => {
    const dataDir = cloudflareOAuthTokensDir();
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
        body: JSON.stringify({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:56122/callback' }),
      });
      expect(startResp.status).toBe(200);
      const { state } = (await startResp.json()) as { state: string };

      // The listener is stubbed, so drive the daemon's onCallback exactly as the
      // loopback server would on GET /callback?code=…&state=….
      const listenerInput = vi.mocked(startCallbackListener).mock.calls.at(-1)![0];
      expect(listenerInput.expectedState).toBe(state);
      const callbackResult = Promise.resolve(listenerInput.onCallback({ kind: 'ok', code: 'AUTHCODE', state }));

      // Disconnect while the token endpoint is still in flight.
      await exchangeStarted;
      const disconnectResp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/disconnect`, { method: 'POST' });
      expect(disconnectResp.status).toBe(200);

      // The exchange now succeeds upstream — but the attempt it belongs to was
      // superseded, so the token must be discarded and the browser told so
      // (the listener renders its failure page off a `false` return).
      releaseToken(
        new Response(
          JSON.stringify({ access_token: 'acc-late', token_type: 'Bearer', refresh_token: 'ref', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      expect(await callbackResult).toBe(false);
      expect(await getCloudflareOAuthToken(dataDir)).toBeNull();
      const status = await (await fetch(`${app.baseUrl}/api/cloudflare/auth/status`)).json() as Record<string, unknown>;
      expect(status).toMatchObject({ connected: false });
      // credentialMode stays 'token' — the late token never committed OAuth mode.
      const cfg = await readCloudflareWorkersConfig();
      expect(cfg.credentialMode).toBe('token');
    } finally {
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('a /start that fails before owning the attempt leaves the previous listener running', async () => {
    const configPath = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
    const body = JSON.stringify({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:56122/callback' });
    try {
      const first = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(first.status).toBe(200);
      listenerStop.mockClear();

      // Make the config unreadable (a directory where the file should be):
      // readCloudflareWorkersConfig throws before the attempt mutation runs.
      await mkdir(configPath, { recursive: true });
      const second = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(second.status).toBe(502);
      expect(listenerStop).not.toHaveBeenCalled();
      const status = await (await fetch(`${app.baseUrl}/api/cloudflare/auth/status`)).json() as { listening: boolean };
      expect(status.listening).toBe(true);
    } finally {
      await rm(configPath, { recursive: true, force: true });
      await fetch(`${app.baseUrl}/api/cloudflare/oauth/cancel`, { method: 'POST' });
    }
  });
});

// The real loopback listener (the module is mocked above for the route suite).
describe('cloudflare-oauth loopback listener result page', () => {
  type ListenerModule = typeof import('../src/integrations/cloudflare-oauth-server.js');
  async function realListener(): Promise<ListenerModule['startCallbackListener']> {
    const mod = await vi.importActual<ListenerModule>('../src/integrations/cloudflare-oauth-server.js');
    return mod.startCallbackListener;
  }

  it('renders an error page with an error status, not a success page, when the exchange/persist fails', async () => {
    const start = await realListener();
    const onCallback = vi.fn(async () => false);
    const listener = await start({ expectedState: 'st-1', onCallback, port: 0, timeoutMs: 60_000 });
    try {
      const resp = await fetch(
        `http://127.0.0.1:${listener.address.port}/callback?code=AUTHCODE&state=st-1`,
        { redirect: 'manual' },
      );
      expect(onCallback).toHaveBeenCalledWith({ kind: 'ok', code: 'AUTHCODE', state: 'st-1' });
      // The exchange failed after the code was accepted: the browser must see a
      // failure status and the failure copy, never the "connected" page.
      expect(resp.status).toBe(502);
      expect(resp.headers.get('content-type')).toContain('text/html');
      const html = await resp.text();
      expect(html).toContain('Token exchange failed');
      expect(html).not.toMatch(/success|connected/i);
    } finally {
      await listener.stop();
    }
  });

  it('renders the same error page when the exchange throws', async () => {
    const start = await realListener();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = await start({
      expectedState: 'st-2',
      onCallback: async () => {
        throw new Error('disk full');
      },
      port: 0,
      timeoutMs: 60_000,
    });
    try {
      const resp = await fetch(`http://127.0.0.1:${listener.address.port}/callback?code=AUTHCODE&state=st-2`);
      expect(resp.status).toBe(502);
      expect(await resp.text()).toContain('Token exchange failed');
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      await listener.stop();
    }
  });

  it('answers a state mismatch with a 400 page and keeps the listener open for the real callback', async () => {
    const start = await realListener();
    const onCallback = vi.fn(async () => true);
    const listener = await start({ expectedState: 'st-3', onCallback, port: 0, timeoutMs: 60_000 });
    try {
      const stale = await fetch(`http://127.0.0.1:${listener.address.port}/callback?code=OLD&state=other`);
      expect(stale.status).toBe(400);
      expect(await stale.text()).toContain('state mismatch');
      expect(onCallback).not.toHaveBeenCalled();
      const real = await fetch(`http://127.0.0.1:${listener.address.port}/callback?code=NEW&state=st-3`);
      expect(real.status).toBe(200);
      expect(onCallback).toHaveBeenCalledWith({ kind: 'ok', code: 'NEW', state: 'st-3' });
    } finally {
      await listener.stop();
    }
  });
});
