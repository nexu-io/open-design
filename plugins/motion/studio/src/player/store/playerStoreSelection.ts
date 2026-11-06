/**
 * Selection-set arithmetic for the player store, and the reveal request's
 * cross-id-space match.
 *
 * Its own module so `playerStore.ts` stays under the studio's 600-line cap.
 */

import { splitTimelineElementKey } from "../lib/timelineElementHelpers";

/**
 * The id set a selection change leaves behind.
 *
 * `preserveSet` means "keep the multi-selection if this id is already in it" —
 * a DOM→store echo re-announcing a member must not collapse the set — and
 * anything else is a genuine single selection.
 */
export function nextSelectionSet(
  current: ReadonlySet<string>,
  id: string | null,
  preserveSet: boolean | undefined,
): Set<string> {
  if (preserveSet) return id && current.has(id) ? new Set(current) : new Set<string>();
  return id ? new Set([id]) : new Set<string>();
}

/**
 * Is a pending reveal request aimed at the element being selected?
 *
 * Compared across the ID-SPACE BOUNDARY, which is why it is a named function:
 * a request carries the BARE dom id (`runtimeAudioId` — the panel and the
 * runtime speak that), while the store's ids are `sourceFile#domId`. A direct
 * `===` between the two is silently never true, which is the exact shape of
 * failure the split produces and how the reveal came to be dead.
 */
export function revealTargetsSelection(
  request: { elementKey: string } | null,
  id: string | null,
): boolean {
  if (!request || id === null) return false;
  return request.elementKey === splitTimelineElementKey(id).domId;
}
