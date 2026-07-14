/**
 * Orders asynchronous state commits for one mutable resource. Start each
 * competing read with `begin()` and only commit when its revision is still
 * current; local writes call `invalidate()` to make every earlier read stale.
 * `capture()` is for reads coordinated by another hook that already owns their
 * own call ordering, but still needs to observe local-write invalidation.
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
