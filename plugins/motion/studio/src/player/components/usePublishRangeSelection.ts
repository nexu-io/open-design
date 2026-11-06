import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/playerStore";
import type { TimelineTimeRange } from "../store/rangeSelectionSlice";
import type { TimelineRangeSelection } from "./timelineEditing";

/** Mirrors the gesture's range into the store and notifies the host. */
export function usePublishRangeSelection(
  rangeSelection: TimelineRangeSelection | null,
  onRangeSelect?: (range: TimelineTimeRange | null) => void,
) {
  const onRangeSelectRef = useRef(onRangeSelect);
  const publishedRangeRef = useRef<TimelineTimeRange | null>(null);

  useEffect(() => {
    onRangeSelectRef.current = onRangeSelect;
  }, [onRangeSelect]);

  useEffect(() => {
    const range = rangeSelection
      ? {
          t0: Math.min(rangeSelection.start, rangeSelection.end),
          t1: Math.max(rangeSelection.start, rangeSelection.end),
        }
      : null;
    const store = usePlayerStore.getState();
    const current = store.rangeSelection;
    if (current?.t0 === range?.t0 && current?.t1 === range?.t1) return;
    publishedRangeRef.current = range;
    usePlayerStore.setState({ rangeSelection: range });
    onRangeSelectRef.current?.(range);
  }, [rangeSelection]);

  useEffect(
    () => () => {
      const current = usePlayerStore.getState().rangeSelection;
      const published = publishedRangeRef.current;
      if (current?.t0 !== published?.t0 || current?.t1 !== published?.t1) return;
      usePlayerStore.setState({ rangeSelection: null });
    },
    [],
  );
}
