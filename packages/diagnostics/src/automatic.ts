import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { collectLogSource, type LogSource } from './sources.js';
import { redactJsonText, redactJsonValue, type RedactionOptions } from './redaction.js';

export const DIAGNOSTIC_CHUNK_BYTES = 4 * 1024 * 1024;
export const DIAGNOSTIC_MAX_BYTES = 100 * 1024 * 1024;
export interface AutomaticDiagnosticManifest {
  version: 1;
  incidentId: string;
  completeness: 'complete' | 'partial';
  compressedBytes: number;
  chunks: Array<{ index: number; sizeBytes: number; sha256: string }>;
  recoveredAt?: number;
}
export interface AutomaticDiagnosticSource extends LogSource {
  /** Bytes before the last consent boundary must never enter an automatic upload. */
  startOffset?: number;
  omitReason?: string;
}

/** Gzipped JSONL records, written sequentially to bounded chunks; no binary discovery. */
export async function buildAutomaticDiagnostics(input: {
  directory: string; incidentId: string; summary: unknown; sources: AutomaticDiagnosticSource[];
  redaction?: RedactionOptions; signal?: AbortSignal;
}): Promise<{ manifest: AutomaticDiagnosticManifest }> {
  await mkdir(input.directory, { recursive: true, mode: 0o700 });
  const manifest: AutomaticDiagnosticManifest = { version: 1, incidentId: input.incidentId,
    completeness: 'complete', compressedBytes: 0, chunks: [] };
  // A raw budget leaves space for JSON framing and gzip overhead, even for incompressible logs.
  let remaining = 96 * 1024 * 1024;
  const notes: Array<{ name: string; reason: string }> = [];
  if (input.sources.length === 0) notes.push({ name: 'logs', reason: 'no_log_sources' });
  if (input.summary && typeof input.summary === 'object' && 'partial' in input.summary && input.summary.partial === true) {
    notes.push({ name: 'incident', reason: 'incident_summary_truncated' });
  }
  async function* records() {
    yield JSON.stringify({ type: 'incident', format: 'diagnostic-jsonl-gzip-v1',
      summary: redactJsonValue(input.summary, input.redaction) }) + '\n';
    for (const source of input.sources) {
      input.signal?.throwIfAborted();
      if (source.kind === 'binary' || /\.(dmp|core|zip)$/i.test(source.name)) continue;
      if (source.omitReason) { notes.push({ name: source.name, reason: source.omitReason }); continue; }
      const size = await stat(source.absolutePath).then((s) => s.size).catch(() => 0);
      const available = source.startOffset === undefined ? Infinity : Math.max(0, size - source.startOffset);
      const limit = Math.min(source.tailBytes ?? DIAGNOSTIC_CHUNK_BYTES, DIAGNOSTIC_CHUNK_BYTES, remaining, available);
      if (available === 0) { notes.push({ name: source.name, reason: 'consent_boundary' }); continue; }
      if (limit <= 0) { notes.push({ name: source.name, reason: 'incident_size_limit' }); continue; }
      const file = await collectLogSource({ ...source, tailBytes: limit }, input.redaction);
      if (file.error) { notes.push({ name: source.name, reason: 'source_unavailable' }); continue; }
      if (size > limit) notes.push({ name: source.name, reason: 'tail_truncated' });
      // Text logs can contain JSONL credentials: redact each complete JSON record structurally.
      const content = String(file.content ?? '').split('\n').map((line) => redactJsonText(line, input.redaction)).join('\n');
      const encoded = JSON.stringify({ type: 'file', name: source.name, content }) + '\n';
      const bytes = Buffer.byteLength(encoded);
      if (bytes > remaining) { notes.push({ name: source.name, reason: 'incident_size_limit' }); continue; }
      remaining -= bytes;
      yield encoded;
    }
    manifest.completeness = notes.length ? 'partial' : 'complete';
    yield JSON.stringify({ type: 'collection', completeness: manifest.completeness, notes }) + '\n';
  }
  let pending = Buffer.alloc(0);
  async function flush(bytes: Buffer) {
    input.signal?.throwIfAborted();
    manifest.compressedBytes += bytes.length;
    if (manifest.compressedBytes > DIAGNOSTIC_MAX_BYTES) throw new Error('diagnostic_size_limit');
    const index = manifest.chunks.length;
    await writeFile(join(input.directory, String(index)), bytes, { mode: 0o600 });
    manifest.chunks.push({ index, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const output = new Writable({
    write(data: Buffer, _encoding, callback) {
      void (async () => {
        pending = Buffer.concat([pending, data]);
        while (pending.length >= DIAGNOSTIC_CHUNK_BYTES) {
          await flush(pending.subarray(0, DIAGNOSTIC_CHUNK_BYTES));
          pending = pending.subarray(DIAGNOSTIC_CHUNK_BYTES);
        }
      })().then(() => callback(), callback);
    },
    final(callback) { void flush(pending).then(() => callback(), callback); },
  });
  await pipeline(Readable.from(records()), createGzip(), output, { signal: input.signal });
  return { manifest };
}
