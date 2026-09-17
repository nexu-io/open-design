// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProjectEventsConnection } from '../../src/providers/project-events';
import { createCritiqueEventsConnection } from '../../src/components/Theater/state/sse';

// Long-lived SSE streams are charged against the browser's per-origin HTTP/1.1
// socket budget (6 against the loopback daemon), and Chromium keeps that budget
// per PROFILE, not per tab — a parked background tab that keeps its streams open
// steals sockets from the tab the user is actually looking at.
//
// `useEventStream` already drops its shared stream once the tab has been hidden
// past a grace window (see useEventStream.test.tsx). These specs pin the same
// rule onto the standalone `create*EventsConnection` managers, which used to
// hold their socket for the whole life of the tab.

type Listener = (evt: unknown) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners = new Map<string, Set<Listener>>();
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
  get readyState(): number {
    return this.closed ? 2 : 1;
  }
}

const Ctor = MockEventSource as unknown as typeof EventSource;

/** How many sockets this manager is holding right now. */
function openCount(): number {
  return MockEventSource.instances.filter((i) => !i.closed).length;
}

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(next: DocumentVisibilityState): void {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  MockEventSource.instances = [];
  visibility = 'visible';
});

function mockVisibility(): void {
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
}

describe('project events stream — tab visibility budget', () => {
  it('holds exactly one socket while the tab is visible', () => {
    mockVisibility();
    const conn = createProjectEventsConnection('p1', () => {}, { EventSourceCtor: Ctor });
    expect(openCount()).toBe(1);
    conn.close();
    expect(openCount()).toBe(0);
  });

  it('releases its socket once the tab has been hidden past the grace window', () => {
    vi.useFakeTimers();
    mockVisibility();
    const connected: boolean[] = [];
    const conn = createProjectEventsConnection('p1', () => {}, {
      EventSourceCtor: Ctor,
      onConnectedChange: (v) => connected.push(v),
    });
    MockEventSource.instances[0]!.dispatch('ready', { data: '{}' });
    expect(openCount()).toBe(1);

    setVisibility('hidden');
    // Still held during the grace window — a quick tab switch must not thrash.
    vi.advanceTimersByTime(29_000);
    expect(openCount()).toBe(1);

    vi.advanceTimersByTime(2_000);
    expect(openCount()).toBe(0);
    expect(MockEventSource.instances).toHaveLength(1);
    // Poll-as-floor: consumers must learn the stream is gone so their fallback
    // poll resumes full cadence.
    expect(connected[connected.length - 1]).toBe(false);

    conn.close();
  });

  it('reopens exactly one socket when the tab becomes visible again', () => {
    vi.useFakeTimers();
    mockVisibility();
    const conn = createProjectEventsConnection('p1', () => {}, { EventSourceCtor: Ctor });
    setVisibility('hidden');
    vi.advanceTimersByTime(31_000);
    expect(openCount()).toBe(0);

    setVisibility('visible');
    expect(openCount()).toBe(1);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1]!.url).toBe('/api/projects/p1/events');

    conn.close();
    expect(openCount()).toBe(0);
  });

  it('does not thrash the socket on a quick hide/show inside the grace window', () => {
    vi.useFakeTimers();
    mockVisibility();
    const conn = createProjectEventsConnection('p1', () => {}, { EventSourceCtor: Ctor });
    setVisibility('hidden');
    vi.advanceTimersByTime(5_000);
    setVisibility('visible');
    vi.advanceTimersByTime(60_000);
    // Same socket throughout — no close, no second connection.
    expect(MockEventSource.instances).toHaveLength(1);
    expect(openCount()).toBe(1);
    conn.close();
  });

  it('stops listening to visibility after close, so a hidden tab cannot resurrect it', () => {
    vi.useFakeTimers();
    mockVisibility();
    const conn = createProjectEventsConnection('p1', () => {}, { EventSourceCtor: Ctor });
    conn.close();
    setVisibility('hidden');
    vi.advanceTimersByTime(31_000);
    setVisibility('visible');
    vi.advanceTimersByTime(31_000);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(openCount()).toBe(0);
  });
});

describe('critique theater stream — tab visibility budget', () => {
  it('releases its socket once the tab has been hidden past the grace window', () => {
    vi.useFakeTimers();
    mockVisibility();
    const conn = createCritiqueEventsConnection('p1', () => {}, { EventSourceCtor: Ctor });
    expect(openCount()).toBe(1);

    setVisibility('hidden');
    vi.advanceTimersByTime(31_000);
    expect(openCount()).toBe(0);

    setVisibility('visible');
    expect(openCount()).toBe(1);
    conn.close();
    expect(openCount()).toBe(0);
  });
});
