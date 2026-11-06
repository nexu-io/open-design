export interface OptimisticUpdateOptions<TSnapshot> {
  /** Apply the change to local state immediately. Return a snapshot for rollback. */
  apply: () => TSnapshot;
  /** Persist the change to the server. */
  persist: () => Promise<unknown>;
  /** Revert local state using the snapshot if persist fails. */
  rollback: (snapshot: TSnapshot) => void;
}

export async function executeOptimistic<T>(options: OptimisticUpdateOptions<T>): Promise<void> {
  const snapshot = options.apply();
  try {
    await options.persist();
  } catch {
    options.rollback(snapshot);
  }
}
