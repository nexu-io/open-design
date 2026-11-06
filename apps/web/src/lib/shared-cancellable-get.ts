// Single-flight GET coalescing for readers that need per-caller cancellation.
//
// `coalescedGet` (see ./coalesced-get.ts) collapses identical display reads
// into one shared promise, but it cannot serve cancellable callers: a shared
// promise must not die because ONE of its consumers aborted, and a
// non-cancellable consumer must never wait behind an entry that an abortable
// consumer is about to kill. Historically cancellable reads therefore
// bypassed coalescing entirely — which is exactly how one project open issued
// the same `/files` GET twice (evidence/electron-project-waterfall-20260727).
//
// This helper closes that gap with reference counting:
// - All callers of the same key share one network request (the `run` callback
//   receives the SHARED AbortSignal and must pass it to fetch).
// - A caller that supplies its own signal joins as a cancellable reader: its
//   abort settles only its own promise (with an AbortError) immediately.
// - The shared request is aborted only when every joined reader has aborted
//   and no non-cancellable reader pinned it.
// - Successful results are shared for a short TTL (same burst-absorbing
//   window as `coalescedGet`); failures are never cached.

const DEFAULT_TTL_MS = 1000;

type SharedEntry<T> = {
  promise: Promise<T>;
  controller: AbortController;
  /** True once a caller without a signal joined — the request must outlive
   *  every cancellable reader because someone unconditionally awaits it. */
  pinned: boolean;
  /** Cancellable readers that have neither settled nor aborted yet. */
  liveJoiners: number;
  settledAt: number | null;
};

const entries = new Map<string, SharedEntry<unknown>>();

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const abortError = (): DOMException => new DOMException('Aborted', 'AbortError');

function createEntry<T>(
  key: string,
  run: (signal: AbortSignal) => Promise<T>,
  ttlMs: number,
): SharedEntry<T> {
  const controller = new AbortController();
  const entry: SharedEntry<T> = {
    controller,
    pinned: false,
    liveJoiners: 0,
    settledAt: null,
    promise: undefined as unknown as Promise<T>,
  };
  entry.promise = run(controller.signal).then(
    (value) => {
      entry.settledAt = nowMs();
      setTimeout(() => {
        if (entries.get(key) === (entry as SharedEntry<unknown>)) entries.delete(key);
      }, ttlMs);
      return value;
    },
    (error) => {
      // Never cache a failure; the next caller retries immediately.
      if (entries.get(key) === (entry as SharedEntry<unknown>)) entries.delete(key);
      throw error;
    },
  );
  entries.set(key, entry as SharedEntry<unknown>);
  return entry;
}

export function sharedCancellableGet<T>(
  key: string,
  run: (signal: AbortSignal) => Promise<T>,
  options?: { signal?: AbortSignal; ttlMs?: number },
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const callerSignal = options?.signal;
  if (callerSignal?.aborted) return Promise.reject(abortError());

  let entry = entries.get(key) as SharedEntry<T> | undefined;
  if (entry && entry.settledAt !== null && nowMs() - entry.settledAt >= ttlMs) {
    entry = undefined;
  }
  if (!entry) entry = createEntry(key, run, ttlMs);

  if (!callerSignal) {
    entry.pinned = true;
    return entry.promise;
  }
  if (entry.settledAt !== null) return entry.promise;

  entry.liveJoiners += 1;
  const joined = entry;
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const onAbort = () => {
      if (done) return;
      done = true;
      joined.liveJoiners -= 1;
      if (joined.liveJoiners === 0 && !joined.pinned && joined.settledAt === null) {
        joined.controller.abort();
        // The shared rejection has no listeners left; observe it so the
        // deliberate group-abort never surfaces as an unhandled rejection.
        void joined.promise.catch(() => {});
        if (entries.get(key) === (joined as SharedEntry<unknown>)) entries.delete(key);
      }
      reject(abortError());
    };
    callerSignal.addEventListener('abort', onAbort, { once: true });
    joined.promise.then(
      (value) => {
        if (done) return;
        done = true;
        callerSignal.removeEventListener('abort', onAbort);
        joined.liveJoiners -= 1;
        resolve(value);
      },
      (error) => {
        if (done) return;
        done = true;
        callerSignal.removeEventListener('abort', onAbort);
        joined.liveJoiners -= 1;
        reject(error);
      },
    );
  });
}

/** Drop one key's entry so the next caller reads fresh. */
export function evictSharedCancellableGet(key: string): void {
  entries.delete(key);
}

// Mirror of `forceCoalescedGet`'s burst window (see coalesced-get.ts): when a
// broadcast identity-change event makes several mounted consumers force a
// fresh read in the same dispatch pass, only the first eviction wins and the
// rest join its fetch instead of destroying it.
const FORCE_BURST_MS = 250;
const forcedAt = new Map<string, number>();

/**
 * Like `sharedCancellableGet`, but the caller announces the cached answer is
 * void (identity change / explicit revalidation) and must be re-read.
 */
export function forceSharedCancellableGet<T>(
  key: string,
  run: (signal: AbortSignal) => Promise<T>,
  options?: { signal?: AbortSignal; ttlMs?: number },
): Promise<T> {
  const now = nowMs();
  const last = forcedAt.get(key);
  if (last === undefined || now - last >= FORCE_BURST_MS) {
    forcedAt.set(key, now);
    evictSharedCancellableGet(key);
  }
  return sharedCancellableGet(key, run, options);
}

/** Test-only: drop every entry so cases start clean. */
export function resetSharedCancellableGet(): void {
  entries.clear();
  forcedAt.clear();
}
