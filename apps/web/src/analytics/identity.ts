// Browser-side identity bookkeeping for PostHog product analytics. Designed
// so it stays SSR-safe: every entry point guards window/localStorage access
// and falls back to a deterministic-enough fake id under jsdom and Next.js
// pre-render. The daemon mirrors these values via the x-od-analytics-*
// headers (see @open-design/contracts/analytics).

import type { AnalyticsClientType } from '@open-design/contracts/analytics';
import { detectOpenDesignHostClientType } from '@open-design/host';

const ANONYMOUS_ID_KEY = 'open-design:analytics.anonymous_id';
const SESSION_ID_KEY = 'open-design:analytics.session_id';
const RUN_TURN_INDEX_KEY = 'open-design:analytics.run_turn_index';

function randomUuid(): string {
  // Prefer the standard crypto.randomUUID — present in every modern browser
  // and Node 19+. The Math.random fallback is for jsdom builds that ship
  // without crypto.randomUUID and for very old browsers; it does not need
  // to be cryptographically strong, only unique-enough for a session id.
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getAnonymousId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    if (existing) return existing;
    const fresh = randomUuid();
    window.localStorage.setItem(ANONYMOUS_ID_KEY, fresh);
    return fresh;
  } catch {
    // Privacy mode or quota — fall back to a per-load id; we'd rather lose
    // cross-session continuity than throw out of an analytics path.
    return randomUuid();
  }
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const fresh = randomUuid();
    window.sessionStorage.setItem(SESSION_ID_KEY, fresh);
    return fresh;
  } catch {
    return randomUuid();
  }
}

// Claim the next 0-based run turn index for the current browser analytics
// session and advance the counter. Lives in sessionStorage so it shares the
// exact lifetime of the `session_id` above — both reset together when the tab
// session ends. Call this once per run that is actually being created (at the
// create-run dispatch), so `run_created`/`run_finished` can sequence a
// session's runs. Returns null when storage is unavailable (SSR / privacy
// mode), so callers omit the hint rather than reporting a misleading turn 0.
export function claimRunTurnIndex(): { turnIndex: number; isFirstRun: boolean } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(RUN_TURN_INDEX_KEY);
    const current = raw ? Number.parseInt(raw, 10) : 0;
    const turnIndex = Number.isFinite(current) && current >= 0 ? current : 0;
    window.sessionStorage.setItem(RUN_TURN_INDEX_KEY, String(turnIndex + 1));
    return { turnIndex, isFirstRun: turnIndex === 0 };
  } catch {
    return null;
  }
}

// Desktop packaged builds install the Open Design host bridge so the
// same web bundle can distinguish desktop runs from browser visits.
// Falls back to 'web' when the host bridge isn't present.
export function detectClientType(): AnalyticsClientType {
  if (typeof window === 'undefined') return 'web';
  return detectOpenDesignHostClientType();
}

// Read the launch_source for app_launch. Best-effort: PerformanceNavigation
// type 'reload' / 'back_forward' are mapped to 'reload'; deep links (paths
// other than '/') are 'deeplink'; otherwise 'direct'. SSR returns 'unknown'.
export function detectLaunchSource():
  | 'direct'
  | 'deeplink'
  | 'reload'
  | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const entries = performance.getEntriesByType?.(
      'navigation',
    ) as PerformanceNavigationTiming[] | undefined;
    const nav = entries?.[0];
    if (nav?.type === 'reload' || nav?.type === 'back_forward') return 'reload';
    if (window.location.pathname && window.location.pathname !== '/') {
      return 'deeplink';
    }
    return 'direct';
  } catch {
    return 'unknown';
  }
}
