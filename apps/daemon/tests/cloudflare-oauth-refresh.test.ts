// Cloudflare OAuth refresh-token path tests.
//
// Covers the offline_access -> refresh_token -> auto-refresh chain that keeps
// a Cloudflare connection alive past the 3600s access-token TTL:
//   (a) the authorize URL always requests `offline_access` in its scope param
//   (b) a token response that carries a refresh_token persists it to the record
//   (c) a refresh call reuses refreshCloudflareToken with the stored refreshToken

import fs from 'node:fs';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  beginCloudflareAuth,
  completeCloudflareAuth,
  refreshCloudflareToken,
  CLOUDFLARE_OAUTH_SCOPES,
  CLOUDFLARE_OFFLINE_ACCESS_SCOPE,
  mergeOfflineAccessScope,
} from '../src/integrations/cloudflare-oauth.js';
import {
  CLOUDFLARE_OAUTH_UNKNOWN_EXPIRY_TTL_MS,
  clearCloudflareOAuthToken,
  clearCloudflareOAuthTokenForRevoke,
  cloudflareOAuthExpiresAt,
  getCloudflareOAuthToken,
  getPendingCloudflareOAuthRevokes,
  isCloudflareOAuthTokenExpired,
  sanitizeCloudflareOAuthTokensFile,
  setCloudflareOAuthToken,
  setCloudflareOAuthTokenGuarded,
  setCloudflareOAuthTokenIfGenerationMatches,
  type StoredCloudflareOAuthToken,
} from '../src/integrations/cloudflare-tokens.js';
import { PendingAuthCache } from '../src/mcp-oauth.js';
import {
  classifyCloudflareRefreshFailure,
  CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS,
  CLOUDFLARE_OAUTH_REFRESH_TIMEOUT_MS,
  cloudflareOAuthTokensDir,
  configureCloudflareWorkersDataDir,
  getCloudflareAccessToken,
  settlePendingCloudflareOAuthGrantRevokes,
  writeCloudflareWorkersConfig,
} from '../src/deploy.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

// Canned token-endpoint response; the code under test never inspects the URL
// beyond the endpoint it was handed, so one static fetch is enough.
function tokenFetch(
  body: unknown,
  onCall?: (init?: FetchInit) => void,
): typeof fetch {
  return (async (input: FetchInput, init?: FetchInit) => {
    void input;
    onCall?.(init);
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

/** Intercept the RFC 7009 revoke endpoint and record which token each call
 * carried, so a suite can assert a rotated grant nobody holds was revoked. */
function revokeSink(revoked: string[]) {
  return (input: unknown, init?: unknown): Response | null => {
    if (!String(input).includes('oauth2/revoke')) return null;
    const form = new URLSearchParams(String((init as RequestInit | undefined)?.body ?? ''));
    revoked.push(form.get('token') ?? '');
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

describe('offline_access scope', () => {
  it('includes offline_access in the default scope set', () => {
    expect(CLOUDFLARE_OAUTH_SCOPES).toContain(CLOUDFLARE_OFFLINE_ACCESS_SCOPE);
  });

  it('merges offline_access into a custom scope list without duplicates', () => {
    expect(mergeOfflineAccessScope(['workers-scripts.write'])).toEqual([
      'workers-scripts.write',
      CLOUDFLARE_OFFLINE_ACCESS_SCOPE,
    ]);
    expect(
      mergeOfflineAccessScope([CLOUDFLARE_OFFLINE_ACCESS_SCOPE, 'zone.read']),
    ).toEqual([CLOUDFLARE_OFFLINE_ACCESS_SCOPE, 'zone.read']);
  });

  it('always includes offline_access in the authorize URL scope param', () => {
    const pending = new PendingAuthCache(60_000);
    // Default scopes.
    const def = beginCloudflareAuth({ pending, clientId: 'cid' });
    expect(new URL(def.authorizeUrl).searchParams.get('scope')?.split(' ')).toContain(
      CLOUDFLARE_OFFLINE_ACCESS_SCOPE,
    );

    // Custom scopes that omit offline_access still get it merged in.
    const custom = beginCloudflareAuth({
      pending,
      clientId: 'cid',
      scopes: ['workers-scripts.write', 'zone.read'],
    });
    expect(new URL(custom.authorizeUrl).searchParams.get('scope')?.split(' ')).toContain(
      CLOUDFLARE_OFFLINE_ACCESS_SCOPE,
    );
    pending.stop();
  });
});

describe('refresh_token capture + persistence', () => {
  it('returns the refresh_token from the code exchange', async () => {
    const pending = new PendingAuthCache(60_000);
    const { state } = beginCloudflareAuth({ pending, clientId: 'cid' });
    let body = '';
    const fetchImpl = tokenFetch(
      {
        access_token: 'acc-token',
        token_type: 'Bearer',
        refresh_token: 'ref-token-123',
        expires_in: 3600,
      },
      (init) => {
        body = String(init?.body ?? '');
      },
    );

    const resp = await completeCloudflareAuth({
      pending,
      state,
      code: 'AUTHCODE',
      fetchImpl,
    });

    expect(resp.refresh_token).toBe('ref-token-123');
    const params = new URLSearchParams(body);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('AUTHCODE');
    pending.stop();
  });

  it('persists refreshToken to the stored record and assigns a fresh generation', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-'));
    try {
      const stored: StoredCloudflareOAuthToken = {
        accessToken: 'acc',
        tokenType: 'Bearer',
        refreshToken: 'ref-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 0,
        savedAt: Date.now(),
      };
      await setCloudflareOAuthToken(dataDir, stored);

      const read = await getCloudflareOAuthToken(dataDir);
      expect(read?.refreshToken).toBe('ref-abc');
      // The store owns generation now (monotonic, survives clear) — the caller's
      // placeholder is overwritten with the first write's value.
      expect(read?.generation).toBe(1);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('sanitizeCloudflareOAuthTokensFile keeps refreshToken', () => {
    const out = sanitizeCloudflareOAuthTokensFile({
      token: {
        accessToken: 'acc',
        tokenType: 'Bearer',
        refreshToken: 'ref-xyz',
        generation: 3,
        savedAt: 1,
      },
    });
    expect(out.token?.refreshToken).toBe('ref-xyz');
  });
});

describe('refresh path', () => {
  it('refreshes with the stored refreshToken via refreshCloudflareToken', async () => {
    let body = '';
    const fetchImpl = tokenFetch(
      {
        access_token: 'rotated-token',
        token_type: 'Bearer',
        refresh_token: 'ref-rotated',
        expires_in: 3600,
      },
      (init) => {
        body = String(init?.body ?? '');
      },
    );

    const resp = await refreshCloudflareToken({
      clientId: 'cid',
      refreshToken: 'ref-token-123',
      fetchImpl,
    });

    expect(resp.access_token).toBe('rotated-token');
    expect(resp.refresh_token).toBe('ref-rotated');
    const params = new URLSearchParams(body);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('ref-token-123');
    expect(params.get('client_id')).toBe('cid');
  });
});

describe('getCloudflareAccessToken identity guard', () => {
  it('trusts a fresh token issued to a different client (token is authoritative)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-identity-'));
    configureCloudflareWorkersDataDir(dir);
    try {
      // The token is the authoritative record: it carries its own clientId.
      // A stale config clientId (e.g. after a crash between the token write
      // and the config-identity write) must NOT break a working credential.
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'acc-token',
        tokenType: 'Bearer',
        clientId: 'client-old',
        redirectUri: 'http://127.0.0.1:56122/callback',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await writeCloudflareWorkersConfig({
        credentialMode: 'oauth',
        accountId: 'acct_test',
        clientId: 'client-new',
      });
      await expect(getCloudflareAccessToken()).resolves.toBe('acc-token');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('writeCloudflareWorkersConfig credential mode validation', () => {
  it('rejects an unknown credential mode before saving', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-mode-'));
    configureCloudflareWorkersDataDir(dir);
    try {
      await expect(
        writeCloudflareWorkersConfig({
          credentialMode: 'totp',
          accountId: 'acct_test',
          token: 'tok',
        }),
      ).rejects.toMatchObject({ code: 'CFW_INVALID_CREDENTIAL_MODE' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('refresh vs disconnect', () => {
  it('does not resurrect a token when disconnect clears it mid-refresh', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-race-'));
    configureCloudflareWorkersDataDir(dir);
    // Establish an expired OAuth token so getCloudflareAccessToken() takes the
    // refresh path (the oauth credentialMode flip needs a durable token first).
    await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      refreshToken: 'ref-token',
      clientId: 'client-abc',
      expiresAt: Date.now() - 1000,
      generation: 5,
      savedAt: Date.now(),
    });
    await writeCloudflareWorkersConfig({
      credentialMode: 'oauth',
      accountId: 'acct_test',
      clientId: 'client-abc',
    });

    let releaseToken!: (resp: Response) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const revoked: string[] = [];
    const revoke = revokeSink(revoked);
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('oauth2/token')) {
        markStarted();
        return new Promise<Response>((resolve) => { releaseToken = resolve; });
      }
      return revoke(input, init) ?? realFetch(input as never, init as never);
    });

    try {
      const refreshPromise = getCloudflareAccessToken();
      await started;
      // Disconnect clears the token while the refresh token-endpoint call is
      // still in flight.
      await clearCloudflareOAuthToken(cloudflareOAuthTokensDir());
      releaseToken(
        new Response(
          JSON.stringify({
            access_token: 'fresh',
            token_type: 'Bearer',
            refresh_token: 'ref-2',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      await expect(refreshPromise).rejects.toMatchObject({
        code: 'CFW_OAUTH_RECONNECT_REQUIRED',
      });
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toBeNull();
      // The grant the endpoint rotated to was never persisted: nobody holds
      // `ref-2`, so it must not stay valid on Cloudflare's side.
      expect(revoked).toEqual(['ref-2']);
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('token file without lastGeneration', () => {
  it('sanitize seeds lastGeneration from the token, but never overrides an explicit value', () => {
    const token = { accessToken: 'acc', tokenType: 'Bearer', generation: 3, savedAt: 1 };
    expect(sanitizeCloudflareOAuthTokensFile({ token }).lastGeneration).toBe(3);
    expect(sanitizeCloudflareOAuthTokensFile({ lastGeneration: 7, token }).lastGeneration).toBe(7);
    expect(sanitizeCloudflareOAuthTokensFile({}).lastGeneration).toBeUndefined();
  });

  it('lets the compare-and-set refresh persist against a legacy file', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-cf-legacy-file-'));
    try {
      await writeFile(
        path.join(dataDir, 'cloudflare-oauth-tokens.json'),
        JSON.stringify({
          token: { accessToken: 'expired', tokenType: 'Bearer', refreshToken: 'ref', generation: 3, savedAt: 1, expiresAt: 1 },
        }),
      );
      const current = await getCloudflareOAuthToken(dataDir);
      expect(current?.generation).toBe(3);
      // Before the seed this always returned false (undefined !== 3), so the
      // expired access token was handed out forever.
      const ok = await setCloudflareOAuthTokenIfGenerationMatches(
        dataDir,
        { accessToken: 'fresh', tokenType: 'Bearer', refreshToken: 'ref-2', generation: 0, savedAt: Date.now() },
        current!.generation,
      );
      expect(ok).toBe(true);
      expect((await getCloudflareOAuthToken(dataDir))?.accessToken).toBe('fresh');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe('refresh failure classification', () => {
  it('maps a token-endpoint 4xx to reconnect and anything else to a transient upstream failure', () => {
    expect(
      classifyCloudflareRefreshFailure(new Error('token endpoint rejected request: HTTP 400 Bad Request {"error":"invalid_grant"}')),
    ).toMatchObject({ status: 401, code: 'CFW_OAUTH_RECONNECT_REQUIRED' });
    expect(
      classifyCloudflareRefreshFailure(new Error('token endpoint rejected request: HTTP 503 Service Unavailable')),
    ).toMatchObject({ status: 502, code: 'CFW_OAUTH_REFRESH_FAILED' });
    expect(classifyCloudflareRefreshFailure(new TypeError('fetch failed'))).toMatchObject({
      status: 502,
      code: 'CFW_OAUTH_REFRESH_FAILED',
    });
  });

  it('maps a timed-out token-endpoint call (AbortSignal.timeout) to a transient CFW_OAUTH_REFRESH_FAILED, never a reconnect', () => {
    const timedOut = classifyCloudflareRefreshFailure(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    expect(timedOut).toMatchObject({ status: 502, code: 'CFW_OAUTH_REFRESH_FAILED' });
    expect(timedOut.message).toMatch(/timed out/);
    expect(classifyCloudflareRefreshFailure(new DOMException('This operation was aborted', 'AbortError'))).toMatchObject({
      status: 502,
      code: 'CFW_OAUTH_REFRESH_FAILED',
    });
  });

  it('a token-endpoint call that hits the refresh deadline surfaces as CFW_OAUTH_REFRESH_FAILED and keeps the grant', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-timeout-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    await setCloudflareOAuthToken(dataDir, {
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      refreshToken: 'ref-still-good',
      clientId: 'client-abc',
      expiresAt: Date.now() - 1000,
      generation: 0,
      savedAt: Date.now(),
    });
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      if (String(input).includes('oauth2/token')) {
        signal = init?.signal ?? undefined;
        // What undici throws when the request's AbortSignal.timeout fires.
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      throw new Error('unexpected fetch ' + String(input));
    });
    try {
      await expect(getCloudflareAccessToken()).rejects.toMatchObject({ status: 502, code: 'CFW_OAUTH_REFRESH_FAILED' });
      expect(signal).toBeInstanceOf(AbortSignal);
      // Cloudflare never answered: the stored grant is still the user's and is not discarded.
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ refreshToken: 'ref-still-good' });
      expect(CLOUDFLARE_OAUTH_REFRESH_TIMEOUT_MS).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a dead refresh token surfaces as 401 CFW_OAUTH_RECONNECT_REQUIRED, not a raw 400', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-dead-'));
    configureCloudflareWorkersDataDir(dir);
    await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      refreshToken: 'ref-revoked',
      clientId: 'client-abc',
      expiresAt: Date.now() - 1000,
      generation: 0,
      savedAt: Date.now(),
    });
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      if (String(input).includes('oauth2/token')) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).rejects.toMatchObject({
        status: 401,
        code: 'CFW_OAUTH_RECONNECT_REQUIRED',
      });
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// The refresh calls the token endpoint OUTSIDE the store's lock, so a reconnect
// in this daemon can replace the credential while that call is in flight. (No
// cross-process case exists: one daemon per data dir is the contract, see the
// header of integrations/cloudflare-tokens.ts.)
describe('refresh vs a concurrent reconnect', () => {
  function expiredRecord(): StoredCloudflareOAuthToken {
    return {
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      refreshToken: 'ref-rotated-away',
      clientId: 'client-abc',
      email: 'me@example.com',
      expiresAt: Date.now() - 1000,
      generation: 0,
      savedAt: Date.now(),
    };
  }

  it('adopts the reconnected token when the refresh is rejected after a reconnect replaced the grant', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-reconnect-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    await setCloudflareOAuthToken(dataDir, expiredRecord());
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      if (String(input).includes('oauth2/token')) {
        // A reconnect completed while this refresh was at the token endpoint:
        // its record is on disk with a newer generation, and Cloudflare now
        // rejects OUR (superseded) refresh token.
        await setCloudflareOAuthToken(dataDir, {
          ...expiredRecord(),
          accessToken: 'reconnected-fresh',
          refreshToken: 'ref-reconnected',
          expiresAt: Date.now() + 3_600_000,
        });
        return new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).resolves.toBe('reconnected-fresh');
      // The reconnected record is left untouched (no clobber, no reconnect prompt).
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ accessToken: 'reconnected-fresh', refreshToken: 'ref-reconnected' });
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('adopts the newer record when the compare-and-set persist loses to a still-valid reconnect', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-cas-valid-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    await setCloudflareOAuthToken(dataDir, expiredRecord());
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const revoked: string[] = [];
    const revoke = revokeSink(revoked);
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const intercepted = revoke(input, init);
      if (intercepted) return intercepted;
      if (String(input).includes('oauth2/token')) {
        // The token endpoint SUCCEEDS, but a reconnect landed a newer
        // generation meanwhile: the compare-and-set persist must lose.
        await setCloudflareOAuthToken(dataDir, {
          ...expiredRecord(),
          accessToken: 'reconnected-fresh',
          refreshToken: 'ref-reconnected',
          expiresAt: Date.now() + 3_600_000,
        });
        return new Response(
          JSON.stringify({ access_token: 'fresh-from-endpoint', token_type: 'Bearer', refresh_token: 'ref-2', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).resolves.toBe('reconnected-fresh');
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ accessToken: 'reconnected-fresh', refreshToken: 'ref-reconnected' });
      // The dropped rotation (`ref-2`) is revoked; the adopted grant is not touched.
      expect(revoked).toEqual(['ref-2']);
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('demands a reconnect when the compare-and-set persist loses to a newer record that is itself expired', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-cas-expired-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    await setCloudflareOAuthToken(dataDir, expiredRecord());
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const revoked: string[] = [];
    const revoke = revokeSink(revoked);
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const intercepted = revoke(input, init);
      if (intercepted) return intercepted;
      if (String(input).includes('oauth2/token')) {
        await setCloudflareOAuthToken(dataDir, { ...expiredRecord(), accessToken: 'reconnected-stale', expiresAt: Date.now() - 1 });
        return new Response(
          JSON.stringify({ access_token: 'fresh-from-endpoint', token_type: 'Bearer', refresh_token: 'ref-2', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      // An expired newer record is no credential: handing out its access token
      // would fail the very call this refresh serves. The refreshed token is
      // not persisted over it either (the other writer still won the store).
      await expect(getCloudflareAccessToken()).rejects.toMatchObject({ status: 401, code: 'CFW_OAUTH_RECONNECT_REQUIRED' });
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ accessToken: 'reconnected-stale' });
      expect(revoked).toEqual(['ref-2']);
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a failing revoke of the dropped rotation does not change the outcome (best-effort)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-cas-revoke-fails-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    await setCloudflareOAuthToken(dataDir, expiredRecord());
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let revokeAttempted = false;
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      if (String(input).includes('oauth2/revoke')) {
        revokeAttempted = true;
        throw new TypeError('fetch failed');
      }
      if (String(input).includes('oauth2/token')) {
        await setCloudflareOAuthToken(dataDir, {
          ...expiredRecord(),
          accessToken: 'reconnected-fresh',
          refreshToken: 'ref-reconnected',
          expiresAt: Date.now() + 3_600_000,
        });
        return new Response(
          JSON.stringify({ access_token: 'fresh-from-endpoint', token_type: 'Bearer', refresh_token: 'ref-2', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).resolves.toBe('reconnected-fresh');
      expect(revokeAttempted).toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('superseded refresh grant failed'), expect.any(String));
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('still demands a reconnect when the only newer record is itself expired', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-reconnect-expired-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    await setCloudflareOAuthToken(dataDir, expiredRecord());
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      if (String(input).includes('oauth2/token')) {
        await setCloudflareOAuthToken(dataDir, { ...expiredRecord(), accessToken: 'reconnected-stale', expiresAt: Date.now() - 1 });
        return new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).rejects.toMatchObject({ status: 401, code: 'CFW_OAUTH_RECONNECT_REQUIRED' });
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('stored account email', () => {
  it('sanitize keeps the email captured at connect time', () => {
    const file = sanitizeCloudflareOAuthTokensFile({
      token: { accessToken: 'acc', tokenType: 'Bearer', email: ' me@example.com ', generation: 1, savedAt: 1 },
      lastGeneration: 1,
    });
    expect(file.token?.email).toBe('me@example.com');
    const noEmail = sanitizeCloudflareOAuthTokensFile({
      token: { accessToken: 'acc', tokenType: 'Bearer', email: 42, generation: 1, savedAt: 1 },
    });
    expect(noEmail.token).not.toHaveProperty('email');
  });

  it('a refresh carries the email forward onto the rotated record', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-email-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    await setCloudflareOAuthToken(dataDir, {
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      refreshToken: 'ref-token',
      clientId: 'client-abc',
      email: 'me@example.com',
      expiresAt: Date.now() - 1000,
      generation: 0,
      savedAt: Date.now(),
    });
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      if (String(input).includes('oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'fresh', token_type: 'Bearer', refresh_token: 'ref-2', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).resolves.toBe('fresh');
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({ accessToken: 'fresh', email: 'me@example.com' });
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('token file permissions', () => {
  it.skipIf(process.platform === 'win32')('persists the token file owner-only (0600) and leaves no temp file behind', async () => {
    const { readdir, stat } = await import('node:fs/promises');
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-token-mode-'));
    const dataDir = path.join(dir, 'nested', 'data');
    try {
      await setCloudflareOAuthToken(dataDir, {
        accessToken: 'acc',
        tokenType: 'Bearer',
        generation: 0,
        savedAt: Date.now(),
      });
      const file = path.join(dataDir, 'cloudflare-oauth-tokens.json');
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect((await readdir(dataDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);

      // Re-writes (refresh / clear) go through the same path and keep the mode.
      await clearCloudflareOAuthToken(dataDir);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('token file durability', () => {
  it('fsyncs the temp file before the rename and the parent directory after it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-token-fsync-'));
    const dataDir = path.join(dir, 'data');
    const file = path.join(dataDir, 'cloudflare-oauth-tokens.json');
    try {
      // Reach the FileHandle prototype through a real handle: fs/promises does
      // not export the class, and an ESM namespace cannot be spied directly.
      const probe = await open(path.join(dir, 'probe'), 'w');
      const proto = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
      await probe.close();
      // Every flush, in order: what was synced (the temp file, or the parent
      // directory) and whether the target entry existed at that moment.
      const syncs: Array<{ directory: boolean; targetExisted: boolean }> = [];
      const syncSpy = vi.spyOn(proto, 'sync').mockImplementation(async function (this: unknown) {
        syncs.push({
          directory: fs.fstatSync((this as { fd: number }).fd).isDirectory(),
          targetExisted: await readFile(file, 'utf8').then(() => true, () => false),
        });
      });
      try {
        await setCloudflareOAuthToken(dataDir, { accessToken: 'acc', tokenType: 'Bearer', generation: 0, savedAt: Date.now() });
        // The temp file's bytes are flushed while the target does not exist yet
        // (before the rename), then the directory entry the rename created —
        // a rename is durable only once the parent directory's metadata is.
        expect(syncs).toEqual([
          { directory: false, targetExisted: false },
          { directory: true, targetExisted: true },
        ]);
        expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ token: { accessToken: 'acc' }, lastGeneration: 1 });
        // A rewrite of an existing file follows the same discipline.
        await clearCloudflareOAuthToken(dataDir);
        expect(syncs.slice(2)).toEqual([
          { directory: false, targetExisted: true },
          { directory: true, targetExisted: true },
        ]);
      } finally {
        syncSpy.mockRestore();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a directory the platform refuses to fsync (EPERM) does not fail the token write', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-token-dirsync-eperm-'));
    const dataDir = path.join(dir, 'data');
    const file = path.join(dataDir, 'cloudflare-oauth-tokens.json');
    try {
      const probe = await open(path.join(dir, 'probe'), 'w');
      const proto = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
      await probe.close();
      let directorySyncAttempted = false;
      const syncSpy = vi.spyOn(proto, 'sync').mockImplementation(async function (this: unknown) {
        if (fs.fstatSync((this as { fd: number }).fd).isDirectory()) {
          directorySyncAttempted = true;
          throw Object.assign(new Error('EPERM: operation not permitted, fsync'), { code: 'EPERM' });
        }
      });
      try {
        // The directory flush is best-effort: the write is already as durable
        // as the temp-file flush made it, and the rename has landed.
        await setCloudflareOAuthToken(dataDir, { accessToken: 'acc', tokenType: 'Bearer', generation: 0, savedAt: Date.now() });
      } finally {
        syncSpy.mockRestore();
      }
      expect(directorySyncAttempted).toBe(true);
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ token: { accessToken: 'acc' } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('removes the temp file and leaves the prior token file intact when the flush fails', async () => {
    const { readdir } = await import('node:fs/promises');
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-token-fsync-fail-'));
    const dataDir = path.join(dir, 'data');
    const file = path.join(dataDir, 'cloudflare-oauth-tokens.json');
    try {
      await setCloudflareOAuthToken(dataDir, { accessToken: 'first', tokenType: 'Bearer', generation: 0, savedAt: Date.now() });
      const probe = await open(path.join(dir, 'probe'), 'w');
      const proto = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
      await probe.close();
      const syncSpy = vi.spyOn(proto, 'sync').mockRejectedValue(Object.assign(new Error('EIO: flush failed'), { code: 'EIO' }));
      try {
        await expect(
          setCloudflareOAuthToken(dataDir, { accessToken: 'second', tokenType: 'Bearer', generation: 0, savedAt: Date.now() }),
        ).rejects.toMatchObject({ code: 'EIO' });
      } finally {
        syncSpy.mockRestore();
      }
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ token: { accessToken: 'first' } });
      expect((await readdir(dataDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('getCloudflareAccessToken expiry skew', () => {
  it('sizes the skew to a worst-case deploy (at least 10 minutes)', () => {
    expect(CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });

  it('refreshes a token that would lapse during a long deploy, even though it is still valid right now', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-skew-'));
    configureCloudflareWorkersDataDir(dir);
    await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
      accessToken: 'about-to-lapse',
      tokenType: 'Bearer',
      refreshToken: 'ref-live',
      clientId: 'client-abc',
      // Valid for five more minutes: fine for one call, not for a multi-minute deploy.
      expiresAt: Date.now() + 5 * 60_000,
      generation: 0,
      savedAt: Date.now(),
    });
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const realFetch = globalThis.fetch;
    let refreshCalls = 0;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      if (String(input).includes('oauth2/token')) {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({ access_token: 'refreshed-token', token_type: 'Bearer', refresh_token: 'ref-live-2', expires_in: 3600 }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).resolves.toBe('refreshed-token');
      expect(refreshCalls).toBe(1);
      // A token comfortably outside the skew is trusted as-is (no refresh churn).
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'fresh',
        tokenType: 'Bearer',
        refreshToken: 'ref-live-3',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3_600_000,
        generation: 5,
        savedAt: Date.now(),
      });
      await expect(getCloudflareAccessToken()).resolves.toBe('fresh');
      expect(refreshCalls).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('refresh expiry fallback', () => {
  // The token endpoint casts the parsed body with no validation, so `expires_in`
  // reaches these call sites as anything at all. A record written without a
  // numeric `expiresAt` is not "unknown" to isCloudflareOAuthTokenExpired — it
  // reads as NON-EXPIRING, so the fast path in getCloudflareAccessToken would
  // hand out that access token forever.
  it('never leaves expiresAt undefined, whatever the token response carries', () => {
    const now = 1_000_000;
    expect(cloudflareOAuthExpiresAt({ expiresIn: 3600, now })).toBe(now + 3_600_000);
    // A string `expires_in` is exactly what the unvalidated cast lets through:
    // it is not a TTL, so the prior record's expiry is inherited instead.
    expect(cloudflareOAuthExpiresAt({ expiresIn: '3600', priorExpiresAt: 4_000_000, now })).toBe(4_000_000);
    expect(cloudflareOAuthExpiresAt({ expiresIn: undefined, priorExpiresAt: 4_000_000, now })).toBe(4_000_000);
    expect(cloudflareOAuthExpiresAt({ expiresIn: Number.NaN, priorExpiresAt: 4_000_000, now })).toBe(4_000_000);
    expect(cloudflareOAuthExpiresAt({ expiresIn: 0, priorExpiresAt: 4_000_000, now })).toBe(4_000_000);
    // Nothing usable anywhere: a conservative stamp, never `undefined`.
    expect(cloudflareOAuthExpiresAt({ expiresIn: undefined, now })).toBe(now + CLOUDFLARE_OAUTH_UNKNOWN_EXPIRY_TTL_MS);
    expect(cloudflareOAuthExpiresAt({ expiresIn: -1, now })).toBe(now + CLOUDFLARE_OAUTH_UNKNOWN_EXPIRY_TTL_MS);
    // Inside every expiry skew the callers apply, so a record stamped with the
    // fallback reads as expired at the NEXT call and refreshes again, instead of
    // becoming a credential that never rotates.
    expect(CLOUDFLARE_OAUTH_UNKNOWN_EXPIRY_TTL_MS).toBeLessThanOrEqual(CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS);
  });

  it('a rotated record the token endpoint gave no expires_in for still expires', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-no-ttl-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    // Expired, so the fast path is skipped and the refresh below runs.
    const priorExpiresAt = Date.now() - 1000;
    await setCloudflareOAuthToken(dataDir, {
      accessToken: 'lapsed',
      tokenType: 'Bearer',
      refreshToken: 'ref-lapsed',
      clientId: 'client-abc',
      expiresAt: priorExpiresAt,
      generation: 0,
      savedAt: Date.now(),
    });
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      if (String(input).includes('oauth2/token')) {
        // No `expires_in` at all — the shape the fallback exists for. The
        // rotation itself succeeded, so the access token is usable now.
        return new Response(
          JSON.stringify({ access_token: 'rotated', token_type: 'Bearer', refresh_token: 'ref-rotated' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).resolves.toBe('rotated');
      const stored = await getCloudflareOAuthToken(dataDir);
      expect(stored?.accessToken).toBe('rotated');
      // The record keeps a NUMERIC expiresAt: without one it would read as
      // non-expiring and this token would be served forever.
      expect(typeof stored?.expiresAt).toBe('number');
      expect(stored?.expiresAt).toBe(priorExpiresAt);
      // And it reads as expired, so the next call refreshes again rather than
      // trusting a credential of unknown lifetime.
      expect(isCloudflareOAuthTokenExpired(stored!, Date.now(), CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('refresh transport', () => {
  it('routes the refresh token-endpoint call through the configured HTTP proxy dispatcher', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-proxy-'));
    configureCloudflareWorkersDataDir(dir);
    await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      refreshToken: 'ref-token',
      clientId: 'client-abc',
      expiresAt: Date.now() - 1000,
      generation: 1,
      savedAt: Date.now(),
    });
    await writeCloudflareWorkersConfig({
      credentialMode: 'oauth',
      accountId: 'acct_test',
      clientId: 'client-abc',
    });
    const priorProxy = process.env.HTTPS_PROXY;
    process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
    let refreshInit: RequestInit | undefined;
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2/token')) {
        refreshInit = init;
        return new Response(
          JSON.stringify({ access_token: 'fresh', token_type: 'Bearer', refresh_token: 'ref-2', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error('unexpected fetch ' + url);
    });
    try {
      expect(await getCloudflareAccessToken()).toBe('fresh');
      // The connect and paste-back exchanges attach the proxy dispatcher
      // (routes/cloudflare.ts); the silent refresh must reach the same
      // endpoint the same way or it fails on every proxied machine.
      expect(refreshInit).toBeDefined();
      expect(refreshInit?.dispatcher).toBeDefined();
      // The call is bounded while it holds the single-flight lock.
      expect(refreshInit?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.unstubAllGlobals();
      if (priorProxy === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = priorProxy;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('clearCloudflareOAuthToken', () => {
  it('wipes a file that no longer parses to a token but still carries credential bytes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-clear-corrupt-'));
    const file = path.join(dir, 'cloudflare-oauth-tokens.json');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // A record with no accessToken sanitizes to "no token" — yet its refresh
      // token is still on disk, and a disconnect keyed on the parsed token
      // would leave it there.
      await writeFile(file, JSON.stringify({ token: { refreshToken: 'leaked-refresh' }, lastGeneration: 3 }));
      await clearCloudflareOAuthToken(dir);
      const afterPartial = await readFile(file, 'utf8');
      expect(afterPartial).not.toContain('leaked-refresh');
      expect(JSON.parse(afterPartial)).toEqual({ lastGeneration: 4 });

      // Truncated JSON with an access token embedded is wiped too.
      await writeFile(file, '{"token":{"accessToken":"leaked-access"');
      await clearCloudflareOAuthToken(dir);
      const afterCorrupt = await readFile(file, 'utf8');
      expect(afterCorrupt).not.toContain('leaked-access');
      expect(JSON.parse(afterCorrupt)).toEqual({ lastGeneration: 1 });

      // No file: nothing is created.
      await rm(file, { force: true });
      await clearCloudflareOAuthToken(dir);
      expect(fs.existsSync(file)).toBe(false);
    } finally {
      errorSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('hands back the record it displaced, read under the store lock, or null when none parsed', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-clear-displaced-'));
    try {
      // Nothing stored: nothing displaced.
      expect(await clearCloudflareOAuthToken(dir)).toBeNull();
      await setCloudflareOAuthToken(dir, { accessToken: 'acc-1', tokenType: 'Bearer', refreshToken: 'ref-1', clientId: 'client-1', generation: 0, savedAt: 1 });
      // The record the clear took off disk is what a disconnect revokes: the
      // one the store held inside the clear's critical section.
      const displaced = await clearCloudflareOAuthToken(dir);
      expect(displaced).toMatchObject({ accessToken: 'acc-1', refreshToken: 'ref-1', clientId: 'client-1' });
      expect(await getCloudflareOAuthToken(dir)).toBeNull();
      // Cleared again: nothing displaced (the generation still bumps).
      expect(await clearCloudflareOAuthToken(dir)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('hands back the credential the raw file still carries when nothing sanitizes to a token', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-clear-recover-'));
    const file = path.join(dir, 'cloudflare-oauth-tokens.json');
    try {
      // No accessToken: the record drops out of the typed shape, and a clear
      // that reported "nothing displaced" is what let a disconnect skip the
      // revoke and leave the refresh token — the half that keeps the whole
      // grant alive — usable at Cloudflare.
      await writeFile(file, JSON.stringify({ token: { refreshToken: 'leaked-refresh', clientId: 'client-1' }, lastGeneration: 3 }));
      expect(await clearCloudflareOAuthToken(dir)).toMatchObject({
        accessToken: '',
        refreshToken: 'leaked-refresh',
        clientId: 'client-1',
        tokenType: 'Bearer',
      });
      // The wipe still lands: the recovered record describes bytes that are gone.
      const wiped = await readFile(file, 'utf8');
      expect(wiped).not.toContain('leaked-refresh');
      expect(JSON.parse(wiped)).toEqual({ lastGeneration: 4 });

      // A credential is only recovered from a string. A non-string accessToken
      // is not coerced into one — there is nothing to name at the revoke.
      await writeFile(file, JSON.stringify({ token: { accessToken: 42 }, lastGeneration: 9 }));
      expect(await clearCloudflareOAuthToken(dir)).toBeNull();
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ lastGeneration: 10 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('setCloudflareOAuthTokenGuarded', () => {
  const token = (suffix: string): StoredCloudflareOAuthToken => ({
    accessToken: 'acc-' + suffix,
    tokenType: 'Bearer',
    refreshToken: 'ref-' + suffix,
    generation: 0,
    savedAt: 1,
  });

  it('hands back the record it displaced, read in the same critical section as the write', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-guarded-displaced-'));
    try {
      expect(await setCloudflareOAuthTokenGuarded(dir, token('first'), () => true)).toEqual({ written: true, displaced: null });
      // A refresh whose compare-and-set lands before the write rotates the
      // stored record. The write displaces the ROTATED record — the one a
      // revoke must name — not the one a read taken before the lock saw.
      const stale = await getCloudflareOAuthToken(dir);
      expect(stale).toMatchObject({ refreshToken: 'ref-first' });
      expect(await setCloudflareOAuthTokenIfGenerationMatches(dir, token('rotated'), stale!.generation!)).toBe(true);
      const write = await setCloudflareOAuthTokenGuarded(dir, token('second'), () => true);
      expect(write.written).toBe(true);
      expect(write.written && write.displaced).toMatchObject({ refreshToken: 'ref-rotated' });
      expect(await getCloudflareOAuthToken(dir)).toMatchObject({ refreshToken: 'ref-second' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes nothing and displaces nothing once the guard no longer holds', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-guarded-refused-'));
    try {
      await setCloudflareOAuthToken(dir, token('kept'));
      expect(await setCloudflareOAuthTokenGuarded(dir, token('late'), () => false)).toEqual({ written: false });
      expect(await getCloudflareOAuthToken(dir)).toMatchObject({ refreshToken: 'ref-kept' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('names the credential the raw file still carries when nothing sanitizes to a token', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-guarded-recover-'));
    const file = path.join(dir, 'cloudflare-oauth-tokens.json');
    try {
      // No accessToken: the record drops out of the typed shape while its
      // refresh token stays a live grant on disk. A write that displaced this
      // file and reported `displaced: null` is what let a reconnect skip the
      // revoke and leave the superseded grant usable at Cloudflare — the hole
      // clearCloudflareOAuthToken reads the raw object to close.
      await writeFile(file, JSON.stringify({ token: { refreshToken: 'leaked-refresh', clientId: 'client-1' }, lastGeneration: 3 }));
      const write = await setCloudflareOAuthTokenGuarded(dir, token('second'), () => true);
      expect(write.written).toBe(true);
      expect(write.written && write.displaced).toMatchObject({
        accessToken: '',
        refreshToken: 'leaked-refresh',
        clientId: 'client-1',
        tokenType: 'Bearer',
      });
      // The write still landed: the recovered record describes bytes now gone.
      expect(await getCloudflareOAuthToken(dir)).toMatchObject({ refreshToken: 'ref-second' });
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ lastGeneration: 4 });
      expect(await readFile(file, 'utf8')).not.toContain('leaked-refresh');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});


// The token-endpoint round trip is the one long window in this path with no
// store lock held (see refreshCloudflareOAuthAccessToken). Any OAuth mutation
// that lands inside it — a settle, a disconnect, a connect — used to advance the
// file generation even when it changed nothing about the credential, so the
// refresh's compare-and-set missed and the grant it had just minted was revoked
// on the way to a CFW_OAUTH_RECONNECT_REQUIRED the user could not explain.
describe('a store write that lands during the token-endpoint round trip', () => {
  it('a settle that only retires a revoke handle does not cost the refresh its grant', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-concurrent-settle-'));
    configureCloudflareWorkersDataDir(dir);
    const dataDir = cloudflareOAuthTokensDir();
    const expired = (access: string, refresh: string) => ({
      accessToken: access,
      refreshToken: refresh,
      tokenType: 'Bearer',
      clientId: 'client-abc',
      expiresAt: Date.now() - 1000,
      generation: 0,
      savedAt: Date.now(),
    });
    // A transition took one grant off disk and left it named by a handle; the
    // reconnect that followed stored the credential this refresh rotates.
    await setCloudflareOAuthToken(dataDir, expired('access-1', 'ref-1'));
    await clearCloudflareOAuthTokenForRevoke(dataDir);
    await setCloudflareOAuthToken(dataDir, expired('access-2', 'ref-2'));
    await writeCloudflareWorkersConfig({ credentialMode: 'oauth', accountId: 'acct_test', clientId: 'client-abc' });

    const tokenCalls: string[] = [];
    const revokeCalls: string[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('revoke')) {
        revokeCalls.push(url);
        return new Response(null, { status: 200 });
      }
      if (url.includes('oauth2/token')) {
        tokenCalls.push(url);
        // The benign concurrent write: an OAuth mutation settling the debt the
        // handle records, while this refresh waits on Cloudflare.
        await settlePendingCloudflareOAuthGrantRevokes();
        return new Response(
          JSON.stringify({ access_token: 'fresh', token_type: 'Bearer', refresh_token: 'ref-2-rotated', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input as never, init as never);
    });
    try {
      await expect(getCloudflareAccessToken()).resolves.toBe('fresh');
      // The rotated credential is the store's, and the settle's grant is the
      // only grant revoked: the refresh never revoked the one it had just minted.
      expect(await getCloudflareOAuthToken(dataDir)).toMatchObject({
        accessToken: 'fresh',
        refreshToken: 'ref-2-rotated',
      });
      expect(tokenCalls).toHaveLength(1);
      expect(revokeCalls).toHaveLength(1);
      expect(await getPendingCloudflareOAuthRevokes(dataDir)).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
