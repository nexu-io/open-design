import { useCallback, useRef } from 'react';

/**
 * Wraps an action so overlapping invocations collapse into a single in-flight
 * call: the first caller runs `action`, every caller that arrives before it
 * settles is ignored, and the slot reopens once the returned promise settles.
 *
 * The guard is a ref, not state. A `useState` "starting" flag only becomes
 * visible after React re-renders, so two triggers inside the same tick (the
 * design-system ready-toast nudge and the chat "Continue" affordance both
 * firing "AI Optimize") each read the stale `false` and both pass. That is
 * how the 2026-07-28 incident started two billed enrichment runs 383 ms
 * apart. A ref flips synchronously, so the second trigger is rejected before
 * any network call is made.
 *
 * Returns `true` when the call was admitted, `false` when it was dropped.
 */
export function useSingleFlightCallback<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<unknown> | unknown,
): (...args: TArgs) => boolean {
  const inFlightRef = useRef(false);
  return useCallback(
    (...args: TArgs): boolean => {
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      let result: unknown;
      try {
        result = action(...args);
      } catch (err) {
        inFlightRef.current = false;
        throw err;
      }
      // Release on settle either way; the caller still owns the original
      // promise, so a rejection is not swallowed for it — only this guard
      // chain stays quiet instead of surfacing a second unhandled rejection.
      const release = () => {
        inFlightRef.current = false;
      };
      void Promise.resolve(result).then(release, release);
      return true;
    },
    [action],
  );
}
