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
  const pendingDeletionIds = useRef(new Set<string>());
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
  const updateExtractions = useCallback((next: SetStateAction<MemoryExtractionRecord[]>) => {
    extractionRevision.current += 1;
    setExtractions(next);
    return extractionRevision.current;
  }, []);
  const reconcileConfirmedExtractions = useCallback(
    (confirmed: MemoryExtractionRecord[], sinceRevision: number) => {
      const pending = new Set(pendingDeletionIds.current);
      // A clear that landed after this recovery began supersedes the whole
      // confirmed snapshot — nothing from it should come back.
      const accepted =
        clearedAtRevisionRef.current > sinceRevision
          ? []
          : confirmed.filter((row) => {
              if (pending.has(row.id)) return false;
              const deletedAt = deletedAtRevisionRef.current.get(row.id);
              if (deletedAt !== undefined && deletedAt > sinceRevision) return false;
              // Any row the live stream touched after the recovery read began
              // is newer than the snapshot — keep the local copy, not the
              // fetched one, so a phase transition never regresses.
              return (rowRevisionRef.current.get(row.id) ?? 0) <= sinceRevision;
            });
      const acceptedById = new Map(accepted.map((row) => [row.id, row] as const));
      const revision = updateExtractions((current) => {
        // Live rows keep their newest-first positions (taking the confirmed
        // content where the snapshot is still authoritative for that id, and
        // never resurrecting a row another optimistic delete still owns);
        // rows the snapshot restores slot back in by start time so they never
        // jump ahead of frames that arrived after the recovery read.
        const survivors = current
          .filter((row) => !pending.has(row.id))
          .map((row) => acceptedById.get(row.id) ?? row);
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
    },
    [updateExtractions],
  );

  const reloadExtractions = useCallback(async () => {
    setIsRefreshing(true);
    // Capture the revision BEFORE the read starts: mount, SSE frames, and
    // delete/clear flows can all trigger reload() concurrently, so the fetch
    // that lands must reconcile against local state rather than overwrite it
    // — the same seam onDeleteExtraction/clearExtractions already use for
    // their own recovery reads.
    const sinceRevision = extractionRevision.current;
    try {
      const next = await port.fetchExtractions();
      reconcileConfirmedExtractions(next, sinceRevision);
      setLoadError(null);
      return next;
    } catch {
      // Keep the last confirmed history instead of presenting a synthetic empty
      // list when the daemon cannot be reached.
      setLoadError("Memory extraction history couldn't be loaded. Try again shortly.");
      return [];
    } finally {
      setIsRefreshing(false);
    }
  }, [port, reconcileConfirmedExtractions]);

  const applyExtractionEvent = useCallback((ev: MemoryExtractionEvent) => {
    if (!ev || !ev.id) return;
    // Pseudo-phases: the daemon emits these synthetically when a row is dropped
    // from the buffer, either by the per-row delete button or the "Clear"
    // affordance at the top.
    if (ev.phase === 'cleared') {
      clearedAtRevisionRef.current = updateExtractions([]);
      return;
    }
    if (ev.phase === 'deleted') {
      const revision = updateExtractions((prev) => prev.filter((r) => r.id !== ev.id));
      deletedAtRevisionRef.current.set(ev.id, revision);
      return;
    }
    // Merge by id: phase transitions for an in-flight attempt collapse onto a
    // single row instead of stacking N entries. New ids are unshifted so the
    // latest appears at the top.
    const revision = updateExtractions((prev) => {
      const existing = prev.findIndex((r) => r.id === ev.id);
      if (existing >= 0) {
        const next = prev.slice();
        next[existing] = ev;
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
      // to put the row back instead of silently lying.
      const previous = extractions;
      pendingDeletionIds.current.add(id);
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
        pendingDeletionIds.current.delete(id);
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
        pendingDeletionIds.current.delete(id);
        // Stamp the tombstone now instead of waiting for the SSE 'deleted'
        // echo: a reload() racing this delete can otherwise resolve with a
        // pre-delete snapshot after the server has already confirmed removal,
        // and reconcileConfirmedExtractions would resurrect the row because
        // deletedAtRevisionRef has no entry for it yet.
        deletedAtRevisionRef.current.set(id, optimisticRevision);
      }
    },
    [extractions, port, reconcileConfirmedExtractions, updateExtractions],
  );

  const clearExtractions = useCallback(async () => {
    const previous = extractions;
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
      // Stamp the tombstone now instead of waiting for the SSE 'cleared'
      // echo — see the per-row delete path above for why.
      clearedAtRevisionRef.current = optimisticRevision;
    }
  }, [extractions, port, reconcileConfirmedExtractions, updateExtractions]);

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
