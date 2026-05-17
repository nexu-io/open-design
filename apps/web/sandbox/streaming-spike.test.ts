import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseClient } from './streaming-spike.js';

// Minimal EventSource mock
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  private _closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  emit(id: string, data: string): void {
    if (this._closed) return;
    const e = new MessageEvent('message', { data, lastEventId: id });
    this.onmessage?.(e);
  }

  triggerError(): void {
    if (this._closed) return;
    this.onerror?.();
  }

  close(): void {
    this._closed = true;
  }

  get closed(): boolean {
    return this._closed;
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function latestEs(): MockEventSource {
  const es = MockEventSource.instances.at(-1);
  if (!es) throw new Error('No EventSource created');
  return es;
}

describe('SseClient', () => {
  it('buffers up to 50 chunks (ring overflow)', () => {
    const client = new SseClient('http://localhost/sse');
    client.connect();
    const es = latestEs();

    for (let i = 0; i < 60; i++) {
      es.emit(String(i), `chunk-${i}`);
    }

    const chunks = client.chunks();
    expect(chunks).toHaveLength(50);
    expect(chunks[0]!.data).toBe('chunk-10');
    expect(chunks[49]!.data).toBe('chunk-59');
    client.close();
  });

  it('tracks Last-Event-ID from latest chunk', () => {
    const client = new SseClient('http://localhost/sse');
    client.connect();
    const es = latestEs();

    es.emit('42', 'hello');
    es.emit('43', 'world');

    expect(client.lastId()).toBe('43');
    client.close();
  });

  it('reconnects with Last-Event-ID as query param after error', () => {
    const client = new SseClient('http://localhost/sse');
    client.connect();
    const es1 = latestEs();

    es1.emit('7', 'before-disconnect');
    es1.triggerError();

    // advance 1s (first backoff)
    vi.advanceTimersByTime(1000);

    const es2 = latestEs();
    expect(es2).not.toBe(es1);
    expect(es2.url).toBe('http://localhost/sse?lastEventId=7');
    client.close();
  });

  it('increments backoff on successive errors: [1s,2s,4s,8s,8s]', () => {
    const expected = [1000, 2000, 4000, 8000, 8000];
    const client = new SseClient('http://localhost/sse');
    client.connect();

    for (const delay of expected) {
      latestEs().triggerError();
      vi.advanceTimersByTime(delay);
    }

    expect(MockEventSource.instances).toHaveLength(expected.length + 1);
    client.close();
  });

  it('stops retrying after 5 errors', () => {
    const client = new SseClient('http://localhost/sse');
    client.connect();

    for (let i = 0; i < 5; i++) {
      latestEs().triggerError();
      vi.advanceTimersByTime(8000);
    }

    const countBefore = MockEventSource.instances.length;
    // 6th error — should not reconnect
    latestEs().triggerError();
    vi.advanceTimersByTime(8000);
    expect(MockEventSource.instances.length).toBe(countBefore);
    client.close();
  });

  it('resets retry counter on successful message after reconnect', () => {
    const client = new SseClient('http://localhost/sse');
    client.connect();

    latestEs().triggerError();
    vi.advanceTimersByTime(1000);

    // message resets retries
    latestEs().emit('1', 'recovered');

    // next error should start backoff from 1s again
    latestEs().triggerError();
    vi.advanceTimersByTime(1000);

    // new connection opened (not 2s backoff)
    const urls = MockEventSource.instances.map((e) => e.url);
    expect(urls).toHaveLength(3);
    client.close();
  });

  it('5-minute sustained stream without crash', async () => {
    const client = new SseClient('http://localhost/sse');
    client.connect();
    const es = latestEs();

    const FIVE_MIN_MS = 5 * 60 * 1000;
    const INTERVAL_MS = 100;
    const total = FIVE_MIN_MS / INTERVAL_MS;

    for (let i = 0; i < total; i++) {
      es.emit(String(i), `data-${i}`);
    }

    const chunks = client.chunks();
    expect(chunks).toHaveLength(50); // ring kept at 50
    expect(chunks[49]!.id).toBe(String(total - 1));
    client.close();
  });

  it('Last-Event-ID rewind: reconnect preserves chunks 5+ after gap', () => {
    const client = new SseClient('http://localhost/sse');
    client.connect();
    const es1 = latestEs();

    // emit 10 chunks before disconnect
    for (let i = 0; i < 10; i++) {
      es1.emit(String(i), `pre-${i}`);
    }

    es1.triggerError();
    vi.advanceTimersByTime(1000);

    const es2 = latestEs();
    // server rewinds from lastEventId=9, sends 5 more starting at seq 5
    for (let i = 5; i < 10; i++) {
      es2.emit(String(i), `rewind-${i}`);
    }
    // then continues with new chunks
    for (let i = 10; i < 15; i++) {
      es2.emit(String(i), `new-${i}`);
    }

    const chunks = client.chunks();
    // ring = first 10 + 5 rewind + 5 new = 20, all fit in 50
    expect(chunks).toHaveLength(20);
    expect(chunks[10]!.data).toBe('rewind-5');
    client.close();
  });
});
