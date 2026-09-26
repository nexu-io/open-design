import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CLOUDFLARE_OAUTH_EXCHANGE_TIMEOUT_MS, registerCloudflareRoutes } from '../src/routes/cloudflare.js';
import { startCallbackListener } from '../src/integrations/cloudflare-oauth-server.js';
import {
  CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE,
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

  it('discards the token when manual completion is cancelled mid-exchange, revoking the grant it was issued', async () => {
    let releaseToken!: (resp: Response) => void;
    let markExchangeStarted!: () => void;
    const exchangeStarted = new Promise<void>((resolve) => {
      markExchangeStarted = resolve;
    });

    const realFetch = globalThis.fetch;
    const revokes: string[] = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        revokes.push(String((init as RequestInit | undefined)?.body));
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
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
            refresh_token: 'ref-cancelled-late',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const completeResp = await completePromise;
      expect(completeResp.status).toBe(409);

      const persisted = await getCloudflareOAuthToken(cloudflareOAuthTokensDir());
      expect(persisted).toBeNull();
      // The grant Cloudflare issued to the abandoned attempt is revoked before
      // the 409 goes out, not merely forgotten: its refresh token would
      // otherwise stay valid with nobody holding it.
      expect(revokes).toHaveLength(1);
      const form = new URLSearchParams(revokes[0]!);
      expect(form.get('token')).toBe('ref-cancelled-late');
      expect(form.get('token_type_hint')).toBe('refresh_token');
      expect(form.get('client_id')).toBe('client-abc');
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

  it('budgets the connect-path calls (code exchange and GET /user) with an AbortSignal', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const realFetch = globalThis.fetch;
    const signals: Record<string, unknown> = {};
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/token')) {
        signals.token = init?.signal;
        return new Response(
          JSON.stringify({ access_token: 'acc-budget', token_type: 'Bearer', refresh_token: 'ref-budget', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/client/v4/user')) {
        signals.user = init?.signal;
        return new Response(JSON.stringify({ success: true, result: { email: 'me@example.com' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input as never, init as never);
    });
    try {
      expect(CLOUDFLARE_OAUTH_EXCHANGE_TIMEOUT_MS).toBe(20_000);
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
      expect(signals.token).toBeInstanceOf(AbortSignal);
      expect(signals.user).toBeInstanceOf(AbortSignal);
    } finally {
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('a code exchange that runs out of its budget is a failed exchange: 400, nothing stored, listener left to the next attempt', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const realFetch = globalThis.fetch;
    let userCalls = 0;
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/token')) {
        // What Node's fetch rejects with once AbortSignal.timeout fires.
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      if (url.endsWith('/client/v4/user')) {
        userCalls += 1;
        return new Response(JSON.stringify({ success: true, result: { email: 'me@example.com' } }), { status: 200 });
      }
      return realFetch(input as never, init as never);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
      expect(completeResp.status).toBe(400);
      expect(((await completeResp.json()) as { error: string }).error).toContain('did not answer within 20s');
      expect(userCalls).toBe(0);
      expect(await getCloudflareOAuthToken(dataDir)).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith('[cloudflare-oauth] manual complete failed:', expect.stringContaining('did not answer'));
    } finally {
      errorSpy.mockRestore();
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
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
    const revokes: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        // The revoke of the superseded grant is attempted — and its failure
        // must not change the outcome below.
        revokes.push(String((init as RequestInit | undefined)?.body));
        throw new TypeError('fetch failed');
      }
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
          JSON.stringify({ access_token: 'acc-late', token_type: 'Bearer', refresh_token: 'ref-late-disconnect', expires_in: 3600 }),
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
      expect(revokes.map((body) => new URLSearchParams(body).get('token'))).toEqual(['ref-late-disconnect']);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('revoke of discarded grant failed'), expect.stringContaining('fetch failed'));
    } finally {
      warnSpy.mockRestore();
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('a successful reconnect revokes the grant it replaced, and a failed revoke does not fail the connect', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const realFetch = globalThis.fetch;
    const revokes: string[] = [];
    let storedAtRevoke: string | null | undefined;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        storedAtRevoke = (await getCloudflareOAuthToken(dataDir))?.accessToken;
        revokes.push(String(init?.body));
        throw new TypeError('fetch failed');
      }
      if (url.includes('oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'acc-new', token_type: 'Bearer', refresh_token: 'ref-new', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      await setCloudflareOAuthToken(dataDir, {
        accessToken: 'acc-old',
        tokenType: 'Bearer',
        refreshToken: 'ref-old',
        clientId: 'client-old',
        generation: 0,
        savedAt: Date.now(),
      });
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
      // The revoke of the OLD grant blew up; the reconnect still succeeded.
      expect(completeResp.status).toBe(200);
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ accessToken: 'acc-new', refreshToken: 'ref-new' });
      // The previous credential is not merely overwritten: its refresh token
      // (which keeps that grant alive at Cloudflare) is revoked under the
      // client that issued it, only after the new credential is on disk.
      expect(revokes).toHaveLength(1);
      const form = new URLSearchParams(revokes[0]!);
      expect(form.get('token')).toBe('ref-old');
      expect(form.get('token_type_hint')).toBe('refresh_token');
      expect(form.get('client_id')).toBe('client-old');
      expect(storedAtRevoke).toBe('acc-new');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('revoke of superseded grant failed'), expect.stringContaining('fetch failed'));
    } finally {
      warnSpy.mockRestore();
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('a reconnect that is handed the same refresh token back does not revoke it', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const realFetch = globalThis.fetch;
    const revokes: string[] = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        revokes.push(String(init?.body));
        return new Response('', { status: 200 });
      }
      if (url.includes('oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'acc-rotated', token_type: 'Bearer', refresh_token: 'ref-same', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      await setCloudflareOAuthToken(dataDir, {
        accessToken: 'acc-old',
        tokenType: 'Bearer',
        refreshToken: 'ref-same',
        clientId: 'client-abc',
        generation: 0,
        savedAt: Date.now(),
      });
      const startResp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:56122/callback' }),
      });
      const { state } = (await startResp.json()) as { state: string };
      const completeResp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state, code: 'AUTHCODE' }),
      });
      expect(completeResp.status).toBe(200);
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ accessToken: 'acc-rotated', refreshToken: 'ref-same' });
      // Revoking `ref-same` would kill the grant that was just stored.
      expect(revokes).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('disconnect clears the stored token and revokes the grant the clear displaced at Cloudflare (refresh token + client_id)', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const realFetch = globalThis.fetch;
    const revokes: Array<{ method: string | undefined; body: string }> = [];
    let tokenStillStoredAtRevoke: boolean | null = null;
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        tokenStillStoredAtRevoke = (await getCloudflareOAuthToken(dataDir)) !== null;
        revokes.push({ method: init?.method, body: String(init?.body) });
        return new Response('', { status: 200 });
      }
      return realFetch(input as never, init as never);
    });
    try {
      await setCloudflareOAuthToken(dataDir, {
        accessToken: 'acc-1',
        tokenType: 'Bearer',
        refreshToken: 'ref-1',
        clientId: 'client-abc',
        generation: 0,
        savedAt: Date.now(),
      });
      const resp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/disconnect`, { method: 'POST' });
      expect(resp.status).toBe(200);
      expect(revokes).toHaveLength(1);
      expect(revokes[0]!.method).toBe('POST');
      const form = new URLSearchParams(revokes[0]!.body);
      // The refresh token is what keeps the grant alive; revoking it (not
      // just the current access token) is what makes a leaked copy inert.
      expect(form.get('token')).toBe('ref-1');
      expect(form.get('token_type_hint')).toBe('refresh_token');
      expect(form.get('client_id')).toBe('client-abc');
      // The wipe lands first; the revoke names the record the wipe displaced,
      // read under the store lock — not a pre-read of the store that a
      // concurrent refresh could have rotated past.
      expect(tokenStillStoredAtRevoke).toBe(false);
      expect(await getCloudflareOAuthToken(dataDir)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('disconnect revokes exactly the record its wipe displaced; a credential rotated in after the wipe is neither wiped nor revoked', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const realFetch = globalThis.fetch;
    const revokes: string[] = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        revokes.push(String(init?.body));
        // A refresh lands while the revoke round-trip is in flight. Keyed on
        // a read taken BEFORE the wipe, the wipe that followed the revoke
        // took this rotated record off disk unrevoked — an orphaned grant.
        // Keyed on the displaced record, the wipe is already done and this
        // write is a credential in its own right.
        await setCloudflareOAuthToken(dataDir, {
          accessToken: 'acc-2',
          tokenType: 'Bearer',
          refreshToken: 'ref-2',
          clientId: 'client-abc',
          generation: 0,
          savedAt: Date.now(),
        });
        return new Response('', { status: 200 });
      }
      return realFetch(input as never, init as never);
    });
    try {
      await setCloudflareOAuthToken(dataDir, {
        accessToken: 'acc-1',
        tokenType: 'Bearer',
        refreshToken: 'ref-1',
        clientId: 'client-abc',
        generation: 0,
        savedAt: Date.now(),
      });
      const resp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/disconnect`, { method: 'POST' });
      expect(resp.status).toBe(200);
      expect(revokes.map((body) => new URLSearchParams(body).get('token'))).toEqual(['ref-1']);
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ refreshToken: 'ref-2' });
    } finally {
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('disconnect falls back to revoking the access token and still clears locally when the revoke call fails', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const realFetch = globalThis.fetch;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const revokeBodies: string[] = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        revokeBodies.push(String(init?.body));
        throw new TypeError('fetch failed');
      }
      return realFetch(input as never, init as never);
    });
    try {
      await setCloudflareOAuthToken(dataDir, {
        accessToken: 'acc-only',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 0,
        savedAt: Date.now(),
      });
      const resp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/disconnect`, { method: 'POST' });
      // Revocation is best-effort: a network failure must not strand the user
      // with a token they asked to forget.
      expect(resp.status).toBe(200);
      expect(revokeBodies).toHaveLength(1);
      const form = new URLSearchParams(revokeBodies[0]!);
      expect(form.get('token')).toBe('acc-only');
      expect(form.get('token_type_hint')).toBe('access_token');
      expect(await getCloudflareOAuthToken(dataDir)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('revoke failed'), expect.stringContaining('fetch failed'));
    } finally {
      warnSpy.mockRestore();
      vi.unstubAllGlobals();
      await clearCloudflareOAuthToken(dataDir);
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
    }
  });

  it('a /start during an in-flight loopback exchange drains that listener before binding a new one', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    let releaseToken!: (resp: Response) => void;
    let markExchangeStarted!: () => void;
    const exchangeStarted = new Promise<void>((resolve) => {
      markExchangeStarted = resolve;
    });
    const realFetch = globalThis.fetch;
    const revokes: string[] = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        revokes.push(String((init as RequestInit | undefined)?.body));
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('oauth2/token')) {
        markExchangeStarted();
        return new Promise<Response>((resolve) => {
          releaseToken = resolve;
        });
      }
      return realFetch(input as never, init as never);
    });
    const body = JSON.stringify({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:56122/callback' });
    try {
      const first = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(first.status).toBe(200);
      const { state } = (await first.json()) as { state: string };
      const listenerInput = vi.mocked(startCallbackListener).mock.calls.at(-1)![0];
      const callbackResult = Promise.resolve(listenerInput.onCallback({ kind: 'ok', code: 'AUTHCODE', state }));
      await exchangeStarted;

      // The redirect landed, so the listener is no longer awaiting a callback…
      const mid = await (await fetch(`${app.baseUrl}/api/cloudflare/auth/status`)).json() as { listening: boolean };
      expect(mid.listening).toBe(false);

      // …but it still holds :56122 until its self-close after the exchange. A
      // /start now must stop (drain) it BEFORE it binds its own listener, or
      // the bind fails EADDRINUSE and the user is told to close another process.
      listenerStop.mockClear();
      vi.mocked(startCallbackListener).mockClear();
      const second = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(second.status).toBe(200);
      expect(listenerStop).toHaveBeenCalledTimes(1);
      expect(startCallbackListener).toHaveBeenCalledTimes(1);
      expect(listenerStop.mock.invocationCallOrder[0]!).toBeLessThan(
        vi.mocked(startCallbackListener).mock.invocationCallOrder[0]!,
      );

      // The superseded exchange discards its token — and revokes the grant.
      releaseToken(
        new Response(
          JSON.stringify({ access_token: 'acc-late', token_type: 'Bearer', refresh_token: 'ref-drained', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      expect(await callbackResult).toBe(false);
      expect(await getCloudflareOAuthToken(dataDir)).toBeNull();
      expect(revokes.map((body) => new URLSearchParams(body).get('token'))).toEqual(['ref-drained']);
    } finally {
      vi.unstubAllGlobals();
      await fetch(`${app.baseUrl}/api/cloudflare/oauth/cancel`, { method: 'POST' });
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

  it('refuses /start with 409 while the Workers config file is corrupt, before any state or listener exists', async () => {
    const configPath = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(startCallbackListener).mockClear();
    try {
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(configPath, '{"clientId": "client-abc", "redirectUri": ', 'utf8');
      const resp = await fetch(`${app.baseUrl}/api/cloudflare/oauth/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:56122/callback' }),
      });
      expect(resp.status).toBe(409);
      const body = (await resp.json()) as { error?: string; code?: string };
      expect(body.code).toBe(CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE);
      expect(body.error).toMatch(/not valid JSON/);
      // The refusal happens before the browser dance: no listener was bound,
      // and there is no pending attempt for a paste-back to complete.
      expect(startCallbackListener).not.toHaveBeenCalled();
      const status = await (await fetch(`${app.baseUrl}/api/cloudflare/auth/status`)).json() as { listening: boolean };
      expect(status.listening).toBe(false);
      // The corrupt file is left for the settings save to rewrite; /start did
      // not paper over it.
      expect(await readFile(configPath, 'utf8')).toContain('"redirectUri": ');
    } finally {
      errorSpy.mockRestore();
      await rm(configPath, { force: true });
    }
  });

  it('revokes the freshly issued grant when storing it throws for a reason other than the config commit', async () => {
    const dataDir = cloudflareOAuthTokensDir();
    const tokensPath = path.join(dataDir, 'cloudflare-oauth-tokens.json');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const realFetch = globalThis.fetch;
    const revokes: string[] = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('oauth2/revoke')) {
        revokes.push(String((init as RequestInit | undefined)?.body));
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'acc-orphan', token_type: 'Bearer', refresh_token: 'ref-orphan', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/client/v4/user')) {
        return new Response(JSON.stringify({ success: false }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(input as never, init as never);
    });
    try {
      // The token store's file path is occupied by a directory, so the read of
      // the previous credential inside persistCredential throws EISDIR — a
      // failure that is neither "superseded" nor the config-commit path.
      await rm(tokensPath, { recursive: true, force: true });
      await mkdir(tokensPath, { recursive: true });
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
      expect(completeResp.status).toBe(400);
      expect(((await completeResp.json()) as { error: string }).error).toMatch(/EISDIR/);
      // Cloudflare issued a grant nobody holds; it is revoked exactly once,
      // by its refresh token.
      expect(revokes).toHaveLength(1);
      const form = new URLSearchParams(revokes[0]!);
      expect(form.get('token')).toBe('ref-orphan');
      expect(form.get('client_id')).toBe('client-abc');
    } finally {
      vi.unstubAllGlobals();
      errorSpy.mockRestore();
      await rm(tokensPath, { recursive: true, force: true });
      await fetch(`${app.baseUrl}/api/cloudflare/oauth/cancel`, { method: 'POST' });
      await rm(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { force: true });
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

  it('delivers a consuming ?error= callback to onCallback before closing', async () => {
    const start = await realListener();
    const onCallback = vi.fn(async () => true);
    const listener = await start({ expectedState: 'st-4', onCallback, port: 0, timeoutMs: 60_000 });
    try {
      const resp = await fetch(`http://127.0.0.1:${listener.address.port}/callback?error=access_denied&state=st-4`);
      expect(resp.status).toBe(400);
      // The daemon learns the dance failed NOW (tears down activeListener, the
      // poll ends) instead of waiting for the 30 min timeout.
      expect(onCallback).toHaveBeenCalledTimes(1);
      expect(onCallback).toHaveBeenCalledWith({ kind: 'error', error: 'access_denied', state: 'st-4' });
      // Consumed: the listener is gone.
      await expect(fetch(`http://127.0.0.1:${listener.address.port}/callback?code=X&state=st-4`)).rejects.toThrow();
    } finally {
      await listener.stop();
    }
  });

  it('keeps the listener live on a state-less ?error= (any local process can send one) and still accepts the real callback', async () => {
    const start = await realListener();
    const onCallback = vi.fn(async () => true);
    const listener = await start({ expectedState: 'st-5', onCallback, port: 0, timeoutMs: 60_000 });
    try {
      // Nothing proves a state-less error came from OUR dance: consuming the
      // slot on it would let any process on the machine kill the in-flight
      // authorization with one GET.
      const resp = await fetch(`http://127.0.0.1:${listener.address.port}/callback?error=server_error`);
      expect(resp.status).toBe(400);
      expect(onCallback).not.toHaveBeenCalled();
      const real = await fetch(`http://127.0.0.1:${listener.address.port}/callback?code=NEW&state=st-5`);
      expect(real.status).toBe(200);
      expect(onCallback).toHaveBeenCalledTimes(1);
      expect(onCallback).toHaveBeenCalledWith({ kind: 'ok', code: 'NEW', state: 'st-5' });
    } finally {
      await listener.stop();
    }
  });

  it('stop() is memoized: a second caller awaits the in-progress close and the port is free afterwards', async () => {
    const start = await realListener();
    const listener = await start({ expectedState: 'st-7', onCallback: async () => true, port: 0, timeoutMs: 60_000 });
    const { port } = listener.address;
    const first = listener.stop();
    const second = listener.stop();
    await Promise.all([first, second]);
    // The daemon's /start drains a listener the callback already began
    // stopping; it must be able to bind the same port once that resolves.
    const probe = http.createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  });

  it('does not invoke onCallback for a mismatched-state ?error= replay', async () => {
    const start = await realListener();
    const onCallback = vi.fn(async () => true);
    const listener = await start({ expectedState: 'st-6', onCallback, port: 0, timeoutMs: 60_000 });
    try {
      const resp = await fetch(`http://127.0.0.1:${listener.address.port}/callback?error=access_denied&state=other`);
      expect(resp.status).toBe(400);
      expect(onCallback).not.toHaveBeenCalled();
    } finally {
      await listener.stop();
    }
  });
});
