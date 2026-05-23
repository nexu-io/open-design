import type { DesignSystemSummary } from '@open-design/contracts';

// Order the category groups shown in Settings -> Design Systems so groups that
// contain editable (user-created) systems come first. This keeps a user's own
// design systems at the top of the list instead of buried under the built-in
// catalog. Issue #2813.
//
// Pure so it can be unit-tested without rendering the section. Array.sort is
// stable in modern engines, so groups of the same kind keep the caller's
// original order (which the section derives from the fetched data order).

function groupHasEditable(items: readonly DesignSystemSummary[]): boolean {
  return items.some((system) => system.isEditable === true || system.source === 'user');
}

export function orderDesignSystemGroups(
  entries: ReadonlyArray<[string, DesignSystemSummary[]]>,
): Array<[string, DesignSystemSummary[]]> {
  return [...entries].sort(([, a], [, b]) => {
    const aEditable = groupHasEditable(a);
    const bEditable = groupHasEditable(b);
    if (aEditable === bEditable) return 0;
    return aEditable ? -1 : 1;
  });
}
