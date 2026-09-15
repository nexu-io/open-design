import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { TelemetryOutbox } from '../../src/storage/telemetry-outbox.js';

it('A-04/A-05 freezes bytes and persists idempotent retry across restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'evidence-outbox-'));
  const file = path.join(dir, 'outbox.sqlite');
  let outbox = new TelemetryOutbox(file);
  try {
    const original = Buffer.from('immutable synthetic artifact');
    const sha = createHash('sha256').update(original).digest('hex');
    expect(outbox.enqueue('object', 'stable-key', { sha }, [original], 1000)).toBe('queued');
    original.fill(0);
    const seen: string[] = [];
    await outbox.drain(async job => { seen.push(job.key); throw new Error('offline'); }, 1000);
    outbox.close();
    outbox = new TelemetryOutbox(file);
    expect(outbox.enqueue('object', 'stable-key', { different: true }, [], 1500)).toBe('existing');
    expect(outbox.snapshot(sha).toString()).toBe('immutable synthetic artifact');
    await outbox.drain(async job => { seen.push(job.key); return { status: 'retry', reason: 'http_503' }; }, 2000);
    await outbox.drain(async job => { seen.push(job.key); return { status: 'materialized', receipt: { sha } }; }, 4000);
    await outbox.drain(async () => { throw new Error('must not resend'); }, 10000);
    expect(seen).toEqual(['stable-key', 'stable-key', 'stable-key']);
    expect(outbox.inspect('object', 'stable-key')).toMatchObject({ status: 'materialized', attempts: 3 });
  } finally { outbox.close(); await rm(dir, { recursive: true, force: true }); }
});

it('A-06/A-10 acceptance is persisted but not materialized; capacity rejects only evidence', () => {
  const box = new TelemetryOutbox(':memory:', { bytes: 100, jobs: 1, attempts: 2, ttlMs: 10000 });
  try {
    expect(box.enqueue('feedback', 'score+hash', { value: -1 }, [], 0)).toBe('queued');
    expect(box.enqueue('feedback', 'score+hash', { value: -1 }, [], 0)).toBe('existing');
    expect(box.enqueue('object', 'overflow', {}, [], 0)).toBe('capacity_exceeded');
    expect(box.stats().jobs).toBe(1);
  } finally { box.close(); }
});

it('A-06 keeps 202 pending and stops retries after a terminal contract error', async () => {
  const box = new TelemetryOutbox(':memory:');
  try {
    box.enqueue('object', 'accepted', {}, [], 0);
    await box.drain(async () => ({ status: 'accepted', reason: 'receipt_pending' }), 0);
    expect(box.inspect('object', 'accepted')).toMatchObject({ status: 'accepted', last_reason: 'receipt_pending' });
    expect(box.stats().pending).toBe(1);
    await box.drain(async () => ({ status: 'terminal', reason: 'payload_too_large' }), 1000);
    let sends = 0;
    await box.drain(async () => { sends++; return { status: 'accepted' }; }, 10000);
    expect(sends).toBe(0);
    expect(box.stats().pending).toBe(0);
  } finally { box.close(); }
});

it('A-10 new feedback supersedes an in-flight old rating even when its response arrives later', async () => {
  const box = new TelemetryOutbox(':memory:');
  try {
    box.enqueue('feedback', 'old', { context: { runId: 'run', rating: 1 } }, [], 0);
    await box.drain(async () => {
      box.enqueue('feedback', 'new', { context: { runId: 'run', rating: -1 } }, [], 0);
      return { status: 'accepted' };
    }, 0);
    expect(box.inspect('feedback', 'old')?.status).toBe('superseded');
    const seen: string[] = [];
    await box.drain(async job => { seen.push(job.key); return { status: 'materialized' }; }, 1000);
    expect(seen).toEqual(['new']);
  } finally { box.close(); }
});

it('accepted feedback ends submission retries without claiming materialization', async () => {
  const box = new TelemetryOutbox(':memory:');
  try {
    box.enqueue('feedback', 'accepted-score', {}, [], 0);
    let sends = 0;
    await box.drain(async () => { sends++; return { status: 'accepted', reason: 'receipt_pending' }; }, 0);
    await box.drain(async () => { sends++; return { status: 'accepted' }; }, 999999);
    expect(sends).toBe(1);
    expect(box.inspect('feedback', 'accepted-score')).toMatchObject({ status: 'accepted', attempts: 1 });
    expect(box.read('feedback', 'accepted-score')?.receipt).toBeUndefined();
  } finally { box.close(); }
});
