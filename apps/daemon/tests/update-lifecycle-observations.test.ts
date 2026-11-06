import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { observeUpdateLifecycleStages, type ObserveUpdateLifecycleStagesOptions } from '../src/migration/update-apply-observations.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'od-lifecycle-replay-')); roots.push(root);
  const flow = join(root, 'observations/installer/flow');
  await mkdir(join(flow, 'lifecycle'), { recursive: true });
  const summary = { schemaVersion: 1, kind: 'installer_apply_observation', flowId: 'flow',
    channel: 'prerelease', namespace: 'test', arch: 'x64', platform: 'win32', artifactType: 'payload',
    fromVersion: '0.22.2-prerelease.2', toVersion: '0.22.2-prerelease.3',
    attemptedAt: '2026-09-10T05:20:00Z', updatedAt: '2026-09-10T05:20:00Z', result: 'success', reason: 'app_version_matches',
    delivery: { status: 'submitted' } };
  await writeFile(join(flow, 'summary.json'), JSON.stringify(summary));
  const capture = vi.fn(async (_args: Parameters<ObserveUpdateLifecycleStagesOptions['analytics']['capture']>[0]) => ({ status: 'queued' as const, acknowledgement: 'local_buffer' as const, errorType: null }));
  const captureSafety = vi.fn(async (_args: Parameters<ObserveUpdateLifecycleStagesOptions['analytics']['captureSafety']>[0]) => undefined);
  const options: ObserveUpdateLifecycleStagesOptions = {
    analytics: { capture, captureSafety }, appVersion: summary.toVersion, currentVersion: summary.toVersion,
    currentChannel: 'prerelease', namespace: 'test', dataRoot: root, env: { POSTHOG_KEY: 'ph_test' },
    now: () => new Date('2026-09-10T05:22:00Z'),
    readConfig: async () => ({ installationId: 'test-device', telemetry: { metrics: true } }),
  };
  const stage = async (name: string, overrides: Record<string, unknown> = {}) => writeFile(join(flow, 'lifecycle', `${name}.json`), JSON.stringify({
    stage: name, outcome: 'completed', flow_id: 'flow', occurred_at: '2026-09-10T05:20:45Z', observation_version: 1, ...overrides,
  }));
  return { flow, capture, captureSafety, options, stage };
}
it('accepts legacy summaries without stages, then observes late desktop readiness separately', async () => {
  const { options, capture, stage } = await fixture();
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 0 });
  await stage('desktop_ready');
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 1 });
  expect(capture.mock.calls[0]?.[0]).toMatchObject({ eventName: 'update_lifecycle_observed', insertId: 'update_lifecycle_observed:flow:desktop_ready' });
  await observeUpdateLifecycleStages(options);
  expect(capture).toHaveBeenCalledTimes(1);
});
it('replays renderer quiescence as its own idempotent handoff stage', async () => {
  const { options, capture, stage } = await fixture();
  await stage('renderer_quiesced');
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 1 });
  expect(capture.mock.calls[0]?.[0]).toMatchObject({
    eventName: 'update_lifecycle_observed',
    insertId: 'update_lifecycle_observed:flow:renderer_quiesced',
    properties: expect.objectContaining({
      stage: 'renderer_quiesced',
      outcome: 'completed',
    }),
  });
  await observeUpdateLifecycleStages(options);
  expect(capture).toHaveBeenCalledTimes(1);
});
it('retries a rejected enqueue with the same insert ID and does not conflate queue acknowledgement with ingestion', async () => {
  const { options, capture, stage, flow } = await fixture();
  await stage('shutdown_completed', { duration_ms: 32000, repeated_quit_count: 2 });
  capture.mockRejectedValueOnce(new Error('offline'));
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 0 });
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 1 });
  expect(capture.mock.calls[0]?.[0]).toEqual(capture.mock.calls[1]?.[0]);
  expect(JSON.parse(await readFile(join(flow, 'lifecycle/shutdown_completed.json.receipt'), 'utf8')).status).toBe('queued');
});
it('does not emit opted-out observations later when consent changes', async () => {
  const { options, capture, stage } = await fixture();
  await stage('desktop_ready');
  await observeUpdateLifecycleStages({ ...options, readConfig: async () => ({ installationId: 'test-device', telemetry: { metrics: false } }) });
  await observeUpdateLifecycleStages(options);
  expect(capture).not.toHaveBeenCalled();
});
it('projects only finite metrics and rejects mismatched flow, stage, identity and invalid counts', async () => {
  const { options, capture, stage } = await fixture();
  await stage('cleanup_daemon', { outcome: 'forced', forced_process_count: 3, remaining_process_count: 0, raw_path: '/private/user/file', pid: 123 });
  await stage('desktop_ready', { flow_id: 'other' });
  await stage('shutdown_completed', { repeated_quit_count: -1 });
  await observeUpdateLifecycleStages({ ...options, namespace: 'other' });
  expect(capture).not.toHaveBeenCalled();
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 1 });
  const serialized = JSON.stringify(capture.mock.calls);
  expect(serialized).not.toContain('/private');
  expect(serialized).not.toContain('"pid"');
  expect(serialized).toContain('"forced_process_count":3');
});

async function metricFixture() {
  const { flow, options, captureSafety } = await fixture();
  await rm(join(flow, 'summary.json'));
  await mkdir(join(flow, 'stages'), { recursive: true });
  for (const phase of ['started', 'result']) await writeFile(join(flow, 'stages', `check-${phase}.json`), JSON.stringify({
    flow_id: 'flow', stage: 'check', result: phase === 'started' ? 'started' : 'failed',
    reason_code: phase === 'started' ? null : 'check_failed', from_version: '0.22.2-prerelease.2', to_version: null,
    update_path: null, artifact_type: null, trigger: 'silent', duration_ms: null,
    namespace: 'test', channel: 'prerelease', occurred_at: '2026-09-10T05:20:01Z',
    app_session_id: 'app-1', app_version: '0.22.2-prerelease.2', platform: 'win32', arch: 'x64',
    private_path: '/private', pid: 123, metric_schema_version: 1,
  }));
  return { flow, options, capture: captureSafety };
}

it('replays front-stage attempts without an install summary and deduplicates both phases', async () => {
  const { options, capture } = await metricFixture();
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 2 });
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 0 });
  expect(capture).toHaveBeenCalledTimes(2);
  expect(capture.mock.calls[0]?.[0]).toMatchObject({ eventName: 'client_update_stage_result', properties: {
    event_schema_version: 4, metric_schema_version: 1, flow_id: 'flow', stage: 'check', result: 'started',
    app_version: '0.22.2-prerelease.2', app_session_id: 'app-1', occurred_at: '2026-09-10T05:20:01.000Z',
  } });
  expect(JSON.stringify(capture.mock.calls)).not.toContain('/private');
  expect(JSON.stringify(capture.mock.calls)).not.toContain('"pid"');
});

it('retries new stage enqueue failures using stable IDs and receipts only local acceptance', async () => {
  const { flow, options, capture } = await metricFixture();
  capture.mockRejectedValueOnce(new Error('offline'));
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 1 });
  await expect(readFile(join(flow, 'stages/check-started.json.receipt'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 1 });
  expect(capture.mock.calls[0]?.[0]?.insertId).toBe(capture.mock.calls[2]?.[0]?.insertId);
  expect(JSON.parse(await readFile(join(flow, 'stages/check-started.json.receipt'), 'utf8')).status).toBe('queued');
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 0 });
});

it.each(['disabled', 'unreadable'] as const)('replays private-data-free safety stage records with %s consent', async consent => {
  const { flow, options, capture } = await metricFixture();
  expect(await observeUpdateLifecycleStages({ ...options, readConfig: async () => {
    if (consent === 'unreadable') throw new Error('damaged config');
    return { installationId: 'test-device', telemetry: { metrics: false } };
  } })).toEqual({ queued: 2 });
  expect(JSON.parse(await readFile(join(flow, 'stages/check-started.json.receipt'), 'utf8')).status).toBe('queued');
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 0 });
  expect(capture).toHaveBeenCalledTimes(2);
  for (const [call] of capture.mock.calls) for (const key of ['path', 'private_path', 'url', 'content', 'prompt', 'pid']) expect(call.properties).not.toHaveProperty(key);
  expect(options.analytics.capture).not.toHaveBeenCalled();
});

it('does not send stage safety metrics without a PostHog key', async () => {
  const { options, capture } = await metricFixture();
  expect(await observeUpdateLifecycleStages({ ...options, env: {} })).toEqual({ queued: 0 });
  expect(capture).not.toHaveBeenCalled();
});

it('reconsiders old consent-skip receipts on the safety lane using the original event ID', async () => {
  const { flow, options, capture } = await metricFixture();
  for (const phase of ['started', 'result']) await writeFile(join(flow, `stages/check-${phase}.json.receipt`), JSON.stringify({ status: 'skipped_no_consent' }));
  expect(await observeUpdateLifecycleStages({ ...options, readConfig: async () => ({ telemetry: { metrics: false } }) })).toEqual({ queued: 2 });
  expect(capture.mock.calls.map(([call]) => call.insertId)).toEqual(['update_stage:flow:check:started', 'update_stage:flow:check:result']);
  expect(await observeUpdateLifecycleStages(options)).toEqual({ queued: 0 });
});
