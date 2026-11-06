// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toast } from '../../src/components/Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast auto-dismiss', () => {
  it('dismisses after ttlMs with a stable callback', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="hi" ttlMs={1000} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('still auto-dismisses when the parent re-renders with a fresh onDismiss closure each tick', () => {
    // Reproduces the brand-extraction bug: while extraction runs, a ticking
    // "running 8.6s" elapsed counter re-renders the parent ~every second, and
    // each render passes a NEW `onDismiss={() => setToast(null)}` closure. If
    // that unstable identity re-arms the dismiss timer, the deadline is pushed
    // forward forever and the toast never auto-dismisses. The countdown must be
    // anchored to mount and survive parent render churn.
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();

    const { rerender } = render(
      <Toast message="guide" ttlMs={1000} onDismiss={first} />,
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender(<Toast message="guide" ttlMs={1000} onDismiss={second} />);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender(<Toast message="guide" ttlMs={1000} onDismiss={third} />);
    act(() => {
      vi.advanceTimersByTime(400); // cumulative 1200ms, well past the 1000ms ttl
    });

    // The timer was armed once at mount and counted down uninterrupted; only the
    // latest callback fires, and exactly once.
    expect(third).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
