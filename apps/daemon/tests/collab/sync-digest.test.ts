import { describe, expect, it } from 'vitest';

import {
  createSyncDigestReader,
  parseSyncDigest,
  tokenForFace,
} from '../../src/collab/sync-digest.js';

// B's `GET /api/v1/collab/sync-digest` hands out four OPAQUE tokens. The only
// legal operation is `===` against a token we stored earlier — they are built
// from `max(updated_at) || ':' || count(*)`, so there is no ordering relation
// between two values and no timestamp to parse out.

const VALID = {
  catalogToken: '2026-07-20T00:00:00Z:4',
  membersToken: '2026-07-20T00:00:00Z:2',
  contextToken: '2026-07-20T00:00:00Z',
  billingToken: '',
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    profile: 'prod',
    apiUrl: 'https://amr-api.example.test',
    controlKey: 'ck-1',
    user: { id: 'user-1', email: 'a@example.test' },
    configMtimeMs: null,
    ...overrides,
  } as never;
}

describe('parseSyncDigest', () => {
  it('accepts the four-token payload, including an empty billing token', () => {
    // An empty `billingToken` is the documented no-subscription value, not a
    // malformed response.
    expect(parseSyncDigest(VALID)).toEqual(VALID);
  });

  it('accepts the empty-table token shapes verbatim', () => {
    // `'0:0'` / `'0'` are values, not sentinels — nothing may special-case them.
    const empty = { catalogToken: '0:0', membersToken: '0:0', contextToken: '0', billingToken: '' };
    expect(parseSyncDigest(empty)).toEqual(empty);
  });

  it('rejects a payload with a missing or non-string token', () => {
    expect(parseSyncDigest({ ...VALID, membersToken: undefined })).toBeNull();
    expect(parseSyncDigest({ ...VALID, catalogToken: 12 })).toBeNull();
    expect(parseSyncDigest(null)).toBeNull();
    expect(parseSyncDigest([VALID])).toBeNull();
  });
});

describe('tokenForFace', () => {
  it('maps each cached face to its own token', () => {
    expect(tokenForFace(VALID, 'catalog')).toBe(VALID.catalogToken);
    expect(tokenForFace(VALID, 'members')).toBe(VALID.membersToken);
  });
});

describe('createSyncDigestReader', () => {
  it('reads the digest with the same auth the SSE channel uses', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const read = createSyncDigestReader({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      getWorkspaceId: () => 'ws-1',
      readSession: () => session(),
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ url, headers: init.headers as Record<string, string> });
        return new Response(JSON.stringify(VALID), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch,
    });

    await expect(read()).resolves.toEqual({
      accountId: 'user-1',
      workspaceId: 'ws-1',
      digest: VALID,
    });
    expect(seen[0]?.url).toBe('https://amr-api.example.test/api/v1/collab/sync-digest');
    expect(seen[0]?.headers.authorization).toBe('Bearer ck-1');
    expect(seen[0]?.headers['x-vela-workspace-id']).toBe('ws-1');
  });

  it('stays off the wire unless the workspace source is vela', async () => {
    let called = 0;
    const read = createSyncDigestReader({
      // A dev daemon on any other source has no hub to ask and must not dial
      // production — the same gate the hub events subscriber uses.
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'stub' },
      getWorkspaceId: () => 'ws-1',
      readSession: () => session(),
      fetchImpl: (async () => {
        called += 1;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });

    await expect(read()).resolves.toBeNull();
    expect(called).toBe(0);
  });

  it('reports null rather than inventing a key when the account id is missing', async () => {
    let called = 0;
    const read = createSyncDigestReader({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      getWorkspaceId: () => 'ws-1',
      // A config-only session read can land before the user record does. An
      // empty account id must never become a cache key.
      readSession: () => session({ user: null }),
      fetchImpl: (async () => {
        called += 1;
        return new Response(JSON.stringify(VALID), { status: 200 });
      }) as unknown as typeof fetch,
    });

    await expect(read()).resolves.toBeNull();
    expect(called).toBe(0);
  });

  it('reports null when no workspace is selected', async () => {
    const read = createSyncDigestReader({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      getWorkspaceId: () => '   ',
      readSession: () => session(),
      fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    });

    await expect(read()).resolves.toBeNull();
  });

  it('reports null on a transport failure instead of throwing', async () => {
    const errors: unknown[] = [];
    const read = createSyncDigestReader({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      getWorkspaceId: () => 'ws-1',
      readSession: () => session(),
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      onError: (error) => errors.push(error),
    });

    // Callers treat null as "cannot prove the snapshot is current", which is a
    // real fetch — a digest outage degrades, it never fails a page load.
    await expect(read()).resolves.toBeNull();
    expect(errors).toHaveLength(1);
  });

  it('reports null on a non-2xx digest response', async () => {
    const read = createSyncDigestReader({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      getWorkspaceId: () => 'ws-1',
      readSession: () => session(),
      fetchImpl: (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch,
    });

    await expect(read()).resolves.toBeNull();
  });

  it('stops asking for a cooldown after a failure, then resumes', async () => {
    let clock = 1_000;
    let calls = 0;
    let broken = true;
    const read = createSyncDigestReader({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      getWorkspaceId: () => 'ws-1',
      readSession: () => session(),
      failureCooldownMs: 60_000,
      now: () => clock,
      fetchImpl: (async () => {
        calls += 1;
        // A B deployment that predates the endpoint answers 404 forever.
        if (broken) return new Response('no route', { status: 404 });
        return new Response(JSON.stringify(VALID), { status: 200 });
      }) as unknown as typeof fetch,
    });

    await expect(read()).resolves.toBeNull();
    expect(calls).toBe(1);

    // The digest exists to REPLACE a slow read. Retrying it on every catalog and
    // member load would add a round-trip to each one for no chance of a hit.
    clock += 1_000;
    await expect(read()).resolves.toBeNull();
    expect(calls).toBe(1);

    clock += 60_000;
    broken = false;
    await expect(read()).resolves.toMatchObject({ accountId: 'user-1' });
    expect(calls).toBe(2);

    // A success clears the cooldown rather than leaving it armed.
    await read();
    expect(calls).toBe(3);
  });

  it('coalesces concurrent reads onto one request but does not cache the result', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = createSyncDigestReader({
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
      getWorkspaceId: () => 'ws-1',
      readSession: () => session(),
      fetchImpl: (async () => {
        calls += 1;
        await gate;
        return new Response(JSON.stringify(VALID), { status: 200 });
      }) as unknown as typeof fetch,
    });

    // Catalog and members refresh milliseconds apart on one navigation; they
    // must not cost two identical round-trips.
    const both = Promise.all([read(), read()]);
    release();
    await both;
    expect(calls).toBe(1);

    // But a SETTLED token is never reused: a token is only meaningful when it
    // was read fresh, or it could green-light a snapshot the cloud moved past.
    await read();
    expect(calls).toBe(2);
  });
});
