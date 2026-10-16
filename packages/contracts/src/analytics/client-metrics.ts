import { z } from 'zod';
import { releaseChannelFromVersion } from '@open-design/release';

/** Additive metric revision; historical event_schema_version 2/4 is never rewritten. */
export const CLIENT_METRIC_SCHEMA_VERSION = 1;
const token = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
const time = z.string().datetime({ offset: true });
const measurement = z.number().finite().nonnegative();
const bytes = measurement.int().safe().nullable();
const version = z.string().trim().min(1).max(128)
  .refine((value) => value !== '0.0.0' && value !== 'unknown');

/** Installation identity is not an account. Missing platform capabilities stay null. */
export const clientTelemetryCommonSchema = z.object({
  event_schema_version: z.literal(4),
  event_id: token,
  device_id: token.nullable(),
  app_session_id: token.nullable(),
  user_id: token.optional(),
  client_type: z.enum(['web', 'desktop', 'daemon', 'external_mcp']),
  capture_source: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_/-]+$/),
  env: token,
  channel: token,
  app_version: version.nullable(),
  client_version: version.nullable(),
  platform: token.nullable(),
  // Product OS version (e.g. Electron getSystemVersion), never a Darwin/Linux
  // kernel release relabelled as a product version. Null when unavailable.
  os_version: z.string().min(1).max(128).nullable(),
  arch: token.nullable(),
  occurred_at: time,
  reported_at: time,
});
export type ClientTelemetryCommonParams = z.infer<typeof clientTelemetryCommonSchema>;

const metricCommonSchema = clientTelemetryCommonSchema.extend({
  metric_schema_version: z.literal(CLIENT_METRIC_SCHEMA_VERSION),
  telemetry_capability: z.enum(['supported', 'unsupported', 'unknown']),
});
const launchFields = {
  launch_attempt_id: token,
  startup_type: z.enum(['cold', 'warm', 'reopen']),
  launch_type: z.enum(['cold', 'warm']).optional(),
  // process_entry is NOT icon click time. os_launch requires a real OS timestamp.
  measurement_boundary: z.enum(['process_entry', 'os_launch']),
  started_at: time,
};
const launchAttemptSchema = metricCommonSchema.extend(launchFields);
// Ready means required business data is usable and input/new actions can execute;
// DOM mount, first paint and Navigation Timing alone do not satisfy this contract.
const launchDurations = {
  launch_to_window_shown: measurement.optional(),
  launch_to_first_visible: measurement.optional(),
  launch_to_interactive: measurement.optional(),
  stage_offsets_ms: z.record(measurement).optional(),
  stage_durations_ms: z.record(measurement).optional(),
};
const businessReadySchema = launchAttemptSchema.extend({ duration_ms: measurement, ...launchDurations });
const launchResultSchema = launchAttemptSchema.extend({
  ...launchDurations,
  result: z.enum(['ready', 'failed', 'cancelled', 'unknown']),
  duration_ms: measurement.nullable(),
  reason_code: token.optional(),
}).refine((value) => value.result !== 'ready' || value.duration_ms !== null);
const navigationSchema = metricCommonSchema.extend({
  navigation_id: token,
  navigation_type: z.enum(['project_enter', 'conversation_switch', 'page_switch']),
  source_type: z.enum(['home', 'project', 'conversation', 'page', 'unknown']),
  target_type: z.enum(['home', 'project', 'conversation', 'page']),
  result: z.enum(['started', 'first_visible', 'ready', 'cancelled', 'failed']),
  readiness_point: z.enum(['first_visible', 'interactive_ready']).optional(),
  started_at: time,
  duration_ms: measurement.nullable(),
  reason_code: token.optional(),
}).refine((value) => value.result !== 'ready' || value.duration_ms !== null);
const memorySchema = metricCommonSchema.extend({
  process_role: z.enum(['main', 'renderer', 'gpu', 'utility', 'daemon']),
  // Opaque per-process identifier, never a raw PID or filesystem path.
  process_instance_id: token,
  uptime_ms: measurement,
  rss_bytes: bytes,
  heap_used_bytes: bytes,
  external_bytes: bytes,
  sampled_at: time,
  sampling_interval_ms: z.number().finite().positive(),
});

export const CLIENT_METRIC_SCHEMAS = {
  client_launch_attempt: launchAttemptSchema,
  client_business_ready: businessReadySchema,
  client_launch_result: launchResultSchema,
  client_navigation_result: navigationSchema,
  client_process_memory_sample: memorySchema,
} as const;
export type ClientMetricEventName = keyof typeof CLIENT_METRIC_SCHEMAS;
export type ClientMetricProps<E extends ClientMetricEventName> = z.infer<typeof CLIENT_METRIC_SCHEMAS[E]>;
export type ClientMetricEventPayload = {
  [E in ClientMetricEventName]: { event: E; props: ClientMetricProps<E> }
}[ClientMetricEventName];

export function isClientMetricEventName(event: string): event is ClientMetricEventName {
  return Object.hasOwn(CLIENT_METRIC_SCHEMAS, event);
}

/** Strip undeclared fields: no prompts, content, project paths, PIDs or URLs. */
export function parseClientMetricEvent(event: string, properties: unknown): Record<string, unknown> | null {
  if (!isClientMetricEventName(event)) return null;
  const parsed = CLIENT_METRIC_SCHEMAS[event].safeParse(properties);
  return parsed.success ? parsed.data : null;
}

export interface ClientTelemetryDefaults {
  eventId: string;
  deviceId: string | null;
  appSessionId?: string | null;
  appVersion?: string | null;
  channel?: string;
  clientType: ClientTelemetryCommonParams['client_type'];
  captureSource: string;
  env: string;
  platform?: string | null;
  osVersion?: string | null;
  arch?: string | null;
  occurredAt?: string;
  reportedAt: string;
}

/**
 * Resolve occurrence metadata once, then preserve it during buffering/replay.
 * Receiver owns env and reported_at; occurrence version/channel/session stay
 * with the original event. Unknown is explicit, never a fabricated zero.
 */
export function buildClientTelemetryParams(
  source: Record<string, unknown>, defaults: ClientTelemetryDefaults,
): ClientTelemetryCommonParams {
  const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
  const resolvedVersion = (value: unknown): string | null => {
    const parsed = version.safeParse(value);
    return parsed.success ? parsed.data : null;
  };
  const appVersion = resolvedVersion(source.app_version) ?? resolvedVersion(defaults.appVersion);
  const occurred = time.safeParse(source.occurred_at);
  return {
    event_schema_version: 4,
    event_id: text(source.event_id) ?? defaults.eventId,
    device_id: text(source.device_id) ?? defaults.deviceId,
    app_session_id: text(source.app_session_id) ?? defaults.appSessionId ?? null,
    ...(token.safeParse(source.user_id).success ? { user_id: source.user_id as string } : {}),
    client_type: clientTelemetryCommonSchema.shape.client_type.safeParse(source.client_type).success
      ? source.client_type as ClientTelemetryCommonParams['client_type'] : defaults.clientType,
    capture_source: text(source.capture_source) ?? defaults.captureSource,
    env: defaults.env,
    channel: text(source.channel) ?? defaults.channel
      ?? (appVersion ? releaseChannelFromVersion(appVersion) : null)
      ?? (defaults.env === 'production' && appVersion ? 'stable'
        : defaults.env === 'development' || defaults.env === 'test' ? 'development' : 'unknown'),
    app_version: appVersion,
    client_version: resolvedVersion(source.client_version) ?? appVersion,
    platform: text(source.platform) ?? defaults.platform ?? null,
    os_version: text(source.os_version) ?? defaults.osVersion ?? null,
    arch: text(source.arch) ?? defaults.arch ?? null,
    occurred_at: occurred.success ? occurred.data : defaults.occurredAt ?? defaults.reportedAt,
    reported_at: defaults.reportedAt,
  };
}
