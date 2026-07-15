import type Database from 'better-sqlite3';
import type { PersistedAgentEvent } from '@open-design/contracts';
import {
  appendMessageAgentEvent,
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
  if (!persisted) return;
  try {
    appendMessageAgentEvent(db, run.assistantMessageId, persisted);
  } catch (err) {
    console.warn('[runs] message event persistence failed', err);
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

export function daemonAgentPayloadToPersistedAgentEvent(data: unknown): PersistedAgentEvent | null {
  if (!isRecord(data)) return null;
  const type = data.type;
  if (type === 'status' && typeof data.label === 'string') {
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
    return { kind: 'tool_use', id: data.id, name: data.name, input: normalizePersistedToolInput(data.input) };
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

export function pinAssistantMessageOnRunCreate(db: SqliteDb, run: ChatRunMessageState): void {
  if (!run.conversationId || !run.assistantMessageId) return;
  const existing = db
    .prepare(`SELECT id FROM messages WHERE id = ?`)
    .get(run.assistantMessageId);
  if (existing) {
    db.prepare(
      `UPDATE messages
          SET run_id = ?,
              run_status = CASE
                WHEN run_status IN ('succeeded', 'failed', 'canceled') THEN run_status
                ELSE ?
              END,
              session_mode = ?,
              run_context_json = ?,
              started_at = COALESCE(started_at, ?)
        WHERE id = ?`,
    ).run(
      run.id,
      run.status,
      run.sessionMode ?? null,
      run.context ? JSON.stringify(run.context) : null,
      run.createdAt,
      run.assistantMessageId,
    );
    return;
  }
  upsertMessage(db, run.conversationId, {
    id: run.assistantMessageId,
    role: 'assistant',
    content: '',
    agentId: run.agentId ?? undefined,
    events: [],
    runId: run.id,
    runStatus: run.status,
    sessionMode: run.sessionMode ?? undefined,
    runContext: run.context ?? undefined,
    startedAt: run.createdAt,
  });
}
