import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSseResponse } from './server.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('createSseResponse', () => {
  it('sets SSE headers and sends JSON app events', () => {
    const res = new FakeResponse();
    const sse = createSseResponse(res, { keepAliveIntervalMs: 0 });

    expect(res.headers).toEqual({
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    });
    expect(res.flushed).toBe(true);

    expect(sse.send('start', { ok: true })).toBe(true);
    expect(res.writes.join('')).toBe('event: start\ndata: {"ok":true}\n\n');
  });

  it('emits heartbeat comments before real events', () => {
    const res = new FakeResponse();
    const sse = createSseResponse(res, { keepAliveIntervalMs: 0 });

    expect(sse.writeKeepAlive()).toBe(true);
    expect(sse.send('end', {})).toBe(true);
    expect(res.writes.join('')).toBe(': keepalive\n\nevent: end\ndata: {}\n\n');
  });

  it('clears interval heartbeat on close', () => {
    vi.useFakeTimers();
    const res = new FakeResponse();
    createSseResponse(res, { keepAliveIntervalMs: 10 });

    vi.advanceTimersByTime(10);
    expect(res.writes).toEqual([': keepalive\n\n']);

    res.emit('close');
    vi.advanceTimersByTime(30);
    expect(res.writes).toEqual([': keepalive\n\n']);
  });

  it('skips writes after the response ends', () => {
    const res = new FakeResponse();
    const sse = createSseResponse(res, { keepAliveIntervalMs: 0 });

    sse.end();

    expect(res.ended).toBe(true);
    expect(sse.writeKeepAlive()).toBe(false);
    expect(sse.send('end', {})).toBe(false);
    expect(res.writes).toEqual([]);
  });
});

class FakeResponse extends EventEmitter {
  headers = {};
  writes = [];
  destroyed = false;
  writableEnded = false;
  flushed = false;
  ended = false;

  setHeader(name, value) {
    this.headers[name] = value;
  }

  flushHeaders() {
    this.flushed = true;
  }

  write(chunk) {
    this.writes.push(chunk);
    return true;
  }

  end() {
    this.ended = true;
    this.writableEnded = true;
    this.emit('finish');
  }
}
