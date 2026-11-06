import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearXAIToken,
  getXAIToken,
  isXAITokenExpired,
  readTokensFile,
  sanitizeTokensFile,
  setXAIToken,
  type StoredXAIToken,
} from '../../../src/integrations/xai-tokens.js';

const isPosix = process.platform !== 'win32';

describe('xai-tokens persistence', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-xai-tokens-'));
  });

  afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
  });

  it('returns null when no file exists', async () => {
    expect(await getXAIToken(dataDir)).toBeNull();
  });

  it('round-trips a token through set + get', async () => {
    const tok: StoredXAIToken = {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'openid grok-cli:access',
      savedAt: Date.now(),
    };
    await setXAIToken(dataDir, tok);
    const got = await getXAIToken(dataDir);
    expect(got).toEqual(tok);
  });

  it('overwrites the previous token rather than appending', async () => {
    const a: StoredXAIToken = {
      accessToken: 'a',
      tokenType: 'Bearer',
      savedAt: 1,
    };
    const b: StoredXAIToken = {
      accessToken: 'b',
      tokenType: 'Bearer',
      savedAt: 2,
    };
    await setXAIToken(dataDir, a);
    await setXAIToken(dataDir, b);
    const got = await getXAIToken(dataDir);
    expect(got?.accessToken).toBe('b');
  });

  it('clearXAIToken removes the stored token', async () => {
    await setXAIToken(dataDir, {
      accessToken: 'x',
      tokenType: 'Bearer',
      savedAt: Date.now(),
    });
    await clearXAIToken(dataDir);
    expect(await getXAIToken(dataDir)).toBeNull();
  });

  it('clearXAIToken is a no-op when nothing is stored', async () => {
    await expect(clearXAIToken(dataDir)).resolves.not.toThrow();
  });

  it.skipIf(!isPosix)(
    'writes the file as owner-only (mode 0600) on POSIX',
    async () => {
      await setXAIToken(dataDir, {
        accessToken: 'x',
        tokenType: 'Bearer',
        savedAt: Date.now(),
      });
      const s = await stat(path.join(dataDir, 'xai-tokens.json'));
      // Strip file-type bits, just compare the permission bits.
      // 0o600 = rw-------
      expect(s.mode & 0o777).toBe(0o600);
    },
  );

  it('survives a corrupted file by returning empty', async () => {
    await writeFile(
      path.join(dataDir, 'xai-tokens.json'),
      '{ this is not json',
      'utf8',
    );
    expect(await getXAIToken(dataDir)).toBeNull();
  });

  it('drops malformed entries during read', async () => {
    await writeFile(
      path.join(dataDir, 'xai-tokens.json'),
      JSON.stringify({ token: { accessToken: '', tokenType: 'Bearer' } }),
      'utf8',
    );
    // Empty accessToken means sanitizeToken rejects → read returns no token.
    expect(await getXAIToken(dataDir)).toBeNull();
  });

  it('preserves missing optional fields without injecting undefined', async () => {
    const tok: StoredXAIToken = {
      accessToken: 'a',
      tokenType: 'Bearer',
      savedAt: 100,
    };
    await setXAIToken(dataDir, tok);
    const raw = JSON.parse(
      await readFile(path.join(dataDir, 'xai-tokens.json'), 'utf8'),
    );
    expect(raw.token).toEqual({
      accessToken: 'a',
      tokenType: 'Bearer',
      savedAt: 100,
    });
    expect('refreshToken' in raw.token).toBe(false);
    expect('scope' in raw.token).toBe(false);
    expect('expiresAt' in raw.token).toBe(false);
  });

  it('serializes concurrent setXAIToken calls (lock test)', async () => {
    const tokens: StoredXAIToken[] = Array.from({ length: 8 }, (_, i) => ({
      accessToken: `token-${i}`,
      tokenType: 'Bearer',
      savedAt: i,
    }));
    await Promise.all(tokens.map((t) => setXAIToken(dataDir, t)));
    const got = await getXAIToken(dataDir);
    // Last write wins; lock guarantees the file is well-formed (no
    // partial JSON) afterward.
    expect(got).not.toBeNull();
    expect(got!.accessToken).toMatch(/^token-\d$/);
  });
});

describe('readTokensFile', () => {
  it('returns empty when ENOENT', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-xai-read-'));
    try {
      expect(await readTokensFile(dir)).toEqual({});
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it.skipIf(!isPosix)('rethrows non-ENOENT read errors', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-xai-perm-'));
    const file = path.join(dir, 'xai-tokens.json');
    try {
      await writeFile(file, '{}', 'utf8');
      // Make the file unreadable to provoke EACCES.
      await chmod(file, 0o000);
      await expect(readTokensFile(dir)).rejects.toThrow();
    } finally {
      // Restore so we can clean up.
      await chmod(file, 0o600).catch(() => {});
      await rm(dir, { force: true, recursive: true });
    }
  });
});

describe('sanitizeTokensFile', () => {
  it('drops non-object input', () => {
    expect(sanitizeTokensFile(null)).toEqual({});
    expect(sanitizeTokensFile('string')).toEqual({});
    expect(sanitizeTokensFile(42)).toEqual({});
    expect(sanitizeTokensFile([])).toEqual({});
  });

  it('drops a token with empty accessToken', () => {
    expect(
      sanitizeTokensFile({
        token: { accessToken: '   ', tokenType: 'Bearer' },
      }),
    ).toEqual({});
  });

  it('defaults tokenType to Bearer when missing', () => {
    const out = sanitizeTokensFile({
      token: { accessToken: 'a', savedAt: 0 },
    });
    expect(out.token?.tokenType).toBe('Bearer');
  });

  it('coerces savedAt when missing/invalid', () => {
    const before = Date.now();
    const out = sanitizeTokensFile({ token: { accessToken: 'a' } });
    const after = Date.now();
    expect(out.token?.savedAt).toBeGreaterThanOrEqual(before);
    expect(out.token?.savedAt).toBeLessThanOrEqual(after);
  });
});

describe('isXAITokenExpired', () => {
  const base: StoredXAIToken = {
    accessToken: 'a',
    tokenType: 'Bearer',
    savedAt: 0,
  };

  it('returns false when expiresAt is missing (some providers never expire)', () => {
    expect(isXAITokenExpired(base, 1_000_000_000)).toBe(false);
  });

  it('treats a token within the 120s skew window as expired', () => {
    const tok: StoredXAIToken = { ...base, expiresAt: 1_000_000_000 };
    expect(isXAITokenExpired(tok, 1_000_000_000 - 60_000)).toBe(true);
  });

  it('treats a token outside the skew window as live', () => {
    const tok: StoredXAIToken = { ...base, expiresAt: 1_000_000_000 };
    expect(isXAITokenExpired(tok, 1_000_000_000 - 200_000)).toBe(false);
  });

  it('honors a custom skew', () => {
    const tok: StoredXAIToken = { ...base, expiresAt: 1_000_000_000 };
    expect(isXAITokenExpired(tok, 1_000_000_000 - 5_000, 1_000)).toBe(false);
    expect(isXAITokenExpired(tok, 1_000_000_000 - 500, 1_000)).toBe(true);
  });
});
