/**
 * The group, as the automation lanes see it.
 *
 * Lanes are keyed by `TimelineElement` everywhere — the slot, the binder, the
 * identity used for selection. A group is not one: it has no clip id, no start
 * and no duration, which is §1.9's "a group is the first real audio entity in
 * the system" problem showing up in the row model. Rather than give lanes a
 * second, parallel path, the group borrows the shape it does not have.
 *
 * `start: 0` and `duration` = the composition's is not a placeholder, it is the
 * clock: the design doc fixes a group's automation clock as COMPOSITION time
 * (§1.3), and a missing `data-start` parses as 0, which is exactly that. So a
 * lane drawn against this element lands at the same seconds the render bakes.
 */

import type { TimelineElement } from "../store/playerStore";
import type { TimelineTrackGroupInfo } from "./useTimelineTrackDerivations";

const groupElements = new WeakSet<TimelineElement>();

export function isGroupAutomationElement(element: TimelineElement): boolean {
  return groupElements.has(element);
}

/** The synthetic element's track number — the group row's own anchor. */
export function groupAutomationElement(
  group: Pick<TimelineTrackGroupInfo, "id" | "label" | "automation" | "fxChain" | "anchorKey">,
  compositionDuration: number,
): TimelineElement {
  const element: TimelineElement = {
    id: group.id,
    // The DOM id, so a write lands on the `<hf-audio-group>` and not on a clip.
    domId: group.id,
    label: group.label,
    // Audio, so `isAudioTimelineElement` admits it and the lanes render at all.
    tag: "audio",
    start: 0,
    duration: compositionDuration,
    track: group.anchorKey,
    ...(group.automation ? { automation: group.automation } : {}),
    ...(group.fxChain ? { fxChain: group.fxChain } : {}),
  };
  groupElements.add(element);
  return element;
}
