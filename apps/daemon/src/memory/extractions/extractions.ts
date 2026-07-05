// @ts-nocheck
/** @module extractions/extractions
 * In-memory ring buffer of recent memory-extraction attempts, surfaced to the settings
 * panel as a live "Extraction history" feed. Both extractors write here: the small-model
 * LLM path (`llm/`) and the heuristic regex pack (`store/store.ts::extractFromMessage`).
 *
 * Each attempt produces one record with phase transitions (`running` → `success` /
 * `skipped` / `failed`). The buffer keeps the last 20 records — it is a UX surface, not
 * an audit log. Events are emitted on the `core/` change bus under the `'extraction'`
 * event name so regular `'change'` listeners do not trigger entry-list re-fetches on
 * every phase update. Depends only on `core/`; no other sibling imports it directly.
 */

import { randomUUID } from 'node:crypto';
import { memoryEvents } from '../core/index.js';

const MAX_RECORDS = 20;
const PREVIEW_CAP = 120;
const ERROR_CAP = 240;

const records = []; // newest first

/**
 * @internal
 * Cleans and truncates a string to at most `PREVIEW_CAP` characters for display in the
 * extraction history panel (collapses whitespace, appends `…` when cut).
 */
function trimPreview(s) {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= PREVIEW_CAP) return text;
  return `${text.slice(0, PREVIEW_CAP - 1).trim()}…`;
}

/**
 * @internal
 * Cleans and truncates an error message string to at most `ERROR_CAP` characters for
 * storage in the extraction record (collapses newlines, appends `…` when cut).
 */
function trimError(s) {
  const text = String(s ?? '').replace(/\r?\n/g, ' ').trim();
  if (text.length <= ERROR_CAP) return text;
  return `${text.slice(0, ERROR_CAP - 1).trim()}…`;
}

/**
 * @internal
 * Fans out a snapshot of a record on the `'extraction'` SSE channel via the core change
 * bus. Deferred with `setImmediate` so a synchronous phase sequence does not fire two
 * back-to-back SSE frames in the same event-loop tick.
 */
function emit(record) {
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

/**
 * @internal
 * Deep-clones a record via JSON round-trip so callers cannot mutate buffer state
 * through a returned reference.
 */
function clone(record) {
  return JSON.parse(JSON.stringify(record));
}

/**
 * @internal
 * Prepends a new record to the buffer and evicts the oldest entry when the buffer
 * exceeds `MAX_RECORDS`, keeping the history fixed-size.
 */
// Push a fresh record to the front and evict overflow off the back.
function pushNewest(record) {
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
}

/**
 * Starts a new extraction attempt and records it in the ring buffer with
 * `phase: 'running'`. Returns the attempt id; callers use it to drive subsequent phase
 * transitions via {@link markProvider}, {@link markSkipped}, {@link markSuccess}, or
 * {@link markFailed}. Only the id is returned (not the record) to prevent callers from
 * accidentally mutating buffer state through a direct reference.
 * @param options.userMessage - The raw user message text for the turn.
 * @param options.kind - Extractor kind: `'llm'` (default) or `'heuristic'`.
 * @returns The attempt id string (UUID).
 */
// Public — start a new attempt. Returns the id; subsequent phase
// updates flow through `markRunning`, `markSuccess`, `markFailed`,
// `markSkipped`. We return only the id (not the record itself) so the
// caller can't accidentally mutate buffer state in place. `kind`
// defaults to 'llm' for backwards compat with the original single-
// writer call sites in memory-llm.ts.
export function startExtraction({ userMessage, kind = 'llm' }) {
  const record = {
    id: randomUUID(),
    kind,
    startedAt: Date.now(),
    phase: 'running',
    userMessagePreview: trimPreview(userMessage),
  };
  pushNewest(record);
  emit(record);
  return record.id;
}

/**
 * @internal
 * Looks up a record by id in the ring buffer. Returns `null` when not found so phase
 * updates for evicted or unknown attempts are silently ignored.
 */
function findById(id) {
  return records.find((r) => r.id === id) ?? null;
}

/**
 * Records which LLM provider was selected for this attempt (kind, model, credential
 * source) so the settings panel can show "anthropic / claude-haiku-4-5 / env" next to
 * each attempt. No-ops when the id is not in the buffer.
 * @param id - Attempt id returned by {@link startExtraction}.
 * @param provider - Provider descriptor with `kind`, `model`, and `credentialSource`.
 */
export function markProvider(id, provider) {
  const rec = findById(id);
  if (!rec) return;
  rec.provider = {
    kind: provider.kind,
    model: provider.model,
    credentialSource: provider.credentialSource,
  };
  emit(rec);
}

/**
 * Transitions an in-progress attempt to `phase: 'skipped'` with a machine-readable
 * reason. Use this when the model call was never made after `startExtraction` (e.g.
 * the provider resolved but the message was empty after the initial check). For
 * attempts that never entered the running phase at all, prefer {@link recordSkip}.
 * @param id - Attempt id returned by {@link startExtraction}.
 * @param reason - Machine-readable skip reason string (e.g. `'no-provider'`).
 */
export function markSkipped(id, reason) {
  const rec = findById(id);
  if (!rec) return;
  rec.phase = 'skipped';
  rec.reason = reason;
  rec.finishedAt = Date.now();
  emit(rec);
}

/**
 * One-shot skip record for conditions that prevent the attempt from ever starting (e.g.
 * memory disabled, empty user message, no provider configured). Creates and emits a
 * `phase: 'skipped'` record in one call — more efficient than `startExtraction` +
 * `markSkipped` for early-exit paths.
 * @param options.userMessage - The raw user message for preview display.
 * @param options.reason - Machine-readable skip reason (e.g. `'memory-disabled'`).
 * @param options.kind - Extractor kind; defaults to `'llm'`.
 * @returns The new record's id.
 */
// One-shot variant — use when we want to record a skip that never went
// through the running phase (e.g. memory disabled, empty user message,
// no provider configured). Returns the record's id so the caller can
// pass it to listExtractions consumers if needed.
export function recordSkip({ userMessage, reason, kind = 'llm' }) {
  const record = {
    id: randomUUID(),
    kind,
    startedAt: Date.now(),
    finishedAt: Date.now(),
    phase: 'skipped',
    reason,
    userMessagePreview: trimPreview(userMessage),
  };
  pushNewest(record);
  emit(record);
  return record.id;
}

/**
 * One-shot record for the heuristic regex pack. Because heuristic extraction is
 * synchronous and completes in microseconds, using `startExtraction` + `markSuccess`
 * would emit two back-to-back SSE frames per turn. This variant creates a single record
 * in its final state. A zero `writtenCount` becomes `phase: 'skipped'` with
 * `reason: 'no-match'` so the UI can colour it like other skip rows rather than omitting
 * the turn from history entirely.
 * @param options.userMessage - The raw user message for preview display.
 * @param options.writtenCount - Number of entries written to the store.
 * @param options.writtenIds - Ids of the entries written (capped to 12).
 * @returns The new record's id.
 */
// One-shot variant for the heuristic regex pack — synchronous, no
// streaming phases, completes in microseconds. Use this instead of
// startExtraction()/markSuccess() so the regex extractor doesn't bounce
// two SSE frames per turn (a 'running' immediately followed by
// 'success'). When `writtenCount` is 0 we record the attempt as
// 'skipped' with reason 'no-match' so the UI can colour it like the
// other skip rows ("regex looked, found nothing") instead of pretending
// the regex never ran.
export function recordHeuristic({ userMessage, writtenCount, writtenIds }) {
  const written = Number.isFinite(writtenCount)
    ? Math.max(0, Math.floor(writtenCount))
    : 0;
  const ids = Array.isArray(writtenIds) ? writtenIds.slice(0, 12) : [];
  const now = Date.now();
  const record = {
    id: randomUUID(),
    kind: 'heuristic',
    startedAt: now,
    finishedAt: now,
    phase: written > 0 ? 'success' : 'skipped',
    userMessagePreview: trimPreview(userMessage),
    writtenCount: written,
    writtenIds: ids,
    ...(written === 0 ? { reason: 'no-match' } : {}),
  };
  pushNewest(record);
  emit(record);
  return record.id;
}

/**
 * Records the number of candidate facts the model proposed before deduplication and
 * write filtering. Updates the ring buffer record in-place and fans out an SSE event
 * so the settings panel can show an intermediate "N proposed" indicator.
 * @param id - Attempt id returned by {@link startExtraction}.
 * @param proposedCount - Total candidates returned by the model, including duplicates.
 */
export function markProposed(id, proposedCount) {
  const rec = findById(id);
  if (!rec) return;
  rec.proposedCount = proposedCount;
  emit(rec);
}

/**
 * Transitions an attempt to `phase: 'success'` with the final write count and entry ids.
 * `writtenCount` may be 0 (model returned no new facts) — the attempt still succeeds
 * because the model call itself completed without error.
 * @param id - Attempt id returned by {@link startExtraction}.
 * @param options.writtenCount - Number of entries actually written to the store.
 * @param options.writtenIds - Ids of the entries written (capped to 12).
 */
export function markSuccess(id, { writtenCount, writtenIds }) {
  const rec = findById(id);
  if (!rec) return;
  rec.phase = 'success';
  rec.writtenCount = writtenCount;
  rec.writtenIds = Array.isArray(writtenIds) ? writtenIds.slice(0, 12) : [];
  rec.finishedAt = Date.now();
  emit(rec);
}

/**
 * Transitions an attempt to `phase: 'failed'` with a trimmed error message string.
 * The error is truncated to `ERROR_CAP` characters so one long stack trace does not
 * bloat the ring buffer or the SSE payload.
 * @param id - Attempt id returned by {@link startExtraction}.
 * @param error - The thrown error or an error message string.
 */
export function markFailed(id, error) {
  const rec = findById(id);
  if (!rec) return;
  rec.phase = 'failed';
  rec.error = trimError(error?.message ?? error ?? 'unknown error');
  rec.finishedAt = Date.now();
  emit(rec);
}

/**
 * Returns a newest-first snapshot of all records in the ring buffer. Each record is
 * deep-cloned so callers cannot mutate buffer state through the returned references.
 * Consumed by `GET /api/memory/extractions` to power the settings panel history list.
 */
// Public — newest-first snapshot. Cloned so callers can't mutate the
// buffer through the returned reference.
export function listExtractions() {
  return records.map(clone);
}

/**
 * Removes a single record by id from the ring buffer and emits a synthetic
 * `phase: 'deleted'` event so any open settings panel can drop the row immediately
 * without a re-fetch. Returns 0 when the id is not in the buffer (idempotent — a
 * double-click on the dismiss button does not produce an error).
 * @param id - The extraction record id to remove.
 * @returns 1 if the record was found and removed, 0 if it was already gone.
 */
// Public — drop one record by id. Returns the count actually removed
// (0 when the id was already gone — caller still gets a 200 from the
// HTTP endpoint so a dangling double-click isn't surfaced as an error).
// Emits a synthetic `extraction` event with `phase: 'deleted'` so any
// open settings panel can drop the row immediately without a refetch.
export function removeExtraction(id) {
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return 0;
  const [removed] = records.splice(idx, 1);
  setImmediate(() => {
    try {
      memoryEvents.emit('extraction', { ...removed, phase: 'deleted' });
    } catch {
      // SSE failures are not the extractor's problem.
    }
  });
  return 1;
}

/**
 * Clears the entire ring buffer and emits a single `phase: 'cleared'` event so the
 * settings panel can drop all rows in one render pass rather than firing N individual
 * delete events. Returns the number of records removed.
 */
// Public — wipe the whole buffer. Returns the count removed. Emits a
// single `extractions-cleared` event so the UI can drop everything in
// one render rather than firing N row-level deletes.
export function clearExtractions() {
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

/**
 * Wipes the ring buffer without emitting events. Intended only for test setup so each
 * test case starts from a deterministic empty state.
 */
// Test-only — wipe the buffer. Not exported for production paths but
// the tests need a deterministic starting state.
export function __resetExtractionsForTests() {
  records.length = 0;
}
