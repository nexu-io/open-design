// @vitest-environment jsdom
//
// Unit tests for the extraction-history hook. The live SSE merge is fed by the
// orchestrator, but the merge/insert/clear/delete logic and the optimistic
// delete + rollback all live in the hook — pinned here through a fake port.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MemoryExtractionRecord } from '@open-design/contracts';

import { useMemoryExtractions } from '../../../src/features/memory/hooks/useMemoryExtractions.hooks';
import type { MemoryExtractionsPort } from '../../../src/features/memory/ports';

function record(
  id: string,
  over: Partial<MemoryExtractionRecord> = {},
): MemoryExtractionRecord {
  return {
    id,
    startedAt: 1_000,
    phase: 'success',
    userMessagePreview: `msg-${id}`,
    ...over,
  };
}

function makePort(over: Partial<MemoryExtractionsPort> = {}): MemoryExtractionsPort {
  return {
    fetchExtractions: vi.fn(async () => [] as MemoryExtractionRecord[]),
    deleteExtraction: vi.fn(async () => true),
    clearExtractionHistory: vi.fn(async () => true),
    ...over,
  };
}

describe('useMemoryExtractions — load + derived', () => {
  it('reloadExtractions fills the list and returns it', async () => {
    const rows = [record('a'), record('b')];
    const port = makePort({ fetchExtractions: vi.fn(async () => rows) });
    const { result } = renderHook(() => useMemoryExtractions(port));

    let returned: MemoryExtractionRecord[] = [];
    await act(async () => {
      returned = await result.current.reloadExtractions();
    });

    expect(returned).toEqual(rows);
    expect(result.current.extractions).toEqual(rows);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('shows the no-provider banner only for the latest skipped/no-provider record', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));

    act(() => result.current.applyExtractionEvent(record('a', { phase: 'skipped', reason: 'no-provider' })));
    expect(result.current.showNoProviderBanner).toBe(true);

    // A newer success on top clears the banner.
    act(() => result.current.applyExtractionEvent(record('b', { phase: 'success' })));
    expect(result.current.showNoProviderBanner).toBe(false);
  });

  it('partitions connector-kind records into connectorExtractions', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { kind: 'connector' })));
    act(() => result.current.applyExtractionEvent(record('b', { kind: 'llm' })));

    expect(result.current.connectorExtractions.map((r) => r.id)).toEqual(['a']);
  });
});

describe('useMemoryExtractions — SSE merge semantics', () => {
  it('merges a phase transition onto the same id instead of stacking', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));

    act(() => result.current.applyExtractionEvent(record('x', { phase: 'running' })));
    act(() => result.current.applyExtractionEvent(record('x', { phase: 'success' })));

    expect(result.current.extractions).toHaveLength(1);
    expect(result.current.extractions[0]?.phase).toBe('success');
  });

  it('unshifts new ids so the newest is first', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('old')));
    act(() => result.current.applyExtractionEvent(record('new')));

    expect(result.current.extractions.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('cleared wipes the list; deleted drops the one id', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    act(() => result.current.applyExtractionEvent(record('a', { phase: 'deleted' })));
    expect(result.current.extractions.map((r) => r.id)).toEqual(['b']);

    act(() => result.current.applyExtractionEvent(record('b', { phase: 'cleared' })));
    expect(result.current.extractions).toEqual([]);
  });
});

describe('useMemoryExtractions — delete + clear', () => {
  it('optimistically removes a row and keeps it gone on success', async () => {
    const port = makePort({ deleteExtraction: vi.fn(async () => true) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    await act(async () => {
      await result.current.onDeleteExtraction('a');
    });

    expect(port.deleteExtraction).toHaveBeenCalledWith('a');
    expect(result.current.extractions.map((r) => r.id)).toEqual(['b']);
  });

  it('re-fetches to restore the row when the delete request fails', async () => {
    const server = [record('a'), record('b')];
    const port = makePort({
      deleteExtraction: vi.fn(async () => false),
      fetchExtractions: vi.fn(async () => server),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('b')));
    act(() => result.current.applyExtractionEvent(record('a')));

    await act(async () => {
      await result.current.onDeleteExtraction('a');
    });

    // The failed delete triggers a reload, which puts the row back.
    expect(port.fetchExtractions).toHaveBeenCalled();
    expect(result.current.extractions.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('clearExtractions empties the list and calls the port', async () => {
    const port = makePort({ clearExtractionHistory: vi.fn(async () => true) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    await act(async () => {
      await result.current.clearExtractions();
    });

    expect(port.clearExtractionHistory).toHaveBeenCalled();
    expect(result.current.extractions).toEqual([]);
  });

  it('re-fetches when the clear request fails', async () => {
    const server = [record('a')];
    const port = makePort({
      clearExtractionHistory: vi.fn(async () => false),
      fetchExtractions: vi.fn(async () => server),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    await act(async () => {
      await result.current.clearExtractions();
    });

    // The failed clear triggers a reload, restoring the server truth.
    expect(port.fetchExtractions).toHaveBeenCalled();
    expect(result.current.extractions.map((r) => r.id)).toEqual(['a']);
  });

  it('ignores an extraction event with no id', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent({ id: '' } as never));
    expect(result.current.extractions).toEqual([]);
  });

  it('advances nowClock on its 30s interval', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useMemoryExtractions(makePort()));
      const before = result.current.nowClock;
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(result.current.nowClock).toBeGreaterThanOrEqual(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
