// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MemoryToast,
  memoryToastSubscriptionMode,
} from '../../src/components/MemoryToast';
import { I18nProvider } from '../../src/i18n';

type Listener = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, Set<Listener>>();
  closed = false;

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: EventListener): void {
    const listeners = this.listeners.get(name) ?? new Set<Listener>();
    listeners.add(listener as Listener);
    this.listeners.set(name, listeners);
  }

  close(): void {
    this.closed = true;
  }

  dispatch(name: string, data: unknown): void {
    const event = new MessageEvent(name, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
}

function renderToast(subscriptionMode: Parameters<typeof MemoryToast>[0]['subscriptionMode']) {
  return render(
    <I18nProvider initial="en">
      <MemoryToast subscriptionMode={subscriptionMode} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MemoryToast connection budget', () => {
  it('keeps the project-open hot path to workspace + project streams', () => {
    expect(memoryToastSubscriptionMode({
      routeKind: 'project',
      projectRunActive: false,
      memorySurfaceOpen: false,
    })).toBe('off');
    expect(memoryToastSubscriptionMode({
      routeKind: 'project',
      projectRunActive: true,
      memorySurfaceOpen: false,
    })).toBe('activity');
    expect(memoryToastSubscriptionMode({
      routeKind: 'home',
      projectRunActive: false,
      memorySurfaceOpen: false,
    })).toBe('always');
    expect(memoryToastSubscriptionMode({
      routeKind: 'project',
      projectRunActive: true,
      memorySurfaceOpen: true,
    })).toBe('off');
  });

  it('does not open the memory stream when a project has no active run', () => {
    renderToast('off');
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('closes immediately when entering a project from an always-on shell surface', () => {
    const view = renderToast('always');
    expect(MockEventSource.instances).toHaveLength(1);

    view.rerender(
      <I18nProvider initial="en">
        <MemoryToast subscriptionMode="off" />
      </I18nProvider>,
    );

    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });

  it('keeps an active extraction subscribed after its run ends, then releases the slot', () => {
    vi.useFakeTimers();
    const view = renderToast('activity');
    const source = MockEventSource.instances[0]!;

    act(() => {
      source.dispatch('extraction', {
        id: 'extract-1',
        phase: 'running',
        startedAt: Date.now(),
        userMessagePreview: 'remember this',
      });
    });
    view.rerender(
      <I18nProvider initial="en">
        <MemoryToast subscriptionMode="off" />
      </I18nProvider>,
    );
    act(() => vi.advanceTimersByTime(30_000));
    expect(source.closed).toBe(false);

    act(() => {
      source.dispatch('extraction', {
        id: 'extract-1',
        phase: 'success',
        startedAt: Date.now() - 100,
        finishedAt: Date.now(),
        userMessagePreview: 'remember this',
        writtenCount: 1,
      });
      vi.runOnlyPendingTimers();
    });
    expect(source.closed).toBe(true);
  });
});
