/**
 * Orders asynchronous state commits for one mutable resource. Start each
 * competing read with `begin()` and only commit when its revision is still
 * current; local writes call `invalidate()` to make every earlier read stale.
 * `capture()` is for reads coordinated by another hook that already owns their
 * own call ordering, but still needs to observe local-write invalidation.
 *
 * A write has TWO moments that can make an in-flight read's captured
 * revision stale, and both must call `invalidate()`:
 *   1. The optimistic start (the local value changes immediately).
 *   2. The settle (success OR failure — the write's server round-trip
 *      finishes, so any read whose OWN round-trip is still in flight at that
 *      point could still resolve with pre-write data afterward).
 * Invalidating only at start leaves a window open: a read that begins AFTER
 * the write starts but resolves AFTER the write settles will still observe a
 * captured revision that predates the settle, and nothing will have moved
 * the guard forward again to catch it. (This exact gap shipped once in
 * useMemoryConfig's hydrate() — invalidate() was only called at toggle
 * start, not in the write's onSettled callback — before being caught in
 * review and fixed.)
 */
export interface AsyncCommitGuard {
  begin: () => number;
  capture: () => number;
  invalidate: () => void;
  isCurrent: (revision: number) => boolean;
}

export function createAsyncCommitGuard(): AsyncCommitGuard {
  let currentRevision = 0;
  return {
    begin: () => ++currentRevision,
    capture: () => currentRevision,
    invalidate: () => {
      currentRevision += 1;
    },
    isCurrent: (revision) => revision === currentRevision,
  };
}
