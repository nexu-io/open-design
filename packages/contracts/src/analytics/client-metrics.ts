import { z } from 'zod';
import {
  responsivenessWindowFields, inputResponsivenessFields,
  scrollFrameFields, responsivenessRecoveryFields,
} from './client-observability.js';
import { releaseChannelFromVersion } from '@open-design/release';
import { updateStageMetricFields } from './update-lifecycle.js';

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
  source_page: token.optional(),
  target_page: token.optional(),
}).refine((value) => value.result !== 'ready' || value.duration_ms !== null);

// Additive v1 event family: no change to the historical safety-event schema.
const previewAttemptSchema = metricCommonSchema.extend({
  preview_attempt_id: token,
  render_mode: z.enum(['srcdoc', 'url_load', 'live_artifact']),
  artifact_kind: token.nullable(),
  started_at: time,
});
const previewResultSchema = previewAttemptSchema.extend({
  result: z.enum(['success', 'white_screen', 'error', 'cancelled']),
  duration_ms: measurement.nullable(),
  monitoring_kind: z.enum(['visible_content', 'no_visible_paint_after_timeout', 'srcdoc_transport_unverified', 'preview_error', 'left_or_hidden', 'probe_unverified']),
});
const memorySchema = metricCommonSchema.extend({
  process_role: z.enum(['main', 'renderer', 'gpu', 'utility', 'daemon']),
  // Opaque per-process identifier, never a raw PID or filesystem path.
  process_instance_id: token,
  uptime_ms: measurement,
  rss_bytes: bytes,
  heap_used_bytes: bytes,
  heap_limit_bytes: bytes.optional(),
  external_bytes: bytes,
  sampled_at: time,
  sampling_interval_ms: z.number().finite().positive(),
});

/** Native evidence only: an absent checkpoint is never evidence of OOM. */
export function classifyProcessExit(reason: unknown): 'crash' | 'oom' | 'killed' | 'clean-exit' | 'recovery-attempt' | 'unknown' {
  if (reason === 'crashed' || reason === 'crash' || reason === 'abnormal-exit' || reason === 'fatal_error') return 'crash';
  if (reason === 'oom' || reason === 'killed' || reason === 'clean-exit' || reason === 'recovery-attempt') return reason;
  return 'unknown';
}

export const PROCESS_EXIT_EVENTS = ['desktop_renderer_crash', 'desktop_child_process_crash', 'desktop_unclean_exit', 'daemon_unclean_exit', 'packaged_runtime_failed'] as const;
export function isProcessExitEventName(event: string): boolean {
  return (PROCESS_EXIT_EVENTS as readonly string[]).includes(event);
}

const processExitSchema = metricCommonSchema.extend({
  launch_attempt_id: token.nullable(),
  process_instance_id: token.nullable().optional(),
  signal: z.string().max(24).regex(/^SIG[A-Z0-9]+$/).nullable().optional(),
  previous_app_version: version.nullable(),
  process_role: z.enum(['main', 'renderer', 'gpu', 'utility', 'daemon', 'web', 'unknown']),
  reason: z.enum(['crash', 'oom', 'killed', 'clean-exit', 'recovery-attempt', 'unknown']),
  source_event: z.enum(PROCESS_EXIT_EVENTS),
  exit_code: z.number().int().nullable(),
  recovery_suppressed: z.boolean(),
  occurrence_time_source: z.enum(['observed', 'last_checkpoint', 'unknown']),
  is_backfill: z.boolean(),
});

/** Controlled projection for the new metric; legacy payloads remain compatible. */
export function processExitMetricFields(event: string, props: Record<string, unknown>): Record<string, unknown> {
  const backfill = event === 'desktop_unclean_exit' || event === 'daemon_unclean_exit';
  const priorVersion = version.safeParse(props.previous_app_version ?? props.previous_version);
  const role = event === 'desktop_renderer_crash' ? 'renderer' : event === 'daemon_unclean_exit' ? 'daemon'
    : event === 'desktop_child_process_crash' ? props.process_type === 'GPU' ? 'gpu' : props.process_type === 'Utility' ? 'utility' : 'unknown'
    : event === 'packaged_runtime_failed' ? props.failure_kind === 'daemon-start' ? 'daemon' : props.failure_kind === 'web-start' ? 'web' : 'unknown' : 'main';
  return {
    metric_schema_version: CLIENT_METRIC_SCHEMA_VERSION, telemetry_capability: 'supported',
    launch_attempt_id: props.launch_attempt_id ?? null,
    previous_app_version: backfill && priorVersion.success ? priorVersion.data : null,
    process_role: role, reason: classifyProcessExit(props.exit_reason ?? props.reason ?? props.exit_class),
    source_event: event, exit_code: typeof props.exit_code === 'number' ? props.exit_code : null,
    recovery_suppressed: props.recovery_suppressed === true || props.loop_tripped === true,
    occurrence_time_source: props.occurrence_time_source ?? (backfill ? 'unknown' : 'observed'),
    is_backfill: typeof props.is_backfill === 'boolean' ? props.is_backfill : backfill,
    ...(props.process_instance_id !== undefined ? { process_instance_id: props.process_instance_id } : {}),
    ...(props.signal !== undefined ? { signal: props.signal } : {}),
  };
}

export const CLIENT_METRIC_SCHEMAS = {
  client_process_exit: processExitSchema,
  client_update_stage_result: metricCommonSchema.extend(updateStageMetricFields),
  client_responsiveness_window: metricCommonSchema.extend(responsivenessWindowFields),
  client_input_responsiveness: metricCommonSchema.extend(inputResponsivenessFields)
    .extend({ aggregation_page_id: token.optional(), input_trial_id: token.optional(), input_trial_revision: token.optional() })
    .refine((value) => value.over_500ms_count <= value.qualified_sample_count),
  client_input_responsiveness_summary: metricCommonSchema.extend({
    area: z.enum(['settings', 'search']),
    aggregation_page_id: token,
    input_trial_id: token.optional(), input_trial_revision: token.optional(),
    period_ms: z.union([z.literal(300_000), z.literal(600_000)]),
    window_start: time, window_end: time,
    flush_reason: z.enum(['window', 'pagehide', 'hidden', 'identity_change', 'recovery']),
    source_event_count: z.number().int().positive().safe(),
    source_window_ms: measurement,
    input_attempt_count: inputResponsivenessFields.input_attempt_count,
    qualified_sample_count: inputResponsivenessFields.qualified_sample_count,
    over_500ms_count: inputResponsivenessFields.over_500ms_count,
    max_input_to_presentation_ms: inputResponsivenessFields.max_input_to_presentation_ms,
    max_queue_delay_ms: inputResponsivenessFields.max_queue_delay_ms,
    sample_floor_ms: z.literal(16),
  }).refine((value) => value.over_500ms_count <= value.qualified_sample_count
    && Date.parse(value.window_end) - Date.parse(value.window_start) === value.period_ms),
  client_input_aggregation_status: metricCommonSchema.extend({
    aggregation_page_id: token, input_trial_id: token, input_trial_revision: token,
    mode: z.enum(['shadow', 'drain', 'paused']), persistence_ready: z.boolean(),
    stopped_reason: token.nullable(),
    committed_inputs: z.number().int().nonnegative().safe(),
    accepted_events: z.number().int().nonnegative().safe(),
    retry_count: z.number().int().nonnegative().safe(),
    collecting_records: z.number().int().nonnegative().max(4),
    raw_pending: z.number().int().nonnegative().max(1024),
    active_summaries: z.number().int().nonnegative().max(4),
    pending_summaries: z.number().int().nonnegative().max(512),
    oldest_pending_age_ms: measurement.nullable(),
  }),
  client_chat_scroll_frames: metricCommonSchema.extend(scrollFrameFields),
  client_responsiveness_recovery: metricCommonSchema.extend(responsivenessRecoveryFields),
  client_launch_attempt: launchAttemptSchema,
  client_business_ready: businessReadySchema,
  client_launch_result: launchResultSchema,
  client_navigation_result: navigationSchema,
  client_process_memory_sample: memorySchema,
  client_preview_attempt: previewAttemptSchema,
  client_preview_result: previewResultSchema,
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
  /** Exit replay can retain explicit unknown versions without changing legacy defaults. */
  preserveUnknownAppVersion?: boolean;
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
  const appVersion = defaults.preserveUnknownAppVersion && source.app_version === null ? null : resolvedVersion(source.app_version) ?? resolvedVersion(defaults.appVersion);
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
