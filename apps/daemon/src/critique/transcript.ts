import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, open } from 'node:fs/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { PanelEvent } from '@open-design/contracts/critique';

/**
 * Default gzip threshold (256 KiB). Files whose cumulative UTF-8 byte size
 * exceeds this value are written as .ndjson.gz; smaller files stay plain.
 * @see specs/current/critique-theater.md § Persistence (transcript files)
 */
const DEFAULT_GZIP_THRESHOLD_BYTES = 256 * 1024;

/**
 * Write a sequence of PanelEvents as newline-delimited JSON to a transcript
 * file under the artifact directory. Files larger than gzipThresholdBytes
 * are gzipped to .ndjson.gz; smaller files stay as plain .ndjson. The
 * threshold is applied to the cumulative UTF-8 byte size of the serialized
 * payload, not the array length, so multibyte transcripts size correctly.
 *
 * Backpressure-aware: events are streamed via Node streams, so the writer
 * never holds the full transcript in memory.
 *
 * Returns the path written (relative to artifactDir). Caller persists the
 * relative path on the critique_runs row.
 *
 * @see specs/current/critique-theater.md § Persistence (transcript files)
 */
export async function writeTranscript(
  artifactDir: string,
  events: AsyncIterable<PanelEvent> | Iterable<PanelEvent>,
  opts?: { gzipThresholdBytes?: number },
): Promise<{ path: string; bytes: number; gzipped: boolean }> {
  if (typeof artifactDir !== 'string' || artifactDir.length === 0) {
    throw new RangeError('writeTranscript: artifactDir must be a non-empty string');
  }
  if (
    events === null ||
    events === undefined ||
    (typeof events !== 'object' && typeof events !== 'function')
  ) {
    throw new RangeError('writeTranscript: events must be iterable');
  }
  // Validate that the value is actually iterable / async-iterable.
  const hasAsyncIter = Symbol.asyncIterator in (events as object);
  const hasSyncIter = Symbol.iterator in (events as object);
  if (!hasAsyncIter && !hasSyncIter) {
    throw new RangeError('writeTranscript: events must be iterable');
  }

  const threshold = opts?.gzipThresholdBytes ?? DEFAULT_GZIP_THRESHOLD_BYTES;

  await mkdir(artifactDir, { recursive: true });

  const tempPath = join(artifactDir, `transcript.tmp.${process.pid}.${Date.now()}.ndjson`);
  const finalNdjson = join(artifactDir, 'transcript.ndjson');
  const finalGz = join(artifactDir, 'transcript.ndjson.gz');

  let totalBytes = 0;

  // Stream events to temp file, accumulating byte count.
  const ws = createWriteStream(tempPath, { encoding: 'utf8' });

  try {
    await new Promise<void>((resolve, reject) => {
      ws.on('error', reject);
      ws.on('finish', resolve);

      (async () => {
        try {
          for await (const event of events as AsyncIterable<PanelEvent>) {
            const line = JSON.stringify(event) + '\n';
            const lineBytes = Buffer.byteLength(line, 'utf8');
            totalBytes += lineBytes;
            const ok = ws.write(line);
            if (!ok) {
              // Backpressure: wait for drain before continuing.
              await new Promise<void>((res, rej) => {
                ws.once('drain', res);
                ws.once('error', rej);
              });
            }
          }
          ws.end();
        } catch (err) {
          ws.destroy(err instanceof Error ? err : new Error(String(err)));
          reject(err);
        }
      })();
    });

    const gzipped = totalBytes > threshold;

    if (gzipped) {
      // Write gzip output to a temp file first, fsync, then atomic-rename.
      // A crash mid-write leaves the .gz.tmp but never the final .gz, so
      // partial files can't be mistaken for valid data on the next read.
      const gzTempPath = join(artifactDir, `transcript.tmp.${process.pid}.${Date.now()}.ndjson.gz.tmp`);
      try {
        await pipeline(
          createReadStream(tempPath),
          createGzip(),
          createWriteStream(gzTempPath),
        );
        // fsync: flush OS write buffers before rename so crash after rename
        // cannot leave a zero-length .gz.
        const fh = await open(gzTempPath, 'r+');
        try {
          await fh.sync();
        } finally {
          await fh.close();
        }
        await rename(gzTempPath, finalGz);
      } catch (gzErr) {
        // Unlink the .gz.tmp so no partial file lingers.
        await rm(gzTempPath, { force: true });
        throw gzErr;
      }
      await rm(tempPath, { force: true });
      return { path: 'transcript.ndjson.gz', bytes: totalBytes, gzipped: true };
    } else {
      await rename(tempPath, finalNdjson);
      return { path: 'transcript.ndjson', bytes: totalBytes, gzipped: false };
    }
  } catch (err) {
    // Ensure the write stream has fully closed before unlinking. If the
    // iterable fails before the lazy open completes, unlinking immediately can
    // race with createWriteStream and leave a late-created temp file behind.
    ws.destroy();
    if (!ws.closed) {
      await new Promise<void>((resolve) => {
        ws.once('close', resolve);
      });
    }
    // Ensure temp file is cleaned up on any failure.
    await rm(tempPath, { force: true });
    throw err;
  }
}

/**
 * Inverse of writeTranscript. Streams a transcript file (.ndjson or .ndjson.gz)
 * back out as PanelEvents. Used by replay paths and by Phase 11 e2e.
 *
 * @see specs/current/critique-theater.md § Persistence (transcript files)
 */
export async function* readTranscript(
  artifactDir: string,
  fileName: string,
): AsyncIterable<PanelEvent> {
  if (!fileName.endsWith('.ndjson') && !fileName.endsWith('.ndjson.gz')) {
    throw new RangeError(
      `readTranscript: unknown extension on "${fileName}", expected .ndjson or .ndjson.gz`,
    );
  }

  const filePath = join(artifactDir, fileName);
  const isGz = fileName.endsWith('.ndjson.gz');

  const fileStream = createReadStream(filePath);
  const source: NodeJS.ReadableStream = isGz
    ? fileStream.pipe(createGunzip())
    : fileStream;

  const rl = createInterface({
    input: source as unknown as NodeJS.ReadableStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const event = JSON.parse(trimmed) as PanelEvent;
    yield event;
  }
}
