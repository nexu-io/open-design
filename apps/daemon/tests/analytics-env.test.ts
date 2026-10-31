import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const posthogCapture = vi.hoisted(() => vi.fn());
const posthogGroupIdentify = vi.hoisted(() => vi.fn());
const posthogShutdown = vi.hoisted(() => vi.fn(async () => undefined));
const posthogCtor = vi.hoisted(() =>
  vi.fn(function PostHogMock(_key: string, _options?: Record<string, unknown>) {
    return {
      capture: posthogCapture,
      groupIdentify: posthogGroupIdentify,
      on: vi.fn(),
      shutdown: posthogShutdown,
    };
  }),
);

vi.mock('posthog-node', () => ({
  PostHog: posthogCtor,
}));

describe('analytics telemetry environment', () => {
  it('exposes the telemetry env in public analytics config', async () => {
    const { readPublicConfigResponse } = await import('../src/analytics.js');

    expect(readPublicConfigResponse({
      POSTHOG_KEY: 'phc_test',
      OD_TELEMETRY_ENV: 'local_development',
    })).toMatchObject({
      enabled: true,
      env: 'local_development',
      key: 'phc_test',
    });
  });

  it('enables GeoIP so daemon events get user country from their real IP', async () => {
    // posthog-node defaults disableGeoip:true (it assumes a datacenter
    // deployment). The daemon runs on the user's own machine, so its
    // ingestion IP is the user's real public IP and country enrichment is
    // accurate — the service must explicitly opt back in or every
    // daemon-emitted event lands in the null-country bucket.
    posthogCtor.mockClear();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-analytics-geoip-'));
    const { createAnalyticsService } = await import('../src/analytics.js');
    createAnalyticsService({
      dataDir,
      env: { POSTHOG_KEY: 'phc_test', OD_TELEMETRY_ENV: 'local_development' },
    });

    expect(posthogCtor).toHaveBeenCalledTimes(1);
    expect(posthogCtor.mock.calls[0]?.[1]).toMatchObject({ disableGeoip: false });
  });

  it('stamps daemon PostHog captures with env', async () => {
    posthogCapture.mockReset();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-analytics-env-'));
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      installationId: 'install-1',
      telemetry: { metrics: true },
    }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const analytics = createAnalyticsService({
      dataDir,
      env: {
        POSTHOG_KEY: 'phc_test',
        OD_TELEMETRY_ENV: 'local_development',
      },
    });

    const delivery = await analytics.capture({
      eventName: 'unit_event',
      appVersion: '1.2.3',
      context: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'web',
        locale: 'en',
        requestId: null,
      },
      insertId: 'insert-1',
      properties: {},
    });

    await vi.waitFor(() => {
      expect(posthogCapture).toHaveBeenCalled();
    });
    expect(posthogCapture.mock.calls[0]?.[0]).toMatchObject({
      event: 'unit_event',
      properties: {
        env: 'local_development',
      },
    });
    expect(delivery).toEqual({
      status: 'queued',
      acknowledgement: 'local_buffer',
      errorType: null,
    });
  });

  it('updates a workspace group only when analytics consent is enabled', async () => {
    posthogGroupIdentify.mockReset();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-analytics-group-'));
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      installationId: 'install-1',
      telemetry: { metrics: true },
    }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const analytics = createAnalyticsService({
      dataDir,
      env: { POSTHOG_KEY: 'phc_test', OD_TELEMETRY_ENV: 'local_development' },
    });

    await analytics.identifyGroup({
      context: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'web',
        locale: 'en',
        requestId: null,
      },
      groupType: 'workspace',
      groupKey: 'workspace-1',
      properties: { member_count: 3, project_count: 8, ignored: null },
    });

    expect(posthogGroupIdentify).toHaveBeenCalledWith({
      groupType: 'workspace',
      groupKey: 'workspace-1',
      distinctId: 'device-1',
      properties: { member_count: 3, project_count: 8 },
    });
  });

  it('returns a bounded enqueue failure without exposing the thrown error', async () => {
    posthogCapture.mockReset();
    posthogCapture.mockImplementationOnce(() => {
      throw new Error('network path and private details');
    });
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-analytics-enqueue-failure-'));
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      telemetry: { metrics: true },
    }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const analytics = createAnalyticsService({
      dataDir,
      env: { POSTHOG_KEY: 'phc_test' },
    });

    await expect(analytics.capture({
      eventName: 'run_finished',
      appVersion: '1.2.3',
      context: {
        deviceId: 'device-1', sessionId: 'session-1', clientType: 'web',
        locale: 'en', requestId: null,
      },
      insertId: 'insert-1',
      properties: {},
    })).resolves.toEqual({
      status: 'failed', acknowledgement: 'none', errorType: 'enqueue_failed',
    });
  });

  it('reports metrics opt-out as not expected rather than a delivery failure', async () => {
    posthogCapture.mockReset();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-analytics-consent-off-'));
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      telemetry: { metrics: false },
    }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const analytics = createAnalyticsService({
      dataDir,
      env: { POSTHOG_KEY: 'phc_test' },
    });

    await expect(analytics.capture({
      eventName: 'run_finished',
      appVersion: '1.2.3',
      context: {
        deviceId: 'device-1', sessionId: 'session-1', clientType: 'web',
        locale: 'en', requestId: null,
      },
      insertId: 'insert-1',
      properties: {},
    })).resolves.toEqual({
      status: 'not_expected',
      acknowledgement: 'none',
      errorType: 'metrics_consent_disabled',
    });
    expect(posthogCapture).not.toHaveBeenCalled();
  });
});


describe('CS01 capture channel and shared identity', () => {
  it.each([
    [{ OD_APP_VERSION: '1.2.3-beta.1' }, 'production', 'beta', '1.2.3-beta.1'],
    [{ OD_APP_VERSION: '1.2.3-prerelease.1' }, 'production', 'prerelease', '1.2.3-prerelease.1'],
    [{ OD_APP_VERSION: '1.2.3' }, 'production', 'stable', '1.2.3'],
    [{ OD_APP_VERSION: '1.2.3', OD_TELEMETRY_ENV: 'qa' }, 'qa', 'stable', '1.2.3'],
    [{ NODE_ENV: 'development' }, 'development', 'development', '1.2.3'],
    [{ NODE_ENV: 'test' }, 'test', 'development', '1.2.3'],
  ])('reports %j consistently in config, metrics and safety', async (env, expectedEnv, channel, version) => {
    posthogCapture.mockReset();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-cs01-channel-'));
    try {
      await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
        installationId: 'install-1', telemetry: { metrics: true },
      }));
      const { createAnalyticsService, readPublicConfigResponse } = await import('../src/analytics.js');
      const settings = { ...env, POSTHOG_KEY: 'phc_test' };
      expect(readPublicConfigResponse(settings, false).env).toBe(expectedEnv);
      const analytics = createAnalyticsService({ dataDir, env: settings, packagedRuntime: false });
      const context = {
        deviceId: 'install-1', sessionId: 'session-1', clientType: 'desktop' as const,
        locale: 'en', requestId: null,
      };
      await analytics.capture({ eventName: 'unit_event', context, appVersion: version, properties: {}, insertId: 'event-1' });
      await analytics.captureSafety({ eventName: 'daemon_health', appVersion: version, properties: {}, insertId: 'event-2' });
      expect(posthogCapture).toHaveBeenCalledTimes(2);
      for (const [call] of posthogCapture.mock.calls) {
        expect(call.properties).toMatchObject({
          env: expectedEnv, channel, app_version: version, client_version: version,
          device_id: 'install-1', event_id: call.properties.$insert_id,
          occurred_at: expect.any(String), reported_at: expect.any(String),
          os_version: process.platform === 'win32' ? expect.any(String) : null, arch: process.arch,
        });
      }
      expect(posthogCapture.mock.calls[0]?.[0].properties.app_session_id).toBe('session-1');
      await analytics.capture({
        eventName: 'unit_event', context: { ...context, sessionId: context.deviceId },
        appVersion: version, properties: {}, insertId: 'event-3',
      });
      // The legacy missing-session fallback is installationId, not an app session.
      expect(posthogCapture.mock.calls[2]?.[0].properties.app_session_id).toBeNull();
      await analytics.shutdown();
    } finally { await rm(dataDir, { recursive: true, force: true }); }
  });
});

it('fills missing capture versions from packaged metadata and preserves original metric attribution on replay', async () => {
  posthogCapture.mockReset();
  const dataDir = await mkdtemp(path.join(tmpdir(), 'od-cs01-replay-'));
  try {
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({ installationId: 'install-1', telemetry: { metrics: true } }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const analytics = createAnalyticsService({ dataDir, env: {
      POSTHOG_KEY: 'phc_test', OD_APP_VERSION: '2.0.0',
    } });
    await analytics.captureSafety({ eventName: 'daemon_health', appVersion: 'unknown', properties: {} });
    expect(posthogCapture.mock.calls[0]?.[0].properties).toMatchObject({ app_version: '2.0.0', client_version: '2.0.0' });
    const properties = {
      metric_schema_version: 1, event_id: 'old-event', app_session_id: 'old-session',
      app_version: '1.0.0-beta.1', client_version: '1.0.0-beta.1', channel: 'beta',
      capture_source: 'desktop/main', client_type: 'desktop',
      occurred_at: '2026-10-16T01:00:00.000Z', telemetry_capability: 'supported',
      process_role: 'main', process_instance_id: 'old-process', uptime_ms: 60_000,
      rss_bytes: 4096, heap_used_bytes: null, external_bytes: null,
      sampled_at: '2026-10-16T01:00:00.000Z', sampling_interval_ms: 60_000,
      prompt: 'private input', full_url: 'https://private.invalid',
    };
    for (let i = 0; i < 2; i++) {
      await analytics.captureSafety({ eventName: 'client_process_memory_sample', appVersion: '2.0.0', properties });
    }
    for (const [call] of posthogCapture.mock.calls.slice(1)) {
      expect(call).toMatchObject({ distinctId: 'install-1', properties: {
        event_id: 'old-event', $insert_id: 'old-event', app_session_id: 'old-session',
        app_version: '1.0.0-beta.1', channel: 'beta', client_type: 'desktop',
        occurred_at: properties.occurred_at, reported_at: expect.any(String),
      } });
      expect(call.properties).not.toHaveProperty('prompt');
      expect(call.properties).not.toHaveProperty('full_url');
    }
    expect(posthogCapture).toHaveBeenCalledTimes(3);
    await analytics.shutdown();
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});



it.each(['{"telemetry":{"metrics":false}', 'null', '[]'])(
  'keeps memory safety captures private after saved opt-out is damaged: %s', async (damaged) => {
    posthogCapture.mockReset();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-memory-damaged-consent-'));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const service = createAnalyticsService({ dataDir, env: { POSTHOG_KEY: 'phc_test' } });
    const properties = {
      metric_schema_version: 1, telemetry_capability: 'supported',
      event_id: 'event-1', app_session_id: 'session-1',
      process_role: 'main', process_instance_id: 'process-1', uptime_ms: 60_000,
      rss_bytes: 4096, heap_used_bytes: null, external_bytes: null,
      sampled_at: '2026-10-16T01:00:00.000Z', sampling_interval_ms: 60_000,
      path: '/private', url: 'https://private.invalid', content: 'secret', prompt: 'secret', pid: 123,
    };
    try {
      const file = path.join(dataDir, 'app-config.json');
      await writeFile(file, JSON.stringify({ installationId: 'install-1', telemetry: { metrics: false } }));
      await service.captureSafety({ eventName: 'client_process_memory_sample', appVersion: '1.0.0', properties });
      expect(posthogCapture).toHaveBeenCalledTimes(1);
      await writeFile(file, damaged);
      await service.captureSafety({ eventName: 'client_process_memory_sample', appVersion: '1.0.0', properties });
      expect(posthogCapture).toHaveBeenCalledTimes(2);
      // Safety delivery also survives a repaired explicit opt-in.
      await writeFile(file, JSON.stringify({ installationId: 'install-1', telemetry: { metrics: true } }));
      await service.captureSafety({ eventName: 'client_process_memory_sample', appVersion: '1.0.0', properties });
      expect(posthogCapture).toHaveBeenCalledTimes(3);
      for (const [call] of posthogCapture.mock.calls) for (const key of ['path', 'url', 'content', 'prompt', 'pid']) expect(call.properties).not.toHaveProperty(key);
    } finally { await service.shutdown(); await rm(dataDir, { recursive: true, force: true }); }
  },
);

it('emits safety exit metrics with occurrence version, bounded reasons and stable dedup IDs', async () => {
  posthogCapture.mockReset();
  const dataDir = await mkdtemp(path.join(tmpdir(), 'od-exit-replay-'));
  const config = path.join(dataDir, 'app-config.json');
  try {
    await writeFile(config, JSON.stringify({ installationId: 'installation-1', telemetry: { metrics: true } }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const service = createAnalyticsService({ dataDir, env: { POSTHOG_KEY: 'phc_test' } });
    const properties = { previous_app_version: '1.0.0-beta.1', app_session_id: 'previous-session', launch_attempt_id: 'previous-launch',
      reason: 'unknown', occurred_at: '2026-10-16T01:00:00.000Z', occurrence_time_source: 'last_checkpoint', pid: 123, path: '/private' };
    for (const reason of ['unknown', 'killed', 'oom', 'recovery-attempt', 'clean-exit']) {
      await service.captureSafety({ eventName: 'daemon_unclean_exit', appVersion: '2.0.0', insertId: `old-exit-${reason}`, properties: { ...properties, reason } });
    }
    const metrics = posthogCapture.mock.calls.map(([call]) => call).filter(call => call.event === 'client_process_exit');
    expect(metrics).toHaveLength(5);
    expect(metrics.map(call => call.properties.reason)).toEqual(['unknown', 'killed', 'oom', 'recovery-attempt', 'clean-exit']);
    expect(metrics[0]).toMatchObject({ properties: { app_version: '1.0.0-beta.1', channel: 'beta', app_session_id: 'previous-session',
      launch_attempt_id: 'previous-launch', $insert_id: 'old-exit-unknown:exit', occurred_at: properties.occurred_at } });
    expect(metrics[0]!.properties).not.toHaveProperty('pid'); expect(metrics[0]!.properties).not.toHaveProperty('path');
    await writeFile(config, '{"telemetry":{"metrics":false}');
    const count = posthogCapture.mock.calls.length;
    await service.captureSafety({ eventName: 'daemon_unclean_exit', appVersion: '2.0.0', properties });
    expect(posthogCapture).toHaveBeenCalledTimes(count + 2);
    await service.shutdown();
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
