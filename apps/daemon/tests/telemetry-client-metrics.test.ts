import express from 'express';
import { processExitMetricFields } from '@open-design/contracts/analytics';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readAppConfig } from '../src/app-config.js';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const captureSafety = vi.hoisted(() => vi.fn(async (_args: Record<string, unknown>) => undefined));
const version = vi.hoisted(() => vi.fn());
vi.mock('../src/analytics.js', () => ({
  createAnalyticsService: () => ({ captureSafety }),
  readAnalyticsContext: vi.fn(), readPublicConfigResponse: vi.fn(() => ({ enabled: true, env: 'test', key: 'phc_test', host: 'https://example.invalid' })),
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

async function withRoutes(run: (url: string) => Promise<void>, onHostFault?: () => null, dataDir?: string) {
  const app = express();
  const telemetry = registerTelemetryRoutes(app, {
    ...(onHostFault ? { onHostFault } : {}),
    dataDir: dataDir ?? '/unused', readAppConfig: dataDir ? readAppConfig : vi.fn(async () => ({ telemetry: { metrics: true }, installationId: 'install-1' })) as never, writeAppConfig: vi.fn() as never,
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

it('admits every stability metric after opt-out and strips private payload fields', async () => {
  version.mockResolvedValue({ version: '2.0.0', channel: 'stable' });
  const app = express();
  const telemetry = registerTelemetryRoutes(app, {
    dataDir: '/unused', readAppConfig: vi.fn(async () => ({ telemetry: { metrics: false } })) as never,
    writeAppConfig: vi.fn() as never,
  });
  const launch = { launch_attempt_id: 'launch', startup_type: 'cold', measurement_boundary: 'process_entry', started_at: metric.occurred_at };
  const preview = { preview_attempt_id: 'preview', render_mode: 'srcdoc', artifact_kind: null, started_at: metric.occurred_at };
  const samples: Record<string, Record<string, unknown>> = {
    client_launch_attempt: launch,
    client_business_ready: { ...launch, duration_ms: 100 },
    client_launch_result: { ...launch, result: 'ready', duration_ms: 100 },
    client_navigation_result: { navigation_id: 'nav', navigation_type: 'project_enter', source_type: 'home', target_type: 'project', result: 'ready', started_at: metric.occurred_at, duration_ms: 100 },
    client_process_memory_sample: {},
    client_process_exit: processExitMetricFields('desktop_renderer_crash', { reason: 'oom' }),
    client_update_stage_result: { flow_id: 'flow', stage: 'check', result: 'failed', reason_code: 'check_failed', from_version: '1.0.0', to_version: null, update_path: null, artifact_type: null, trigger: 'manual', duration_ms: null },
    client_preview_attempt: preview,
    client_preview_result: { ...preview, result: 'success', duration_ms: 100, monitoring_kind: 'visible_content' },
    client_responsiveness_window: { measurement: 'long_task', measurable: true, unavailable_reason: null, window_ms: 30_000, long_task_count: 0, severe_task_count: 0, max_duration_ms: null },
    client_input_responsiveness: { area: 'composer', window_ms: 30_000, input_attempt_count: 1, qualified_sample_count: 1, over_500ms_count: 0, max_input_to_presentation_ms: 24, max_queue_delay_ms: 0, sample_floor_ms: 16 },
    client_chat_scroll_frames: { measurable: true, window_ms: 30_000, frame_count: 2, interval_count: 1, over_50ms_count: 0, max_frame_interval_ms: 16, sampling_truncated: false },
    client_responsiveness_recovery: { recovery_id: 'recovery', previous_occurred_at: metric.occurred_at, duration_ms: null, severe_task_count: 0, reason: 'unclean_exit_unknown' },
  };
  const server = app.listen(0, '127.0.0.1');
  try {
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
    for (const [event, fields] of Object.entries(samples)) {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/observability/event`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event, properties: { ...metric, ...fields, path: '/private', url: 'https://private.invalid', content: 'secret', prompt: 'secret', pid: 123 } }),
      });
      expect(response.status, event).toBe(200);
      const call = captureSafety.mock.calls.at(-1)![0];
      expect(call.eventName).toBe(event);
      for (const key of ['path', 'url', 'content', 'prompt', 'pid']) expect(call.properties, event).not.toHaveProperty(key);
    }
    expect(captureSafety).toHaveBeenCalledTimes(Object.keys(samples).length);
    // Legacy carriers and browser health forwards keep the same safety policy.
    for (const event of ['desktop_renderer_crash', 'desktop_child_process_crash', 'desktop_unclean_exit', 'daemon_unclean_exit', 'packaged_runtime_failed', 'client_long_task', 'client_chat_interaction_latency', 'client_chat_scroll_frozen', 'client_chat_first_paint', 'client_chat_dom_growth', 'client_chat_memory_pressure', 'client_chat_stream_health', 'client_preview_white_screen', 'client_preview_runtime_error', 'client_preview_resource_error', 'client_white_screen']) {
      await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/observability/event`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, properties: {} }),
      });
      expect(captureSafety.mock.calls.at(-1)![0].eventName).toBe(event);
    }
  } finally {
    telemetry.disposeFatalHandlers();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});


it.each(['{"telemetry":{"metrics":false}', 'null', '[]', 'false'])(
  'keeps product config disabled but admits memory safety events after saved opt-out becomes %s', async (damaged) => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-consent-route-'));
    const configPath = path.join(dataDir, 'app-config.json');
    try {
      await writeFile(configPath, JSON.stringify({ telemetry: { metrics: false } }));
      await withRoutes(async (url) => {
        expect((await (await fetch(`${url}/api/analytics/config`)).json() as { enabled: boolean }).enabled).toBe(false);
        await writeFile(configPath, damaged);
        // The ordinary app-config reader retains its existing fallback behavior.
        expect((await readAppConfig(dataDir)).telemetry?.metrics).toBe(true);
        expect((await (await fetch(`${url}/api/analytics/config`)).json() as { enabled: boolean }).enabled).toBe(false);
        const response = await fetch(`${url}/api/observability/event`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ event: 'client_process_memory_sample', properties: metric }),
        });
        expect(response.status).toBe(200);
        expect(captureSafety).toHaveBeenCalledOnce();
      }, undefined, dataDir);
    } finally { await rm(dataDir, { recursive: true, force: true }); }
  },
);

it('does not create host fault incidents for clean exits or recovery attempts and preserves carrier dedup IDs', async () => {
  const fault = vi.fn(() => null);
  version.mockResolvedValue({ version: '2.0.0', channel: 'stable' });
  await withRoutes(async url => {
    for (const reason of ['clean-exit', 'recovery-attempt']) {
      const response = await fetch(`${url}/api/observability/event`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'desktop_renderer_crash', properties: { event_id: `exit-${reason}`, reason } }) });
      expect(response.status).toBe(200);
      expect(captureSafety).toHaveBeenCalledWith(expect.objectContaining({ insertId: `exit-${reason}` }));
    }
    expect(fault).not.toHaveBeenCalled();
  }, fault);
});

it('delivers stability metrics immediately when the app config cannot be read', async () => {
  version.mockResolvedValue({ version: '2.0.0', channel: 'stable' });
  const app = express();
  const telemetry = registerTelemetryRoutes(app, {
    dataDir: '/unused', readAppConfig: vi.fn(async () => { throw new Error('EACCES'); }) as never,
    writeAppConfig: vi.fn() as never,
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (let i = 0; i < 3; i += 1) {
      const response = await fetch(`${url}/api/observability/event`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'client_process_memory_sample', properties: { ...metric, event_id: `unreadable-${i}` } }),
      });
      expect(response.status).toBe(200);
    }
    expect(captureSafety).toHaveBeenCalledTimes(3);
  } finally {
    telemetry.disposeFatalHandlers();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
