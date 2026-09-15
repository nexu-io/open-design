import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { observeUpdateLifecycleStages, type ObservePendingInstallerApplyAttemptsOptions } from '../src/migration/update-apply-observations.js';
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
  const capture = vi.fn(async (_args: Parameters<ObservePendingInstallerApplyAttemptsOptions['analytics']['capture']>[0]) => ({ status: 'queued' as const, acknowledgement: 'local_buffer' as const, errorType: null }));
  const options: ObservePendingInstallerApplyAttemptsOptions = {
    analytics: { capture }, appVersion: summary.toVersion, currentVersion: summary.toVersion,
    currentChannel: 'prerelease', namespace: 'test', dataRoot: root, env: { POSTHOG_KEY: 'ph_test' },
    now: () => new Date('2026-09-10T05:22:00Z'),
    readConfig: async () => ({ installationId: 'test-device', telemetry: { metrics: true } }),
  };
  const stage = async (name: string, overrides: Record<string, unknown> = {}) => writeFile(join(flow, 'lifecycle', `${name}.json`), JSON.stringify({
    stage: name, outcome: 'completed', flow_id: 'flow', occurred_at: '2026-09-10T05:20:45Z', observation_version: 1, ...overrides,
  }));
  return { flow, capture, options, stage };
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
