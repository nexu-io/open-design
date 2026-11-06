import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearToken,
  getToken,
  isTokenExpired,
  readAllTokens,
  readTokensFile,
  sanitizeTokensFile,
  setToken,
  type StoredMcpToken,
} from '../src/mcp-tokens.js';

describe('mcp-tokens storage', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-mcptokens-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('returns no servers when the file is missing', async () => {
    expect(await readTokensFile(dataDir)).toEqual({ servers: {} });
    expect(await getToken(dataDir, 'higgsfield')).toBeNull();
  });

  it('persists, re-reads, and overwrites a token', async () => {
    const tok: StoredMcpToken = {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
      scope: 'openid email',
      expiresAt: Date.now() + 60_000,
      savedAt: Date.now(),
    };
    await setToken(dataDir, 'higgsfield', tok);

    const got = await getToken(dataDir, 'higgsfield');
    expect(got?.accessToken).toBe('access-1');
    expect(got?.refreshToken).toBe('refresh-1');
    expect(got?.scope).toBe('openid email');

    // Overwrite with a rotated token.
    await setToken(dataDir, 'higgsfield', {
      ...tok,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    const got2 = await getToken(dataDir, 'higgsfield');
    expect(got2?.accessToken).toBe('access-2');
    expect(got2?.refreshToken).toBe('refresh-2');
  });

  it('isolates tokens per server', async () => {
    await setToken(dataDir, 'github', {
      accessToken: 'gh-token',
      tokenType: 'Bearer',
      savedAt: Date.now(),
    });
    await setToken(dataDir, 'higgsfield', {
      accessToken: 'hg-token',
      tokenType: 'Bearer',
      savedAt: Date.now(),
    });
    const all = await readAllTokens(dataDir);
    expect(Object.keys(all).sort()).toEqual(['github', 'higgsfield']);
    expect(all.github?.accessToken).toBe('gh-token');
    expect(all.higgsfield?.accessToken).toBe('hg-token');
  });

  it('clearToken removes only the requested entry', async () => {
    await setToken(dataDir, 'github', {
      accessToken: 'gh-token',
      tokenType: 'Bearer',
      savedAt: Date.now(),
    });
    await setToken(dataDir, 'higgsfield', {
      accessToken: 'hg-token',
      tokenType: 'Bearer',
      savedAt: Date.now(),
    });
    await clearToken(dataDir, 'github');
    expect(await getToken(dataDir, 'github')).toBeNull();
    expect(await getToken(dataDir, 'higgsfield')).not.toBeNull();
  });

  it('clearToken on an absent server is a no-op', async () => {
    await expect(clearToken(dataDir, 'never')).resolves.toBeUndefined();
  });

  it('writes the tokens file with mode 0600 on POSIX', async () => {
    if (process.platform === 'win32') return; // mode bits are advisory on win32
    await setToken(dataDir, 'higgsfield', {
      accessToken: 'tok',
      tokenType: 'Bearer',
      savedAt: Date.now(),
    });
    const s = await stat(path.join(dataDir, 'mcp-tokens.json'));
    // Mask off file-type bits — only the permission bits are interesting.
    expect(s.mode & 0o777).toBe(0o600);
  });

  it('survives a corrupt tokens file by returning empty', async () => {
    await writeFile(path.join(dataDir, 'mcp-tokens.json'), '{not valid');
    const all = await readAllTokens(dataDir);
    expect(all).toEqual({});
  });

  it('sanitizes incoming JSON, dropping malformed entries', () => {
    const out = sanitizeTokensFile({
      servers: {
        good: {
          accessToken: '   abc   ',
          tokenType: 'Bearer',
          savedAt: 123,
          scope: 'a b c',
        },
        bad_no_token: { tokenType: 'Bearer', savedAt: 123 },
        bad_shape: 'not an object',
        __proto__: { accessToken: 'evil', tokenType: 'Bearer', savedAt: 1 },
      },
    });
    expect(out.servers.good?.accessToken).toBe('abc');
    expect(out.servers.bad_no_token).toBeUndefined();
    expect(out.servers.bad_shape).toBeUndefined();
    // __proto__ is reserved — sanitizer must NOT have set it as a real
    // own property (which would be a prototype-pollution vector). The
    // implicit access via `.__proto__` returns Object.prototype, so we
    // check Object.hasOwn instead of toBeUndefined.
    expect(Object.hasOwn(out.servers, '__proto__')).toBe(false);
    expect(Object.keys(out.servers)).toEqual(['good']);
  });

  it('round-trips JSON disk format', async () => {
    await setToken(dataDir, 'higgsfield', {
      accessToken: 'tok',
      tokenType: 'Bearer',
      savedAt: 1234,
    });
    const raw = await readFile(path.join(dataDir, 'mcp-tokens.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.servers.higgsfield.accessToken).toBe('tok');
  });

  it('persists OAuth client context fields with the token', async () => {
    const tok: StoredMcpToken = {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
      savedAt: Date.now(),
      tokenEndpoint: 'https://auth.example.com/token',
      clientId: 'client-xyz',
      clientSecret: 'secret-xyz',
      authServerIssuer: 'https://auth.example.com',
      redirectUri: 'https://app.example.com/api/mcp/oauth/callback',
      resourceUrl: 'https://mcp.example.com/mcp',
    };
    await setToken(dataDir, 'higgsfield', tok);
    const got = await getToken(dataDir, 'higgsfield');
    expect(got).toMatchObject({
      tokenEndpoint: 'https://auth.example.com/token',
      clientId: 'client-xyz',
      clientSecret: 'secret-xyz',
      authServerIssuer: 'https://auth.example.com',
      redirectUri: 'https://app.example.com/api/mcp/oauth/callback',
      resourceUrl: 'https://mcp.example.com/mcp',
    });
  });
});

describe('isTokenExpired', () => {
  const now = 1_700_000_000_000;

  it('returns false for a token with no expiresAt', () => {
    expect(
      isTokenExpired({ accessToken: 'a', tokenType: 'Bearer', savedAt: now }, now),
    ).toBe(false);
  });

  it('returns false when expiresAt is comfortably in the future', () => {
    expect(
      isTokenExpired(
        { accessToken: 'a', tokenType: 'Bearer', savedAt: now, expiresAt: now + 60_000 },
        now,
      ),
    ).toBe(false);
  });

  it('returns true when expiresAt is in the past', () => {
    expect(
      isTokenExpired(
        { accessToken: 'a', tokenType: 'Bearer', savedAt: now, expiresAt: now - 5 },
        now,
      ),
    ).toBe(true);
  });

  it('honors the skew window (default 30s) so we do not ship a token about to expire', () => {
    expect(
      isTokenExpired(
        { accessToken: 'a', tokenType: 'Bearer', savedAt: now, expiresAt: now + 5_000 },
        now,
      ),
    ).toBe(true);
  });
});
