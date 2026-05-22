// Per-project async serialization for history operations.
//
// Two concurrent chat runs finishing close together on the same
// project race on the shared working tree without this lock: both call
// `git add -A`, one `git commit` absorbs the other's staged changes,
// and the loser sees a clean tree — one commit attributed to one run
// but containing both runs' work (silent provenance loss).
//
// In-process only. A future multi-daemon deployment would need a
// distributed lock (advisory file lock in the gitdir, or external
// coordination); out of scope for P0.

const tails = new Map<string, Promise<unknown>>();

/**
 * Serialize `fn()` against other in-flight calls for the same
 * `projectId`. Different projects run concurrently. Throws from `fn`
 * propagate; the lock is released either way.
 */
export async function withProjectLock<T>(
  projectId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previousTail = tails.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const currentSlot = new Promise<void>((resolve) => {
    release = resolve;
  });
  // The `.catch` is critical: a failing fn must not leave a rejected
  // Promise as the project's tail — later callers would inherit the
  // rejection just by `await`ing it.
  const newTail = previousTail.then(() => currentSlot).catch(() => currentSlot);
  tails.set(projectId, newTail);
  try {
    await previousTail.catch(() => {
      // Previous holder's error is not this caller's problem.
    });
    return await fn();
  } finally {
    release();
    // Clean up the map entry if no one else queued behind us. Safe
    // because Node is single-threaded — between the `if` and the
    // `delete`, no other code can run.
    if (tails.get(projectId) === newTail) {
      tails.delete(projectId);
    }
  }
}

/**
 * For tests: clear the per-project tail map. In-flight operations
 * continue to run but become untracked by future callers.
 */
export function __resetProjectLocksForTests(): void {
  tails.clear();
}
