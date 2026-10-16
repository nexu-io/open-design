import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const captureSafety = vi.hoisted(() => vi.fn(async (_args: Record<string, unknown>) => undefined));
const version = vi.hoisted(() => vi.fn());
vi.mock('../src/analytics.js', () => ({
  createAnalyticsService: () => ({ captureSafety }),
  readAnalyticsContext: vi.fn(), readPublicConfigResponse: vi.fn(),
}));
vi.mock('../src/app-version.js', async (original) => ({
  ...await original<typeof import('../src/app-version.js')>(), readCurrentAppVersionInfo: version,
}));
vi.mock('../src/migration/update-apply-observations.js', () => ({ observeUpdateLifecycleStages: vi.fn() }));
vi.mock('../src/migration/index.js', () => ({ observePendingInstallerApplyAttempts: vi.fn(async () => undefined) }));
import { registerTelemetryRoutes } from '../src/routes/telemetry.js';

const metric = {
  event_schema_version: 4, metric_schema_version: 1, event_id: 'event-1',
  device_id: 'install-1', app_session_id: 'previous-session', client_type: 'desktop',
  capture_source: 'desktop/main', env: 'production', channel: 'beta',
  app_version: '1.0.0-beta.1', client_version: '1.0.0-beta.1',
  platform: 'darwin', os_version: '25.0.0', arch: 'arm64',
  occurred_at: '2026-10-16T01:00:00.000Z', reported_at: '2026-10-16T02:00:00.000Z',
  telemetry_capability: 'supported', process_role: 'main', process_instance_id: 'process-1',
  uptime_ms: 60_000, rss_bytes: 4096, heap_used_bytes: null, external_bytes: null,
  sampled_at: '2026-10-16T01:00:00.000Z', sampling_interval_ms: 60_000,
};
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function withRoutes(run: (url: string) => Promise<void>, onHostFault?: () => null) {
  const app = express();
  const telemetry = registerTelemetryRoutes(app, {
    ...(onHostFault ? { onHostFault } : {}),
    dataDir: '/unused', readAppConfig: vi.fn(async () => ({ telemetry: { metrics: true } })) as never, writeAppConfig: vi.fn() as never,
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    telemetry.disposeFatalHandlers();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe('CS01 telemetry HTTP boundary', () => {
  it('rejects invalid new metric payloads and strips undeclared content from accepted payloads', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    version.mockResolvedValue({ version: '2.0.0', channel: 'stable' });
    await withRoutes(async (url) => {
      const send = (properties: Record<string, unknown>) => fetch(`${url}/api/observability/event`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'client_process_memory_sample', properties }),
      });
      expect((await send({ ...metric, rss_bytes: -1 })).status).toBe(400);
      expect(captureSafety).not.toHaveBeenCalled();
      expect((await send({ ...metric, prompt: 'private', url: 'https://private.invalid' })).status).toBe(200);
      expect(captureSafety).toHaveBeenCalledTimes(1);
      const args = captureSafety.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
      expect(args).toMatchObject({ insertId: 'event-1', properties: {
        event_id: 'event-1', app_version: '1.0.0-beta.1', app_session_id: 'previous-session', env: 'test',
      } });
      expect(args.properties).not.toHaveProperty('prompt');
      expect(args.properties).not.toHaveProperty('url');
    });
  });

  it('waits for version resolution for an event received immediately after route registration', async () => {
    let resolveVersion!: (value: unknown) => void;
    version.mockReturnValue(new Promise((resolve) => { resolveVersion = resolve; }));
    let markReceived!: () => void;
    const received = new Promise<void>((resolve) => { markReceived = resolve; });
    await withRoutes(async (url) => {
      const request = fetch(`${url}/api/observability/event`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'desktop_unclean_exit', properties: {} }),
      });
      await received;
      const callsBeforeVersion = captureSafety.mock.calls.length;
      resolveVersion({ version: '2.0.0', channel: 'stable' });
      expect(callsBeforeVersion).toBe(0);
      expect((await request).status).toBe(200);
      expect(captureSafety).toHaveBeenCalledWith(expect.objectContaining({ appVersion: '2.0.0' }));
    }, () => { markReceived(); return null; });
  });
});

it('drops memory events after opt-out, including callers bypassing the desktop sampler', async () => {
  const app = express();
  const telemetry = registerTelemetryRoutes(app, {
    dataDir: '/unused', readAppConfig: vi.fn(async () => ({ telemetry: { metrics: false } })) as never,
    writeAppConfig: vi.fn() as never,
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/observability/event`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'client_process_memory_sample', properties: metric }),
    });
    expect(response.status).toBe(200);
    expect(captureSafety).not.toHaveBeenCalled();
  } finally {
    telemetry.disposeFatalHandlers();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
