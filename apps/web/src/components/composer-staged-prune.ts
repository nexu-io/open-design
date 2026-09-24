// A staged composer context chip is only meaningful while the entity it names
// still exists in the live catalogue.
//
// `ChatComposer` prunes its staged skill chip against the editor text on every
// edit (`handleEditorChange`), but nothing prunes it when the *catalogue*
// changes underneath it. Deleting a user skill in the Skills settings section
// refetches `/api/skills`; the composer still holds the chip for the skill that
// just disappeared, so the staged-context row stays mounted (and its wrapped
// layout stays wrong) with no entity backing it — the inconsistency reported in
// issue #2637. This helper gives the catalogue-change path the same prune the
// editor-change path already performs.
//
// Extracted pure so the load-window guard is unit-testable without a DOM: an
// empty catalogue that has not loaded yet (or is briefly empty mid-refetch)
// must NOT wipe chips the user staged.

/**
 * Drop staged entries whose id is absent from the current catalogue.
 *
 * `catalogueReady` gates the initial/refresh window — callers pass `false`
 * until the catalogue has loaded at least once, so an empty or not-yet-fetched
 * catalogue never clears staged chips. When nothing changes the same array
 * reference is returned, so a `setState` off this value bails out of a re-render
 * instead of redrawing the composer for no reason.
 */
export function pruneStagedToCatalogue<T extends { id: string }>(
  staged: T[],
  catalogueIds: ReadonlySet<string>,
  catalogueReady: boolean,
): T[] {
  if (!catalogueReady || staged.length === 0) return staged;
  const next = staged.filter((item) => catalogueIds.has(item.id));
  return next.length === staged.length ? staged : next;
}
