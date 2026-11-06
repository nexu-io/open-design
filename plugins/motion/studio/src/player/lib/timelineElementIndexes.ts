import { isAudioTimelineElement, isMusicTrack } from "../../utils/timelineInspector";
import type { TimelineElement } from "../store/playerStore";
import { getTimelineElementIdentity } from "./timelineElementHelpers";

export interface TimelineElementIndexes {
  readonly byKey: ReadonlyMap<string, TimelineElement>;
  readonly musicElement: TimelineElement | null;
  readonly mediaElements: readonly TimelineElement[];
  readonly audioTracks: ReadonlySet<number>;
}

const indexCache = new WeakMap<readonly TimelineElement[], TimelineElementIndexes>();

/**
 * Index a store element snapshot once. Playback-only Zustand updates keep the
 * same array identity, so selectors can reuse this object without rescanning a
 * large timeline or triggering a component render.
 */
export function getTimelineElementIndexes(
  elements: readonly TimelineElement[],
): TimelineElementIndexes {
  const cached = indexCache.get(elements);
  if (cached) return cached;

  const byKey = new Map<string, TimelineElement>();
  const mediaElements: TimelineElement[] = [];
  const audioTracks = new Set<number>();
  let musicElement: TimelineElement | null = null;
  for (const element of elements) {
    byKey.set(getTimelineElementIdentity(element), element);
    if (element.src) mediaElements.push(element);
    if (isAudioTimelineElement(element)) audioTracks.add(element.track);
    if (!musicElement && isMusicTrack(element)) musicElement = element;
  }

  const indexes = Object.freeze({
    byKey,
    musicElement,
    mediaElements: Object.freeze(mediaElements),
    audioTracks,
  });
  indexCache.set(elements, indexes);
  return indexes;
}
