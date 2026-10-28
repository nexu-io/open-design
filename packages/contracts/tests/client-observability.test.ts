import { expect, it } from 'vitest';
import { buildClientTelemetryParams, parseClientMetricEvent } from '../src/analytics/client-metrics.js';
const common = {
  ...buildClientTelemetryParams({}, { eventId: 'event-test', deviceId: 'install-test', clientType: 'web', captureSource: 'web/error-tracking', env: 'test', reportedAt: '2026-10-19T00:00:00.000Z' }),
  metric_schema_version: 1, telemetry_capability: 'supported',
};
it('admits responsiveness fields through the common parser and strips private extras', () => {
  const parsed = parseClientMetricEvent('client_input_responsiveness', { ...common, area: 'composer', window_ms: 30_000, input_attempt_count: 40, qualified_sample_count: 10, over_500ms_count: 2, max_input_to_presentation_ms: 504, max_queue_delay_ms: 100, sample_floor_ms: 16, prompt: 'private', url: 'https://private.test', pid: 123 });
  expect(parsed).toMatchObject({ event_schema_version: 4, metric_schema_version: 1, qualified_sample_count: 10 });
  expect(parsed).not.toHaveProperty('prompt'); expect(parsed).not.toHaveProperty('url'); expect(parsed).not.toHaveProperty('pid');
});
it('preserves null unmeasurable counts and rejects negative counts', () => {
  const fields = { ...common, measurement: 'long_task', measurable: false, unavailable_reason: 'background_or_sleep', window_ms: null, long_task_count: null, severe_task_count: null, max_duration_ms: null };
  expect(parseClientMetricEvent('client_responsiveness_window', fields)).toMatchObject({ long_task_count: null });
  expect(parseClientMetricEvent('client_responsiveness_window', { ...fields, long_task_count: -1 })).toBeNull();
});

it('admits recovery and frame summaries without conflating them with a frozen event', () => {
  expect(parseClientMetricEvent('client_responsiveness_recovery', {
    ...common, recovery_id: 'recovery-test', previous_occurred_at: '2026-10-18T00:00:00.000Z',
    duration_ms: null, severe_task_count: 0, reason: 'unclean_exit_unknown',
  })).toMatchObject({ duration_ms: null, reason: 'unclean_exit_unknown' });
  expect(parseClientMetricEvent('client_chat_scroll_frames', {
    ...common, measurable: true, window_ms: 30_000, frame_count: 3,
    interval_count: 2, over_50ms_count: 1, max_frame_interval_ms: 80,
    sampling_truncated: false, frozen: true,
  })).not.toHaveProperty('frozen');
  expect(parseClientMetricEvent('client_chat_scroll_frozen', common)).toBeNull();
});

it('rejects slow counts that exceed the qualified sample denominator', () => {
  expect(parseClientMetricEvent('client_input_responsiveness', {
    ...common, area: 'composer', window_ms: 30_000, input_attempt_count: 1,
    qualified_sample_count: 0, over_500ms_count: 1,
    max_input_to_presentation_ms: 600, max_queue_delay_ms: null, sample_floor_ms: 16,
  })).toBeNull();
});
