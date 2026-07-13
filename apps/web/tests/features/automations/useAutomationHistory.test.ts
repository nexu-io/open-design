// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutomationHistory } from '../../../src/features/automations/hooks/useAutomationHistory.hooks';
import type { RoutineHistoryPort } from '../../../src/features/automations/ports';

describe('useAutomationHistory', () => {
  it('loads runs on mount and re-fetches when refreshKey changes', async () => {
    const fetchRoutineRuns = vi.fn(async () => [{ id: 'run-1' }] as never);
    const port: RoutineHistoryPort = { fetchRoutineRuns };
    const { result, rerender } = renderHook(({ refreshKey }) => useAutomationHistory(port, 'routine-1', refreshKey), {
      initialProps: { refreshKey: 0 },
    });
    await waitFor(() => expect(result.current.runs).not.toBeNull());
    expect(fetchRoutineRuns).toHaveBeenCalledWith('routine-1', 10);

    rerender({ refreshKey: 1 });
    await waitFor(() => expect(fetchRoutineRuns).toHaveBeenCalledTimes(2));
  });

  it('falls back to an empty list when the transport throws', async () => {
    const port: RoutineHistoryPort = {
      fetchRoutineRuns: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const { result } = renderHook(() => useAutomationHistory(port, 'routine-1', 0));
    await waitFor(() => expect(result.current.runs).toEqual([]));
  });

  it('ignores a success that resolves after unmount', async () => {
    let resolveFetch: (runs: never[]) => void = () => {};
    const port: RoutineHistoryPort = {
      fetchRoutineRuns: vi.fn(
        () => new Promise<never[]>((resolve) => { resolveFetch = resolve; }),
      ),
    };
    const { unmount } = renderHook(() => useAutomationHistory(port, 'routine-1', 0));
    unmount();
    await act(async () => {
      resolveFetch([]);
    });
    // No React "state update on an unmounted component" warning/crash means
    // the `cancelled` guard held.
  });

  it('ignores a rejection that resolves after unmount', async () => {
    let rejectFetch: (err: Error) => void = () => {};
    const port: RoutineHistoryPort = {
      fetchRoutineRuns: vi.fn(
        () => new Promise<never[]>((_resolve, reject) => { rejectFetch = reject; }),
      ),
    };
    const { unmount } = renderHook(() => useAutomationHistory(port, 'routine-1', 0));
    unmount();
    await act(async () => {
      rejectFetch(new Error('boom'));
    });
  });
});
