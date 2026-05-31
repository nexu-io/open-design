// Wire shape for the cross-process safety-event bridge.
//
// Used by `POST /api/observability/event` so non-renderer surfaces
// (Electron main process, packaged-app helper processes, daemon
// itself in cases where it can't talk to itself in-process) can
// hand a safety event off to the daemon's posthog-node client.
//
// The endpoint intentionally does NOT gate on the user's analytics
// consent — the safety-bypass contract is the same one the web
// error-tracking module relies on for `$exception` events.

export interface ObservabilityEventRequest {
  event: string;
  properties?: Record<string, unknown>;
}

export interface ObservabilityEventResponse {
  ok: true;
}
