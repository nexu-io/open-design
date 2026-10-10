import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { AutomaticDiagnostics } from '../src/services/automatic-diagnostics.js';
import { DiagnosticOutbox, PENDING_MAX_AGE } from '../src/storage/diagnostic-outbox.js';
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
it('keeps the reason of a source known to be absent instead of a consent verdict', async () => {
  const f = fixture();
  const service = new AutomaticDiagnostics({ ...f.options,
    sources: async () => [{ name: 'agent-cli-logs/amr/opencode', absolutePath: '', kind: 'text' as const, omitReason: 'source_not_located' }] });
  cleanup.push(async () => { await service.stop(); });
  const id = service.record({ sourceId: 'run:absent', at: Date.now(), kind: 'run_error' })!;
  await service.tick();
  const { readdirSync, readFileSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const dir = join(service.outbox.directory, id);
  const archive = Buffer.concat(readdirSync(dir).filter((n) => /^\d+$/.test(n)).sort((a, b) => +a - +b).map((n) => readFileSync(join(dir, n))));
  const collection = gunzipSync(archive).toString().trim().split('\n').map((l) => JSON.parse(l)).at(-1);
  expect(collection.notes).toEqual([{ name: 'agent-cli-logs/amr/opencode', reason: 'source_not_located' }]);
});

// A bundle that never leaves the device used to vanish without a trace: the
// relay's permanent rejections, repeated transient failures and outbox expiry
// were recorded only in the local outbox. Report each so a missing bundle can
// be explained from analytics.
function relayFailing(status: number) {
  const reports: any[] = [];
  const root = mkdtempSync(join(tmpdir(), 'od-auto-loss-'));
  const fetcher = vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;
  const service = new AutomaticDiagnostics({ dataRoot: root, relayOrigin: 'https://relay.test', consent: () => true,
    sources: async () => [], fetcher, onUndelivered: (report) => { reports.push(report); } });
  cleanup.push(async () => { await service.stop(); rmSync(root, { recursive: true, force: true }); });
  const due = (id: string) => { const item = service.outbox.get(id)!; service.outbox.defer(item, 0, 'test_due'); };
  return { service, reports, due };
}
it('reports a bundle the relay permanently rejects, with its run', async () => {
  const f = relayFailing(413);
  const id = f.service.record({ sourceId: 'run:big', at: Date.now(), kind: 'terminal_failure', runId: 'run-big' })!;
  await f.service.tick(); // collect
  await f.service.tick(); // upload, rejected
  expect(f.service.outbox.get(id)?.state).toBe('discarded');
  expect(f.reports).toEqual([expect.objectContaining({
    incidentId: id, outcome: 'discarded', reason: 'relay_413', runId: 'run-big', kind: 'terminal_failure',
  })]);
});
it('reports once that a bundle is still undelivered after repeated transient failures', async () => {
  const f = relayFailing(503);
  const id = f.service.record({ sourceId: 'run:flaky', at: Date.now(), kind: 'terminal_failure', runId: 'run-flaky' })!;
  await f.service.tick(); // collect (attempt 1)
  for (let i = 0; i < 4; i++) { f.due(id); await f.service.tick(); } // uploads, attempts 2..5
  expect(f.service.outbox.get(id)?.state).toBe('pending');
  expect(f.reports).toEqual([expect.objectContaining({
    incidentId: id, outcome: 'retrying', reason: 'relay_503', attempts: 3, runId: 'run-flaky',
  })]);
});
it('reports a bundle that expired undelivered, keeping its run after the content is scrubbed', async () => {
  const f = relayFailing(503);
  const id = f.service.record({ sourceId: 'run:old', at: Date.now(), kind: 'terminal_failure', runId: 'run-old' })!;
  f.service.outbox.prune(Date.now() + PENDING_MAX_AGE);
  await f.service.tick();
  expect(f.service.outbox.get(id)?.summary).toBe('{}');
  expect(f.reports).toEqual([expect.objectContaining({ incidentId: id, outcome: 'discarded', reason: 'pending_expired', runId: 'run-old' })]);
});

// The loss report is the only durable trace of a lost bundle. It must stay in
// the outbox until the analytics hand-off settles: a daemon stop while the
// hand-off is pending, or a rejected hand-off, must leave it for the next drain.
function relayRejecting(root: string, onUndelivered: (report: any) => unknown) {
  const fetcher = vi.fn(async () => new Response('{}', { status: 413 })) as unknown as typeof fetch;
  return new AutomaticDiagnostics({ dataRoot: root, relayOrigin: 'https://relay.test', consent: () => true,
    sources: async () => [], fetcher, onUndelivered: onUndelivered as never });
}
it('keeps a loss report whose hand-off is still pending when the daemon stops', async () => {
  const root = mkdtempSync(join(tmpdir(), 'od-auto-loss-pending-'));
  cleanup.push(async () => { rmSync(root, { recursive: true, force: true }); });
  let calls = 0;
  const first = relayRejecting(root, () => { calls += 1; return new Promise(() => {}); });
  const id = first.record({ sourceId: 'run:big', at: Date.now(), kind: 'terminal_failure', runId: 'run-big' })!;
  // Drive collect and the rejected upload until the hand-off starts; it never settles.
  await vi.waitFor(() => { void first.tick(); expect(calls).toBe(1); }, { timeout: 5_000, interval: 20 });
  await first.stop();

  const delivered: any[] = [];
  const second = relayRejecting(root, async (report) => { delivered.push(report); });
  cleanup.push(async () => { await second.stop(); });
  await second.tick();
  expect(delivered).toEqual([expect.objectContaining({ incidentId: id, outcome: 'discarded', reason: 'relay_413' })]);
  await second.tick();
  expect(delivered).toHaveLength(1);
});
it('keeps a loss report whose hand-off rejects and sends it on the next drain', async () => {
  const root = mkdtempSync(join(tmpdir(), 'od-auto-loss-reject-'));
  const delivered: any[] = [];
  let fail = true;
  const service = relayRejecting(root, async (report) => {
    if (fail) throw new Error('analytics unavailable');
    delivered.push(report);
  });
  cleanup.push(async () => { await service.stop(); rmSync(root, { recursive: true, force: true }); });
  const id = service.record({ sourceId: 'run:big', at: Date.now(), kind: 'terminal_failure', runId: 'run-big' })!;
  await service.tick(); // collect
  await service.tick(); // upload rejected, hand-off rejects
  expect(delivered).toEqual([]);
  fail = false;
  await service.tick();
  expect(delivered).toEqual([expect.objectContaining({ incidentId: id, outcome: 'discarded' })]);
  await service.tick();
  expect(delivered).toHaveLength(1);
});
