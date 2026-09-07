// A queue that runs at most N tasks at once, and never drops one.
//
// Why this exists: reopening a conversation whose messages are all in a
// recoverable state releases one reattach per message. Each reattach is a
// long-lived SSE subscription, and the browser gives one origin about six
// HTTP/1.1 connections for the WHOLE profile — shared across tabs, so a
// backgrounded Open Design tab already spends some of them. Releasing the
// whole batch in one pass therefore does not make the batch finish sooner; it
// makes every OTHER request the page still owes (file lists, comments, cover
// probes) sit in the connection queue behind it.
//
// Two properties this must have, and a test each in
// tests/lib/bounded-concurrency.test.ts:
//
//  1. Nothing is dropped. Queuing is the entire mechanism — a task that does
//     not start immediately starts later, never not at all. Reattach is the
//     motivating caller and a skipped reattach is a run whose output silently
//     stops arriving, which is strictly worse than a slow one.
//  2. A task that finds a free slot starts SYNCHRONOUSLY, inside the caller's
//     own tick. Paying a microtask hop to discover the queue is empty would
//     make the common single-task case slower than no gate at all.

export interface BoundedConcurrency {
  /** Run `task` now if a slot is free, else as soon as one frees up. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks started but not yet settled. Test/diagnostic use. */
  readonly active: number;
  /** Tasks admitted but not yet started. Test/diagnostic use. */
  readonly pending: number;
}

export interface BoundedConcurrencyOptions {
  /**
   * Hard cap on how long one task may hold its slot, in ms.
   *
   * The queue exists to stagger a burst, not to police steady state, so a task
   * that runs unusually long must not be able to wedge it. Without this, one
   * task that never settles — a subscription to a connection that died without
   * closing — would hold its slot forever and every later task would wait
   * behind it, turning a latency fix into a permanent stall. On expiry the slot
   * is handed back and the next task starts; the long task keeps running, it
   * simply stops being counted. Worst case that returns the caller to
   * un-bounded behaviour, which is where it started.
   *
   * Omit (or pass 0) for tasks that are guaranteed to settle.
   */
  maxHoldMs?: number;
}

export function createBoundedConcurrency(
  limit: number,
  options?: BoundedConcurrencyOptions,
): BoundedConcurrency {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`bounded concurrency limit must be a positive integer, got ${limit}`);
  }
  const maxHoldMs = options?.maxHoldMs ?? 0;

  let active = 0;
  const queue: Array<() => void> = [];

  const release = (): void => {
    active -= 1;
    const next = queue.shift();
    // Start the next task in this microtask rather than scheduling another
    // hop: the slot is free now, and the queue exists to stagger connection
    // openings, not to add latency to each one.
    if (next) next();
  };

  const start = <T>(task: () => Promise<T>): Promise<T> => {
    active += 1;
    let releasedSlot = false;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    const releaseSlot = (): void => {
      if (releasedSlot) return;
      releasedSlot = true;
      if (holdTimer !== null) clearTimeout(holdTimer);
      release();
    };
    if (maxHoldMs > 0) holdTimer = setTimeout(releaseSlot, maxHoldMs);

    let started: Promise<T>;
    try {
      started = task();
    } catch (error) {
      // A task that throws synchronously never had a promise to settle; free
      // its slot here or the queue would stall behind a task that is over.
      releaseSlot();
      return Promise.reject(error);
    }
    return started.then(
      (value) => {
        releaseSlot();
        return value;
      },
      (error) => {
        releaseSlot();
        throw error;
      },
    );
  };

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      if (active < limit) return start(task);
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          start(task).then(resolve, reject);
        });
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}
