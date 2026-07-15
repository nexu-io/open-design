// @vitest-environment jsdom
//
// Unit tests for the extraction-history hook, organized as the interleaving
// matrix of its three event sources: live SSE frames, GET snapshots (reloads
// and failure-recovery reads), and local optimistic mutations (delete/clear).
// Every scenario the file's review history surfaced — reload-vs-reload,
// delete-vs-reload, clear-vs-reload, delete-vs-delete (incl. same id),
// SSE-phase-vs-GET-content, delete-vs-SSE, clear-vs-SSE, clear-vs-delete,
// and their combinations — is pinned in the describe block named for that
// source pair. The live SSE merge is fed by the orchestrator, but all
// merge/insert/clear/delete logic and the optimistic flows live in the hook,
// exercised here through a fake port.
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

/** A hand-rolled deferred so tests control exactly when each call settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ─── GET alone: load basics + failure surface ───────────────────────────────

describe('useMemoryExtractions — reload basics', () => {
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

  it('drops a row the confirmed snapshot no longer has, when nothing local advanced it after the read began', async () => {
    // 'a' fell off the server (capacity eviction, or removed by another
    // client) without ever going through this client's own delete/clear.
    const port = makePort({ fetchExtractions: vi.fn(async () => [record('b')]) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    await act(async () => {
      await result.current.reloadExtractions();
    });

    expect(result.current.extractions.map((r) => r.id)).toEqual(['b']);
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

  it('returns the preserved state (not a fabricated empty array) when the history reload rejects', async () => {
    const port = makePort({ fetchExtractions: vi.fn(async () => { throw new Error('offline'); }) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('saved')));

    let returned: MemoryExtractionRecord[] = [];
    await act(async () => {
      returned = await result.current.reloadExtractions();
    });

    // A real caller (useMemoryConnectors.onSuggestConnectorMemory) reads this
    // return value directly to look for a just-written extraction; a
    // fabricated [] here would hide rows the UI still shows.
    expect(returned.map((row) => row.id)).toEqual(['saved']);
    expect(returned).toEqual(result.current.extractions);
  });
});

// ─── GET vs GET: overlapping reloads are client-ordered by call order ───────

describe('useMemoryExtractions — reload vs reload', () => {
  it('discards a stale reload response once a newer reloadExtractions() call has already started', async () => {
    const readA = deferred<MemoryExtractionRecord[]>();
    const readB = deferred<MemoryExtractionRecord[]>();
    let call = 0;
    const port = makePort({
      fetchExtractions: vi.fn(() => (++call === 1 ? readA.promise : readB.promise)),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let reloadingA!: Promise<MemoryExtractionRecord[]>;
    let reloadingB!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloadingA = result.current.reloadExtractions();
      reloadingB = result.current.reloadExtractions();
    });

    // B — the LATER-started call — resolves first, correctly reflecting that
    // the row is now gone server-side.
    let returnedB: MemoryExtractionRecord[] = [];
    await act(async () => {
      readB.resolve([]);
      returnedB = await reloadingB;
    });
    expect(returnedB).toEqual([]);
    expect(result.current.extractions).toEqual([]);

    // A — the EARLIER-started call — resolves later with stale data that
    // still has the row. A newer call already committed, so A's response
    // must be discarded outright rather than reconciled.
    let returnedA: MemoryExtractionRecord[] = [];
    await act(async () => {
      readA.resolve([record('a')]);
      returnedA = await reloadingA;
    });
    expect(returnedA).toEqual([]);
    expect(result.current.extractions).toEqual([]);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('does not surface a load error from a superseded reload that rejects after a newer reload committed', async () => {
    const readA = deferred<MemoryExtractionRecord[]>();
    const readB = deferred<MemoryExtractionRecord[]>();
    let call = 0;
    const port = makePort({
      fetchExtractions: vi.fn(() => (++call === 1 ? readA.promise : readB.promise)),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));

    let reloadingA!: Promise<MemoryExtractionRecord[]>;
    let reloadingB!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloadingA = result.current.reloadExtractions();
      reloadingB = result.current.reloadExtractions();
    });

    await act(async () => {
      readB.resolve([record('fresh')]);
      await reloadingB;
    });

    // The abandoned older read failing is not news about the CURRENT state —
    // the newer read already succeeded.
    let returnedA: MemoryExtractionRecord[] = [];
    await act(async () => {
      readA.reject(new Error('offline'));
      returnedA = await reloadingA;
    });

    expect(result.current.loadError).toBeNull();
    expect(returnedA.map((row) => row.id)).toEqual(['fresh']);
    expect(result.current.extractions.map((row) => row.id)).toEqual(['fresh']);
  });
});

// ─── SSE alone: stream merge semantics ──────────────────────────────────────

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

  it('does not regress a terminal row when a delayed running frame for the same id arrives late', async () => {
    // Two frames for one id can arrive out of emission order after an SSE
    // reconnect replays buffered events; content ordering must decide.
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('x', { phase: 'success', finishedAt: 2_000 })));
    act(() => result.current.applyExtractionEvent(record('x', { phase: 'running' })));

    expect(result.current.extractions[0]?.phase).toBe('success');
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

  it('permanently ignores frames for an id a "deleted" frame already removed', async () => {
    // Attempt ids are UUIDs and never reused; a frame emitted before the
    // delete but delivered after it must not recreate the row.
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'deleted' })));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success', finishedAt: 2_000 })));

    expect(result.current.extractions).toEqual([]);
  });

  it('caps live-inserted history at 30 rows', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => {
      for (let i = 0; i < 31; i += 1) {
        result.current.applyExtractionEvent(record(`row-${i}`));
      }
    });

    expect(result.current.extractions).toHaveLength(30);
    expect(result.current.extractions[0]?.id).toBe('row-30');
  });

  it('ignores an extraction event with no id', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent({ id: '' } as never));
    expect(result.current.extractions).toEqual([]);
  });
});

// ─── GET vs SSE: two server-originated channels, content-ordered ────────────

describe('useMemoryExtractions — reload vs SSE', () => {
  it('does not resurrect a row a newer SSE "deleted" frame removed while reloadExtractions() was in flight', async () => {
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({ fetchExtractions: vi.fn(() => read.promise) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });
    // A live 'deleted' frame removes 'a' while the reload's own read is
    // still in flight.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'deleted' })));
    expect(result.current.extractions).toHaveLength(0);

    // The reload's stale snapshot (fetched before the delete) resolves late.
    await act(async () => {
      read.resolve([record('a')]);
      await reloading;
    });

    expect(result.current.extractions.map((row) => row.id)).not.toContain('a');
  });

  it('does not regress a newer SSE phase transition with a stale reloadExtractions() snapshot', async () => {
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({ fetchExtractions: vi.fn(() => read.promise) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));

    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });
    // 'a' advances to 'success' while the reload's read is still in flight.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success' })));

    await act(async () => {
      read.resolve([record('a', { phase: 'running' })]);
      await reloading;
    });

    expect(result.current.extractions.find((row) => row.id === 'a')?.phase).toBe('success');
  });

  it('uses a confirmed terminal phase when a reload started before a same-id running SSE frame', async () => {
    // The reverse direction: the GET is the MORE progressed side even though
    // the stream frame arrived after the GET started. Reception order says
    // nothing; phase progression decides.
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({ fetchExtractions: vi.fn(() => read.promise) });
    const { result } = renderHook(() => useMemoryExtractions(port));

    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));

    await act(async () => {
      read.resolve([record('a', { phase: 'success', finishedAt: 2_000 })]);
      await reloading;
    });

    expect(result.current.extractions.find((row) => row.id === 'a')?.phase).toBe('success');
  });

  it('breaks a terminal-vs-terminal conflict by completion timestamp, not reception order', async () => {
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({ fetchExtractions: vi.fn(() => read.promise) });
    const { result } = renderHook(() => useMemoryExtractions(port));

    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });
    // The stream lands a LATER terminal result while the GET is in flight.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'failed', finishedAt: 3_000 })));

    await act(async () => {
      read.resolve([record('a', { phase: 'success', finishedAt: 2_000 })]);
      await reloading;
    });

    expect(result.current.extractions.find((row) => row.id === 'a')?.phase).toBe('failed');
  });
});

// ─── delete: optimistic flow + failure recovery ─────────────────────────────

describe('useMemoryExtractions — delete flow', () => {
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

    // The failed delete triggers a recovery read, which puts the row back.
    expect(port.fetchExtractions).toHaveBeenCalled();
    expect(result.current.extractions.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('re-fetches to restore the row when the delete request rejects', async () => {
    // A network failure REJECTS rather than resolving the adapter's normal
    // non-2xx `false`; both must recover identically.
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
    const del = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let deletion!: Promise<void>;
    act(() => {
      deletion = result.current.onDeleteExtraction('a');
    });
    // A live event arrives while the failed delete is waiting to recover —
    // restoring the pre-delete snapshot wholesale would erase it.
    act(() => result.current.applyExtractionEvent(record('newer', { phase: 'running' })));

    await act(async () => {
      del.resolve(false);
      await Promise.resolve();
      recovery.reject(new Error('offline'));
      await deletion;
    });

    expect(result.current.extractions.map((row) => row.id)).toEqual(['newer', 'b']);
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });
});

// ─── delete vs SSE ──────────────────────────────────────────────────────────

describe('useMemoryExtractions — delete vs SSE', () => {
  it('does not resurrect a confirmed delete when a delayed phase frame for that id arrives', async () => {
    const port = makePort({ deleteExtraction: vi.fn(async () => true) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));

    await act(async () => {
      await result.current.onDeleteExtraction('a');
    });
    act(() => result.current.applyExtractionEvent(record('a', {
      phase: 'success',
      finishedAt: 2_000,
    })));

    expect(result.current.extractions.map((row) => row.id)).not.toContain('a');
  });

  it('keeps a running row hidden while its delete is pending, then restores its progressed phase after failure', async () => {
    const del = deferred<boolean>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(async () => [record('a', {
        phase: 'success',
        finishedAt: 2_000,
      })]),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));

    let deletion!: Promise<void>;
    act(() => {
      deletion = result.current.onDeleteExtraction('a');
    });
    // The attempt completes while its delete is in flight; the frame must be
    // buffered, not shown (it would visibly undo the optimistic removal).
    act(() => result.current.applyExtractionEvent(record('a', {
      phase: 'success',
      finishedAt: 2_000,
    })));
    expect(result.current.extractions).toEqual([]);

    await act(async () => {
      del.resolve(false);
      await deletion;
    });
    expect(result.current.extractions.find((row) => row.id === 'a')?.phase).toBe('success');
  });

  it('does not resurrect a row that a newer SSE "deleted" event removed after a failed delete\'s recovery snapshot was taken', async () => {
    const del = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let deletion!: Promise<void>;
    act(() => {
      // Fails to delete 'a'.
      deletion = result.current.onDeleteExtraction('a');
    });
    // A remote client deletes 'b' while the failed-delete recovery for 'a'
    // is still in flight.
    act(() => result.current.applyExtractionEvent(record('b', { phase: 'deleted' })));

    await act(async () => {
      del.resolve(false);
      await Promise.resolve();
      // The recovery snapshot was captured server-side BEFORE 'b' was
      // deleted, so it still lists both rows.
      recovery.resolve([record('a'), record('b')]);
      await deletion;
    });

    // 'a' comes back (the failed delete really did fail), but 'b' must stay
    // gone — the confirmed removal is permanent, no matter how stale reads
    // interleave.
    expect(result.current.extractions.map((row) => row.id)).toEqual(['a']);
  });

  it('keeps a same-id phase transition that lands during a failed delete\'s recovery instead of restoring the snapshot\'s older phase', async () => {
    const del = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('b', { startedAt: 1_000 })));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running', startedAt: 2_000 })));

    let deletion!: Promise<void>;
    act(() => {
      // Fails to delete 'b'.
      deletion = result.current.onDeleteExtraction('b');
    });
    // While the recovery read is in flight, the live stream advances 'a'.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success', startedAt: 2_000 })));

    await act(async () => {
      del.resolve(false);
      await Promise.resolve();
      // The recovery snapshot predates the transition: 'a' still 'running'.
      recovery.resolve([
        record('a', { phase: 'running', startedAt: 2_000 }),
        record('b', { startedAt: 1_000 }),
      ]);
      await deletion;
    });

    // 'b' comes back (its delete really failed), the newer phase of 'a'
    // survives, and the list stays newest-first.
    expect(result.current.extractions.map((row) => `${row.id}:${row.phase}`)).toEqual([
      'a:success',
      'b:success',
    ]);
  });
});

// ─── delete vs delete ───────────────────────────────────────────────────────

describe('useMemoryExtractions — delete vs delete', () => {
  it('reconciles a failed delete while another overlapping delete succeeds', async () => {
    const delA = deferred<boolean>();
    const delB = deferred<boolean>();
    const port = makePort({
      deleteExtraction: vi.fn((id: string) => (id === 'a' ? delA.promise : delB.promise)),
      // The recovery read reflects B already gone but A still present.
      fetchExtractions: vi.fn(async () => [record('a')]),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let removeA!: Promise<void>;
    let removeB!: Promise<void>;
    act(() => {
      removeA = result.current.onDeleteExtraction('a');
      removeB = result.current.onDeleteExtraction('b');
    });

    await act(async () => {
      delB.resolve(true);
      await removeB;
      delA.resolve(false);
      await removeA;
    });

    expect(result.current.extractions.map((row) => row.id)).toEqual(['a']);
  });

  it('excludes a still-pending overlapping delete from a failed delete\'s reconciled recovery', async () => {
    const delA = deferred<boolean>();
    const port = makePort({
      deleteExtraction: vi.fn((id: string) =>
        id === 'a' ? delA.promise : new Promise<boolean>(() => {})),
      // The server still has both rows — B's delete hasn't landed yet either.
      fetchExtractions: vi.fn(async () => [record('a'), record('b')]),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let removeA!: Promise<void>;
    act(() => {
      removeA = result.current.onDeleteExtraction('a');
      void result.current.onDeleteExtraction('b'); // left in flight, deliberately unresolved
    });

    await act(async () => {
      delA.resolve(false);
      await removeA;
    });

    // 'a' comes back (its delete really failed), but 'b' must NOT be
    // resurrected — its own delete is still pending, so the recovery's
    // confirmed snapshot must defer to that in-flight removal.
    expect(result.current.extractions.map((row) => row.id)).toContain('a');
    expect(result.current.extractions.map((row) => row.id)).not.toContain('b');
  });

  it('keeps a row pending through a failed delete\'s recovery while an overlapping SAME-id delete is still in flight', async () => {
    // Pending deletes are refcounted: a Set's single membership would let
    // the first settle clear the marker out from under the second call.
    const first = deferred<boolean>();
    let call = 0;
    const port = makePort({
      deleteExtraction: vi.fn(() =>
        ++call === 1 ? first.promise : new Promise<boolean>(() => {})),
      fetchExtractions: vi.fn(async () => [record('a')]),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let firstDeletion!: Promise<void>;
    act(() => {
      firstDeletion = result.current.onDeleteExtraction('a');
      void result.current.onDeleteExtraction('a'); // second call, same id, left in flight
    });

    await act(async () => {
      first.resolve(false);
      await firstDeletion;
    });

    // The second delete for the same id is still in flight, so the confirmed
    // recovery read (which still shows 'a' server-side) must not resurrect
    // it while that second request could still succeed.
    expect(result.current.extractions.map((r) => r.id)).not.toContain('a');
  });
});

// ─── delete vs reload ───────────────────────────────────────────────────────

describe('useMemoryExtractions — delete vs reload', () => {
  it("reloadExtractions()'s return value reflects what actually committed, not the raw fetch response", async () => {
    const del = deferred<boolean>();
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(() => read.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let deletion!: Promise<void>;
    act(() => {
      deletion = result.current.onDeleteExtraction('a');
    });
    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });

    let returned: MemoryExtractionRecord[] = [];
    await act(async () => {
      // The reload's server read still includes 'a' — the delete hasn't been
      // confirmed server-side yet — but the local pending deletion must win.
      read.resolve([record('a'), record('b')]);
      returned = await reloading;
    });

    expect(returned.map((r) => r.id)).not.toContain('a');
    expect(result.current.extractions.map((r) => r.id)).toEqual(returned.map((r) => r.id));

    await act(async () => {
      del.resolve(true);
      await deletion;
    });
  });

  it('does not resurrect a row whose delete succeeds while a reload that started at the same logical time is still awaiting its own stale read', async () => {
    const del = deferred<boolean>();
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(() => read.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let deletion!: Promise<void>;
    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      // The reload captures its since-clock right after the delete's own
      // optimistic removal, before the delete's request settles either way —
      // the exact equality-boundary case that once slipped a strict `>`.
      deletion = result.current.onDeleteExtraction('a');
      reloading = result.current.reloadExtractions();
    });

    // The delete succeeds first: the removal is now confirmed and permanent.
    await act(async () => {
      del.resolve(true);
      await deletion;
    });
    expect(result.current.extractions.map((r) => r.id)).toEqual(['b']);

    // ...then the reload's OWN read resolves with stale, pre-delete data:
    // its GET reached the server before the DELETE did.
    let returned: MemoryExtractionRecord[] = [];
    await act(async () => {
      read.resolve([record('a'), record('b')]);
      returned = await reloading;
    });

    expect(returned.map((r) => r.id)).not.toContain('a');
    expect(result.current.extractions.map((r) => r.id)).toEqual(['b']);
  });

  it('does not resurrect either row when two overlapping deletes both succeed while a stale reload is still in flight', async () => {
    const delA = deferred<boolean>();
    const delB = deferred<boolean>();
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      deleteExtraction: vi.fn((id: string) => (id === 'a' ? delA.promise : delB.promise)),
      fetchExtractions: vi.fn(() => read.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));
    act(() => result.current.applyExtractionEvent(record('b')));

    let deletionA!: Promise<void>;
    let deletionB!: Promise<void>;
    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      // Two deletes fired back-to-back in the same tick, before either has
      // re-rendered, plus a reload capturing the same starting point.
      deletionA = result.current.onDeleteExtraction('a');
      deletionB = result.current.onDeleteExtraction('b');
      reloading = result.current.reloadExtractions();
    });

    await act(async () => {
      delA.resolve(true);
      await deletionA;
      delB.resolve(true);
      await deletionB;
    });
    expect(result.current.extractions).toEqual([]);

    // The reload's GET raced ahead of both DELETEs server-side.
    let returned: MemoryExtractionRecord[] = [];
    await act(async () => {
      read.resolve([record('a'), record('b')]);
      returned = await reloading;
    });

    expect(returned).toEqual([]);
    expect(result.current.extractions).toEqual([]);
  });

  it('does not let a racing reloadExtractions() resurrect a row whose delete already succeeded, before the SSE echo arrives', async () => {
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      deleteExtraction: vi.fn(async () => true),
      fetchExtractions: vi.fn(() => read.promise),
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

    // The reload's snapshot — fetched before the delete completed — resolves
    // late. The tombstone lands the moment the delete succeeds, not only
    // when the SSE echo does.
    await act(async () => {
      read.resolve([record('a'), record('b')]);
      await reloading;
    });

    expect(result.current.extractions.map((r) => r.id)).toEqual(['b']);
  });
});

// ─── clear: optimistic flow + failure recovery ──────────────────────────────

describe('useMemoryExtractions — clear flow', () => {
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
    const clear = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clear.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing!: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // A live event arrives while the clear is in flight (buffered), and is
    // replayed when the clear fails — advancing local state past the clear's
    // pre-wipe snapshot, so the rollback must be skipped.
    act(() => result.current.applyExtractionEvent(record('newer', { phase: 'running' })));

    await act(async () => {
      clear.resolve(false);
      await Promise.resolve();
      recovery.reject(new Error('offline'));
      await clearing;
    });

    expect(result.current.extractions.map((row) => row.id)).toEqual(['newer']);
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('reconciles a newer SSE row into the recovered list when a failed clear\'s recovery fetch succeeds after an intervening event', async () => {
    const clear = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clear.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing!: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    act(() => result.current.applyExtractionEvent(record('newer', { phase: 'running' })));

    await act(async () => {
      clear.resolve(false);
      await Promise.resolve();
      // The daemon's confirmed history still has the original row 'a' — the
      // clear was rejected server-side.
      recovery.resolve([record('a')]);
      await clearing;
    });

    // Both the confirmed 'a' row and the newer live-arrived row survive; the
    // recovery reconciles instead of being dropped or overwriting.
    expect(result.current.extractions.map((row) => row.id).sort()).toEqual(['a', 'newer']);
    expect(result.current.loadError).toBeNull();
  });

  it('keeps a row that arrived during a failed clear\'s recovery ahead of the older rows the snapshot restores', async () => {
    const clear = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clear.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('old', { startedAt: 1_000 })));

    let clearing!: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // A brand-new attempt starts while the clear is in flight.
    act(() => result.current.applyExtractionEvent(record('newer', { phase: 'running', startedAt: 3_000 })));

    await act(async () => {
      clear.resolve(false);
      await Promise.resolve();
      recovery.resolve([record('old', { startedAt: 1_000 })]);
      await clearing;
    });

    // The restored row slots in BEHIND the newer live arrival by start time,
    // not blindly prepended ahead of it.
    expect(result.current.extractions.map((row) => row.id)).toEqual(['newer', 'old']);
  });
});

// ─── clear vs SSE ───────────────────────────────────────────────────────────

describe('useMemoryExtractions — clear vs SSE', () => {
  it('does not resurrect a running row when clear succeeds after live phase frames race it', async () => {
    const clear = deferred<boolean>();
    const port = makePort({ clearExtractionHistory: vi.fn(() => clear.promise) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));

    let clearing!: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // The extraction can complete while DELETE /extractions is in flight.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success' })));

    await act(async () => {
      clear.resolve(true);
      await clearing;
    });
    // An already-queued SSE frame may still arrive after the successful
    // response. Attempt ids are never reused, so it must stay tombstoned.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success' })));

    expect(result.current.extractions).toEqual([]);
  });

  it('keeps phase frames hidden during a pending clear, then replays them if clear fails', async () => {
    const clear = deferred<boolean>();
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clear.promise),
      // The phase frame is the newest known state even though the later
      // recovery snapshot no longer contains the row.
      fetchExtractions: vi.fn(async () => []),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));

    let clearing!: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success' })));

    expect(result.current.extractions).toEqual([]);

    await act(async () => {
      clear.resolve(false);
      await clearing;
    });

    expect(result.current.extractions.map((row) => `${row.id}:${row.phase}`)).toEqual(['a:success']);
  });

  it('permanently drops an id first observed during a pending clear once that clear succeeds', async () => {
    // A frame arriving inside the clear window may have been emitted BEFORE
    // the daemon performed the clear and merely delivered late; the clear
    // owns every id observed before its success.
    const clear = deferred<boolean>();
    const port = makePort({ clearExtractionHistory: vi.fn(() => clear.promise) });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing!: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // 'ghost' was never displayed; its first frame lands mid-clear.
    act(() => result.current.applyExtractionEvent(record('ghost', { phase: 'running' })));

    await act(async () => {
      clear.resolve(true);
      await clearing;
    });
    // Neither a later frame nor a stale read may recreate it.
    act(() => result.current.applyExtractionEvent(record('ghost', { phase: 'success', finishedAt: 2_000 })));

    expect(result.current.extractions).toEqual([]);
  });

  it('does not resurrect any row after a newer SSE "cleared" event lands during a failed clear\'s recovery fetch', async () => {
    const clear = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clear.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing!: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    // A remote client clears the whole history while this failed clear's
    // recovery fetch is still in flight.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'cleared' })));

    await act(async () => {
      clear.resolve(false);
      await Promise.resolve();
      // Stale pre-clear snapshot from the server.
      recovery.resolve([record('a')]);
      await clearing;
    });

    expect(result.current.extractions).toEqual([]);
  });

  it('lets a remote "cleared" frame tombstone an id currently hidden by a pending local delete', async () => {
    const del = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let deletion!: Promise<void>;
    act(() => {
      deletion = result.current.onDeleteExtraction('a');
    });
    // A remote clear lands while 'a' is optimistically hidden. The clear
    // covered 'a' on the daemon, so 'a' is permanently gone even though this
    // client's own delete then fails.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'cleared' })));

    await act(async () => {
      del.resolve(false);
      await Promise.resolve();
      // The failed delete's recovery read is stale — captured pre-clear.
      recovery.resolve([record('a')]);
      await deletion;
    });

    expect(result.current.extractions).toEqual([]);
  });
});

// ─── clear vs clear ─────────────────────────────────────────────────────────

describe('useMemoryExtractions — clear vs clear', () => {
  it('does not let a failed clear recovery repopulate rows while another clear is pending', async () => {
    const firstClear = deferred<boolean>();
    const secondClear = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    let call = 0;
    const port = makePort({
      clearExtractionHistory: vi.fn(() => (++call === 1 ? firstClear.promise : secondClear.promise)),
      fetchExtractions: vi.fn(() => recovery.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.clearExtractions();
      second = result.current.clearExtractions();
    });

    await act(async () => {
      firstClear.resolve(false);
      await Promise.resolve();
      recovery.resolve([record('a')]);
      await first;
    });

    expect(result.current.extractions).toEqual([]);

    await act(async () => {
      secondClear.resolve(true);
      await second;
    });

    expect(result.current.extractions).toEqual([]);
  });
});

// ─── clear vs delete ────────────────────────────────────────────────────────

describe('useMemoryExtractions — clear vs delete', () => {
  it('does not leave a row resurrected by a failed delete\'s recovery in place once a concurrent clear succeeds', async () => {
    const del = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const clear = deferred<boolean>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
      clearExtractionHistory: vi.fn(() => clear.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let deletion!: Promise<void>;
    let clearing!: Promise<void>;
    act(() => {
      deletion = result.current.onDeleteExtraction('a');
      clearing = result.current.clearExtractions();
    });

    // The delete fails; its recovery read resolves with a stale, pre-clear
    // snapshot that still has 'a' — while the clear is still in flight, so
    // the snapshot must stay hidden.
    await act(async () => {
      del.resolve(false);
      await Promise.resolve();
      recovery.resolve([record('a')]);
      await deletion;
    });
    expect(result.current.extractions).toEqual([]);

    await act(async () => {
      clear.resolve(true);
      await clearing;
    });

    expect(result.current.extractions).toEqual([]);
  });

  it('keeps a row gone when a clear succeeds over an overlapping same-row delete that later fails', async () => {
    const del = deferred<boolean>();
    const recovery = deferred<MemoryExtractionRecord[]>();
    const clear = deferred<boolean>();
    const port = makePort({
      deleteExtraction: vi.fn(() => del.promise),
      fetchExtractions: vi.fn(() => recovery.promise),
      clearExtractionHistory: vi.fn(() => clear.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'running' })));

    let deletion!: Promise<void>;
    let clearing!: Promise<void>;
    act(() => {
      deletion = result.current.onDeleteExtraction('a');
      // The clear starts while 'a' is optimistically hidden by the delete;
      // it still owns 'a' — the row can still be on the daemon when the
      // clear lands there.
      clearing = result.current.clearExtractions();
    });
    // A phase frame for 'a' lands while both destructive ops are pending.
    act(() => result.current.applyExtractionEvent(record('a', { phase: 'success', finishedAt: 2_000 })));

    // The clear succeeds first: every id it owned is now permanently gone.
    await act(async () => {
      clear.resolve(true);
      await clearing;
    });

    // The delete then fails; neither its buffered frame replay nor its
    // stale recovery read may resurrect 'a'.
    await act(async () => {
      del.resolve(false);
      await Promise.resolve();
      recovery.resolve([record('a', { phase: 'success', finishedAt: 2_000 })]);
      await deletion;
    });

    expect(result.current.extractions).toEqual([]);
  });
});

// ─── clear vs reload ────────────────────────────────────────────────────────

describe('useMemoryExtractions — clear vs reload', () => {
  it('does not resurrect a row when clearExtractions succeeds at the same logical time a stale reload started at', async () => {
    const clear = deferred<boolean>();
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clear.promise),
      fetchExtractions: vi.fn(() => read.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing!: Promise<void>;
    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      clearing = result.current.clearExtractions();
      reloading = result.current.reloadExtractions();
    });

    await act(async () => {
      clear.resolve(true);
      await clearing;
    });
    expect(result.current.extractions).toEqual([]);

    let returned: MemoryExtractionRecord[] = [];
    await act(async () => {
      read.resolve([record('a')]);
      returned = await reloading;
    });

    expect(returned).toEqual([]);
    expect(result.current.extractions).toEqual([]);
  });

  it('keeps cleared rows hidden when a reload\'s stale pre-clear read resolves while the clear is still in flight', async () => {
    const clear = deferred<boolean>();
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clear.promise),
      fetchExtractions: vi.fn(() => read.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('a')));

    let clearing!: Promise<void>;
    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      clearing = result.current.clearExtractions();
      reloading = result.current.reloadExtractions();
    });

    // The reload's pre-clear snapshot resolves BEFORE the DELETE settles —
    // rows the user just cleared must not flash back in the meantime.
    let returned: MemoryExtractionRecord[] = [];
    await act(async () => {
      read.resolve([record('a')]);
      returned = await reloading;
    });
    expect(returned).toEqual([]);
    expect(result.current.extractions).toEqual([]);

    await act(async () => {
      clear.resolve(true);
      await clearing;
    });
    expect(result.current.extractions).toEqual([]);
  });

  it('keeps a post-clear SSE arrival while still rejecting a stale pre-clear reload snapshot', async () => {
    const clear = deferred<boolean>();
    const read = deferred<MemoryExtractionRecord[]>();
    const port = makePort({
      clearExtractionHistory: vi.fn(() => clear.promise),
      fetchExtractions: vi.fn(() => read.promise),
    });
    const { result } = renderHook(() => useMemoryExtractions(port));
    act(() => result.current.applyExtractionEvent(record('old')));

    // The reload starts first, so its snapshot predates everything below.
    let reloading!: Promise<MemoryExtractionRecord[]>;
    act(() => {
      reloading = result.current.reloadExtractions();
    });

    // The clear starts and succeeds while the reload's read is in flight...
    let clearing!: Promise<void>;
    act(() => {
      clearing = result.current.clearExtractions();
    });
    await act(async () => {
      clear.resolve(true);
      await clearing;
    });
    // ...and a brand-new attempt arrives after the clear.
    act(() => result.current.applyExtractionEvent(record('fresh', { phase: 'running', startedAt: 5_000 })));

    // The stale read resolves last: its 'old' row stays gone, but the
    // post-clear arrival must survive the rejected snapshot.
    let returned: MemoryExtractionRecord[] = [];
    await act(async () => {
      read.resolve([record('old')]);
      returned = await reloading;
    });

    expect(returned.map((row) => row.id)).toEqual(['fresh']);
    expect(result.current.extractions.map((row) => row.id)).toEqual(['fresh']);
  });
});

// ─── derived UI state ───────────────────────────────────────────────────────

describe('useMemoryExtractions — derived UI state', () => {
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

  it('clears the nowClock interval on unmount', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    try {
      const { unmount } = renderHook(() => useMemoryExtractions(makePort()));
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
