// Public params shared by every analytics event. Set automatically by the
// capture helper; per-event properties merge on top.
//
// Bumped only on breaking changes to the public-param shape or P0 event
// semantics. Adding a new optional prop, or a new event name, does NOT bump.
export const EVENT_SCHEMA_VERSION = 1;

export type AnalyticsClientType = 'web' | 'desktop';

export interface AnalyticsPublicParams {
  event_id: string;
  request_id?: string;
  event_schema_version: number;
  ui_version: string;
  session_id: string;
  anonymous_id: string;
  user_id?: string;
  client_type: AnalyticsClientType;
  app_version: string;
  locale: string;
}

// Wire format used between web and daemon to bridge identity. Web sets these
// on every fetch/SSE request; daemon reads them off req.headers when emitting
// server-side events so the distinct_id matches.
export const ANALYTICS_HEADER_ANONYMOUS_ID = 'x-od-analytics-anonymous-id';
export const ANALYTICS_HEADER_SESSION_ID = 'x-od-analytics-session-id';
export const ANALYTICS_HEADER_CLIENT_TYPE = 'x-od-analytics-client-type';
export const ANALYTICS_HEADER_LOCALE = 'x-od-analytics-locale';
export const ANALYTICS_HEADER_REQUEST_ID = 'x-od-analytics-request-id';

// Daemon serves the PostHog public config so the web bundle never embeds the
// key at build time; loading via /api/analytics/config keeps POSTHOG_KEY /
// POSTHOG_HOST as the single source of truth. The endpoint reports
// enabled=true only when BOTH a key is present AND the user has consented
// via Privacy → "Share usage data" (telemetry.metrics).
//
// installationId is echoed back so the web client uses the same anonymous
// id Langfuse already keys off of — one anonymous identity per install,
// shared between both telemetry sinks. Null when consent is declined.
export interface AnalyticsConfigResponse {
  enabled: boolean;
  key: string | null;
  host: string | null;
  installationId?: string | null;
}
