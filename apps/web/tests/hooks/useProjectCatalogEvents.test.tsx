// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useProjectCatalogEvents } from '../../src/hooks/useProjectCatalogEvents';

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string | URL) {
    this.url = String(url);
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = 2;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }
}

const ctor = MockEventSource as unknown as typeof EventSource;

afterEach(() => {
  cleanup();
  MockEventSource.instances = [];
});

describe('useProjectCatalogEvents', () => {
  it('subscribes to the catalog-wide stream that needs no workspace identity', () => {
    renderHook(() => useProjectCatalogEvents(() => {}, { EventSourceCtor: ctor }));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]!.url).toBe('/api/project-catalog/events');
  });

  it('asks the shell to re-read the project list when the daemon announces a change', () => {
    const onStale = vi.fn();
    renderHook(() => useProjectCatalogEvents(onStale, { EventSourceCtor: ctor }));
    const source = MockEventSource.instances[0]!;
    act(() => source.open());
    onStale.mockClear();

    act(() => source.emit('project-catalog-changed', { type: 'project-catalog-changed', at: 1 }));

    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('re-reads on (re)connect so a gap while disconnected cannot hide a project', () => {
    const onStale = vi.fn();
    renderHook(() => useProjectCatalogEvents(onStale, { EventSourceCtor: ctor }));

    act(() => MockEventSource.instances[0]!.open());

    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('closes the stream when the shell unmounts', () => {
    const { unmount } = renderHook(() =>
      useProjectCatalogEvents(() => {}, { EventSourceCtor: ctor }),
    );
    const source = MockEventSource.instances[0]!;

    unmount();

    expect(source.readyState).toBe(2);
  });
});
