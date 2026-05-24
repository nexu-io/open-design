import type { DesignSystemSummary } from '@open-design/contracts';

// Order the Settings -> Design Systems list so editable (user-created) systems
// come first, both across category groups and within a group. Built-in groups
// keep their order, and within any group the built-ins keep their incoming
// (alphabetical) order. This keeps a user's own systems at the top instead of
// buried under the built-in catalog. Issue #2813.
//
// Pure so it can be unit-tested without rendering the section. Array.sort is
// stable in modern engines, so same-kind groups and same-kind items keep the
// caller's original order (which the section derives from the fetched data
// order).

function isEditableSystem(system: DesignSystemSummary): boolean {
  return system.isEditable === true || system.source === 'user';
}

function groupHasEditable(items: readonly DesignSystemSummary[]): boolean {
  return items.some(isEditableSystem);
}

// Float editable systems to the top of a single group. Without this, a
// user-created system that shares a category with built-ins (its DESIGN.md can
// set any category) would still render below Apple/Airbnb/etc. within that
// group, so the group-level sort alone does not put it "at the top of the list".
function orderItemsEditableFirst(items: DesignSystemSummary[]): DesignSystemSummary[] {
  return [...items].sort((a, b) => {
    const aEditable = isEditableSystem(a);
    const bEditable = isEditableSystem(b);
    if (aEditable === bEditable) return 0;
    return aEditable ? -1 : 1;
  });
}

export function orderDesignSystemGroups(
  entries: ReadonlyArray<[string, DesignSystemSummary[]]>,
): Array<[string, DesignSystemSummary[]]> {
  return entries
    .map(([category, items]): [string, DesignSystemSummary[]] => [
      category,
      orderItemsEditableFirst(items),
    ])
    .sort(([, a], [, b]) => {
      const aEditable = groupHasEditable(a);
      const bEditable = groupHasEditable(b);
      if (aEditable === bEditable) return 0;
      return aEditable ? -1 : 1;
    });
}
