import { useCallback, useRef } from "react";
import type { TimelineElement } from "../player";
import { useTimelineEditRefusal } from "./timelineEditPermission";

type GuardedTimelineHandler = (...args: never[]) => Promise<unknown>;
type GuardedTimelineResolver = (...args: never[]) => readonly TimelineElement[];
type GuardedTimelineRefusal = (reason: string, ...args: never[]) => unknown;

interface GuardedTimelineEntry {
  resolveTargets: GuardedTimelineResolver;
  onRefused?: GuardedTimelineRefusal;
  wrapped: GuardedTimelineHandler;
}

export function useTimelineEditGuard(
  canEdit: Parameters<typeof useTimelineEditRefusal>[0],
  showToast: Parameters<typeof useTimelineEditRefusal>[1],
) {
  const refuseEdit = useTimelineEditRefusal(canEdit, showToast);
  const refuseEditRef = useRef(refuseEdit);
  refuseEditRef.current = refuseEdit;
  const guardedRef = useRef(new WeakMap<GuardedTimelineHandler, GuardedTimelineEntry>());
  // Refuses (no call, no write, no history entry) when any target is
  // blocked; otherwise runs fn as before. Cached by fn identity — like
  // track() — so a fresh closure here doesn't defeat track's own cache.
  const guard = useCallback(
    <H extends (...args: never[]) => Promise<unknown>>(
      resolveTargets: (...args: Parameters<H>) => readonly TimelineElement[],
      fn: H,
      onRefused?: (reason: string, ...args: Parameters<H>) => Awaited<ReturnType<H>>,
    ): H => {
      const key = fn as unknown as GuardedTimelineHandler;
      const cached = guardedRef.current.get(key);
      if (cached) {
        cached.resolveTargets = resolveTargets as unknown as GuardedTimelineResolver;
        cached.onRefused = onRefused as unknown as GuardedTimelineRefusal | undefined;
        return cached.wrapped as H;
      }
      const entry = {} as GuardedTimelineEntry;
      entry.resolveTargets = resolveTargets as unknown as GuardedTimelineResolver;
      entry.onRefused = onRefused as unknown as GuardedTimelineRefusal | undefined;
      entry.wrapped = ((...args: Parameters<H>) => {
        const reason = refuseEditRef.current(entry.resolveTargets(...(args as never[])));
        if (reason !== null)
          return Promise.resolve(entry.onRefused?.(reason, ...(args as never[])));
        return fn(...args);
      }) as H as unknown as GuardedTimelineHandler;
      guardedRef.current.set(key, entry);
      return entry.wrapped as H;
    },
    [],
  );
  return guard;
}
