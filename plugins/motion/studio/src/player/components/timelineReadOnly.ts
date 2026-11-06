import { createContext, useContext, useEffect, useEffectEvent } from "react";
import {
  getTimelineEditCapabilities,
  type TimelineEditCapabilities,
} from "./timelineEditCapabilities";

export const TimelineReadOnlyContext = createContext<(() => void) | null>(null);

/** The refusal to report while the timeline is read-only; null while it is editable. */
export function useTimelineReadOnlyPress(): (() => void) | null {
  return useContext(TimelineReadOnlyContext);
}

const READ_ONLY_CLIP: TimelineEditCapabilities = {
  canMove: false,
  canTrimStart: false,
  canTrimEnd: false,
  readOnly: true,
};

/** Read-only locks every clip; its presses then take the blocked-edit path to the refusal. */
export function useTimelineClipCapabilities(): typeof getTimelineEditCapabilities {
  return useTimelineReadOnlyPress() ? () => READ_ONLY_CLIP : getTimelineEditCapabilities;
}

/** Read-only swaps each callback for the refusal: the press is reported instead of acted on. */
export function refuseWhenReadOnly<T extends object>(
  readOnlyPress: (() => void) | null,
  callbacks: T,
): T {
  if (!readOnlyPress) return callbacks;
  return Object.fromEntries(Object.keys(callbacks).map((key) => [key, readOnlyPress])) as T;
}

/** Once the switch into read-only lands, drop every edit already in flight without committing it. */
export function useAbandonEditsOnReadOnly(readOnly: boolean, abandon: () => void): void {
  const abandonNow = useEffectEvent(abandon);
  useEffect(() => {
    if (readOnly) abandonNow();
  }, [readOnly]);
}

/** Reports once if the press that started at `start` travels far enough to have been a drag. */
export function reportPressOnTravel(
  start: { clientX: number; clientY: number },
  refuse: (() => void) | null,
  threshold = 4,
): void {
  if (!refuse) return;
  const stop = () => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", stop, true);
    window.removeEventListener("pointercancel", stop, true);
  };
  const onMove = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < threshold)
      return;
    stop();
    refuse();
  };
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", stop, true);
  window.addEventListener("pointercancel", stop, true);
}
