// Feature-local hook for the extraction history: the one-shot list fetch, the
// live SSE merge, the relative-time clock, and delete/clear. Transport is the
// injected port; the SSE EventSource itself lives in providers/memory/events.ts
// (transport can't sit in a feature file), so the orchestrator opens the stream
// and feeds each `extraction` frame to `applyExtractionEvent` here.
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import type {
  MemoryExtractionEvent,
  MemoryExtractionRecord,
} from '@open-design/contracts';
import { memoryExtractionsPort } from '../dependencies';
import type { MemoryExtractionsPort } from '../ports';

function phaseProgress(phase: MemoryExtractionRecord['phase']): number {
  // A record only moves from running to one terminal result.  The terminal
  // results do not have an ordering among themselves, but all are more
  // authoritative than running regardless of which transport reached the
  // browser last.
  return phase === 'running' ? 0 : 1;
}

/**
 * Resolve two versions of the same persisted attempt without using browser
 * reception order. Terminal phase progression is authoritative; when both
 * sides are terminal, the completion timestamp breaks a real tie. Equivalent
 * records are merged so a confirmed read can fill fields an earlier stream
 * frame did not yet contain without erasing fields it omitted.
 */
function reconcileExtractionRecord(
  local: MemoryExtractionRecord,
  confirmed: MemoryExtractionRecord,
): MemoryExtractionRecord {
  const localProgress = phaseProgress(local.phase);
  const confirmedProgress = phaseProgress(confirmed.phase);
  if (confirmedProgress > localProgress) return confirmed;
  if (confirmedProgress < localProgress) return local;

  const localFinishedAt = local.finishedAt ?? Number.NEGATIVE_INFINITY;
  const confirmedFinishedAt = confirmed.finishedAt ?? Number.NEGATIVE_INFINITY;
  if (confirmedFinishedAt > localFinishedAt) return confirmed;
  if (confirmedFinishedAt < localFinishedAt) return local;

  // `id` identifies one attempt, so `startedAt` should normally be equal.
  // Still, prefer the later source if malformed/legacy data disagrees.
  if (confirmed.startedAt > local.startedAt) return confirmed;
  if (confirmed.startedAt < local.startedAt) return local;
  // A real attempt never changes from one terminal result to another. If
  // legacy/malformed payloads disagree without a timestamp that orders them,
  // retain the existing value rather than making reception order decide.
  if (confirmed.phase !== local.phase) return local;
  return { ...local, ...confirmed };
}

export interface MemoryExtractionsController {
  /** Non-null when the extraction-history read failed. */
  loadError?: string | null;
  extractions: MemoryExtractionRecord[];
  isRefreshing: boolean;
  /** Wall clock refreshed every 30s so relative ages don't freeze. */
  nowClock: number;
  showNoProviderBanner: boolean;
  connectorExtractions: MemoryExtractionRecord[];
  reloadExtractions: () => Promise<MemoryExtractionRecord[]>;
  /** Apply one live `extraction` SSE frame (merge/insert/clear/delete). */
  applyExtractionEvent: (event: MemoryExtractionEvent) => void;
  onDeleteExtraction: (id: string) => Promise<void>;
  /** Clear all history (no confirm — the orchestrator owns the prompt). */
  clearExtractions: () => Promise<void>;
}

export function useMemoryExtractions(
  port: MemoryExtractionsPort,
): MemoryExtractionsController {
  // Recent extraction attempts, newest first. Driven by a one-shot fetch on
  // mount + live SSE updates merged by id so phase transitions
  // (running → success) replace the row in place.
  const [extractions, setExtractions] = useState<MemoryExtractionRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Every local optimistic change and every live frame advances this revision.
  // A failed mutation may restore its pre-mutation snapshot only if nothing
  // newer has changed the history while its request/recovery fetch was pending.
  const extractionRevision = useRef(0);
  // Refcounted rather than a Set: two overlapping onDeleteExtraction() calls
  // for the SAME id must both keep it marked pending until BOTH settle — a
  // Set's single membership means the first call to settle would delete the
  // key out from under the second, still-in-flight call.
  const pendingDeletionCounts = useRef(new Map<string, number>());
  // A running extraction is user-deletable. Buffer phase frames for an id
  // while its delete is pending so they cannot visibly undo the optimistic
  // removal, but replay the best one if that delete ultimately fails.
  const deferredDeletionEvents = useRef(new Map<string, MemoryExtractionEvent>());
  const markPendingDeletion = useCallback((id: string) => {
    pendingDeletionCounts.current.set(id, (pendingDeletionCounts.current.get(id) ?? 0) + 1);
  }, []);
  const unmarkPendingDeletion = useCallback((id: string) => {
    const count = (pendingDeletionCounts.current.get(id) ?? 1) - 1;
    if (count <= 0) pendingDeletionCounts.current.delete(id);
    else pendingDeletionCounts.current.set(id, count);
  }, []);
  // Ordering for reloadExtractions(): only the latest-started call's response
  // may commit (see reloadExtractions below); isRefreshing tracks how many
  // reloads are currently in flight so one completing doesn't clear it while
  // another is still pending.
  const reloadGenerationRef = useRef(0);
  const inFlightReloadsRef = useRef(0);
  // A confirmed-history fetch answers "what did the server have", but it can
  // resolve after NEWER local changes: a destructive SSE event (a remote
  // 'cleared' or 'deleted' frame) that removed rows, or an ordinary phase
  // transition that advanced one. Reconciling that stale snapshot naively
  // would resurrect removed rows or regress advanced ones, so every change
  // stamps the revision it landed at — destructive events per removal, and
  // every row-content change per row — and reconciliation keeps whichever
  // side is younger than the recovery read.
  const clearedAtRevisionRef = useRef(0);
  const deletedAtRevisionRef = useRef(new Map<string, number>());
  const rowRevisionRef = useRef(new Map<string, number>());
  // Mirrors `extractions` synchronously. setExtractions() only ever runs
  // through updateExtractions() below, so this ref and the state it drives
  // are always resolved together — callers that need the array a mutation
  // actually committed (not just a revision number) can read it immediately,
  // without waiting on React's next render.
  const extractionsRef = useRef<MemoryExtractionRecord[]>([]);
  const updateExtractions = useCallback((next: SetStateAction<MemoryExtractionRecord[]>) => {
    extractionRevision.current += 1;
    const resolved = typeof next === 'function' ? next(extractionsRef.current) : next;
    extractionsRef.current = resolved;
    setExtractions(resolved);
    return extractionRevision.current;
  }, []);
  const reconcileConfirmedExtractions = useCallback(
    (confirmed: MemoryExtractionRecord[], sinceRevision: number): MemoryExtractionRecord[] => {
      const pending = new Set(pendingDeletionCounts.current.keys());
      const confirmedIds = new Set(confirmed.map((row) => row.id));
      // A clear that landed after this recovery began supersedes the whole
      // confirmed snapshot — nothing from it should come back.
      const accepted =
        clearedAtRevisionRef.current > sinceRevision
          ? []
          : confirmed.filter((row) => {
              if (pending.has(row.id)) return false;
              const deletedAt = deletedAtRevisionRef.current.get(row.id);
              if (deletedAt !== undefined && deletedAt > sinceRevision) return false;
              return true;
            });
      const acceptedById = new Map(accepted.map((row) => [row.id, row] as const));
      const revision = updateExtractions((current) => {
        // Live rows keep their newest-first positions (taking the confirmed
        // content where the snapshot is still authoritative for that id, and
        // never resurrecting a row another optimistic delete still owns).
        // A row the confirmed read no longer has (evicted server-side, or
        // removed by another client) is dropped too, UNLESS a local change
        // advanced it after this read began — then the read simply hasn't
        // caught up yet and the local copy must survive.
        const survivors = current
          .filter((row) => {
            if (pending.has(row.id)) return false;
            const rowRevision = rowRevisionRef.current.get(row.id) ?? 0;
            // A row can end up in `current` despite a confirmed delete/clear
            // newer than this read — e.g. a second overlapping mutation's own
            // optimistic update, built from a stale pre-mutation snapshot,
            // can reintroduce an id another mutation just had removed. Reject
            // it here too, not just via `pending`, unless something
            // genuinely newer than the tombstone put it back (rowRevision
            // only advances through applyExtractionEvent/reconciliation, so a
            // stale-closure reintroduction never counts as newer).
            const deletedAt = deletedAtRevisionRef.current.get(row.id);
            if (deletedAt !== undefined && deletedAt > sinceRevision && rowRevision <= deletedAt) {
              return false;
            }
            if (clearedAtRevisionRef.current > sinceRevision && rowRevision <= clearedAtRevisionRef.current) {
              return false;
            }
            if (confirmedIds.has(row.id)) return true;
            return rowRevision > sinceRevision;
          })
          .map((row) => {
            const confirmedRow = acceptedById.get(row.id);
            return confirmedRow ? reconcileExtractionRecord(row, confirmedRow) : row;
          });
        const survivorIds = new Set(survivors.map((row) => row.id));
        const merged = [...survivors];
        for (const row of accepted) {
          if (survivorIds.has(row.id)) continue;
          const at = merged.findIndex((existing) => existing.startedAt < row.startedAt);
          if (at === -1) merged.push(row);
          else merged.splice(at, 0, row);
        }
        return merged;
      });
      for (const row of accepted) rowRevisionRef.current.set(row.id, revision);
      return extractionsRef.current;
    },
    [updateExtractions],
  );

  const reloadExtractions = useCallback(async () => {
    // Two overlapping reloadExtractions() calls race two INDEPENDENT server
    // reads, so resolution order tells you nothing about which read is
    // chronologically fresher — only call order does. Only the
    // latest-STARTED call's response is ever allowed to commit; an older
    // call's response arriving after a newer call has already started (or
    // committed) is discarded outright, not merely reconciled, since a
    // strictly newer read supersedes it regardless of which HTTP response
    // lands first.
    const generation = ++reloadGenerationRef.current;
    inFlightReloadsRef.current += 1;
    setIsRefreshing(true);
    // Capture the revision BEFORE the read starts: mount, SSE frames, and
    // delete/clear flows can all trigger reload() concurrently, so the fetch
    // that lands must reconcile against local state rather than overwrite it
    // — the same seam onDeleteExtraction/clearExtractions already use for
    // their own recovery reads.
    const sinceRevision = extractionRevision.current;
    try {
      const next = await port.fetchExtractions();
      if (reloadGenerationRef.current !== generation) return extractionsRef.current;
      // Return what actually got committed, not the raw fetch — reconciliation
      // can drop/keep rows differently than the raw response (a real caller,
      // useMemoryConnectors, reads this return value directly).
      const merged = reconcileConfirmedExtractions(next, sinceRevision);
      setLoadError(null);
      return merged;
    } catch {
      if (reloadGenerationRef.current !== generation) return extractionsRef.current;
      // Keep the last confirmed history instead of presenting a synthetic empty
      // list when the daemon cannot be reached — and return that same
      // preserved state, not a fabricated empty array, since a real caller
      // (useMemoryConnectors.onSuggestConnectorMemory) reads this return
      // value directly to look for a just-written extraction.
      setLoadError("Memory extraction history couldn't be loaded. Try again shortly.");
      return extractionsRef.current;
    } finally {
      inFlightReloadsRef.current -= 1;
      if (inFlightReloadsRef.current <= 0) {
        inFlightReloadsRef.current = 0;
        setIsRefreshing(false);
      }
    }
  }, [port, reconcileConfirmedExtractions]);

  const applyExtractionEvent = useCallback((ev: MemoryExtractionEvent) => {
    if (!ev || !ev.id) return;
    // Pseudo-phases: the daemon emits these synthetically when a row is dropped
    // from the buffer, either by the per-row delete button or the "Clear"
    // affordance at the top.
    if (ev.phase === 'cleared') {
      deferredDeletionEvents.current.clear();
      clearedAtRevisionRef.current = updateExtractions([]);
      return;
    }
    if (ev.phase === 'deleted') {
      deferredDeletionEvents.current.delete(ev.id);
      const revision = updateExtractions((prev) => prev.filter((r) => r.id !== ev.id));
      deletedAtRevisionRef.current.set(ev.id, revision);
      return;
    }
    // Once an id has been confirmed deleted, it can never be reintroduced:
    // ids are attempt UUIDs. A delayed frame on the SSE connection may have
    // been emitted before the DELETE response won the fetch race.
    if (deletedAtRevisionRef.current.has(ev.id)) return;
    if (pendingDeletionCounts.current.has(ev.id)) {
      const deferred = deferredDeletionEvents.current.get(ev.id);
      deferredDeletionEvents.current.set(
        ev.id,
        deferred ? reconcileExtractionRecord(deferred, ev) : ev,
      );
      return;
    }
    // Merge by id: phase transitions for an in-flight attempt collapse onto a
    // single row instead of stacking N entries. New ids are unshifted so the
    // latest appears at the top.
    const revision = updateExtractions((prev) => {
      const existing = prev.findIndex((r) => r.id === ev.id);
      if (existing >= 0) {
        const next = prev.slice();
        next[existing] = reconcileExtractionRecord(next[existing]!, ev);
        return next;
      }
      return [ev, ...prev].slice(0, 30);
    });
    rowRevisionRef.current.set(ev.id, revision);
  }, [updateExtractions]);

  const onDeleteExtraction = useCallback(
    async (id: string) => {
      // Optimistic removal: drop the row immediately so the click feels
      // instant. The SSE 'deleted' event will arrive moments later and is a
      // no-op against an already-removed id; if the request fails we re-fetch
      // to put the row back instead of silently lying. Snapshot from
      // extractionsRef, NOT the render-closure `extractions` state: two
      // deletes issued back-to-back in the same tick (before either has
      // re-rendered) would otherwise both compute their filtered array from
      // the SAME stale array, so the second call's write can clobber the
      // first's removal and resurrect a row that was supposed to be gone.
      const previous = extractionsRef.current;
      markPendingDeletion(id);
      const optimisticRevision = updateExtractions(previous.filter((r) => r.id !== id));
      let ok = false;
      try {
        ok = await port.deleteExtraction(id);
      } catch {
        // A network failure rejects rather than returning the adapter's normal
        // non-2xx `false` result. Treat both paths alike so the optimistic UI
        // never claims the server-side row was deleted when it was not.
      }
      if (!ok) {
        unmarkPendingDeletion(id);
        if (!pendingDeletionCounts.current.has(id)) {
          const deferred = deferredDeletionEvents.current.get(id);
          deferredDeletionEvents.current.delete(id);
          if (deferred) applyExtractionEvent(deferred);
        }
        try {
          const confirmed = await port.fetchExtractions();
          reconcileConfirmedExtractions(confirmed, optimisticRevision);
          setLoadError(null);
        } catch {
          if (extractionRevision.current === optimisticRevision) {
            updateExtractions(previous);
          }
          setLoadError("Memory extraction history couldn't be loaded. Try again shortly.");
        }
      } else {
        unmarkPendingDeletion(id);
        if (!pendingDeletionCounts.current.has(id)) {
          deferredDeletionEvents.current.delete(id);
        }
        // Re-assert the removal against whatever the array actually holds
        // right now, rather than trusting the optimistic removal is still
        // intact: a concurrent mutation's OWN recovery reconciliation can run
        // between the optimistic removal and this success callback and
        // resurrect `id` (e.g. a concurrent clearExtractions() failed, and
        // ITS recovery fetch — resolved before this delete's success — still
        // listed `id`, since this delete hadn't been confirmed server-side
        // yet at the time that recovery read fired). Stamping only a
        // tombstone marker here, without re-touching the array, would leave
        // that resurrected row in place until an SSE echo eventually arrives.
        const revision = updateExtractions((current) => current.filter((r) => r.id !== id));
        // Use the SAME revision this re-assertion produced (not
        // optimisticRevision): a concurrent reload() can capture that exact
        // same value as its own sinceRevision (it started right after the
        // optimistic removal, before this delete's own request settled), and
        // a non-strict `>` comparison against an equal value would treat this
        // now-confirmed deletion as already accounted for by that read —
        // even though the read's OWN server round-trip may have raced ahead
        // of the delete and returned stale, pre-delete data.
        deletedAtRevisionRef.current.set(id, revision);
      }
    },
    [
      port,
      reconcileConfirmedExtractions,
      updateExtractions,
      markPendingDeletion,
      unmarkPendingDeletion,
      applyExtractionEvent,
    ],
  );

  const clearExtractions = useCallback(async () => {
    // See the delete path above for why this reads extractionsRef instead of
    // the render-closure `extractions` state.
    const previous = extractionsRef.current;
    const optimisticRevision = updateExtractions([]);
    let ok = false;
    try {
      ok = await port.clearExtractionHistory();
    } catch {
      // See the per-row delete path above: fetch rejects on transport failure.
    }
    if (!ok) {
      try {
        const confirmed = await port.fetchExtractions();
        // Reconcile rather than overwrite: a newer SSE frame may have already
        // advanced the revision while this recovery fetch was in flight, and
        // dropping the confirmed response entirely would leave the failed
        // clear's rows missing from state.
        reconcileConfirmedExtractions(confirmed, optimisticRevision);
        setLoadError(null);
      } catch {
        if (extractionRevision.current === optimisticRevision) {
          updateExtractions(previous);
        }
        setLoadError("Memory extraction history couldn't be loaded. Try again shortly.");
      }
    } else {
      // Re-assert the wipe against whatever the array actually holds right
      // now (see the per-row delete path above for why: a concurrent
      // mutation's own recovery reconciliation can resurrect rows between
      // this clear's optimistic wipe and its own success callback), using
      // the SAME revision this re-assertion produces for the tombstone.
      const revision = updateExtractions(() => []);
      clearedAtRevisionRef.current = revision;
    }
  }, [port, reconcileConfirmedExtractions, updateExtractions]);

  // The "no API key" banner only shows when the most recent attempt skipped for
  // that specific reason. We don't show it for memory-disabled (the user's own
  // toggle) or empty-message (a routine no-op on tool-only turns).
  const showNoProviderBanner = useMemo(() => {
    const latest = extractions[0];
    return Boolean(
      latest && latest.phase === 'skipped' && latest.reason === 'no-provider',
    );
  }, [extractions]);

  const [nowClock, setNowClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const connectorExtractions = useMemo(
    () => extractions.filter((record) => record.kind === 'connector'),
    [extractions],
  );

  return {
    loadError,
    extractions,
    isRefreshing,
    nowClock,
    showNoProviderBanner,
    connectorExtractions,
    reloadExtractions,
    applyExtractionEvent,
    onDeleteExtraction,
    clearExtractions,
  };
}

export function useWiredMemoryExtractions(): MemoryExtractionsController {
  return useMemoryExtractions(memoryExtractionsPort);
}
