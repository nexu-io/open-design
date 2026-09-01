export interface EventRefreshScheduler {
  now(): number;
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export interface EventRefreshCoordinatorOptions {
  /**
   * Leading refreshes still start immediately. A later refresh for the same
   * resource starts no sooner than this floor, and only the latest queued task
   * survives. This bounds an event storm without delaying the first signal or
   * losing the final authoritative re-read.
   */
  minIntervalMs?: number;
  maxKeys?: number;
  scheduler?: EventRefreshScheduler;
  onError?: (error: unknown, key: string) => void;
}

export interface EventRefreshCoordinator {
  request(key: string, task: () => void | Promise<void>, token?: string): void;
  dispose(): void;
}

interface RefreshLane {
  activeToken: string | null;
  lastCompletedToken: string | null;
  pendingToken: string | null;
  pendingTask: (() => void | Promise<void>) | null;
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  lastStartedAt: number;
  touchedAt: number;
}

const DEFAULT_MIN_INTERVAL_MS = 250;
const DEFAULT_MAX_KEYS = 256;

/**
 * Bound background work caused by thin invalidation events.
 *
 * The first event for a resource runs immediately. While that work is running
 * (or inside the short start-rate floor), newer events replace one pending
 * trailing task. Duplicate revision/sequence tokens are ignored. This is safe
 * for snapshot refreshes: intermediate transitions need not each trigger a GET,
 * but the final state must always be observed.
 */
export function createEventRefreshCoordinator(
  options: EventRefreshCoordinatorOptions = {},
): EventRefreshCoordinator {
  const scheduler = options.scheduler ?? defaultScheduler();
  const minIntervalMs = Math.max(
    0,
    options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
  );
  const maxKeys = Math.max(1, options.maxKeys ?? DEFAULT_MAX_KEYS);
  const lanes = new Map<string, RefreshLane>();
  let disposed = false;

  const touch = (key: string, lane: RefreshLane): void => {
    lane.touchedAt = scheduler.now();
    lanes.delete(key);
    lanes.set(key, lane);
  };

  const trim = (targetSize: number): void => {
    if (lanes.size <= targetSize) return;
    for (const [key, lane] of lanes) {
      if (lane.running || lane.timer || lane.pendingTask) continue;
      lanes.delete(key);
      if (lanes.size <= targetSize) return;
    }
  };

  const laneFor = (key: string): RefreshLane => {
    const existing = lanes.get(key);
    if (existing) {
      touch(key, existing);
      return existing;
    }
    trim(maxKeys - 1);
    const lane: RefreshLane = {
      activeToken: null,
      lastCompletedToken: null,
      pendingToken: null,
      pendingTask: null,
      running: false,
      timer: null,
      lastStartedAt: Number.NEGATIVE_INFINITY,
      touchedAt: scheduler.now(),
    };
    lanes.set(key, lane);
    return lane;
  };

  const pump = (key: string, lane: RefreshLane): void => {
    if (disposed || lane.running || lane.timer || !lane.pendingTask) return;
    const elapsed = scheduler.now() - lane.lastStartedAt;
    const delay = Math.max(0, minIntervalMs - elapsed);
    if (delay > 0) {
      lane.timer = scheduler.setTimeout(() => {
        lane.timer = null;
        pump(key, lane);
      }, delay);
      lane.timer.unref?.();
      return;
    }

    const task = lane.pendingTask;
    const token = lane.pendingToken;
    lane.pendingTask = null;
    lane.pendingToken = null;
    lane.activeToken = token;
    lane.running = true;
    lane.lastStartedAt = scheduler.now();
    touch(key, lane);

    let result: void | Promise<void>;
    try {
      // Start the leading task in the caller's turn. Several invalidation
      // handlers deliberately clear an authority lease before any sibling
      // reconnect/read may run; deferring through Promise.resolve().then(...)
      // would briefly expose the pre-event lease.
      result = task();
    } catch (error) {
      result = Promise.reject(error);
    }
    let succeeded = false;
    void Promise.resolve(result)
      .then(() => {
        succeeded = true;
      })
      .catch((error: unknown) => options.onError?.(error, key))
      .finally(() => {
        lane.running = false;
        lane.activeToken = null;
        if (disposed) return;
        if (succeeded && token) lane.lastCompletedToken = token;
        touch(key, lane);
        pump(key, lane);
        trim(maxKeys);
      });
  };

  return {
    request(keyInput, task, tokenInput): void {
      if (disposed) return;
      const key = keyInput.trim();
      if (!key) return;
      const token = tokenInput?.trim() || null;
      const lane = laneFor(key);
      if (
        token &&
        (
          token === lane.activeToken ||
          token === lane.lastCompletedToken ||
          token === lane.pendingToken
        )
      ) {
        return;
      }
      // Refreshes are latest-state reads. Replacing the queued task preserves
      // the final snapshot while bounding intermediate work to one trailing run.
      lane.pendingTask = task;
      lane.pendingToken = token;
      touch(key, lane);
      pump(key, lane);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const lane of lanes.values()) {
        if (lane.timer) scheduler.clearTimeout(lane.timer);
        lane.timer = null;
        lane.pendingTask = null;
        lane.pendingToken = null;
        lane.lastCompletedToken = null;
      }
      lanes.clear();
    },
  };
}

function defaultScheduler(): EventRefreshScheduler {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (timer) => clearTimeout(timer),
  };
}
