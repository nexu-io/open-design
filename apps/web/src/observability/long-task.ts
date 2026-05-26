// Long task observer.
//
// Emits `client_long_task` whenever the main thread is blocked for more
// than `MIN_DURATION_MS`. Long tasks are the single best proxy for
// perceived UI lag — a 500 ms task drops 30 consecutive frames at 60 fps,
// which the user reads as "stuck". FPS sampling via requestAnimationFrame
// is a worse signal: it stops counting in background tabs and the count
// itself has measurable overhead.
//
// Threshold is 100 ms rather than the W3C 50 ms minimum because the
// browser already filters at 50 ms; bumping to 100 ms here halves the
// event volume while still catching every task a human notices.

import { reportSafetyEvent } from '../analytics/error-tracking';

const MIN_DURATION_MS = 100;

let observer: PerformanceObserver | null = null;

export function installLongTaskObserver(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  // Some browsers (Safari < 16, Firefox without flag) report `longtask` as
  // an unsupported entry type. observe() throws or no-ops; either way we
  // bail silently so the rest of the observability surface still loads.
  const supported = PerformanceObserver.supportedEntryTypes?.includes?.('longtask');
  if (supported !== true) return () => undefined;
  if (observer) return () => observer?.disconnect();

  observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration < MIN_DURATION_MS) continue;
      // The `attribution` array on a PerformanceLongTaskTiming entry
      // names the script / frame that caused the block (e.g. an iframe
      // child for file-viewer renders). The Long Tasks API surface is
      // not fully covered by TypeScript's lib.dom so we read it through
      // an `unknown` cast rather than a hand-rolled type.
      const attribution = (entry as unknown as {
        attribution?: Array<{ containerType?: string; containerName?: string; containerSrc?: string }>;
      }).attribution?.[0];
      reportSafetyEvent('client_long_task', {
        duration_ms: Math.round(entry.duration),
        start_time_ms: Math.round(entry.startTime),
        container_type: attribution?.containerType,
        container_name: attribution?.containerName,
        // containerSrc can be a full URL that may include query strings.
        // Trimmed to origin+pathname; full URL scrub lives in error-tracking.
        container_src_origin: stripUrlQuery(attribution?.containerSrc),
      });
    }
  });

  try {
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // Older Chrome versions sometimes throw when buffered is requested.
    try {
      observer.observe({ type: 'longtask' });
    } catch {
      observer = null;
      return () => undefined;
    }
  }

  return () => {
    observer?.disconnect();
    observer = null;
  };
}

function stripUrlQuery(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value;
  }
}
