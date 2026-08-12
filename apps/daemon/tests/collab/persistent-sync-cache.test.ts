import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../../src/db.js';
import {
  createCollabSyncSnapshotStore,
  parseTeamProjectSnapshot,
  type CollabSyncSnapshotStore,
} from '../../src/collab/sync-snapshot-store.js';
import { createPersistentSyncCache } from '../../src/collab/persistent-sync-cache.js';
import type { SyncDigest, SyncDigestReading } from '../../src/collab/sync-digest.js';
import type { TeamProject } from '@open-design/contracts';

// The persistent half of the workspace sync design: SSE marks dirty, B's
// sync-digest hands out opaque comparison tokens, and this layer decides
// whether the payload already on disk can stand in for a real round-trip.
//
// The reuse rule under test is three conditions AND-ed — local token, local
// snapshot, token equality — with EVERY other combination falling through to a
// real fetch. Account isolation is the load-bearing one: a snapshot must never
// be readable by a different signed-in user.

function digest(overrides: Partial<SyncDigest> = {}): SyncDigest {
  return {
    catalogToken: '2026-07-20T00:00:00Z:2',
    membersToken: '2026-07-20T00:00:00Z:3',
    contextToken: '2026-07-20T00:00:00Z',
    billingToken: '',
    ...overrides,
  };
}

function reading(
  accountId: string,
  workspaceId: string,
  overrides: Partial<SyncDigest> = {},
): SyncDigestReading {
  return { accountId, workspaceId, digest: digest(overrides) };
}

function project(projectId: string): TeamProject {
  return {
    projectId,
    ownerMemberId: 'member-1',
    sharedAt: '2026-07-20T00:00:00Z',
  };
}

describe('createPersistentSyncCache', () => {
  let tempDir: string;
  let store: CollabSyncSnapshotStore;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-sync-snapshot-'));
    // Real schema through the daemon's own migration path, so the account id is
    // genuinely part of the primary key rather than a fake in-memory map.
    store = createCollabSyncSnapshotStore(openDatabase(tempDir, { dataDir: tempDir }));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  /** A cache over a counting fetcher, with a mutable digest reading. */
  function harness(options: {
    read: () => SyncDigestReading | null | Promise<SyncDigestReading | null>;
    list?: () => TeamProject[];
    shouldCache?: () => boolean | Promise<boolean>;
  }) {
    const calls: number[] = [];
    let fetchCount = 0;
    const cache = createPersistentSyncCache<TeamProject[]>({
      face: 'catalog',
      fetch: async () => {
        fetchCount += 1;
        calls.push(fetchCount);
        return options.list ? options.list() : [project('p1')];
      },
      readDigest: async () => options.read(),
      store,
      parseSnapshot: parseTeamProjectSnapshot,
      ...(options.shouldCache ? { shouldCache: options.shouldCache } : {}),
    });
    return { cache, fetchCount: () => fetchCount };
  }

  it('cold start has no snapshot, so the first read is a real fetch', async () => {
    const { cache, fetchCount } = harness({ read: () => reading('user-1', 'ws-1') });

    await expect(cache()).resolves.toEqual([project('p1')]);

    expect(fetchCount()).toBe(1);
  });

  it('reuses the snapshot without a real fetch when the token is unchanged', async () => {
    const { cache, fetchCount } = harness({ read: () => reading('user-1', 'ws-1') });

    await cache();
    expect(fetchCount()).toBe(1);

    // Same token on the second read: the stored snapshot stands in and the
    // expensive lister is never called again.
    await expect(cache()).resolves.toEqual([project('p1')]);
    await expect(cache()).resolves.toEqual([project('p1')]);
    expect(fetchCount()).toBe(1);
  });

  it('re-fetches and writes back when the cloud token moves', async () => {
    let token = 'token-a';
    let listed = [project('p1')];
    const { cache, fetchCount } = harness({
      read: () => reading('user-1', 'ws-1', { catalogToken: token }),
      list: () => listed,
    });

    await cache();
    expect(fetchCount()).toBe(1);

    // A teammate shared a project: B's token moves (its `count(*)` term means
    // even a hard delete moves it), so reuse is off.
    token = 'token-b';
    listed = [project('p1'), project('p2')];
    await expect(cache()).resolves.toEqual([project('p1'), project('p2')]);
    expect(fetchCount()).toBe(2);

    // The new payload was written back under the new token, so the next read
    // reuses it rather than fetching a third time.
    await expect(cache()).resolves.toEqual([project('p1'), project('p2')]);
    expect(fetchCount()).toBe(2);
  });

  it('never serves one account the snapshot another account cached', async () => {
    let accountId = 'user-1';
    let listed = [project('owned-by-user-1')];
    const { cache, fetchCount } = harness({
      // Same workspace id and the SAME digest token for both users — only the
      // account differs. If the account were not part of the key, user-2 would
      // be handed user-1's catalog here.
      read: () => reading(accountId, 'ws-shared'),
      list: () => listed,
    });

    await expect(cache()).resolves.toEqual([project('owned-by-user-1')]);
    expect(fetchCount()).toBe(1);

    accountId = 'user-2';
    listed = [project('owned-by-user-2')];
    await expect(cache()).resolves.toEqual([project('owned-by-user-2')]);
    expect(fetchCount()).toBe(2);

    // And switching back does not resurrect the wrong one either.
    accountId = 'user-1';
    listed = [project('should-not-be-reached')];
    await expect(cache()).resolves.toEqual([project('owned-by-user-1')]);
    expect(fetchCount()).toBe(2);
  });

  it('keys snapshots per workspace as well as per account', async () => {
    let workspaceId = 'ws-1';
    let listed = [project('in-ws-1')];
    const { cache, fetchCount } = harness({
      read: () => reading('user-1', workspaceId),
      list: () => listed,
    });

    await cache();
    workspaceId = 'ws-2';
    listed = [project('in-ws-2')];

    await expect(cache()).resolves.toEqual([project('in-ws-2')]);
    expect(fetchCount()).toBe(2);
  });

  it('falls back to a real fetch when the digest is unavailable', async () => {
    let available = true;
    const { cache, fetchCount } = harness({
      read: () => (available ? reading('user-1', 'ws-1') : null),
    });

    await cache();
    expect(fetchCount()).toBe(1);

    // Offline / signed out / non-vela source: no token means nothing to compare
    // against, which is a miss — never an optimistic reuse.
    available = false;
    await expect(cache()).resolves.toEqual([project('p1')]);
    expect(fetchCount()).toBe(2);
  });

  it('treats an empty face token as no token at all', async () => {
    const { cache, fetchCount } = harness({
      read: () => reading('user-1', 'ws-1', { catalogToken: '' }),
    });

    await cache();
    await cache();

    // Nothing was stored (there was no token to pair a snapshot with), so both
    // reads went to the real lister.
    expect(fetchCount()).toBe(2);
    expect(store.read({ face: 'catalog', accountId: 'user-1', workspaceId: 'ws-1' })).toBeNull();
  });

  it('degrades to a real fetch when the stored snapshot is corrupt', async () => {
    const key = { face: 'catalog' as const, accountId: 'user-1', workspaceId: 'ws-1' };
    store.write(key, { token: digest().catalogToken, snapshotJson: '{not json' });

    const { cache, fetchCount } = harness({ read: () => reading('user-1', 'ws-1') });

    await expect(cache()).resolves.toEqual([project('p1')]);
    expect(fetchCount()).toBe(1);

    // The unusable row was retired and replaced by the fresh fetch, so the next
    // read is a clean hit instead of repeating the corruption dance.
    await cache();
    expect(fetchCount()).toBe(1);
  });

  it('degrades to a real fetch when the stored snapshot has the wrong shape', async () => {
    const key = { face: 'catalog' as const, accountId: 'user-1', workspaceId: 'ws-1' };
    // Valid JSON, wrong contract — e.g. a payload written by an older schema.
    store.write(key, {
      token: digest().catalogToken,
      snapshotJson: JSON.stringify([{ projectId: 'p1' }]),
    });

    const { cache, fetchCount } = harness({ read: () => reading('user-1', 'ws-1') });

    await expect(cache()).resolves.toEqual([project('p1')]);
    expect(fetchCount()).toBe(1);
  });

  it('keeps a usable snapshot when the real fetch fails', async () => {
    let token = 'token-a';
    let fail = false;
    let fetchCount = 0;
    const cache = createPersistentSyncCache<TeamProject[]>({
      face: 'catalog',
      fetch: async () => {
        fetchCount += 1;
        if (fail) throw new Error('catalog unreachable');
        return [project('p1')];
      },
      readDigest: async () => reading('user-1', 'ws-1', { catalogToken: token }),
      store,
      parseSnapshot: parseTeamProjectSnapshot,
    });

    await cache();
    expect(fetchCount).toBe(1);

    // Token moved AND the network is down: the failure propagates unchanged
    // (the caller's existing error handling owns it) and must not take the
    // stored snapshot down with it.
    token = 'token-b';
    fail = true;
    await expect(cache()).rejects.toThrow('catalog unreachable');
    expect(
      store.read({ face: 'catalog', accountId: 'user-1', workspaceId: 'ws-1' }),
    ).toMatchObject({ token: 'token-a' });

    // Once the token comes back to what the snapshot was taken at, it is served
    // again without a fetch — the outage cost nothing permanent.
    token = 'token-a';
    fail = false;
    await expect(cache()).resolves.toEqual([project('p1')]);
    expect(fetchCount).toBe(2);
  });

  it('bypasses itself entirely until the workspace context is authoritative', async () => {
    let ready = false;
    let listed: TeamProject[] = [];
    const { cache, fetchCount } = harness({
      read: () => reading('user-1', 'ws-1'),
      list: () => listed,
      shouldCache: () => ready,
    });

    // Startup: the lister answers `[]` because there is no team identity yet.
    // That empty must not be snapshotted, or it would pin an empty catalog for
    // as long as the upstream token stayed put.
    await expect(cache()).resolves.toEqual([]);
    expect(store.read({ face: 'catalog', accountId: 'user-1', workspaceId: 'ws-1' })).toBeNull();

    ready = true;
    listed = [project('p1')];
    await expect(cache()).resolves.toEqual([project('p1')]);
    expect(fetchCount()).toBe(2);
  });

  it('invalidate() drops the persisted row so a restart cannot resurrect it', async () => {
    const { cache, fetchCount } = harness({ read: () => reading('user-1', 'ws-1') });

    await cache();
    expect(store.read({ face: 'catalog', accountId: 'user-1', workspaceId: 'ws-1' })).not.toBeNull();

    cache.invalidate();
    expect(store.read({ face: 'catalog', accountId: 'user-1', workspaceId: 'ws-1' })).toBeNull();

    await cache();
    expect(fetchCount()).toBe(2);
  });

  it('does not reuse a snapshot invalidated while the digest was in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    let fetchCount = 0;
    const cache = createPersistentSyncCache<TeamProject[]>({
      face: 'catalog',
      fetch: async () => {
        fetchCount += 1;
        return [project('p1')];
      },
      readDigest: async () => {
        if (held) await gate;
        return reading('user-1', 'ws-1');
      },
      store,
      parseSnapshot: parseTeamProjectSnapshot,
    });

    await cache();
    expect(fetchCount).toBe(1);

    held = true;
    const pending = cache();
    // A share/unshare lands while the digest round-trip is still open. The
    // token it returns is the pre-change one, so equality alone would wrongly
    // green-light the stale snapshot.
    cache.invalidate();
    release();
    await pending;

    expect(fetchCount).toBe(2);
  });

  it('does not persist a snapshot invalidated while the real fetch was in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    let fetchCount = 0;
    const cache = createPersistentSyncCache<TeamProject[]>({
      face: 'catalog',
      fetch: async () => {
        fetchCount += 1;
        if (held) await gate;
        return [project('stale-before-the-change')];
      },
      readDigest: async () => reading('user-1', 'ws-1'),
      store,
      parseSnapshot: parseTeamProjectSnapshot,
    });

    held = true;
    const pending = cache();
    // The share/unshare lands after the fetch was issued, so the value in
    // flight predates the change. Writing it back under the pre-change token
    // reopens exactly the window invalidate() exists to close: the cloud digest
    // has not recomputed yet, so the next read would find a matching token
    // sitting on top of a snapshot that is already wrong.
    cache.invalidate();
    release();
    await pending;

    expect(store.read({ face: 'catalog', accountId: 'user-1', workspaceId: 'ws-1' })).toBeNull();

    await cache();
    expect(fetchCount).toBe(2);
  });

  it('isolates the two faces from each other', async () => {
    const membersCache = createPersistentSyncCache<TeamProject[]>({
      face: 'members',
      fetch: async () => [project('members-face')],
      readDigest: async () => reading('user-1', 'ws-1'),
      store,
      parseSnapshot: parseTeamProjectSnapshot,
    });
    const { cache: catalogCache } = harness({ read: () => reading('user-1', 'ws-1') });

    await catalogCache();
    await membersCache();

    expect(store.read({ face: 'catalog', accountId: 'user-1', workspaceId: 'ws-1' })).toMatchObject({
      snapshotJson: JSON.stringify([project('p1')]),
    });
    expect(store.read({ face: 'members', accountId: 'user-1', workspaceId: 'ws-1' })).toMatchObject({
      snapshotJson: JSON.stringify([project('members-face')]),
    });
  });
});
