/**
 * What the rack's `IN` and `OUT` lines say, per selected element.
 *
 * The rack brackets its chain with the signal path because the ORDER is the
 * point (see `propertyPanelFxRackChain`). Those two lines were hardcoded to a
 * clip's answer — "in this track", "out to mix" — which is wrong at both ends
 * once groups exist, and the design doc's §5 mockup spells out both:
 *
 *     GROUP: Voiceover          CLIP: vo-1
 *     IN   vo-1, vo-2           IN   this track
 *     OUT  to mix               OUT  to Voiceover
 *
 * A group's IN names what it sums, which is the only thing on screen that says
 * a bus is a sum rather than a copy of the chain on each member. A member's OUT
 * names the group it feeds, "so the routing is readable from either end".
 */

import type { HfAudioGroup } from "@hyperframes/core/audio-groups";

export interface AudioFxSignalPath {
  /** After the word "In". */
  inLabel: string;
  /** After the word "Out". */
  outLabel: string;
  /** The thing the empty-state sentence is about: "No effects on this …". */
  subject: string;
}

/** What a plain, ungrouped clip has always said, and the default everywhere. */
export const CLIP_SIGNAL_PATH: AudioFxSignalPath = {
  inLabel: "this track",
  outLabel: "to mix",
  subject: "track",
};

/**
 * `groups` is the resolved set from the composition; `elementId` and `tag` come
 * from the selection. Pure so the labels can be asserted without a DOM.
 */
/** "a", "a and b", "a, b and c" — how the designs read a member list aloud. */
function joinNatural(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function audioFxSignalPath(
  tag: string | undefined,
  elementId: string | undefined,
  groups: readonly HfAudioGroup[],
): AudioFxSignalPath {
  if (tag === "hf-audio-group") {
    const group = groups.find((g) => g.id === elementId);
    // A group with no members yet still reads as a group — "nothing yet" is the
    // honest answer, and it is also the state the author is in right after
    // making one, so it must not look like a bug.
    const members = group?.memberIds ?? [];
    return {
      // "vo-1 and vo-2, together" — the rendered design's exact phrasing, not a
      // comma list. The trailing "together" is the point: it says the group is
      // ONE signal hearing both, which is the thing two separate copies of a
      // chain cannot do, and it says it without "sum" or "bus".
      inLabel: members.length > 0 ? `${joinNatural(members)}, together` : "nothing yet",
      outLabel: "to mix",
      subject: "group",
    };
  }
  const owner = elementId ? groups.find((g) => g.memberIds.includes(elementId)) : undefined;
  // "into Voiceover", not "to" — a member feeds the group, and the design uses
  // the preposition that says so.
  return owner ? { ...CLIP_SIGNAL_PATH, outLabel: `into ${owner.label}` } : CLIP_SIGNAL_PATH;
}
