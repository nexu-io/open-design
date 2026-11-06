import { useContext, useMemo, type ReactNode } from "react";
import { createStableContext } from "../utils/hmrStableContext";
import type { TimelineEditCallbacks } from "../player/components/timelineCallbacks";

const TimelineEditContext = createStableContext<TimelineEditCallbacks | null>(
  "TimelineEditContext",
  null,
);

export function useTimelineEditContext(): TimelineEditCallbacks {
  const ctx = useContext(TimelineEditContext);
  if (!ctx) throw new Error("useTimelineEditContext must be used within TimelineEditProvider");
  return ctx;
}

/**
 * Optional access — returns an empty object when outside a provider.
 * Useful in components that can render both inside and outside the NLE.
 */
export function useTimelineEditContextOptional(): TimelineEditCallbacks {
  return useContext(TimelineEditContext) ?? {};
}

export function useTimelineEditContextValue(): TimelineEditCallbacks | null {
  return useContext(TimelineEditContext);
}

const EDIT_CALLBACK_KEY_SET: Record<keyof TimelineEditCallbacks, true> = {
  onMoveElement: true,
  onMoveElements: true,
  onResizeElement: true,
  onResizeElements: true,
  onToggleTrackHidden: true,
  onSetAudioGroupAttributeLive: true,
  onSetAudioGroupAttributeQuiet: true,
  onRevertAudioGroupAttributeLive: true,
  onGroupClips: true,
  onSetElementAttributeLive: true,
  onSetElementAttributeQuiet: true,
  onSetElementsAttributeQuiet: true,
  onRevertElementAttributeLive: true,
  onBlockedEditAttempt: true,
  onLinkEdit: true,
  onDeleteElementOnly: true,
  onSplitElement: true,
  onRazorSplit: true,
  onRazorSplitAll: true,
  onFreezeFrame: true,
  clipMenuTools: true,
  onNotice: true,
  onDeleteKeyframe: true,
  onDeleteAllKeyframes: true,
  onMoveKeyframeToPlayhead: true,
  onMoveKeyframe: true,
  onToggleKeyframeAtPlayhead: true,
  onTogglePropertyGroupKeyframe: true,
};
const EDIT_CALLBACK_KEYS = Object.keys(EDIT_CALLBACK_KEY_SET) as (keyof TimelineEditCallbacks)[];

export function TimelineEditProvider({
  value,
  children,
}: {
  value: TimelineEditCallbacks;
  children: ReactNode;
}) {
  const memoized = useMemo(
    () => value,
    // Each callback is a stable reference from the parent — memoize the bag
    // so consumers don't re-render when unrelated parent state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    EDIT_CALLBACK_KEYS.map((key) => value[key]),
  );
  return <TimelineEditContext.Provider value={memoized}>{children}</TimelineEditContext.Provider>;
}
