// Module-scope constants for the file-workspace slice. `DESIGN_FILES_TAB` and
// `DESIGN_SYSTEM_TAB` are re-exported from `components/FileWorkspace.tsx`
// (the orchestrator) so `./FileWorkspace` stays a stable import path for
// external consumers (e.g. `ProjectView.tsx`).
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
