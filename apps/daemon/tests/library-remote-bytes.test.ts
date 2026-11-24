import { describe, expect, it } from 'vitest';

import { readCappedResponseBody } from '../src/routes/library.js';

function streamOf(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  );
}

describe('readCappedResponseBody', () => {
  it('returns the buffered bytes when the body fits', async () => {
    const resp = streamOf([new TextEncoder().encode('hello '), new TextEncoder().encode('world')]);
    const buf = await readCappedResponseBody(resp, 1024);
    expect(buf.toString('utf8')).toBe('hello world');
  });

  it('rejects mid-stream once the byte cap is exceeded (#9564)', async () => {
    // No Content-Length header: the cap must be enforced while reading, not by
    // buffering the whole body first the way `arrayBuffer()` did.
    const resp = streamOf([new TextEncoder().encode('x'.repeat(64)), new TextEncoder().encode('y'.repeat(64))]);
    await expect(readCappedResponseBody(resp, 65)).rejects.toThrow(/too large/i);
  });
});
