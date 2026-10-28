// `useMemoryWrittenCard` — surface the memory component (design draft
// `body-components.html`, 组件 8 「记忆组件」) after a turn actually writes
// long-term memory.
//
// The card itself has existed for a while: `<od-card type="memory-applied">`
// renders as the collapsible 「已记住 N 条偏好」 detail the draft draws. What did
// not exist was any producer for it on a WRITE. The only thing that ever emitted
// that tag was the model, prompted to describe memory it had READ ("Applied your
// profile and 2 rules" — see `packages/contracts/src/prompts/system.ts`). So a
// turn could sediment three rules into the store, the store could grow 22 → 25,
// and the transcript would show nothing but ordinary prose (OPEND-2607).
//
// Extraction finishes out of band and AFTER the turn: the daemon queues
// `extractWithLLM` on child close, so there is no run event left to hang the
// card on. We therefore watch for the write the same way `useBrandReadyPrompt`
// watches for a finished brand extraction — a bounded poll of the daemon's own
// record of the attempt (`GET /api/memory/extractions`), opened when a turn ends
// and closed again a short window later. Deliberately NOT a second EventSource:
// `MemoryToast` already holds the one `/api/memory/events` connection this
// surface is allowed under the HTTP/1.1 connection budget.
//
// ProjectView turns each batch into one host-authored assistant message, exactly
// as it does for the brand browser-assist card, so the card is persisted with
// the conversation and comes back on reload.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MemoryEntrySummary,
  MemoryExtractionRecord,
  MemoryExtractionOrigin,
  MemoryType,
} from '@open-design/contracts';

// The window opens when a turn ends and the extractor has not reported yet. A
// small-model pass over one exchange lands in seconds; ~36s of 3s polls covers a
// slow provider without leaving a request loop running behind an idle project.
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 12;

export interface MemoryWrittenEntry {
  id: string;
  name: string;
  type: MemoryType;
}

export interface MemoryWrittenBatch {
  /** The extraction attempt's id — one card per attempt, ever. */
  key: string;
  /** How many entries the daemon reports it wrote. Never 0: see below. */
  count: number;
  /** The entries themselves, in the order the daemon wrote them. */
  entries: MemoryWrittenEntry[];
}

export interface UseMemoryWrittenCard<Context = undefined> {
  /** The batch awaiting a card, or null. Consume it, then `dismiss()`. */
  batch: (MemoryWrittenBatch & { context: Context | undefined }) | null;
  dismiss: () => void;
}

/** One visible turn can observe several physical runs in a strategy chain. */
export interface MemoryWrittenTurnOrigin extends MemoryExtractionOrigin {
  observedRunIds?: readonly string[];
}

/** The `<od-card>` block a written batch renders as. The payload is the same
 *  `memory-applied` shape the model emits, so it flows through the existing
 *  parser (`tryParseOdCard`) and the existing `MemoryAppliedCard` — the draft's
 *  collapsible 「已记住 N 条偏好」 — with no second renderer. */
export function memoryWrittenCardContent(
  batch: MemoryWrittenBatch,
  summary: string,
): string {
  const payload = JSON.stringify({
    summary,
    used: batch.entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      name: entry.name,
    })),
  });
  return `<od-card type="memory-applied">${payload}</od-card>`;
}

async function fetchExtractionRecords(): Promise<MemoryExtractionRecord[]> {
  const resp = await fetch('/api/memory/extractions');
  if (!resp.ok) return [];
  const json = (await resp.json()) as { extractions?: MemoryExtractionRecord[] };
  return Array.isArray(json?.extractions) ? json.extractions : [];
}

async function fetchEntrySummaries(): Promise<MemoryEntrySummary[]> {
  const resp = await fetch('/api/memory');
  if (!resp.ok) return [];
  const json = (await resp.json()) as { entries?: MemoryEntrySummary[] };
  return Array.isArray(json?.entries) ? json.entries : [];
}

/**
 * A record is card-worthy only when the daemon says it finished AND says it
 * wrote something. `writtenCount === 0` deliberately produces no card: the draft
 * is explicit that the block does not appear at 0 rather than saying
 * 「已记住 0 条」 (「0 条时整块不出现,不写「已记住 0 条」」).
 */
function wroteMemory(record: MemoryExtractionRecord): boolean {
  return record.phase === 'success' && (record.writtenCount ?? 0) > 0;
}

/**
 * Watch for memory written by the conversation's own turns.
 *
 * `runActive` is the caller's "a turn is in flight" signal. Each falling edge
 * opens an independent bounded polling window. Explicit producing identities
 * decide ownership; timestamp compatibility is limited to non-overlapping
 * legacy windows. Nothing is polled before a turn has run in this mount.
 */
function sameConversation(a: MemoryExtractionOrigin | undefined, b: MemoryExtractionOrigin | undefined): boolean {
  return Boolean(a && b && a.projectId === b.projectId && a.conversationId === b.conversationId);
}

function recordMatchesOrigin(record: MemoryExtractionRecord, origin: MemoryWrittenTurnOrigin | undefined): boolean {
  const source = record.extractionOrigin;
  if (!source || !sameConversation(source, origin)) return false;
  if (source.runId !== undefined) {
    return typeof source.runId === 'string' && Boolean(source.runId)
      && (source.runId === origin?.runId || origin?.observedRunIds?.includes(source.runId) === true);
  }
  if (source.assistantMessageId !== undefined) {
    return typeof source.assistantMessageId === 'string' && Boolean(source.assistantMessageId)
      && source.assistantMessageId === origin?.assistantMessageId;
  }
  return true;
}

function snapshotOrigin(origin: MemoryWrittenTurnOrigin | undefined): MemoryWrittenTurnOrigin | undefined {
  return origin ? { ...origin, ...(origin.observedRunIds ? { observedRunIds: [...origin.observedRunIds] } : {}) } : undefined;
}

export function useMemoryWrittenCard<Context = undefined>(
  runActive: boolean,
  context?: Context,
  origin?: MemoryWrittenTurnOrigin,
): UseMemoryWrittenCard<Context> {
  type Batch = NonNullable<UseMemoryWrittenCard<Context>['batch']>;
  type Window = {
    context: Context | undefined;
    origin: MemoryWrittenTurnOrigin | undefined;
    startedAt: number;
    remaining: number;
    legacyAllowed: boolean;
    runlessAllowed: boolean;
    timer?: ReturnType<typeof setTimeout>;
  };
  const [batch, setBatch] = useState<Batch | null>(null);
  const batchRef = useRef<Batch | null>(null);
  const queuedBatches = useRef<Batch[]>([]);
  const windows = useRef<Set<Window>>(new Set());
  const seen = useRef(new Set<string>());
  const selected = useRef(new Set<string>());
  const mounted = useRef(true);
  const turn = useRef<Pick<Window, 'context' | 'origin' | 'startedAt' | 'legacyAllowed' | 'runlessAllowed'> | null>(null);
  const wasActive = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const window of windows.current) clearTimeout(window.timer);
      windows.current.clear();
      queuedBatches.current = [];
    };
  }, []);

  const scheduleWindow = useCallback(function schedule(window: Window, delay: number) {
    window.timer = setTimeout(async () => {
      if (!mounted.current || !windows.current.has(window)) return;
      // Consumption pauses retries without resetting this window's budget.
      if (batchRef.current) {
        schedule(window, POLL_INTERVAL_MS);
        return;
      }
      let selectedId: string | undefined;
      try {
        const records = await fetchExtractionRecords();
        if (!mounted.current || !windows.current.has(window)) return;
        const record = records.filter(record => {
          if (!record.id || seen.current.has(record.id) || selected.current.has(record.id) || !wroteMemory(record)) return false;
          if (record.extractionOrigin !== undefined) {
            // Explicit foreign/malformed provenance never falls through to the
            // timestamp-based old-daemon compatibility path.
            if (!recordMatchesOrigin(record, window.origin)) return false;
            const hasTurnIdentity = record.extractionOrigin?.runId !== undefined
              || record.extractionOrigin?.assistantMessageId !== undefined;
            if (!hasTurnIdentity && (!window.runlessAllowed || (record.startedAt ?? 0) < window.startedAt)) return false;
            // An HTTP record without a run id can be used only when its
            // explicit conversation selects exactly one unfinished window.
            return [...windows.current].filter(candidate => recordMatchesOrigin(record, candidate.origin)).length === 1;
          }
          return window.legacyAllowed && (record.startedAt ?? 0) >= window.startedAt;
        }).sort((a, b) => a.startedAt - b.startedAt)[0];
        if (record) {
          selectedId = record.id;
          selected.current.add(record.id);
          const summaries = await fetchEntrySummaries();
          if (!mounted.current || !windows.current.has(window)) return;
          const byId = new Map(summaries.map(entry => [entry.id, entry]));
          const entries = (record.writtenIds ?? []).map(id => byId.get(id))
            .filter((entry): entry is MemoryEntrySummary => Boolean(entry))
            .map(entry => ({ id: entry.id, name: entry.name, type: entry.type }));
          const next: Batch = {
            context: window.context, key: record.id,
            count: record.writtenCount ?? entries.length, entries,
          };
          seen.current.add(record.id);
          if (batchRef.current) queuedBatches.current.push(next);
          else {
            batchRef.current = next;
            setBatch(next);
          }
        }
      } catch {
        // Memory extraction remains best effort; retry only this window.
      } finally {
        if (selectedId) selected.current.delete(selectedId);
      }
      if (!mounted.current || !windows.current.has(window)) return;
      window.remaining -= 1;
      if (window.remaining > 0) schedule(window, POLL_INTERVAL_MS);
      else windows.current.delete(window);
    }, delay);
  }, []);

  useEffect(() => {
    const previous = wasActive.current;
    wasActive.current = runActive;
    if (runActive && !previous) {
      // BYOK preflight can finish before B has a completed polling window.
      // Its old conversation-only record is already ambiguous to pending A;
      // upgraded preflight records instead match B's explicit sending draft.
      let runlessAllowed = true;
      for (const pending of windows.current) {
        if (sameConversation(pending.origin, origin)) {
          pending.runlessAllowed = false;
          runlessAllowed = false;
        }
      }
      // A may exhaust its budget while B is still active. Preserve this
      // overlap on B itself; an empty Set at B's end is not new ownership proof.
      turn.current = {
        context, origin: snapshotOrigin(origin), startedAt: Date.now(),
        legacyAllowed: windows.current.size === 0, runlessAllowed,
      };
    }
    // POST /runs may deliver its id after the active edge. Only enrich the
    // captured conversation; navigation to another owner must not replace it.
    if (turn.current && sameConversation(turn.current.origin, origin)
      && (!turn.current.origin?.assistantMessageId || turn.current.origin.assistantMessageId === origin?.assistantMessageId)) {
      turn.current.origin = snapshotOrigin(origin);
    }
    if (!runActive && previous && turn.current) {
      const overlapping = windows.current.size > 0;
      // Once overlapping, a source-less record remains ambiguous even if the
      // other window later expires. Do not reassign it to the survivor.
      if (overlapping) for (const pending of windows.current) pending.legacyAllowed = false;
      const sameOwner = [...windows.current].filter(pending => sameConversation(pending.origin, turn.current?.origin));
      for (const pending of sameOwner) pending.runlessAllowed = false;
      const window: Window = {
        ...turn.current, remaining: MAX_POLLS,
        legacyAllowed: turn.current.legacyAllowed && !overlapping,
        runlessAllowed: turn.current.runlessAllowed && sameOwner.length === 0,
      };
      windows.current.add(window);
      scheduleWindow(window, 0);
      turn.current = null;
    }
  }, [runActive, context, origin, scheduleWindow]);

  const dismiss = useCallback(() => {
    const next = queuedBatches.current.shift() ?? null;
    batchRef.current = next;
    setBatch(next);
  }, []);

  return { batch, dismiss };
}
