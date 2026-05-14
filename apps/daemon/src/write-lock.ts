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

export async function withWriteLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = writeLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Stored as a settled promise so a rejected `next` doesn't block the
  // queue — the next caller chains off the settled state and runs.
  writeLocks.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  try {
    return await next;
  } finally {
    // Best-effort cleanup: if no one chained on top of us, drop the
    // entry so the map doesn't grow unbounded over a long-lived daemon.
    if (writeLocks.get(key) === next) writeLocks.delete(key);
  }
}
