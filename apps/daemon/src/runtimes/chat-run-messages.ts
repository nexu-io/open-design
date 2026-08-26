import { performance } from 'node:perf_hooks';
import type Database from 'better-sqlite3';
import type { PersistedAgentEvent } from '@open-design/contracts';
import type { RunFinishedProps } from '@open-design/contracts/analytics';
import {
  appendMessageAgentEvents,
  clearMessageAgentEventBatches,
  finalizeMessageAgentEvents,
  upsertMessage,
} from '../db.js';
import { runAttemptAnchor, type RunAttemptAnchor } from '../run-lifecycle-tracer.js';

type SqliteDb = Database.Database;

type ChatRunMessageState = {
  id: string;
  assistantMessageId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  status?: string;
  createdAt?: number;
  // Per-attempt clock anchor. `createdAt` is the logical run start and never
  // moves, so on a same-run retry (which reuses the run object) only these two
  // say when the attempt actually running began (#7300).
  analyticsTelemetry?: { attemptStartedAt?: number; attemptIndex?: number } | null;
  retryAttemptCount?: number | null;
  sessionMode?: string | null;
  context?: Record<string, unknown> | null;
  error?: string | null;
  errorCode?: string | null;
  failureCategory?: string | null;
  failureDetail?: string | null;
};

type PendingMessageEvents = {
  db: SqliteDb;
  messageId: string;
  events: PersistedAgentEvent[];
  chars: number;
  timer: ReturnType<typeof setTimeout> | null;
};

export type RunMessageEventPersistenceTelemetry = {
  storageMode: 'append_only';
  inputEventCount: number;
  deltaEventCount: number;
  inputCharCount: number;
  flushCount: number;
  batchEventCount: number;
  persistedEventCount: number;
  flushTotalMs: number;
  flushMaxMs: number;
  pendingCharPeak: number;
  finalizeCount: number;
  finalizeTotalMs: number;
  finalizeMaxMs: number;
  finalEventCount: number;
  persistenceErrorCount: number;
  // The attempt clock's own persistence, counted separately from message
  // events. The row's `attempt_*` pair is what a refresh renders as elapsed
  // time, so a rejected write here is a user-visible defect (the cumulative
  // clock comes back), not a missing analytics field.
  attemptAnchorErrorCount: number;
  attemptAnchorRepairCount: number;
};

type RunMessageEventPersistenceAnalytics = Pick<
  RunFinishedProps,
  | 'message_event_storage_mode'
  | 'message_event_input_count'
  | 'message_event_delta_count'
  | 'message_event_input_char_count'
  | 'message_event_flush_count'
  | 'message_event_batch_event_count'
  | 'message_event_persisted_count'
  | 'message_event_flush_total_ms'
  | 'message_event_flush_max_ms'
  | 'message_event_pending_char_peak'
  | 'message_event_finalize_count'
  | 'message_event_finalize_total_ms'
  | 'message_event_finalize_max_ms'
  | 'message_event_final_event_count'
  | 'message_event_persistence_error_count'
  | 'message_event_attempt_anchor_error_count'
  | 'message_event_attempt_anchor_repair_count'
  | 'message_event_attempt_anchor_pending'
>;

export const RUN_MESSAGE_EVENT_FLUSH_INTERVAL_MS = 250;
const RUN_MESSAGE_EVENT_FLUSH_CHARS = 64 * 1024;
const pendingMessageEvents = new WeakMap<ChatRunMessageState, PendingMessageEvents>();
const finalizedInputEventCounts = new WeakMap<ChatRunMessageState, number>();
const messageEventPersistenceTelemetry = new WeakMap<
  ChatRunMessageState,
  RunMessageEventPersistenceTelemetry
>();
/**
 * Anchors the database refused, kept so the next durable boundary can land
 * them. Present means the transcript row is BEHIND what the run reports; empty
 * means the two agree.
 */
const pendingAttemptAnchors = new WeakMap<ChatRunMessageState, RunAttemptAnchor>();
/** One warning per run: a broken database would otherwise log per event. */
const attemptAnchorFaultWarned = new WeakSet<ChatRunMessageState>();

function ensureRunMessageEventPersistenceTelemetry(
  run: ChatRunMessageState,
): RunMessageEventPersistenceTelemetry {
  let telemetry = messageEventPersistenceTelemetry.get(run);
  if (!telemetry) {
    telemetry = {
      storageMode: 'append_only',
      inputEventCount: 0,
      deltaEventCount: 0,
      inputCharCount: 0,
      flushCount: 0,
      batchEventCount: 0,
      persistedEventCount: 0,
      flushTotalMs: 0,
      flushMaxMs: 0,
      pendingCharPeak: 0,
      finalizeCount: 0,
      finalizeTotalMs: 0,
      finalizeMaxMs: 0,
      finalEventCount: 0,
      persistenceErrorCount: 0,
      attemptAnchorErrorCount: 0,
      attemptAnchorRepairCount: 0,
    };
    messageEventPersistenceTelemetry.set(run, telemetry);
  }
  return telemetry;
}

export function readRunMessageEventPersistenceTelemetry(
  run: ChatRunMessageState,
): RunMessageEventPersistenceTelemetry | null {
  const telemetry = messageEventPersistenceTelemetry.get(run);
  return telemetry ? { ...telemetry } : null;
}

export function runMessageEventPersistenceAnalytics(
  run: ChatRunMessageState,
): RunMessageEventPersistenceAnalytics | Record<string, never> {
  const telemetry = readRunMessageEventPersistenceTelemetry(run);
  if (!telemetry) return {};
  return {
    message_event_storage_mode: telemetry.storageMode,
    message_event_input_count: telemetry.inputEventCount,
    message_event_delta_count: telemetry.deltaEventCount,
    message_event_input_char_count: telemetry.inputCharCount,
    message_event_flush_count: telemetry.flushCount,
    message_event_batch_event_count: telemetry.batchEventCount,
    message_event_persisted_count: telemetry.persistedEventCount,
    message_event_flush_total_ms: Math.round(telemetry.flushTotalMs),
    message_event_flush_max_ms: Math.round(telemetry.flushMaxMs),
    message_event_pending_char_peak: telemetry.pendingCharPeak,
    message_event_finalize_count: telemetry.finalizeCount,
    message_event_finalize_total_ms: Math.round(telemetry.finalizeTotalMs),
    message_event_finalize_max_ms: Math.round(telemetry.finalizeMaxMs),
    message_event_final_event_count: telemetry.finalEventCount,
    message_event_persistence_error_count: telemetry.persistenceErrorCount,
    message_event_attempt_anchor_error_count: telemetry.attemptAnchorErrorCount,
    message_event_attempt_anchor_repair_count: telemetry.attemptAnchorRepairCount,
    message_event_attempt_anchor_pending: pendingAttemptAnchors.has(run),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function persistRunEventToAssistantMessage(
  db: SqliteDb,
  run: ChatRunMessageState,
  event: string,
  data: unknown,
): void {
  if (!run.assistantMessageId) return;
  // `start` is the only frame emitted once per ATTEMPT, so it is the boundary
  // at which the persisted attempt anchor has to move. The claim in
  // pinAssistantMessageOnRunCreate runs once per run (create/resume), not per
  // attempt, and an automatic same-run retry re-enters startChatRun without
  // re-claiming — so without this the row would keep attempt 0's anchor and a
  // reloaded client would fall back to the cumulative run clock (#7300).
  // Reading the anchor off the frame itself is deliberate: the SSE payload and
  // the persisted row are then the same number by construction, so a refresh
  // cannot make the clock jump.
  if (event === 'start') {
    stampAssistantMessageAttemptStart(db, run, run.assistantMessageId, data);
  }
  // Cheapest boundary that recurs during a live attempt: if an earlier anchor
  // write was rejected, land it now rather than leaving the transcript a whole
  // attempt behind the status the same client is polling.
  retryPendingAttemptAnchor(db, run);
  const persisted = runSseEventToPersistedAgentEvent(event, data);
  if (!persisted) {
    if (event === 'end' || event === 'close') flushRunMessageEvents(run);
    return;
  }

  let pending = pendingMessageEvents.get(run);
  if (pending && (pending.db !== db || pending.messageId !== run.assistantMessageId)) {
    flushRunMessageEvents(run);
    pending = undefined;
  }
  if (!pending) {
    pending = {
      db,
      messageId: run.assistantMessageId,
      events: [],
      chars: 0,
      timer: null,
    };
    pendingMessageEvents.set(run, pending);
  }
  const telemetry = ensureRunMessageEventPersistenceTelemetry(run);
  const isDelta = persisted.kind === 'text' || persisted.kind === 'thinking';
  const eventChars = isDelta ? persisted.text.length : JSON.stringify(persisted).length;
  telemetry.inputEventCount += 1;
  telemetry.inputCharCount += eventChars;
  if (isDelta) telemetry.deltaEventCount += 1;
  appendPendingMessageEvent(pending, persisted);
  telemetry.pendingCharPeak = Math.max(telemetry.pendingCharPeak, pending.chars);

  if (!isDelta || pending.chars >= RUN_MESSAGE_EVENT_FLUSH_CHARS) {
    flushRunMessageEvents(run);
    return;
  }
  if (!pending.timer) {
    pending.timer = setTimeout(() => {
      flushRunMessageEvents(run);
    }, RUN_MESSAGE_EVENT_FLUSH_INTERVAL_MS);
    pending.timer.unref?.();
  }
}

/**
 * Advance the assistant row's per-attempt clock anchor.
 *
 * Invariant: `attempt_started_at` only ever moves FORWARD. `started_at` stays
 * pinned to the run's first attempt (the claim's `CASE WHEN` guarantees that),
 * so these two columns together let a client answer both "when did the user
 * ask for this?" and "how long has the attempt on screen been running?".
 *
 * The monotonic guard is on the timestamp rather than the index because a
 * manual resume resets the attempt index back to 0 while still starting a
 * genuinely later attempt.
 *
 * Idempotent by construction: re-writing the anchor the row already holds is
 * allowed by the `<=` guard and stores identical values. Both writers rely on
 * that — the attempt boundary is persisted the moment it is opened, and the
 * `start` frame that follows writes the same pair again.
 */
function writeAssistantMessageAttemptAnchor(
  db: SqliteDb,
  messageId: string,
  anchor: RunAttemptAnchor,
): { ok: true } | { ok: false; error: unknown } {
  try {
    db.prepare(
      `UPDATE messages
          SET attempt_started_at = ?, attempt_index = ?
        WHERE id = ?
          AND (attempt_started_at IS NULL OR attempt_started_at <= ?)`,
    ).run(anchor.attemptStartedAt, anchor.attemptIndex, messageId, anchor.attemptStartedAt);
    return { ok: true };
  } catch (error) {
    // Reported, never thrown: see recordAttemptAnchorFault for why no call site
    // here can afford an exception.
    return { ok: false, error };
  }
}

/**
 * Record a rejected anchor write so it is neither lost nor fatal.
 *
 * The write itself is PRODUCT behaviour: the row's `attempt_*` pair is what a
 * refresh renders as elapsed time, so dropping it silently puts the cumulative
 * "running for 171 minutes" clock back on screen. It therefore gets a retry and
 * a counter rather than a `console.warn` and a shrug.
 *
 * It still must not throw. Every writer sits on the run's critical path — the
 * retry timer callback and the `send` choke point every stream event passes
 * through — so propagating a database error here would cost the user the whole
 * run to save a timestamp. The bookkeeping below is the only part that is
 * telemetry, and it is contained to itself for the same reason.
 */
function recordAttemptAnchorFault(
  run: ChatRunMessageState,
  messageId: string,
  anchor: RunAttemptAnchor,
  err: unknown,
): void {
  try {
    pendingAttemptAnchors.set(run, anchor);
    ensureRunMessageEventPersistenceTelemetry(run).attemptAnchorErrorCount += 1;
    if (attemptAnchorFaultWarned.has(run)) return;
    attemptAnchorFaultWarned.add(run);
    console.warn(
      `[runs] attempt clock persistence failed for message ${messageId}; the transcript clock will be repaired at the next durable boundary`,
      err,
    );
  } catch {
    // Bookkeeping must never be the thing that breaks a run.
  }
}

/** Apply an anchor and, on failure, queue it for the next durable boundary. */
function writeRunAttemptAnchor(
  db: SqliteDb,
  run: ChatRunMessageState,
  messageId: string,
  anchor: RunAttemptAnchor,
): void {
  const result = writeAssistantMessageAttemptAnchor(db, messageId, anchor);
  if (result.ok) {
    pendingAttemptAnchors.delete(run);
    return;
  }
  recordAttemptAnchorFault(run, messageId, anchor, result.error);
}

/**
 * Land an anchor an earlier write could not.
 *
 * Called from the boundaries the run already crosses on its own — every
 * persisted event, and the terminal finalize — so a transient database failure
 * heals within one event instead of leaving the transcript permanently one
 * attempt behind what `/api/runs/:id` reports. A no-op (one WeakMap lookup)
 * when nothing is pending, which is every run that has not hit a fault.
 */
function retryPendingAttemptAnchor(db: SqliteDb, run: ChatRunMessageState): void {
  const pending = pendingAttemptAnchors.get(run);
  if (!pending || !run.assistantMessageId) return;
  // Still refused: keep it queued for the next boundary. The fault was already
  // counted and warned about when it was first observed.
  if (!writeAssistantMessageAttemptAnchor(db, run.assistantMessageId, pending).ok) return;
  pendingAttemptAnchors.delete(run);
  try {
    ensureRunMessageEventPersistenceTelemetry(run).attemptAnchorRepairCount += 1;
  } catch {
    // See recordAttemptAnchorFault: counters never gate the repair.
  }
}

function stampAssistantMessageAttemptStart(
  db: SqliteDb,
  run: ChatRunMessageState,
  messageId: string,
  data: unknown,
): void {
  if (!isRecord(data)) return;
  const attemptStartedAt = data.attemptStartedAt;
  if (typeof attemptStartedAt !== 'number' || !Number.isFinite(attemptStartedAt)) return;
  const attemptIndex =
    typeof data.attemptIndex === 'number' && Number.isFinite(data.attemptIndex)
      ? data.attemptIndex
      : 0;
  writeRunAttemptAnchor(db, run, messageId, { attemptStartedAt, attemptIndex });
}

/**
 * Persist the run's CURRENT attempt anchor to its assistant row.
 *
 * Called when an attempt boundary is opened, which for an automatic same-run
 * retry is the respawn — not the `start` frame that follows it once the child
 * is up. Between those two moments the run object already reports the new
 * attempt, so leaving the row behind would let a refresh or a reattach read the
 * previous attempt's anchor and then watch the clock jump when `start` lands.
 * The `start` write stays as the transport-of-record for the anchor and is a
 * no-op when this already stored the same pair.
 */
export function persistRunAttemptAnchor(db: SqliteDb, run: ChatRunMessageState): void {
  if (!run.assistantMessageId) return;
  const anchor = runAttemptAnchor(run);
  if (!anchor) return;
  writeRunAttemptAnchor(db, run, run.assistantMessageId, anchor);
}

function appendPendingMessageEvent(
  pending: PendingMessageEvents,
  event: PersistedAgentEvent,
): void {
  const last = pending.events[pending.events.length - 1];
  if (
    (event.kind === 'text' || event.kind === 'thinking') &&
    last?.kind === event.kind
  ) {
    last.text += event.text;
  } else {
    pending.events.push(event);
  }
  pending.chars += event.kind === 'text' || event.kind === 'thinking'
    ? event.text.length
    : JSON.stringify(event).length;
}

export function flushRunMessageEvents(run: ChatRunMessageState): void {
  const pending = pendingMessageEvents.get(run);
  if (!pending) return;
  pendingMessageEvents.delete(run);
  if (pending.timer) clearTimeout(pending.timer);
  if (pending.events.length === 0) return;
  const telemetry = ensureRunMessageEventPersistenceTelemetry(run);
  telemetry.flushCount += 1;
  telemetry.batchEventCount += pending.events.length;
  const startedAt = performance.now();
  try {
    const events = appendMessageAgentEvents(pending.db, pending.messageId, pending.events);
    if (events) telemetry.persistedEventCount += events.length;
  } catch (err) {
    telemetry.persistenceErrorCount += 1;
    console.warn('[runs] message event persistence failed', err);
  } finally {
    const durationMs = Math.max(0, performance.now() - startedAt);
    telemetry.flushTotalMs += durationMs;
    telemetry.flushMaxMs = Math.max(telemetry.flushMaxMs, durationMs);
  }
}

export function finalizeRunMessageEvents(
  db: SqliteDb,
  run: ChatRunMessageState,
): void {
  flushRunMessageEvents(run);
  if (!run.assistantMessageId) return;
  // Terminal boundary: the run will not emit another event, so this is the last
  // moment a rejected anchor can still reach the row a reload will render.
  retryPendingAttemptAnchor(db, run);
  const telemetry = ensureRunMessageEventPersistenceTelemetry(run);
  if (finalizedInputEventCounts.get(run) === telemetry.inputEventCount) return;
  telemetry.finalizeCount += 1;
  const startedAt = performance.now();
  try {
    const events = finalizeMessageAgentEvents(db, run.assistantMessageId);
    if (events) {
      telemetry.persistedEventCount = events.length;
      telemetry.finalEventCount = events.length;
    }
    finalizedInputEventCounts.set(run, telemetry.inputEventCount);
  } catch (err) {
    telemetry.persistenceErrorCount += 1;
    console.warn('[runs] message event finalization failed', err);
  } finally {
    const durationMs = Math.max(0, performance.now() - startedAt);
    telemetry.finalizeTotalMs += durationMs;
    telemetry.finalizeMaxMs = Math.max(telemetry.finalizeMaxMs, durationMs);
  }
}

/**
 * Stamp the daemon's finalize-time failure classification onto the persisted
 * assistant message so a reload — or any consumer that reads the stored
 * message instead of the live SSE stream — still sees the fine-grained cause.
 *
 * The `error` SSE frame is emitted from the child-close handler BEFORE the run
 * is finalized, so `failureCategory` / `failureDetail` (computed at finalize)
 * aren't known when that frame is first persisted. This enriches the last
 * persisted `status:error` event in place once the classification exists, and
 * appends one only if a failed run somehow never persisted an error frame.
 * Without this, a daemon-persisted failure (no live web error handler saving
 * the message, or a conversation reloaded before that save) falls back to the
 * coarse `errorCode` UI and loses the specific fix guidance.
 */
export function persistRunFailureClassification(
  db: SqliteDb,
  run: ChatRunMessageState,
): void {
  if (!run.assistantMessageId) return;
  const failureCategory = run.failureCategory ?? null;
  const failureDetail = run.failureDetail ?? null;
  if (!failureCategory && !failureDetail) return;
  try {
    finalizeRunMessageEvents(db, run);
    const row = db
      .prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get(run.assistantMessageId) as { eventsJson?: string } | undefined;
    if (!row) return;
    let events: unknown[] = [];
    try {
      const parsed = JSON.parse(row.eventsJson ?? '[]');
      if (Array.isArray(parsed)) events = parsed;
    } catch {
      events = [];
    }
    let idx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (isRecord(event) && event.kind === 'status' && event.label === 'error') {
        idx = i;
        break;
      }
    }
    const existing = idx >= 0 ? events[idx] : null;
    const base: Record<string, unknown> = isRecord(existing)
      ? existing
      : { kind: 'status', label: 'error' };
    const enriched: Record<string, unknown> = {
      ...base,
      ...(failureCategory ? { failureCategory } : {}),
      ...(failureDetail ? { failureDetail } : {}),
    };
    if (run.errorCode && typeof enriched.code !== 'string') enriched.code = run.errorCode;
    if (idx >= 0) {
      if (JSON.stringify(enriched) === JSON.stringify(events[idx])) return;
      events[idx] = enriched;
    } else {
      if (run.error && typeof enriched.detail !== 'string') enriched.detail = run.error;
      events.push(enriched);
    }
    db.prepare(`UPDATE messages SET events_json = ? WHERE id = ?`).run(
      JSON.stringify(events),
      run.assistantMessageId,
    );
    const telemetry = ensureRunMessageEventPersistenceTelemetry(run);
    telemetry.persistedEventCount = events.length;
    telemetry.finalEventCount = events.length;
  } catch (err) {
    console.warn('[runs] failure classification persistence failed', err);
  }
}

export function runSseEventToPersistedAgentEvent(
  event: string,
  data: unknown,
): PersistedAgentEvent | null {
  const record = isRecord(data) ? data : {};
  if (event === 'start') {
    return {
      kind: 'status',
      label: 'starting',
      ...(typeof record.bin === 'string' ? { detail: record.bin } : {}),
    };
  }
  if (event === 'stdout') {
    const chunk = typeof record.chunk === 'string' ? record.chunk : '';
    return chunk ? { kind: 'text', text: chunk } : null;
  }
  if (event === 'error') {
    const error = isRecord(record.error) ? record.error : {};
    const message = typeof error.message === 'string'
      ? error.message
      : typeof record.message === 'string'
        ? record.message
        : '';
    return {
      kind: 'status',
      label: 'error',
      ...(message ? { detail: message } : {}),
      ...(typeof error.code === 'string' ? { code: error.code } : {}),
    };
  }
  if (event !== 'agent') return null;
  return daemonAgentPayloadToPersistedAgentEvent(record);
}

/**
 * ACP status labels that are purely protocol-internal. They carry no
 * user-visible detail and must be suppressed at persistence time so that
 * history replay doesn't render empty expandable rows in the assistant
 * process panel.
 */
const TRANSIENT_ACP_PERSISTED_STATUS_LABELS = new Set([
  'waiting_for_first_output',
  'tool_call',
  'tool_call_update',
  'session_update',
]);

export function daemonAgentPayloadToPersistedAgentEvent(data: unknown): PersistedAgentEvent | null {
  if (!isRecord(data)) return null;
  const type = data.type;
  if (type === 'status' && typeof data.label === 'string') {
    // Filter out transient ACP status events that carry no user-visible content.
    // The web-side translateAgentEvent already normalizes these for live display,
    // but the daemon must also suppress them at persistence time so history replay
    // doesn't show empty expandable rows labelled "tool_call" or "tool_call_update".
    if (TRANSIENT_ACP_PERSISTED_STATUS_LABELS.has(data.label)) return null;
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.model === 'string'
          ? data.model
          : typeof data.ttftMs === 'number'
            ? `first token in ${Math.round(data.ttftMs / 100) / 10}s`
            : undefined;
    return { kind: 'status', label: data.label, ...(detail ? { detail } : {}) };
  }
  if (type === 'text_delta' && typeof data.delta === 'string') {
    return { kind: 'text', text: data.delta };
  }
  if (type === 'conversation_title' && typeof data.title === 'string') {
    return { kind: 'conversation_title', title: data.title };
  }
  if (type === 'thinking_delta' && typeof data.delta === 'string') {
    return { kind: 'thinking', text: data.delta };
  }
  if (type === 'thinking_start') return { kind: 'status', label: 'thinking' };
  if (type === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: liveArtifactAction(data.action),
      projectId: stringValue(data.projectId),
      artifactId: stringValue(data.artifactId),
      title: stringValue(data.title),
      ...(typeof data.refreshStatus === 'string' ? { refreshStatus: data.refreshStatus } : {}),
    };
  }
  if (type === 'live_artifact_refresh') {
    return {
      kind: 'live_artifact_refresh',
      phase: liveArtifactRefreshPhase(data.phase),
      projectId: stringValue(data.projectId),
      artifactId: stringValue(data.artifactId),
      ...(typeof data.refreshId === 'string' ? { refreshId: data.refreshId } : {}),
      ...(typeof data.title === 'string' ? { title: data.title } : {}),
      ...(typeof data.refreshedSourceCount === 'number'
        ? { refreshedSourceCount: data.refreshedSourceCount }
        : {}),
      ...(typeof data.error === 'string' ? { error: data.error } : {}),
    };
  }
  if (type === 'tool_use' && typeof data.id === 'string' && typeof data.name === 'string') {
    return {
      kind: 'tool_use',
      id: data.id,
      name: data.name,
      input: normalizePersistedToolInput(data.input),
      ...(typeof data.startedAt === 'number' && Number.isFinite(data.startedAt)
        ? { startedAt: data.startedAt }
        : {}),
    };
  }
  if (type === 'tool_input_delta') return null;
  if (type === 'tool_result' && typeof data.toolUseId === 'string') {
    return {
      kind: 'tool_result',
      toolUseId: data.toolUseId,
      content: String(data.content ?? ''),
      isError: Boolean(data.isError),
    };
  }
  if (type === 'usage') {
    const usage = isRecord(data.usage) ? data.usage : {};
    return {
      kind: 'usage',
      ...(typeof usage.input_tokens === 'number' ? { inputTokens: usage.input_tokens } : {}),
      ...(typeof usage.output_tokens === 'number' ? { outputTokens: usage.output_tokens } : {}),
      ...(typeof data.costUsd === 'number' ? { costUsd: data.costUsd } : {}),
      ...(typeof data.durationMs === 'number' ? { durationMs: data.durationMs } : {}),
      // Persist the terminal stop reason so the project projection can read a
      // max_tokens truncation as incomplete after reload (#1247 / #1060).
      ...(typeof data.stopReason === 'string' ? { stopReason: data.stopReason } : {}),
    };
  }
  if (type === 'diagnostic' && typeof data.name === 'string') {
    return {
      kind: 'diagnostic',
      name: data.name,
      ...(typeof data.source === 'string' ? { source: data.source } : {}),
      ...(typeof data.elapsedMs === 'number' ? { elapsedMs: data.elapsedMs } : {}),
      ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
      ...(typeof data.suppressedChars === 'number' ? { suppressedChars: data.suppressedChars } : {}),
      ...(typeof data.suppressedChunks === 'number' ? { suppressedChunks: data.suppressedChunks } : {}),
      ...(typeof data.openedBlocks === 'number' ? { openedBlocks: data.openedBlocks } : {}),
      ...(typeof data.closedBlocks === 'number' ? { closedBlocks: data.closedBlocks } : {}),
      ...(typeof data.fileCount === 'number' ? { fileCount: data.fileCount } : {}),
      ...(Array.isArray(data.files) ? { files: data.files.filter((file) => typeof file === 'string').slice(0, 8) } : {}),
      ...(typeof data.pendingCandidateChars === 'number'
        ? { pendingCandidateChars: data.pendingCandidateChars }
        : {}),
      ...(typeof data.suppressing === 'boolean' ? { suppressing: data.suppressing } : {}),
      ...(isRecord(data.shape) ? { shape: data.shape } : {}),
    };
  }
  if (type === 'fabricated_role_marker' && typeof data.marker === 'string') {
    return {
      kind: 'status',
      label: 'warning',
      detail: `Model emitted fabricated role marker ("${data.marker}"). Response was truncated at this point to prevent unauthorized instruction injection. See issue #3247.`,
    };
  }
  if (type === 'tool_loop' && typeof data.toolName === 'string') {
    const toolName = data.toolName;
    const count = typeof data.count === 'number' ? data.count : 0;
    const detail =
      data.action === 'halt'
        ? `Run stopped: the agent repeated a failing ${toolName} call ${count}× without progress. Re-check the actual target before retrying.`
        : `Heads up — the agent has repeated a failing ${toolName} call ${count}× and may be stuck.`;
    return { kind: 'status', label: 'warning', detail };
  }
  if (type === 'raw' && typeof data.line === 'string') return { kind: 'raw', line: data.line };
  return null;
}

function normalizePersistedToolInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  if (typeof input.filePath === 'string') {
    return { ...input, file_path: input.filePath };
  }
  return input;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function liveArtifactAction(value: unknown): 'created' | 'updated' | 'deleted' {
  return value === 'created' || value === 'deleted' ? value : 'updated';
}

function liveArtifactRefreshPhase(value: unknown): 'started' | 'succeeded' | 'failed' {
  if (value === 'started' || value === 'succeeded' || value === 'failed') return value;
  return 'started';
}

/**
 * The attempt anchor a claim can vouch for, or nothing.
 *
 * Kept as a pair: an index without a timestamp would describe an attempt the
 * row has no start time for, which is worse than saying nothing at all.
 */
function claimAttemptAnchor(
  run: ChatRunMessageState,
): { attemptStartedAt: number; attemptIndex: number } | Record<string, never> {
  return runAttemptAnchor(run) ?? {};
}

export function pinAssistantMessageOnRunCreate(
  db: SqliteDb,
  run: ChatRunMessageState,
  opts?: {
    status?: string;
    beforeFreshInsert?: () => void;
    beforeClaimCommit?: () => void;
    isRunActive?: (runId: string) => boolean;
  },
): { ok: boolean; reason?: 'active' | 'scope' } {
  // Headless / omit-pin runs with no assistant message have nothing to claim.
  if (!run.conversationId || !run.assistantMessageId) return { ok: true };

  // A resume claim writes the post-restart intent (queued) while the run
  // object is still terminal (failed) — prepareRestart flips it afterwards
  // (#6418).
  const claimStatus = opts?.status ?? run.status;

  // Atomic ownership claim (#6418). The claim is a single conditional UPDATE
  // inside an immediate transaction: the create -> claim stretch is synchronous
  // on the single better-sqlite3 connection, so two concurrent runs sharing an
  // assistantMessageId can never both claim the row. `changes > 0` means THIS
  // run owns the message; `0` means another active run holds it (or it is out
  // of scope) and the run must not start — the caller drops the just-created
  // run and rejects the request.
  const claim = db.transaction((): { ok: boolean; reason?: 'active' | 'scope' } => {
    const existing = db
      .prepare(
        `SELECT run_id AS runId, run_status AS runStatus, role, conversation_id AS conversationId
           FROM messages WHERE id = ?`,
      )
      .get(run.assistantMessageId) as
      | { runId: string | null; runStatus: string | null; role: string; conversationId: string }
      | undefined;
    if (!existing) {
      // Fresh id: insert the assistant row bound to this run (we own it).
      opts?.beforeFreshInsert?.();
      opts?.beforeClaimCommit?.();
      upsertMessage(db, run.conversationId!, {
        id: run.assistantMessageId!,
        role: 'assistant',
        content: '',
        agentId: run.agentId ?? undefined,
        events: [],
        runId: run.id,
        runStatus: claimStatus,
        sessionMode: run.sessionMode ?? undefined,
        runContext: run.context ?? undefined,
        startedAt: run.createdAt,
        // Seed the attempt anchor when the run already has one (a resume claim
        // does). A fresh run has not stamped its attempt boundary yet at claim
        // time — the `start` frame does that a moment later.
        ...claimAttemptAnchor(run),
      });
      return { ok: true };
    }
    // Scope guard (defense in depth; the route pre-filters these cases).
    if (existing.role !== 'assistant' || existing.conversationId !== run.conversationId) {
      return { ok: false, reason: 'scope' };
    }
    const isSameRun = existing.runId === run.id;
    const activeLookingExistingRun =
      existing.runId !== null &&
      !isSameRun &&
      (existing.runStatus === 'queued' || existing.runStatus === 'running');
    const existingRunStillActive =
      activeLookingExistingRun &&
      (opts?.isRunActive ? opts.isRunActive(existing.runId!) : true);
    // Clean early verdict for the common concurrency case (the UPDATE's WHERE
    // gate below re-asserts it at the DB level so the guarantee survives
    // refactors).
    if (existingRunStillActive) {
      return { ok: false, reason: 'active' };
    }
    const allowStaleActiveRebind = activeLookingExistingRun && !existingRunStillActive;
    const result = db.prepare(
      `UPDATE messages
          SET run_id = ?,
              run_status = ?,
              session_mode = ?,
              run_context_json = ?,
              events_json = CASE WHEN run_id = ? THEN events_json ELSE NULL END,
              content = CASE WHEN run_id = ? OR run_id IS NULL THEN content ELSE '' END,
              ended_at = NULL,
              last_run_event_id = CASE WHEN run_id = ? THEN last_run_event_id ELSE NULL END,
              started_at = CASE
                WHEN run_id = ? THEN started_at
                WHEN ? THEN COALESCE(started_at, ?)
                ELSE ?
              END,
              -- Unlike started_at (deliberately pinned to the first attempt),
              -- the attempt anchor must ADVANCE: COALESCE keeps the stored
              -- value when this claim has nothing newer to say, and overwrites
              -- it when it does (#7300).
              attempt_started_at = COALESCE(?, attempt_started_at),
              attempt_index = COALESCE(?, attempt_index)
        WHERE id = ?
          AND conversation_id = ?
          AND role = 'assistant'
          AND (
            run_id IS NULL
            OR run_id = ?
            OR run_status IN ('succeeded','failed','canceled')
            OR ?
          )`,
    ).run(
      run.id,
      claimStatus,
      run.sessionMode ?? null,
      run.context ? JSON.stringify(run.context) : null,
      run.id, // same-run: preserve events_json
      run.id, // same-run: preserve content
      run.id, // same-run: preserve last_run_event_id
      run.id, // same-run: preserve started_at
      existing.runId ? 0 : 1, // placeholder -> keep web-persisted startedAt
      run.createdAt,
      run.createdAt, // terminal rebind -> reset to this run's start
      run.analyticsTelemetry?.attemptStartedAt ?? null,
      run.analyticsTelemetry?.attemptStartedAt === undefined
        ? null // no anchor yet -> leave the pair alone rather than half-write it
        : run.retryAttemptCount ?? 0,
      run.assistantMessageId,
      run.conversationId,
      run.id, // same-run gate in WHERE
      allowStaleActiveRebind ? 1 : 0,
    );
    if (result.changes === 0) return { ok: false, reason: 'active' as const };
    if (!isSameRun) clearMessageAgentEventBatches(db, run.assistantMessageId!);
    opts?.beforeClaimCommit?.();
    return { ok: true };
  });
  return claim.immediate();
}
