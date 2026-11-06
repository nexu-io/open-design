import type { TimelineElement } from "../store/playerStore";
import { getTimelineElementIndexes } from "../lib/timelineElementIndexes";

export interface TimelineFocusIdentity {
  readonly elementId: string;
  readonly rowKey: number;
}

/** Resolve logical focus from model identity; mount state is deliberately irrelevant. */
export function resolveTimelineFocusIdentity(
  elements: readonly TimelineElement[],
  elementId: string | null,
): TimelineFocusIdentity | null {
  if (!elementId) return null;
  const element = getTimelineElementIndexes(elements).byKey.get(elementId);
  if (!element) return null;
  return {
    elementId,
    rowKey: element.track,
  };
}
