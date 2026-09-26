import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';
import { buildAutomaticDiagnostics, DIAGNOSTIC_CHUNK_BYTES, DIAGNOSTIC_DELIVERY_LOG_PREFIX } from '../src/automatic.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
it('streams text only, redacts JSONL secrets, and reports omissions and truncation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostic-auto-')); dirs.push(dir);
  await writeFile(join(dir, 'events'), '{"token":"hidden"}\n{"message":"failure"}\n[debug] {"apiKey":"prefixed-secret"}\n');
  await writeFile(join(dir, 'dump'), 'NEVER UPLOAD');
  const result = await buildAutomaticDiagnostics({ directory: join(dir, 'bundle'), incidentId: 'incident-a',
    summary: { error: 'Authorization: Bearer credential123' }, sources: [
      { name: 'events.jsonl', absolutePath: join(dir, 'events'), kind: 'text' },
      { name: 'crash.dmp', absolutePath: join(dir, 'dump'), kind: 'binary' },
      { name: 'missing.log', absolutePath: join(dir, 'missing'), kind: 'text' },
    ] });
  const chunks = await Promise.all(result.manifest.chunks.map((c) => readFile(join(dir, 'bundle', String(c.index)))));
  const text = gunzipSync(Buffer.concat(chunks)).toString();
  expect(text).not.toContain('hidden'); expect(text).not.toContain('credential123'); expect(text).not.toContain('NEVER UPLOAD');
  expect(text).not.toContain('prefixed-secret');
  expect(text).toContain('failure'); expect(text).toContain('missing.log');
  expect(result.manifest.completeness).toBe('partial');
  expect(result.manifest.compressedBytes).toBe(Buffer.concat(chunks).length);
});
it('drops earlier delivery receipts so they cannot crowd the real log out of the bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostic-auto-')); dirs.push(dir);
  const receipt = `${DIAGNOSTIC_DELIVERY_LOG_PREFIX} incident-a diagnostics/v1/manifest.json\n`;
  const receipts = receipt.repeat(Math.ceil(DIAGNOSTIC_CHUNK_BYTES / Buffer.byteLength(receipt)) + 1);
  expect(Buffer.byteLength(receipts)).toBeGreaterThan(DIAGNOSTIC_CHUNK_BYTES);
  await writeFile(join(dir, 'daemon'), '[od] hub events channel connected\n' + receipts + '[od] run failed: upstream closed');
  const result = await buildAutomaticDiagnostics({ directory: join(dir, 'bundle'), incidentId: 'incident-b',
    summary: {}, sources: [{ name: 'logs/daemon/latest.log', absolutePath: join(dir, 'daemon'), kind: 'text' }] });
  const chunks = await Promise.all(result.manifest.chunks.map((c) => readFile(join(dir, 'bundle', String(c.index)))));
  const text = gunzipSync(Buffer.concat(chunks)).toString();
  expect(text).not.toContain(DIAGNOSTIC_DELIVERY_LOG_PREFIX);
  expect(text).toContain('hub events channel connected');
  expect(text).toContain('run failed: upstream closed');
});

it.each([false, true])('respects the consent boundary while scanning past receipts (mid-line: %s)', async (midLine) => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostic-auto-')); dirs.push(dir);
  const before = 'private before consent\n';
  const partial = midLine ? 'private boundary fragment\n' : '';
  const kept = '故障 after consent\n';
  const receipt = `${DIAGNOSTIC_DELIVERY_LOG_PREFIX} ${'r'.repeat(128 * 1024)}\n`;
  await writeFile(join(dir, 'daemon'), before + partial + kept + receipt);
  const result = await buildAutomaticDiagnostics({ directory: join(dir, 'bundle'), incidentId: 'consent',
    summary: {}, sources: [{ name: 'daemon.log', absolutePath: join(dir, 'daemon'), kind: 'text',
      startOffset: Buffer.byteLength(before) + (midLine ? 3 : 0) }] });
  const chunks = await Promise.all(result.manifest.chunks.map((c) => readFile(join(dir, 'bundle', String(c.index)))));
  const records = gunzipSync(Buffer.concat(chunks)).toString().trim().split('\n').map((line) => JSON.parse(line));
  expect(records.find((record) => record.type === 'file').content).toBe(kept);
});

it.each([0, 1])('applies the byte budget to complete retained lines (extra byte: %s)', async (extraByte) => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostic-auto-')); dirs.push(dir);
  const older = 'older failure\n';
  const newest = '最新 failure\n';
  const receipt = `${DIAGNOSTIC_DELIVERY_LOG_PREFIX} ${'r'.repeat(128 * 1024)}\n`;
  const limit = Buffer.byteLength(older + newest) - extraByte;
  await writeFile(join(dir, 'daemon'), 'outside budget\n' + older + receipt + newest);
  const result = await buildAutomaticDiagnostics({ directory: join(dir, 'bundle'), incidentId: 'budget',
    summary: {}, sources: [{ name: 'daemon.log', absolutePath: join(dir, 'daemon'), kind: 'text', tailBytes: limit }] });
  const chunks = await Promise.all(result.manifest.chunks.map((c) => readFile(join(dir, 'bundle', String(c.index)))));
  const records = gunzipSync(Buffer.concat(chunks)).toString().trim().split('\n').map((line) => JSON.parse(line));
  const content = records.find((record) => record.type === 'file').content;
  expect(content).toBe(extraByte ? newest : older + newest);
  expect(Buffer.byteLength(content)).toBeLessThanOrEqual(limit);
});
