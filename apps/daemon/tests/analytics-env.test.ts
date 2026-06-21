import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const posthogCapture = vi.hoisted(() => vi.fn());
const posthogShutdown = vi.hoisted(() => vi.fn(async () => undefined));
const posthogCtor = vi.hoisted(() =>
  vi.fn(function PostHogMock(_key: string, _options?: Record<string, unknown>) {
    return {
      capture: posthogCapture,
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

    analytics.capture({
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
  });
});
