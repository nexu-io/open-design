import { describe, expect, it } from 'vitest';

import { writePromptAndEndStdin } from '../src/runtimes/chat-run-lifecycle.js';

// Regression guard for `run_finished.stdin_backpressure`.
//
// The first cut wrote the prompt with `child.stdin.end(composed, ...)` and then
// read `child.stdin.writableNeedDrain`. That reports nothing: `end(chunk)`
// returns the stream rather than a boolean, and `writableNeedDrain` is already
// back to false by the time it returns — even for a chunk `write(chunk)` would
// have rejected. Every runtime except Claude takes this path, so the field was
// permanently false on exactly the runs whose `stdin_write` stalls it exists to
// attribute.
describe('writePromptAndEndStdin', () => {
  function fakeStdin(writeReturns: boolean) {
    const calls: { chunk: string; encoding: string }[] = [];
    const state = { ended: false, flushCb: null as null | ((err?: Error | null) => void) };
    return {
      calls,
      state,
      write(chunk: string, encoding: BufferEncoding, cb: (err?: Error | null) => void) {
        calls.push({ chunk, encoding });
        state.flushCb = cb;
        return writeReturns;
      },
      end() {
        state.ended = true;
      },
    };
  }

  it('reports backpressure when the pipe rejected the chunk, and still closes stdin', () => {
    const stdin = fakeStdin(false);
    expect(writePromptAndEndStdin(stdin, 'prompt body', () => {})).toBe(true);
    expect(stdin.state.ended).toBe(true);
    expect(stdin.calls).toEqual([{ chunk: 'prompt body', encoding: 'utf8' }]);
  });

  it('reports no backpressure when the chunk was accepted', () => {
    const stdin = fakeStdin(true);
    expect(writePromptAndEndStdin(stdin, 'prompt body', () => {})).toBe(false);
    expect(stdin.state.ended).toBe(true);
  });

  it('forwards the flush callback so the stdin_write lifecycle mark still fires', () => {
    const stdin = fakeStdin(true);
    let flushed = 0;
    writePromptAndEndStdin(stdin, 'prompt body', () => {
      flushed += 1;
    });
    stdin.state.flushCb?.();
    expect(flushed).toBe(1);
  });
});
