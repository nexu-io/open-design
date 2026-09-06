import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { describe, test } from 'vitest';

import { createQoderStreamHandler } from '../src/runtimes/qoder-stream.js';

/**
 * Qoder's stdout arrives as Buffers, and a pipe splits them wherever it likes.
 *
 * Every other runtime is handed a decoded string because the daemon calls
 * `child.stdout.setEncoding('utf8')` (server.ts), which buffers an incomplete
 * multi-byte sequence until the next chunk completes it. This parser accepted
 * raw Buffers and decoded each one on its own, so a split landing inside a
 * three-byte CJK character produced U+FFFD on both sides — the character was
 * destroyed, and with it the JSON line it belonged to.
 *
 * The failure is invisible in an English transcript and certain in a Chinese
 * one, which is exactly the shape of defect that survives review.
 */

function collect(chunks: Buffer[]): { events: Record<string, unknown>[] } {
  const events: Record<string, unknown>[] = [];
  const handler = createQoderStreamHandler((event) => events.push(event));
  for (const chunk of chunks) handler.feed(chunk);
  handler.flush();
  return { events };
}

/** Split one buffer at an absolute byte offset. */
function splitAt(buf: Buffer, at: number): Buffer[] {
  return [buf.subarray(0, at), buf.subarray(at)];
}

const LINE = `${JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'text', text: '桌面渲染服务当前不可用' }] },
})}\n`;

describe('qoder stdout 分片解码', () => {
  test('整块喂进去时文本完整', () => {
    const { events } = collect([Buffer.from(LINE, 'utf8')]);
    const texts = events.filter((e) => e.type === 'text_delta').map((e) => e.delta);
    assert.deepEqual(texts, ['桌面渲染服务当前不可用']);
  });

  test('切在多字节字符中间也不许出现替换字符', () => {
    const full = Buffer.from(LINE, 'utf8');
    // Every byte offset inside the payload — the pipe gets to choose, so the
    // parser has to survive all of them, not just the lucky ones.
    for (let at = 1; at < full.length; at += 1) {
      const { events } = collect(splitAt(full, at));
      const texts = events.filter((e) => e.type === 'text_delta').map((e) => e.delta);
      assert.deepEqual(
        texts,
        ['桌面渲染服务当前不可用'],
        `切在第 ${at} 字节后文本被破坏: ${JSON.stringify(texts)}`,
      );
      for (const event of events) {
        assert.equal(
          JSON.stringify(event).includes('\\ufffd'),
          false,
          `切在第 ${at} 字节后出现替换字符: ${JSON.stringify(event)}`,
        );
      }
    }
  });

  test('逐字节喂也不丢字', () => {
    const full = Buffer.from(LINE, 'utf8');
    const { events } = collect([...full].map((byte) => Buffer.from([byte])));
    const texts = events.filter((e) => e.type === 'text_delta').map((e) => e.delta);
    assert.deepEqual(texts, ['桌面渲染服务当前不可用']);
  });
});
