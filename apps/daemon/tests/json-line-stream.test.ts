import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsonLineStream } from '../src/agent-protocol/core/json-line-stream.js';

describe('JSON-line message handler failures', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports a handler failure and continues delivering subsequent frames', () => {
    const error = new Error('SQLITE_FULL');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const received: unknown[] = [];
    const stream = createJsonLineStream((message) => {
      received.push(message);
      if (received.length === 1) throw error;
    });

    stream.feed('{"id":1}\n{"id":2}\n');
    stream.flush();

    expect(received).toEqual([{ id: 1 }, { id: 2 }]);
    expect(log).toHaveBeenCalledExactlyOnceWith('[json-line] message handler failed', error);
  });

  it.each(['feed', 'flush'] as const)('does not replay a delivered multiline frame during %s', (end) => {
    const error = new Error('event persistence failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const received: unknown[] = [];
    const stream = createJsonLineStream((message) => {
      received.push(message);
      if (Array.isArray(message)) throw error;
    });

    stream.feed('[\n{"id":1}\n');
    stream.feed(end === 'feed' ? ']\n' : ']');
    stream.flush();
    stream.feed('{"id":2}\n');
    stream.flush();

    expect(received).toEqual([[{ id: 1 }], { id: 2 }]);
    expect(log).toHaveBeenCalledExactlyOnceWith('[json-line] message handler failed', error);
  });

  it('reports errors in recovered frames without stopping recovery', () => {
    const error = new Error('event write failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const received: unknown[] = [];
    const stream = createJsonLineStream((message) => {
      received.push(message);
      if (received.length === 1) throw error;
    });

    stream.feed('{"truncated":\n{"id":1}\n{"id":2}\n');
    stream.flush();

    expect(received).toEqual([{ id: 1 }, { id: 2 }]);
    expect(log).toHaveBeenCalledExactlyOnceWith('[json-line] message handler failed', error);
  });

  it('keeps malformed stdout separate from handler failures and preserves the raw frame', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onMessage = vi.fn();
    const stream = createJsonLineStream(onMessage);

    stream.feed('starting agent\n{invalid}\n{\n"id":1\n}\n');
    stream.flush();

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ id: 1 }, '{\n"id":1\n}');
    expect(log).not.toHaveBeenCalled();
  });
});
