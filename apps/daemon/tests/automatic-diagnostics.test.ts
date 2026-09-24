import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { AutomaticDiagnostics } from '../src/services/automatic-diagnostics.js';
import { DiagnosticOutbox } from '../src/storage/diagnostic-outbox.js';
import { createDiagnosticRunObserver, diagnosticFaultFromRun } from '../src/services/diagnostic-faults.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn(); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'od-auto-'));
  let consent = true; let failCompletion = false; const calls: Array<{ path: string; body: any }> = [];
  const id = '12345678-1234-1234-1234-123456789abc';
  let prefix = ''; let manifest: any;
  const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const path = new URL(String(url)).pathname; const body = JSON.parse(String(options?.body)); calls.push({ path, body });
    if (path.endsWith('/register')) return Response.json({ device_id: id, device_token: `${id}.${'a'.repeat(64)}` });
    if (path.endsWith('/authorize')) {
      manifest = body.manifest; prefix = `diagnostics/v1/devices/${id}/incidents/${manifest.incidentId}/bundles/${'a'.repeat(64)}`;
      return Response.json({ upload_token: 'signed', object_prefix: prefix });
    }
    if (body.complete) {
      if (failCompletion) { failCompletion = false; throw new Error('receipt lost'); }
      return Response.json({ status: 'available', object_key: `${prefix}/manifest.json`, storage_ref: `od://objects/${prefix}/manifest.json` });
    }
    const chunk = manifest.chunks[body.chunk_index];
    return Response.json({ object_key: `${prefix}/chunks/${body.chunk_index}`, sha256: `sha256:${chunk.sha256}`, size_bytes: chunk.sizeBytes });
  }) as unknown as typeof fetch;
  const options = { dataRoot: root, relayOrigin: 'https://relay.test', consent: () => consent,
    sources: async () => [], fetcher };
  const service = new AutomaticDiagnostics(options);
  cleanup.push(async () => { await service.stop(); rmSync(root, { recursive: true, force: true }); });
  return { root, service, options, calls, setConsent: (v: boolean) => { consent = v; service.consentChanged(); },
    loseReceipt: () => { failCompletion = true; } };
}
it('delivers no-run incidents without account/trace and records a completed receipt', async () => {
  const f = fixture(); const id = f.service.record({ sourceId: 'pre-run:1', at: Date.now(), kind: 'admission_failure' })!;
  await f.service.tick();
  expect(f.service.outbox.get(id)?.state).toBe('delivered');
  expect(f.calls.map((c) => c.path)).toEqual(['/api/objects/devices/register', '/api/objects/authorize', '/api/objects/batch', '/api/objects/batch']);
});
it('retains failed delivery through shutdown and retries the same incident after a lost receipt', async () => {
  const f = fixture(); f.loseReceipt();
  const id = f.service.record({ sourceId: 'run:1', at: Date.now(), kind: 'run_error' })!;
  await f.service.tick(); expect(f.service.outbox.get(id)?.state).toBe('pending');
  // Reset only the test clock's retry deadline via the version-fenced store API.
  const item = f.service.outbox.get(id)!; f.service.outbox.defer(item, 0, 'test_due');
  await f.service.stop();
  const second = new AutomaticDiagnostics(f.options);
  await second.tick(); expect(second.outbox.get(id)?.state).toBe('delivered'); await second.stop();
  expect(f.calls.filter((c) => c.path.endsWith('/register'))).toHaveLength(1);
  expect(f.calls.filter((c) => c.path.endsWith('/authorize')).map((c) => c.body.manifest.incidentId)).toEqual([id, id]);
});
it('does not capture while disabled and scrubs pending content when consent is revoked', async () => {
  const f = fixture(); f.loseReceipt();
  const id = f.service.record({ sourceId: 'a', at: Date.now(), kind: 'run_error', detail: 'private text' })!;
  await f.service.tick(); f.setConsent(false); await f.service.tick();
  expect(f.service.outbox.get(id)?.state).toBe('discarded');
  expect(f.service.outbox.get(id)?.summary).toBe('{}');
  expect(f.service.record({ sourceId: 'b', at: Date.now(), kind: 'run_error' })).toBeNull();
  f.setConsent(true); await f.service.tick(); expect(f.calls.filter((c) => c.body.complete)).toHaveLength(1);
});
it('maps failed attempts and recovered retries but excludes healthy success and unattributed cancellation', () => {
  const run = { id: 'r' }; const event = { id: 1, timestamp: 1, data: {} };
  expect(diagnosticFaultFromRun(run, { ...event, event: 'run_retry_attempted' })?.kind).toBe('retry');
  expect(diagnosticFaultFromRun(run, { ...event, event: 'end', data: { status: 'canceled' } })).toBeNull();
  expect(diagnosticFaultFromRun(run, { ...event, event: 'end', data: { status: 'completed' } })).toBeNull();
  expect(diagnosticFaultFromRun(run, { ...event, event: 'end', data: { status: 'failed' } })?.kind).toBe('terminal_failure');
  expect(diagnosticFaultFromRun({ ...run, strategyTask: { outcome: 'blocked' } }, { ...event, event: 'end', data: { status: 'succeeded' } })?.kind).toBe('logical_blocked');
});
it('does not create a second fault for the terminal callback following an observed error', () => {
  const observe = createDiagnosticRunObserver(); const run = { id: 'r', retryAttemptCount: 0 };
  expect(observe(run, { id: 1, timestamp: 1, event: 'error', data: {} })).not.toBeNull();
  expect(observe(run, { id: 2, timestamp: 2, event: 'end', data: { status: 'failed' } })).toBeNull();
  run.retryAttemptCount = 1;
  expect(observe(run, { id: 3, timestamp: 3, event: 'run_retry_attempted', data: {} })).toBeNull();
  expect(observe(run, { id: 4, timestamp: 4, event: 'end', data: { status: 'failed' } })).not.toBeNull();
});
