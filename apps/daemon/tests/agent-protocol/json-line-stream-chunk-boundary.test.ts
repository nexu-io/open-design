import { describe, expect, it } from 'vitest';

import { createJsonLineStream } from '../../src/agent-protocol/core/json-line-stream.js';

/** Splits `text`'s UTF-8 bytes into two Buffers, cutting one byte into the
 * multi-byte sequence for `char` so the character straddles the boundary. */
function splitUtf8(text: string, char: string): [Buffer, Buffer] {
  const full = Buffer.from(text, 'utf8');
  const marker = Buffer.from(char, 'utf8');
  const index = full.indexOf(marker);
  if (index < 0) throw new Error(`test setup error: ${JSON.stringify(char)} not found in text`);
  const splitPoint = index + 1;
  return [full.subarray(0, splitPoint), full.subarray(splitPoint)];
}

describe('createJsonLineStream — UTF-8 chunk-boundary safety', () => {
  // Real path: `agent-protocol/pi-rpc/session.ts`'s
  // `stdout.on('data', (chunk) => parser.feed(chunk))`. `stdout` there is
  // never put into utf8-string mode, so `chunk` arrives as a raw Buffer;
  // pi's JSON-RPC stream carries arbitrary assistant text (including
  // CJK/emoji) in string fields, so a message boundary landing mid-character
  // is a real, reproducible failure mode. Before this fix, pi-rpc/session.ts
  // additionally ran each chunk through its own `chunk.toString('utf8')`
  // ahead of `feed`, which is the same bug one layer earlier -- that call
  // has been removed; `feed` now owns decoding.
  it('reassembles a JSON-RPC line whose multi-byte character is split across two raw Buffer chunks (pi-rpc/session.ts shape)', () => {
    const message = `${JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { text: '前中后文测试' },
    })}\n`;
    const [chunk1, chunk2] = splitUtf8(message, '中');

    const received: unknown[] = [];
    const stream = createJsonLineStream((msg) => received.push(msg));
    stream.feed(chunk1);
    stream.feed(chunk2);

    expect(received).toEqual([
      { jsonrpc: '2.0', method: 'session/update', params: { text: '前中后文测试' } },
    ]);
  });

  // Real path: `agent-protocol/acp/session.ts`'s
  // `stdout.on('data', (chunk) => parser.feed(chunk))`. That function calls
  // `setEncoding('utf8')` on `child.stderr` but never on `child.stdout` --
  // `stdout` stays in raw Buffer mode despite the (pre-fix) `chunk: string`
  // parameter annotation. ACP `session/update` notifications stream
  // assistant message text verbatim, including emoji.
  it('reassembles a JSON-RPC line whose multi-byte character is split across two raw Buffer chunks (acp/session.ts shape)', () => {
    const message = `${JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'emoji test 🎉 done' },
        },
      },
    })}\n`;
    const [chunk1, chunk2] = splitUtf8(message, '🎉');

    const received: unknown[] = [];
    const stream = createJsonLineStream((msg) => received.push(msg));
    stream.feed(chunk1);
    stream.feed(chunk2);

    expect(received).toHaveLength(1);
    const parsed = received[0] as {
      params: { update: { content: { text: string } } };
    };
    expect(parsed.params.update.content.text).toBe('emoji test 🎉 done');
  });

  // Regression guard for the fix itself: a caller that DOES call
  // `setEncoding('utf8')` (e.g. `acp/models.ts`) hands over an
  // already-decoded string. `feed` must pass that through untouched rather
  // than run it back through `TextDecoder.decode`, which expects raw bytes.
  it('passes an already-decoded string chunk through unchanged, split at an arbitrary character boundary', () => {
    const line = `${JSON.stringify({ text: '前中后文测试 🎉' })}\n`;
    const received: unknown[] = [];
    const stream = createJsonLineStream((msg) => received.push(msg));
    // Split as a STRING mid-character (valid for JS strings, meaningless for
    // bytes) -- this must not be treated as a byte split.
    stream.feed(line.slice(0, 12));
    stream.feed(line.slice(12));
    expect(received).toEqual([{ text: '前中后文测试 🎉' }]);
  });
});
