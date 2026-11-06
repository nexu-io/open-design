import { parseProjectHashRoute } from "./projectRouting";
import { resolveStudioDistinctId } from "../telemetry/distinctId";
import { browserTelemetryAllowed } from "../telemetry/policy";
import { canaryEventProperties } from "../telemetry/canary";
import { agentRuntimeProperty } from "../telemetry/agentRuntime";
import { tabIdProperty } from "../telemetry/tabId";
import { studioApiFetch } from "./studioApiFetch";

// PostHog public ingest key — write-only, safe to ship in the client bundle
const POSTHOG_API_KEY = "phc_zjjbX0PnWxERXrMHhkEJWj9A9BhGVLRReICgsfTMmpx";
const POSTHOG_HOST = "https://us.i.posthog.com";
const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_TIMEOUT_MS = 5_000;

interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

interface QueuedEvent {
  event: string;
  properties: EventProperties;
  timestamp: string;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

// Delegates to the single source of truth (telemetry/distinctId.ts) so `studio:*`
// events share one id with `studio_*` / render events, and adopt the CLI's
// distinct_id when the CLI launched Studio.
function getDistinctId(): string {
  return resolveStudioDistinctId();
}

/**
 * This path predates telemetry/config.ts and enforced only its own
 * localStorage key, so `navigator.doNotTrack`, VITE_HYPERFRAMES_NO_TELEMETRY,
 * Vite dev mode and the documented `hyperframes-studio:telemetryDisabled` all
 * failed to silence `studio:*` events. Now one shared policy governs every
 * transport — including the legacy key, which it still honours.
 */
function isEnabled(): boolean {
  return browserTelemetryAllowed();
}

function studioRouteKind(hash: string): "project" | "home" | "other" {
  if (parseProjectHashRoute(hash)) return "project";
  if (hash === "" || hash === "#") return "home";
  return "other";
}

const ROUTE_IDS_KEY = "hyperframes-studio:routeIds";
let routeIds: Map<string, string> | undefined;

function isRouteIdEntry(entry: unknown): entry is [string, string] {
  return (
    Array.isArray(entry) &&
    entry.length === 2 &&
    typeof entry[0] === "string" &&
    typeof entry[1] === "string" &&
    /^[0-9a-f]{8}$/.test(entry[1])
  );
}

function readRouteIds(): Map<string, string> {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(ROUTE_IDS_KEY) ?? "[]");
    return new Map(Array.isArray(stored) ? stored.filter(isRouteIdEntry) : []);
  } catch {
    // Storage may be blocked or corrupt. Keep random IDs in memory instead.
    return new Map();
  }
}

function studioRouteId(hash: string): string {
  routeIds ??= readRouteIds();
  const route = hash.split("?")[0];
  const existing = routeIds.get(route);
  if (existing !== undefined) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  routeIds.set(route, id);
  try {
    sessionStorage.setItem(ROUTE_IDS_KEY, JSON.stringify([...routeIds]));
  } catch {
    // The in-memory map still preserves equality when storage is unavailable.
  }
  return id;
}

function getSessionProperties(): EventProperties {
  return {
    studio_version: typeof __STUDIO_VERSION__ !== "undefined" ? __STUDIO_VERSION__ : "dev",
    // On EVERY event, not just the audio ones. "Which of these sessions was a
    // person and which was an agent" is a question worth asking of any feature,
    // and a property that only some events carry cannot answer it — the
    // breakdown silently reads as though the agent never used the rest.
    agent_runtime: agentRuntimeProperty(),
    // Which page load this came from — distinct_id identifies the browser, not
    // the page, so two tabs are otherwise one indistinguishable stream.
    tab_id: tabIdProperty(),
    screen_width: window.screen?.width,
    screen_height: window.screen?.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    user_agent: navigator.userAgent,
    // Route names and query parameters are user content. Send only the route kind.
    url_hash: studioRouteKind(location.hash),
    url_route_id: studioRouteId(location.hash),
  };
}

declare const __STUDIO_VERSION__: string;

export function trackStudioEvent(event: string, properties: EventProperties = {}): void {
  if (!isEnabled()) return;

  queue.push({
    event: `studio:${event}`,
    // Canary assignments on every event, matching the CLI and the newer
    // studio client — "every telemetry event carries the assignment" has to
    // include this path or a cohort breakdown silently omits `studio:*`.
    properties: { ...getSessionProperties(), ...canaryEventProperties(), ...properties },
    timestamp: new Date().toISOString(),
  });

  if (!flushTimer) {
    flushTimer = setInterval(flushEvents, FLUSH_INTERVAL_MS);
  }
}

/** The queue, shaped for PostHog's batch endpoint — shared by both drain paths. */
function drainBatch() {
  const batch = queue.map((e) => ({
    event: e.event,
    properties: { ...e.properties, $ip: null },
    distinct_id: getDistinctId(),
    timestamp: e.timestamp,
  }));
  queue = [];
  return batch;
}

async function flushEvents(): Promise<void> {
  if (queue.length === 0) return;

  const batch = drainBatch();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);

  try {
    await studioApiFetch(`${POSTHOG_HOST}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_API_KEY, batch }),
      signal: controller.signal,
    });
  } catch {
    // Telemetry must never break the studio
  } finally {
    clearTimeout(timeout);
  }
}

// Synchronously drains the queue via sendBeacon — safe to call from any
// tab-hide handler regardless of listener registration order. Exported so
// other modules (e.g. sdkResolverShadow.ts) can force delivery of an event
// they just queued without racing this module's own visibilitychange
// listener below.
export function flushViaBeacon(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const batch = drainBatch();
  const body = JSON.stringify({ api_key: POSTHOG_API_KEY, batch });
  try {
    navigator.sendBeacon(`${POSTHOG_HOST}/batch/`, body);
  } catch {
    // best-effort
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushViaBeacon();
  });
}
