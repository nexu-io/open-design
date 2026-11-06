// ---------------------------------------------------------------------------
// Lightweight PostHog client for the studio browser bundle.
// Mirrors `packages/cli/src/telemetry/client.ts` but uses fetch/sendBeacon.
// All calls are fire-and-forget; telemetry must never break the studio UI.
// ---------------------------------------------------------------------------

import { getAnonymousId, hasShownNotice, markNoticeShown } from "./config";
import { browserTelemetryAllowed } from "./policy";
import { getBrowserSystemMeta } from "./system";
import { canaryEventProperties } from "./canary";
import { recordBreadcrumb } from "./breadcrumbs";
import { studioApiFetch } from "../utils/studioApiFetch";

// Write-only PostHog project key, safe to embed in client code.
const POSTHOG_API_KEY = "phc_zjjbX0PnWxERXrMHhkEJWj9A9BhGVLRReICgsfTMmpx";
const POSTHOG_HOST = "https://us.i.posthog.com";
const FLUSH_INTERVAL_MS = 1_000;

type EventProperties = Record<string, string | number | boolean | undefined>;

interface QueuedEvent {
  event: string;
  properties: EventProperties;
  timestamp: string;
}

let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function shouldTrack(): boolean {
  // NOT memoized. policy.ts is explicit that the transports re-ask, and
  // policy.test.ts asserts a mid-session opt-out takes effect at once — but
  // this cached on first call, so a user who opted out in DevTools after one
  // event kept sending `studio_*` and render events for the rest of the tab
  // while `studio:*` correctly stopped. The check is two property reads.
  return browserTelemetryAllowed();
}

export function trackEvent(event: string, properties: EventProperties = {}): void {
  if (!shouldTrack()) return;

  // Every studio event passes through here, so this is the one place that can
  // build a repro trail without asking each call site to opt in.
  recordBreadcrumb(event, properties);

  const sys = getBrowserSystemMeta();
  eventQueue.push({
    event,
    // Canary assignments as `$feature/canary-<name>`, mirroring the CLI so a
    // rollout spanning both surfaces reads as one flag in PostHog. Resolved
    // after the shouldTrack guard, so opted-out users never pay for it.
    properties: { ...properties, ...sys, ...canaryEventProperties() },
    timestamp: new Date().toISOString(),
  });

  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }
  showNoticeOnce();
}

// Fire-and-forget: the queue is cleared before `send()` resolves, so a network
// failure drops the batch rather than retrying. Matches the CLI client's
// design. Do NOT add retry logic here — a retry without cross-batch dedup
// would risk double-counting events on transient PostHog 5xx responses.
function flush(): void {
  if (eventQueue.length === 0) return;
  const distinctId = getAnonymousId();
  const batch = eventQueue.map((e) => ({
    event: e.event,
    // $ip: null tells PostHog to not record the request IP.
    properties: { ...e.properties, $ip: null },
    distinct_id: distinctId,
    timestamp: e.timestamp,
  }));
  eventQueue = [];
  send(`${POSTHOG_HOST}/batch/`, JSON.stringify({ api_key: POSTHOG_API_KEY, batch }));
}

function send(url: string, payload: string): void {
  // Prefer fetch with keepalive (survives page navigation). sendBeacon is a
  // fallback for older runtimes where fetch isn't available.
  try {
    void studioApiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* silent */
    });
    return;
  } catch {
    /* fall through */
  }
  try {
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
  } catch {
    /* silent */
  }
}

function showNoticeOnce(): void {
  if (hasShownNotice()) return;
  markNoticeShown();
  // Intentional one-time consent disclosure (not debug noise): tells users
  // anonymous analytics are on and how to opt out. Kept behind a pragma.
  // eslint-disable-next-line no-console
  console.info(
    "%c[HyperFrames]%c Anonymous studio usage analytics enabled. " +
      "Disable: localStorage.setItem('hyperframes-studio:telemetryDisabled','1') (then reload).",
    "color:#7c3aed;font-weight:bold",
    "color:inherit",
  );
}

// Flush queued events when the tab is being hidden or closed so tail events
// (e.g. a render_start fired moments before the user navigates away) aren't lost.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flush(), { capture: true });
  window.addEventListener("visibilitychange", () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") flush();
  });
}
