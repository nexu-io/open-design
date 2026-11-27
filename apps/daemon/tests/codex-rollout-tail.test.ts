import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

import { readCodexRolloutFirstCall } from '../src/codex-rollout-usage.js';

const sessionId = '019eef4f-7409-7c82-bebe-30504eed3959';
const started = JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } });
const usage = (input: number, cached: number, padding = '') => JSON.stringify({
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: { last_token_usage: { input_tokens: input, cached_input_tokens: cached } },
    padding,
  },
});

describe('Codex last-turn rollout reads', () => {
  let home: string;

  beforeEach(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'od-rollout-tail-'));
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(readFile).mockReset().mockImplementation(actual.readFile);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  function fixture(contents: string): string {
    const day = path.join(home, 'sessions', '2026', '11', '27');
    fs.mkdirSync(day, { recursive: true });
    const file = path.join(day, `rollout-2026-11-27T00-00-00-${sessionId}.jsonl`);
    fs.writeFileSync(file, contents);
    return file;
  }

  function observeReads(failRead = false) {
    const amounts: Array<() => Promise<number>> = [];
    const closed: Array<() => boolean> = [];
    const realOpen = fs.promises.open.bind(fs.promises);
    vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const file = await realOpen(...args);
      const reads = vi.spyOn(file, 'read');
      if (failRead) reads.mockRejectedValueOnce(new Error('read failed'));
      const closes = vi.spyOn(file, 'close');
      amounts.push(async () => {
        let bytes = 0;
        for (const result of reads.mock.results) {
          if (result.type === 'return') bytes += (await result.value).bytesRead;
        }
        return bytes;
      });
      closed.push(() => closes.mock.calls.length === 1);
      return file;
    });
    return {
      async bytesRead(filePath: string) {
        let bytes = (await Promise.all(amounts.map((amount) => amount()))).reduce((a, b) => a + b, 0);
        // Also account for the old whole-file reader, so this is a work-budget
        // regression on main rather than only an assertion about the new helper.
        const calls = vi.mocked(readFile).mock.calls;
        const results = vi.mocked(readFile).mock.results;
        for (let i = 0; i < calls.length; i += 1) {
          if (String(calls[i]?.[0]) !== filePath) continue;
          const result = results[i];
          if (result?.type !== 'return') continue;
          const value = await result.value;
          bytes += typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;
        }
        return bytes;
      },
      allClosed: () => closed.every((isClosed) => isClosed()),
    };
  }

  it('does not reread old turns when the latest turn fits in the tail chunk', async () => {
    const oldLine = JSON.stringify({ type: 'event_msg', payload: { type: 'other', text: 'x'.repeat(500) } });
    const file = fixture([
      started, usage(12, 4), ...Array<string>(4096).fill(oldLine), started, usage(13342, 12672), '',
    ].join('\n'));
    const reads = observeReads();

    const result = await readCodexRolloutFirstCall({ codexHome: home, sessionId });

    assert.equal(result?.first_call_input_tokens, 13342);
    assert.equal(result?.first_call_cache_read_input_tokens, 12672);
    assert.ok(fs.statSync(file).size > 2 * 1024 * 1024);
    const bytes = await reads.bytesRead(file);
    assert.ok(bytes > 0 && bytes <= 64 * 1024, `expected at most one tail chunk, read ${bytes} bytes`);
    assert.equal(reads.allClosed(), true);
  });

  it('keeps the first usable call across CRLF, long UTF-8 records, and byte chunk boundaries', async () => {
    fixture([
      started, usage(10, 0), started, usage(0, 0),
      usage(13342, 12672, '界'.repeat(30_000)), usage(20000, 18000),
    ].join('\r\n'));

    const result = await readCodexRolloutFirstCall({ codexHome: home, sessionId });

    assert.equal(result?.first_call_input_tokens, 13342);
    assert.equal(result?.first_call_cache_hit_ratio, 12672 / 13342);
  });

  it('does not reuse a previous turn when the last turn has no usable call', async () => {
    fixture([started, usage(10, 0), started, usage(0, 0), '{"unfinished":'].join('\n'));
    assert.equal(await readCodexRolloutFirstCall({ codexHome: home, sessionId }), null);
  });

  it('preserves legacy files without turn markers or a final newline', async () => {
    fixture([usage(7, 2), 'not json', usage(20, 10)].join('\n'));
    const result = await readCodexRolloutFirstCall({ codexHome: home, sessionId });
    assert.equal(result?.first_call_input_tokens, 7);
    assert.equal(result?.first_call_cache_read_input_tokens, 2);
  });

  it('returns null and closes any opened handle when a read fails', async () => {
    fixture([started, usage(7, 2)].join('\n'));
    vi.mocked(readFile).mockRejectedValueOnce(new Error('read failed'));
    const reads = observeReads(true);

    assert.equal(await readCodexRolloutFirstCall({ codexHome: home, sessionId }), null);
    assert.equal(reads.allClosed(), true);
  });
});
