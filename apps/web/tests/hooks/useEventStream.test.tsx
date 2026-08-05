// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEventStream } from '../../src/hooks/useEventStream';

// A controllable EventSource double. Tracks every instance so a test can assert
// how many real connections were opened for a given URL.
type Listener = (evt: unknown) => void;
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
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
  dispatch(name: string, data: unknown): void {
    for (const cb of this.listeners.get(name) ?? []) cb({ data: JSON.stringify(data) });
  }
  open(): void {
    this.onopen?.();
  }
  close(): void {
    this.closed = true;
  }
}

const Ctor = MockEventSource as unknown as typeof EventSource;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  MockEventSource.instances = [];
  cleanup();
});

describe('useEventStream', () => {
  it('shares ONE EventSource across subscribers to the same URL', () => {
    const a = renderHook(() =>
      useEventStream('/api/workspace/events', { events: { 'members-changed': () => {} }, EventSourceCtor: Ctor }),
    );
    const b = renderHook(() =>
      useEventStream('/api/workspace/events', { events: { 'team-projects-changed': () => {} }, EventSourceCtor: Ctor }),
    );
    // One shared connection, not one per hook.
    expect(MockEventSource.instances).toHaveLength(1);
    a.unmount();
    // Still one subscriber → connection stays open.
    expect(MockEventSource.instances[0]!.closed).toBe(false);
    b.unmount();
    // Last subscriber left → the shared connection closes.
    expect(MockEventSource.instances[0]!.closed).toBe(true);
  });

  it('reports connected + fires onActive on open, and dispatches to the right handler', () => {
    const hits: string[] = [];
    let activeCount = 0;
    const { result } = renderHook(() =>
      useEventStream('/api/workspace/events', {
        events: {
          'members-changed': () => hits.push('members'),
          'team-projects-changed': () => hits.push('projects'),
        },
        onActive: () => {
          activeCount += 1;
        },
        EventSourceCtor: Ctor,
      }),
    );
    expect(result.current.connected).toBe(false);
    const es = MockEventSource.instances[0]!;
    act(() => es.open());
    expect(result.current.connected).toBe(true);
    expect(activeCount).toBe(1); // snapshot catch-up on connect

    act(() => es.dispatch('members-changed', { type: 'members-changed' }));
    act(() => es.dispatch('team-projects-changed', { type: 'team-projects-changed' }));
    expect(hits).toEqual(['members', 'projects']);
  });

  it('flips connected back to false on error (poll-as-floor resume)', () => {
    const { result } = renderHook(() =>
      useEventStream('/api/workspace/events', { events: { 'members-changed': () => {} }, EventSourceCtor: Ctor }),
    );
    const es = MockEventSource.instances[0]!;
    act(() => es.open());
    expect(result.current.connected).toBe(true);
    act(() => es.onerror?.());
    expect(result.current.connected).toBe(false);
  });

  it('reopens a stream dropped for a long-hidden tab and catches up on visibility', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    let activeCount = 0;
    const { result } = renderHook(() =>
      useEventStream('/api/workspace/events', {
        events: { 'team-projects-changed': () => {} },
        onActive: () => {
          activeCount += 1;
        },
        EventSourceCtor: Ctor,
      }),
    );
    const initial = MockEventSource.instances[0]!;
    act(() => initial.open());
    expect(result.current.connected).toBe(true);
    expect(activeCount).toBe(1);

    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(initial.closed).toBe(true);
    expect(result.current.connected).toBe(false);

    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(MockEventSource.instances).toHaveLength(2);
    const reopened = MockEventSource.instances[1]!;
    act(() => reopened.open());
    expect(result.current.connected).toBe(true);
    expect(activeCount).toBe(2);
  });

  it('coalesces one visible+focus browser transition without swallowing a later focus', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    let activeCount = 0;
    renderHook(() =>
      useEventStream('/api/workspace/events', {
        events: {},
        onActive: () => { activeCount += 1; },
        EventSourceCtor: Ctor,
      }),
    );
    act(() => MockEventSource.instances[0]!.open());
    expect(activeCount).toBe(1);

    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    visibility = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(activeCount).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(51);
    });
    act(() => window.dispatchEvent(new Event('focus')));
    expect(activeCount).toBe(3);
  });

  it('stays poll-only (never connects) when disabled', () => {
    const { result } = renderHook(() =>
      useEventStream('/api/workspace/events', {
        events: { 'members-changed': () => {} },
        enabled: false,
        EventSourceCtor: Ctor,
      }),
    );
    expect(MockEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });
});
