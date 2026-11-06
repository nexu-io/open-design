import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import {
  createThumbnailRequestIdentity,
  thumbnailScheduler,
  type ThumbnailRequest,
  type ThumbnailScheduler,
  type ThumbnailSnapshot,
} from "../player/lib/thumbnailScheduler";

const IDLE: ThumbnailSnapshot = Object.freeze({ status: "idle" });

export function useThumbnailLease(
  request: ThumbnailRequest | null,
  scheduler: ThumbnailScheduler = thumbnailScheduler,
): ThumbnailSnapshot {
  const requestRef = useRef(request);
  requestRef.current = request;
  const leaseRef = useRef<ReturnType<ThumbnailScheduler["acquire"]> | null>(null);
  const identity = request ? createThumbnailRequestIdentity(request) : null;
  const priority = request?.priority;
  const subscribe = useCallback(
    (listener: () => void) => {
      const current = requestRef.current;
      if (!current || identity === null) return () => {};
      const lease = scheduler.acquire(current, listener);
      leaseRef.current = lease;
      return () => {
        if (leaseRef.current === lease) leaseRef.current = null;
        lease.release();
      };
    },
    [identity, scheduler],
  );
  const getSnapshot = useCallback(() => {
    const current = requestRef.current;
    return current && identity !== null ? scheduler.getSnapshot(current) : IDLE;
  }, [identity, scheduler]);

  useLayoutEffect(() => {
    if (priority) leaseRef.current?.updatePriority(priority);
  }, [priority]);

  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE);
}
