import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCompatApiErrorResponse, createSseResponse } from '../src/server.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('createSseResponse', () => {
  it('sets SSE headers and sends JSON app events', () => {
    const res = new FakeResponse();
    const sse = createSseResponse(res as unknown as Response, { keepAliveIntervalMs: 0 });

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

  it('can attach SSE event ids for resumable streams', () => {
    const res = new FakeResponse();
    const sse = createSseResponse(res as unknown as Response, { keepAliveIntervalMs: 0 });

    expect(sse.send('stdout', { chunk: 'hello' }, 12)).toBe(true);

    expect(res.writes.join('')).toBe('id: 12\nevent: stdout\ndata: {"chunk":"hello"}\n\n');
  });

  it('emits heartbeat comments before real events', () => {
    const res = new FakeResponse();
    const sse = createSseResponse(res as unknown as Response, { keepAliveIntervalMs: 0 });

    expect(sse.writeKeepAlive()).toBe(true);
    expect(sse.send('end', {})).toBe(true);
    expect(res.writes.join('')).toBe(': keepalive\n\nevent: end\ndata: {}\n\n');
  });

  it('clears interval heartbeat on close', () => {
    vi.useFakeTimers();
    const res = new FakeResponse();
    createSseResponse(res as unknown as Response, { keepAliveIntervalMs: 10 });

    vi.advanceTimersByTime(10);
    expect(res.writes).toEqual([': keepalive\n\n']);

    res.emit('close');
    vi.advanceTimersByTime(30);
    expect(res.writes).toEqual([': keepalive\n\n']);
  });

  it('skips writes after the response ends', () => {
    const res = new FakeResponse();
    const sse = createSseResponse(res as unknown as Response, { keepAliveIntervalMs: 0 });

    sse.end();

    expect(res.ended).toBe(true);
    expect(sse.writeKeepAlive()).toBe(false);
    expect(sse.send('end', {})).toBe(false);
    expect(res.writes).toEqual([]);
  });
});

describe('createCompatApiErrorResponse', () => {
  it('wraps legacy string errors in the shared ApiError response shape', () => {
    expect(createCompatApiErrorResponse('BAD_REQUEST', 'message required')).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'message required',
      },
    });
  });

  it('preserves shared ApiError metadata fields', () => {
    expect(
      createCompatApiErrorResponse('AGENT_UNAVAILABLE', 'missing agent', {
        retryable: true,
        details: { legacyCode: 'ENOENT' },
      }),
    ).toEqual({
      error: {
        code: 'AGENT_UNAVAILABLE',
        message: 'missing agent',
        retryable: true,
        details: { legacyCode: 'ENOENT' },
      },
    });
  });
});

class FakeResponse extends EventEmitter {
  headers: Record<string, string> = {};
  writes: string[] = [];
  destroyed = false;
  writableEnded = false;
  flushed = false;
  ended = false;

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  flushHeaders() {
    this.flushed = true;
  }

  write(chunk: string) {
    this.writes.push(chunk);
    return true;
  }

  end() {
    this.ended = true;
    this.writableEnded = true;
    this.emit('finish');
  }
}
