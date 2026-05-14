// In-process serialization for concurrent writes to the same key.
//
// Two streams that finish "redesign sign-in page" at roughly the same
// moment can both compute the same canonical filename and race
// `writeFile` calls. Without serialization this is last-write-wins on
// the inode (probably fine — `fs.promises.writeFile` is atomic at the
// filesystem level on macOS/Linux for reasonable sizes), but it's also
// last-write-wins on the manifest sidecar, where the order is
// observable and confusing. Serializing per (projectId, fileName) makes
// ordering deterministic.
//
// Limitation: in-process only. If multiple daemon instances ever share
// the same .od/projects/, this guard does not extend across processes —
// fall back to filesystem-level locking at that point. Today the
// daemon is single-process per machine, so we're fine.

const writeLocks = new Map<string, Promise<unknown>>();

/**
 * Test-only accessor: exposes the active lock count so a unit test can
 * assert the cleanup branch fires (the leak fixed in this module was
 * exactly the kind of bug that's invisible in production but trivially
 * detectable with `size === 0` after a settle). Do not consume from
 * production code paths.
 */
export function __writeLocksSize(): number {
  return writeLocks.size;
}

export async function withWriteLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = writeLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Stored as a settled promise so a rejected `next` doesn't block the
  // queue — the next caller chains off the settled state and runs.
  // Capture the sentinel by reference: `next.then(...)` returns a NEW
  // promise instance distinct from `next`, so comparing the map entry
  // against `next` itself in the finally below was structurally always
  // false and the cleanup branch never fired. Reusing this binding
  // closes that leak.
  const sentinel: Promise<void> = next.then(
    () => undefined,
    () => undefined,
  );
  writeLocks.set(key, sentinel);
  try {
    return await next;
  } finally {
    // Best-effort cleanup: if no one chained on top of us, drop the
    // entry so the map doesn't grow unbounded over a long-lived daemon.
    if (writeLocks.get(key) === sentinel) writeLocks.delete(key);
  }
}
