import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PendingAuthCache,
  beginAuth,
  buildAuthorizeUrl,
  deriveCodeChallenge,
  discoverAuthServer,
  discoverProtectedResource,
  exchangeCodeForToken,
  generateCodeVerifier,
  generateState,
  getOrRegisterClient,
  refreshAccessToken,
} from '../src/mcp-oauth.js';

// Tiny fetch mock — looks up the URL in a Map and returns canned JSON.
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function makeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  return async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const route = routes[url];
    if (!route) {
      return new Response(`unknown url ${url}`, { status: 404 });
    }
    void init;
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

describe('PKCE helpers', () => {
  it('generates a 43+ char code_verifier per RFC 7636', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates a different verifier each call (randomness sanity check)', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });

  it('derives a S256 challenge that matches the spec example', () => {
    // RFC 7636 Appendix B test vector.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(deriveCodeChallenge(verifier)).toBe(expected);
  });

  it('derived challenge is exactly base64url(sha256(verifier))', () => {
    const verifier = generateCodeVerifier();
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(deriveCodeChallenge(verifier)).toBe(expected);
  });

  it('generates a base64url-safe state token', () => {
    const state = generateState();
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state.length).toBeGreaterThan(20);
  });
});

describe('discoverProtectedResource', () => {
  it('fetches the path-suffixed metadata when present', async () => {
    const fetchImpl = makeFetch({
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': {
        body: {
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: ['https://auth.example.com'],
          scopes_supported: ['read'],
        },
      },
    });
    const out = await discoverProtectedResource(
      'https://mcp.example.com/mcp',
      fetchImpl as typeof fetch,
    );
    expect(out?.resource).toBe('https://mcp.example.com/mcp');
    expect(out?.authorization_servers).toEqual(['https://auth.example.com']);
  });

  it('falls back to the bare well-known when the path-suffixed form 404s', async () => {
    const fetchImpl = makeFetch({
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': {
        status: 404,
        body: {},
      },
      'https://mcp.example.com/.well-known/oauth-protected-resource': {
        body: {
          resource: 'https://mcp.example.com',
          authorization_servers: ['https://mcp.example.com'],
        },
      },
    });
    const out = await discoverProtectedResource(
      'https://mcp.example.com/mcp',
      fetchImpl as typeof fetch,
    );
    expect(out?.authorization_servers).toEqual(['https://mcp.example.com']);
  });

  it('returns null when neither candidate responds', async () => {
    const fetchImpl = makeFetch({});
    const out = await discoverProtectedResource(
      'https://mcp.example.com/mcp',
      fetchImpl as typeof fetch,
    );
    expect(out).toBeNull();
  });
});

describe('discoverAuthServer', () => {
  it('parses an oauth-authorization-server document', async () => {
    const fetchImpl = makeFetch({
      'https://auth.example.com/.well-known/oauth-authorization-server': {
        body: {
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          registration_endpoint: 'https://auth.example.com/register',
        },
      },
    });
    const out = await discoverAuthServer(
      'https://auth.example.com',
      fetchImpl as typeof fetch,
    );
    expect(out?.token_endpoint).toBe('https://auth.example.com/token');
    expect(out?.registration_endpoint).toBe('https://auth.example.com/register');
  });

  it('falls back to openid-configuration when oauth-authorization-server is absent', async () => {
    const fetchImpl = makeFetch({
      'https://auth.example.com/.well-known/openid-configuration': {
        body: {
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/oidc/auth',
          token_endpoint: 'https://auth.example.com/oidc/token',
        },
      },
    });
    const out = await discoverAuthServer(
      'https://auth.example.com',
      fetchImpl as typeof fetch,
    );
    expect(out?.authorization_endpoint).toBe('https://auth.example.com/oidc/auth');
  });
});

describe('buildAuthorizeUrl', () => {
  it('emits all the required PKCE-flow parameters', () => {
    const url = buildAuthorizeUrl({
      authServer: {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
      },
      clientId: 'client-xyz',
      redirectUri: 'https://app.example.com/api/mcp/oauth/callback',
      state: 'state-abc',
      codeChallenge: 'challenge-pqr',
      scope: 'openid email',
      resource: 'https://mcp.example.com/mcp',
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://auth.example.com/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('client-xyz');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/api/mcp/oauth/callback',
    );
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge-pqr');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('scope')).toBe('openid email');
    expect(parsed.searchParams.get('resource')).toBe('https://mcp.example.com/mcp');
  });
});

describe('client registration cache', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-mcp-oauth-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('registers a fresh client and persists it for reuse', async () => {
    let registerHits = 0;
    const fetchImpl = (async (input: FetchInput, init?: FetchInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://auth.example.com/register') {
        registerHits++;
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        expect(body?.redirect_uris).toEqual([
          'https://app.example.com/api/mcp/oauth/callback',
        ]);
        return new Response(
          JSON.stringify({ client_id: 'fresh-client-id' }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('?', { status: 404 });
    }) as typeof fetch;

    const meta = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      registration_endpoint: 'https://auth.example.com/register',
    };

    const a = await getOrRegisterClient(
      dataDir,
      meta,
      'https://app.example.com/api/mcp/oauth/callback',
      fetchImpl,
    );
    expect(a.clientId).toBe('fresh-client-id');
    expect(registerHits).toBe(1);

    const b = await getOrRegisterClient(
      dataDir,
      meta,
      'https://app.example.com/api/mcp/oauth/callback',
      fetchImpl,
    );
    expect(b.clientId).toBe('fresh-client-id');
    expect(registerHits).toBe(1); // cached, no second register

    const cacheFile = JSON.parse(
      await readFile(path.join(dataDir, 'mcp-oauth-clients.json'), 'utf8'),
    );
    expect(cacheFile.clients).toHaveLength(1);
    expect(cacheFile.clients[0].clientId).toBe('fresh-client-id');
  });

  it('does not register when the cache file already pins a matching client', async () => {
    await writeFile(
      path.join(dataDir, 'mcp-oauth-clients.json'),
      JSON.stringify({
        clients: [
          {
            authServerIssuer: 'https://auth.example.com',
            redirectUri: 'https://app.example.com/api/mcp/oauth/callback',
            clientId: 'pinned-client',
            registeredAt: 0,
          },
        ],
      }),
    );
    const fetchImpl = (async () => {
      throw new Error('fetch should not be called when cache hits');
    }) as unknown as typeof fetch;
    const out = await getOrRegisterClient(
      dataDir,
      {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
      },
      'https://app.example.com/api/mcp/oauth/callback',
      fetchImpl,
    );
    expect(out.clientId).toBe('pinned-client');
  });
});

describe('exchangeCodeForToken / refreshAccessToken', () => {
  it('POSTs the form-encoded grant_type=authorization_code with PKCE verifier', async () => {
    let captured: { headers: Record<string, string>; body: string } | null = null;
    const fetchImpl = (async (input: FetchInput, init?: FetchInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://auth.example.com/token') {
        captured = {
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: String(init?.body ?? ''),
        };
        return new Response(
          JSON.stringify({
            access_token: 'tok-xyz',
            token_type: 'Bearer',
            refresh_token: 'ref-xyz',
            expires_in: 3600,
            scope: 'a b',
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('?', { status: 404 });
    }) as typeof fetch;

    const out = await exchangeCodeForToken(
      {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'cid',
        redirectUri: 'https://app.example.com/cb',
        code: 'AUTHCODE',
        codeVerifier: 'verifier-1',
        resource: 'https://mcp.example.com/mcp',
      },
      fetchImpl,
    );
    expect(out.access_token).toBe('tok-xyz');
    expect(captured).not.toBeNull();
    const params = new URLSearchParams(captured!.body);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('AUTHCODE');
    expect(params.get('client_id')).toBe('cid');
    expect(params.get('code_verifier')).toBe('verifier-1');
    expect(params.get('redirect_uri')).toBe('https://app.example.com/cb');
    expect(params.get('resource')).toBe('https://mcp.example.com/mcp');
  });

  it('refresh exchange uses grant_type=refresh_token', async () => {
    let captured = '';
    const fetchImpl = (async (input: FetchInput, init?: FetchInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://auth.example.com/token') {
        captured = String(init?.body ?? '');
        return new Response(
          JSON.stringify({ access_token: 'rotated', token_type: 'Bearer' }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('?', { status: 404 });
    }) as typeof fetch;

    const out = await refreshAccessToken(
      {
        tokenEndpoint: 'https://auth.example.com/token',
        clientId: 'cid',
        refreshToken: 'old-refresh',
      },
      fetchImpl,
    );
    expect(out.access_token).toBe('rotated');
    const params = new URLSearchParams(captured);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('old-refresh');
  });

  it('throws when the token endpoint returns a non-2xx', async () => {
    const fetchImpl = (async () =>
      new Response('access_denied', { status: 400 })) as unknown as typeof fetch;
    await expect(
      exchangeCodeForToken(
        {
          tokenEndpoint: 'https://auth.example.com/token',
          clientId: 'cid',
          redirectUri: 'https://app.example.com/cb',
          code: 'AUTHCODE',
          codeVerifier: 'verifier-1',
        },
        fetchImpl,
      ),
    ).rejects.toThrow(/HTTP 400/);
  });
});

describe('PendingAuthCache', () => {
  it('round-trips a value through put/consume', () => {
    const cache = new PendingAuthCache(60_000);
    cache.put('state-1', {
      serverId: 'higgsfield',
      authServerIssuer: 'https://auth.example.com',
      tokenEndpoint: 'https://auth.example.com/token',
      clientId: 'cid',
      redirectUri: 'https://app.example.com/cb',
      codeVerifier: 'verifier',
      createdAt: Date.now(),
    });
    expect(cache.size()).toBe(1);
    const got = cache.consume('state-1');
    expect(got?.serverId).toBe('higgsfield');
    expect(cache.consume('state-1')).toBeNull();
    cache.stop();
  });

  it('drops entries past TTL', () => {
    const cache = new PendingAuthCache(10);
    cache.put('s', {
      serverId: 'x',
      authServerIssuer: 'i',
      tokenEndpoint: 't',
      clientId: 'c',
      redirectUri: 'r',
      codeVerifier: 'v',
      createdAt: Date.now() - 1000,
    });
    expect(cache.consume('s')).toBeNull();
    cache.stop();
  });
});

describe('beginAuth (end-to-end with mocked discovery + DCR)', () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-mcp-begin-'));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('discovers, registers, generates PKCE, returns a usable authorize URL', async () => {
    let registerHits = 0;
    const fetchImpl = (async (input: FetchInput, init?: FetchInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const routes: Record<string, { status?: number; body: unknown }> = {
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp': {
          body: {
            resource: 'https://mcp.example.com/mcp',
            authorization_servers: ['https://auth.example.com'],
            scopes_supported: ['mcp:tools'],
          },
        },
        'https://auth.example.com/.well-known/oauth-authorization-server': {
          body: {
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            registration_endpoint: 'https://auth.example.com/register',
          },
        },
      };
      if (url === 'https://auth.example.com/register') {
        registerHits++;
        return new Response(
          JSON.stringify({ client_id: 'cid-1' }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      const route = routes[url];
      if (!route) return new Response('404', { status: 404 });
      void init;
      return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
    }) as typeof fetch;

    const out = await beginAuth({
      serverId: 'higgsfield',
      serverUrl: 'https://mcp.example.com/mcp',
      redirectUri: 'https://app.example.com/api/mcp/oauth/callback',
      dataDir,
      fetchImpl,
    });

    expect(registerHits).toBe(1);
    const u = new URL(out.authorizeUrl);
    expect(u.origin + u.pathname).toBe('https://auth.example.com/authorize');
    expect(u.searchParams.get('client_id')).toBe('cid-1');
    expect(u.searchParams.get('state')).toBe(out.state);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('scope')).toBe('mcp:tools');
    expect(u.searchParams.get('resource')).toBe('https://mcp.example.com/mcp');
    expect(out.pending.tokenEndpoint).toBe('https://auth.example.com/token');
    expect(out.pending.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(out.pending.serverId).toBe('higgsfield');
  });

  it('falls back to the resource origin when no protected-resource metadata is published', async () => {
    const fetchImpl = (async (input: FetchInput, init?: FetchInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      // Both discovery probes for the resource come back 404 — caller falls
      // back to assuming the origin IS the auth server.
      if (url.endsWith('/oauth-protected-resource/mcp')) {
        return new Response('404', { status: 404 });
      }
      if (url.endsWith('/oauth-protected-resource')) {
        return new Response('404', { status: 404 });
      }
      if (url === 'https://mcp.example.com/.well-known/oauth-authorization-server') {
        return new Response(
          JSON.stringify({
            issuer: 'https://mcp.example.com',
            authorization_endpoint: 'https://mcp.example.com/authorize',
            token_endpoint: 'https://mcp.example.com/token',
            registration_endpoint: 'https://mcp.example.com/register',
          }),
        );
      }
      if (url === 'https://mcp.example.com/register') {
        return new Response(JSON.stringify({ client_id: 'cid-fallback' }), { status: 201 });
      }
      void init;
      return new Response('?', { status: 404 });
    }) as typeof fetch;

    const out = await beginAuth({
      serverId: 'h',
      serverUrl: 'https://mcp.example.com/mcp',
      redirectUri: 'https://app.example.com/cb',
      dataDir,
      fetchImpl,
    });
    expect(new URL(out.authorizeUrl).origin).toBe('https://mcp.example.com');
  });

  it('throws when the auth server cannot be discovered', async () => {
    const fetchImpl = (async () => new Response('404', { status: 404 })) as unknown as typeof fetch;
    await expect(
      beginAuth({
        serverId: 'h',
        serverUrl: 'https://mcp.example.com/mcp',
        redirectUri: 'https://app.example.com/cb',
        dataDir,
        fetchImpl,
      }),
    ).rejects.toThrow(/could not discover/i);
  });
});
