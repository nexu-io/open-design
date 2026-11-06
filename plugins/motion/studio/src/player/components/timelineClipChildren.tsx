import { useState, type ReactNode } from "react";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import type { TimelineTimeRange } from "../lib/timelineClipIndex";
import type { TrackVisualStyle } from "./timelineIcons";
import type { TimelineProps, TimelineClipRenderContext } from "./TimelineTypes";

export function resolveClipRenderContext(
  element: TimelineElement,
  visibleTimeRange: TimelineTimeRange,
  interactive: boolean,
): TimelineClipRenderContext {
  // Interaction only reorders loading; `rich` would swap the frames under the pointer.
  if (interactive) return { priority: "interaction", rich: false };
  const visible =
    element.start < visibleTimeRange.end &&
    element.start + element.duration > visibleTimeRange.start;
  return { priority: visible ? "visible" : "overscan", rich: false };
}

function ClipLintDot({ element }: { element: TimelineElement }) {
  const lint = usePlayerStore((s) => s.lintFindingsByElement.get(element.key ?? element.id));
  if (!lint || lint.count === 0) return null;
  return (
    <span
      className="absolute w-1.5 h-1.5 rounded-full bg-warning-ink"
      style={{ bottom: 7, right: 7 }}
      title={lint.messages.join("\n")}
    />
  );
}

/**
 * Mounts a clip's content only once the timeline is at rest, then keeps it through later scrolls,
 * so a scroll never blanks a picture already on screen and never mounts a screenful of new ones.
 */
export function ClipContentOnceShown({ hold, children }: { hold: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(!hold);
  if (!shown && !hold) setShown(true);
  return shown ? children : null;
}

export function renderClipChildren(
  element: TimelineElement,
  clipStyle: TrackVisualStyle,
  renderClipContent: TimelineProps["renderClipContent"],
  renderClipOverlay: TimelineProps["renderClipOverlay"],
  context: TimelineClipRenderContext = { priority: "visible", rich: false },
): ReactNode {
  return (
    <>
      {renderClipOverlay?.(element)}
      {!renderClipContent && <ClipLintDot element={element} />}
      {renderClipContent && (
        // The picture can paint above the trim handles, so it takes no input and presses reach them.
        // The content inherits the clip's rounded corners; the clip itself is
        // overflow-visible because keyframe diamonds hang outside its bounds.
        <div
          className="timeline-clip__content absolute inset-0 overflow-hidden"
          style={{ pointerEvents: "none" }}
        >
          {renderClipContent(element, clipStyle, context)}
        </div>
      )}
    </>
  );
}
