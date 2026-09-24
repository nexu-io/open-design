import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DiagnosticOutbox, PENDING_MAX_AGE, QUEUE_MAX_BYTES } from '../src/storage/diagnostic-outbox.js';
const dirs: string[] = []; const stores: DiagnosticOutbox[] = [];
function fixture() { const dir = mkdtempSync(join(tmpdir(), 'od-outbox-')); dirs.push(dir); const store = new DiagnosticOutbox(dir); stores.push(store); return { dir, store }; }
afterEach(() => { for (const s of stores.splice(0)) { try { s.close(); } catch {} } for (const d of dirs.splice(0)) rmSync(d, { force: true, recursive: true }); });
it('deduplicates sources, survives restart, and fences expired leases', () => {
  const { dir, store } = fixture(); const first = store.enqueue('run:a:error:1', '{}', 100);
  expect(store.enqueue('run:a:error:1', '{}', 101).id).toBe(first.id);
  const stale = store.claim(101, 10)!; store.close();
  const reopened = new DiagnosticOutbox(dir); stores.push(reopened);
  expect(reopened.claim(105)).toBeUndefined();
  const current = reopened.claim(112)!;
  expect(reopened.prepared(stale, '{}', 10)).toBe(false);
  expect(reopened.prepared(current, '{}', 10)).toBe(true);
  const upload = reopened.claim(113)!;
  expect(reopened.delivered(upload, 'receipt', 114)).toBe(true);
  expect(reopened.defer(upload, 115, 'late_network_error')).toBe(false);
});
it('scrubs pending content when disabled and keeps the dedupe tombstone after re-enabling', () => {
  const { store } = fixture(); const item = store.enqueue('fault', '{"content":"private"}', 0);
  expect(store.prune(1, false)).toEqual([item.id]);
  expect(store.get(item.id)?.summary).toBe('{}');
  expect(store.enqueue('fault', '{}', 2).state).toBe('discarded');
});
it('recovers interrupted run markers only when capture consent remained enabled', () => {
  const { store } = fixture();
  store.trackRun('run-a', JSON.stringify({ sourceId: 'crash:a', kind: 'active_run', at: 1, runId: 'run-a' }));
  store.recoverRuns(true, 100);
  expect(JSON.parse(store.list()[0]!.summary).kind).toBe('daemon_interrupted');
  store.recoverRuns(true, 101); expect(store.list()).toHaveLength(1);
  store.trackRun('run-b', JSON.stringify({ sourceId: 'crash:b', kind: 'active_run', at: 1, runId: 'run-b' }));
  store.prune(102, false); store.recoverRuns(true, 103);
  expect(store.list()).toHaveLength(1);
});
it('marks recovered faults without replacing their protected content or accepting a stale callback', () => {
  const { store } = fixture(); const item = store.enqueue('error:a', '{"runId":"r"}', 1);
  store.prepared(store.claim(2)!, '{"version":1,"chunks":[{"index":0}]}', 42);
  const upload = store.claim(3)!; store.delivered(upload, 'first', 4);
  store.noteRecovery('r', 5);
  const changed = store.get(item.id)!;
  expect(changed.state).toBe('pending'); expect(changed.bytes).toBe(42);
  expect(JSON.parse(changed.manifest!).recoveredAt).toBe(5);
  expect(JSON.parse(changed.manifest!).chunks).toEqual([{ index: 0 }]);
  expect(store.delivered(upload, 'stale', 6)).toBe(false);
});
it('expires pending incidents and evicts oldest content to enforce the byte budget', () => {
  const { store } = fixture(); const expired = store.enqueue('old', '{}', 0);
  expect(store.prune(PENDING_MAX_AGE)).toContain(expired.id);
  const first = store.enqueue('new1', '{}', PENDING_MAX_AGE);
  store.prepared(store.claim(PENDING_MAX_AGE)!, '{}', QUEUE_MAX_BYTES);
  expect(store.prune(PENDING_MAX_AGE + 1, true, 100)).toContain(first.id);
  expect(store.get(first.id)?.reason).toBe('capacity_evicted');
});
