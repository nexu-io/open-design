// Bridge between EntryShell (the owner of the entry nav-rail open state) and
// chrome that lives in a sibling React tree — the pinned Home tab's sidebar
// toggle in WorkspaceTabsBar. Kept in a leaf module so the tabs bar can share
// this contract without importing the whole EntryShell module graph.

// Persisted entry nav-rail open/collapsed state. EntryShell owns the writes;
// outside chrome only reads it to seed the pinned toggle's `aria-expanded`
// before the first state event arrives.
export const RAIL_OPEN_STORAGE_KEY = 'od.entry.railOpen';

// Window event dispatched by chrome outside the entry tree (the pinned Home
// tab's sidebar toggle in WorkspaceTabsBar) to expand/collapse the entry rail.
export const ENTRY_RAIL_TOGGLE_EVENT = 'od:entry-rail-toggle';

// Window event dispatched by EntryShell whenever the rail open state changes,
// with `detail: { open: boolean }`, so outside chrome can mirror the state
// (the pinned toggle's `aria-expanded`).
export const ENTRY_RAIL_STATE_EVENT = 'od:entry-rail-state';

export function readStoredRailOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RAIL_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}
