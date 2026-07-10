// Layout and boundary constants owned by the project-view slice.
//
// The split-panel width constants back the pure split math in `rules.ts` and are
// re-exported to the `ProjectView` orchestrator, which uses the same numbers for
// its resize interactions — one source of truth for both.

/** Minimum width (px) of the chat panel in the split layout. */
export const MIN_CHAT_PANEL_WIDTH = 345;
/** Maximum width (px) of the chat panel in the split layout. */
export const MAX_CHAT_PANEL_WIDTH = 720;
/** Minimum width (px) reserved for the workspace panel in a normal split. */
export const MIN_WORKSPACE_PANEL_WIDTH = 400;
/** Width (px) of the drag handle between the chat and workspace panels. */
export const SPLIT_RESIZE_HANDLE_WIDTH = 8;
/**
 * Below this total split width the workspace panel collapses to 0 so the chat
 * panel can still honor its minimum — used by `workspacePanelMinWidthForSplit`.
 */
export const MIN_NORMAL_SPLIT_WIDTH =
  MIN_CHAT_PANEL_WIDTH + SPLIT_RESIZE_HANDLE_WIDTH + MIN_WORKSPACE_PANEL_WIDTH;

// Local mirrors of the daemon-disconnect identity constants. The authoritative
// source is `apps/web/src/providers/daemon.ts`; the slice cannot import a
// provider outside `dependencies.ts` (ADR 0002), so these are kept as local
// literals — exactly like the daemon-mirrored `BRAND_KIT_FILE` literal in the
// orchestrator. `tests/features/project-view/rules.test.ts` pins them against
// the provider's exports so a drift fails the build.
export const GENERIC_DAEMON_DISCONNECT_MESSAGE =
  'daemon stream disconnected before run completed';
export const GENERIC_DAEMON_DISCONNECT_CODE = 'DAEMON_STREAM_DISCONNECTED';
