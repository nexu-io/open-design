// Visibility / session-length observer.
//
// PostHog's own `$pageleave` fires only on the last frame before unload
// and is gated on `capture_pageview: 'history_change'` — it does not
// reliably capture the in-tab visibility cycle that drives a long-running
// Electron session (user tabs away, comes back hours later).
//
// We emit two events:
//
//   - `client_visibility_change` — on every `visibilitychange`. Carries
//     the new state and how many ms have elapsed since the previous
//     transition. Used to reconstruct the in-foreground time for a
//     session.
//   - `client_session_summary` — on `pagehide`. Carries the total
//     foreground duration for the page lifetime. This is the only
//     reliable place to emit a final summary because `beforeunload`
//     doesn't fire on iOS Safari, and `unload` is being deprecated in
//     Chrome.

import { reportSafetyEvent } from '../analytics/error-tracking';

let installed = false;

interface SessionTimes {
  pageStart: number;
  lastChange: number;
  foregroundMs: number;
  lastState: DocumentVisibilityState;
}

export function installVisibilityObserver(): () => void {
  if (installed) return () => undefined;
  if (typeof document === 'undefined') return () => undefined;
  installed = true;

  const times: SessionTimes = {
    pageStart: performance.now(),
    lastChange: performance.now(),
    foregroundMs: 0,
    lastState: document.visibilityState,
  };

  const onVisibilityChange = (): void => {
    const now = performance.now();
    const delta = now - times.lastChange;
    if (times.lastState === 'visible') {
      times.foregroundMs += delta;
    }
    times.lastChange = now;
    times.lastState = document.visibilityState;
    reportSafetyEvent('client_visibility_change', {
      to_state: document.visibilityState,
      // `delta_ms` is how long the *previous* state lasted — useful for
      // distinguishing "user blinked at a notification" (~500 ms hidden)
      // from "user left for lunch" (~30 minutes).
      previous_state_duration_ms: Math.round(delta),
    });
  };

  const onPageHide = (): void => {
    const now = performance.now();
    if (times.lastState === 'visible') {
      times.foregroundMs += now - times.lastChange;
    }
    reportSafetyEvent('client_session_summary', {
      page_lifetime_ms: Math.round(now - times.pageStart),
      foreground_ms: Math.round(times.foregroundMs),
    });
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  // `pagehide` fires on browser back/forward navigations and tab close
  // in all evergreen browsers including iOS Safari (where `unload` does
  // not). For Electron desktop this fires before the renderer process
  // is destroyed, giving us a last chance to flush a summary.
  window.addEventListener('pagehide', onPageHide);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    installed = false;
  };
}
