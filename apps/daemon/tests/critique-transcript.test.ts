import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { PanelEvent } from '@open-design/contracts/critique';
import { writeTranscript, readTranscript } from '../src/critique/transcript.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRunStarted(runId = 'r1'): PanelEvent {
  return {
    type: 'run_started',
    runId,
    protocolVersion: 1,
    cast: ['designer', 'critic', 'brand', 'a11y', 'copy'],
    maxRounds: 3,
    threshold: 8.0,
    scale: 10,
  };
}

function makeShip(runId = 'r1'): PanelEvent {
  return {
    type: 'ship',
    runId,
    round: 1,
    composite: 9.0,
    status: 'shipped',
    artifactRef: { projectId: 'p1', artifactId: 'a1' },
    summary: 'done',
  };
}

async function collect(iter: AsyncIterable<PanelEvent>): Promise<PanelEvent[]> {
  const out: PanelEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'od-transcript-test-'));
});
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeTranscript + readTranscript', () => {
  it('writes plain .ndjson for small input and events round-trip', async () => {
    const events: PanelEvent[] = [makeRunStarted(), makeShip()];
    const artifactDir = join(tmpDir, 'run1');
    const result = await writeTranscript(artifactDir, events, { gzipThresholdBytes: 1_000_000 });

    expect(result.path).toBe('transcript.ndjson');
    expect(result.gzipped).toBe(false);
    expect(result.bytes).toBeGreaterThan(0);
    expect(existsSync(join(artifactDir, 'transcript.ndjson'))).toBe(true);

    const roundTripped = await collect(readTranscript(artifactDir, 'transcript.ndjson'));
    expect(roundTripped).toEqual(events);
  });

  it('writes .ndjson.gz for large input (over threshold) and events round-trip', async () => {
    // Use a very low threshold to force gzip.
    const events: PanelEvent[] = [makeRunStarted(), makeShip()];
    const artifactDir = join(tmpDir, 'run2');
    const result = await writeTranscript(artifactDir, events, { gzipThresholdBytes: 1 });

    expect(result.path).toBe('transcript.ndjson.gz');
    expect(result.gzipped).toBe(true);
    expect(existsSync(join(artifactDir, 'transcript.ndjson.gz'))).toBe(true);

    // Verify gzip integrity by gunzipping manually and confirming it parses.
    const lines: string[] = [];
    const rl = createInterface({
      input: createReadStream(join(artifactDir, 'transcript.ndjson.gz')).pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (line.trim()) lines.push(line.trim());
    }
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(events[0]);

    const roundTripped = await collect(readTranscript(artifactDir, 'transcript.ndjson.gz'));
    expect(roundTripped).toEqual(events);
  });

  it('empty events iterable writes a file with 0 bytes and round-trip yields nothing', async () => {
    const artifactDir = join(tmpDir, 'run-empty');
    const result = await writeTranscript(artifactDir, [], { gzipThresholdBytes: 1_000_000 });

    expect(result.bytes).toBe(0);
    expect(result.gzipped).toBe(false);
    expect(existsSync(join(artifactDir, 'transcript.ndjson'))).toBe(true);

    const roundTripped = await collect(readTranscript(artifactDir, 'transcript.ndjson'));
    expect(roundTripped).toHaveLength(0);
  });

  it('multibyte CJK content sizes correctly under UTF-8 byte cap', async () => {
    const cjkEvent: PanelEvent = {
      type: 'panelist_dim',
      runId: 'r1',
      round: 1,
      role: 'critic',
      dimName: 'hierarchy',
      dimScore: 7,
      dimNote: '字体层次不清晰，标题与正文对比不足',
    };
    const artifactDir = join(tmpDir, 'run-cjk');
    // Threshold below CJK content byte count to force gzip.
    const threshold = 10;
    const result = await writeTranscript(artifactDir, [cjkEvent], { gzipThresholdBytes: threshold });

    const serialized = JSON.stringify(cjkEvent) + '\n';
    const expected = Buffer.byteLength(serialized, 'utf8');
    expect(result.bytes).toBe(expected);
    // CJK chars are multi-byte, so bytes > string length.
    expect(result.bytes).toBeGreaterThan(serialized.length);
    expect(result.gzipped).toBe(true);

    const roundTripped = await collect(readTranscript(artifactDir, 'transcript.ndjson.gz'));
    expect(roundTripped).toEqual([cjkEvent]);
  });

  it('temp file is cleaned up on success', async () => {
    const artifactDir = join(tmpDir, 'run-cleanup');
    await writeTranscript(artifactDir, [makeRunStarted()], { gzipThresholdBytes: 1_000_000 });

    const files = readdirSync(artifactDir);
    const tempFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tempFiles).toHaveLength(0);
  });

  it('temp file is cleaned up on failure and error propagates', async () => {
    const artifactDir = join(tmpDir, 'run-fail');
    await mkdirIfNeeded(artifactDir);

    async function* failingSource(): AsyncIterable<PanelEvent> {
      yield makeRunStarted();
      throw new Error('mid-stream failure');
    }

    await expect(
      writeTranscript(artifactDir, failingSource(), { gzipThresholdBytes: 1_000_000 }),
    ).rejects.toThrow('mid-stream failure');

    // No temp file should remain.
    const files = existsSync(artifactDir) ? readdirSync(artifactDir) : [];
    const tempFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tempFiles).toHaveLength(0);
  });

  it('readTranscript detects .gz vs .ndjson by extension', async () => {
    const artifactDir = join(tmpDir, 'run-ext');
    const events = [makeRunStarted(), makeShip()];

    // Write both plain and gzipped.
    await writeTranscript(artifactDir, events, { gzipThresholdBytes: 1_000_000 });
    // Write gzipped version too by using a low threshold.
    const artifactDir2 = join(tmpDir, 'run-ext2');
    await writeTranscript(artifactDir2, events, { gzipThresholdBytes: 1 });

    const plain = await collect(readTranscript(artifactDir, 'transcript.ndjson'));
    const gz = await collect(readTranscript(artifactDir2, 'transcript.ndjson.gz'));

    expect(plain).toEqual(events);
    expect(gz).toEqual(events);
  });

  it('readTranscript throws on unknown extension', async () => {
    const artifactDir = join(tmpDir, 'run-badext');
    await expect(
      collect(readTranscript(artifactDir, 'transcript.json')),
    ).rejects.toThrow(RangeError);
  });

  it('writeTranscript throws RangeError on empty artifactDir', async () => {
    await expect(writeTranscript('', [])).rejects.toThrow(RangeError);
  });

  it('writeTranscript throws RangeError on non-iterable events', async () => {
    // Pass a plain object that has neither Symbol.iterator nor Symbol.asyncIterator.
    await expect(
      writeTranscript(
        join(tmpDir, 'run-badevents'),
        {} as unknown as Iterable<PanelEvent>,
      ),
    ).rejects.toThrow(RangeError);
  });

  it('gzip crash leaves no final .gz or .gz.tmp on disk (Defect 8)', async () => {
    const artifactDir = join(tmpDir, 'run-gz-crash');
    await mkdirIfNeeded(artifactDir);

    // Source that throws mid-stream to simulate a crash during write.
    async function* failingGzipSource(): AsyncIterable<PanelEvent> {
      yield makeRunStarted();
      throw new Error('simulated gzip crash');
    }

    // Use threshold=1 to force gzip path.
    await expect(
      writeTranscript(artifactDir, failingGzipSource(), { gzipThresholdBytes: 1 }),
    ).rejects.toThrow('simulated gzip crash');

    // The final .gz must not exist.
    expect(existsSync(join(artifactDir, 'transcript.ndjson.gz'))).toBe(false);

    // No .gz.tmp should remain.
    const files = existsSync(artifactDir) ? readdirSync(artifactDir) : [];
    const gzTmpFiles = files.filter((f) => f.endsWith('.gz.tmp'));
    expect(gzTmpFiles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

async function mkdirIfNeeded(dir: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
}
