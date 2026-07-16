import { useCallback, useEffect, useRef } from 'react';

/**
 * Identity-stable delegate for an event handler that closes over fresh state
 * every render. The returned function never changes, so it can be passed to
 * React.memo children without invalidating them, while calls always reach the
 * latest committed closure (the ref is updated in an effect, i.e. post-commit
 * — safe for event handlers, which only fire after commit; do not call the
 * result during render).
 */
export function useStableHandler<Args extends unknown[], Result>(
  handler: (...args: Args) => Result,
): (...args: Args) => Result {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
