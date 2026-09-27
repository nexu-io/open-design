import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';
import { buildAutomaticDiagnostics } from '../src/automatic.js';

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
