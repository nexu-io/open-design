import type { SelectElementOptions, TimelineElement } from "../player";
import { HF_AUDIO_GROUP_TAG } from "@hyperframes/core/audio-groups";
import { findMatchingTimelineElementId, findTimelineIdByAncestor } from "../utils/studioHelpers";
import type { DomEditSelection } from "../components/editor/domEditing";
import { logSelect } from "../utils/selectDebug";

interface TimelineMirrorDeps {
  timelineElements: TimelineElement[];
  getTimelineSelectionSet: () => ReadonlySet<string>;
  setSelectedTimelineElementId: (id: string | null, options?: SelectElementOptions) => void;
  setTimelineSelectionSet: (ids: Set<string>) => void;
}

/**
 * Mirror a canvas selection onto the timeline: the whole set first, then the
 * primary as its anchor.
 *
 * The timeline is the source of truth for what is selected and it syncs back —
 * whatever it holds replaces the canvas selection a moment later. Announcing only
 * the primary therefore drops every other member. Worse, anchoring with
 * `preserveSet` on an id the set does not yet contain empties the set outright,
 * and an empty set syncs back as "nothing is selected" — which is how adding a
 * second element, or moving a group, could wipe the selection instead of keeping
 * it. Publishing the members first is what makes the anchor a member, so
 * preserving the set is meaningful rather than destructive.
 */
export function announceTimelineSelection(
  deps: TimelineMirrorDeps,
  group: DomEditSelection[],
  primary: DomEditSelection | null,
  replaceSet = false,
): void {
  const {
    timelineElements,
    getTimelineSelectionSet,
    setSelectedTimelineElementId,
    setTimelineSelectionSet,
  } = deps;
  if (!primary) {
    setTimelineSelectionSet(new Set());
    setSelectedTimelineElementId(null);
    return;
  }
  const timelineIdFor = (selection: DomEditSelection) =>
    findMatchingTimelineElementId(selection, timelineElements) ??
    findTimelineIdByAncestor(
      selection.element,
      timelineElements,
      selection.sourceFile || "index.html",
    );
  const members = group.map(timelineIdFor).filter((id): id is string => Boolean(id));
  const anchor = timelineIdFor(primary);
  const publishedMembers = new Set(members);
  if (anchor) publishedMembers.add(anchor);
  const timelineAnchor = anchor ?? members[0] ?? null;
  // A member with no timeline row of its own resolves to null and is dropped here,
  // so a group can announce fewer ids than it has — or none, which reads back as an
  // empty selection and takes the canvas selection with it.
  logSelect("announce", {
    group: group.length,
    published: publishedMembers.size,
    anchor,
    anchorPublished: anchor != null && publishedMembers.has(anchor),
  });
  // A canvas target can be editable without owning a timeline row. Most such
  // targets live inside a clip and must not erase its timeline context. A mixer
  // bus is different: it is itself the editing target, so its title replaces any
  // selected clips even though the bus has no clip row of its own.
  if (!timelineAnchor) {
    if (primary.tagName.toLowerCase() === HF_AUDIO_GROUP_TAG) {
      setTimelineSelectionSet(new Set());
      setSelectedTimelineElementId(null);
    }
    return;
  }
  // A late async primary inside the live set keeps the group. A click outside it, or a
  // group the caller states in full (`replaceSet`: shift toggle, marquee, timeline sync), is published
  // first; otherwise `preserveSet` clears or keeps a stale set and sync undoes the canvas.
  if (replaceSet || group.length > 1 || !getTimelineSelectionSet().has(timelineAnchor)) {
    setTimelineSelectionSet(publishedMembers);
  }
  setSelectedTimelineElementId(timelineAnchor, { preserveSet: true });
}
