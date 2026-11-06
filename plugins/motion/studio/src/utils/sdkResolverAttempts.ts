/**
 * Attempt counter — the denominator for the resolver-shadow soak gate.
 *
 * The emit functions in sdkResolverShadow.ts only fire a PostHog event on
 * divergence — parity is silent, by design, to avoid firing on every edit.
 * That leaves no way to compute a rate (divergences / attempts): we can count
 * failures but never attempts. This counter tracks attempts in memory and
 * rolls them up into ONE low-frequency event instead of firing per-attempt,
 * which would recreate the exact chattiness problem the divergence-only
 * design avoids.
 */

import { trackStudioEvent, flushViaBeacon } from "./studioTelemetry";

const attemptCounts: Record<string, number> = {};

/**
 * Record that the resolver-shadow tripwire ran for `opLabel`, regardless of
 * outcome (parity or divergence). No flag check of its own — only ever called
 * from inside the shadow emit functions, after their own
 * STUDIO_SDK_RESOLVER_SHADOW_ENABLED guard, so it's already flag-gated.
 */
export function recordAttempt(opLabel: string): void {
  attemptCounts[opLabel] = (attemptCounts[opLabel] ?? 0) + 1;
  ensureAttemptFlushScheduled();
}

/**
 * Return the accumulated attempt counts since the last flush (or `null` if
 * nothing has been recorded — no point emitting an empty rollup), and reset
 * the counter to empty.
 */
export function flushAttemptCounts(): Record<string, number> | null {
  const keys = Object.keys(attemptCounts);
  if (keys.length === 0) return null;
  const snapshot: Record<string, number> = {};
  for (const key of keys) {
    snapshot[key] = attemptCounts[key];
    delete attemptCounts[key];
  }
  return snapshot;
}

const ATTEMPT_FLUSH_INTERVAL_MS = 5 * 60_000;
let attemptFlushTimer: ReturnType<typeof setInterval> | null = null;
let attemptVisibilityHandler: (() => void) | null = null;

function flushAndEmitAttempts(): void {
  const counts = flushAttemptCounts();
  if (counts === null) return;
  trackStudioEvent("sdk_resolver_shadow_attempt", { counts: JSON.stringify(counts) });
}

// Lazily starts the rollup timer + visibilitychange listener on the FIRST
// attempt in a session — mirrors studioTelemetry.ts's own lazy flushTimer
// start, so a session that never exercises the tripwire never runs a
// background timer.
function ensureAttemptFlushScheduled(): void {
  if (!attemptFlushTimer) {
    attemptFlushTimer = setInterval(flushAndEmitAttempts, ATTEMPT_FLUSH_INTERVAL_MS);
  }
  if (!attemptVisibilityHandler && typeof document !== "undefined") {
    attemptVisibilityHandler = () => {
      if (document.visibilityState !== "hidden") return;
      flushAndEmitAttempts();
      // studioTelemetry.ts registers its own visibilitychange listener (on
      // window, at module load) that drains its queue via sendBeacon. Listener
      // execution order between that handler and this one (on document,
      // registered lazily) is not something to rely on — whichever runs
      // first could otherwise beacon-flush before or after this rollup lands
      // in the queue. Forcing a beacon flush here makes delivery of this
      // rollup event correct regardless of that order.
      flushViaBeacon();
    };
    document.addEventListener("visibilitychange", attemptVisibilityHandler);
  }
}

/**
 * Test-only: clears the lazy timer/listener singleton state so tests can
 * verify the "starts on first attempt" behavior in isolation, without an
 * earlier test's real-timer interval (or visibilitychange listener) silently
 * surviving into a later test. Does NOT touch attemptCounts — only the
 * scheduling state. Not part of the public module contract; only imported
 * from sdkResolverShadow.test.ts.
 */
export function __resetAttemptSchedulingForTests(): void {
  if (attemptFlushTimer) clearInterval(attemptFlushTimer);
  attemptFlushTimer = null;
  if (attemptVisibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", attemptVisibilityHandler);
  }
  attemptVisibilityHandler = null;
}
