// Browser-side identity bookkeeping for PostHog product analytics. Designed
// so it stays SSR-safe: every entry point guards window/localStorage access
// and falls back to a deterministic-enough fake id under jsdom and Next.js
// pre-render. The daemon mirrors these values via the x-od-analytics-*
// headers (see @open-design/contracts/analytics).

import type { AnalyticsClientType } from '@open-design/contracts/analytics';

const ANONYMOUS_ID_KEY = 'open-design:analytics.anonymous_id';
const SESSION_ID_KEY = 'open-design:analytics.session_id';

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

// Desktop packaged builds set this marker on window in a preload script so
// the same web bundle can distinguish desktop runs from browser visits.
// Falls back to 'web' when the marker isn't present.
export function detectClientType(): AnalyticsClientType {
  if (typeof window === 'undefined') return 'web';
  const w = window as Window & {
    __OD_CLIENT_TYPE__?: AnalyticsClientType;
    electronAPI?: unknown;
  };
  if (w.__OD_CLIENT_TYPE__ === 'desktop') return 'desktop';
  if (w.electronAPI) return 'desktop';
  return 'web';
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
