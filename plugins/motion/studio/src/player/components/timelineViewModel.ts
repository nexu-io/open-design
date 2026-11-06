import type { TimelineElement } from "../store/playerStore";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import type { ResizingClipState } from "./timelineClipDragTypes";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { animationContributesLane } from "./TimelinePropertyLanes";

function hasKeyframedTimelineClips(
  animationsByElement: ReadonlyMap<string, readonly GsapAnimation[]>,
): boolean {
  return Array.from(animationsByElement.values()).some((animations) =>
    animations.some(animationContributesLane),
  );
}

/**
 * Does the timeline need the wide label column?
 *
 * Keyframed clips need it for their property-lane names. Audio GROUPS need it
 * for the same reason a keyframed clip does — a row whose name has nowhere else
 * to go. A track row survives a narrow gutter because its CLIPS carry the name
 * on the bar; a group row has no clips at all, so in the 80px gutter its label
 * rendered at zero width and its FX and lane buttons were clipped off the
 * side.
 *
 * Widening the column for the whole timeline, rather than letting just the
 * group row overhang: the header is sticky and opaque, so an oversized one
 * painted a slab across the rest of its own row, stayed pinned there through
 * horizontal scroll, and had the playhead drawn straight through it.
 */
export function timelineNeedsLabelColumn(
  animationsByElement: ReadonlyMap<string, readonly GsapAnimation[]>,
  elements: readonly TimelineElement[],
): boolean {
  return (
    hasKeyframedTimelineClips(animationsByElement) ||
    // The column exists FOR the group rows, so this must stay in step with
    // whatever decides they are drawn (`useTimelineTrackDerivations`) —
    // widening it with no group row on screen is a 232px shift of every clip
    // with nothing to explain it.
    elements.some((element) => Boolean(element.audioGroup))
  );
}

export function getEffectiveTimelineDuration(
  duration: number,
  elements: readonly TimelineElement[],
): number {
  const safeDuration = Number.isFinite(duration) ? duration : 0;
  if (elements.length === 0) return safeDuration;
  const result = Math.max(
    safeDuration,
    ...elements.map((element) => element.start + element.duration),
  );
  return Number.isFinite(result) ? result : safeDuration;
}

export function getTimelinePreviewElement(
  element: TimelineElement,
  resizingClip: ResizingClipState | null,
): TimelineElement {
  const elementIdentity = getTimelineElementIdentity(element);
  const groupPreview = resizingClip?.groupPreview?.find((change) => change.key === elementIdentity);
  if (groupPreview) return { ...element, ...groupPreview };
  if (resizingClip && getTimelineElementIdentity(resizingClip.element) === elementIdentity) {
    return {
      ...element,
      start: resizingClip.previewStart,
      duration: resizingClip.previewDuration,
      playbackStart: resizingClip.previewPlaybackStart,
    };
  }
  return element;
}
