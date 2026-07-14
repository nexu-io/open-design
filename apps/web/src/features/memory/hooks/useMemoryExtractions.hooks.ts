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
  const updateExtractions = useCallback((next: SetStateAction<MemoryExtractionRecord[]>) => {
    extractionRevision.current += 1;
    setExtractions(next);
    return extractionRevision.current;
  }, []);
  const reconcileConfirmedExtractions = useCallback((confirmed: MemoryExtractionRecord[]) => {
    const pending = new Set(pendingDeletionIds.current);
    updateExtractions((current) => {
      const reconciled = confirmed.filter((row) => !pending.has(row.id));
      const confirmedIds = new Set(reconciled.map((row) => row.id));
      // Retain live frames that arrived after the recovery read, while never
      // resurrecting a row another optimistic delete still owns.
      return [
        ...reconciled,
        ...current.filter((row) => !pending.has(row.id) && !confirmedIds.has(row.id)),
      ];
    });
  }, [updateExtractions]);

  const reloadExtractions = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const next = await port.fetchExtractions();
      updateExtractions(next);
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
  }, [port, updateExtractions]);

  const applyExtractionEvent = useCallback((ev: MemoryExtractionEvent) => {
    if (!ev || !ev.id) return;
    // Pseudo-phases: the daemon emits these synthetically when a row is dropped
    // from the buffer, either by the per-row delete button or the "Clear"
    // affordance at the top.
    if (ev.phase === 'cleared') {
      updateExtractions([]);
      return;
    }
    if (ev.phase === 'deleted') {
      updateExtractions((prev) => prev.filter((r) => r.id !== ev.id));
      return;
    }
    // Merge by id: phase transitions for an in-flight attempt collapse onto a
    // single row instead of stacking N entries. New ids are unshifted so the
    // latest appears at the top.
    updateExtractions((prev) => {
      const existing = prev.findIndex((r) => r.id === ev.id);
      if (existing >= 0) {
        const next = prev.slice();
        next[existing] = ev;
        return next;
      }
      return [ev, ...prev].slice(0, 30);
    });
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
          reconcileConfirmedExtractions(confirmed);
          setLoadError(null);
        } catch {
          if (extractionRevision.current === optimisticRevision) {
            updateExtractions(previous);
          }
          setLoadError("Memory extraction history couldn't be loaded. Try again shortly.");
        }
      } else {
        pendingDeletionIds.current.delete(id);
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
        if (extractionRevision.current === optimisticRevision) {
          updateExtractions(confirmed);
        }
        setLoadError(null);
      } catch {
        if (extractionRevision.current === optimisticRevision) {
          updateExtractions(previous);
        }
        setLoadError("Memory extraction history couldn't be loaded. Try again shortly.");
      }
    }
  }, [extractions, port, updateExtractions]);

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
