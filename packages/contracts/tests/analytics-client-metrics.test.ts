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

it('validates controlled exit reasons and strips all content from normalized exit metrics', async () => {
  const { classifyProcessExit, processExitMetricFields } = await import('../src/analytics/client-metrics.js');
  for (const [native, reason] of [['crashed', 'crash'], ['oom', 'oom'], ['killed', 'killed'], ['clean-exit', 'clean-exit'], ['recovery-attempt', 'recovery-attempt'], ['anything-else', 'unknown']]) {
    const props = { ...common, ...processExitMetricFields('desktop_renderer_crash', { reason: native, loop_tripped: true }),
      prompt: 'private', pid: 123, path: '/private', url: 'https://private.invalid' };
    const parsed = parseClientMetricEvent('client_process_exit', props);
    expect(parsed).toMatchObject({ reason, launch_attempt_id: null, recovery_suppressed: true });
    for (const field of ['prompt', 'pid', 'path', 'url']) expect(parsed).not.toHaveProperty(field);
    expect(classifyProcessExit(native)).toBe(reason);
  }
});

it('does not replace explicitly unknown prior versions with the reporting version', () => {
  expect(buildClientTelemetryParams({ app_version: null }, { eventId: 'e', deviceId: null, appVersion: '2.0.0',
    clientType: 'daemon', captureSource: 'daemon/safety', env: 'production', reportedAt: common.reported_at, preserveUnknownAppVersion: true })).toMatchObject({ app_version: null, client_version: null });
});

it('admits preview denominators and four results with nullable unknown kind, stripping private fields', () => {
  const fields = { ...common, preview_attempt_id: 'preview-1', render_mode: 'srcdoc',
    artifact_kind: null, started_at: common.occurred_at, url: 'private', prompt: 'private' };
  expect(parseClientMetricEvent('client_preview_attempt', fields)).toMatchObject({ artifact_kind: null });
  for (const result of ['success', 'white_screen', 'error', 'cancelled']) {
    const parsed = parseClientMetricEvent('client_preview_result', { ...fields, result, duration_ms: 200, monitoring_kind: 'visible_content' });
    expect(parsed).not.toBeNull(); expect(parsed).not.toHaveProperty('url'); expect(parsed).not.toHaveProperty('prompt');
  }
  expect(parseClientMetricEvent('client_preview_result', { ...fields, result: 'success', duration_ms: -1 })).toBeNull();
});


it('retains nullable heap limits and opaque exit correlation, stripping private fields', async () => {
  const { processExitMetricFields } = await import('../src/analytics/client-metrics.js');
  for (const heap_limit_bytes of [null, 4096]) {
    expect(parseClientMetricEvent('client_process_memory_sample', { ...memory, heap_limit_bytes }))
      .toMatchObject({ heap_limit_bytes });
  }
  const parsed = parseClientMetricEvent('client_process_exit', { ...common,
    ...processExitMetricFields('daemon_unclean_exit', { reason: 'killed', process_instance_id: 'opaque-boot',
      signal: 'SIGKILL', is_backfill: false, occurrence_time_source: 'observed' }),
    pid: 987654, path: '/private/secret', content: 'secret input' });
  expect(parsed).toMatchObject({ process_instance_id: 'opaque-boot', signal: 'SIGKILL', is_backfill: false });
  for (const key of ['pid', 'path', 'content']) expect(parsed).not.toHaveProperty(key);
});
