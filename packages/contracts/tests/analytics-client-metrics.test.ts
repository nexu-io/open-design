import { describe, expect, it } from 'vitest';
import type { AnalyticsEventPayload } from '../src/analytics/events.js';
import { parseClientMetricEvent, buildClientTelemetryParams } from '../src/analytics/client-metrics.js';

const common = {
  event_schema_version: 4, metric_schema_version: 1,
  event_id: 'event-1', device_id: 'install-1', app_session_id: 'app-1',
  client_type: 'desktop', capture_source: 'desktop/main', env: 'production',
  channel: 'beta', app_version: '1.2.3-beta.1', client_version: '1.2.3-beta.1',
  platform: 'darwin', os_version: '25.0.0', arch: 'arm64',
  occurred_at: '2026-10-16T01:00:00.000Z', reported_at: '2026-10-16T02:00:00.000Z',
  telemetry_capability: 'supported',
};
const launch = {
  ...common, launch_attempt_id: 'launch-1', startup_type: 'cold',
  measurement_boundary: 'process_entry', started_at: common.occurred_at,
};
const memory = {
  ...common, process_role: 'main', process_instance_id: 'process-1', uptime_ms: 60_000,
  rss_bytes: 4096, heap_used_bytes: null, external_bytes: null,
  sampled_at: common.occurred_at, sampling_interval_ms: 60_000,
};

describe('CS01 client metric contracts', () => {
  it('registers launch, business Ready, launch result, navigation and memory', () => {
    const events = [
      { event: 'client_launch_attempt', props: launch },
      { event: 'client_business_ready', props: { ...launch, duration_ms: 1200 } },
      { event: 'client_launch_result', props: { ...launch, result: 'ready', duration_ms: 1200 } },
      { event: 'client_navigation_result', props: {
        ...common, navigation_id: 'nav-1', navigation_type: 'project_enter',
        source_type: 'home', target_type: 'project', result: 'cancelled',
        started_at: common.occurred_at, duration_ms: 100,
      } },
      { event: 'client_process_memory_sample', props: memory },
    ];
    for (const event of events) expect(parseClientMetricEvent(event.event, event.props)).not.toBeNull();
    // The same discriminants must be reachable from the public typed registry.
    const registered: AnalyticsEventPayload['event'][] = [
      'client_launch_attempt', 'client_business_ready', 'client_launch_result',
      'client_navigation_result', 'client_process_memory_sample',
    ];
    expect(registered).toHaveLength(events.length);
  });

  it.each(['main', 'renderer', 'gpu', 'utility', 'daemon'])('accepts %s samples with unsupported values explicitly null', (process_role) => {
    expect(parseClientMetricEvent('client_process_memory_sample', {
      ...memory, process_role, rss_bytes: null, telemetry_capability: 'unsupported',
    })).not.toBeNull();
  });

  it('rejects invalid measurements, unsupported enum values and missing correlation', () => {
    for (const patch of [
      { rss_bytes: -1 }, { heap_used_bytes: Number.NaN }, { external_bytes: undefined },
      { sampling_interval_ms: 0 }, { process_instance_id: '' }, { process_role: 'browser' },
      { sampled_at: 'yesterday' }, { device_id: undefined }, { metric_schema_version: 2 },
    ]) expect(parseClientMetricEvent('client_process_memory_sample', { ...memory, ...patch })).toBeNull();
    expect(parseClientMetricEvent('client_business_ready', { ...launch, duration_ms: null })).toBeNull();
    expect(parseClientMetricEvent('client_launch_result', { ...launch, result: 'success', duration_ms: 1 })).toBeNull();
  });

  it('projects only declared metadata, never content, URLs or paths', () => {
    const parsed = parseClientMetricEvent('client_process_memory_sample', {
      ...memory, prompt: 'private input', url: 'https://private.invalid/a?q=secret', pid: 123,
    });
    expect(parsed).toEqual(memory);
    expect(parseClientMetricEvent('client_launch_attempt', { ...launch, launch_attempt_id: '/private/path' })).toBeNull();
  });

  it('keeps occurrence identity/version across replay and distinguishes report time', () => {
    expect(buildClientTelemetryParams(common, {
      eventId: 'new-id', deviceId: 'install-1', appSessionId: 'current-session',
      appVersion: '2.0.0', channel: 'stable', clientType: 'daemon',
      captureSource: 'daemon/safety', env: 'production',
      reportedAt: '2026-10-16T03:00:00.000Z',
    })).toMatchObject({
      event_id: 'event-1', app_session_id: 'app-1', app_version: '1.2.3-beta.1',
      client_version: '1.2.3-beta.1', channel: 'beta', client_type: 'desktop',
      occurred_at: common.occurred_at, reported_at: '2026-10-16T03:00:00.000Z',
    });
  });
});
