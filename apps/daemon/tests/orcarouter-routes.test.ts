// OrcaRouter connect-route lifecycle: what Cancel and Disconnect actually end.
//
// The behaviours these tests defend are the ones the endpoints *promise* in
// their comments but did not enforce:
//
//   * Cancel stops the loopback listener, but its PKCE state lived on in
//     pendingAuth — so a paste-back with that state could still exchange and
//     store a credential the user had just abandoned;
//   * Disconnect removed the credential, but an exchange already awaiting the
//     provider could resolve afterwards and restore the account;
//   * Reconnect leaves the previous credential usable, so the UI could not tell
//     "the new credential landed" from "the old one is still connected".
//
// The suite drives the REAL routes over HTTP, against a fake auth origin, so a
// regression in the route rather than in a helper is what fails here.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerOrcaRouterRoutes } from '../src/routes/orcarouter.js';
import { readOrcaRouterCredential } from '../src/integrations/orcarouter-credentials.js';

const FAKE_KEY = 'sk-orca-routelevelfakekey0000000000000000';

interface AuthCall {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

/**
 * Stand-in for the OrcaRouter auth origin. `delayMs` holds the exchange open so
 * a test can land a Cancel/Disconnect in the middle of it, which is the exact
 * race the fencing exists for.
 */
async function startFakeAuthServer(options: {
  delayMs?: number;
  respond?: (body: Record<string, unknown>) => { status: number; json: unknown };
} = {}): Promise<{ origin: string; calls: AuthCall[]; close: () => Promise<void> }> {
  const calls: AuthCall[] = [];
  const respond = options.respond ?? (() => ({
    status: 200,
    json: { key: FAKE_KEY, user_id: 'acct-1', scope: 'api' },
  }));
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body: Record<string, unknown> = {};
      try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* keep {} */ }
      calls.push({ url: req.url ?? '', method: req.method ?? '', body });
      const send = () => {
        const result = respond(body);
        res.statusCode = result.status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(result.json));
      };
      if (options.delayMs) setTimeout(send, options.delayMs);
      else send();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); }),
  };
}

describe('OrcaRouter connect routes', () => {
  let dataDir: string;
  let server: http.Server | null = null;
  let baseUrl = '';
  const savedEnv: Record<string, string | undefined> = {};

  const ENV_NAMES = [
    'OD_DATA_DIR',
    'OD_MEDIA_CONFIG_DIR',
    'ORCA_BASE_URL',
    'ORCA_AUTH_BASE_URL',
    'ORCA_API_BASE_URL',
    'ORCA_API_KEY',
    'OD_ORCAROUTER_API_KEY',
    'ORCAROUTER_API_KEY',
  ];

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'orca-routes-'));
    for (const name of ENV_NAMES) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
    process.env.OD_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    for (const name of ENV_NAMES) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  async function startRoutes(): Promise<void> {
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    // The routes reject cross-origin callers; the test is same-origin by
    // construction, so the guard is satisfied rather than bypassed.
    registerOrcaRouterRoutes(app, {
      http: {
        isLocalSameOrigin: () => true,
        resolvedPortRef: { current: 0 },
      },
      paths: {
        BUILTIN_DIR: '',
        PROJECT_ROOT: dataDir,
        RUNTIME_DATA_DIR: dataDir,
      },
    } as unknown as Parameters<typeof registerOrcaRouterRoutes>[1]);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  const post = async (route: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };

  const getStatus = async () => {
    const response = await fetch(`${baseUrl}/api/orcarouter/auth/status`);
    return await response.json() as Record<string, unknown>;
  };

  it('refuses a paste-back whose state was cancelled', async () => {
    const fake = await startFakeAuthServer();
    process.env.ORCA_AUTH_BASE_URL = fake.origin;
    try {
      await startRoutes();
      const started = await post('/api/orcarouter/oauth/start');
      const state = String(started.body.state);

      const cancelled = await post('/api/orcarouter/oauth/cancel');
      expect(cancelled.status).toBe(200);

      // The old state must be unusable: this is the attempt the user abandoned.
      const completed = await post('/api/orcarouter/oauth/complete', {
        state,
        code: 'the-code-the-user-never-submitted',
      });
      expect(completed.status).toBeGreaterThanOrEqual(400);
      expect(fake.calls.filter((c) => c.url === '/api/v1/auth/keys')).toHaveLength(0);
      expect(await readOrcaRouterCredential(dataDir)).toBeNull();
    } finally {
      await fake.close();
    }
  });

  it('does not restore the account when a delayed exchange resolves after Disconnect', async () => {
    // The exchange is held open long enough for Disconnect to land first.
    const fake = await startFakeAuthServer({ delayMs: 150 });
    process.env.ORCA_AUTH_BASE_URL = fake.origin;
    try {
      await startRoutes();
      const started = await post('/api/orcarouter/oauth/start');
      const state = String(started.body.state);
      const code = 'the-real-code';

      // Fire the paste-back, then disconnect while the provider is still
      // deciding. The exchange must lose.
      const completing = post('/api/orcarouter/oauth/complete', { state, code });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const disconnected = await post('/api/orcarouter/oauth/disconnect');
      expect(disconnected.status).toBe(200);

      const completed = await completing;
      expect(completed.status).toBeGreaterThanOrEqual(400);
      // The account the user removed stays removed.
      expect(await readOrcaRouterCredential(dataDir)).toBeNull();
    } finally {
      await fake.close();
    }
  });

  it('advances the credential generation so a Reconnect is distinguishable from still-connected', async () => {
    const fake = await startFakeAuthServer();
    process.env.ORCA_AUTH_BASE_URL = fake.origin;
    try {
      await startRoutes();
      // Seed an existing credential the way a first PKCE login would.
      const first = await post('/api/orcarouter/credentials', { apiKey: FAKE_KEY });
      expect(first.body.generation).toBe(1);
      expect((await getStatus()).generation).toBe(1);

      const started = await post('/api/orcarouter/oauth/start');
      const completed = await post('/api/orcarouter/oauth/complete', {
        state: String(started.body.state),
        code: 'a-fresh-code',
      });
      expect(completed.status).toBe(200);

      // The UI polls this: a changed generation is how it knows the NEW
      // credential landed rather than the old one still being connected.
      const after = await getStatus();
      expect(after.connected).toBe(true);
      expect(after.generation).toBe(2);
    } finally {
      await fake.close();
    }
  });

  it('stops re-issuing a credential the relay rejected, without deleting it', async () => {
    const fake = await startFakeAuthServer({
      respond: () => ({ status: 401, json: { error: 'invalid_api_key' } }),
    });
    process.env.ORCA_API_BASE_URL = fake.origin;
    try {
      await startRoutes();
      await post('/api/orcarouter/credentials', { apiKey: FAKE_KEY });

      const firstCatalogue = await post('/api/orcarouter/models', { capability: 'chat' });
      expect(firstCatalogue.body.ok).toBe(false);
      expect(firstCatalogue.body.degraded).toBe(true);

      const status = await getStatus();
      expect(status.needsReauth).toBe(true);

      // A second discovery must NOT make another provider request with the
      // terminal credential.
      const callsBefore = fake.calls.length;
      const secondCatalogue = await post('/api/orcarouter/models', { capability: 'chat' });
      expect(secondCatalogue.body.ok).toBe(false);
      expect(fake.calls.length).toBe(callsBefore);

      // The record survives for reconnection; only Disconnect removes it.
      const stored = await readOrcaRouterCredential(dataDir);
      expect(stored?.apiKey).toBe(FAKE_KEY);
      expect(stored?.authState).toBe('needsReauth');
    } finally {
      await fake.close();
    }
  });

  it('clears the credential on Disconnect and reports the terminal state', async () => {
    const fake = await startFakeAuthServer();
    process.env.ORCA_BASE_URL = fake.origin;
    try {
      await startRoutes();
      await post('/api/orcarouter/credentials', { apiKey: FAKE_KEY });
      expect((await getStatus()).connected).toBe(true);

      const disconnected = await post('/api/orcarouter/oauth/disconnect');
      expect(disconnected.status).toBe(200);
      expect((await getStatus()).connected).toBe(false);
      expect(await readOrcaRouterCredential(dataDir)).toBeNull();
    } finally {
      await fake.close();
    }
  });

  it('never writes the credential file outside the resolved daemon data root', async () => {
    const fake = await startFakeAuthServer();
    process.env.ORCA_BASE_URL = fake.origin;
    // A separate directory named by the media-config override must not become
    // the credential's home: it exists to relocate media-config.json only.
    const mediaOverride = path.join(dataDir, 'media-config-override');
    process.env.OD_MEDIA_CONFIG_DIR = mediaOverride;
    try {
      await startRoutes();
      await post('/api/orcarouter/credentials', { apiKey: FAKE_KEY });

      const stored = await readFile(path.join(dataDir, 'orcarouter-credentials.json'), 'utf8');
      expect(stored).toContain(FAKE_KEY);
      await expect(readFile(path.join(mediaOverride, 'orcarouter-credentials.json'), 'utf8'))
        .rejects.toThrow();
    } finally {
      delete process.env.OD_MEDIA_CONFIG_DIR;
      await fake.close();
    }
  });
});
