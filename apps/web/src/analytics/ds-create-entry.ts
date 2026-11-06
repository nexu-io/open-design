// Pending entry-source hint for the /design-systems/create flow.
//
// The route `{ kind: 'design-system-create' }` carries no params, so the
// create page can't otherwise tell *where the user came from*. Each
// `navigate({ kind: 'design-system-create' })` call site sets the source
// here right before navigating; the create page consumes it once for its
// `page_view` and `create_result` `entry_from`. Kept as a transient
// module-level value (not storage): it's set-then-consumed within the same
// SPA navigation. A reload before consumption simply falls back to the
// onboarding/`unknown` heuristic — acceptable for an analytics hint.

import type { TrackingDesignSystemCreateEntryFrom } from '@open-design/contracts/analytics';

let pendingEntry: TrackingDesignSystemCreateEntryFrom | null = null;

export function setPendingDesignSystemCreateEntry(
  from: TrackingDesignSystemCreateEntryFrom,
): void {
  pendingEntry = from;
}

// Returns the pending entry source and clears it, so a later visit that
// arrives without a set() (e.g. a direct URL load) doesn't inherit a stale
// source.
export function consumeDesignSystemCreateEntry(): TrackingDesignSystemCreateEntryFrom | null {
  const value = pendingEntry;
  pendingEntry = null;
  return value;
}
