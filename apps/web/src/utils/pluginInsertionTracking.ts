// Instance-aware tracking for `@<token>` mentions that ChatComposer
// inserts into the draft via the @-mention popover plugin-pick path
// (#2881, #2929). Each tracked insertion records the precise start
// offset of `@`, so two `@Airbnb` instances in the same draft (one
// composer-inserted, one user-typed) are individually distinguishable
// — the chip-clear strip only removes the tracked one (#2929 round 3).
//
// Boundary rules are imported from `./inlineMentions` so the
// "tracker thinks this is still a valid mention" predicate stays in
// lockstep with the actual mention parser. Without that, drafts
// like `@Airbnb/foo` (where the parser tokenizes the full
// `@Airbnb/foo` as one mention) would still satisfy a permissive
// tracker boundary, and the post-clear strip would tear out only
// `@Airbnb`, leaving `/foo` as orphaned user-authored text
// (#2929 round 5).
import {
  isMentionBoundary,
  isMentionRightBoundary,
} from './inlineMentions';

export type TrackedInsertion = {
  /** Bare token without the leading `@`, matching `inlineMentionToken` payload. */
  token: string;
  /** Position of `@` in the draft. The full mention occupies [start, start + token.length + 1). */
  start: number;
  /**
   * `id` of the `InstalledPluginRecord` whose `applyById` produced this
   * insertion. Used by ChatComposer to scope the post-clear strip to the
   * currently active plugin: when the user replaces plugin A with plugin
   * B (e.g. via the tools menu's `applyById` without writing to the
   * draft), the entries for A must be dropped from the tracker, otherwise
   * clearing B's chip would silently strip A's `@A` from the draft —
   * user-text deletion in a supported replace-plugin flow (#2929 round 6).
   */
  pluginId: string;
  /**
   * Optional unique handle assigned by the producer (ChatComposer's
   * `insertPluginMention`) when the entry is pushed. Survives
   * `reconcileInsertions` so the producer's failure-path rollback can
   * locate "the entry I just pushed" even after intervening reconciles
   * shifted offsets or after `onCleared` mutated the array. Without
   * this, a `(token, pluginId)`-only match is ambiguous if the user
   * replays the same plugin pick during the await window
   * (#2929 round 10 codex review).
   */
  insertionId?: string;
};

export type EditRange = {
  /** First index where prev and next differ. */
  start: number;
  /** Index in prev one past the last differing char. */
  oldEnd: number;
  /** Index in next one past the last differing char. */
  newEnd: number;
};

/**
 * Longest-common-suffix + longest-common-prefix diff of two strings.
 * Returns the minimal `[editStart, oldEnd, newEnd]` range that contains
 * every byte that differs between `prev` and `next`.
 *
 * Suffix is computed first; the prefix is then capped so the two
 * matches do not overlap. This ordering matters when the inserted
 * text shares a leading character with `prev` — e.g. prepending
 * `@github ` before `@Airbnb ` to get `@github @Airbnb `. A
 * prefix-first walk would greedily claim the leading `@` (LCP=1)
 * and then split the diff window at index 1, which crosses through
 * a tracked `@Airbnb` entry that is structurally untouched. Suffix
 * first claims the entire `@Airbnb ` from the right, leaving LCP=0
 * and a clean prepend window of `[0, 0, 8]` — the entry shifts
 * cleanly by `delta`.
 *
 * Single-point edits (typing/deleting/pasting at one location) are
 * 100% accurate. Multi-point simultaneous edits (rare) collapse into
 * one wider range, which conservatively invalidates any tracked
 * insertion overlapping that range.
 */
export function computeEditRange(prev: string, next: string): EditRange {
  if (prev === next) return { start: 0, oldEnd: 0, newEnd: 0 };
  const minLen = Math.min(prev.length, next.length);
  // Longest common suffix first — capped at minLen so it does not
  // walk past the start of either string.
  let suffix = 0;
  while (
    suffix < minLen &&
    prev.charCodeAt(prev.length - 1 - suffix) ===
      next.charCodeAt(next.length - 1 - suffix)
  ) {
    suffix++;
  }
  // Longest common prefix, capped so it does not overlap the suffix.
  const maxStart = minLen - suffix;
  let start = 0;
  while (start < maxStart && prev.charCodeAt(start) === next.charCodeAt(start)) {
    start++;
  }
  return {
    start,
    oldEnd: prev.length - suffix,
    newEnd: next.length - suffix,
  };
}

/**
 * True iff the draft still contains `@<token>` at the given start
 * offset AND the surrounding characters make the parser see it as
 * exactly that mention (not a longer one). Boundaries delegate to
 * the same `isMentionBoundary` / `isMentionRightBoundary` helpers
 * the parser uses, so the tracker cannot diverge from the parser
 * and inadvertently strip a prefix of a longer parser-recognized
 * mention (#2929 round 5).
 *
 * Concretely: a tracked `@Airbnb` at offset 0 in `@Airbnb/foo` is
 * INVALID under this rule because the parser treats the full
 * `@Airbnb/foo` as one mention (its `@[^\s@]+` greedy regex extends
 * through `/foo`). Stripping just `@Airbnb` would leave `/foo`
 * dangling — that is user-authored text mutation, not an orphan
 * removal. Invalidating the entry on clear is the conservative
 * choice: the post-clear strip becomes a no-op, the orphan
 * styled mention remains visible, and the user can edit it
 * manually if they want.
 */
export function isInsertionStillValid(
  draft: string,
  start: number,
  token: string,
): boolean {
  if (start < 0 || token.length === 0) return false;
  const tokenLen = token.length + 1; // include leading `@`
  if (start + tokenLen > draft.length) return false;
  if (draft.slice(start, start + tokenLen) !== `@${token}`) return false;
  if (!isMentionBoundary(draft, start)) return false;
  if (!isMentionRightBoundary(draft, start + tokenLen)) return false;
  return true;
}

/**
 * Re-map tracked insertion offsets across a draft edit. Entries
 * entirely before the edit keep their offset; entries entirely
 * after shift by `delta`; entries that overlap the edit are
 * dropped. Survivors are revalidated against the new draft so any
 * boundary corruption (e.g. user typed letters touching the right
 * edge of `@Airbnb` to form `@Airbnbify`) prunes the entry.
 */
export function reconcileInsertions(
  entries: ReadonlyArray<TrackedInsertion>,
  prev: string,
  next: string,
): TrackedInsertion[] {
  if (entries.length === 0) return [];
  if (prev === next) return entries.slice();
  const { start: editStart, oldEnd, newEnd } = computeEditRange(prev, next);
  const delta = newEnd - oldEnd;
  const result: TrackedInsertion[] = [];
  for (const e of entries) {
    const tokenLen = e.token.length + 1;
    const entryEnd = e.start + tokenLen;
    let nextStart: number;
    if (entryEnd <= editStart) {
      nextStart = e.start; // entry entirely before edit
    } else if (e.start >= oldEnd) {
      nextStart = e.start + delta; // entry entirely after edit → shift
    } else {
      continue; // edit overlaps entry → drop
    }
    if (isInsertionStillValid(next, nextStart, e.token)) {
      const reconciled: TrackedInsertion = {
        token: e.token,
        start: nextStart,
        pluginId: e.pluginId,
      };
      if (e.insertionId !== undefined) reconciled.insertionId = e.insertionId;
      result.push(reconciled);
    }
  }
  return result;
}

/**
 * Remove tracked `@<token>` insertions from the draft by slicing each
 * entry's range. Sorts descending by start so earlier offsets stay
 * valid as later ones are excised. Invalidated entries (boundary
 * corruption since the last reconcile) are skipped — the safe failure
 * mode is under-delete, never over-delete.
 *
 * Whitespace handling (#2929 round 8): when both the character before
 * `@` and the character after the token are whitespace, the slice
 * removes one of them in addition to the token to avoid leaving
 * doubled whitespace at the seam (e.g. `text @Airbnb more` → `text
 * more`, not `text  more`). Whitespace ELSEWHERE in the draft is
 * never touched — a previous version of this function ran a global
 * `[ \t]{2,}` collapse over the entire result, which silently
 * rewrote any user-authored multi-space spans (e.g. `keep  gap` →
 * `keep gap`). Round 8 reviewer flagged that as prompt corruption
 * in the changed flow.
 */
export function stripPluginInsertedTokens(
  draft: string,
  entries: ReadonlyArray<TrackedInsertion>,
): string {
  if (!draft || entries.length === 0) return draft;
  const valid = entries
    .filter((e) => isInsertionStillValid(draft, e.start, e.token))
    .sort((a, b) => b.start - a.start);
  let next = draft;
  for (const e of valid) {
    const tokenLen = e.token.length + 1;
    const leftIdx = e.start - 1;
    const rightIdx = e.start + tokenLen;
    const leftIsWs =
      leftIdx >= 0 && /[ \t]/.test(next[leftIdx] ?? '');
    const rightIsWs =
      rightIdx < next.length && /[ \t]/.test(next[rightIdx] ?? '');
    // Seam-local collapse only: if both sides are whitespace,
    // extend the slice by one character so the seam ends up with
    // a single space instead of two. Anything outside this range
    // — including user-authored multi-space spans elsewhere — is
    // left untouched.
    const sliceEnd = leftIsWs && rightIsWs ? rightIdx + 1 : rightIdx;
    next = next.slice(0, e.start) + next.slice(sliceEnd);
  }
  return next;
}
