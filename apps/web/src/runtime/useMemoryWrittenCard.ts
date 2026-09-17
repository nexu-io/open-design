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

export interface UseMemoryWrittenCard {
  /** The batch awaiting a card, or null. Consume it, then `dismiss()`. */
  batch: MemoryWrittenBatch | null;
  dismiss: () => void;
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
 * opens a bounded polling window over the daemon's extraction records; a record
 * that started inside the window and wrote at least one entry becomes one batch,
 * once. Nothing is polled while no turn has run in this mount.
 */
export function useMemoryWrittenCard(runActive: boolean): UseMemoryWrittenCard {
  const [batch, setBatch] = useState<MemoryWrittenBatch | null>(null);
  const [pollsLeft, setPollsLeft] = useState(0);
  // Attempts already turned into a card. Survives dismiss so a still-open
  // window cannot post the same batch twice.
  const seenRef = useRef<Set<string>>(new Set());
  // When the current turn started. Records older than this belong to an earlier
  // turn (or to Settings → Memory) and are not this conversation's news.
  const turnStartedAtRef = useRef<number | null>(null);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = runActive;
    if (runActive && !wasActive) {
      turnStartedAtRef.current = Date.now();
      return;
    }
    // A turn just ended. Extraction runs after child close, so start looking.
    if (!runActive && wasActive) setPollsLeft(MAX_POLLS);
  }, [runActive]);

  useEffect(() => {
    if (pollsLeft <= 0) return undefined;
    // Hold the window open while a batch is waiting to be consumed, so a second
    // attempt cannot overwrite a card the caller has not posted yet.
    if (batch) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const records = await fetchExtractionRecords();
        if (cancelled) return;
        const since = turnStartedAtRef.current ?? 0;
        const fresh = records
          .filter((record) => record.id
            && !seenRef.current.has(record.id)
            && (record.startedAt ?? 0) >= since
            && wroteMemory(record))
          .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
        const record = fresh[0];
        if (record) {
          seenRef.current.add(record.id);
          const summaries = await fetchEntrySummaries();
          if (cancelled) return;
          const byId = new Map(summaries.map((entry) => [entry.id, entry]));
          const entries = (record.writtenIds ?? [])
            .map((id) => byId.get(id))
            .filter((entry): entry is MemoryEntrySummary => Boolean(entry))
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              type: entry.type,
            }));
          setBatch({
            key: record.id,
            count: record.writtenCount ?? entries.length,
            entries,
          });
        }
      } catch {
        // Best effort. A card we failed to build is a missing nicety; it must
        // never surface as an error in the transcript.
      }
      if (!cancelled) setPollsLeft((remaining) => Math.max(0, remaining - 1));
    }, pollsLeft === MAX_POLLS ? 0 : POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pollsLeft, batch]);

  const dismiss = useCallback(() => setBatch(null), []);

  return { batch, dismiss };
}
