import type { TimelineElement } from "../store/playerStore";
import { sameTimelineText } from "../lib/timelineText";

const RENDERED_FIELDS: readonly (keyof TimelineElement)[] = [
  "id",
  "start",
  "duration",
  "track",
  "sourceDuration",
  "muted",
  "hasAudio",
  "volume",
  "playbackRate",
  "hidden",
  "audioGroup",
  "audioGroupVolume",
  "audioGroupHidden",
  "fadeIn",
  "fadeOut",
  "src",
  "link",
];

/** Whether a derived timeline changes any field that affects rendering. */
export function timelineElementsChanged(
  previous: TimelineElement[],
  next: TimelineElement[],
): boolean {
  if (next.length !== previous.length) return true;
  return next.some((element, index) => {
    const prior = previous[index];
    return (
      !prior ||
      RENDERED_FIELDS.some((key) => element[key] !== prior[key]) ||
      !sameTimelineText(element.text, prior.text)
    );
  });
}
