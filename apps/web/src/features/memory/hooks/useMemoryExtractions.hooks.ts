// Feature-local hook for the extraction history: the one-shot list fetch, the
// live SSE merge, the relative-time clock, and delete/clear. Transport is the
// injected port; the SSE EventSource itself lives in providers/memory/events.ts
// (transport can't sit in a feature file), so the orchestrator opens the stream
// and feeds each `extraction` frame to `applyExtractionEvent` here.
//
// All merge/reconciliation logic and the concurrency-ordering model live in
// the pure store, `./useMemoryExtractions.store.ts` — read its header comment
// for the three ordering rules the hook relies on. This file is just the
// React shell: it owns the port I/O (reload/delete/clear), the derived UI
// state (banner, connector partition, relative-time clock), and wiring the
// store's synchronous transitions to React state.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MemoryExtractionEvent,
  MemoryExtractionRecord,
} from '@open-design/contracts';
import { createAsyncCommitGuard } from '../async-commit-guard';
import { memoryExtractionsPort } from '../dependencies';
import type { MemoryExtractionsPort } from '../ports';
import {
  createExtractionHistoryStore,
  type ExtractionHistoryStore,
} from './useMemoryExtractions.store';

const LOAD_ERROR_MESSAGE =
  "Memory extraction history couldn't be loaded. Try again shortly.";

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
  // Recent extraction attempts, newest first — a render mirror of the
  // store's rows. All mutation logic lives in the store (see its docs).
  const [extractions, setExtractions] = useState<MemoryExtractionRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const storeRef = useRef<ExtractionHistoryStore | null>(null);
  // `setExtractions` is stable, so creating the store once on first render
  // keeps store state and the rendered rows resolved together.
  if (!storeRef.current) storeRef.current = createExtractionHistoryStore(setExtractions);
  const store = storeRef.current;

  // Orders reloadExtractions() against itself (rule A, via the slice's
  // shared primitive): two overlapping reloads race two INDEPENDENT server
  // reads, so resolution order says nothing about freshness — only call
  // order does. Only the latest-started call's response may commit; an older
  // response is discarded outright, not merely reconciled. Local mutations
  // do NOT invalidate this guard: their effects are already protected by the
  // store's tombstones/pending hides, which a committing snapshot respects.
  const reloadGuard = useRef(createAsyncCommitGuard());
  // isRefreshing counts in-flight reloads so one completing doesn't clear it
  // while another is still pending.
  const inFlightReloads = useRef(0);

  const reloadExtractions = useCallback(async () => {
    const ticket = reloadGuard.current.begin();
    inFlightReloads.current += 1;
    setIsRefreshing(true);
    // Capture the clock BEFORE the read starts (rule A): mount, SSE frames,
    // and delete/clear flows can all trigger reloads concurrently, so the
    // snapshot that lands must reconcile against local state, not overwrite.
    const sinceClock = store.snapshotClock();
    try {
      const confirmed = await port.fetchExtractions();
      if (!reloadGuard.current.isCurrent(ticket)) return store.rows();
      // Return what actually committed, not the raw fetch — reconciliation
      // can drop/keep rows differently than the raw response (a real caller,
      // useMemoryConnectors, reads this return value directly).
      const committed = store.commitSnapshot(confirmed, sinceClock);
      setLoadError(null);
      return committed;
    } catch {
      if (!reloadGuard.current.isCurrent(ticket)) return store.rows();
      // Keep the last confirmed history instead of presenting a synthetic
      // empty list when the daemon cannot be reached — and return that same
      // preserved state, since callers read this value directly.
      setLoadError(LOAD_ERROR_MESSAGE);
      return store.rows();
    } finally {
      inFlightReloads.current -= 1;
      if (inFlightReloads.current <= 0) {
        inFlightReloads.current = 0;
        setIsRefreshing(false);
      }
    }
  }, [port, store]);

  const applyExtractionEvent = useCallback(
    (ev: MemoryExtractionEvent) => {
      store.applyFrame(ev);
    },
    [store],
  );

  const onDeleteExtraction = useCallback(
    async (id: string) => {
      // Optimistic removal: drop the row immediately so the click feels
      // instant. The SSE 'deleted' echo arriving moments later is a no-op
      // against the tombstone; if the request fails we re-fetch server truth
      // instead of silently lying.
      const token = store.beginDelete(id);
      let ok = false;
      try {
        ok = await port.deleteExtraction(id);
      } catch {
        // A network failure rejects rather than returning the adapter's
        // normal non-2xx `false`. Treat both alike so the optimistic UI
        // never claims the server-side row was deleted when it was not.
      }
      if (ok) {
        store.settleDeleteSuccess(id);
        return;
      }
      store.settleDeleteFailure(id);
      try {
        const confirmed = await port.fetchExtractions();
        // Reconcile rather than overwrite: newer SSE frames or overlapping
        // mutations may have landed while this recovery read was in flight.
        store.commitSnapshot(confirmed, token.startClock);
        setLoadError(null);
      } catch {
        store.restoreIfUnchanged(token);
        setLoadError(LOAD_ERROR_MESSAGE);
      }
    },
    [port, store],
  );

  const clearExtractions = useCallback(async () => {
    const token = store.beginClear();
    let ok = false;
    try {
      ok = await port.clearExtractionHistory();
    } catch {
      // See the per-row delete path above: fetch rejects on transport failure.
    }
    if (ok) {
      store.settleClearSuccess(token);
      return;
    }
    store.settleClearFailure();
    try {
      const confirmed = await port.fetchExtractions();
      store.commitSnapshot(confirmed, token.startClock);
      setLoadError(null);
    } catch {
      store.restoreIfUnchanged(token);
      setLoadError(LOAD_ERROR_MESSAGE);
    }
  }, [port, store]);

  // The "no API key" banner only shows when the most recent attempt skipped
  // for that specific reason. We don't show it for memory-disabled (the
  // user's own toggle) or empty-message (a routine no-op on tool-only turns).
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
