// Direct unit tests for the pure extraction-history store: no React, no
// renderHook/act, no deferred promises — every transition is a synchronous
// function call, so a scenario is just a sequence of direct calls plus an
// assertion on the rows the store reports afterward. This is the same
// interleaving matrix `useMemoryExtractions.test.tsx` exercises through the
// hook (renderHook + a fake port + real awaits); that file remains the proof
// that the React shell wires the store correctly end-to-end, while this file
// pins the store's own ordering rules (see its header comment: rule A client
// clock, rule B content ordering, rule C permanent tombstones) in isolation,
// so a store regression fails here directly instead of only showing up as a
// harder-to-diagnose act()/timing failure at the hook level.
import { describe, expect, it, vi } from 'vitest';
import type { MemoryExtractionRecord } from '@open-design/contracts';

import {
  createExtractionHistoryStore,
  mergeSameAttempt,
  phaseProgress,
} from '../../../src/features/memory/hooks/useMemoryExtractions.store';

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

function makeStore() {
  const onRowsChanged = vi.fn();
  const store = createExtractionHistoryStore(onRowsChanged);
  return { store, onRowsChanged };
}

// ─── phaseProgress / mergeSameAttempt: rule B in isolation ──────────────────

describe('phaseProgress', () => {
  it('ranks running below every terminal phase', () => {
    expect(phaseProgress('running')).toBe(0);
    expect(phaseProgress('success')).toBe(1);
    expect(phaseProgress('failed')).toBe(1);
    expect(phaseProgress('skipped')).toBe(1);
  });
});

describe('mergeSameAttempt', () => {
  it('prefers a terminal incoming record over a running local one', () => {
    const local = record('a', { phase: 'running' });
    const incoming = record('a', { phase: 'success', finishedAt: 2_000 });
    expect(mergeSameAttempt(local, incoming)).toBe(incoming);
  });

  it('keeps a terminal local record over a running incoming one', () => {
    const local = record('a', { phase: 'success', finishedAt: 2_000 });
    const incoming = record('a', { phase: 'running' });
    expect(mergeSameAttempt(local, incoming)).toBe(local);
  });

  it('breaks a terminal-vs-terminal tie by the later finishedAt', () => {
    const local = record('a', { phase: 'success', finishedAt: 2_000 });
    const incoming = record('a', { phase: 'failed', finishedAt: 3_000 });
    expect(mergeSameAttempt(local, incoming)).toBe(incoming);
    expect(mergeSameAttempt(incoming, local)).toBe(incoming);
  });

  it('falls back to startedAt when finishedAt is equal (malformed/legacy data)', () => {
    const local = record('a', { phase: 'success', finishedAt: 2_000, startedAt: 1_000 });
    const incoming = record('a', { phase: 'failed', finishedAt: 2_000, startedAt: 1_500 });
    expect(mergeSameAttempt(local, incoming)).toBe(incoming);
  });

  it('keeps local when its startedAt is later than an equally-finished incoming record', () => {
    const local = record('a', { phase: 'success', finishedAt: 2_000, startedAt: 1_500 });
    const incoming = record('a', { phase: 'failed', finishedAt: 2_000, startedAt: 1_000 });
    expect(mergeSameAttempt(local, incoming)).toBe(local);
  });

  it('retains the local terminal value when nothing orders two disagreeing terminal payloads', () => {
    const local = record('a', { phase: 'success', finishedAt: 2_000, startedAt: 1_000 });
    const incoming = record('a', { phase: 'failed', finishedAt: 2_000, startedAt: 1_000 });
    expect(mergeSameAttempt(local, incoming)).toBe(local);
  });

  it('merges fields when both sides describe the same equivalent record', () => {
    const local = record('a', { phase: 'success', finishedAt: 2_000, writtenCount: undefined });
    const incoming = record('a', { phase: 'success', finishedAt: 2_000, writtenCount: 3 });
    expect(mergeSameAttempt(local, incoming)).toEqual({ ...local, ...incoming });
  });
});

// ─── applyFrame: SSE merge/insert/clear/delete semantics ────────────────────

describe('store.applyFrame — merge semantics', () => {
  it('merges a phase transition onto the same id instead of stacking', () => {
    const { store } = makeStore();
    store.applyFrame(record('x', { phase: 'running' }));
    store.applyFrame(record('x', { phase: 'success' }));

    expect(store.rows()).toHaveLength(1);
    expect(store.rows()[0]?.phase).toBe('success');
  });

  it('unshifts new ids so the newest is first', () => {
    const { store } = makeStore();
    store.applyFrame(record('old'));
    store.applyFrame(record('new'));

    expect(store.rows().map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('does not regress a terminal row when a delayed running frame for the same id arrives late', () => {
    const { store } = makeStore();
    store.applyFrame(record('x', { phase: 'success', finishedAt: 2_000 }));
    store.applyFrame(record('x', { phase: 'running' }));

    expect(store.rows()[0]?.phase).toBe('success');
  });

  it('cleared wipes the list; deleted drops the one id', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.applyFrame(record('b'));

    store.applyFrame(record('a', { phase: 'deleted' }));
    expect(store.rows().map((r) => r.id)).toEqual(['b']);

    store.applyFrame(record('b', { phase: 'cleared' }));
    expect(store.rows()).toEqual([]);
  });

  it('permanently ignores frames for an id a "deleted" frame already removed (rule C)', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    store.applyFrame(record('a', { phase: 'deleted' }));
    store.applyFrame(record('a', { phase: 'success', finishedAt: 2_000 }));

    expect(store.rows()).toEqual([]);
  });

  it('caps live-inserted history at 30 rows', () => {
    const { store } = makeStore();
    for (let i = 0; i < 31; i += 1) store.applyFrame(record(`row-${i}`));

    expect(store.rows()).toHaveLength(30);
    expect(store.rows()[0]?.id).toBe('row-30');
  });

  it('ignores a frame with no id', () => {
    const { store } = makeStore();
    store.applyFrame({ id: '' } as never);
    expect(store.rows()).toEqual([]);
  });

  it('notifies the onRowsChanged callback on every commit', () => {
    const { store, onRowsChanged } = makeStore();
    store.applyFrame(record('a'));
    expect(onRowsChanged).toHaveBeenCalledTimes(1);
    expect(onRowsChanged).toHaveBeenLastCalledWith(store.rows());
  });
});

// ─── delete lifecycle ────────────────────────────────────────────────────────

describe('store.beginDelete / settleDeleteSuccess / settleDeleteFailure', () => {
  it('hides the row immediately on beginDelete', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.applyFrame(record('b'));

    store.beginDelete('a');
    expect(store.rows().map((r) => r.id)).toEqual(['b']);
  });

  it('settleDeleteSuccess tombstones the id permanently', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.beginDelete('a');
    store.settleDeleteSuccess('a');
    store.applyFrame(record('a', { phase: 'running' }));

    expect(store.rows()).toEqual([]);
  });

  it('keeps an overlapping delete pending until every success handler settles', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.beginDelete('a');
    store.beginDelete('a');

    // The first success must not unmark the second in-flight delete. A
    // delayed frame remains hidden either way because confirmed success
    // tombstones the id immediately.
    store.settleDeleteSuccess('a');
    store.applyFrame(record('a', { phase: 'running' }));
    expect(store.rows()).toEqual([]);

    store.settleDeleteSuccess('a');
    expect(store.rows()).toEqual([]);
  });

  it('buffers a phase frame for a pending delete instead of showing it', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    store.beginDelete('a');
    store.applyFrame(record('a', { phase: 'success', finishedAt: 2_000 }));

    expect(store.rows()).toEqual([]);
  });

  it('merges a SECOND buffered frame for the same pending-delete id, content-ordered, not stacked', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    store.beginDelete('a');
    // Two frames buffer while the delete is pending — the second must merge
    // onto the first (rule B) rather than replacing it outright, so a
    // lower-progress frame arriving second can't regress the buffered value.
    store.applyFrame(record('a', { phase: 'success', finishedAt: 2_000 }));
    store.applyFrame(record('a', { phase: 'running' }));

    store.settleDeleteFailure('a');
    expect(store.rows().find((r) => r.id === 'a')?.phase).toBe('success');
  });

  it('settleDeleteFailure replays the best buffered frame', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    store.beginDelete('a');
    store.applyFrame(record('a', { phase: 'success', finishedAt: 2_000 }));

    store.settleDeleteFailure('a');
    expect(store.rows().find((r) => r.id === 'a')?.phase).toBe('success');
  });

  it('settleDeleteFailure with no buffered frame leaves the row absent (recovery read owns restoring it)', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.beginDelete('a');
    store.settleDeleteFailure('a');

    expect(store.rows()).toEqual([]);
  });

  it('refcounts overlapping same-id deletes: only the LAST settle actually unmarks pending', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    store.beginDelete('a');
    store.beginDelete('a'); // second overlapping delete, same id

    // First settle (failure) must NOT replay/unhide — the second is still pending.
    store.applyFrame(record('a', { phase: 'success', finishedAt: 2_000 }));
    store.settleDeleteFailure('a');
    expect(store.rows()).toEqual([]);

    // Second settle (also failure) is the last one: now it replays.
    store.settleDeleteFailure('a');
    expect(store.rows().find((r) => r.id === 'a')?.phase).toBe('success');
  });

  it('never lets a concurrent commitSnapshot resurrect an id while its delete is still pending', () => {
    // A concurrent mutation's own recovery reconciliation (e.g. a separately
    // failed clearExtractions()) can run between this delete's optimistic
    // removal and its success callback. beginDelete has already removed 'a'
    // from the visible rows and commitSnapshot excludes it from the accepted
    // snapshot, so that recovery can never put 'a' back — the store invariant
    // closes this rather than settleDeleteSuccess re-detecting it afterward.
    const { store } = makeStore();
    store.applyFrame(record('a'));
    const token = store.beginDelete('a');
    store.commitSnapshot([record('a')], token.startClock - 1);
    expect(store.rows().map((r) => r.id)).not.toContain('a');

    store.settleDeleteSuccess('a');
    expect(store.rows()).toEqual([]);
  });
});

// ─── clear lifecycle ─────────────────────────────────────────────────────────

describe('store.beginClear / settleClearSuccess / settleClearFailure', () => {
  it('wipes the list immediately on beginClear', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.beginClear();

    expect(store.rows()).toEqual([]);
  });

  it('settleClearSuccess tombstones every id owned by the clear', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    const token = store.beginClear();
    store.settleClearSuccess(token);
    store.applyFrame(record('a', { phase: 'running' }));

    expect(store.rows()).toEqual([]);
  });

  it('settleClearSuccess tombstones ids first observed while the clear was in flight', () => {
    const { store } = makeStore();
    const token = store.beginClear();
    // 'ghost' was never displayed; its first frame lands mid-clear.
    store.applyFrame(record('ghost', { phase: 'running' }));
    store.settleClearSuccess(token);
    store.applyFrame(record('ghost', { phase: 'success', finishedAt: 2_000 }));

    expect(store.rows()).toEqual([]);
  });

  it('settleClearFailure replays buffered frames', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    store.beginClear();
    store.applyFrame(record('a', { phase: 'success' }));

    store.settleClearFailure();
    expect(store.rows().map((r) => `${r.id}:${r.phase}`)).toEqual(['a:success']);
  });

  it('refcounts overlapping clears: only the last settle replays/tombstones', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    store.beginClear();
    store.beginClear(); // second overlapping clear

    store.applyFrame(record('a', { phase: 'success' }));
    store.settleClearFailure(); // first settle: still one clear pending
    expect(store.rows()).toEqual([]);

    store.settleClearFailure(); // last settle: now it replays
    expect(store.rows().map((r) => `${r.id}:${r.phase}`)).toEqual(['a:success']);
  });

  it('does not replay a frame still owned by a separately pending delete', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    store.beginDelete('a');
    store.beginClear();
    store.applyFrame(record('a', { phase: 'success', finishedAt: 2_000 }));

    // The clear fails; 'a' stays buffered because its own delete is still pending.
    store.settleClearFailure();
    expect(store.rows()).toEqual([]);

    // The delete then fails too: now it replays.
    store.settleDeleteFailure('a');
    expect(store.rows().find((r) => r.id === 'a')?.phase).toBe('success');
  });
});

// ─── commitSnapshot: rule A + rule C reconciliation ─────────────────────────

describe('store.commitSnapshot', () => {
  it('accepts a plain snapshot when nothing local has changed', () => {
    const { store } = makeStore();
    const rows = [record('a'), record('b')];
    const committed = store.commitSnapshot(rows, store.snapshotClock());

    expect(committed).toEqual(rows);
    expect(store.rows()).toEqual(rows);
  });

  it('never resurrects a row as a SURVIVOR while its delete is still pending, even if the snapshot also lacks it', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.applyFrame(record('b'));
    const sinceClock = store.snapshotClock();
    store.beginDelete('a');

    // 'a' is absent from the confirmed snapshot too — without the pending-
    // delete filter, it could slip back in as a "live survivor" via the
    // rowStamp branch below, undoing the optimistic delete.
    store.commitSnapshot([record('b')], sinceClock);
    expect(store.rows().map((r) => r.id)).toEqual(['b']);
  });

  it('drops a row the snapshot no longer has, when nothing local advanced it after the read began', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.applyFrame(record('b'));
    const sinceClock = store.snapshotClock();

    store.commitSnapshot([record('b')], sinceClock);
    expect(store.rows().map((r) => r.id)).toEqual(['b']);
  });

  it('keeps a row the snapshot omits when a local change accepted it after the read began', () => {
    const { store } = makeStore();
    const sinceClock = store.snapshotClock();
    store.applyFrame(record('a')); // lands AFTER sinceClock

    store.commitSnapshot([], sinceClock);
    expect(store.rows().map((r) => r.id)).toEqual(['a']);
  });

  it('excludes a pending-delete id from the accepted snapshot rows', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    const token = store.beginDelete('a');

    store.commitSnapshot([record('a')], token.startClock);
    expect(store.rows()).toEqual([]);
  });

  it('excludes a tombstoned id from the accepted snapshot rows (rule C)', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    const token = store.beginDelete('a');
    store.settleDeleteSuccess('a');

    store.commitSnapshot([record('a')], token.startClock);
    expect(store.rows()).toEqual([]);
  });

  it('rejects the whole snapshot when an authoritative clear postdates it', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    const sinceClock = store.snapshotClock();
    const token = store.beginClear();
    store.settleClearSuccess(token);

    store.commitSnapshot([record('a')], sinceClock);
    expect(store.rows()).toEqual([]);
  });

  it('rejects the whole snapshot while a clear is still in flight', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    const sinceClock = store.snapshotClock();
    store.beginClear(); // not yet settled

    store.commitSnapshot([record('a')], sinceClock);
    expect(store.rows()).toEqual([]);
  });

  it('keeps a newer local phase transition over a stale snapshot for the same id (rule B)', () => {
    const { store } = makeStore();
    store.applyFrame(record('a', { phase: 'running' }));
    const sinceClock = store.snapshotClock();
    store.applyFrame(record('a', { phase: 'success' }));

    store.commitSnapshot([record('a', { phase: 'running' })], sinceClock);
    expect(store.rows().find((r) => r.id === 'a')?.phase).toBe('success');
  });

  it('accepts a more-progressed snapshot over a stale local running row (rule B)', () => {
    const { store } = makeStore();
    const sinceClock = store.snapshotClock();
    store.applyFrame(record('a', { phase: 'running' }));

    store.commitSnapshot([record('a', { phase: 'success', finishedAt: 2_000 })], sinceClock);
    expect(store.rows().find((r) => r.id === 'a')?.phase).toBe('success');
  });

  it('slots a restored row in by startedAt, not blindly ahead of a newer live-only row', () => {
    const { store } = makeStore();
    store.applyFrame(record('old', { startedAt: 1_000 }));
    const sinceClock = store.snapshotClock();
    store.applyFrame(record('newer', { phase: 'running', startedAt: 3_000 }));

    store.commitSnapshot([record('old', { startedAt: 1_000 })], sinceClock);
    expect(store.rows().map((r) => r.id)).toEqual(['newer', 'old']);
  });

  it('slots a newer confirmed row ahead of a live survivor', () => {
    const { store } = makeStore();
    const sinceClock = store.snapshotClock();
    store.applyFrame(record('live', { startedAt: 2_000 }));

    store.commitSnapshot([record('newer', { startedAt: 3_000 })], sinceClock);
    expect(store.rows().map((r) => r.id)).toEqual(['newer', 'live']);
  });

  it('returns exactly what committed, not the raw input snapshot', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    const token = store.beginDelete('a');

    const committed = store.commitSnapshot([record('a'), record('b')], token.startClock);
    expect(committed.map((r) => r.id)).toEqual(['b']);
  });
});

// ─── restoreIfUnchanged: last-resort rollback ───────────────────────────────

describe('store.restoreIfUnchanged', () => {
  it('restores the pre-mutation rows when nothing else has changed since', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.applyFrame(record('b'));
    const token = store.beginDelete('a');

    store.restoreIfUnchanged(token);
    expect(store.rows().map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('does not restore when a newer commit landed after the mutation started', () => {
    const { store } = makeStore();
    store.applyFrame(record('a'));
    store.applyFrame(record('b'));
    const token = store.beginDelete('a');
    // A live event lands after the optimistic removal, advancing the clock.
    store.applyFrame(record('newer', { phase: 'running' }));

    store.restoreIfUnchanged(token);
    expect(store.rows().map((r) => r.id)).toEqual(['newer', 'b']);
  });
});
