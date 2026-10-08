import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evidenceStore } from '../src/services/evidence-delivery.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFeedbackPayload, readFeedbackTelemetrySinkConfig, type FeedbackReportContext } from '../src/langfuse-trace.js';
import { reportRunFeedbackFromDaemon } from '../src/langfuse-bridge.js';

const config = vi.hoisted(() => ({
  installationId: 'synthetic-installation',
  telemetry: { metrics: true, content: true },
}));
vi.mock('../src/app-config.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/app-config.js')>(),
  readAppConfig: vi.fn(async () => config),
}));
const taskId = 'strategy-task:synthetic-feedback-task';
const context = (): FeedbackReportContext & { traceId: string } => ({
  runId: 'synthetic-production-run', traceId: taskId,
  installationId: 'synthetic-installation', prefs: { metrics: true, content: true },
  rating: 'negative', reasonCodes: ['too_slow'], hasCustomReason: true,
  customReason: 'synthetic-test',
});

describe('Task-owned feedback', () => {
  beforeEach(() => {
    config.telemetry.content = true;
    vi.stubEnv('OPEN_DESIGN_TELEMETRY_RELAY_URL', 'https://relay.example/api/langfuse');
    vi.stubEnv('OPEN_DESIGN_TELEMETRY_RETRIES', '0');
    vi.stubEnv('OPEN_DESIGN_VELA_TELEMETRY', '1');
    vi.stubEnv('VELA_CONTROL_KEY', 'synthetic-control-key');
    vi.stubEnv('VELA_API_URL', 'https://vela.example');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('targets the Task while keeping rating and reason IDs owned by the physical Run', () => {
    const bodies = buildFeedbackPayload(context()).map((event) => (event as { body: Record<string, unknown> }).body);
    expect(bodies.map(body => body.traceId)).toEqual([taskId, taskId]);
    expect(bodies.map(body => body.id)).toEqual(['synthetic-production-run-rating', 'synthetic-production-run-reason-too_slow']);
    expect(bodies[0]?.metadata).toMatchObject({ runId: 'synthetic-production-run' });
    const repeated = buildFeedbackPayload(context()).map((event) => (event as { body: { id: string } }).body.id);
    expect(repeated).toEqual(bodies.map(body => body.id));
  });

  it('uses the same Task relay even when Vela credentials are configured', async () => {
    expect(readFeedbackTelemetrySinkConfig()?.kind).toBe('vela');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 202 }));
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-task-feedback-'));
    try {
    expect(await reportRunFeedbackFromDaemon({ dataDir, ...context(), fetchImpl })).toMatchObject({ deliveryStatus: 'queued' });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://relay.example/api/langfuse');
    const payload = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(payload.batch[0].body.traceId).toBe(taskId);
    } finally { (await evidenceStore(dataDir)).close(); await rm(dataDir, { recursive: true, force: true }); }
  });

  it('keeps legacy Run feedback IDs and respects content consent', async () => {
    const { traceId: _traceId, ...legacy } = context();
    const first = buildFeedbackPayload(legacy)[0] as { body: { traceId: string; id: string } };
    expect(first.body).toMatchObject({ traceId: legacy.runId, id: `${legacy.runId}-rating` });
    config.telemetry.content = false;
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await reportRunFeedbackFromDaemon({ dataDir: '/synthetic-unused', ...context(), fetchImpl }))
      .toEqual({ status: 'skipped_consent' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
