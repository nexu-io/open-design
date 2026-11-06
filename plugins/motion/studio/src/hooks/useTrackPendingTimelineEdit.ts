import { useCallback, useRef } from "react";
import { trackedStudioEdit } from "../utils/studioPendingEdits";

type AsyncFn = (...args: never[]) => Promise<unknown>;

// Tracks a hand-edit handler's write so undo/redo (already draining this
// registry) waits for it. Same `fn` in, same wrapper out, so memoized deps stay stable.
export function useTrackPendingTimelineEdit() {
  const wrappedRef = useRef(new WeakMap<AsyncFn, AsyncFn>());
  return useCallback(<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) => {
    const key = fn as unknown as AsyncFn;
    const cached = wrappedRef.current.get(key);
    if (cached) return cached as unknown as (...args: Args) => Promise<R>;
    const wrapped = trackedStudioEdit(fn);
    wrappedRef.current.set(key, wrapped as unknown as AsyncFn);
    return wrapped;
  }, []);
}
