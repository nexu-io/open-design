/**
 * Which elements a delete acts on.
 *
 * Its own module so `useDomEditSession.ts` stays under the studio's 600-line
 * cap; it reads only its arguments.
 */

import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { TimelineElement } from "../player";
import { findMatchingTimelineElementId } from "../utils/studioHelpers";

/** One entry in the studio's edit history, as `useDomEditSession`'s caller
 *  supplies it. */
export interface RecordEditInput {
  label: string;
  coalesceKey?: string;
  files: Record<string, { before: string; after: string }>;
}

/**
 * Which elements a delete acts on. `expandGroup` widens the primary to the
 * whole marquee group, which is what the Delete key means.
 *
 * The caller chooses rather than the delete deciding for everyone: Cut copies
 * the primary alone, so expanding for it put one element on the clipboard and
 * removed every other member of the group with it.
 */
export function membersForDelete(
  selection: DomEditSelection,
  group: DomEditSelection[],
  options?: { expandGroup?: boolean },
): DomEditSelection[] {
  return options?.expandGroup && group.length > 0 ? group : [selection];
}

/** The timeline row for each member, only when EVERY member is one — a mixed
 *  group stays on the DOM path. Exact-identity match only, no ancestor
 *  fallback: a click inside a clip must not delete the whole clip. */
export function timelineElementsForDelete(
  members: readonly DomEditSelection[],
  elements: TimelineElement[],
): TimelineElement[] | null {
  const matches: TimelineElement[] = [];
  for (const member of members) {
    const id = findMatchingTimelineElementId(member, elements);
    const match = id ? elements.find((el) => (el.key ?? el.id) === id) : undefined;
    if (!match) return null;
    matches.push(match);
  }
  return matches;
}
