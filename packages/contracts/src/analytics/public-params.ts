// Public params shared by every analytics event. Set automatically by the
// capture helper; per-event properties merge on top.
//
// Bumped on breaking changes to the public-param shape or event semantics.
// v2 (2026-05-19): events collapsed to page_view / ui_click / surface_view /
// *_result; `anonymous_id` renamed to `device_id`; the configure-state
// triplet (has_available_configure_cli / configure_type /
// configure_availability) is promoted to a globally registered property so
// every event inherits it.
export const EVENT_SCHEMA_VERSION = 2;

export type AnalyticsClientType = 'web' | 'desktop';

export interface AnalyticsPublicParams {
  event_id: string;
  request_id?: string;
  event_schema_version: number;
  env: string;
  ui_version: string;
  session_id: string;
  // v2 rename: was `anonymous_id` in schema v1. The value is still the
  // daemon-issued installationId (or a local-UUID fallback before consent),
  // identical to PostHog's distinct_id. Only the wire-format key changed.
  device_id: string;
  user_id?: string;
  client_type: AnalyticsClientType;
  app_version: string;
  locale: string;
}

// Configure-state triplet — registered globally on the PostHog client and
// re-registered when the user's execution-mode config changes (mode switch,
// BYOK key save, CLI rescan). Lives here, not in per-event prop types, so
// every event automatically inherits the latest state.
export type TrackingConfigureType =
  | 'local_cli'
  | 'byok'
  | 'both'
  // AMR sign-in is the user's only configured generation path — no local
  // CLI detected and no BYOK key saved. Counts toward the "configured"
  // funnel stage alongside local_cli/byok/both.
  | 'amr'
  | 'none'
  | 'unknown';

export type TrackingConfigureAvailability =
  | 'available'
  | 'unavailable'
  | 'unknown';

// The single execution runtime the user is set up to run with right now.
// Unlike `configure_type` — a capability cascade that can report `both` when
// a user configured more than one path — a runtime is mutually exclusive per
// run, so there is no `both`. This is the field dashboards segment the
// behavioural funnel by (AMR / BYOK / CLI). `amr_cloud` is AMR sign-in,
// `byok` is the user's own key (web-only visibility — see the daemon note in
// `AnalyticsConfigureGlobals`), `local_cli` is a detected local coding CLI.
export type TrackingRuntimeType =
  | 'amr_cloud'
  | 'byok'
  | 'local_cli'
  | 'none';

export interface AnalyticsConfigureGlobals {
  has_available_configure_cli: boolean;
  configure_type: TrackingConfigureType;
  configure_availability: TrackingConfigureAvailability;
  // Active execution runtime (see TrackingRuntimeType). Registered globally
  // like the rest of this triplet so client-side events (page_view/ui_click/
  // *_result emitted from the web) inherit it. Daemon-side run_created/
  // run_finished cannot see a saved BYOK key, so they derive a best-effort
  // value here and let the web client override it via the run request's
  // analytics hints (`ChatAnalyticsHints.runtimeType`) — the client is the
  // only layer that knows BYOK vs amr_cloud for the run it launched.
  runtime_type: TrackingRuntimeType;
  // Per-path "reached a runnable/usable state" flags. Unlike `configure_type`
  // — a single priority cascade (both > local_cli > byok > amr) where a value
  // masks the lower-priority paths — these three are INDEPENDENT booleans, so
  // a user with both a CLI and a saved BYOK key reports `cli_runnable: true`
  // AND `byok_runnable: true`. Dashboards split per-path activation off these
  // without the cascade undercounting AMR/BYOK whenever a CLI is also present.
  //
  // `cli_runnable` is intentionally the same signal as
  // `has_available_configure_cli` (an installed, available non-AMR CLI); it is
  // restated here only to give the runnable-trio a symmetric shape.
  //
  // Caveat for dashboards: these flag a *runnable state*, not an active
  // configuration action. `cli_runnable` in particular fires when a coding CLI
  // is merely detected on PATH (common for our dev audience), so it overstates
  // "the user configured something". For "actively configured & succeeded",
  // count the success result events instead — `settings_cli_test_result`,
  // `settings_byok_test_result`, `amr_auth_result` with `result: 'success'`.
  cli_runnable: boolean;
  byok_runnable: boolean;
  amr_runnable: boolean;
}

// Wire format used between web and daemon to bridge identity. Web sets these
// on every fetch/SSE request; daemon reads them off req.headers when emitting
// server-side events so the distinct_id matches.
export const ANALYTICS_HEADER_DEVICE_ID = 'x-od-analytics-device-id';
export const ANALYTICS_HEADER_SESSION_ID = 'x-od-analytics-session-id';
export const ANALYTICS_HEADER_CLIENT_TYPE = 'x-od-analytics-client-type';
export const ANALYTICS_HEADER_LOCALE = 'x-od-analytics-locale';
export const ANALYTICS_HEADER_REQUEST_ID = 'x-od-analytics-request-id';

// Daemon serves the PostHog public config so the web bundle never embeds the
// key at build time; loading via /api/analytics/config keeps POSTHOG_KEY /
// POSTHOG_HOST as the single source of truth.
//
//   `enabled` reflects ONLY the user's analytics consent toggle (Privacy →
//   "Share usage data"). When false, posthog-js full autocapture
//   ($pageview, $autocapture, $dead_click, web vitals, etc.) must stay off
//   — that's the privacy contract.
//
//   `key` and `host` are populated whenever the build has POSTHOG_KEY,
//   regardless of consent. The error-tracking module reads them directly
//   to ship `$exception` events even when the user has opted out of
//   general analytics — error reports flow unconditionally so we don't
//   lose ground truth on stability. Forks / PR builds without
//   POSTHOG_KEY get `key: null` and `host: null`, which fully disables
//   both pipelines.
//
//   `installationId` is the anonymous id Langfuse and PostHog both key
//   off of. Echoed when present so the web client uses the same anonymous
//   identity PostHog already saw on prior runs.
export interface AnalyticsConfigResponse {
  enabled: boolean;
  env: string;
  key: string | null;
  host: string | null;
  installationId?: string | null;
}
