// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCoalescedCallback } from '../../src/hooks/useCoalescedCallback';

describe('useCoalescedCallback (#2195)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a chokidar unlink+add burst into a single callback', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useCoalescedCallback(cb, { wait: 80 }));
    // Simulate the agent's atomic rewrite: unlink at T+0, add at T+12,
    // change at T+25. The whole burst lands inside the 80ms quiet window
    // and the UI must NOT see a transient "file gone" refresh.
    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(12); result.current(); });
    act(() => { vi.advanceTimersByTime(13); result.current(); });
    expect(cb).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(80); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires the callback once after a single isolated trigger', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useCoalescedCallback(cb, { wait: 80 }));
    act(() => { result.current(); });
    expect(cb).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(80); });
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(500); });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires again for a second burst after the first one settled', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useCoalescedCallback(cb, { wait: 80 }));
    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(80); });
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(80); });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('flushes synchronously once maxWait has elapsed during a sustained burst', () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useCoalescedCallback(cb, { wait: 80, maxWait: 200 }),
    );
    // Continuously trigger every 50ms. The wait window keeps resetting,
    // but the maxWait cap must force a flush around T=200ms regardless.
    act(() => { result.current(); }); // T=0
    act(() => { vi.advanceTimersByTime(50); result.current(); }); // T=50
    act(() => { vi.advanceTimersByTime(50); result.current(); }); // T=100
    act(() => { vi.advanceTimersByTime(50); result.current(); }); // T=150
    expect(cb).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(50); result.current(); }); // T=200 -> flush
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('uses the latest callback when it changes between triggers', () => {
    const first = vi.fn();
    const second = vi.fn();
    let active = first;
    const { rerender, result } = renderHook(() =>
      useCoalescedCallback(active, { wait: 80 }),
    );
    act(() => { result.current(); });
    active = second;
    rerender();
    act(() => { vi.advanceTimersByTime(80); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cancels any pending timer when the component unmounts', () => {
    const cb = vi.fn();
    const { result, unmount } = renderHook(() =>
      useCoalescedCallback(cb, { wait: 80 }),
    );
    act(() => { result.current(); });
    unmount();
    act(() => { vi.advanceTimersByTime(500); });
    expect(cb).not.toHaveBeenCalled();
  });
});
