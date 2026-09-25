// Cloudflare OAuth refresh-token path tests.
//
// Covers the offline_access -> refresh_token -> auto-refresh chain that keeps
// a Cloudflare connection alive past the 3600s access-token TTL:
//   (a) the authorize URL always requests `offline_access` in its scope param
//   (b) a token response that carries a refresh_token persists it to the record
//   (c) a refresh call reuses refreshCloudflareToken with the stored refreshToken

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
  clearCloudflareOAuthToken,
  getCloudflareOAuthToken,
  sanitizeCloudflareOAuthTokensFile,
  setCloudflareOAuthToken,
  setCloudflareOAuthTokenIfGenerationMatches,
  type StoredCloudflareOAuthToken,
} from '../src/integrations/cloudflare-tokens.js';
import { PendingAuthCache } from '../src/mcp-oauth.js';
import {
  classifyCloudflareRefreshFailure,
  CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS,
  cloudflareOAuthTokensDir,
  configureCloudflareWorkersDataDir,
  getCloudflareAccessToken,
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
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: unknown, init?: unknown) => {
      const url = String(input);
      if (url.includes('oauth2/token')) {
        markStarted();
        return new Promise<Response>((resolve) => { releaseToken = resolve; });
      }
      return realFetch(input as never, init as never);
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
  it('fsyncs the temp file before renaming it over the token file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-token-fsync-'));
    const dataDir = path.join(dir, 'data');
    const file = path.join(dataDir, 'cloudflare-oauth-tokens.json');
    try {
      // Reach the FileHandle prototype through a real handle: fs/promises does
      // not export the class, and an ESM namespace cannot be spied directly.
      const probe = await open(path.join(dir, 'probe'), 'w');
      const proto = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
      await probe.close();
      let targetExistedAtSync: boolean | null = null;
      const syncSpy = vi.spyOn(proto, 'sync').mockImplementation(async function (this: unknown) {
        // The flush must happen while the bytes are still in the temp file —
        // before the rename lands the entry (the whole point of syncing first).
        targetExistedAtSync = await readFile(file, 'utf8').then(() => true, () => false);
      });
      try {
        await setCloudflareOAuthToken(dataDir, { accessToken: 'acc', tokenType: 'Bearer', generation: 0, savedAt: Date.now() });
        expect(syncSpy).toHaveBeenCalledTimes(1);
        expect(targetExistedAtSync).toBe(false);
        expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ token: { accessToken: 'acc' }, lastGeneration: 1 });
        // A rewrite of an existing file syncs the temp file too.
        await clearCloudflareOAuthToken(dataDir);
        expect(syncSpy).toHaveBeenCalledTimes(2);
      } finally {
        syncSpy.mockRestore();
      }
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
