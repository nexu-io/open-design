import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createChatRunService } from '../src/runtimes/runs.js';
import { diagnosticFaultFromApi, diagnosticFaultFromLifecycle, diagnosticFaultFromRun } from '../src/services/diagnostic-faults.js';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const baseRun = { id: 'r', createdAt: 100, lastAgentActivityAt: 200, cancelOrigin: 'user_stop', retryAttemptCount: 2 };
it('retains every user stop with factual timing and one identity through its terminal fallback', () => {
  const early = diagnosticFaultFromLifecycle(baseRun, 'user_cancel', 1000);
  const end = diagnosticFaultFromRun(baseRun, { id: 9, event: 'end', timestamp: 2000, data: { status: 'canceled' } });
  expect(end?.sourceId).toBe(early.sourceId);
  expect(early.detail).toMatchObject({ elapsedMs: 900, lastAgentActivityAgeMs: 800, retryAttemptCount: 2 });
  expect(diagnosticFaultFromLifecycle(baseRun, 'user_cancel', 1500).sourceId).toBe(early.sourceId);
  expect(diagnosticFaultFromLifecycle({ ...baseRun, manualResumeAttemptCount: 1 }, 'user_cancel', 2000).sourceId).not.toBe(early.sourceId);
});
it('does not infer a system failure from cleanup or healthy success; catches invalid delivery after success', () => {
  const end = { id: 1, event: 'end', timestamp: 1000, data: { status: 'canceled' } };
  expect(diagnosticFaultFromRun({ ...baseRun, cancelOrigin: 'project_cleanup', deliverableValid: false }, end)).toBeNull();
  expect(diagnosticFaultFromRun(baseRun, { ...end, data: { status: 'succeeded' } })).toBeNull();
  expect(diagnosticFaultFromRun({ ...baseRun, deliverableValid: false }, { ...end, data: { status: 'succeeded' } })?.kind).toBe('delivery_validation_failure');
});
it.each([
  ['/api/chat', 'admission_failure'], ['/api/runs/:id/cancel', 'run_api_failure'],
  ['/api/projects/:id/conversations/:cid/messages/:mid', 'workspace_api_failure'],
  ['/api/upload', 'workspace_api_failure'], ['/api/artifacts/save', 'workspace_api_failure'],
  ['/api/projects/:id/files/:name/preview', 'delivery_api_failure'],
  ['/api/projects/:id/export/pdf', 'delivery_api_failure'],
])('captures the existing API failure for %s', (path, kind) => {
  expect(diagnosticFaultFromApi({ at: new Date().toISOString(), method: 'POST', path, status: 500, code: 'INTERNAL_ERROR', retryable: false })?.kind).toBe(kind);
});
it('collapses a repeating API failure into one incident per signature and hour', () => {
  const failure = (at: string, overrides: Record<string, unknown> = {}) => diagnosticFaultFromApi({
    at, method: 'GET', path: '/api/runs', status: 400, code: 'PROJECT_SCOPE_REQUIRED', retryable: false,
    requestId: `req-${at}`, ...overrides,
  });
  const first = failure('2026-09-25T10:00:01.000Z');
  expect(failure('2026-09-25T10:00:03.000Z')?.sourceId).toBe(first?.sourceId);
  expect(failure('2026-09-25T10:59:59.000Z')?.sourceId).toBe(first?.sourceId);
  expect(failure('2026-09-25T11:00:00.000Z')?.sourceId).not.toBe(first?.sourceId);
  expect(failure('2026-09-25T10:00:05.000Z', { code: 'WORKSPACE_PROJECT_PERMISSION_DENIED', status: 403 })?.sourceId)
    .not.toBe(first?.sourceId);
  expect(failure('2026-09-25T10:00:05.000Z', { path: '/api/runs/:id' })?.sourceId).not.toBe(first?.sourceId);
  expect(first?.detail).toMatchObject({ requestId: 'req-2026-09-25T10:00:01.000Z' });
});
it.each(['/api/telemetry', '/api/diagnostics/export', '/api/objects/batch', '/api/health'])('does not recursively capture infrastructure route %s', (path) => {
  expect(diagnosticFaultFromApi({ at: new Date().toISOString(), method: 'POST', path, status: 500, code: 'INTERNAL_ERROR', retryable: false })).toBeNull();
});
function service(options: Record<string, unknown> = {}) {
  return createChatRunService({
    createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    ttlMs: 1, ...options,
  } as never);
}
it('records cancellation before terminal work and isolates an observer failure', async () => {
  const order: string[] = [];
  const runs = service({
    onDiagnosticLifecycle: (_run: unknown, kind: string) => { order.push(kind); throw new Error('outbox unavailable'); },
    beforeFinish: () => order.push('finish'),
  });
  const run = runs.create({});
  await runs.cancel(run, 'user_stop');
  expect(order).toEqual(['user_cancel', 'finish']);
  expect(run.status).toBe('canceled');
  await runs.cancel(run, 'user_stop');
  expect(order).toHaveLength(2);
});
it('captures a failed terminal metadata refresh even when the first terminal write succeeded', () => {
  const root = mkdtempSync(join(tmpdir(), 'od-experience-')); directories.push(root);
  let terminalWrites = 0;
  const observe = vi.fn();
  const runs = service({ runsLogDir: root, onDiagnosticLifecycle: observe,
    writeDurableState: (_path: string, state: { status: string }) => state.status === 'succeeded' && ++terminalWrites === 2
      ? { ok: false, errorType: 'storage_full' } : { ok: true },
  });
  const run = runs.create({});
  runs.finish(run, 'succeeded', 0);
  expect(observe).toHaveBeenCalledWith(run, 'terminal_persistence_failure', expect.any(Number), 'storage_full');
  expect(run.status).toBe('succeeded');
});
