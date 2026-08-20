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

type SqliteDb = Database.Database;

type ChatRunMessageState = {
  id: string;
  assistantMessageId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  status?: string;
  createdAt?: number;
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
>;

export const RUN_MESSAGE_EVENT_FLUSH_INTERVAL_MS = 250;
const RUN_MESSAGE_EVENT_FLUSH_CHARS = 64 * 1024;
const pendingMessageEvents = new WeakMap<ChatRunMessageState, PendingMessageEvents>();
const finalizedInputEventCounts = new WeakMap<ChatRunMessageState, number>();
const messageEventPersistenceTelemetry = new WeakMap<
  ChatRunMessageState,
  RunMessageEventPersistenceTelemetry
>();

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
              END
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
