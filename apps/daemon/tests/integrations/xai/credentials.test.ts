import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveXAIBearer } from '../../../src/integrations/xai-credentials.js';
import { setXAIToken, type StoredXAIToken } from '../../../src/integrations/xai-tokens.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function fetchOk(body: unknown, status = 200) {
  return async (_input: FetchInput, _init?: FetchInit): Promise<Response> => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function fetchAlwaysFails(status = 400, body = '{"error":"invalid_grant"}') {
  return async (): Promise<Response> => {
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

describe('resolveXAIBearer', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-xai-creds-'));
  });

  afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
  });

  it('returns null when nothing is stored', async () => {
    expect(await resolveXAIBearer(dataDir)).toBeNull();
  });

  it('returns the stored token unchanged when not yet within the skew window', async () => {
    const stored: StoredXAIToken = {
      accessToken: 'fresh-bearer',
      tokenType: 'Bearer',
      savedAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
      refreshToken: 'rt-1',
    };
    await setXAIToken(dataDir, stored);

    const resolved = await resolveXAIBearer(dataDir);
    expect(resolved).toEqual({
      accessToken: 'fresh-bearer',
      source: 'stored',
    });
  });

  it('returns the stored token unchanged when expiresAt is missing', async () => {
    const stored: StoredXAIToken = {
      accessToken: 'never-expires',
      tokenType: 'Bearer',
      savedAt: Date.now(),
    };
    await setXAIToken(dataDir, stored);

    const resolved = await resolveXAIBearer(dataDir);
    expect(resolved).toEqual({
      accessToken: 'never-expires',
      source: 'stored',
    });
  });

  it('refreshes a token within the skew window and writes the new value back', async () => {
    const oldExpiry = Date.now() + 30_000; // within 120 s skew
    const stored: StoredXAIToken = {
      accessToken: 'old-bearer',
      tokenType: 'Bearer',
      savedAt: Date.now(),
      expiresAt: oldExpiry,
      refreshToken: 'rt-1',
    };
    await setXAIToken(dataDir, stored);

    const resolved = await resolveXAIBearer(
      dataDir,
      fetchOk({
        access_token: 'new-bearer',
        refresh_token: 'rt-2',
        token_type: 'Bearer',
        expires_in: 1800,
      }),
    );
    expect(resolved).toEqual({
      accessToken: 'new-bearer',
      source: 'refreshed',
    });

    const onDisk = JSON.parse(
      await readFile(path.join(dataDir, 'xai-tokens.json'), 'utf8'),
    );
    expect(onDisk.token.accessToken).toBe('new-bearer');
    expect(onDisk.token.refreshToken).toBe('rt-2');
    // New expiry should be ~ now + 1800s (with some margin for test latency).
    const expectedMin = Date.now() + 1800 * 1000 - 10_000;
    expect(onDisk.token.expiresAt).toBeGreaterThanOrEqual(expectedMin);
  });

  it('returns null when the stored token is expired and has no refresh_token', async () => {
    const stored: StoredXAIToken = {
      accessToken: 'expired-bearer',
      tokenType: 'Bearer',
      savedAt: Date.now() - 7_200_000,
      expiresAt: Date.now() - 60_000,
    };
    await setXAIToken(dataDir, stored);

    expect(await resolveXAIBearer(dataDir)).toBeNull();
  });

  it('returns null when refresh fails (network or 4xx)', async () => {
    const stored: StoredXAIToken = {
      accessToken: 'old-bearer',
      tokenType: 'Bearer',
      savedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
      refreshToken: 'rt-stale',
    };
    await setXAIToken(dataDir, stored);

    const resolved = await resolveXAIBearer(dataDir, fetchAlwaysFails(400));
    expect(resolved).toBeNull();
  });

  it('shares one rotating-token refresh across concurrent callers', async () => {
    await setXAIToken(dataDir, {
      accessToken: 'expired', refreshToken: 'refresh-once', tokenType: 'Bearer', savedAt: 0, expiresAt: 0,
    });
    let calls = 0;
    const rotatingFetch: typeof fetch = async () => {
      const first = ++calls === 1;
      return new Response(JSON.stringify(first
        ? { access_token: 'fresh', refresh_token: 'rotated', expires_in: 1800 }
        : { error: 'invalid_grant' }), { status: first ? 200 : 400 });
    };

    const results = await Promise.all(Array.from({ length: 3 }, () => resolveXAIBearer(dataDir, rotatingFetch)));
    expect(results).toEqual(Array.from({ length: 3 }, () => ({ accessToken: 'fresh', source: 'refreshed' })));
    expect(calls).toBe(1);
    const stored = JSON.parse(await readFile(path.join(dataDir, 'xai-tokens.json'), 'utf8'));
    expect(stored.token.refreshToken).toBe('rotated');
  });

  it('coalesces equivalent data-directory paths', async () => {
    await setXAIToken(dataDir, {
      accessToken: 'expired', refreshToken: 'refresh-once', tokenType: 'Bearer', savedAt: 0, expiresAt: 0,
    });
    let calls = 0;
    const refresh: typeof fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ access_token: 'fresh', expires_in: 1800 }));
    };
    await Promise.all([
      resolveXAIBearer(dataDir, refresh),
      resolveXAIBearer(`${dataDir}${path.sep}.`, refresh),
    ]);
    expect(calls).toBe(1);
  });

  it('allows another attempt after a shared refresh failure', async () => {
    await setXAIToken(dataDir, {
      accessToken: 'expired', refreshToken: 'refresh-once', tokenType: 'Bearer', savedAt: 0, expiresAt: 0,
    });
    let calls = 0;
    const failingFetch: typeof fetch = async () => {
      calls += 1;
      throw new Error('connection reset');
    };
    expect(await Promise.all([
      resolveXAIBearer(dataDir, failingFetch), resolveXAIBearer(dataDir, failingFetch),
    ])).toEqual([null, null]);
    expect(calls).toBe(1);
    expect(await resolveXAIBearer(dataDir, fetchOk({ access_token: 'recovered', expires_in: 1800 })))
      .toEqual({ accessToken: 'recovered', source: 'refreshed' });
  });

  it('reads the stored credential again after a successful refresh settles', async () => {
    await setXAIToken(dataDir, {
      accessToken: 'expired', refreshToken: 'refresh-once', tokenType: 'Bearer', savedAt: 0, expiresAt: 0,
    });
    await resolveXAIBearer(dataDir, fetchOk({ access_token: 'fresh', expires_in: 1800 }));
    expect(await resolveXAIBearer(dataDir, fetchAlwaysFails()))
      .toEqual({ accessToken: 'fresh', source: 'stored' });
  });

  it('refreshes independent token stores without waiting for each other', async () => {
    const otherDir = path.join(dataDir, 'other');
    for (const dir of [dataDir, otherDir]) {
      await setXAIToken(dir, {
        accessToken: 'expired', refreshToken: 'refresh-once', tokenType: 'Bearer', savedAt: 0, expiresAt: 0,
      });
    }
    let signalStarted!: () => void;
    let releaseRefresh!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const first = resolveXAIBearer(dataDir, async () => {
      signalStarted();
      await release;
      return new Response(JSON.stringify({ access_token: 'first', expires_in: 1800 }));
    });
    await started;
    try {
      expect(await resolveXAIBearer(otherDir, fetchOk({ access_token: 'second', expires_in: 1800 })))
        .toEqual({ accessToken: 'second', source: 'refreshed' });
    } finally {
      releaseRefresh();
      await first;
    }
    expect(await first).toEqual({ accessToken: 'first', source: 'refreshed' });
  });

  it('preserves the existing refresh_token when the refresh response omits it', async () => {
    const stored: StoredXAIToken = {
      accessToken: 'old-bearer',
      tokenType: 'Bearer',
      savedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
      refreshToken: 'rt-1',
    };
    await setXAIToken(dataDir, stored);

    const resolved = await resolveXAIBearer(
      dataDir,
      // Some token endpoints omit refresh_token in the refresh response
      // (RFC 6749 §6 lets the server keep the old one valid).
      // resolveXAIBearer must carry the previous refresh_token forward
      // so the next expiry can still refresh.
      fetchOk({ access_token: 'new-bearer', token_type: 'Bearer' }),
    );
    expect(resolved?.accessToken).toBe('new-bearer');
    expect(resolved?.source).toBe('refreshed');

    const onDisk = JSON.parse(
      await readFile(path.join(dataDir, 'xai-tokens.json'), 'utf8'),
    );
    // Old refresh_token must survive the partial refresh response so
    // the next expiry doesn't kick the user back through Sign in.
    expect(onDisk.token.refreshToken).toBe('rt-1');
    // expires_in not in response → we don't fabricate one.
    expect(onDisk.token.expiresAt).toBeUndefined();
  });
});
