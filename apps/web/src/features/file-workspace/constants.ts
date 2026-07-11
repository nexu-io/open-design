// Module-scope constants for the file-workspace slice. `DESIGN_FILES_TAB` and
// `DESIGN_SYSTEM_TAB` are re-exported from `components/FileWorkspace.tsx`
// (the orchestrator) so `./FileWorkspace` stays a stable import path for
// external consumers (e.g. `ProjectView.tsx`).
import type { ProjectFolder } from '../../types';

export const DESIGN_FILES_TAB = '__design_files__';
export const DESIGN_SYSTEM_TAB = '__design_system__';

// Prefix for synthetic embedded-browser tab ids, e.g. `__browser__:3`.
export const BROWSER_TAB_PREFIX = '__browser__:';

export const DESIGN_SYSTEM_CARD_MANIFEST_OPTIONAL_STRING_FIELDS = ['group', 'name', 'subtitle', 'viewport'] as const;

export const DESIGN_SYSTEM_GUIDANCE_FILES = new Set([
  'design.md',
  'readme.md',
  'readme-print.md',
  'skill.md',
]);

export const DESIGN_SYSTEM_IMAGE_OR_FONT_EXTENSIONS = /\.(svg|png|jpe?g|gif|webp|avif|ico|otf|ttf|woff2?)$/i;

// Synthetic tab id for the Questions panel — never a real file/browser tab.
export const QUESTIONS_TAB = '__questions__';

// Keep at most this many embedded-browser `<webview>`s mounted at once. Each is
// a full out-of-process Chromium guest (timers, JS, network, a GPU surface), so
// mounting every open browser tab made memory/CPU grow linearly with tab count.
// We keep an LRU of the most-recently-activated browser tabs live and unmount
// the rest; switching back to an evicted tab remounts (reloads) it.
export const BROWSER_KEEPALIVE_CAP = 3;

export const QUICK_SWITCHER_DOCUMENT_CLASS = 'od-quick-switcher-open';

export const SKETCH_AUTOSAVE_DELAY_MS = 800;

// Stable empty folder list so the render-phase project-switch reset is
// idempotent (passing a fresh `[]` each render would re-trigger the reset).
export const EMPTY_PROJECT_FOLDERS: ProjectFolder[] = [];
