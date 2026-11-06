// ---------------------------------------------------------------------------
// LocalStorage-backed config for studio telemetry.
// Anonymous ID + opt-out flag are stored per-browser-profile.
// Users opt out via DevTools:
//   localStorage.setItem('hyperframes-studio:telemetryDisabled','1')
// ---------------------------------------------------------------------------

import { resolveStudioDistinctId } from "./distinctId";
import { safeLocalStorage, safeSessionStorage } from "../utils/safeStorage";

const OPT_OUT_KEY = "hyperframes-studio:telemetryDisabled";
const NOTICE_KEY = "hyperframes-studio:telemetryNoticeShown";

/**
 * Anonymous telemetry id for `studio_*` and render events.
 *
 * Delegates to the single source of truth in `distinctId.ts` so this id is
 * identical to the one used for `studio:*` events (utils/studioTelemetry.ts)
 * and, when the CLI launched Studio, to the CLI's own `config.anonymousId`.
 */
export function getAnonymousId(): string {
  return resolveStudioDistinctId();
}

// safeLocalStorage() guards the REFERENCE, not the access: in a partitioned
// or sandboxed context the object resolves and `getItem` still throws (the
// case distinctId.ts already documents). These are read from the telemetry
// policy, which is called from event tracking that must never throw into a
// caller — `trackStudioEvent` sits in a post-commit catch block, so a throw
// there reported an already-committed edit as failed.
function readStoredFlag(key: string): boolean {
  try {
    return safeLocalStorage()?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function isOptedOut(): boolean {
  return readStoredFlag(OPT_OUT_KEY);
}

export function hasShownNotice(): boolean {
  return readStoredFlag(NOTICE_KEY);
}

export function markNoticeShown(): void {
  try {
    safeLocalStorage()?.setItem(NOTICE_KEY, "1");
  } catch {
    /* ignore */
  }
}

// Session-scoped (cleared when the tab closes) so HMR remounts and
// route-level remounts within one tab don't refire `studio_session_start`.
// Uses sessionStorage directly because the dedupe is per-tab, not per-browser.
const SESSION_FIRED_KEY = "hyperframes-studio:sessionStartFired";

export function hasFiredSessionStart(): boolean {
  return safeSessionStorage()?.getItem(SESSION_FIRED_KEY) === "1";
}

export function markSessionStartFired(): void {
  try {
    safeSessionStorage()?.setItem(SESSION_FIRED_KEY, "1");
  } catch {
    /* ignore */
  }
}
