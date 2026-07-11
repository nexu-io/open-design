// Module-scope constants for the file-workspace slice. `DESIGN_FILES_TAB` and
// `DESIGN_SYSTEM_TAB` are re-exported from `components/FileWorkspace.tsx`
// (the orchestrator) so `./FileWorkspace` stays a stable import path for
// external consumers (e.g. `ProjectView.tsx`).
export const DESIGN_FILES_TAB = '__design_files__';
export const DESIGN_SYSTEM_TAB = '__design_system__';

// Prefix for synthetic embedded-browser tab ids, e.g. `__browser__:3`.
export const BROWSER_TAB_PREFIX = '__browser__:';
