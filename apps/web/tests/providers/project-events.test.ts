import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createProjectEventsConnection,
  projectEventsUrl,
  type ProjectEvent,
} from '../../src/providers/project-events';

type Listener = (evt: unknown) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Map<string, Set<Listener>> = new Map();
  closed = false;
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(name: string, cb: Listener): void {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(cb);
  }
  removeEventListener(name: string, cb: Listener): void {
    this.listeners.get(name)?.delete(cb);
  }
  dispatch(name: string, evt: unknown): void {
    for (const cb of this.listeners.get(name) ?? []) cb(evt);
  }
  close(): void {
    this.closed = true;
  }
  // EventSource type compat
  get readyState(): number { return this.closed ? 2 : 1; }
}

afterEach(() => {
  MockEventSource.instances = [];
  vi.useRealTimers();
});

describe('projectEventsUrl', () => {
  it('encodes project id segment', () => {
    expect(projectEventsUrl('818cf7a8-839/9'))
      .toBe('/api/projects/818cf7a8-839%2F9/events');
  });
});

describe('createProjectEventsConnection', () => {
  it('opens an EventSource against the events URL on creation', () => {
    const conn = createProjectEventsConnection(
      'p1',
      () => {},
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]!.url).toBe('/api/projects/p1/events');
    conn.close();
  });

  it('invokes onChange with parsed payload on file-changed events', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    es.dispatch('file-changed', {
      data: JSON.stringify({ type: 'file-changed', path: 'a.html', kind: 'change' }),
    });
    es.dispatch('file-changed', {
      data: JSON.stringify({ type: 'file-changed', path: 'b.css', kind: 'add' }),
    });
    expect(seen).toEqual([
      { type: 'file-changed', path: 'a.html', kind: 'change' },
      { type: 'file-changed', path: 'b.css', kind: 'add' },
    ]);
    conn.close();
  });

  it('ignores malformed payloads instead of throwing', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    expect(() => es.dispatch('file-changed', { data: '{not-json' })).not.toThrow();
    expect(seen).toEqual([]);
    conn.close();
  });

  it('parses live_artifact events', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    es.dispatch('live_artifact', {
      data: JSON.stringify({
        type: 'live_artifact',
        action: 'updated',
        projectId: 'p1',
        artifactId: 'artifact-1',
        title: 'Status Board',
        refreshStatus: 'running',
      }),
    });

    expect(seen).toEqual([
      {
        type: 'live_artifact',
        action: 'updated',
        projectId: 'p1',
        artifactId: 'artifact-1',
        title: 'Status Board',
        refreshStatus: 'running',
      },
    ]);
    conn.close();
  });

  it('parses live_artifact_refresh events', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    es.dispatch('live_artifact_refresh', {
      data: JSON.stringify({
        type: 'live_artifact_refresh',
        phase: 'succeeded',
        projectId: 'p1',
        artifactId: 'artifact-1',
        refreshId: 'refresh-000001',
        title: 'Status Board',
        refreshedSourceCount: 1,
      }),
    });

    expect(seen).toEqual([
      {
        type: 'live_artifact_refresh',
        phase: 'succeeded',
        projectId: 'p1',
        artifactId: 'artifact-1',
        refreshId: 'refresh-000001',
        title: 'Status Board',
        refreshedSourceCount: 1,
      },
    ]);
    conn.close();
  });

  it('reconnects with exponential backoff on error', () => {
    let nextDelay = 0;
    const setTimeoutFn = vi.fn((cb: () => void, ms: number) => {
      nextDelay = ms;
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
    const clearTimeoutFn = vi.fn();
    const conn = createProjectEventsConnection(
      'p1',
      () => {},
      {
        EventSourceCtor: MockEventSource as unknown as typeof EventSource,
        initialBackoffMs: 100,
        maxBackoffMs: 800,
        setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
        clearTimeoutFn: clearTimeoutFn as unknown as typeof clearTimeout,
      },
    );

    expect(MockEventSource.instances).toHaveLength(1);
    MockEventSource.instances[0]!.dispatch('error', {});
    expect(nextDelay).toBe(100);
    expect(MockEventSource.instances).toHaveLength(2);

    MockEventSource.instances[1]!.dispatch('error', {});
    expect(nextDelay).toBe(200);

    MockEventSource.instances[2]!.dispatch('error', {});
    expect(nextDelay).toBe(400);

    MockEventSource.instances[3]!.dispatch('error', {});
    expect(nextDelay).toBe(800);

    MockEventSource.instances[4]!.dispatch('error', {});
    expect(nextDelay).toBe(800); // capped at maxBackoffMs

    conn.close();
  });

  it('resets backoff after a ready event', () => {
    let nextDelay = 0;
    const setTimeoutFn = vi.fn((cb: () => void, ms: number) => {
      nextDelay = ms;
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
    const conn = createProjectEventsConnection(
      'p1',
      () => {},
      {
        EventSourceCtor: MockEventSource as unknown as typeof EventSource,
        initialBackoffMs: 100,
        setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
      },
    );

    MockEventSource.instances[0]!.dispatch('error', {});
    expect(nextDelay).toBe(100);
    MockEventSource.instances[1]!.dispatch('error', {});
    expect(nextDelay).toBe(200);
    // Ready arrives → reset
    MockEventSource.instances[2]!.dispatch('ready', { data: '{}' });
    MockEventSource.instances[2]!.dispatch('error', {});
    expect(nextDelay).toBe(100);

    conn.close();
  });

  it('close() prevents further reconnects and closes the active source', () => {
    let scheduled: (() => void) | null = null;
    const setTimeoutFn = vi.fn((cb: () => void) => {
      scheduled = cb;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });
    const clearTimeoutFn = vi.fn();
    const conn = createProjectEventsConnection(
      'p1',
      () => {},
      {
        EventSourceCtor: MockEventSource as unknown as typeof EventSource,
        setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
        clearTimeoutFn: clearTimeoutFn as unknown as typeof clearTimeout,
      },
    );

    MockEventSource.instances[0]!.dispatch('error', {});
    expect(scheduled).toBeTypeOf('function');

    conn.close();
    expect(clearTimeoutFn).toHaveBeenCalled();
    // even if a stale timer fired, the connect is a no-op
    (scheduled as (() => void) | null)?.();
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('returns a no-op connection when no EventSource constructor is available', () => {
    const conn = createProjectEventsConnection(
      'p1',
      () => {},
      { EventSourceCtor: undefined },
    );
    expect(MockEventSource.instances).toHaveLength(0);
    expect(() => conn.close()).not.toThrow();
  });
});
