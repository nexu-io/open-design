// In-memory ring buffer of recent memory-extraction attempts.
//
// Both extractors write here:
//   - 'llm'       — the small-model extractor in `memory-llm.ts`
//   - 'heuristic' — the regex pack in `memory.ts::extractFromMessage`
//
// Both used to be entirely silent. `pickProvider()` would return null
// when no API key was configured and the LLM call would just `return []`
// with no log, no SSE, no record. The heuristic regex pack had the same
// problem: when no pattern matched the user's turn (very common for any
// non-marker message), the function returned `[]` and the user had no
// signal that the regex even looked at the message. This module lifts
// both pipelines into a typed, observable stream of records keyed by
// `kind`.
//
// Each attempt creates one record. We keep the last N (cap is small —
// this is a UX surface, not an audit log) so the settings panel can
// render "recent extractions" with phases, providers, durations, and
// links into the entries that landed on disk.
//
// We piggyback on the existing `memoryEvents` emitter under a separate
// event name (`extraction`) so the regular `change` listeners don't
// trigger an entries re-fetch on every phase update.

import { randomUUID } from 'node:crypto';
import { memoryEvents } from './memory.js';

const MAX_RECORDS = 20;
const PREVIEW_CAP = 120;
const ERROR_CAP = 240;

type ExtractionPhase = 'running' | 'skipped' | 'success' | 'failed';

interface ExtractionProvider {
  kind: string;
  model?: string;
  credentialSource?: string;
}

interface ExtractionRecord {
  id: string;
  kind: string;
  startedAt: number;
  finishedAt?: number;
  phase: ExtractionPhase;
  userMessagePreview: string;
  provider?: ExtractionProvider;
  reason?: string;
  proposedCount?: number;
  writtenCount?: number;
  writtenIds?: string[];
  error?: string;
}

const records: ExtractionRecord[] = []; // newest first

function trimPreview(s: unknown): string {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= PREVIEW_CAP) return text;
  return `${text.slice(0, PREVIEW_CAP - 1).trim()}…`;
}

function trimError(s: unknown): string {
  const text = String(s ?? '').replace(/\r?\n/g, ' ').trim();
  if (text.length <= ERROR_CAP) return text;
  return `${text.slice(0, ERROR_CAP - 1).trim()}…`;
}

function emit(record: ExtractionRecord): void {
  // Defer the emit so the caller can append a synchronous follow-up
  // update without firing two events back-to-back in the same tick.
  // Cheaper than debouncing and good enough — the SSE path on the
  // server flushes on the next event-loop turn anyway.
  setImmediate(() => {
    try {
      memoryEvents.emit('extraction', { ...record });
    } catch {
      // SSE failures are not the extractor's problem.
    }
  });
}

function clone(record: ExtractionRecord): ExtractionRecord {
  return JSON.parse(JSON.stringify(record)) as ExtractionRecord;
}

// Push a fresh record to the front and evict overflow off the back.
function pushNewest(record: ExtractionRecord): void {
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
}

// Public — start a new attempt. Returns the id; subsequent phase
// updates flow through `markRunning`, `markSuccess`, `markFailed`,
// `markSkipped`. We return only the id (not the record itself) so the
// caller can't accidentally mutate buffer state in place. `kind`
// defaults to 'llm' for backwards compat with the original single-
// writer call sites in memory-llm.ts.
export function startExtraction({ userMessage, kind = 'llm' }: { userMessage: string; kind?: string }): string {
  const record = {
    id: randomUUID(),
    kind,
    startedAt: Date.now(),
    phase: 'running' as const,
    userMessagePreview: trimPreview(userMessage),
  };
  pushNewest(record);
  emit(record);
  return record.id;
}

function findById(id: string): ExtractionRecord | null {
  return records.find((r) => r.id === id) ?? null;
}

export function markProvider(id: string, provider: ExtractionProvider): void {
  const rec = findById(id);
  if (!rec) return;
  rec.provider = {
    kind: provider.kind,
    ...(provider.model !== undefined ? { model: provider.model } : {}),
    ...(provider.credentialSource !== undefined
      ? { credentialSource: provider.credentialSource }
      : {}),
  };
  emit(rec);
}

export function markSkipped(id: string, reason: string): void {
  const rec = findById(id);
  if (!rec) return;
  rec.phase = 'skipped';
  rec.reason = reason;
  rec.finishedAt = Date.now();
  emit(rec);
}

// One-shot variant — use when we want to record a skip that never went
// through the running phase (e.g. memory disabled, empty user message,
// no provider configured). Returns the record's id so the caller can
// pass it to listExtractions consumers if needed.
export function recordSkip({
  userMessage,
  reason,
  kind = 'llm',
}: {
  userMessage: string;
  reason: string;
  kind?: string;
}): string {
  const record = {
    id: randomUUID(),
    kind,
    startedAt: Date.now(),
    finishedAt: Date.now(),
    phase: 'skipped' as const,
    reason,
    userMessagePreview: trimPreview(userMessage),
  };
  pushNewest(record);
  emit(record);
  return record.id;
}

// One-shot variant for the heuristic regex pack — synchronous, no
// streaming phases, completes in microseconds. Use this instead of
// startExtraction()/markSuccess() so the regex extractor doesn't bounce
// two SSE frames per turn (a 'running' immediately followed by
// 'success'). When `writtenCount` is 0 we record the attempt as
// 'skipped' with reason 'no-match' so the UI can colour it like the
// other skip rows ("regex looked, found nothing") instead of pretending
// the regex never ran.
export function recordHeuristic({
  userMessage,
  writtenCount,
  writtenIds,
}: {
  userMessage: string;
  writtenCount: number;
  writtenIds?: string[];
}): string {
  const written = Number.isFinite(writtenCount)
    ? Math.max(0, Math.floor(writtenCount))
    : 0;
  const ids = Array.isArray(writtenIds) ? writtenIds.slice(0, 12) : [];
  const now = Date.now();
  const phase: ExtractionPhase = written > 0 ? 'success' : 'skipped';
  const record: ExtractionRecord = {
    id: randomUUID(),
    kind: 'heuristic',
    startedAt: now,
    finishedAt: now,
    phase,
    userMessagePreview: trimPreview(userMessage),
    writtenCount: written,
    writtenIds: ids,
    ...(written === 0 ? { reason: 'no-match' } : {}),
  };
  pushNewest(record);
  emit(record);
  return record.id;
}

export function markProposed(id: string, proposedCount: number): void {
  const rec = findById(id);
  if (!rec) return;
  rec.proposedCount = proposedCount;
  emit(rec);
}

export function markSuccess(
  id: string,
  { writtenCount, writtenIds }: { writtenCount: number; writtenIds?: string[] },
): void {
  const rec = findById(id);
  if (!rec) return;
  rec.phase = 'success';
  rec.writtenCount = writtenCount;
  rec.writtenIds = Array.isArray(writtenIds) ? writtenIds.slice(0, 12) : [];
  rec.finishedAt = Date.now();
  emit(rec);
}

export function markFailed(id: string, error: unknown): void {
  const rec = findById(id);
  if (!rec) return;
  rec.phase = 'failed';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
  rec.error = trimError(message);
  rec.finishedAt = Date.now();
  emit(rec);
}

// Public — newest-first snapshot. Cloned so callers can't mutate the
// buffer through the returned reference.
export function listExtractions(): ExtractionRecord[] {
  return records.map(clone);
}

// Public — drop one record by id. Returns the count actually removed
// (0 when the id was already gone — caller still gets a 200 from the
// HTTP endpoint so a dangling double-click isn't surfaced as an error).
// Emits a synthetic `extraction` event with `phase: 'deleted'` so any
// open settings panel can drop the row immediately without a refetch.
export function removeExtraction(id: string): number {
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return 0;
  const removed = records.splice(idx, 1)[0]!;
  setImmediate(() => {
    try {
      memoryEvents.emit('extraction', { ...removed, phase: 'deleted' });
    } catch {
      // SSE failures are not the extractor's problem.
    }
  });
  return 1;
}

// Public — wipe the whole buffer. Returns the count removed. Emits a
// single `extractions-cleared` event so the UI can drop everything in
// one render rather than firing N row-level deletes.
export function clearExtractions(): number {
  const removed = records.length;
  records.length = 0;
  if (removed > 0) {
    setImmediate(() => {
      try {
        memoryEvents.emit('extraction', {
          id: 'all',
          phase: 'cleared',
          startedAt: Date.now(),
          finishedAt: Date.now(),
        });
      } catch {
        // SSE failures are not the extractor's problem.
      }
    });
  }
  return removed;
}

// Test-only — wipe the buffer. Not exported for production paths but
// the tests need a deterministic starting state.
export function __resetExtractionsForTests(): void {
  records.length = 0;
}
