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

/** Default chat-panel width (px) when no saved preference exists. */
export const DEFAULT_CHAT_PANEL_WIDTH = 460;
/** localStorage key the chat-panel width preference persists under. */
export const CHAT_PANEL_WIDTH_STORAGE_KEY = 'open-design.project.chatPanelWidth';
/** Width (px) the keyboard resize handler steps per arrow-key press. */
export const CHAT_PANEL_KEYBOARD_STEP = 16;

/** Number of design-system-audit auto-repair attempts armed per eligibility mark. */
export const DESIGN_SYSTEM_AUDIT_AUTO_REPAIR_ATTEMPTS = 2;

// Local mirrors of the daemon-disconnect identity constants. The authoritative
// source is `apps/web/src/providers/daemon.ts`; the slice cannot import a
// provider outside `dependencies.ts` (ADR 0002), so these are kept as local
// literals — exactly like the daemon-mirrored `BRAND_KIT_FILE` literal in the
// orchestrator. `tests/features/project-view/rules.test.ts` pins them against
// the provider's exports so a drift fails the build.
export const GENERIC_DAEMON_DISCONNECT_MESSAGE =
  'daemon stream disconnected before run completed';
export const GENERIC_DAEMON_DISCONNECT_CODE = 'DAEMON_STREAM_DISCONNECTED';

// The brand-extraction project's design-system (brand kit) preview tab. Mirrors
// the daemon `BRAND_KIT_FILE` (apps/daemon/src/brands/kit-render.ts); kept as a
// local literal to respect the web↔daemon app boundary (daemon and web cannot
// import each other's `src`).
export const BRAND_KIT_FILE = 'brand.html';
/** Retry delays (ms) for an empty brand-extraction transcript re-check. */
export const BRAND_EMPTY_TRANSCRIPT_RETRY_DELAYS_MS = [120, 500, 1_200, 2_000] as const;
/** Width (px) of the comment-inspector side panel. */
export const COMMENT_INSPECTOR_PANEL_WIDTH = 320;
export const BYOK_OPENCODE_UNAVAILABLE_MESSAGE =
  'BYOK API runs require OpenCode. Install OpenCode, then rescan local agents in Settings before retrying.';
export const BEDROCK_BYOK_UNSUPPORTED_MESSAGE =
  'AWS Bedrock BYOK chat requires AWS credential signing and is not supported by the current API-key proxy.';
// Trailing-debounce window for the canonical (daemon + SQLite) tab-state write.
// Embedded-browser navigation bursts settle well within this; the local cache
// is written immediately so nothing is lost if the daemon write is coalesced.
export const TAB_PERSIST_DEBOUNCE_MS = 400;
