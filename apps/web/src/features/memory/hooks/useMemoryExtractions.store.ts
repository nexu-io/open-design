// Pure state machine backing useMemoryExtractions.hooks.ts. No React, no
// transport — every transition is a synchronous function call, so the
// ordering rules below hold by construction and are directly unit-testable
// without renderHook/act/deferred promises (see useMemoryExtractions.store.test.ts).
// Owned by exactly one hook (unlike rules.ts/formatters.ts, which are shared
// across the memory slice's hooks), hence colocated here rather than at the
// slice root.
//
// ─── The concurrency model ──────────────────────────────────────────────────
//
// The hook receives facts about one server-side resource (the extraction ring
// buffer) from three concurrent sources:
//
//   1. Live SSE frames pushed by the daemon (phase transitions, plus the
//      pseudo-phases 'deleted'/'cleared' when rows are evicted).
//   2. GET snapshots this client pulled (manual reloads, and the recovery
//      reads a failed delete/clear issues to restore server truth).
//   3. This client's own optimistic mutations (delete/clear start + settle).
//
// Earlier revisions of the hook grew one ad hoc ref per discovered race. This
// store replaces them with three ordering rules, each matched to what
// actually CAN be ordered:
//
//   A. CLIENT-ORDERED facts share one logical clock. Everything this client
//      did itself — optimistic writes, the start of each GET — is genuinely
//      sequenced by the client, so every committed change advances one
//      monotonic clock and every GET captures the clock at its start
//      (`sinceClock`). A snapshot is then exactly "the server's answer as of
//      no later than sinceClock", and reconciliation keeps whichever side is
//      younger. Overlapping reloads are ordered the same way via the slice's
//      shared AsyncCommitGuard (in the hook): only the latest-STARTED reload
//      may commit, because two reloads are two independent server reads and
//      resolution order says nothing about freshness.
//
//   B. SERVER-CONTENT-ORDERED facts are compared by content, never by
//      arrival. A GET row and an SSE frame for the SAME id are both
//      server-originated, racing over two independent channels, so
//      client-side reception order tells you nothing about server-side event
//      order. They are ordered by the row's own progression instead: a phase
//      only ever moves running → exactly one terminal result, so a terminal
//      phase outranks 'running' regardless of which channel landed last, and
//      `finishedAt` breaks the (should-not-happen) tie between two terminal
//      payloads.
//
//   C. CONFIRMED REMOVALS ARE PERMANENT. Attempt ids are UUIDs and are never
//      reused (per the contracts doc comment), so once a removal is
//      confirmed — an SSE 'deleted'/'cleared' frame, or a local delete/clear
//      the server acknowledged — the id is tombstoned forever. No revision
//      comparison is needed: ANY payload that still contains a tombstoned id
//      is by definition stale for that id. This kills the whole family of
//      "stale read resurrects a removed row" races by construction,
//      including the equality-boundary case where a read and a removal
//      captured the same revision.
//
// In-flight destructive operations get one uniform treatment: their targets
// are hidden (refcounted, since two same-id deletes — or a clear racing a
// delete — must each keep the id pending until ALL settle), and incoming
// frames for hidden ids are buffered, content-merged, replayed if the
// operation fails, and tombstoned if it succeeds. A pending CLEAR hides
// everything: any frame first observed while a clear is in flight may have
// been emitted before the daemon performed the clear, so the clear owns it —
// on success those ids are tombstoned too, on failure the buffered frames
// are replayed.
//
// Store invariant (maintained by every transition, relied on by all of
// them): `rows` never contains a tombstoned id, never contains an id with a
// pending delete, and after an authoritative clear contains only rows
// accepted after that clear.
import type {
  MemoryExtractionEvent,
  MemoryExtractionRecord,
} from '@open-design/contracts';

/** Row cap mirrored from the daemon's ring buffer for live-inserted rows. */
const MAX_ROWS = 30;

export function phaseProgress(phase: MemoryExtractionRecord['phase']): number {
  // A record only moves from running to one terminal result. The terminal
  // results have no ordering among themselves, but all are more
  // authoritative than running regardless of which transport reached the
  // browser last.
  return phase === 'running' ? 0 : 1;
}

/**
 * Ordering rule B: resolve two versions of the same persisted attempt without
 * using browser reception order. Terminal phase progression is authoritative;
 * when both sides are terminal, the completion timestamp breaks a real tie.
 * Equivalent records are merged so a confirmed read can fill fields an
 * earlier stream frame did not yet contain without erasing fields it omitted.
 */
export function mergeSameAttempt(
  local: MemoryExtractionRecord,
  incoming: MemoryExtractionRecord,
): MemoryExtractionRecord {
  const localProgress = phaseProgress(local.phase);
  const incomingProgress = phaseProgress(incoming.phase);
  if (incomingProgress > localProgress) return incoming;
  if (incomingProgress < localProgress) return local;

  const localFinishedAt = local.finishedAt ?? Number.NEGATIVE_INFINITY;
  const incomingFinishedAt = incoming.finishedAt ?? Number.NEGATIVE_INFINITY;
  if (incomingFinishedAt > localFinishedAt) return incoming;
  if (incomingFinishedAt < localFinishedAt) return local;

  // `id` identifies one attempt, so `startedAt` should normally be equal.
  // Still, prefer the later source if malformed/legacy data disagrees.
  if (incoming.startedAt > local.startedAt) return incoming;
  if (incoming.startedAt < local.startedAt) return local;
  // A real attempt never changes from one terminal result to another. If
  // legacy/malformed payloads disagree without a timestamp that orders them,
  // retain the existing value rather than making reception order decide.
  if (incoming.phase !== local.phase) return local;
  return { ...local, ...incoming };
}

/**
 * Handed back by `beginDelete`/`beginClear`; carries exactly the facts the
 * settle path needs and that only the START of the operation can know.
 */
export interface DeleteOpToken {
  /** Rows as they were the instant before the optimistic removal. */
  previousRows: MemoryExtractionRecord[];
  /**
   * Logical time of the optimistic write. The failure path's recovery GET
   * reconciles against it; the recovery-also-failed path restores
   * `previousRows` only if nothing advanced the clock past it.
   */
  startClock: number;
}

export interface ClearOpToken extends DeleteOpToken {
  /**
   * Every id this clear owns: rows visible when it started plus ids an
   * overlapping delete had already optimistically hidden (those can still be
   * present on the daemon when the clear lands, so the clear covers them
   * too). Tombstoned wholesale if the clear succeeds.
   */
  ownedIds: Set<string>;
}

/**
 * The single source of truth for extraction-history state. Pure TypeScript —
 * no React, no transport — so every transition is synchronous and the
 * ordering rules in the module doc comment hold by construction rather than
 * by per-callsite bookkeeping. The hook is a thin shell that pairs store
 * transitions with port I/O and mirrors `rows` into React state.
 */
export interface ExtractionHistoryStore {
  rows(): MemoryExtractionRecord[];
  /** Capture the logical clock before starting a GET (rule A). */
  snapshotClock(): number;
  /**
   * Reconcile a resolved GET against everything that happened since it
   * started. Returns the rows that actually committed — which can differ
   * from the raw response — so callers can hand them straight to consumers
   * (useMemoryConnectors reads reloadExtractions()'s return directly).
   */
  commitSnapshot(
    confirmed: MemoryExtractionRecord[],
    sinceClock: number,
  ): MemoryExtractionRecord[];
  /** Apply one live SSE frame (merge/insert/defer/clear/delete). */
  applyFrame(ev: MemoryExtractionEvent): void;
  beginDelete(id: string): DeleteOpToken;
  settleDeleteSuccess(id: string): void;
  settleDeleteFailure(id: string): void;
  beginClear(): ClearOpToken;
  settleClearSuccess(token: ClearOpToken): void;
  settleClearFailure(): void;
  /**
   * Last-resort rollback for "mutation failed AND its recovery GET failed":
   * restore the pre-mutation rows, but only if nothing at all advanced the
   * clock while the operation was in flight — anything newer (an SSE frame,
   * another mutation, a committed snapshot) outranks the stale snapshot.
   */
  restoreIfUnchanged(token: DeleteOpToken): void;
}

export function createExtractionHistoryStore(
  onRowsChanged: (rows: MemoryExtractionRecord[]) => void,
): ExtractionHistoryStore {
  let rows: MemoryExtractionRecord[] = [];
  /** Rule A: the one logical clock ordering everything this client did. */
  let clock = 0;
  /** Logical time each visible row was last accepted (rule A per row). */
  const rowStamp = new Map<string, number>();
  /** Rule C: ids whose removal the server has confirmed. Never removed. */
  const tombstones = new Set<string>();
  /** Logical time the last authoritative clear landed (0 = never). */
  let clearStamp = 0;
  /** Refcounted in-flight deletes per id (two same-id deletes may overlap). */
  const pendingDeletes = new Map<string, number>();
  /** Refcounted in-flight clears (overlapping clears may overlap too). */
  let pendingClears = 0;
  /** Frames buffered while their id is hidden by a pending delete/clear. */
  const deferred = new Map<string, MemoryExtractionEvent>();

  function commit(next: MemoryExtractionRecord[]): number {
    clock += 1;
    rows = next;
    onRowsChanged(rows);
    return clock;
  }

  function markPendingDelete(id: string): void {
    pendingDeletes.set(id, (pendingDeletes.get(id) ?? 0) + 1);
  }

  /** Returns true when this was the LAST in-flight delete for the id. Every
   *  call site pairs this with a prior `markPendingDelete(id)` (beginDelete
   *  always precedes the settle path that calls this), so `pendingDeletes`
   *  is guaranteed to already hold `id` here — the `?? 1` is a defensive
   *  invariant guard against that pairing breaking, not a reachable case. */
  function unmarkPendingDelete(id: string): boolean {
    const count = (pendingDeletes.get(id) ?? 1) - 1;
    if (count <= 0) {
      pendingDeletes.delete(id);
      return true;
    }
    pendingDeletes.set(id, count);
    return false;
  }

  function tombstone(id: string): void {
    tombstones.add(id);
  }

  function applyFrame(ev: MemoryExtractionEvent): void {
    if (!ev || !ev.id) return;
    // Pseudo-phases: the daemon emits these synthetically when a row is
    // dropped from the buffer, by the per-row delete button or the "Clear"
    // affordance at the top (possibly in another client).
    if (ev.phase === 'cleared') {
      // A remote clear removed every attempt the daemon knew about, which
      // covers everything this client has observed: visible rows, ids hidden
      // by a pending local delete, and buffered frames. Tombstone them all
      // (rule C) so delayed frames cannot recreate discarded attempts.
      const owned = new Set([
        ...rows.map((row) => row.id),
        ...pendingDeletes.keys(),
        ...deferred.keys(),
      ]);
      for (const id of owned) tombstone(id);
      deferred.clear();
      clearStamp = commit([]);
      return;
    }
    if (ev.phase === 'deleted') {
      deferred.delete(ev.id);
      tombstone(ev.id);
      commit(rows.filter((row) => row.id !== ev.id));
      return;
    }
    // Rule C: a confirmed-removed id never comes back. A delayed frame on
    // the SSE connection may have been emitted before the DELETE response
    // won the fetch race.
    if (tombstones.has(ev.id)) return;
    // A running extraction is user-deletable and the list-level clear is
    // available while it runs, so frames can race an in-flight destructive
    // operation for their id. Buffer them (content-merged, rule B) so they
    // cannot visibly undo the optimistic removal; the settle path replays
    // the best buffered frame on failure and tombstones it on success.
    if (pendingDeletes.has(ev.id) || pendingClears > 0) {
      const prior = deferred.get(ev.id);
      deferred.set(ev.id, prior ? mergeSameAttempt(prior, ev) : ev);
      return;
    }
    // Merge by id (rule B): phase transitions for an in-flight attempt
    // collapse onto a single row instead of stacking N entries. New ids are
    // unshifted so the latest appears at the top.
    const at = rows.findIndex((row) => row.id === ev.id);
    let next: MemoryExtractionRecord[];
    if (at >= 0) {
      next = rows.slice();
      next[at] = mergeSameAttempt(next[at]!, ev);
    } else {
      next = [ev, ...rows].slice(0, MAX_ROWS);
    }
    rowStamp.set(ev.id, commit(next));
  }

  function commitSnapshot(
    confirmed: MemoryExtractionRecord[],
    sinceClock: number,
  ): MemoryExtractionRecord[] {
    // An authoritative clear younger than this read supersedes the whole
    // snapshot — every row in it is pre-clear as far as the client can
    // order, so nothing from it may come back. A clear still IN FLIGHT
    // rejects the snapshot the same way: if that clear fails, its own
    // recovery GET (which starts after the failure) restores server truth.
    const clearSupersedes = clearStamp > sinceClock || pendingClears > 0;
    const accepted = clearSupersedes
      ? []
      : confirmed.filter(
          (row) => !tombstones.has(row.id) && !pendingDeletes.has(row.id),
        );
    const acceptedById = new Map(accepted.map((row) => [row.id, row] as const));
    // Live rows keep their newest-first positions, content-merged with the
    // snapshot's version of the same id (rule B). A row the snapshot no
    // longer has (evicted server-side, or removed by another client) is
    // dropped, UNLESS a local change accepted it after this read began
    // (rule A) — then the read simply hasn't caught up and the local copy
    // survives. The store invariant does the rest: no tombstoned id can be
    // sitting in `rows`, and every row here postdates any authoritative
    // clear — so a clear-superseded snapshot rejects only the SNAPSHOT's
    // rows, while current rows (all stamped after the clear, hence after
    // sinceClock) survive on the rowStamp rule without a special case.
    const survivors = rows
      .filter((row) => {
        if (pendingDeletes.has(row.id)) return false;
        if (acceptedById.has(row.id)) return true;
        // Every row that ever enters `rows` is stamped at insertion, by
        // either applyFrame or this function's own accepted-rows loop below
        // — `?? 0` is a defensive invariant guard for that, not a reachable
        // "never stamped" case.
        return (rowStamp.get(row.id) ?? 0) > sinceClock;
      })
      .map((row) => {
        const confirmedRow = acceptedById.get(row.id);
        return confirmedRow ? mergeSameAttempt(row, confirmedRow) : row;
      });
    const survivorIds = new Set(survivors.map((row) => row.id));
    const merged = [...survivors];
    for (const row of accepted) {
      if (survivorIds.has(row.id)) continue;
      // Slot restored/new rows in by start time so a newer live-only row is
      // never pushed behind an older confirmed one.
      const at = merged.findIndex((existing) => existing.startedAt < row.startedAt);
      if (at === -1) merged.push(row);
      else merged.splice(at, 0, row);
    }
    const revision = commit(merged);
    for (const row of accepted) rowStamp.set(row.id, revision);
    return rows;
  }

  return {
    rows: () => rows,
    snapshotClock: () => clock,
    commitSnapshot,
    applyFrame,
    beginDelete(id) {
      const previousRows = rows;
      markPendingDelete(id);
      const startClock = commit(rows.filter((row) => row.id !== id));
      return { previousRows, startClock };
    },
    settleDeleteSuccess(id) {
      if (unmarkPendingDelete(id)) deferred.delete(id);
      tombstone(id);
      // Re-filter against `rows` here too (belt-and-suspenders): the
      // pending-delete checks in commitSnapshot/applyFrame already keep `id`
      // out of `rows` for the whole time this delete is in flight, so this is
      // never actually removing anything new. It still matters as a real
      // commit, though — a confirmed removal is genuine new information, and
      // advancing the clock here is what makes a SIBLING operation's
      // restoreIfUnchanged (checked against ITS OWN startClock) correctly
      // treat this confirmation as something that happened since it started,
      // rather than silently letting a stale previousRows restore win.
      commit(rows.filter((row) => row.id !== id));
    },
    settleDeleteFailure(id) {
      if (!unmarkPendingDelete(id)) return;
      const buffered = deferred.get(id);
      deferred.delete(id);
      // Replay routes back through applyFrame so a still-pending CLEAR
      // re-defers it rather than letting it slip past the hide.
      if (buffered) applyFrame(buffered);
    },
    beginClear() {
      const previousRows = rows;
      const ownedIds = new Set([
        ...rows.map((row) => row.id),
        ...pendingDeletes.keys(),
      ]);
      pendingClears += 1;
      const startClock = commit([]);
      return { previousRows, startClock, ownedIds };
    },
    settleClearSuccess(token) {
      pendingClears = Math.max(0, pendingClears - 1);
      // The clear owns every id observed before its success: the rows and
      // pending deletes it saw when it started, plus every frame first
      // observed while it was in flight (those may have been emitted before
      // the daemon performed the clear but arrived late over SSE).
      for (const id of token.ownedIds) tombstone(id);
      for (const id of deferred.keys()) tombstone(id);
      deferred.clear();
      // Re-assert the wipe (see settleDeleteSuccess for why) and stamp it as
      // the authoritative clear point for in-flight reads.
      clearStamp = commit([]);
    },
    settleClearFailure() {
      pendingClears = Math.max(0, pendingClears - 1);
      if (pendingClears > 0) return;
      for (const [id, buffered] of [...deferred]) {
        // Frames owned by a still-pending DELETE stay buffered — that
        // delete's own settle path decides their fate.
        if (pendingDeletes.has(id)) continue;
        deferred.delete(id);
        applyFrame(buffered);
      }
    },
    restoreIfUnchanged(token) {
      if (clock !== token.startClock) return;
      commit(token.previousRows);
    },
  };
}
