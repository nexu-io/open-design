// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { reportExperienceEvent, reportProjectFailure, resetExperienceDiagnosticsForTests } from '../../src/observability/experience-diagnostics';
import { useExperienceError } from '../../src/observability/use-experience-error';
import { trackArtifactExportResult, trackRunFailedToastSurfaceView } from '../../src/analytics/events';
import { reportSafetyEvent } from '../../src/analytics/error-tracking';

const fetcher = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); resetExperienceDiagnosticsForTests();
  fetcher.mockReset().mockResolvedValue({ ok: true, status: 200 }); vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { resetExperienceDiagnosticsForTests(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const body = (index = 0) => JSON.parse(fetcher.mock.calls[index]![1].body);
it('captures an error card without PostHog and deduplicates repeated displays of the same run', async () => {
  const props = { element: 'run_failed_toast', run_id: 'run-1', project_id: 'project-1', error_code: 'FAILED', message: 'SECRET' };
  trackRunFailedToastSurfaceView(vi.fn(), props as never);
  reportExperienceEvent('surface_view', props);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(body().properties).toMatchObject({ runId: 'run-1', category: 'visible_error', errorCode: 'FAILED' });
  expect(JSON.stringify(body())).not.toContain('SECRET');
  expect(fetcher.mock.calls[0]![0]).toBe('/api/observability/event');
});
it.each(['client_white_screen', 'client_preview_runtime_error', 'client_preview_resource_error', 'client_resource_error', 'client_run_stuck'])('bridges existing %s independently of safety ingestion setup', (name) => {
  reportSafetyEvent(name, { run_id: 'r', error_message: 'SECRET', resource_url: 'https://secret.test' });
  expect(body().properties.category).toBe('runtime_failure');
  expect(JSON.stringify(body())).not.toContain('secret');
  expect(JSON.stringify(body())).not.toContain('SECRET');
});
it('deduplicates project failures across surfaces and reports a newer run separately', () => {
  const project = { id: 'p', status: { value: 'incomplete', runId: 'r' } };
  reportProjectFailure(project, 'workspace_tabs'); reportProjectFailure(project, 'recent_projects');
  reportProjectFailure({ ...project, status: { value: 'failed', runId: 'r2' } }, 'workspace_tabs');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('ignores successful/awaiting-input projects and canceled or successful exports', () => {
  for (const value of ['succeeded', 'awaiting_input', 'running']) reportProjectFailure({ id: 'p', status: { value } }, 'tabs');
  for (const result of ['success', 'cancelled']) trackArtifactExportResult(vi.fn(), { result } as never);
  expect(fetcher).not.toHaveBeenCalled();
});
it('captures typed failed export and local load error without transmitting error text', () => {
  trackArtifactExportResult(vi.fn(), { result: 'failed', error_code: 'export_failed', project_id: 'p' } as never);
  const hook = renderHook(({ error }) => useExperienceError(error, 'file_source_load', 'p'), { initialProps: { error: '' } });
  hook.rerender({ error: 'private filename and content' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(body(1))).not.toContain('private');
  hook.unmount();
});
it('captures no-run/no-code cards and start-blocked events', () => {
  reportExperienceEvent('surface_view', { element: 'run_failed_toast' });
  reportExperienceEvent('surface_view', { element: 'run_start_blocked', block_reason: 'auth_required' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('retries delivery with the same identity, finitely, without recursive reporting', async () => {
  fetcher.mockRejectedValue(new Error('offline'));
  reportExperienceEvent('client_white_screen', {});
  await vi.runAllTimersAsync();
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(new Set(fetcher.mock.calls.map((_, i) => body(i).properties.occurrenceId)).size).toBe(1);
});
it('does not retry an opt-out acknowledgement or a rejected payload', async () => {
  fetcher.mockResolvedValue({ ok: true, status: 200 });
  reportExperienceEvent('client_white_screen', {});
  await vi.runAllTimersAsync(); expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValue({ ok: false, status: 400 });
  reportExperienceEvent('client_run_stuck', {});
  await vi.runAllTimersAsync(); expect(fetcher).toHaveBeenCalledTimes(2);
});
it('captures another failed operation after its duplicate-display window', async () => {
  reportExperienceEvent('artifact_edit_result', { result: 'failed' });
  await vi.advanceTimersByTimeAsync(11_000);
  reportExperienceEvent('artifact_edit_result', { result: 'failed' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
