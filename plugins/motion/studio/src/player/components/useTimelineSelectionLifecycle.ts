import { useEffect, useMemo, useRef } from "react";
import type { TimelineElement } from "../store/playerStore";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";

export function useTimelineSelectionLifecycle(
  elements: TimelineElement[],
  selectedElementId: string | null,
  setShowPopover: (show: boolean) => void,
  clearRangeSelection: () => void,
): void {
  const selectedElement = useMemo(
    () =>
      elements.find((element) => getTimelineElementIdentity(element) === selectedElementId) ?? null,
    [elements, selectedElementId],
  );
  const selectedElementRef = useRef<TimelineElement | null>(selectedElement);
  selectedElementRef.current = selectedElement;
  const previousSelectedRef = useRef(selectedElementRef.current);
  // eslint-disable-next-line no-restricted-syntax, react-hooks/exhaustive-deps
  useEffect(() => {
    const previous = previousSelectedRef.current;
    const current = selectedElementRef.current;
    previousSelectedRef.current = current;
    if (previous && !current) {
      setShowPopover(false);
      clearRangeSelection();
    }
  });
}
