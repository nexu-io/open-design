// Feature-local hook for the extraction history: the one-shot list fetch, the
// live SSE merge, the relative-time clock, and delete/clear. Transport is the
// injected port; the SSE EventSource itself lives in providers/memory/events.ts
// (transport can't sit in a feature file), so the orchestrator opens the stream
// and feeds each `extraction` frame to `applyExtractionEvent` here.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MemoryExtractionEvent,
  MemoryExtractionRecord,
} from '@open-design/contracts';
import { memoryExtractionsPort } from '../dependencies';
import type { MemoryExtractionsPort } from '../ports';

export interface MemoryExtractionsController {
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const reloadExtractions = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const next = await port.fetchExtractions();
      setExtractions(next);
      return next;
    } finally {
      setIsRefreshing(false);
    }
  }, [port]);

  const applyExtractionEvent = useCallback((ev: MemoryExtractionEvent) => {
    if (!ev || !ev.id) return;
    // Pseudo-phases: the daemon emits these synthetically when a row is dropped
    // from the buffer, either by the per-row delete button or the "Clear"
    // affordance at the top.
    if (ev.phase === 'cleared') {
      setExtractions([]);
      return;
    }
    if (ev.phase === 'deleted') {
      setExtractions((prev) => prev.filter((r) => r.id !== ev.id));
      return;
    }
    // Merge by id: phase transitions for an in-flight attempt collapse onto a
    // single row instead of stacking N entries. New ids are unshifted so the
    // latest appears at the top.
    setExtractions((prev) => {
      const existing = prev.findIndex((r) => r.id === ev.id);
      if (existing >= 0) {
        const next = prev.slice();
        next[existing] = ev;
        return next;
      }
      return [ev, ...prev].slice(0, 30);
    });
  }, []);

  const onDeleteExtraction = useCallback(
    async (id: string) => {
      // Optimistic removal: drop the row immediately so the click feels
      // instant. The SSE 'deleted' event will arrive moments later and is a
      // no-op against an already-removed id; if the request fails we re-fetch
      // to put the row back instead of silently lying.
      setExtractions((prev) => prev.filter((r) => r.id !== id));
      const ok = await port.deleteExtraction(id);
      if (!ok) {
        void reloadExtractions();
      }
    },
    [reloadExtractions, port],
  );

  const clearExtractions = useCallback(async () => {
    setExtractions([]);
    const ok = await port.clearExtractionHistory();
    if (!ok) {
      void reloadExtractions();
    }
  }, [reloadExtractions, port]);

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
