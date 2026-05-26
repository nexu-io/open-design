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
  | 'none'
  | 'unknown';

export type TrackingConfigureAvailability =
  | 'available'
  | 'unavailable'
  | 'unknown';

export interface AnalyticsConfigureGlobals {
  has_available_configure_cli: boolean;
  configure_type: TrackingConfigureType;
  configure_availability: TrackingConfigureAvailability;
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
  key: string | null;
  host: string | null;
  installationId?: string | null;
}
