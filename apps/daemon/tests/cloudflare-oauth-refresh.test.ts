// Cloudflare OAuth refresh-token path tests.
//
// Covers the offline_access -> refresh_token -> auto-refresh chain that keeps
// a Cloudflare connection alive past the 3600s access-token TTL:
//   (a) the authorize URL always requests `offline_access` in its scope param
//   (b) a token response that carries a refresh_token persists it to the record
//   (c) a refresh call reuses refreshCloudflareToken with the stored refreshToken

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  beginCloudflareAuth,
  completeCloudflareAuth,
  refreshCloudflareToken,
  CLOUDFLARE_OAUTH_SCOPES,
  CLOUDFLARE_OFFLINE_ACCESS_SCOPE,
  mergeOfflineAccessScope,
} from '../src/integrations/cloudflare-oauth.js';
import {
  getCloudflareOAuthToken,
  sanitizeCloudflareOAuthTokensFile,
  setCloudflareOAuthToken,
  type StoredCloudflareOAuthToken,
} from '../src/integrations/cloudflare-tokens.js';
import { PendingAuthCache } from '../src/mcp-oauth.js';
import {
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

  it('persists refreshToken to the stored record and preserves generation', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-cf-refresh-'));
    try {
      const stored: StoredCloudflareOAuthToken = {
        accessToken: 'acc',
        tokenType: 'Bearer',
        refreshToken: 'ref-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 7,
        savedAt: Date.now(),
      };
      await setCloudflareOAuthToken(dataDir, stored);

      const read = await getCloudflareOAuthToken(dataDir);
      expect(read?.refreshToken).toBe('ref-abc');
      expect(read?.generation).toBe(7);
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
  it('rejects a fresh token issued to a different client (fail-closed fast path)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-cf-identity-'));
    configureCloudflareWorkersDataDir(dir);
    try {
      // Persist the token first: the credentialMode flip to 'oauth' is now
      // fail-closed (writeCloudflareWorkersConfig refuses the flip without a
      // durable token), so the fixture must establish the token before the
      // mode switch — the exact sequence a real connect flow produces.
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'acc-token',
        tokenType: 'Bearer',
        clientId: 'client-old',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await writeCloudflareWorkersConfig({
        credentialMode: 'oauth',
        accountId: 'acct_test',
        clientId: 'client-new',
      });
      await expect(getCloudflareAccessToken()).rejects.toMatchObject({
        code: 'CFW_OAUTH_RECONNECT_REQUIRED',
      });
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
