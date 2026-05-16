/**
 * In-process registry of in-flight critique runs. The daemon process is the
 * single owner of all critique state; the registry exists so the interrupt
 * endpoint can cascade an AbortController to the orchestrator that owns the
 * spawned CLI. The registry is intentionally NOT persisted: a daemon restart
 * mid-run is handled by reconcileStaleRuns on boot, not by recovering live
 * AbortControllers.
 *
 * All lookup operations require BOTH projectId and runId. The composite key
 * prevents a request to interrupt project p1's runId from accidentally
 * aborting project p2's run that happens to share the same id (defense in
 * depth on top of the HTTP handler's own DB-row projectId check).
 *
 * @see specs/current/critique-theater.md § Failure modes (interrupt)
 */

/** Handle for a single in-flight critique run. */
export interface RunHandle {
  runId: string;
  projectId: string;
  abort: AbortController;
  startedAt: number;
}

/** Public surface of the in-process run registry. */
export interface RunRegistry {
  /**
   * Register a new in-flight handle. Throws if a handle for the same
   * (projectId, runId) is already registered (indicates a bug in the caller,
   * not a user error).
   */
  register(handle: RunHandle): void;

  /**
   * Returns the handle if the (projectId, runId) pair is registered; null
   * otherwise. A runId from a different project will not match.
   */
  get(projectId: string, runId: string): RunHandle | null;

  /**
   * Signals the AbortController for the given (projectId, runId).
   * Returns true if the pair was found and aborted; false otherwise. A
   * runId-only match against a different project does NOT abort.
   */
  interrupt(projectId: string, runId: string, reason?: string): boolean;

  /**
   * Removes the entry for the given (projectId, runId). Called by the server
   * after the orchestrator settles. No-op if the pair is not registered.
   */
  unregister(projectId: string, runId: string): void;

  /**
   * Snapshot for diagnostics only. Returns a defensive copy so callers cannot
   * mutate the registry's internal state.
   */
  list(): RunHandle[];
}

/**
 * Builds the internal composite key for a (projectId, runId) pair. Pipe is
 * not a legal character in either projectId or runId per the daemon's id
 * generation rules, so collisions across pairs are impossible.
 */
function compositeKey(projectId: string, runId: string): string {
  return `${projectId}|${runId}`;
}

/**
 * Creates an in-memory RunRegistry backed by a Map.
 * Node is single-threaded; no locking is needed.
 *
 * @see specs/current/critique-theater.md § interrupt endpoint (Task 6.1)
 */
export function createRunRegistry(): RunRegistry {
  const store = new Map<string, RunHandle>();

  return {
    register(handle: RunHandle): void {
      const key = compositeKey(handle.projectId, handle.runId);
      if (store.has(key)) {
        throw new Error(
          `RunRegistry: duplicate (projectId="${handle.projectId}", runId="${handle.runId}"); unregister before re-registering`,
        );
      }
      store.set(key, handle);
    },

    get(projectId: string, runId: string): RunHandle | null {
      return store.get(compositeKey(projectId, runId)) ?? null;
    },

    interrupt(projectId: string, runId: string, reason?: string): boolean {
      const handle = store.get(compositeKey(projectId, runId));
      if (handle === undefined) return false;
      handle.abort.abort(reason);
      return true;
    },

    unregister(projectId: string, runId: string): void {
      store.delete(compositeKey(projectId, runId));
    },

    list(): RunHandle[] {
      return [...store.values()];
    },
  };
}
