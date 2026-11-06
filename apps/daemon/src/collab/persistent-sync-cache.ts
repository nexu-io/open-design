// Persistent half of the workspace sync design (SSE push marks dirty + local
// snapshot + digest token compare).
//
// This layer sits BELOW the in-memory stale-while-revalidate caches in
// server.ts. They answer "the same page asked twice in one second"; this one
// answers "the daemon restarted, or this workspace has not been opened in a
// while" — a cold process still pays a full catalog/member round-trip on first
// paint even though nothing changed upstream. Trading that round-trip for a
// digest GET is the entire win.
//
// The reuse test is three conditions AND-ed, never a heuristic:
//
//   1. a local token exists,
//   2. a local snapshot exists,
//   3. the local token EQUALS the token the cloud reports right now.
//
// Anything else — no digest (signed out, offline, non-vela source), no stored
// row, unparseable payload, different token — falls through to the real fetch.
// Conditions 1 and 2 collapse into a single row read because the store writes
// token and snapshot atomically.
//
// Failure behavior is deliberately asymmetric: a failed digest degrades to a
// real fetch, and a failed real fetch propagates to the caller unchanged while
// leaving the stored snapshot untouched, so a transient outage never destroys a
// snapshot that a later successful digest could still validate.

import {
  tokenForFace,
  type SyncDigestFace,
  type SyncDigestReader,
} from './sync-digest.js';
import type {
  CollabSyncSnapshotKey,
  CollabSyncSnapshotStore,
} from './sync-snapshot-store.js';

export interface PersistentSyncCacheOptions<T> {
  face: SyncDigestFace;
  /** The real (expensive) read this cache is trying to avoid. */
  fetch: () => Promise<T>;
  readDigest: SyncDigestReader;
  store: CollabSyncSnapshotStore;
  /** Validate a decoded snapshot; returning null forces a real fetch. */
  parseSnapshot: (value: unknown) => T | null;
  /**
   * Is the fetcher's answer authoritative right now?
   *
   * Both cached readers answer `[]` — not an error — while the workspace
   * context has no team identity yet (startup, signed out, personal
   * workspace). That empty is indistinguishable from a genuinely empty team,
   * so persisting it under a live token would pin an empty catalog/roster
   * until something upstream happened to change. When this returns false the
   * cache is bypassed entirely: no read, no write, just the real fetch.
   */
  shouldCache?: () => boolean | Promise<boolean>;
  onError?: (error: unknown) => void;
}

export interface PersistentSyncCache<T> {
  (): Promise<T>;
  /**
   * Drop the persisted snapshot for the key last used.
   *
   * Only for the moments we KNOW the payload changed (a local share/unshare, a
   * hub event). Correctness does not depend on it — a changed payload moves the
   * cloud token, which already defeats reuse — but it keeps an invalidated
   * entry from surviving in the database across a restart.
   */
  invalidate(): void;
}

export function createPersistentSyncCache<T>(
  options: PersistentSyncCacheOptions<T>,
): PersistentSyncCache<T> {
  const { face, store, parseSnapshot } = options;
  let lastKey: CollabSyncSnapshotKey | null = null;
  // Bumped by invalidate(); a read that started before the bump must not reuse
  // a snapshot that was invalidated while its digest was in flight.
  let generation = 0;

  const readStoredSnapshot = (key: CollabSyncSnapshotKey, token: string): T | null => {
    let record;
    try {
      record = store.read(key);
    } catch (error) {
      options.onError?.(error);
      return null;
    }
    if (!record || record.token !== token) return null;
    let decoded: unknown;
    try {
      decoded = JSON.parse(record.snapshotJson);
    } catch {
      // Corrupt payload: the row can never be validated again, so retire it.
      try {
        store.drop(key);
      } catch (error) {
        options.onError?.(error);
      }
      return null;
    }
    const parsed = parseSnapshot(decoded);
    if (parsed === null) {
      try {
        store.drop(key);
      } catch (error) {
        options.onError?.(error);
      }
      return null;
    }
    return parsed;
  };

  const read = async (): Promise<T> => {
    const startedAt = generation;
    if (options.shouldCache) {
      let ready = false;
      try {
        ready = await options.shouldCache();
      } catch (error) {
        options.onError?.(error);
      }
      if (!ready) return options.fetch();
    }
    const reading = await options.readDigest();
    // A reading always carries a non-empty account + workspace (the reader
    // refuses to report one otherwise), so a key is either fully formed or
    // absent — there is no placeholder-keyed cache entry.
    const token = reading ? tokenForFace(reading.digest, face) : '';
    const key: CollabSyncSnapshotKey | null =
      reading && token ? { face, accountId: reading.accountId, workspaceId: reading.workspaceId } : null;
    if (key) lastKey = key;

    if (key && generation === startedAt) {
      const snapshot = readStoredSnapshot(key, token);
      if (snapshot !== null) return snapshot;
    }

    const value = await options.fetch();
    // The same generation guard as the reuse path above, and for the same
    // reason. A change that lands while this fetch is open makes the value in
    // flight already stale, while `token` still names the pre-change state — so
    // writing the pair back would restore exactly the row invalidate() just
    // dropped, and the cloud digest has not necessarily recomputed yet to
    // defeat it. Skipping the write costs one round-trip next time; making it
    // would serve wrong data.
    if (key && generation === startedAt) {
      try {
        store.write(key, { token, snapshotJson: JSON.stringify(value) });
      } catch (error) {
        // A cache that cannot be written is still a correct cache.
        options.onError?.(error);
      }
    }
    return value;
  };

  return Object.assign(read, {
    invalidate() {
      generation += 1;
      if (!lastKey) return;
      try {
        store.drop(lastKey);
      } catch (error) {
        options.onError?.(error);
      }
    },
  });
}
