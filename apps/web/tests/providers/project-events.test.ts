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

  it('parses conversation-created events emitted by routine reuse runs (#1361)', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    es.dispatch('conversation-created', {
      data: JSON.stringify({
        type: 'conversation-created',
        projectId: 'p1',
        conversationId: 'routine-conv-aaa',
        title: 'Routine · 2026-05-13',
        createdAt: 1747109840000,
      }),
    });

    expect(seen).toEqual([
      {
        type: 'conversation-created',
        projectId: 'p1',
        conversationId: 'routine-conv-aaa',
        title: 'Routine · 2026-05-13',
        createdAt: 1747109840000,
      },
    ]);
    conn.close();
  });

  // Concurrent routine runs (#1502): two Run-now clicks against the same
  // reuse-an-existing-project routine each create their own conversation.
  // Both events should be delivered to the open `ProjectView` so the
  // conversation list surfaces all of them, not just the latest one.
  it('delivers multiple concurrent conversation-created events (covers #1502)', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    es.dispatch('conversation-created', {
      data: JSON.stringify({
        type: 'conversation-created',
        projectId: 'p1',
        conversationId: 'routine-conv-aaa',
        title: 'Routine · 8:12 AM',
        createdAt: 1747109520000,
      }),
    });
    es.dispatch('conversation-created', {
      data: JSON.stringify({
        type: 'conversation-created',
        projectId: 'p1',
        conversationId: 'routine-conv-bbb',
        title: 'Routine · 8:13 AM',
        createdAt: 1747109580000,
      }),
    });

    expect(seen.map((e) => e.type === 'conversation-created' ? e.conversationId : null))
      .toEqual(['routine-conv-aaa', 'routine-conv-bbb']);
    conn.close();
  });

  it('ignores malformed conversation-created payloads instead of throwing', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    expect(() => es.dispatch('conversation-created', { data: '{not-json' })).not.toThrow();
    expect(seen).toEqual([]);
    conn.close();
  });

  // Collab realtime hop-2: the project events stream now also carries the
  // project-scoped thin invalidation events. Each is forwarded to onChange so
  // ProjectView can re-fetch the affected resource (e.g. the comment list).
  it('forwards collab invalidation events (comment/presence/metadata)', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    es.dispatch('comment-changed', {
      data: JSON.stringify({ type: 'comment-changed', projectId: 'p1', at: 7 }),
    });
    es.dispatch('presence-changed', {
      data: JSON.stringify({ type: 'presence-changed', projectId: 'p1' }),
    });
    es.dispatch('project-metadata-changed', {
      data: JSON.stringify({ type: 'project-metadata-changed', projectId: 'p1' }),
    });
    expect(seen).toEqual([
      { type: 'comment-changed', projectId: 'p1', at: 7 },
      { type: 'presence-changed', projectId: 'p1' },
      { type: 'project-metadata-changed', projectId: 'p1' },
    ]);
    conn.close();
  });

  it('forwards project content transfer events as thin invalidations', () => {
    const seen: ProjectEvent[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      (evt) => seen.push(evt),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource },
    );
    const es = MockEventSource.instances[0]!;
    es.dispatch('project-content-transfer-state', {
      data: JSON.stringify({
        type: 'project-content-transfer-state',
        projectId: 'p1',
      }),
    });

    expect(seen).toEqual([
      {
        type: 'project-content-transfer-state',
        projectId: 'p1',
      },
    ]);
    conn.close();
  });

  it('reports connection status for poll-as-floor (ready → true, error → false)', () => {
    const statuses: boolean[] = [];
    const conn = createProjectEventsConnection(
      'p1',
      () => {},
      {
        EventSourceCtor: MockEventSource as unknown as typeof EventSource,
        setTimeoutFn: ((cb: () => void) => 0 as unknown as ReturnType<typeof setTimeout>) as unknown as typeof setTimeout,
        onConnectedChange: (connected) => statuses.push(connected),
      },
    );
    const es = MockEventSource.instances[0]!;
    es.dispatch('ready', { data: '{}' });
    es.dispatch('error', {});
    expect(statuses).toEqual([true, false]);
    conn.close();
  });

  it('notifies consumers after the ready handshake so they can reconcile missed events', () => {
    const onReady = vi.fn();
    const conn = createProjectEventsConnection(
      'p1',
      vi.fn(),
      { EventSourceCtor: MockEventSource as unknown as typeof EventSource, onReady },
    );

    MockEventSource.instances[0]!.dispatch('ready', { data: '{}' });

    expect(onReady).toHaveBeenCalledTimes(1);
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
        // Pin jitter to its high edge (multiplier 1.0) so the base doubling
        // sequence is observable; the jitter range is covered separately.
        randomFn: () => 1,
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
        randomFn: () => 1,
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

  it('jitters each reconnect delay within [0.5, 1.0) of the base', () => {
    const delays: number[] = [];
    const setTimeoutFn = vi.fn((_cb: () => void, ms: number) => {
      delays.push(ms);
      // Do NOT auto-fire: we only want to observe the scheduled delay per error.
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
    const conn = createProjectEventsConnection(
      'p1',
      () => {},
      {
        EventSourceCtor: MockEventSource as unknown as typeof EventSource,
        initialBackoffMs: 1000,
        maxBackoffMs: 30_000,
        // random() = 0 → multiplier 0.5 (the low edge of the jitter window).
        randomFn: () => 0,
        setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
      },
    );
    // Only one source exists (auto-fire disabled), so re-dispatch error on it to
    // walk the backoff cursor without opening new connections.
    const es = MockEventSource.instances[0]!;
    for (let i = 0; i < 4; i += 1) es.dispatch('error', {});
    // Base sequence 1000, 2000, 4000, 8000 → all halved by the low-edge jitter.
    expect(delays).toEqual([500, 1000, 2000, 4000]);
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
