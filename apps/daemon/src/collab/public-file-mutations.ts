import { AsyncLocalStorage } from 'node:async_hooks';

export interface PublicFileMutations {
  /** Nested root publication may join its caller's still-active mutation lane. */
  run<T>(projectId: string | readonly string[], operation: () => Promise<T>, options?: { joinCurrent?: true }): Promise<T>;
  withMoves<T>(projectIds: readonly string[], operation: () => Promise<T>): Promise<T>;
  captureReconciliation(): (projectId: string) => boolean;
}

/**
 * One daemon-owned project lane for publication, stop, deletion and explicit
 * visibility moves. Hold until the operation settles, not until its HTTP
 * connection closes. Independent projects never block each other. Only moves
 * fence catalog reads; publishing a file does not change project policy.
 * Remote/cross-daemon races still need cloud authority.
 */
export function createPublicFileMutations(): PublicFileMutations {
  const tails = new Map<string, Promise<void>>();
  const ownership = new AsyncLocalStorage<ReadonlyMap<string, { active: boolean }>>();
  const moves = new Map<string, number>();
  const revisions = new Map<string, number>();
  let revision = 0;
  async function run<T>(projectId: string | readonly string[], operation: () => Promise<T>, options?: { joinCurrent?: true }): Promise<T> {
    const keys = [...new Set(typeof projectId === 'string' ? [projectId] : projectId)].sort();
    const inherited = ownership.getStore();
    if (options?.joinCurrent && keys.every(key => inherited?.get(key)?.active)) return operation();
    async function acquire(index: number): Promise<T> {
      const key = keys[index];
      if (key === undefined) {
        const lease = { active: true };
        const owned = new Map(inherited);
        for (const heldKey of keys) owned.set(heldKey, lease);
        try {
          return await ownership.run(owned, operation);
        } finally {
          // Async descendants may outlive the caller; expired ownership is
          // never permission to bypass a later request's queued mutation.
          lease.active = false;
        }
      }
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => { release = resolve; });
      tails.set(key, current);
      await previous;
      try {
        return await acquire(index + 1);
      } finally {
        release();
        if (tails.get(key) === current) tails.delete(key);
      }
    }
    return acquire(0);
  }
  return {
    run,
    captureReconciliation() {
      const capturedRevision = revision;
      const blocked = new Set(moves.keys());
      return (id) => !blocked.has(id) && !moves.has(id)
        && (revisions.get(id) ?? 0) <= capturedRevision;
    },
    async withMoves(projectIds, operation) {
      const keys = [...new Set(projectIds)];
      for (const key of keys) {
        moves.set(key, (moves.get(key) ?? 0) + 1);
        revisions.set(key, ++revision);
      }
      try {
        return await run(keys, operation);
      } finally {
        for (const key of keys) {
          const remaining = (moves.get(key) ?? 1) - 1;
          if (remaining) moves.set(key, remaining);
          else moves.delete(key);
          revisions.set(key, ++revision);
        }
      }
    },
  };
}
