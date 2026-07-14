// @vitest-environment jsdom
//
// Unit tests for the memory SSE transport bridge. Pins the one behavior the
// bridge owns: a malformed frame is swallowed, but a real bug thrown by the
// subscriber's own handler must still surface — the two must not look alike.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { subscribeMemoryEvents } from '../../../src/providers/memory/events';

const originalEventSource = globalThis.EventSource;

class StubEventSource {
  url: string;
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  static instances: StubEventSource[] = [];
  closed = false;
  constructor(url: string | URL) {
    this.url = String(url);
    StubEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }
  emitRaw(type: string, data: string) {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
  emit(type: string, data: unknown) {
    this.emitRaw(type, JSON.stringify(data));
  }
  close() {
    this.closed = true;
  }
}

afterEach(() => {
  StubEventSource.instances = [];
  if (originalEventSource) {
    globalThis.EventSource = originalEventSource;
  } else {
    // @ts-expect-error jsdom shim cleanup
    delete globalThis.EventSource;
  }
});

describe('subscribeMemoryEvents', () => {
  it('opens an EventSource against /api/memory/events and closes it on unsubscribe', () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const unsubscribe = subscribeMemoryEvents({ onChange: vi.fn(), onExtraction: vi.fn() });

    expect(StubEventSource.instances).toHaveLength(1);
    expect(StubEventSource.instances[0]!.url).toBe('/api/memory/events');

    unsubscribe();
    expect(StubEventSource.instances[0]!.closed).toBe(true);
  });

  it('parses and delivers change and extraction frames to their own handler', () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const onChange = vi.fn();
    const onExtraction = vi.fn();
    subscribeMemoryEvents({ onChange, onExtraction });
    const es = StubEventSource.instances[0]!;

    es.emit('change', { kind: 'entries' });
    es.emit('extraction', { id: 'x', phase: 'success' });

    expect(onChange).toHaveBeenCalledWith({ kind: 'entries' });
    expect(onExtraction).toHaveBeenCalledWith({ id: 'x', phase: 'success' });
  });

  it('ignores a malformed change frame instead of throwing', () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const onChange = vi.fn();
    subscribeMemoryEvents({ onChange, onExtraction: vi.fn() });
    const es = StubEventSource.instances[0]!;

    expect(() => es.emitRaw('change', '{not-json')).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a malformed extraction frame instead of throwing', () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const onExtraction = vi.fn();
    subscribeMemoryEvents({ onChange: vi.fn(), onExtraction });
    const es = StubEventSource.instances[0]!;

    expect(() => es.emitRaw('extraction', '{not-json')).not.toThrow();
    expect(onExtraction).not.toHaveBeenCalled();
  });

  it('lets a real bug in the onChange handler surface instead of being swallowed as a malformed frame', () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const onChange = vi.fn(() => {
      throw new Error('handler bug');
    });
    subscribeMemoryEvents({ onChange, onExtraction: vi.fn() });
    const es = StubEventSource.instances[0]!;

    // A well-formed frame whose handler throws must NOT be swallowed like a
    // parse failure — the handler bug is real and must propagate.
    expect(() => es.emit('change', { kind: 'entries' })).toThrow('handler bug');
  });

  it('lets a real bug in the onExtraction handler surface instead of being swallowed as a malformed frame', () => {
    globalThis.EventSource = StubEventSource as unknown as typeof EventSource;
    const onExtraction = vi.fn(() => {
      throw new Error('handler bug');
    });
    subscribeMemoryEvents({ onChange: vi.fn(), onExtraction });
    const es = StubEventSource.instances[0]!;

    expect(() => es.emit('extraction', { id: 'x', phase: 'success' })).toThrow('handler bug');
  });
});
