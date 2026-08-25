import { mkdtemp, writeFile } from 'node:fs/promises';
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

  it('sends $groups written inline by a call site as posthog-node group affiliation', async () => {
    // posthog-node rebuilds the payload as `{ ...properties, $groups: groups }`,
    // so an inline `$groups` is overwritten by the (unpassed, undefined)
    // argument and the event ships with no group at all. Daemon events then
    // vanish from every workspace-scoped aggregation while still looking
    // correct at the call site — exactly how the comment-creation event was
    // missing from Workspace reporting.
    posthogCapture.mockReset();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-analytics-groups-'));
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      installationId: 'install-1',
      telemetry: { metrics: true },
    }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const analytics = createAnalyticsService({
      dataDir,
      env: { POSTHOG_KEY: 'phc_test', OD_TELEMETRY_ENV: 'local_development' },
    });

    await analytics.capture({
      eventName: 'project_comment_create_result',
      appVersion: '1.2.3',
      context: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'web',
        locale: 'en',
        requestId: null,
      },
      insertId: 'insert-1',
      properties: {
        workspace_key: 'workspace-1',
        $groups: { workspace: 'workspace-1' },
      },
    });

    await vi.waitFor(() => {
      expect(posthogCapture).toHaveBeenCalled();
    });
    const captured = posthogCapture.mock.calls[0]?.[0];
    expect(captured).toMatchObject({
      event: 'project_comment_create_result',
      groups: { workspace: 'workspace-1' },
      properties: { workspace_key: 'workspace-1' },
    });
    // Left in `properties`, it would be the value posthog-node discards.
    expect(captured.properties).not.toHaveProperty('$groups');
  });

  it('omits group affiliation when a call site sends no usable $groups', async () => {
    posthogCapture.mockReset();
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-analytics-nogroups-'));
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
      installationId: 'install-1',
      telemetry: { metrics: true },
    }));
    const { createAnalyticsService } = await import('../src/analytics.js');
    const analytics = createAnalyticsService({
      dataDir,
      env: { POSTHOG_KEY: 'phc_test', OD_TELEMETRY_ENV: 'local_development' },
    });

    await analytics.capture({
      eventName: 'unit_event',
      appVersion: '1.2.3',
      context: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'web',
        locale: 'en',
        requestId: null,
      },
      insertId: 'insert-2',
      properties: { $groups: { workspace: '   ' } },
    });

    await vi.waitFor(() => {
      expect(posthogCapture).toHaveBeenCalled();
    });
    const captured = posthogCapture.mock.calls[0]?.[0];
    expect(captured).not.toHaveProperty('groups');
    expect(captured.properties).not.toHaveProperty('$groups');
  });
});
