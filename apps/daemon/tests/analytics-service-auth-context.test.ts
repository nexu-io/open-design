import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const posthogMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  on: vi.fn(),
  shutdown: vi.fn(async () => undefined),
}));

vi.mock('posthog-node', () => ({
  PostHog: class MockPostHog {
    capture = posthogMocks.capture;
    on = posthogMocks.on;
    shutdown = posthogMocks.shutdown;
  },
}));

import { createAnalyticsService } from '../src/analytics.js';
import { writeAppConfig } from '../src/app-config.js';

const dataDirs: string[] = [];

async function tempDataDir(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `od-analytics-${name}-`));
  dataDirs.push(dir);
  return dir;
}

async function settleAnalyticsCapture(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('analytics service auth context', () => {
  afterEach(async () => {
    posthogMocks.capture.mockClear();
    posthogMocks.on.mockClear();
    posthogMocks.shutdown.mockClear();
    await Promise.all(dataDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('uses per-event dataDir overrides for metrics consent', async () => {
    const daemonDir = await tempDataDir('daemon');
    const aliceDir = await tempDataDir('alice');
    const bobDir = await tempDataDir('bob');
    await writeAppConfig(daemonDir, { telemetry: { metrics: false } });
    await writeAppConfig(aliceDir, { telemetry: { metrics: true } });
    await writeAppConfig(bobDir, { telemetry: { metrics: false } });

    const service = createAnalyticsService({
      dataDir: daemonDir,
      env: {
        POSTHOG_KEY: 'phc_test_key',
        POSTHOG_HOST: 'https://posthog.example.test',
      } as NodeJS.ProcessEnv,
    });
    const context = {
      deviceId: 'device-1',
      sessionId: 'session-1',
      clientType: 'web' as const,
      locale: 'en',
      requestId: null,
    };

    service.capture({
      eventName: 'daemon_dir_disabled',
      context,
      appVersion: '0.0.0',
      properties: {},
      insertId: 'daemon-disabled',
    });
    await settleAnalyticsCapture();
    expect(posthogMocks.capture).not.toHaveBeenCalled();

    service.capture({
      eventName: 'alice_enabled',
      context,
      appVersion: '0.0.0',
      properties: {},
      insertId: 'alice-enabled',
      dataDir: aliceDir,
    });
    await vi.waitFor(() => expect(posthogMocks.capture).toHaveBeenCalledTimes(1));
    expect(posthogMocks.capture).toHaveBeenLastCalledWith(
      expect.objectContaining({
        distinctId: 'device-1',
        event: 'alice_enabled',
      }),
    );

    service.capture({
      eventName: 'bob_disabled',
      context,
      appVersion: '0.0.0',
      properties: {},
      insertId: 'bob-disabled',
      dataDir: bobDir,
    });
    await settleAnalyticsCapture();
    expect(posthogMocks.capture).toHaveBeenCalledTimes(1);
  });
});
