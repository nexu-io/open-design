import { isMultiDragActive, multiDragDeltaSeconds } from "./timelineMultiDragPreview";
import type { MultiDragPreviewInput } from "./timelineMultiDragPreview";
import type { TimelineTimeRange } from "../lib/timelineClipIndex";

/** The extra render window a live multi-drag needs: its passengers still draw
 *  at their ORIGIN position, offset by the drag delta, outside the normal
 *  virtualized range. Empty when nothing is dragging. */
export function useTimelineMultiDragActorWindows(
  multiDragPreview: MultiDragPreviewInput | null,
  rowsVirtualized: boolean,
  renderTimeRange: TimelineTimeRange,
) {
  const multiDragDelta =
    multiDragPreview && isMultiDragActive(multiDragPreview)
      ? multiDragDeltaSeconds(multiDragPreview)
      : 0;
  const actorWindows =
    rowsVirtualized && multiDragPreview && multiDragDelta !== 0
      ? [
          {
            range: {
              start: renderTimeRange.start - multiDragDelta,
              end: renderTimeRange.end - multiDragDelta,
            },
            identities: multiDragPreview.selectedKeys,
          },
        ]
      : [];
  return actorWindows;
}
