import { createHash } from 'node:crypto';
import { mkdir, open, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { collectLogSource, type LogSource } from './sources.js';
import { redactJsonText, redactJsonValue, type RedactionOptions } from './redaction.js';

export const DIAGNOSTIC_CHUNK_BYTES = 4 * 1024 * 1024;
export const DIAGNOSTIC_MAX_BYTES = 100 * 1024 * 1024;
/**
 * Prefix of the daemon's per-delivery receipt log line. Automatic bundles drop
 * these lines: otherwise every upload re-ships the receipts of all earlier
 * uploads and, on a busy device, they crowd the real log out of the tail.
 */
export const DIAGNOSTIC_DELIVERY_LOG_PREFIX = '[diagnostics] incident delivered';
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

/** Read the filtered tail with bounded memory, even for receipt-only or oversized lines. */
async function readAutomaticTextTail(source: AutomaticDiagnosticSource, limit: number, signal?: AbortSignal): Promise<string> {
  const file = await open(source.absolutePath, 'r');
  try {
    let position = (await file.stat()).size;
    const start = Math.max(0, source.startOffset ?? 0);
    const block = Buffer.alloc(64 * 1024);
    const retained: Buffer[] = [];
    let remaining = limit;
    let pending: Buffer = Buffer.alloc(0);
    let lineBytes = 0;
    // Keep enough of an oversized line's beginning to recognize a receipt.
    const pendingLimit = Math.max(limit, Buffer.byteLength(DIAGNOSTIC_DELIVERY_LOG_PREFIX));
    function prepend(part: Buffer) {
      lineBytes += part.length;
      pending = Buffer.concat([part, pending]).subarray(0, pendingLimit);
    }
    function retainLine(): boolean {
      if (!pending.toString('utf8').startsWith(DIAGNOSTIC_DELIVERY_LOG_PREFIX)) {
        if (lineBytes > remaining) return false;
        if (lineBytes > 0) retained.push(pending);
        remaining -= lineBytes;
      }
      pending = Buffer.alloc(0);
      lineBytes = 0;
      return remaining > 0;
    }
    while (position > start) {
      signal?.throwIfAborted();
      const length = Math.min(block.length, position - start);
      position -= length;
      const { bytesRead } = await file.read(block, 0, length, position);
      if (bytesRead !== length) throw new Error('log changed during collection');
      let end = bytesRead;
      for (let i = bytesRead - 1; i >= 0; i--) {
        if (block[i] !== 0x0a) continue;
        prepend(block.subarray(i + 1, end));
        if (!retainLine()) return Buffer.concat(retained.reverse()).toString('utf8');
        end = i + 1;
      }
      prepend(block.subarray(0, end));
    }
    // A consent boundary can fall inside a record; never export that fragment.
    if (start === 0) retainLine();
    else {
      const { bytesRead } = await file.read(block, 0, 1, start - 1);
      if (bytesRead === 1 && block[0] === 0x0a) retainLine();
    }
    return Buffer.concat(retained.reverse()).toString('utf8');
  } finally {
    await file.close();
  }
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
      const file = source.kind === 'text'
        ? await readAutomaticTextTail(source, limit, input.signal)
          .then((content) => ({ content, error: false }))
          .catch(() => ({ content: '', error: true }))
        : await collectLogSource({ ...source, tailBytes: limit }, input.redaction);
      input.signal?.throwIfAborted();
      if (file.error) { notes.push({ name: source.name, reason: 'source_unavailable' }); continue; }
      if (size > limit) notes.push({ name: source.name, reason: 'tail_truncated' });
      // Text logs can contain JSONL credentials: redact each complete JSON record structurally.
      const content = String(file.content ?? '').split('\n')
        .filter((line) => !line.startsWith(DIAGNOSTIC_DELIVERY_LOG_PREFIX))
        .map((line) => redactJsonText(line, input.redaction)).join('\n');
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
