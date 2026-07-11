// Feature-local hook for the project-view orchestrator's mount lifecycle and
// tracked-timeout bookkeeping: every retry/backoff `setTimeout` in the
// reattach-recovery and chat-send paths routes through `scheduleProjectTimeout`
// so it is force-cleared on unmount instead of firing a stale callback against
// an unmounted component. No transport, so it needs no injected port.
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

export interface ProjectTimeoutsController {
  mountedRef: MutableRefObject<boolean>;
  scheduleProjectTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> | null;
  clearProjectTimeout: (timer: ReturnType<typeof setTimeout> | null) => void;
}

export function useProjectTimeouts(): ProjectTimeoutsController {
  const mountedRef = useRef(true);
  const trackedTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const timer of trackedTimeoutsRef.current) clearTimeout(timer);
      trackedTimeoutsRef.current.clear();
    };
  }, []);

  const scheduleProjectTimeout = useCallback((callback: () => void, delayMs: number) => {
    if (!mountedRef.current) return null;
    const timer = setTimeout(() => {
      trackedTimeoutsRef.current.delete(timer);
      if (!mountedRef.current) return;
      callback();
    }, delayMs);
    trackedTimeoutsRef.current.add(timer);
    return timer;
  }, []);

  const clearProjectTimeout = useCallback((timer: ReturnType<typeof setTimeout> | null) => {
    if (timer == null) return;
    clearTimeout(timer);
    trackedTimeoutsRef.current.delete(timer);
  }, []);

  return { mountedRef, scheduleProjectTimeout, clearProjectTimeout };
}
