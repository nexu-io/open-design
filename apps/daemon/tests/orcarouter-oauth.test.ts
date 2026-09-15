// OrcaRouter OAuth 2.0 + PKCE connect flow, end to end against a fake auth
// server.
//
// These tests exercise the REAL adapter — `beginOrcaRouterAuth` mints the
// verifier, the one-shot loopback listener receives the redirect, and
// `completeOrcaRouterAuth` redeems the code — rather than poking at the hash
// helpers in isolation. That is the difference between "the S256 math is right"
// and "the connect button works", and only the second one is a feature.
//
// The consent screen itself is deliberately NOT simulated: a real authorize
// requires a human to approve, and no test may fabricate that approval. What is
// simulated is everything on OrcaRouter's side of the redirect.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PendingAuthCache } from '../src/mcp-oauth.js';
import {
  ORCAROUTER_CHALLENGE_METHOD,
  ORCAROUTER_CLIENT_ID,
  OrcaRouterExchangeError,
  assertValidCallbackUrl,
  beginOrcaRouterAuth,
  buildLoopbackCallbackUrl,
  completeOrcaRouterAuth,
} from '../src/integrations/orcarouter-oauth.js';
import {
  safeStateEquals,
  startOrcaRouterCallbackListener,
  type OrcaRouterCallbackListener,
} from '../src/integrations/orcarouter-oauth-server.js';

const FAKE_KEY = 'sk-orca-fakekeyfromfakeauthserver0000000000';
const AUTH_BASE = 'https://www.orcarouter.ai';

/** Records what the fake auth server was asked, so the request shape is asserted. */
interface ExchangeCall {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

/**
 * A stand-in for the OrcaRouter auth origin. It serves `POST
 * /api/v1/auth/keys` and nothing else — the real path, so a client that
 * mistakenly posts to the inference origin's `/v1/auth/keys` fails here.
 */
async function startFakeAuthServer(
  respond: (body: Record<string, unknown>) => { status: number; json: unknown },
): Promise<{ origin: string; calls: ExchangeCall[]; close: () => Promise<void> }> {
  const calls: ExchangeCall[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body: Record<string, unknown> = {};
      try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* keep {} */ }
      calls.push({ url: req.url ?? '', method: req.method ?? '', body });
      const result = respond(body);
      res.statusCode = result.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result.json));
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

/** Minimal browser-side fake: hits the loopback callback the way a real redirect would. */
async function deliverCallback(
  callbackUrl: string,
  query: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const url = new URL(callbackUrl);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
}

describe('OrcaRouter PKCE connect flow', () => {
  let pending: PendingAuthCache;

  beforeEach(() => {
    pending = new PendingAuthCache(10 * 60 * 1000);
  });

  afterEach(() => {
    pending.stop();
  });

  describe('authorize URL', () => {
    it('sends only the S256 challenge — never the verifier', () => {
      const { authorizeUrl, state } = beginOrcaRouterAuth({
        pending,
        authBase: AUTH_BASE,
        callbackUrl: 'http://127.0.0.1:51234/cb',
      });
      const url = new URL(authorizeUrl);
      expect(url.origin + url.pathname).toBe(`${AUTH_BASE}/auth`);
      expect(url.searchParams.get('code_challenge_method')).toBe(ORCAROUTER_CHALLENGE_METHOD);
      expect(url.searchParams.get('code_challenge')).toBeTruthy();

      // The verifier lives in the pending cache and must not appear anywhere on
      // the URL — that is the entire point of PKCE.
      const stored = pending.consume(state);
      expect(stored?.codeVerifier).toBeTruthy();
      expect(authorizeUrl).not.toContain(stored!.codeVerifier);
      // ...and the challenge is not the verifier (that would be `plain`).
      expect(url.searchParams.get('code_challenge')).not.toBe(stored!.codeVerifier);
    });

    it('carries the parameters the consent screen documents', () => {
      const { authorizeUrl } = beginOrcaRouterAuth({
        pending,
        authBase: AUTH_BASE,
        callbackUrl: 'http://127.0.0.1:51234/cb',
        appName: 'OpenDesign',
        scope: 'api',
        loginHint: 'someone@example.invalid',
      });
      const url = new URL(authorizeUrl);
      expect(url.searchParams.get('callback_url')).toBe('http://127.0.0.1:51234/cb');
      expect(url.searchParams.get('app_name')).toBe('OpenDesign');
      expect(url.searchParams.get('scope')).toBe('api');
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('login_hint')).toBe('someone@example.invalid');
    });

    it('mints a fresh verifier and state for every attempt', () => {
      const first = beginOrcaRouterAuth({ pending, authBase: AUTH_BASE, callbackUrl: 'http://127.0.0.1:1/cb' });
      const second = beginOrcaRouterAuth({ pending, authBase: AUTH_BASE, callbackUrl: 'http://127.0.0.1:1/cb' });
      expect(first.state).not.toBe(second.state);
      const a = new URL(first.authorizeUrl).searchParams.get('code_challenge');
      const b = new URL(second.authorizeUrl).searchParams.get('code_challenge');
      expect(a).not.toBe(b);
    });

    it('derives the challenge as unpadded base64url(sha256(verifier))', async () => {
      const { authorizeUrl, state } = beginOrcaRouterAuth({
        pending, authBase: AUTH_BASE, callbackUrl: 'http://127.0.0.1:1/cb',
      });
      const challenge = new URL(authorizeUrl).searchParams.get('code_challenge')!;
      const verifier = pending.consume(state)!.codeVerifier;
      const { createHash } = await import('node:crypto');
      const expected = createHash('sha256').update(verifier).digest('base64url');
      expect(challenge).toBe(expected);
      // No padding, per RFC 7636.
      expect(challenge).not.toContain('=');
    });

    it('builds the loopback callback the consent screen accepts', () => {
      expect(buildLoopbackCallbackUrl(51234)).toBe('http://127.0.0.1:51234/cb');
    });

    it('rejects callback URLs the consent screen would refuse up front', () => {
      expect(() => assertValidCallbackUrl('http://example.com/cb')).toThrow(/loopback|https/i);
      expect(() => assertValidCallbackUrl('http://user:pw@127.0.0.1/cb')).toThrow(/credentials/i);
      expect(() => assertValidCallbackUrl('http://127.0.0.1/cb#frag')).toThrow(/fragment/i);
      // https on any host and port is legal.
      expect(assertValidCallbackUrl('https://staging.example.com:8443/cb'))
        .toBe('https://staging.example.com:8443/cb');
    });
  });

  describe('authorize and exchange origins', () => {
    it('exchanges at {auth}/api/v1/auth/keys and never on the inference origin', async () => {
      const fake = await startFakeAuthServer(() => ({
        status: 200,
        json: { key: FAKE_KEY, user_id: '42', scope: 'api' },
      }));
      try {
        // The daemon's configured auth origin is the fake server here; the point
        // is which PATH is used, which is the mistake that 404s in production.
        pending.put('state-1', {
          serverId: ORCAROUTER_CLIENT_ID,
          authServerIssuer: fake.origin,
          tokenEndpoint: `${fake.origin}/api/v1/auth/keys`,
          clientId: ORCAROUTER_CLIENT_ID,
          redirectUri: 'http://127.0.0.1:1/cb',
          codeVerifier: 'v'.repeat(64),
          createdAt: Date.now(),
        });
        const { exchange } = await completeOrcaRouterAuth({
          pending, state: 'state-1', code: 'code-1',
        });
        expect(exchange.key).toBe(FAKE_KEY);
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]!.method).toBe('POST');
        // Exactly the documented auth path. The inference origin's
        // `/v1/auth/keys` is a 404, and `orcarouter.ts` builds this one from
        // the auth origin's `/api/v1/auth` prefix rather than by swapping a
        // hostname or appending `/v1`.
        expect(fake.calls[0]!.url).toBe('/api/v1/auth/keys');
        expect(fake.calls[0]!.url.startsWith('/api/v1/auth/')).toBe(true);
      } finally {
        await fake.close();
      }
    });

    it('posts the verifier with the S256 method marker (downgrade defence)', async () => {
      const fake = await startFakeAuthServer(() => ({
        status: 200, json: { key: FAKE_KEY, scope: 'api' },
      }));
      try {
        const verifier = 'verifier-'.padEnd(64, 'x');
        pending.put('state-2', {
          serverId: ORCAROUTER_CLIENT_ID,
          authServerIssuer: fake.origin,
          tokenEndpoint: `${fake.origin}/api/v1/auth/keys`,
          clientId: ORCAROUTER_CLIENT_ID,
          redirectUri: 'http://127.0.0.1:1/cb',
          codeVerifier: verifier,
          createdAt: Date.now(),
        });
        await completeOrcaRouterAuth({ pending, state: 'state-2', code: 'the-code' });
        expect(fake.calls[0]!.body).toEqual({
          code: 'the-code',
          code_verifier: verifier,
          code_challenge_method: 'S256',
        });
      } finally {
        await fake.close();
      }
    });
  });

  describe('failure modes end safely', () => {
    it('rejects a replayed state without calling the auth server', async () => {
      const fake = await startFakeAuthServer(() => ({
        status: 200, json: { key: FAKE_KEY, scope: 'api' },
      }));
      try {
        pending.put('state-3', {
          serverId: ORCAROUTER_CLIENT_ID,
          authServerIssuer: fake.origin,
          tokenEndpoint: `${fake.origin}/api/v1/auth/keys`,
          clientId: ORCAROUTER_CLIENT_ID,
          redirectUri: 'http://127.0.0.1:1/cb',
          codeVerifier: 'v'.repeat(64),
          createdAt: Date.now(),
        });
        await completeOrcaRouterAuth({ pending, state: 'state-3', code: 'c' });
        // Second use of the same state: single-use, so it is gone.
        await expect(completeOrcaRouterAuth({ pending, state: 'state-3', code: 'c' }))
          .rejects.toBeInstanceOf(OrcaRouterExchangeError);
        expect(fake.calls).toHaveLength(1);
      } finally {
        await fake.close();
      }
    });

    it('surfaces an expired or unknown code as a 403 exchange error', async () => {
      const fake = await startFakeAuthServer(() => ({
        status: 403,
        json: { error: 'invalid_grant', error_description: 'code expired' },
      }));
      try {
        pending.put('state-4', {
          serverId: ORCAROUTER_CLIENT_ID,
          authServerIssuer: fake.origin,
          tokenEndpoint: `${fake.origin}/api/v1/auth/keys`,
          clientId: ORCAROUTER_CLIENT_ID,
          redirectUri: 'http://127.0.0.1:1/cb',
          codeVerifier: 'v'.repeat(64),
          createdAt: Date.now(),
        });
        const err = await completeOrcaRouterAuth({ pending, state: 'state-4', code: 'expired' })
          .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(OrcaRouterExchangeError);
        expect((err as OrcaRouterExchangeError).status).toBe(403);
        // The OAuth envelope is surfaced, and nothing else comes along with it.
        expect((err as Error).message).toContain('invalid_grant');
        expect((err as Error).message).not.toContain('v'.repeat(64));
      } finally {
        await fake.close();
      }
    });

    it('maps a network failure to a rejected exchange, not a hang', async () => {
      pending.put('state-5', {
        serverId: ORCAROUTER_CLIENT_ID,
        authServerIssuer: AUTH_BASE,
        // Nothing is listening here.
        tokenEndpoint: 'http://127.0.0.1:1/api/v1/auth/keys',
        clientId: ORCAROUTER_CLIENT_ID,
        redirectUri: 'http://127.0.0.1:1/cb',
        codeVerifier: 'v'.repeat(64),
        createdAt: Date.now(),
      });
      await expect(completeOrcaRouterAuth({ pending, state: 'state-5', code: 'c' }))
        .rejects.toBeTruthy();
    });

    it('never leaks the verifier into a failure message', async () => {
      const fake = await startFakeAuthServer(() => ({ status: 500, json: { error: 'boom' } }));
      try {
        const verifier = 'super-secret-verifier-'.padEnd(64, 'z');
        pending.put('state-6', {
          serverId: ORCAROUTER_CLIENT_ID,
          authServerIssuer: fake.origin,
          tokenEndpoint: `${fake.origin}/api/v1/auth/keys`,
          clientId: ORCAROUTER_CLIENT_ID,
          redirectUri: 'http://127.0.0.1:1/cb',
          codeVerifier: verifier,
          createdAt: Date.now(),
        });
        const err = await completeOrcaRouterAuth({ pending, state: 'state-6', code: 'c' })
          .catch((e: unknown) => e);
        expect((err as Error).message).not.toContain(verifier);
      } finally {
        await fake.close();
      }
    });
  });

  describe('loopback listener', () => {
    let listener: OrcaRouterCallbackListener | null = null;

    afterEach(async () => {
      await listener?.stop();
      listener = null;
    });

    it('compares state in constant time and rejects a mismatch', () => {
      expect(safeStateEquals('abc123', 'abc123')).toBe(true);
      expect(safeStateEquals('abc123', 'abc124')).toBe(false);
      expect(safeStateEquals('abc123', 'abc1234')).toBe(false);
      expect(safeStateEquals('', '')).toBe(false);
    });

    it('delivers the code, then closes so the port is not held', async () => {
      const outcomes: string[] = [];
      listener = await startOrcaRouterCallbackListener({
        expectedState: () => 'expected-state',
        onCallback: (outcome) => { outcomes.push(outcome.kind); },
      });
      const callbackUrl = `http://${listener.address.host}:${listener.address.port}/cb`;
      const result = await deliverCallback(callbackUrl, { code: 'auth-code', state: 'expected-state' });
      expect(result.status).toBe(200);
      expect(result.body).toContain('close this tab');
      expect(outcomes).toEqual(['ok']);
    });

    it('reports a denial with the reason instead of waiting out the timeout', async () => {
      const seen: Array<{ kind: string; error?: string }> = [];
      listener = await startOrcaRouterCallbackListener({
        expectedState: () => 'expected-state',
        onCallback: (o) => { seen.push(o.kind === 'error' ? { kind: o.kind, error: o.error } : { kind: o.kind }); },
      });
      const callbackUrl = `http://${listener.address.host}:${listener.address.port}/cb`;
      const result = await deliverCallback(callbackUrl, {
        error: 'access_denied', state: 'expected-state',
      });
      expect(result.status).toBe(400);
      expect(seen).toEqual([{ kind: 'error', error: 'access_denied' }]);
    });

    it('does NOT consume the listener when the state does not match', async () => {
      // A stale tab replaying an old redirect must not kill the port the real
      // callback still needs.
      const seen: string[] = [];
      listener = await startOrcaRouterCallbackListener({
        expectedState: () => 'expected-state',
        onCallback: (o) => { seen.push(o.kind); },
      });
      const callbackUrl = `http://${listener.address.host}:${listener.address.port}/cb`;

      const stale = await deliverCallback(callbackUrl, { code: 'stale', state: 'someone-elses-state' });
      expect(stale.status).toBe(400);
      expect(seen).toHaveLength(0);

      // The real callback still lands.
      const real = await deliverCallback(callbackUrl, { code: 'real', state: 'expected-state' });
      expect(real.status).toBe(200);
      expect(seen).toEqual(['ok']);
    });

    it('ignores incidental browser requests so they cannot consume the slot', async () => {
      const seen: string[] = [];
      listener = await startOrcaRouterCallbackListener({
        expectedState: () => 'expected-state',
        onCallback: (o) => { seen.push(o.kind); },
      });
      const notFound = await fetch(
        `http://${listener.address.host}:${listener.address.port}/favicon.ico`,
      );
      expect(notFound.status).toBe(404);
      expect(seen).toHaveLength(0);
    });

    it('reports a timeout as an error rather than hanging forever', async () => {
      const seen: string[] = [];
      listener = await startOrcaRouterCallbackListener({
        expectedState: () => 'expected-state',
        onCallback: (o) => { seen.push(o.kind === 'error' ? `error:${o.error}` : o.kind); },
        timeoutMs: 30,
      });
      await new Promise((resolve) => setTimeout(resolve, 160));
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatch(/^error:/);
      expect(seen[0]).toMatch(/timed out/i);
    });
  });

  describe('full connect, fake auth server', () => {
    it('authorize -> callback -> exchange -> credential', async () => {
      const fake = await startFakeAuthServer(() => ({
        status: 200, json: { key: FAKE_KEY, user_id: '777', scope: 'api' },
      }));
      let listener: OrcaRouterCallbackListener | null = null;
      try {
        const pendingCache = new PendingAuthCache(10 * 60 * 1000);
        // The daemon binds first and reads the state lazily, exactly as the
        // route does — this catches a regression where the listener is handed
        // the state before it exists.
        let expectedState = '';
        let received: { state: string; code: string } | null = null;
        listener = await startOrcaRouterCallbackListener({
          expectedState: () => expectedState,
          onCallback: (outcome) => {
            if (outcome.kind === 'ok') received = { state: outcome.state, code: outcome.code };
          },
        });
        const callbackUrl = buildLoopbackCallbackUrl(listener.address.port);
        const { authorizeUrl, state } = beginOrcaRouterAuth({
          pending: pendingCache, authBase: fake.origin, callbackUrl,
        });
        expectedState = state;

        // What the browser would do after the user approves.
        await deliverCallback(callbackUrl, { code: 'the-real-code', state });
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(received).not.toBeNull();
        // The exchange endpoint is the auth origin's; the fake server asserts it.
        const { exchange } = await completeOrcaRouterAuth({
          pending: pendingCache,
          state: received!.state,
          code: received!.code,
          fetchImpl: (input, init) => {
            // Redirect the documented exchange path at the fake origin while
            // keeping the path assertion meaningful.
            const u = new URL(String(input));
            return fetch(new URL(u.pathname, fake.origin), init);
          },
        });
        expect(exchange).toEqual({ key: FAKE_KEY, user_id: '777', scope: 'api' });
        expect(fake.calls.at(-1)!.url).toBe('/api/v1/auth/keys');
        pendingCache.stop();
      } finally {
        await listener?.stop();
        await fake.close();
      }
    });
  });
});
