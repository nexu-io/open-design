// Per-project async serialization for history operations.
//
// Two concurrent chat runs finishing close together on the same
// project will race on the shared working tree without this lock:
// both call `git add -A`, one `git commit` absorbs the other's
// staged changes, and the loser sees a clean tree and no-ops — one
// commit ends up attributed to one run but containing both runs'
// work. This is the "one revision per run" contract holding only
// under serial finishes.
//
// The lock is a per-project Promise tail-chain: each new operation
// `await`s the project's current tail before proceeding, then becomes
// the new tail. Different projects are independent; their tails
// never block each other.
//
// In-process only. A future multi-daemon / multi-replica deployment
// would need a distributed lock (advisory file lock in the gitdir,
// or external coordination); that's out of scope for P0 since the
// daemon runs as a single process today.

const tails = new Map<string, Promise<unknown>>();

/**
 * Serialize `fn()` against any other in-flight `withProjectLock`
 * calls for the same `projectId`. Different project ids run
 * concurrently. Throws from `fn` propagate to the caller; the lock
 * is released either way.
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
  // Chain the new slot behind the previous tail so a later caller
  // sees the queue extended even if `fn` is still running. The
  // `.catch` is critical: a failing fn must not leave a rejected
  // Promise as the project's tail (later callers would inherit the
  // rejection just by `await`ing it).
  const newTail = previousTail.then(() => currentSlot).catch(() => currentSlot);
  tails.set(projectId, newTail);
  try {
    await previousTail.catch(() => {
      // Previous holder's error is not this caller's problem — they
      // own their own rejection. We just need to know it's done.
    });
    return await fn();
  } finally {
    release();
    // Clean up the map entry if no one else queued behind us. Safe
    // because Node is single-threaded — between the `if` check and
    // the `delete`, no other code can run.
    if (tails.get(projectId) === newTail) {
      tails.delete(projectId);
    }
  }
}

/**
 * For tests: clear the per-project tail map. In-flight operations
 * continue to run but become untracked by future callers (which see
 * an empty queue). Use only between tests that don't share lock state.
 */
export function __resetProjectLocksForTests(): void {
  tails.clear();
}
