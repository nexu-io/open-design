import type { TimelineElement } from "../store/playerStore";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import { getTimelineEditCapabilities } from "./timelineEditing";
import type { DraggedClipState } from "./timelineClipDragTypes";

/** Whether Studio may write timing to this clip (false for locked rows). */
export function canMoveTimelineElement(element: TimelineElement): boolean {
  return getTimelineEditCapabilities({
    tag: element.tag,
    kind: element.kind,
    duration: element.duration,
    domId: element.domId,
    hfId: element.hfId,
    selector: element.selector,
    compositionSrc: element.compositionSrc,
    playbackStart: element.playbackStart,
    playbackStartAttr: element.playbackStartAttr,
    sourceDuration: element.sourceDuration,
    timelineLocked: element.timelineLocked,
  }).canMove;
}

interface ExpandedHostAliasDeps {
  elements: TimelineElement[];
  selectedKeys?: ReadonlySet<string> | null;
}

/**
 * Expanded children keep their own source-file identity for direct edits, but a
 * selection can briefly contain both a composition host and one of its visible
 * expanded children. That pair is one authored move target, not two. Resolve it
 * to the host before time/lane/collision commit so ordinary clip placement stays
 * the single owner of the gesture semantics.
 */
export function resolveExpandedHostAlias(
  drag: DraggedClipState,
  deps: ExpandedHostAliasDeps,
): { drag: DraggedClipState; selectedKeys: ReadonlySet<string> } | null {
  const selectedKeys = deps.selectedKeys;
  if (!selectedKeys) return null;

  const collapsedKeys = new Set(selectedKeys);
  const candidates = deps.elements.includes(drag.element)
    ? deps.elements
    : [...deps.elements, drag.element];
  for (const element of candidates) {
    const hostKey = element.expandedHostKey;
    const childKey = getTimelineElementIdentity(element);
    if (hostKey && collapsedKeys.has(hostKey) && collapsedKeys.has(childKey)) {
      collapsedKeys.delete(childKey);
    }
  }

  const hostKey = drag.element.expandedHostKey;
  const childKey = getTimelineElementIdentity(drag.element);
  if (!hostKey || collapsedKeys.has(childKey)) {
    if (collapsedKeys.size === selectedKeys.size) return null;
    return { drag, selectedKeys: collapsedKeys };
  }

  const host = deps.elements.find((element) => getTimelineElementIdentity(element) === hostKey);
  if (!host || !canMoveTimelineElement(host)) return null;

  const delta = drag.previewStart - drag.element.start;
  const mapTrack = (track: number | undefined): number | undefined =>
    track === drag.element.track ? host.track : track;
  return {
    drag: {
      ...drag,
      element: host,
      previewStart: Math.max(0, Math.round((host.start + delta) * 1000) / 1000),
      previewTrack: mapTrack(drag.previewTrack) ?? host.track,
      desiredTrack: mapTrack(drag.desiredTrack),
    },
    selectedKeys: collapsedKeys,
  };
}
