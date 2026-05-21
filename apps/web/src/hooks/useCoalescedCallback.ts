import { useCallback, useEffect, useRef } from 'react';

export interface CoalesceOptions {
  /**
   * Quiet window (ms) the trigger waits for before firing the callback.
   * Each new trigger inside the window resets this timer.
   */
  wait: number;
  /**
   * Hard upper bound (ms) on how long a sustained burst can keep deferring
   * the callback. If `maxWait` elapses since the first trigger of the
   * current burst, the next call flushes immediately. Omit to disable the
   * cap (only useful for short, well-bounded bursts).
   */
  maxWait?: number;
}

interface InternalState {
  timer: ReturnType<typeof setTimeout> | null;
  firstSeenAt: number | null;
}

/**
 * Returns a stable trigger function that coalesces rapid bursts of calls
 * into a single trailing invocation of `callback`. Used to absorb chokidar
 * write-then-rename signatures (e.g. `unlink` + `add` within a single
 * tick during an agent rewrite) before they propagate to the UI as a
 * "file disappeared" frame. See #2195.
 *
 * Semantics:
 *   - First trigger arms a timer for `wait` ms.
 *   - Subsequent triggers inside the quiet window reset the timer.
 *   - When the timer fires, the latest `callback` runs once.
 *   - If `maxWait` is set and the current burst has been deferred for
 *     `>= maxWait`, the next trigger flushes immediately instead of
 *     resetting again — sustained edit storms don't starve the UI.
 *   - The hook's identity is stable across renders; only `wait` /
 *     `maxWait` changes regenerate the trigger.
 *   - The pending timer is cleared on unmount, so a late event after the
 *     component leaves the tree cannot call into a stale `callback`.
 */
export function useCoalescedCallback(
  callback: () => void,
  options: CoalesceOptions,
): () => void {
  const stateRef = useRef<InternalState>({ timer: null, firstSeenAt: null });
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      if (s.timer !== null) {
        clearTimeout(s.timer);
        s.timer = null;
        s.firstSeenAt = null;
      }
    };
  }, []);
  const { wait, maxWait } = options;
  return useCallback(() => {
    const s = stateRef.current;
    const flush = () => {
      if (s.timer !== null) clearTimeout(s.timer);
      s.timer = null;
      s.firstSeenAt = null;
      callbackRef.current();
    };
    const now = Date.now();
    if (
      s.firstSeenAt !== null &&
      maxWait !== undefined &&
      now - s.firstSeenAt >= maxWait
    ) {
      flush();
      return;
    }
    if (s.firstSeenAt === null) s.firstSeenAt = now;
    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = setTimeout(flush, wait);
  }, [wait, maxWait]);
}
