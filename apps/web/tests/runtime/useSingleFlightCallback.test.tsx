// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSingleFlightCallback } from '../../src/runtime/useSingleFlightCallback';

afterEach(() => {
  cleanup();
});

describe('useSingleFlightCallback', () => {
  it('admits only the first of two triggers fired inside the same tick', async () => {
    let settle: () => void = () => {};
    const action = vi.fn(() => new Promise<void>((resolve) => { settle = resolve; }));
    const { result } = renderHook(() => useSingleFlightCallback(action));

    // Incident shape: the ready-toast nudge and the chat "Continue" affordance
    // both fire "AI Optimize" before React has re-rendered any state flag.
    let admitted: boolean[] = [];
    act(() => {
      admitted = [result.current(), result.current()];
    });
    expect(admitted).toEqual([true, false]);
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle();
      await Promise.resolve();
    });
    // The slot reopens once the in-flight action settles.
    let again = false;
    act(() => {
      again = result.current();
    });
    expect(again).toBe(true);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('reopens the slot when the action rejects or throws synchronously', async () => {
    const rejecting = vi.fn(() => Promise.reject(new Error('boom')));
    const { result } = renderHook(() => useSingleFlightCallback(rejecting));
    await act(async () => {
      expect(result.current()).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current()).toBe(true);
    expect(rejecting).toHaveBeenCalledTimes(2);

    const throwing = vi.fn(() => { throw new Error('sync'); });
    const thrown = renderHook(() => useSingleFlightCallback(throwing));
    expect(() => thrown.result.current()).toThrow('sync');
    expect(() => thrown.result.current()).toThrow('sync');
    expect(throwing).toHaveBeenCalledTimes(2);
  });

  it('passes arguments through and returns false while a call is in flight', () => {
    const action = vi.fn((value: string) => new Promise<void>(() => { void value; }));
    const { result } = renderHook(() => useSingleFlightCallback(action));
    expect(result.current('first')).toBe(true);
    expect(result.current('second')).toBe(false);
    expect(action).toHaveBeenCalledWith('first');
    expect(action).not.toHaveBeenCalledWith('second');
  });
});
