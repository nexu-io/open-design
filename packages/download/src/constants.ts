/**
 * @module constants
 *
 * Shared configuration constants for the managed-download store: on-disk layout
 * (sentinel/state/partial/lock directory names), schema versions and kind tags
 * for the ownership sentinel and per-download manifest, retry/prune defaults, and
 * the PID-reuse grace window used by stale-lock reclamation.
 *
 * This file depends on nothing else in the module; every other concern imports
 * these values instead of redefining literals.
 */

/** File name of the ownership sentinel written at the root of a managed base. */
export const STORE_SENTINEL = ".open-design-download-root.json";
/** Subdirectory holding per-target manifest JSON files. */
export const STATE_DIR = ".state";
/** Subdirectory holding in-progress partial download files. */
export const PARTIAL_DIR = ".partial";
/** Subdirectory holding advisory lock files. */
export const LOCK_DIR = ".locks";
/** Schema version stamped into the ownership sentinel. */
export const STORE_SCHEMA_VERSION = 1;
/** Schema version stamped into each download manifest. */
export const MANIFEST_SCHEMA_VERSION = 1;
/** Kind tag identifying a managed-download root sentinel. */
export const STORE_KIND = "open-design-managed-download-root";
/** Kind tag identifying a managed-download manifest. */
export const MANIFEST_KIND = "open-design-managed-download";
/** Default number of download attempts before giving up. */
export const DEFAULT_MAX_ATTEMPTS = 3;
/** Default age threshold (ms) above which prune removes stale scratch entries. */
export const DEFAULT_PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;
/** Grace window (ms) tolerated when deciding whether a same-PID lock is ours. */
export const PID_REUSE_GRACE_MS = 1000;
/** Approximate start time (ms since epoch) of the current process. */
export const PROCESS_STARTED_AT_MS = Date.now() - process.uptime() * 1000;
