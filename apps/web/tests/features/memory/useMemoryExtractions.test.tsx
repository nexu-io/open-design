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

  it('keeps the prior rows and exposes a failure when the history reload rejects', async () => {
    const port = makePort({ fetchExtractions: vi.fn(async () => { throw new Error('offline'); }) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('saved')));

    await act(async () => {
      await result.current.reloadExtractions();
    });

    expect(result.current.extractions.map((row) => row.id)).toEqual(['saved']);
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('does not resurrect a row a newer SSE "deleted" frame removed while reloadExtractions() was in flight', async () => {
    let resolveFetch!: (rows: MemoryExtractionRecord[]) => void;
    const fetchPromise = new Promise<MemoryExtractionRecord[]>((resolve) => {
      resolveFetch = resolve;
    });
    const port = makePort({ fetchExtractions: vi.fn(() => fetchPromise) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });
    // A live 'deleted' frame removes 'a' while the reload's own read is still
    // in flight.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'deleted' })));
    expect(result.current.extractions).toHaveLength(0);

    // The reload's stale snapshot (fetched before the delete) resolves late.
    await act(async () => {
      resolveFetch([record('a')]);
      await reloading;
    });

    // The delete landed after the reload's read began, so it must win.
    expect(result.current.extractions.map((row) => row.id)).not.toContain('a');
  });

  it('does not regress a newer SSE phase transition with a stale reloadExtractions() snapshot', async () => {
    let resolveFetch!: (rows: MemoryExtractionRecord[]) => void;
    const fetchPromise = new Promise<MemoryExtractionRecord[]>((resolve) => {
      resolveFetch = resolve;
    });
    const port = makePort({ fetchExtractions: vi.fn(() => fetchPromise) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));

    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });
    // 'a' advances to 'success' while the reload's own read is still in flight.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success' })));

    // The reload's stale snapshot (fetched while 'a' was still 'running') resolves late.
    await act(async () => {
      resolveFetch([record('a', { phase: 'running' })]);
      await reloading;
    });

    // The live phase transition is newer than the reload's read and must not
    // be regressed back to 'running'.
    expect(result.current.extractions.find((row) => row.id === 'a')?.phase).toBe('success');
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

  it('does not let a racing reloadExtractions() resurrect a row whose delete already succeeded, before the SSE echo arrives', async () => {
    let resolveFetch!: (rows: MemoryExtractionRecord[]) => void;
    const fetchPromise = new Promise<MemoryExtractionRecord[]>((resolve) => {
      resolveFetch = resolve;
    });
    const port = makePort({
      deleteExtraction: vi.fn(async () => true),
      fetchExtractions: vi.fn(() => fetchPromise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    // A reload (e.g. from mount) starts and its read is still in flight.
    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });

    // The delete succeeds server-side while that reload's read is in flight —
    // deliberately before any SSE 'deleted' echo for it arrives.
    await act(async () => {
      await result.current.onDeleteExtraction('a');
    });
    expect(result.current.extractions.map((r) => r.id)).toEqual(['b']);

    // The reload's snapshot — fetched before the delete completed — resolves late.
    await act(async () => {
      resolveFetch([record('a'), record('b')]);
      await reloading;
    });

    // The tombstone must be stamped the moment the delete succeeds, not only
    // when the SSE echo lands, or this stale snapshot resurrects 'a'.
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

  it('re-fetches to restore the row when the delete request rejects', async () => {
    const server = [record('a'), record('b')];
    const port = makePort({
      deleteExtraction: vi.fn(async () => { throw new Error('network offline'); }),
      fetchExtractions: vi.fn(async () => server),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('b')));
    act(() => result.current.applyExtractionEvent(record('a')));

    await act(async () => {
      await result.current.onDeleteExtraction('a');
    });

    expect(port.fetchExtractions).toHaveBeenCalledOnce();
    expect(result.current.extractions.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('restores the optimistic row when delete and its recovery reload both fail', async () => {
    const port = makePort({
      deleteExtraction: vi.fn(async () => false),
      fetchExtractions: vi.fn(async () => { throw new Error('offline'); }),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    await act(async () => {
      await result.current.onDeleteExtraction('a');
    });

    expect(result.current.extractions.map((row) => row.id).sort()).toEqual(['a', 'b']);
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('preserves newer SSE state when failed-delete recovery also fails', async () => {
    let resolveDelete!: (value: boolean) => void;
    let rejectRecovery!: (reason?: unknown) => void;
    const deletePromise = new Promise<boolean>((resolve) => {
      resolveDelete = resolve;
    });
    const recoveryPromise = new Promise<MemoryExtractionRecord[]>((_, reject) => {
      rejectRecovery = reject;
    });
    const port = makePort({
      deleteExtraction: vi.fn(() => deletePromise),
      fetchExtractions: vi.fn(() => recoveryPromise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let deletion: Promise<void>;
    act(() => {
      deletion = result.current.onDeleteExtraction('a');
    });
    // A live event arrives while the failed delete is waiting to recover.
    act(() => result.current.applyExtractionEvent(record('newer', { phase: 'running' })));

    await act(async () => {
      resolveDelete(false);
      await Promise.resolve();
      rejectRecovery(new Error('offline'));
      await deletion!;
    });

    expect(result.current.extractions.map((row) => row.id)).toEqual(['newer', 'b']);
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('reconciles a failed delete while another overlapping delete succeeds', async () => {
    let resolveA!: (value: boolean) => void;
    let resolveB!: (value: boolean) => void;
    const deleteA = new Promise<boolean>((resolve) => { resolveA = resolve; });
    const deleteB = new Promise<boolean>((resolve) => { resolveB = resolve; });
    const port = makePort({
      deleteExtraction: vi.fn((id: string) => id === 'a' ? deleteA : deleteB),
      fetchExtractions: vi.fn(async () => [record('a')]),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let removeA: Promise<void>;
    let removeB: Promise<void>;
    act(() => {
      removeA = result.current.onDeleteExtraction('a');
      removeB = result.current.onDeleteExtraction('b');
    });

    await act(async () => {
      resolveB(true);
      await removeB!;
      resolveA(false);
      await removeA!;
    });

    expect(result.current.extractions.map((row) => row.id)).toEqual(['a']);
  });

  it('excludes a still-pending overlapping delete from a failed delete\'s reconciled recovery', async () => {
    let resolveA!: (value: boolean) => void;
    const deleteA = new Promise<boolean>((resolve) => { resolveA = resolve; });
    const deleteB = new Promise<boolean>(() => {}); // never resolves during this test
    const port = makePort({
      deleteExtraction: vi.fn((id: string) => id === 'a' ? deleteA : deleteB),
      // The server still has both rows — B's delete hasn't landed yet either.
      fetchExtractions: vi.fn(async () => [record('a'), record('b')]),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let removeA: Promise<void>;
    act(() => {
      removeA = result.current.onDeleteExtraction('a');
      void result.current.onDeleteExtraction('b'); // left in flight, deliberately unresolved
    });

    await act(async () => {
      resolveA(false);
      await removeA!;
    });

    // 'a' comes back from the confirmed recovery (its delete really failed),
    // but 'b' must NOT be resurrected — its own delete is still pending, so
    // the recovery's confirmed snapshot must defer to that in-flight removal.
    expect(result.current.extractions.map((row) => row.id)).toContain('a');
    expect(result.current.extractions.map((row) => row.id)).not.toContain('b');
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

  it('re-fetches when the clear request rejects', async () => {
    const server = [record('a')];
    const port = makePort({
      clearExtractionHistory: vi.fn(async () => { throw new Error('network offline'); }),
      fetchExtractions: vi.fn(async () => server),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    await act(async () => {
      await result.current.clearExtractions();
    });

    expect(port.fetchExtractions).toHaveBeenCalledOnce();
    expect(result.current.extractions.map((r) => r.id)).toEqual(['a']);
  });

  it('restores optimistic history when clear and its recovery reload both fail', async () => {
    const port = makePort({
      clearExtractionHistory: vi.fn(async () => false),
      fetchExtractions: vi.fn(async () => { throw new Error('offline'); }),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    await act(async () => {
      await result.current.clearExtractions();
    });

    expect(result.current.extractions.map((row) => row.id)).toEqual(['a']);
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('preserves newer SSE state when failed-clear recovery also fails', async () => {
    let resolveClear!: (value: boolean) => void;
    let rejectRecovery!: (reason?: unknown) => void;
    const clearPromise = new Promise<boolean>((resolve) => {
      resolveClear = resolve;
    });
    const recoveryPromise = new Promise<MemoryExtractionRecord[]>((_, reject) => {
      rejectRecovery = reject;
    });
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clearPromise),
      fetchExtractions: vi.fn(() => recoveryPromise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // A live event arrives while the failed clear is waiting to recover.
    act(() => result.current.applyExtractionEvent(record('newer', { phase: 'running' })));

    await act(async () => {
      resolveClear(false);
      await Promise.resolve();
      rejectRecovery(new Error('offline'));
      await clearing!;
    });

    // The revision advanced past the clear's own optimistic snapshot before
    // the (also-failing) recovery settled, so the rollback must be skipped —
    // clobbering the newer live state with the stale pre-clear snapshot would
    // be wrong even though the recovery itself failed too.
    expect(result.current.extractions.map((row) => row.id)).toEqual(['newer']);
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('reconciles a newer SSE row into the recovered list when a failed clear\'s recovery fetch succeeds after an intervening event', async () => {
    let resolveClear!: (value: boolean) => void;
    let resolveRecovery!: (value: MemoryExtractionRecord[]) => void;
    const clearPromise = new Promise<boolean>((resolve) => {
      resolveClear = resolve;
    });
    const recoveryPromise = new Promise<MemoryExtractionRecord[]>((resolve) => {
      resolveRecovery = resolve;
    });
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clearPromise),
      fetchExtractions: vi.fn(() => recoveryPromise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // A live event arrives while the failed clear is waiting on its recovery
    // fetch, advancing the revision past the clear's optimistic snapshot.
    act(() => result.current.applyExtractionEvent(record('newer', { phase: 'running' })));

    await act(async () => {
      resolveClear(false);
      await Promise.resolve();
      // The daemon's confirmed history still has the original row 'a' — the
      // clear was rejected server-side.
      resolveRecovery([record('a')]);
      await clearing!;
    });

    // Both the confirmed 'a' row and the newer live-arrived row must survive;
    // the recovery must reconcile instead of being dropped by the stale
    // revision check or overwriting the newer SSE state.
    expect(result.current.extractions.map((row) => row.id).sort()).toEqual(['a', 'newer']);
    expect(result.current.loadError).toBeNull();
  });

  it('does not resurrect a row that a newer SSE "deleted" event removed after a failed delete\'s recovery snapshot was taken', async () => {
    let resolveDelete!: (value: boolean) => void;
    let resolveRecovery!: (value: MemoryExtractionRecord[]) => void;
    const deletePromise = new Promise<boolean>((resolve) => {
      resolveDelete = resolve;
    });
    const recoveryPromise = new Promise<MemoryExtractionRecord[]>((resolve) => {
      resolveRecovery = resolve;
    });
    const port = makePort({
      deleteExtraction: vi.fn(() => deletePromise),
      fetchExtractions: vi.fn(() => recoveryPromise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let deletion: Promise<void>;
    act(() => {
      // Fails to delete 'a'.
      deletion = result.current.onDeleteExtraction('a');
    });
    // A remote client deletes 'b' while the failed-delete recovery for 'a' is
    // still in flight.
    act(() => result.current.applyExtractionEvent(record('b', { phase: 'deleted' })));

    await act(async () => {
      resolveDelete(false);
      await Promise.resolve();
      // The recovery snapshot was captured server-side BEFORE 'b' was
      // deleted, so it still lists both rows.
      resolveRecovery([record('a'), record('b')]);
      await deletion!;
    });

    // 'a' comes back (the failed delete really did fail), but 'b' must stay
    // gone — the newer destructive event is more authoritative than the
    // stale pre-event snapshot.
    expect(result.current.extractions.map((row) => row.id)).toEqual(['a']);
  });

  it('does not resurrect any row after a newer SSE "cleared" event lands during a failed clear\'s recovery fetch', async () => {
    let resolveClear!: (value: boolean) => void;
    let resolveRecovery!: (value: MemoryExtractionRecord[]) => void;
    const clearPromise = new Promise<boolean>((resolve) => {
      resolveClear = resolve;
    });
    const recoveryPromise = new Promise<MemoryExtractionRecord[]>((resolve) => {
      resolveRecovery = resolve;
    });
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clearPromise),
      fetchExtractions: vi.fn(() => recoveryPromise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // A remote client clears the whole history while this failed clear's
    // recovery fetch is still in flight.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'cleared' })));

    await act(async () => {
      resolveClear(false);
      await Promise.resolve();
      // Stale pre-clear snapshot from the server.
      resolveRecovery([record('a')]);
      await clearing!;
    });

    // The newer remote clear supersedes the stale confirmed snapshot.
    expect(result.current.extractions).toEqual([]);
  });

  it('keeps a same-id phase transition that lands during a failed delete\'s recovery instead of restoring the snapshot\'s older phase', async () => {
    let resolveDelete!: (value: boolean) => void;
    let resolveRecovery!: (value: MemoryExtractionRecord[]) => void;
    const deletePromise = new Promise<boolean>((resolve) => {
      resolveDelete = resolve;
    });
    const recoveryPromise = new Promise<MemoryExtractionRecord[]>((resolve) => {
      resolveRecovery = resolve;
    });
    const port = makePort({
      deleteExtraction: vi.fn(() => deletePromise),
      fetchExtractions: vi.fn(() => recoveryPromise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('b', { startedAt: 1_000 })));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running', startedAt: 2_000 })));

    let deletion: Promise<void>;
    act(() => {
      // Fails to delete 'b'.
      deletion = result.current.onDeleteExtraction('b');
    });
    // While the failed delete's recovery fetch is in flight, the live stream
    // advances 'a' from running to success.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success', startedAt: 2_000 })));

    await act(async () => {
      resolveDelete(false);
      await Promise.resolve();
      // The recovery snapshot was captured BEFORE the transition landed, so
      // it still holds 'a' at the older running phase.
      resolveRecovery([
        record('a', { phase: 'running', startedAt: 2_000 }),
        record('b', { startedAt: 1_000 }),
      ]);
      await deletion!;
    });

    // 'b' comes back (its delete really failed), but the newer local phase of
    // 'a' survives — latest event wins over the stale snapshot — and the list
    // stays newest-first.
    expect(result.current.extractions.map((row) => `${row.id}:${row.phase}`)).toEqual([
      'a:success',
      'b:success',
    ]);
  });

  it('keeps a row that arrived during a failed clear\'s recovery ahead of the older rows the snapshot restores', async () => {
    let resolveClear!: (value: boolean) => void;
    let resolveRecovery!: (value: MemoryExtractionRecord[]) => void;
    const clearPromise = new Promise<boolean>((resolve) => {
      resolveClear = resolve;
    });
    const recoveryPromise = new Promise<MemoryExtractionRecord[]>((resolve) => {
      resolveRecovery = resolve;
    });
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clearPromise),
      fetchExtractions: vi.fn(() => recoveryPromise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('old', { startedAt: 1_000 })));

    let clearing: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // A brand-new attempt starts while the failed clear's recovery fetch is
    // still in flight.
    act(() => result.current.applyExtractionEvent(record('newer', { phase: 'running', startedAt: 3_000 })));

    await act(async () => {
      resolveClear(false);
      await Promise.resolve();
      resolveRecovery([record('old', { startedAt: 1_000 })]);
      await clearing!;
    });

    // The restored row must slot in BEHIND the newer live arrival, not be
    // blindly prepended ahead of it.
    expect(result.current.extractions.map((row) => row.id)).toEqual(['newer', 'old']);
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
