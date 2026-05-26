// Boot timing observer.
//
// Captures `client_boot_timing` once, after the app's first page becomes
// fully rendered. Buckets:
//
//   - navigation_start_offset_ms: navigationStart → loadEvent.start
//     (the standard "page load" metric — how long the daemon's static
//     SPA fallback + initial bundle download took).
//   - dom_interactive_ms:  navigationStart → domInteractive
//   - dom_content_loaded_ms: navigationStart → domContentLoadedEventStart
//   - app_mount_ms:  navigationStart → first `home_view`-like DOM marker
//
// Why we don't reuse posthog-js's `$performance` events: those are
// stripped for users who opted out of analytics. Boot timing is a
// stability signal more than a behavioral one — slow boots are bugs we
// need to triage regardless of consent.
//
// Fires at most once per page load.

import { reportSafetyEvent } from '../analytics/error-tracking';

let captured = false;

export function installBootTimingObserver(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (typeof performance === 'undefined') return () => undefined;
  if (captured) return () => undefined;

  const onReady = (): void => {
    if (captured) return;
    captured = true;
    // Defer to the next idle tick so we capture the post-load timings
    // (loadEventEnd is set synchronously inside the `load` handler).
    schedule(() => emit());
  };

  // We can hit this from three states: still loading, interactive, or
  // already complete (HMR / dev / fast paths). Cover all three.
  if (document.readyState === 'complete') {
    onReady();
  } else {
    window.addEventListener('load', onReady, { once: true });
  }

  return () => {
    captured = true;
    window.removeEventListener('load', onReady);
  };
}

function schedule(fn: () => void): void {
  if (typeof window === 'undefined') return;
  const rIC = (window as unknown as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof rIC === 'function') {
    rIC(fn, { timeout: 2000 });
    return;
  }
  setTimeout(fn, 50);
}

function emit(): void {
  // PerformanceNavigationTiming is the modern shape; Navigation Timing v1
  // (`performance.timing`) is deprecated but still ubiquitous. We prefer
  // the typed v2 surface and only fall back when getEntriesByType returns
  // nothing (Safari < 15 in some quirk modes).
  const nav = readNavigationTiming();
  if (!nav) return;

  reportSafetyEvent('client_boot_timing', {
    navigation_start_offset_ms: round(nav.navigationStart),
    dom_interactive_ms: round(nav.domInteractive),
    dom_content_loaded_ms: round(nav.domContentLoadedEventStart),
    dom_complete_ms: round(nav.domComplete),
    load_event_ms: round(nav.loadEventStart),
    transfer_size_bytes:
      typeof nav.transferSize === 'number' && nav.transferSize > 0 ? nav.transferSize : undefined,
    next_render_mode: detectNextRenderMode(),
    visibility_state: typeof document !== 'undefined' ? document.visibilityState : undefined,
  });
}

interface BootTimingsShape {
  navigationStart: number;
  domInteractive: number;
  domContentLoadedEventStart: number;
  domComplete: number;
  loadEventStart: number;
  transferSize?: number;
}

function readNavigationTiming(): BootTimingsShape | null {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (entry) {
    return {
      navigationStart: entry.startTime,
      domInteractive: entry.domInteractive,
      domContentLoadedEventStart: entry.domContentLoadedEventStart,
      domComplete: entry.domComplete,
      loadEventStart: entry.loadEventStart,
      transferSize: entry.transferSize,
    };
  }
  // Legacy fallback — `performance.timing` returns absolute epoch
  // timestamps, so we normalise against navigationStart to match the
  // v2-style relative shape.
  const legacy = (performance as unknown as { timing?: PerformanceTiming }).timing;
  if (!legacy) return null;
  const base = legacy.navigationStart;
  return {
    navigationStart: 0,
    domInteractive: legacy.domInteractive - base,
    domContentLoadedEventStart: legacy.domContentLoadedEventStart - base,
    domComplete: legacy.domComplete - base,
    loadEventStart: legacy.loadEventStart - base,
  };
}

function detectNextRenderMode(): string {
  // Static-exported pages set this attribute on the <html> element via the
  // App Router's static rendering. Useful for separating cold-cache CDN
  // misses (slow) from already-resident chunks (fast).
  if (typeof document === 'undefined') return 'unknown';
  if (document.documentElement.getAttribute('data-next-render') === 'static') return 'static';
  return document.documentElement.getAttribute('data-next-render') ?? 'unknown';
}

function round(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.round(value);
}
